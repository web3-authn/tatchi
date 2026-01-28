import type { VrfWorkerManagerContext } from '../../';
import type { ConfirmationConfig } from '../../../../types/signer-worker';
import {
  TransactionSummary,
  RegistrationSecureConfirmRequest,
} from '../types';
import { VRFChallenge, TransactionContext } from '../../../../types';
import type { WebAuthnRegistrationCredential } from '../../../../types/webauthn';
import { sha256Base64UrlUtf8 } from '../../../../digests/intentDigest';
import {
  getNearAccountId,
  getIntentDigest,
  isUserCancelledSecureConfirm,
  ERROR_MESSAGES,
  getRegisterAccountPayload,
} from './index';
import { isSerializedRegistrationCredential, serializeRegistrationCredentialWithPRF } from '../../../credentialsHelpers';
import { toError } from '../../../../../utils/errors';
import { createConfirmSession } from '../adapters/session';
import { createConfirmTxFlowAdapters } from '../adapters/createAdapters';
import type { ThemeName } from '../../../../types/tatchi';

export async function handleRegistrationFlow(
  ctx: VrfWorkerManagerContext,
  request: RegistrationSecureConfirmRequest,
  worker: Worker,
  opts: { confirmationConfig: ConfirmationConfig; transactionSummary: TransactionSummary; theme: ThemeName },
): Promise<void> {

  const { confirmationConfig, transactionSummary, theme } = opts;
  const adapters = createConfirmTxFlowAdapters(ctx);
  const session = createConfirmSession({
    adapters,
    worker,
    request,
    confirmationConfig,
    transactionSummary,
    theme,
  });
  const nearAccountId = getNearAccountId(request);

  try {
    // 1) NEAR context
    const nearRpc = await adapters.near.fetchNearContext({ nearAccountId, txCount: 1, reserveNonces: true });
    if (nearRpc.error && !nearRpc.transactionContext) {
      return session.confirmAndCloseModal({
        requestId: request.requestId,
        intentDigest: getIntentDigest(request),
        confirmed: false,
        error: `${ERROR_MESSAGES.nearRpcFailed}: ${nearRpc.details}`,
      });
    }
    const transactionContext = nearRpc.transactionContext as TransactionContext;
    session.setReservedNonces(nearRpc.reservedNonces);

    const computeBoundIntentDigestB64u = async (): Promise<string> => {
      const uiIntentDigest = getIntentDigest(request);
      if (!uiIntentDigest) {
        throw new Error('Missing intentDigest for registration flow');
      }
      return sha256Base64UrlUtf8(uiIntentDigest);
    };

    // 2) Initial VRF challenge via bootstrap
    const rpId = adapters.vrf.getRpId();
    const boundIntentDigestB64u = await computeBoundIntentDigestB64u();
    const bootstrap = await adapters.vrf.generateVrfKeypairBootstrap({
      vrfInputData: {
        userId: nearAccountId,
        rpId,
        blockHeight: transactionContext.txBlockHeight,
        blockHash: transactionContext.txBlockHash,
        intentDigest: boundIntentDigestB64u,
      },
      saveInMemory: true,
      sessionId: request.requestId,
    });
    let uiVrfChallenge: VRFChallenge = bootstrap.vrfChallenge;
    console.debug('[RegistrationFlow] VRF bootstrap ok', { blockHeight: uiVrfChallenge.blockHeight });

    // 3) JIT refresh VRF (best-effort)
    //
    // Important for extension popup flow: once the user clicks "Confirm" in the UI we want to
    // immediately open the extension popup (window.open) while the browser still considers the
    // call chain user-activated. Doing network work after the confirm click can clear transient
    // activation and cause the popup to be blocked. Refresh *before* prompting the user instead.
    try {
      const refreshed = await adapters.vrf.maybeRefreshVrfChallenge(request, nearAccountId);
      uiVrfChallenge = refreshed.vrfChallenge;
      console.debug('[RegistrationFlow] VRF JIT refresh ok', { blockHeight: uiVrfChallenge.blockHeight });
    } catch (e) {
      console.debug('[RegistrationFlow] VRF JIT refresh skipped', e);
    }

    // 4) UI confirm
    const { confirmed, error: uiError } = await session.promptUser({ vrfChallenge: uiVrfChallenge });
    if (!confirmed) {
      console.debug('[RegistrationFlow] user cancelled');
      return session.confirmAndCloseModal({
        requestId: request.requestId,
        intentDigest: getIntentDigest(request),
        confirmed: false,
        error: uiError,
      });
    }

    // 5) Collect registration credentials (with duplicate retry)
    let credential: unknown;
    let deviceNumber = request.payload?.deviceNumber ?? 1;

    const tryCreate = async (dn?: number): Promise<PublicKeyCredential | WebAuthnRegistrationCredential> => {
      console.debug('[RegistrationFlow] navigator.credentials.create start', { deviceNumber: dn });
      return await adapters.webauthn.createRegistrationCredential({
        nearAccountId,
        challenge: uiVrfChallenge,
        deviceNumber: dn,
      });
    };

    try {
      credential = await tryCreate(deviceNumber);
    } catch (e: unknown) {

      const err = toError(e);
      const name = String(err?.name || '');
      const msg = String(err?.message || '');
      const isDuplicate = name === 'InvalidStateError' || /excluded|already\s*registered/i.test(msg);

      if (isDuplicate) {
        const nextDeviceNumber = (deviceNumber !== undefined && Number.isFinite(deviceNumber)) ? (deviceNumber + 1) : 2;
        console.debug('[RegistrationFlow] duplicate credential, retry with next deviceNumber', { nextDeviceNumber });
        // Keep request payload and intentDigest in sync with the deviceNumber retry.
        deviceNumber = nextDeviceNumber;
        getRegisterAccountPayload(request).deviceNumber = nextDeviceNumber;
        request.intentDigest = request.type === 'registerAccount'
          ? `register:${nearAccountId}:${nextDeviceNumber}`
          : `device2-register:${nearAccountId}:${nextDeviceNumber}`;

        // Regenerate a VRF challenge bound to the updated intentDigest so the contract-side
        // VRF input derivation remains consistent end-to-end.
        const retryBoundIntentDigestB64u = await computeBoundIntentDigestB64u();
        const retryBootstrap = await adapters.vrf.generateVrfKeypairBootstrap({
          vrfInputData: {
            userId: nearAccountId,
            rpId,
            blockHeight: transactionContext.txBlockHeight,
            blockHash: transactionContext.txBlockHash,
            intentDigest: retryBoundIntentDigestB64u,
          },
          saveInMemory: true,
          sessionId: request.requestId,
        });
        uiVrfChallenge = retryBootstrap.vrfChallenge;
        session.updateUI({ vrfChallenge: uiVrfChallenge });

        credential = await tryCreate(nextDeviceNumber);
      } else {
        console.error('[RegistrationFlow] credentials.create failed (non-duplicate)', { name, msg });
        throw err;
      }
    }

    // We require registration credentials to include dual PRF outputs (first + second)
    // so VRF/NEAR key derivation can happen inside the workers without passing PRF outputs
    // as separate main-thread values.
    const serialized: WebAuthnRegistrationCredential = isSerializedRegistrationCredential(credential)
      ? (credential as unknown as WebAuthnRegistrationCredential)
      : serializeRegistrationCredentialWithPRF({
          credential: credential as PublicKeyCredential,
          firstPrfOutput: true,
          secondPrfOutput: true,
      });

    // 6) Respond + close
    session.confirmAndCloseModal({
      requestId: request.requestId,
      intentDigest: getIntentDigest(request),
      confirmed: true,
      credential: serialized,
      // PRF outputs are embedded in serialized credential; VRF worker extracts and sends via MessagePort
      vrfChallenge: uiVrfChallenge,
      transactionContext,
    });
  } catch (err: unknown) {

    const cancelled = isUserCancelledSecureConfirm(err);
    const msg = String((toError(err))?.message || err || '');
    if (cancelled) {
      window.parent?.postMessage({ type: 'WALLET_UI_CLOSED' }, '*');
    }

    const isPrfBrowserUnsupported =
      /WebAuthn PRF output is missing from navigator\.credentials\.create\(\)/i.test(msg)
      || /does not fully support the WebAuthn PRF extension during registration/i.test(msg)
      || /roaming hardware authenticators .* not supported in this flow/i.test(msg);

    return session.confirmAndCloseModal({
      requestId: request.requestId,
      intentDigest: getIntentDigest(request),
      confirmed: false,
      error: cancelled
        ? ERROR_MESSAGES.cancelled
        : (isPrfBrowserUnsupported ? msg : (msg || ERROR_MESSAGES.collectCredentialsFailed)),
    });
  }
}
