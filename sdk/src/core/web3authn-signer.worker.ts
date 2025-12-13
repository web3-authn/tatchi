/**
 * Enhanced WASM Signer Worker (v2)
 * This worker uses Rust-based message handling for better type safety and performance
 * Similar to the VRF worker architecture
 *
 * MESSAGING FLOW DOCUMENTATION:
 * =============================
 *
 * 1. PROGRESS MESSAGES (During Operation):
 *    Rust WASM calls send_typed_progress_message() →
 *    calls global sendProgressMessage() (defined below) →
 *    postMessage() to main thread with progress update
 *
 *    - Multiple progress messages per operation
 *    - Real-time updates for UX (e.g., "Verifying contract...", "Signing transaction...")
 *    - Does not affect final result
 *
 * 2. FINAL RESULTS (Operation Complete):
 *    Rust WASM returns result from handle_signer_message() →
 *    TypeScript receives return value →
 *    postMessage() to main thread with final result
 *
 *    - One result message per operation
 *    - Contains success/error and actual operation data
 *    - Main thread awaits this for completion
 *
 * TYPE SAFETY:
 * ============
 * All message types are auto-generated from Rust using wasm-bindgen:
 * - ProgressMessageType: VERIFICATION_PROGRESS, SIGNING_PROGRESS, etc.
 * - ProgressStep: preparation, contract_verification, transaction_signing, etc.
 * - ProgressStatus: progress, success, error
 * - WorkerProgressMessage: Complete message structure
 */

import {
  SignerWorkerMessage,
  WorkerRequestType,
  WorkerResponseType,
  WasmRequestPayload,
} from './types/signer-worker';
// Import WASM binary directly
import init, {
  attach_wrap_key_seed_port,
  handle_signer_message,
} from '../wasm_signer_worker/pkg/wasm_signer_worker.js';
import { resolveWasmUrl } from './sdkPaths/wasm-loader';
import { errorMessage } from '../utils/errors';

/**
 * WASM Asset Path Resolution for Signer Worker
 *
 * Uses centralized path resolution strategy from wasmLoader.ts
 * See wasmLoader.ts for detailed documentation on how paths work across:
 * - SDK building (Rolldown)
 * - Playwright E2E tests
 * - Frontend dev installing from npm
 */

// Resolve WASM URL using the centralized resolution strategy
const wasmUrl = resolveWasmUrl('wasm_signer_worker_bg.wasm', 'Signer Worker');
// SecureConfirm bridge removed: signer no longer initiates confirmations

let messageProcessed = false;

/**
 * Function called by WASM to send progress messages
 * This is imported into the WASM module as sendProgressMessage
 *
 * Now receives both numeric enum values AND message string names from Rust
 *
 * @param messageType - Numeric ProgressMessageType enum value
 * @param messageTypeName - String name of the message type for debugging
 * @param step - Numeric ProgressStep enum value
 * @param stepName - String name of the step for debugging
 * @param message - Human-readable progress message
 * @param data - JSON string containing structured data
 * @param logs - Optional JSON string containing array of log messages
 */
function sendProgressMessage(
  messageType: number,
  messageTypeName: string,
  step: number,
  stepName: string,
  message: string,
  data: any,
  logs?: any
): void {
  try {
    // Parse structured data and logs using helper if they are strings
    const parsedData = (typeof data === 'string') ? safeJsonParse(data, {}) : (data || {});
    const parsedLogs = (typeof logs === 'string') ? safeJsonParse(logs || '', []) : (logs || []);

    // Create onProgressEvents-compatible payload
    const progressPayload = {
      step: step,
      phase: stepName,
      status: (
        messageTypeName === 'REGISTRATION_COMPLETE' ||
        messageTypeName === 'EXECUTE_ACTIONS_COMPLETE'
      ) ? 'success' : 'progress',
      message: message,
      data: parsedData,
      logs: parsedLogs
    };

    const progressMessage = {
      type: messageType,
      payload: progressPayload,
    };

    self.postMessage(progressMessage);

  } catch (error: any) {
    console.error('[signer-worker]: Failed to send progress message:', error);
    // Send error message as fallback - use a generic failure type
    self.postMessage({
      type: WorkerResponseType.DeriveNearKeypairAndEncryptFailure,
      payload: {
        error: `Progress message failed: ${errorMessage(error)}`,
        context: { messageType, step, message }
      },
    });
  }
}

