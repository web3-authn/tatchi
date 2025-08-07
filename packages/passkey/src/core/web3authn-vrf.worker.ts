/**
 * VRF WASM Web Worker
 * This Web Worker loads the VRF WASM module and provides VRF keypair management.
 */

import init, * as vrfWasmModule from '../wasm_vrf_worker/wasm_vrf_worker';
import { resolveWasmUrl } from './wasm/wasmLoader';
import type { VRFWorkerMessage, VRFWorkerResponse } from './types/vrf-worker';

/**
 * WASM Asset Path Resolution for VRF Worker
 *
 * Uses centralized path resolution strategy from wasmLoader.ts
 * See wasmLoader.ts for detailed documentation on how paths work across:
 * - SDK building (Rolldown)
 * - Playwright E2E tests
 * - Frontend dev installing from npm
 */

// Resolve WASM URL using the centralized resolution strategy
const wasmUrl = resolveWasmUrl('wasm_vrf_worker_bg.wasm', 'VRF Worker');
console.debug(`[VRF Worker] WASM URL resolved to: ${wasmUrl.href}`);

const { handle_message } = vrfWasmModule;

// === SIMPLIFIED STATE ===

let wasmReady = false;
let messageQueue: MessageEvent[] = [];

// === WASM INITIALIZATION ===

/**
 * Initialize WASM module once at startup
 */
async function initializeWasmModule(): Promise<void> {
  try {
    console.debug('[vrf-worker] Starting WASM module initialization...');
    await init(); // init function now handles loading WASM
    console.debug('[vrf-worker] WASM module initialized successfully');

    // Mark WASM as ready and process any queued messages
    wasmReady = true;
    await processQueuedMessages();

  } catch (error: any) {
    console.error('[vrf-worker] WASM initialization failed:', error);
    // Send error responses to all queued messages
    for (const event of messageQueue) {
      const errorResponse = createErrorResponse(event.data?.id, error);
      self.postMessage(errorResponse);
    }
    messageQueue = [];
    throw error; // Re-throw so failures are visible
  }
}

// === MESSAGE HANDLING ===

self.onmessage = async (event: MessageEvent) => {
  await handleMessage(event);
};

// Process queued messages once WASM is ready
async function processQueuedMessages(): Promise<void> {
  console.debug(`[vrf-worker] Processing ${messageQueue.length} queued messages`);
  const queuedMessages = [...messageQueue];
  messageQueue = [];

  for (const event of queuedMessages) {
    try {
      await handleMessage(event);
    } catch (error: any) {
      console.error('[vrf-worker] Error processing queued message:', error);
      // Send error response for this specific message
      const errorResponse = createErrorResponse(event.data?.id, error);
      self.postMessage(errorResponse);
    }
  }
}

// Main message handler
async function handleMessage(event: MessageEvent): Promise<void> {
  const data: VRFWorkerMessage = event.data;

  // If WASM is not ready, queue the message
  if (!wasmReady) {
    console.debug(`[vrf-worker] WASM not ready, queueing message: ${data.type}`);
    messageQueue.push(event);
    return;
  }

  try {
    console.debug(`[vrf-worker] Processing message: ${data.type}`);

    // Call WASM handle_message with JavaScript object - Rust function handles JSON stringification
    const response: VRFWorkerResponse = handle_message(data);

    console.debug(`[vrf-worker] WASM response: success=${response.success}`);

    // Send response back to main thread
    self.postMessage(response);

  } catch (error: unknown) {
    console.error(`[vrf-worker] Message handling error for ${data.type}:`, error);

    // Send error response
    const errorResponse = createErrorResponse(data?.id, error);
    self.postMessage(errorResponse);
  }
}

// === ERROR HANDLING ===

function createErrorResponse(
  messageId: string | undefined,
  error: unknown
): VRFWorkerResponse {
  let errorMessage = 'Unknown error in VRF Web Worker';

  if (error instanceof Error) {
    errorMessage = error.message;
    console.error('[vrf-worker] Full error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
  } else if (typeof error === 'string') {
    errorMessage = error;
  } else {
    console.error('[vrf-worker] Non-Error object thrown:', error);
    errorMessage = String(error);
  }

  return {
    id: messageId,
    success: false,
    error: errorMessage
  };
}

// === GLOBAL ERROR MONITORING ===

self.onerror = (error) => {
  console.error('[vrf-worker] Global error:', error);
};

self.onunhandledrejection = (event) => {
  console.error('[vrf-worker] Unhandled promise rejection:', event.reason);
  event.preventDefault();
};

// === INITIALIZATION ===

// Initialize WASM module on worker startup
initializeWasmModule().catch(error => {
  console.error('[vrf-worker] Startup initialization failed:', error);
  // Worker will throw errors for all future messages if WASM fails to initialize
});
