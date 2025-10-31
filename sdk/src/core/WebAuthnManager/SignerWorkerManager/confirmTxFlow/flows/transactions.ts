import type { SignerWorkerManagerContext } from '../../index';
import type { ConfirmationConfig } from '../../../../types/signer-worker';
import {
  SecureConfirmationType,
  SecureConfirmMessageType,
  TransactionSummary,
  SigningSecureConfirmRequest,
} from '../types';
import { VRFChallenge, TransactionContext } from '../../../../types';
import { renderConfirmUI, fetchNearContext, maybeRefreshVrfChallenge, getNearAccountId, getIntentDigest, getTxCount, sanitizeForPostMessage } from './common';
import { serializeAuthenticationCredentialWithPRF, extractPrfFromCredential } from '../../../credentialsHelpers';
import { toAccountId } from '../../../../types/accountIds';
import { authenticatorsToAllowCredentials } from '../../../touchIdPrompt';
import type { ConfirmUIHandle } from '../../../LitComponents/confirm-ui';
import { isTouchIdCancellationError, toError } from '../../../../../utils/errors';

export async function handleTransactionSigningFlow(
  ctx: SignerWorkerManagerContext,
  request: SigningSecureConfirmRequest,
  worker: Worker,
  opts: { confirmationConfig: ConfirmationConfig; transactionSummary: TransactionSummary },
): Promise<void> {
  const { confirmationConfig, transactionSummary } = opts;
  const nearAccountId = getNearAccountId(request);

  // 1) NEAR context + nonce reservation
  const nearRpc = await fetchNearContext(ctx, { nearAccountId, txCount: getTxCount(request) });
  if (nearRpc.error && !nearRpc.transactionContext) {
    return send(worker, {
      requestId: request.requestId,
      intentDigest: getIntentDigest(request),
      confirmed: false,
      error: `Failed to fetch NEAR data: ${nearRpc.details}`,
    });
  }
  let transactionContext = nearRpc.transactionContext as TransactionContext;

  // 2) Initial VRF challenge
  if (!ctx.vrfWorkerManager) throw new Error('VrfWorkerManager not available');
  const rpId = ctx.touchIdPrompt.getRpId();
  let uiVrfChallenge: VRFChallenge = await ctx.vrfWorkerManager.generateVrfChallenge({
    userId: nearAccountId,
    rpId,
    blockHeight: transactionContext.txBlockHeight,
    blockHash: transactionContext.txBlockHash,
  });

  // 3) UI confirm
  const { confirmed, confirmHandle, error: uiError } = await renderConfirmUI({
    ctx,
    request,
    confirmationConfig,
    transactionSummary,
    vrfChallenge: uiVrfChallenge,
  });
  if (!confirmed) {
    nearRpc.reservedNonces?.forEach(n => ctx.nonceManager.releaseNonce(n));
    closeModalSafely(false, confirmHandle);
    return send(worker, {
      requestId: request.requestId,
      intentDigest: getIntentDigest(request),
      confirmed: false,
      error: uiError,
    });
  }

  // 4) JIT refresh VRF + ctx (best-effort)
  try {
    const refreshed = await maybeRefreshVrfChallenge(ctx, request, nearAccountId);
    uiVrfChallenge = refreshed.vrfChallenge;
    transactionContext = refreshed.transactionContext;
    confirmHandle?.update?.({ vrfChallenge: uiVrfChallenge });
  } catch (e) {
    console.debug('[SigningFlow] VRF JIT refresh skipped', e);
  }

  // 5) Collect authentication credential
  try {
    const authenticators = await ctx.indexedDB.clientDB.getAuthenticatorsByUser(toAccountId(nearAccountId));
    const credential = await ctx.touchIdPrompt.getAuthenticationCredentialsInternal({
      nearAccountId,
      challenge: uiVrfChallenge,
      allowCredentials: authenticatorsToAllowCredentials(authenticators),
    });

    const dualPrfOutputs = extractPrfFromCredential({ credential, firstPrfOutput: true, secondPrfOutput: false });
    const serialized = serializeAuthenticationCredentialWithPRF({ credential });

    // 6) Respond; keep nonces reserved for worker to use
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
    // Treat TouchID/FaceID cancellation and related errors as a negative decision
    const cancelled = isTouchIdCancellationError(err) || (() => {
      const e = toError(err);
      return e.name === 'NotAllowedError' || e.name === 'AbortError';
    })();
    // For missing PRF outputs, surface the error to caller (defensive path tests expect a throw)
    const msg = String((toError(err))?.message || err || '');
    if (/Missing PRF result/i.test(msg) || /Missing PRF results/i.test(msg)) {
      // Ensure UI is closed and nonces released, then rethrow
      nearRpc.reservedNonces?.forEach(n => ctx.nonceManager.releaseNonce(n));
      closeModalSafely(false, confirmHandle);
      throw err;
    }
    if (cancelled) {
      window.parent?.postMessage({ type: 'WALLET_UI_CLOSED' }, '*');
    }
    // Release any reserved nonces on failure
    nearRpc.reservedNonces?.forEach(n => ctx.nonceManager.releaseNonce(n));
    // Close the UI to avoid stale element flashing on next open
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
