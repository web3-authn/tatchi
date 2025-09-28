import type { SignerWorkerManagerContext } from '../../index';
import type { ConfirmationConfig } from '../../../../types/signer-worker';
import {
  SecureConfirmationType,
  SecureConfirmMessageType,
  TransactionSummary,
  LocalOnlySecureConfirmRequest,
} from '../types';
import { VRFChallenge } from '../../../../types';
import { createRandomVRFChallenge } from '../../../../types/vrf-worker';
import { renderConfirmUI, getNearAccountId, getIntentDigest, sanitizeForPostMessage } from './common';
import { toAccountId } from '../../../../types/accountIds';
import { authenticatorsToAllowCredentials } from '../../../touchIdPrompt';
import { extractPrfFromCredential, serializeAuthenticationCredentialWithPRF } from '../../../credentialsHelpers';
import { isTouchIdCancellationError, toError } from '../../../../../utils/errors';
import type { ConfirmUIHandle } from '../../../LitComponents/confirm-ui';

export async function handleLocalOnlyFlow(
  ctx: SignerWorkerManagerContext,
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
      return send(worker, {
        requestId: request.requestId,
        intentDigest: getIntentDigest(request),
        confirmed: false,
        error: uiError,
      });
    }
    // Keep viewer open; do not close here
    return send(worker, {
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
        throw new Error('Failed to extract PRF output from credential');
      }
      const serialized = serializeAuthenticationCredentialWithPRF({ credential });

      touchIdSuccess = true;
      // No modal to keep open; export viewer will be shown by a subsequent request
      return send(worker, {
        requestId: request.requestId,
        intentDigest: getIntentDigest(request),
        confirmed: true,
        credential: serialized,
        prfOutput: dualPrfOutputs.chacha20PrfOutput,
      });
    } catch (err: unknown) {
      const cancelled = isTouchIdCancellationError(err) || (() => {
        const e = toError(err);
        return e.name === 'NotAllowedError' || e.name === 'AbortError';
      })();
      if (cancelled) {
        try { window.parent?.postMessage({ type: 'WALLET_UI_CLOSED' }, '*'); } catch {}
      }
      return send(worker, {
        requestId: request.requestId,
        intentDigest: getIntentDigest(request),
        confirmed: false,
        error: cancelled ? 'User cancelled secure confirm request' : 'Failed to collect credentials',
      });
    } finally {
      // If any modal was mounted despite skip config, close it
      if (!confirmed) closeModalSafely(touchIdSuccess, confirmHandle);
    }
  }
}

function send(worker: Worker, response: any) {
  const sanitized = sanitizeForPostMessage(response);
  worker.postMessage({ type: SecureConfirmMessageType.USER_PASSKEY_CONFIRM_RESPONSE, data: sanitized });
}

function closeModalSafely(confirmed: boolean, handle?: ConfirmUIHandle) {
  try { handle?.close?.(confirmed); } catch (e) { console.warn('[SecureConfirm][LocalOnly] close error', e); }
}