// Important: Make sendProgressMessage available globally for WASM to call
(globalThis as any).sendProgressMessage = sendProgressMessage;

/**
 * Function called by WASM when a WrapKeySeed is successfully stored in WRAP_KEY_SEED_SESSIONS.
 * This guarantees the seed is ready for signing operations.
 *
 * @param sessionId - The session ID for which the seed is ready
 */
function notifyWrapKeySeedReady(sessionId: string): void {
  self.postMessage({
    type: 'WRAP_KEY_SEED_READY',
    sessionId,
  });
}

// Make notifyWrapKeySeedReady available globally for WASM to call
(globalThis as any).notifyWrapKeySeedReady = notifyWrapKeySeedReady;

/**
 * Initialize WASM module
 */
async function initializeWasm(): Promise<void> {
  try {
    await init({ module_or_path: wasmUrl });
  } catch (error: any) {
    console.error('[signer-worker]: WASM initialization failed:', error);
    throw new Error(`WASM initialization failed: ${errorMessage(error)}`);
  }
}

// Signal readiness so the main thread can health‑check worker pooling
// Delay one tick to allow listener registration on main thread
setTimeout(() => {
  (self as any).postMessage({ type: 'WORKER_READY', ready: true });
}, 0);

/**
 * Maps a WorkerRequestType to its corresponding failure response type
 */
function getFailureResponseType(requestType: WorkerRequestType): WorkerResponseType {
  switch (requestType) {
    case WorkerRequestType.DeriveNearKeypairAndEncrypt:
      return WorkerResponseType.DeriveNearKeypairAndEncryptFailure;
    case WorkerRequestType.RecoverKeypairFromPasskey:
      return WorkerResponseType.RecoverKeypairFromPasskeyFailure;
    case WorkerRequestType.DecryptPrivateKeyWithPrf:
      return WorkerResponseType.DecryptPrivateKeyWithPrfFailure;
    case WorkerRequestType.SignTransactionsWithActions:
      return WorkerResponseType.SignTransactionsWithActionsFailure;
    case WorkerRequestType.ExtractCosePublicKey:
      return WorkerResponseType.ExtractCosePublicKeyFailure;
    case WorkerRequestType.SignTransactionWithKeyPair:
      return WorkerResponseType.SignTransactionWithKeyPairFailure;
    case WorkerRequestType.SignNep413Message:
      return WorkerResponseType.SignNep413MessageFailure;
    case WorkerRequestType.RegisterDevice2WithDerivedKey:
      return WorkerResponseType.RegisterDevice2WithDerivedKeyFailure;
    case WorkerRequestType.SignDelegateAction:
      return WorkerResponseType.SignDelegateActionFailure;
    default:
      // Fallback for unknown request types
      return WorkerResponseType.DeriveNearKeypairAndEncryptFailure;
  }
}

/**
 * Process a WASM worker message (main operation)
 */
async function processWorkerMessage(event: MessageEvent): Promise<void> {
  messageProcessed = true;
  try {
    // Guardrail: PRF/vrf_sk must never traverse into signer payloads
    assertNoPrfOrVrfSecrets(event.data);
    // Initialize WASM
    await initializeWasm();
    // Pass message object directly to Rust WASM (Zero-Copy)
    // SignerWorkerMessage in Rust now supports JsValue payload via serde_wasm_bindgen
    const response = await handle_signer_message(event.data);
    // Response is already a JS object, send back to main thread
    self.postMessage(response);
    self.close();
  } catch (error: any) {
    console.error('[signer-worker]: Message processing failed:', error);
    // Determine the correct failure response type based on the request type
    const failureType = typeof event.data?.type === 'number'
      ? getFailureResponseType(event.data.type)
      : WorkerResponseType.DeriveNearKeypairAndEncryptFailure; // Fallback for invalid requests

    self.postMessage({
      type: failureType,
      payload: {
        error: errorMessage(error),
        context: { type: event.data.type }
      }
    });
    self.close();
  }
}

/**
 * Send error response for invalid message states
 */
function sendInvalidMessageError(reason: string): void {
  self.postMessage({
    type: WorkerResponseType.DeriveNearKeypairAndEncryptFailure,
    payload: { error: reason }
  });
  self.close();
}

