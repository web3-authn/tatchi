import {
  WorkerConfirmationResponse,
  SecureConfirmMessageType,
  SecureConfirmRequest,
  SerializableCredential,
} from './types';
import { isObject, isString, isBoolean } from '@/core/WalletIframe/validation';
import { errorMessage, toError } from '@/utils/errors';
import { VRFChallenge } from '../../../types';
import { TransactionContext } from '../../../types/rpc';
import { validateSecureConfirmRequest } from './adapters/requestAdapter';

type ConfirmResponsePayload = {
  requestId: string;
  confirmed: boolean;
  intentDigest?: string;
  credential?: SerializableCredential;
  vrfChallenge?: VRFChallenge;
  transactionContext?: TransactionContext;
  error?: string;
};

type ConfirmResponseEnvelope = {
  type: SecureConfirmMessageType.USER_PASSKEY_CONFIRM_RESPONSE;
  data: ConfirmResponsePayload;
};

/**
 * Worker-side bridge used by VRF WASM to request a main-thread confirmation.
 *
 * Where this runs:
 * - Runs inside the VRF Web Worker (not the main thread).
 * - Invoked from Rust via wasm-bindgen; the VRF worker exposes this as
 *   `globalThis.awaitSecureConfirmationV2` in `sdk/src/core/web3authn-vrf.worker.ts`.
 *
 * High-level flow:
 * 1) VRF Rust calls `awaitSecureConfirmationV2(request)`
 * 2) This posts `PROMPT_USER_CONFIRM_IN_JS_MAIN_THREAD` to the main thread
 * 3) `VrfWorkerManager` intercepts that message and runs confirmTxFlow on the main thread
 *    (`handlePromptUserConfirmInJsMainThread`), then posts back `USER_PASSKEY_CONFIRM_RESPONSE`
 * 4) This resolves to a Rust-friendly `WorkerConfirmationResponse` (snake_case fields)
 *
 * API contract:
 * - V2 objects only (no JSON strings / no legacy shorthand).
 * - The `requestId` is used to correlate responses when multiple confirmations are in-flight.
 */
export function awaitSecureConfirmationV2(
  requestInput: SecureConfirmRequest,
  opts: { timeoutMs?: number; signal?: AbortSignal } = {}
): Promise<WorkerConfirmationResponse> {
  return new Promise((resolve, reject) => {

    // 1) Validate request object coming from Rust / VRF.
    // Rust passes a plain JS object (serde_wasm_bindgen), so we validate defensively here
    // to avoid propagating malformed requests to the main thread.
    let request: SecureConfirmRequest;
    try {
      request = validateSecureConfirmRequest(requestInput);
    } catch (e: unknown) {
      return reject(new Error(`[signer-worker]: invalid V2 request: ${errorMessage(e)}`));
    }

    // 2) Setup cleanup utilities for this single in-flight request.
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const cleanup = () => {
      if (timeoutId) clearTimeout(timeoutId);
      self.removeEventListener('message', onDecisionReceived);
      if (opts.signal) opts.signal.removeEventListener('abort', onAbort);
    };

    const onAbort = () => {
      cleanup();
      reject(new Error('[signer-worker]: confirmation aborted'));
    };

    // 3) Wait for the matching decision message from the main thread.
    // Note: `web3authn-vrf.worker.ts` intentionally ignores USER_PASSKEY_CONFIRM_RESPONSE
    // at the worker `onmessage` level and lets this handler consume it.
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

    // 4) Post request to the main thread.
    // We deep-clone to ensure the payload is structured-cloneable and to avoid leaking
    // prototype/function fields across the Worker boundary.
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
    if (typeof structuredClone === 'function') {
      return structuredClone(obj);
    }
    return JSON.parse(JSON.stringify(obj));
  } catch {
    return obj as T;
  }
}

function isConfirmResponseEnvelope(msg: unknown): msg is ConfirmResponseEnvelope {
  if (!isObject(msg)) return false;
  const type = (msg as { type?: unknown }).type;
  if (type !== SecureConfirmMessageType.USER_PASSKEY_CONFIRM_RESPONSE) return false;
  const data = (msg as { data?: unknown }).data;
  if (!isObject(data)) return false;
  const d = data as { requestId?: unknown; confirmed?: unknown };
  return isString(d.requestId) && isBoolean(d.confirmed);
}
