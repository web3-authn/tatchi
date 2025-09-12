import {
  WorkerConfirmationResponse,
  SecureConfirmMessageType,
  SecureConfirmRequest,
} from './types';
import { normalizeSecureConfirmRequest, deepClonePlain } from './requestGuards';

/**
 * Bridge function called from Rust to await user confirmation on the main thread
 *
 * This function is exposed globally for WASM to call and handles the worker-side
 * of the confirmation flow by:
 * 1. Sending a confirmation request to the main thread
 * 2. Waiting for the user's decision
 * 3. Returning the decision back to the WASM worker
 *
 * See await_secure_confirmation() function definition in src/handlers/confirm_tx_details.rs
 * for more details on the parameters and their types
 */
// Legacy awaitSecureConfirmation() removed. Use awaitSecureConfirmationV2 instead.

/**
 * V2: Typed secure confirmation entrypoint (preferred for new flows)
 * Accepts a discriminated request and forwards it to the main thread.
 * Backwards-compatible alongside the legacy function above.
 */
export function awaitSecureConfirmationV2(
  request: SecureConfirmRequest | string | any
): Promise<WorkerConfirmationResponse> {
  return new Promise((resolve, reject) => {
    const dbg = (label: string, obj?: any) => {
      try {
        const preview = obj && typeof obj === 'object' ? Object.keys(obj) : typeof obj;
        // eslint-disable-next-line no-console
        console.debug(`[signer-worker][V2] ${label}`, { preview, requestId: (obj as any)?.requestId, schemaVersion: (obj as any)?.schemaVersion, type: (obj as any)?.type });
      } catch {}
    };
    dbg('>>> received request', request);

    try {
      request = normalizeSecureConfirmRequest(request);
    } catch (e) {
      return reject(e instanceof Error ? e : new Error('[signer-worker]: invalid V2 request'));
    }
    dbg('normalized request', request);

    const onDecisionReceived = (messageEvent: MessageEvent) => {
      const { data } = messageEvent;
      if (
        data?.type === SecureConfirmMessageType.USER_PASSKEY_CONFIRM_RESPONSE &&
        data?.data?.requestId === request.requestId
      ) {
        self.removeEventListener('message', onDecisionReceived);
        if (typeof data?.data?.confirmed !== 'boolean') {
          return reject(new Error('[signer-worker]: Invalid confirmation response: missing boolean "confirmed"'));
        }
        resolve({
          request_id: request.requestId,
          intent_digest: data.data?.intentDigest,
          confirmed: !!data.data?.confirmed,
          credential: data.data?.credential,
          prf_output: data.data?.prfOutput,
          vrf_challenge: data.data?.vrfChallenge,
          transaction_context: data.data?.transactionContext,
          error: data.data?.error
        });
      }
    };

    self.addEventListener('message', onDecisionReceived);

    // Post the V2 request directly; main thread handler will route by type
    try {
      // Ensure structured-cloneable plain object to avoid proxy/externref pitfalls
      const safeRequest = deepClonePlain(request);
      if (!safeRequest?.payload) {
        console.warn('[signer-worker][V2] request payload missing before postMessage; keys=', Object.keys(safeRequest || {}));
      }
      self.postMessage({
        type: SecureConfirmMessageType.PROMPT_USER_CONFIRM_IN_JS_MAIN_THREAD,
        data: safeRequest
      } as any);
      dbg('posted PROMPT_USER_CONFIRM to main thread', safeRequest);
    } catch (postErr) {
      console.error('[signer-worker][V2] postMessage failed', postErr);
      return reject(postErr as any);
    }
  });
}
