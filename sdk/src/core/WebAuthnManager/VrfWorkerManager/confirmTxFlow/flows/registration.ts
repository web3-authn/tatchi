import type { VrfWorkerManagerContext } from '../../';
import type { ConfirmationConfig } from '../../../../types/signer-worker';
import {
  TransactionSummary,
  RegistrationSecureConfirmRequest,
} from '../types';
import { VRFChallenge, TransactionContext } from '../../../../types';
import type { WebAuthnRegistrationCredential } from '../../../../types/webauthn';
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

export async function handleRegistrationFlow(
  ctx: VrfWorkerManagerContext,
  request: RegistrationSecureConfirmRequest,
  worker: Worker,
  opts: { confirmationConfig: ConfirmationConfig; transactionSummary: TransactionSummary },
): Promise<void> {

  const { confirmationConfig, transactionSummary } = opts;
  const adapters = createConfirmTxFlowAdapters(ctx);
  const session = createConfirmSession({
    adapters,
    worker,
    request,
    confirmationConfig,
    transactionSummary,
  });
  const nearAccountId = getNearAccountId(request);

  console.debug('[RegistrationFlow] start', {
    nearAccountId,
    uiMode: confirmationConfig?.uiMode,
    behavior: confirmationConfig?.behavior,
    theme: confirmationConfig?.theme,
    intentDigest: transactionSummary?.intentDigest,
  });

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

  // 2) Initial VRF challenge via bootstrap
  const rpId = adapters.vrf.getRpId();
  const bootstrap = await adapters.vrf.generateVrfKeypairBootstrap({
    vrfInputData: {
      userId: nearAccountId,
      rpId,
      blockHeight: transactionContext.txBlockHeight,
      blockHash: transactionContext.txBlockHash,
    },
    saveInMemory: true,
    sessionId: request.requestId,
  });
  let uiVrfChallenge: VRFChallenge = bootstrap.vrfChallenge;
  console.debug('[RegistrationFlow] VRF bootstrap ok', { blockHeight: uiVrfChallenge.blockHeight });

  // 3) UI confirm
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

  // 4) JIT refresh VRF (best-effort)
  try {
    const refreshed = await adapters.vrf.maybeRefreshVrfChallenge(request, nearAccountId);
    uiVrfChallenge = refreshed.vrfChallenge;
    session.updateUI({ vrfChallenge: uiVrfChallenge });
    console.debug('[RegistrationFlow] VRF JIT refresh ok', { blockHeight: uiVrfChallenge.blockHeight });
  } catch (e) {
    console.debug('[RegistrationFlow] VRF JIT refresh skipped', e);
  }

  // 5) Collect registration credentials (with duplicate retry)
  let credential: PublicKeyCredential | undefined;
  let deviceNumber = request.payload?.deviceNumber;

  const tryCreate = async (dn?: number): Promise<PublicKeyCredential> => {
    console.debug('[RegistrationFlow] navigator.credentials.create start', { deviceNumber: dn });
    return await adapters.webauthn.createRegistrationCredential({
      nearAccountId,
      challenge: uiVrfChallenge,
      deviceNumber: dn,
    });
  };

  try {
    try {
      credential = await tryCreate(deviceNumber);
      console.debug('[RegistrationFlow] credentials.create ok');
    } catch (e: unknown) {
      const err = toError(e);
      const name = String(err?.name || '');
      const msg = String(err?.message || '');
      const isDuplicate = name === 'InvalidStateError' || /excluded|already\s*registered/i.test(msg);
      if (isDuplicate) {
        const nextDeviceNumber = (deviceNumber !== undefined && Number.isFinite(deviceNumber)) ? (deviceNumber + 1) : 2;
        console.debug('[RegistrationFlow] duplicate credential, retry with next deviceNumber', { nextDeviceNumber });
        credential = await tryCreate(nextDeviceNumber);
        getRegisterAccountPayload(request).deviceNumber = nextDeviceNumber;
      } else {
        console.error('[RegistrationFlow] credentials.create failed (non-duplicate)', { name, msg });
        throw err;
      }
    }

    // We require registration credentials to include dual PRF outputs (first + second)
    // so VRF/NEAR key derivation can happen inside the workers without passing PRF outputs
    // as separate main-thread values.
    const serialized: WebAuthnRegistrationCredential = isSerializedRegistrationCredential(credential as unknown)
      ? (credential as unknown as WebAuthnRegistrationCredential)
      : serializeRegistrationCredentialWithPRF({
          credential: credential! as PublicKeyCredential,
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
    // For missing PRF outputs, surface the error to caller (defensive path tests expect a throw)
    if (/Missing PRF result/i.test(msg) || /Missing PRF results/i.test(msg)) {
      return session.cleanupAndRethrow(err);
    }
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
        : (isPrfBrowserUnsupported ? msg : ERROR_MESSAGES.collectCredentialsFailed),
    });
  }
}
