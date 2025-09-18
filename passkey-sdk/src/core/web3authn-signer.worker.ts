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
import init, * as wasmModule from '../wasm_signer_worker/wasm_signer_worker.js';
import { resolveWasmUrl } from './wasmLoader';
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
const { handle_signer_message } = wasmModule;
import { awaitSecureConfirmationV2 } from './WebAuthnManager/SignerWorkerManager/confirmTxFlow/awaitSecureConfirmation';
import { SecureConfirmMessageType } from './WebAuthnManager/SignerWorkerManager/confirmTxFlow/types';

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
  data: string,
  logs?: string
): void {
  try {
    // Parse structured data and logs using helper
    const parsedData = safeJsonParse(data, {});
    const parsedLogs = safeJsonParse(logs || '', []);

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

    // Use the numeric messageType directly - no more string mapping needed!
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

// Expose the worker bridge for WASM to call (V2 only)
(globalThis as any).awaitSecureConfirmationV2 = awaitSecureConfirmationV2;

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
try {
  // Delay one tick to allow listener registration on main thread
  setTimeout(() => {
    try { (self as any).postMessage({ type: 'WORKER_READY', ready: true }); } catch {}
  }, 0);
} catch (_) { /* ignore */ }

/**
 * Process a WASM worker message (main operation)
 */
async function processWorkerMessage(event: MessageEvent): Promise<void> {
  messageProcessed = true;
  try {
    // Initialize WASM
    await initializeWasm();
    // Convert TypeScript message to JSON and pass to Rust
    const messageJson = JSON.stringify(event.data);
    // Call the Rust message handler
    const responseJson = await handle_signer_message(messageJson);
    // Parse response and send back to main thread
    const response = JSON.parse(responseJson);
    self.postMessage(response);
    self.close();
  } catch (error: any) {
    console.error('[signer-worker]: Message processing failed:', error);
    self.postMessage({
      type: WorkerResponseType.DeriveNearKeypairAndEncryptFailure,
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

  // Handle different message types explicitly
  switch (true) {
    case !messageProcessed:
      // Case 1: First message - process as normal worker operation
      await processWorkerMessage(event);
      break;

    case eventType === SecureConfirmMessageType.USER_PASSKEY_CONFIRM_RESPONSE:
      // Case 2: User confirmation response - let it bubble to awaitSecureConfirmationV2 listener
      // By breaking here without consuming the event, the message continues to propagate
      // to the existing addEventListener('message', onMainChannelDecision) listener in awaitSecureConfirmationV2
      break;

    case messageProcessed:
      // Case 3: Worker already processed initial message and this isn't a confirmation
      console.error('[signer-worker]: Invalid message - worker already processed initial message');
      sendInvalidMessageError('Worker has already processed a message');
      break;

    default:
      // Case 4: Unexpected state
      console.error('[signer-worker]: Unexpected message state');
      sendInvalidMessageError('Unexpected message state');
      break;
  }
};

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

// Error string extraction handled by errorMessage() in utils/errors

// Expose the V2 confirmation bridge function globally for WASM glue to call
// Rust side binds to js_name = awaitSecureConfirmationV2
(globalThis as any).awaitSecureConfirmationV2 = awaitSecureConfirmationV2;
