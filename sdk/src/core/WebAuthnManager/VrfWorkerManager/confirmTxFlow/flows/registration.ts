import type { VrfWorkerManagerContext } from '../../';
import type { ConfirmationConfig } from '../../../../types/signer-worker';
import {
  TransactionSummary,
  RegistrationSecureConfirmRequest,
} from '../types';
import { VRFChallenge, TransactionContext } from '../../../../types';
import type { WebAuthnRegistrationCredential } from '../../../../types/webauthn';
import {
  renderConfirmUI,
  fetchNearContext,
  maybeRefreshVrfChallenge,
  getNearAccountId,
  getIntentDigest,
  sendConfirmResponse,
  closeModalSafely,
  isUserCancelledSecureConfirm,
  releaseReservedNonces,
  ERROR_MESSAGES,
  getRegisterAccountPayload,
} from './common';
import { isSerializedRegistrationCredential, serializeRegistrationCredentialWithPRF } from '../../../credentialsHelpers';
import { toError } from '../../../../../utils/errors';

export async function handleRegistrationFlow(
  ctx: VrfWorkerManagerContext,
  request: RegistrationSecureConfirmRequest,
  worker: Worker,
  opts: { confirmationConfig: ConfirmationConfig; transactionSummary: TransactionSummary },
): Promise<void> {

  const { confirmationConfig, transactionSummary } = opts;
  const nearAccountId = getNearAccountId(request);

  console.debug('[RegistrationFlow] start', {
    nearAccountId,
    uiMode: confirmationConfig?.uiMode,
    behavior: confirmationConfig?.behavior,
    theme: confirmationConfig?.theme,
    intentDigest: transactionSummary?.intentDigest,
  });

  // 1) NEAR context
  const nearRpc = await fetchNearContext(ctx, { nearAccountId, txCount: 1 });
  if (nearRpc.error && !nearRpc.transactionContext) {
    return sendConfirmResponse(worker, {
      requestId: request.requestId,
      intentDigest: getIntentDigest(request),
      confirmed: false,
      error: `${ERROR_MESSAGES.nearRpcFailed}: ${nearRpc.details}`,
    });
  }
  const transactionContext = nearRpc.transactionContext as TransactionContext;

  // 2) Initial VRF challenge via bootstrap
  if (!ctx.vrfWorkerManager) throw new Error('VrfWorkerManager not available');
  const rpId = ctx.touchIdPrompt.getRpId();
  const bootstrap = await ctx.vrfWorkerManager.generateVrfKeypairBootstrap({
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
  const { confirmed, confirmHandle, error: uiError } = await renderConfirmUI({
    ctx,
    request,
    confirmationConfig,
    transactionSummary,
    vrfChallenge: uiVrfChallenge,
  });

  if (!confirmed) {
    releaseReservedNonces(ctx, nearRpc.reservedNonces);
    console.debug('[RegistrationFlow] user cancelled');
    closeModalSafely(false, confirmHandle);
    return sendConfirmResponse(worker, {
      requestId: request.requestId,
      intentDigest: getIntentDigest(request),
      confirmed: false,
      error: uiError,
    });
  }

  // 4) JIT refresh VRF (best-effort)
  try {
    const refreshed = await maybeRefreshVrfChallenge(ctx, request, nearAccountId);
    uiVrfChallenge = refreshed.vrfChallenge;
    confirmHandle?.update?.({ vrfChallenge: uiVrfChallenge });
    console.debug('[RegistrationFlow] VRF JIT refresh ok', { blockHeight: uiVrfChallenge.blockHeight });
  } catch (e) {
    console.debug('[RegistrationFlow] VRF JIT refresh skipped', e);
  }

  // 5) Collect registration credentials (with duplicate retry)
  let credential: PublicKeyCredential | undefined;
  let deviceNumber = request.payload?.deviceNumber;

  const tryCreate = async (dn?: number): Promise<PublicKeyCredential> => {
    console.debug('[RegistrationFlow] navigator.credentials.create start', { deviceNumber: dn });
    return await ctx.touchIdPrompt.generateRegistrationCredentialsInternal({
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
    sendConfirmResponse(worker, {
      requestId: request.requestId,
      intentDigest: getIntentDigest(request),
      confirmed: true,
      credential: serialized,
      // PRF outputs are embedded in serialized credential; VRF worker extracts and sends via MessagePort
      vrfChallenge: uiVrfChallenge,
      transactionContext,
    });
    closeModalSafely(true, confirmHandle);

  } catch (err: unknown) {
    const cancelled = isUserCancelledSecureConfirm(err);
    const msg = String((toError(err))?.message || err || '');
    // For missing PRF outputs, surface the error to caller (defensive path tests expect a throw)
    if (/Missing PRF result/i.test(msg) || /Missing PRF results/i.test(msg)) {
      releaseReservedNonces(ctx, nearRpc.reservedNonces);
      closeModalSafely(false, confirmHandle);
      throw err;
    }
    if (cancelled) {
      window.parent?.postMessage({ type: 'WALLET_UI_CLOSED' }, '*');
    }
    // Release any reserved nonces on failure (best-effort)
    releaseReservedNonces(ctx, nearRpc.reservedNonces);
    closeModalSafely(false, confirmHandle);

    const isPrfBrowserUnsupported =
      /WebAuthn PRF output is missing from navigator\.credentials\.create\(\)/i.test(msg)
      || /does not fully support the WebAuthn PRF extension during registration/i.test(msg)
      || /roaming hardware authenticators .* not supported in this flow/i.test(msg);

    return sendConfirmResponse(worker, {
      requestId: request.requestId,
      intentDigest: getIntentDigest(request),
      confirmed: false,
      error: cancelled
        ? ERROR_MESSAGES.cancelled
        : (isPrfBrowserUnsupported ? msg : ERROR_MESSAGES.collectCredentialsFailed),
    });
  }
}
