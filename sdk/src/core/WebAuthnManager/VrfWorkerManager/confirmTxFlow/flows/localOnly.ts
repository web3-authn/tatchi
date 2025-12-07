import type { VrfWorkerManagerContext } from '../../';
import type { ConfirmationConfig } from '../../../../types/signer-worker';
import {
  SecureConfirmationType,
  TransactionSummary,
  LocalOnlySecureConfirmRequest,
} from '../types';
import { VRFChallenge } from '../../../../types';
import { createRandomVRFChallenge } from '../../../../types/vrf-worker';
import { renderConfirmUI, getNearAccountId, getIntentDigest, sendConfirmResponse, closeModalSafely, isUserCancelledSecureConfirm, ERROR_MESSAGES } from './common';
import { toAccountId } from '../../../../types/accountIds';
import { authenticatorsToAllowCredentials } from '../../../touchIdPrompt';
import { extractPrfFromCredential, serializeAuthenticationCredentialWithPRF } from '../../../credentialsHelpers';

export async function handleLocalOnlyFlow(
  ctx: VrfWorkerManagerContext,
  request: LocalOnlySecureConfirmRequest,
  worker: Worker,
  opts: { confirmationConfig: ConfirmationConfig; transactionSummary: TransactionSummary },
): Promise<void> {
  const { confirmationConfig, transactionSummary } = opts;
  const nearAccountId = getNearAccountId(request);
  const vrfChallenge = createRandomVRFChallenge() as VRFChallenge;

  // Show any UI (export viewer) or skip depending on type/config
  const { confirmed, confirmHandle, error: uiError } = await renderConfirmUI({
    ctx,
    request,
    confirmationConfig,
    transactionSummary,
    vrfChallenge,
  });

  // SHOW_SECURE_PRIVATE_KEY_UI: purely visual; keep UI open and return confirmed immediately
  if (request.type === SecureConfirmationType.SHOW_SECURE_PRIVATE_KEY_UI) {
    if (!confirmed) {
      closeModalSafely(false, confirmHandle);
      return sendConfirmResponse(worker, {
        requestId: request.requestId,
        intentDigest: getIntentDigest(request),
        confirmed: false,
        error: uiError,
      });
    }
    // Keep viewer open; do not close here
    return sendConfirmResponse(worker, {
      requestId: request.requestId,
      intentDigest: getIntentDigest(request),
      confirmed: true,
    });
  }

  // DECRYPT_PRIVATE_KEY_WITH_PRF: collect PRF via authentication and return credential + prfOutput
  if (request.type === SecureConfirmationType.DECRYPT_PRIVATE_KEY_WITH_PRF) {
    let touchIdSuccess = false;
    try {
      // UI for decrypt is typically skipped; proceed to collect credentials
      const authenticators = await ctx.indexedDB.clientDB.getAuthenticatorsByUser(toAccountId(nearAccountId));
      const credential = await ctx.touchIdPrompt.getAuthenticationCredentialsInternal({
        nearAccountId,
        challenge: vrfChallenge,
        allowCredentials: authenticatorsToAllowCredentials(authenticators),
      });

      const dualPrfOutputs = extractPrfFromCredential({
        credential,
        firstPrfOutput: true,
        secondPrfOutput: false,
      });
      if (!dualPrfOutputs.chacha20PrfOutput) {
        throw new Error(ERROR_MESSAGES.prfMissing);
      }
      const serialized = serializeAuthenticationCredentialWithPRF({ credential });

      touchIdSuccess = true;
      // No modal to keep open; export viewer will be shown by a subsequent request
      return sendConfirmResponse(worker, {
        requestId: request.requestId,
        intentDigest: getIntentDigest(request),
        confirmed: true,
        credential: serialized,
        prfOutput: dualPrfOutputs.chacha20PrfOutput,
      });
    } catch (err: unknown) {
      const cancelled = isUserCancelledSecureConfirm(err);
      if (cancelled) {
        window.parent?.postMessage({ type: 'WALLET_UI_CLOSED' }, '*');
      }
      return sendConfirmResponse(worker, {
        requestId: request.requestId,
        intentDigest: getIntentDigest(request),
        confirmed: false,
        error: cancelled ? ERROR_MESSAGES.cancelled : ERROR_MESSAGES.collectCredentialsFailed,
      });
    } finally {
      // If any modal was mounted despite skip config, close it
      if (!confirmed) closeModalSafely(touchIdSuccess, confirmHandle);
    }
  }
}
