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
  WorkerMessage,
  WorkerRequestType,
  WorkerResponseType,
  ProgressStep,
  ProgressStepMap,
} from './types/signer-worker';
// Import WASM binary directly
import init, * as wasmModule from '../wasm_signer_worker/wasm_signer_worker.js';
import { resolveWasmUrl } from './wasm/wasmLoader';

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
console.debug(`[Signer Worker] WASM URL resolved to: ${wasmUrl.href}`);
const { handle_signer_message } = wasmModule;

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
    console.debug(`[signer-worker]: Progress update: ${messageTypeName} (${messageType}) - ${stepName} (${step}) - ${message}`);

    // Parse structured data and logs
    let parsedData: any = {};
    let parsedLogs: string[] = [];

    try {
      parsedData = data ? JSON.parse(data) : {};
    } catch (error) {
      console.warn('[signer-worker]: Failed to parse progress data:', error);
      parsedData = { rawData: data };
    }

    try {
      parsedLogs = logs ? JSON.parse(logs) : [];
    } catch (error) {
      console.warn('[signer-worker]: Failed to parse progress logs:', error);
      parsedLogs = logs ? [logs] : [];
    }

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
      type: WorkerResponseType.DeriveNearKeypairAndEncryptFailure, // Use any failure type as fallback
      payload: {
        error: `Progress message failed: ${error?.message || 'Unknown error'}`,
        context: { messageType, step, message }
      },
    });
  }
}

// Important: Make sendProgressMessage available globally for WASM to call
(globalThis as any).sendProgressMessage = sendProgressMessage;

/**
 * Initialize WASM module
 */
async function initializeWasm(): Promise<void> {
  try {
    await init({ module_or_path: wasmUrl });
  } catch (error: any) {
    console.error('[signer-worker]: WASM initialization failed:', error);
    throw new Error(`WASM initialization failed: ${error?.message || 'Unknown error'}`);
  }
}

self.onmessage = async (event: MessageEvent<WorkerMessage<WorkerRequestType>>): Promise<void> => {
  if (messageProcessed) {
    self.postMessage({
      type: WorkerResponseType.DeriveNearKeypairAndEncryptFailure, // Use any failure type as fallback
      payload: { error: 'Worker has already processed a message' }
    });
    self.close();
    return;
  }

  messageProcessed = true;
  console.debug('[signer-worker]: Received message:', { type: event.data.type });

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

    // Extract error message from JsValue or Error object
    let errorMessage = 'Unknown error occurred';
    if (error && typeof error === 'object') {
      if (error.message) {
        errorMessage = error.message;
      } else if (error.toString) {
        errorMessage = error.toString();
      } else {
        errorMessage = JSON.stringify(error);
      }
    } else if (typeof error === 'string') {
      errorMessage = error;
    }

    self.postMessage({
      type: WorkerResponseType.DeriveNearKeypairAndEncryptFailure,
      payload: {
        error: errorMessage,
        context: { type: event.data.type }
      }
    });
    self.close();
  }
};

self.onerror = (message, filename, lineno, colno, error) => {
  console.error('[signer-worker]: Global error:', {
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