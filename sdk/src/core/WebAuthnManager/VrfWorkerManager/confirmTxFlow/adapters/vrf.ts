import type { VrfWorkerManagerContext } from '../../';
import { TransactionContext, VRFChallenge } from '../../../../types';
import type { SecureConfirmRequest } from '../types';
import { SecureConfirmationType } from '../types';
import { errorMessage, toError } from '../../../../../utils/errors';

export async function maybeRefreshVrfChallenge(
  ctx: VrfWorkerManagerContext,
  request: SecureConfirmRequest,
  nearAccountId: string,
): Promise<{ vrfChallenge: VRFChallenge; transactionContext: TransactionContext }> {
  const rpId = ctx.touchIdPrompt.getRpId();
  const vrfWorkerManager = ctx.vrfWorkerManager;
  if (!vrfWorkerManager) throw new Error('VrfWorkerManager not available');

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
          },
          request.requestId,
        );

    return { vrfChallenge, transactionContext: latestCtx };
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