self.onmessage = async (event: MessageEvent<SignerWorkerMessage<WorkerRequestType, WasmRequestPayload>>): Promise<void> => {
  const eventType = (event.data as any)?.type;

  // Attach WrapKeySeed MessagePort for a signing session.
  // This handler intentionally lives in JS instead of Rust:
  // - MessagePort objects only exist at the JS boundary; they cannot be serialized into
  //   the JSON string passed to `handle_signer_message`.
  // - The Rust entrypoint (`handle_signer_message`) is also used in non-worker environments
  //   (e.g. server-side AuthService) where no MessagePort is available.
  // - The signer worker’s main Rust handler is designed as a one-shot JSON request/response
  //   pipeline; attaching the port is a separate control path that must keep the worker alive
  //   for subsequent signing requests sharing the same session.
  if (eventType === 'ATTACH_WRAP_KEY_SEED_PORT') {
    await handleAttachWrapKeySeedPort(event);
    return;
  }

  // Handle different message types explicitly
  switch (true) {
    case !messageProcessed && typeof eventType === 'number':
      // Case 1: First message with numeric type - process as normal worker operation
      await processWorkerMessage(event);
      break;

    case !messageProcessed && typeof eventType !== 'number':
      // Case 2: First message but non-numeric type - ignore control messages
      console.warn('[signer-worker]: Ignoring message with invalid non-numeric type:', eventType);
      break;

    case messageProcessed:
      // Case 4: Worker already processed initial message and this isn't a confirmation
      console.error('[signer-worker]: Invalid message - worker already processed initial message');
      sendInvalidMessageError('Worker has already processed a message');
      break;

    default:
      // Case 5: Unexpected state
      console.error('[signer-worker]: Unexpected message state');
      sendInvalidMessageError('Unexpected message state');
      break;
  }
};

async function handleAttachWrapKeySeedPort(
  event: MessageEvent<SignerWorkerMessage<WorkerRequestType, WasmRequestPayload> | any>
): Promise<void> {
  const sessionId = (event.data as any)?.sessionId as string | undefined;
  const port = event.ports?.[0];

  if (!sessionId || !port) {
    console.error('[signer-worker]: ATTACH_WRAP_KEY_SEED_PORT missing sessionId or MessagePort');
    self.postMessage({
      type: 'ATTACH_WRAP_KEY_SEED_PORT_ERROR',
      sessionId: sessionId || 'unknown',
      error: 'Missing sessionId or MessagePort'
    });
    return;
  }

  // Hand the port to WASM; Rust owns WrapKeySeed delivery/storage and session-bound injection.
  try {
    await initializeWasm();
    attach_wrap_key_seed_port(sessionId, port);

    // Emit success ACK to main thread
    self.postMessage({
      type: 'ATTACH_WRAP_KEY_SEED_PORT_OK',
      sessionId,
    });
  } catch (err) {
    console.error('[signer-worker]: Failed to attach WrapKeySeed port in WASM', err);

    // Emit error control message first (for early detection)
    self.postMessage({
      type: 'ATTACH_WRAP_KEY_SEED_PORT_ERROR',
      sessionId,
      error: errorMessage(err)
    });

    // Also bubble up a failure response so session can be cleaned up.
    self.postMessage({
      type: WorkerResponseType.SignTransactionsWithActionsFailure,
      payload: { error: 'Failed to attach WrapKeySeed port' }
    });
  }
}

function assertNoPrfOrVrfSecrets(data: any): void {
  const payload = data?.payload;
  if (!payload || typeof payload !== 'object') return;
  const forbiddenKeys = ['prfOutput', 'prf_output', 'prfFirst', 'prf_first', 'prf', 'vrfSk', 'vrf_sk'];
  for (const key of forbiddenKeys) {
    if ((payload as any)[key] !== undefined) {
      throw new Error(`Forbidden secret field in signer payload: ${key}`);
    }
  }
}

self.onerror = (message, filename, lineno, colno, error) => {
  console.error('[signer-worker]: error:', {
    message: typeof message === 'string' ? message : 'Unknown error',
    filename: filename || 'unknown',
    lineno: lineno || 0,
    colno: colno || 0,
    error: error
  });
};

self.onunhandledrejection = (event) => {
  console.error('[signer-worker]: Unhandled promise rejection:', event.reason);
  event.preventDefault();
};

/**
 * Helper function to safely parse JSON with fallback
 */
function safeJsonParse(jsonString: string, fallback: any = {}): any {
  try {
    return jsonString ? JSON.parse(jsonString) : fallback;
  } catch (error) {
    console.warn('[signer-worker]: Failed to parse JSON:', error);
    return Array.isArray(fallback) ? [jsonString] : { rawData: jsonString };
  }
}
