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
import { serializeAuthenticationCredentialWithPRF } from '../../../credentialsHelpers';

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

  // DECRYPT_PRIVATE_KEY_WITH_PRF: collect an authentication credential (with PRF extension results)
  // and return it to the VRF worker; VRF worker extracts PRF outputs internally.
  if (request.type === SecureConfirmationType.DECRYPT_PRIVATE_KEY_WITH_PRF) {
    let touchIdSuccess = false;
    try {
      // UI for decrypt is typically skipped; proceed to collect credentials
      const authenticators = await ctx.indexedDB.clientDB.getAuthenticatorsByUser(toAccountId(nearAccountId));
      // Prefer the last logged-in device for this account when multiple passkeys exist.
      const { authenticatorsForPrompt, wrongPasskeyError } = await ctx.indexedDB.clientDB.ensureCurrentPasskey(
        toAccountId(nearAccountId),
        authenticators,
      );
      if (wrongPasskeyError) {
        throw new Error(wrongPasskeyError);
      }
      const credential = await ctx.touchIdPrompt.getAuthenticationCredentialsInternal({
        nearAccountId,
        challenge: vrfChallenge,
        allowCredentials: authenticatorsToAllowCredentials(authenticatorsForPrompt),
      });

      touchIdSuccess = true;
      // No modal to keep open; export viewer will be shown by a subsequent request
      return sendConfirmResponse(worker, {
        requestId: request.requestId,
        intentDigest: getIntentDigest(request),
        confirmed: true,
        credential: serializeAuthenticationCredentialWithPRF({ credential }),
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
