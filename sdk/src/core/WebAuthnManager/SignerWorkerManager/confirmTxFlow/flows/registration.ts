import type { SignerWorkerManagerContext } from '../../index';
import type { ConfirmationConfig } from '../../../../types/signer-worker';
import {
  SecureConfirmationType,
  SecureConfirmMessageType,
  TransactionSummary,
  RegistrationSecureConfirmRequest,
  RegisterAccountPayload,
} from '../types';
import { VRFChallenge, TransactionContext } from '../../../../types';
import { renderConfirmUI, fetchNearContext, maybeRefreshVrfChallenge, getNearAccountId, getIntentDigest, sanitizeForPostMessage } from './common';
import { serializeRegistrationCredentialWithPRF, extractPrfFromCredential, isSerializedRegistrationCredential } from '../../../credentialsHelpers';
import type { WebAuthnRegistrationCredential } from '../../../../types/webauthn';
import { isTouchIdCancellationError, toError } from '../../../../../utils/errors';
import type { ConfirmUIHandle } from '../../../LitComponents/confirm-ui';

export async function handleRegistrationFlow(
  ctx: SignerWorkerManagerContext,
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
  console.debug('[RegistrationFlow] fetched NEAR context', {
    ok: !nearRpc.error,
    details: nearRpc.details,
    txBlockHeight: nearRpc.transactionContext?.txBlockHeight,
  });
  if (nearRpc.error && !nearRpc.transactionContext) {
    return send(worker, {
      requestId: request.requestId,
      intentDigest: getIntentDigest(request),
      confirmed: false,
      error: `Failed to fetch NEAR data: ${nearRpc.details}`,
    });
  }
  const transactionContext = nearRpc.transactionContext as TransactionContext;

  // 2) Initial VRF challenge via bootstrap
  if (!ctx.vrfWorkerManager) throw new Error('VrfWorkerManager not available');
  const rpId = ctx.touchIdPrompt.getRpId();
  console.debug('[RegistrationFlow] VRF bootstrap start', { rpId, txBlockHeight: transactionContext.txBlockHeight });
  const bootstrap = await ctx.vrfWorkerManager.generateVrfKeypairBootstrap({
    vrfInputData: {
      userId: nearAccountId,
      rpId,
      blockHeight: transactionContext.txBlockHeight,
      blockHash: transactionContext.txBlockHash,
    },
    saveInMemory: true,
  });
  let uiVrfChallenge: VRFChallenge = bootstrap.vrfChallenge;
  console.debug('[RegistrationFlow] VRF bootstrap ok', { blockHeight: uiVrfChallenge.blockHeight });

  // 3) UI confirm
  console.debug('[RegistrationFlow] renderConfirmUI');
  const { confirmed, confirmHandle, error: uiError } = await renderConfirmUI({
    ctx,
    request,
    confirmationConfig,
    transactionSummary,
    vrfChallenge: uiVrfChallenge,
  });
  console.debug('[RegistrationFlow] renderConfirmUI done', { confirmed, uiError });
  if (!confirmed) {
    nearRpc.reservedNonces?.forEach(n => ctx.nonceManager.releaseNonce(n));
    console.debug('[RegistrationFlow] user cancelled');
    closeModalSafely(false, confirmHandle);
    return send(worker, {
      requestId: request.requestId,
      intentDigest: getIntentDigest(request),
      confirmed: false,
      error: uiError,
    });
  }

  // 4) JIT refresh VRF (best-effort)
  try {
    console.debug('[RegistrationFlow] VRF JIT refresh start');
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
        (request.payload as RegisterAccountPayload).deviceNumber = nextDeviceNumber;
      } else {
        console.error('[RegistrationFlow] credentials.create failed (non-duplicate)', { name, msg });
        throw err;
      }
    }

    const dualPrfOutputs = extractPrfFromCredential({ credential, firstPrfOutput: true, secondPrfOutput: true });
    if (!dualPrfOutputs.chacha20PrfOutput) {
      throw new Error('Failed to extract PRF output from credential');
    }
    // Support parent-performed fallback that may already return serialized credential
    const serialized: WebAuthnRegistrationCredential = isSerializedRegistrationCredential(credential as unknown)
      ? (credential as unknown as WebAuthnRegistrationCredential)
      : serializeRegistrationCredentialWithPRF({ credential, firstPrfOutput: true, secondPrfOutput: true });

    // 6) Respond + close
    send(worker, {
      requestId: request.requestId,
      intentDigest: getIntentDigest(request),
      confirmed: true,
      credential: serialized,
      prfOutput: dualPrfOutputs.chacha20PrfOutput,
      vrfChallenge: uiVrfChallenge,
      transactionContext,
    });
    closeModalSafely(true, confirmHandle);
  } catch (err: unknown) {
    const cancelled = isTouchIdCancellationError(err) || (() => {
      const e = toError(err);
      return e.name === 'NotAllowedError' || e.name === 'AbortError';
    })();
    if (cancelled) {
      try { window.parent?.postMessage({ type: 'WALLET_UI_CLOSED' }, '*'); } catch {}
    }
    // Release any reserved nonces on failure (best-effort)
    try { nearRpc.reservedNonces?.forEach(n => ctx.nonceManager.releaseNonce(n)); } catch {}
    closeModalSafely(false, confirmHandle);
    return send(worker, {
      requestId: request.requestId,
      intentDigest: getIntentDigest(request),
      confirmed: false,
      error: cancelled ? 'User cancelled secure confirm request' : 'Failed to collect credentials',
    });
  }
}

function send(worker: Worker, response: any) {
  const sanitized = sanitizeForPostMessage(response);
  worker.postMessage({ type: SecureConfirmMessageType.USER_PASSKEY_CONFIRM_RESPONSE, data: sanitized });
}

function closeModalSafely(confirmed: boolean, handle?: ConfirmUIHandle) {
  handle?.close?.(confirmed);
}
