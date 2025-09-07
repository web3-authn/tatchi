/**
 * VRF WASM Web Worker
 * This Web Worker loads the VRF WASM module and provides VRF keypair management.
 */

import init, * as vrfWasmModule from '../wasm_vrf_worker/wasm_vrf_worker';
import { resolveWasmUrl } from './wasm/wasmLoader';
import type {
  VRFWorkerMessage,
  WasmVrfWorkerRequestType,
  VRFWorkerResponse
} from './types/vrf-worker';

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
const wasmUrl = resolveWasmUrl('wasm_vrf_worker_bg.wasm', 'vrf-worker');
console.debug(`[vrf-worker] WASM URL resolved to: ${wasmUrl.href}`);

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
    await init(); // init function now handles loading WASM
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
  const data: VRFWorkerMessage<WasmVrfWorkerRequestType> = event.data;

  // If WASM is not ready, queue the message
  if (!wasmReady) {
    messageQueue.push(event);
    return;
  }

  try {
    // Call WASM handle_message with JavaScript object (async)
    const response = await handle_message(data) as VRFWorkerResponse;
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
  console.error('[vrf-worker] error:', error);
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
