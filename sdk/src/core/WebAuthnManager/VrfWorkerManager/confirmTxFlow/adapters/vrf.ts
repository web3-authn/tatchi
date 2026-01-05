import type { VrfWorkerManagerContext } from '../../';
import { TransactionContext, VRFChallenge } from '../../../../types';
import type { KnownSecureConfirmRequest } from '../types';
import { SecureConfirmationType } from '../types';
import { errorMessage, toError } from '../../../../../utils/errors';
import { computeUiIntentDigestFromNep413, sha256Base64UrlUtf8 } from '../../../../digests/intentDigest';

export async function maybeRefreshVrfChallenge(
  ctx: VrfWorkerManagerContext,
  request: KnownSecureConfirmRequest,
  nearAccountId: string,
): Promise<{ vrfChallenge: VRFChallenge; transactionContext: TransactionContext }> {

  const rpId = ctx.touchIdPrompt.getRpId();
  const intentDigestB64u = request.type === SecureConfirmationType.SIGN_TRANSACTION
    ? (request.payload?.intentDigest as string | undefined)
    : request.type === SecureConfirmationType.SIGN_NEP413_MESSAGE
      ? await computeUiIntentDigestFromNep413({
        nearAccountId,
        recipient: request.payload?.recipient ?? '',
        message: request.payload?.message ?? '',
      })
      : (request.type === SecureConfirmationType.REGISTER_ACCOUNT || request.type === SecureConfirmationType.LINK_DEVICE)
        ? (request.intentDigest ? await sha256Base64UrlUtf8(request.intentDigest) : undefined)
      : undefined;
  const vrfWorkerManager = ctx.vrfWorkerManager;
  if (!vrfWorkerManager) {
    throw new Error('VrfWorkerManager not available');
  }
  // Only attempt a JIT refresh when NonceManager is initialized for this account.
  // Pre-login/registration flows should just skip (callers already treat this as best-effort).
  if (
    !ctx.nonceManager.nearAccountId ||
    !ctx.nonceManager.nearPublicKeyStr ||
    String(ctx.nonceManager.nearAccountId) !== String(nearAccountId)
  ) {
    throw new Error('NonceManager not initialized with user data');
  }

  const attempts = 3;
  return await retryWithBackoff(async (attempt) => {
    const latestCtx = await ctx.nonceManager.getNonceBlockHashAndHeight(ctx.nearClient, { force: true });

    const vrfChallenge = (request.type === SecureConfirmationType.REGISTER_ACCOUNT || request.type === SecureConfirmationType.LINK_DEVICE)
      ? (await vrfWorkerManager.generateVrfKeypairBootstrap({
          vrfInputData: {
            userId: nearAccountId,
            rpId,
            blockHeight: latestCtx.txBlockHeight,
            blockHash: latestCtx.txBlockHash,
            ...(intentDigestB64u ? { intentDigest: intentDigestB64u } : {}),
          },
          saveInMemory: true,
          sessionId: request.requestId,
        })).vrfChallenge
      : await vrfWorkerManager.generateVrfChallengeForSession(
          {
            userId: nearAccountId,
            rpId,
            blockHeight: latestCtx.txBlockHeight,
            blockHash: latestCtx.txBlockHash,
            ...(intentDigestB64u ? { intentDigest: intentDigestB64u } : {}),
          },
          request.requestId,
        );

    return {
      vrfChallenge,
      transactionContext: latestCtx
    };

  }, {
    attempts,
    baseDelayMs: 150,
    onError: (err, attempt) => {
      const msg = errorMessage(err);
      const isFinal = attempt >= attempts;
      if (isFinal) {
        console.warn(`[SecureConfirm] VRF refresh failed: ${msg}`);
      } else {
        console.debug(`[SecureConfirm] VRF refresh attempt ${attempt} failed: ${msg}`);
      }
    },
    errorFactory: () => new Error('VRF refresh failed'),
  });
}

interface RetryOptions {
  attempts: number;
  baseDelayMs: number;
  onError?: (error: unknown, attempt: number) => void;
  errorFactory?: () => Error;
}

async function retryWithBackoff<T>(fn: (attempt: number) => Promise<T>, options: RetryOptions): Promise<T> {
  const { attempts, baseDelayMs, onError, errorFactory } = options;
  let lastError: unknown;

  for (let attempt = 1; attempt <= Math.max(1, attempts); attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastError = err;
      onError?.(err, attempt);
      if (attempt < attempts) {
        const delay = baseDelayMs * attempt;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw errorFactory ? errorFactory() : toError(lastError ?? new Error('Retry exhausted'));
}
