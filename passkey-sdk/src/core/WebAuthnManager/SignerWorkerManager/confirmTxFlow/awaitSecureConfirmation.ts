import {
  WorkerConfirmationResponse,
  SecureConfirmMessageType,
  SecureConfirmRequest,
  SerializableCredential,
} from './types';
import { isObject } from '@/core/WalletIframe/validation';
import { errorMessage, toError } from '@/utils/errors';
import { VRFChallenge } from '../../../types';
import { TransactionContext } from '../../../types/rpc';

// Narrowing helpers now use shared validator isObject

type ConfirmResponsePayload = {
  requestId: string;
  confirmed: boolean;
  intentDigest?: string;
  credential?: SerializableCredential;
  prfOutput?: string;
  vrfChallenge?: VRFChallenge;
  transactionContext?: TransactionContext;
  error?: string;
};

type ConfirmResponseEnvelope = {
  type: SecureConfirmMessageType.USER_PASSKEY_CONFIRM_RESPONSE;
  data: ConfirmResponsePayload;
};

function isConfirmResponseEnvelope(msg: unknown): msg is ConfirmResponseEnvelope {
  if (!isObject(msg)) return false;
  const type = (msg as { type?: unknown }).type;
  if (type !== SecureConfirmMessageType.USER_PASSKEY_CONFIRM_RESPONSE) return false;
  const data = (msg as { data?: unknown }).data;
  if (!isObject(data)) return false;
  const d = data as { requestId?: unknown; confirmed?: unknown };
  return typeof d.requestId === 'string' && typeof d.confirmed === 'boolean';
}

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
  requestJson: string,
  opts: { timeoutMs?: number; signal?: AbortSignal } = {}
): Promise<WorkerConfirmationResponse> {
  return new Promise((resolve, reject) => {

    // 1) Validate JSON string from Rust
    let request: SecureConfirmRequest;
    try {
      request = validateRequestJson(requestJson);
    } catch (e: unknown) {
      return reject(new Error(`[signer-worker]: invalid V2 request JSON: ${errorMessage(e)}`));
    }

    // 2) Setup cleanup utilities
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const cleanup = () => {
      try { if (timeoutId) clearTimeout(timeoutId); } catch {}
      try { self.removeEventListener('message', onDecisionReceived); } catch {}
      if (opts.signal) {
        try { opts.signal.removeEventListener('abort', onAbort); } catch {}
      }
    };

    const onAbort = () => {
      cleanup();
      reject(new Error('[signer-worker]: confirmation aborted'));
    };

    // 3) Wait for matching decision
    const onDecisionReceived = (messageEvent: MessageEvent) => {
      const env = messageEvent?.data as unknown;
      if (!isConfirmResponseEnvelope(env)) return;
      if (env.data.requestId !== request.requestId) return;
      cleanup();
      const response: WorkerConfirmationResponse = {
        request_id: request.requestId,
        intent_digest: env.data.intentDigest,
        confirmed: env.data.confirmed,
        credential: env.data.credential,
        prf_output: env.data.prfOutput,
        vrf_challenge: env.data.vrfChallenge,
        transaction_context: env.data.transactionContext,
        error: env.data.error
      };
      return resolve(response);
    };
    self.addEventListener('message', onDecisionReceived);

    // Optional timeout / abort support
    if (opts.timeoutMs && opts.timeoutMs > 0) {
      timeoutId = setTimeout(() => {
        cleanup();
        reject(new Error('[signer-worker]: confirmation timed out'));
      }, opts.timeoutMs);
    }
    if (opts.signal) {
      if (opts.signal.aborted) {
        cleanup();
        return reject(new Error('[signer-worker]: confirmation aborted'));
      }
      opts.signal.addEventListener('abort', onAbort);
    }

    // 4) Post request to main thread
    try {
      const safeRequest = deepClonePlain(request);
      self.postMessage({
        type: SecureConfirmMessageType.PROMPT_USER_CONFIRM_IN_JS_MAIN_THREAD,
        data: safeRequest
      });
    } catch (postErr: unknown) {
      cleanup();
      console.error('[signer-worker][V2] postMessage failed', postErr);
      return reject(toError(postErr));
    }
  });
}

// Local plain deep-clone to ensure structured-cloneable object for postMessage
function deepClonePlain<T>(obj: T): T {
  try {
    return JSON.parse(JSON.stringify(obj));
  } catch {
    return obj as T;
  }
}

function validateRequestJson(requestJson: string): SecureConfirmRequest {
  const parsed = JSON.parse(requestJson) as unknown;
  if (!isObject(parsed)) throw new Error('parsed is not an object');
  const p = parsed as { schemaVersion?: unknown; requestId?: unknown; type?: unknown; payload?: unknown };
  if (p.schemaVersion !== 2) throw new Error('schemaVersion must be 2');
  if (!p.requestId) throw new Error('missing requestId');
  if (!p.type) throw new Error('missing type');
  if (!p.payload) throw new Error('missing payload');
  return parsed as unknown as SecureConfirmRequest;
}
