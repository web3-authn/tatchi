/**
 * Session Message Handling for Signer Worker
 *
 * This module provides helpers for waiting on session lifecycle messages from the signer worker.
 * Session messages are JS-only messages that never go through the Rust JSON pipeline
 * and are used for worker lifecycle management and session setup.
 */

import { WorkerControlMessage } from '../../workerControlMessages';

// === SESSION MESSAGE TYPES ===

/**
 * Control message sent by the signer worker after successfully attaching
 * a WrapKeySeed MessagePort for a signing session.
 */
export interface AttachWrapKeySeedPortOkMessage {
  type: typeof WorkerControlMessage.ATTACH_WRAP_KEY_SEED_PORT_OK;
  sessionId: string;
}

/**
 * Control message sent by the signer worker when attaching a WrapKeySeed
 * MessagePort fails.
 */
export interface AttachWrapKeySeedPortErrorMessage {
  type: typeof WorkerControlMessage.ATTACH_WRAP_KEY_SEED_PORT_ERROR;
  sessionId: string;
  error: string;
}

/**
 * Control message sent by the signer worker when it's ready to receive messages.
 */
export interface WorkerReadyMessage {
  type: typeof WorkerControlMessage.WORKER_READY;
  ready: boolean;
}

/**
 * All control messages that can be sent by the signer worker.
 */
export type SignerWorkerControlMessage =
  | AttachWrapKeySeedPortOkMessage
  | AttachWrapKeySeedPortErrorMessage
  | WorkerReadyMessage;

export type SessionMessage = Record<string, unknown> & {
  type: string;
  sessionId?: string;
  error?: string;
};

function asSessionMessage(msg: unknown): SessionMessage | null {
  if (!isObject(msg)) return null;
  if (typeof msg.type !== 'string') return null;
  if (msg.sessionId != null && typeof msg.sessionId !== 'string') return null;
  if (msg.error != null && typeof msg.error !== 'string') return null;
  return msg as SessionMessage;
}

/**
 * Type guard to check if a message is a control message.
 */
export function isSignerWorkerControlMessage(msg: unknown): msg is SignerWorkerControlMessage {
  if (!isObject(msg) || typeof msg.type !== 'string') {
    return false;
  }

  switch (msg.type) {
    case WorkerControlMessage.ATTACH_WRAP_KEY_SEED_PORT_OK:
      return typeof msg.sessionId === 'string';
    case WorkerControlMessage.ATTACH_WRAP_KEY_SEED_PORT_ERROR:
      return typeof msg.sessionId === 'string' && typeof msg.error === 'string';
    case WorkerControlMessage.WORKER_READY:
      return typeof msg.ready === 'boolean';
    default:
      return false;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

// === SESSION MESSAGE HELPERS ===

/**
 * Generic helper for waiting on session messages from a worker.
 * Registers a listener, sends no message (caller handles that), and waits for a matching response.
 *
 * @param worker - The worker to listen to
 * @param options - Configuration for what to wait for
 * @returns Promise that resolves when the expected message arrives, rejects on timeout or error
 */
export function waitForSessionMessage(
  worker: Worker,
  options: {
    /** Message type(s) to wait for (success) */
    successType: string | string[];
    /** Optional error type to reject on */
    errorType?: string;
    /** Session ID to match (if applicable) */
    sessionId?: string;
    /** Timeout in milliseconds */
    timeoutMs?: number;
    /** Custom message validator - return true to resolve, false to ignore, throw to reject */
    validator?: (msg: SessionMessage) => boolean;
  }
): Promise<void> {
  const {
    successType,
    errorType,
    sessionId,
    timeoutMs = 2000,
    validator,
  } = options;

  const successTypes = Array.isArray(successType) ? successType : [successType];

  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(
        `Timeout waiting for session message (${successTypes.join('|')})${sessionId ? ` for session ${sessionId}` : ''}`
      ));
    }, timeoutMs);

    const messageHandler = (event: MessageEvent<unknown>) => {
      const msg = asSessionMessage(event.data);

      // Skip if message doesn't have a type
      if (!msg) return;

      // Check if sessionId matches (if specified)
      if (sessionId && msg.sessionId !== sessionId) {
        return;
      }

      // Check for error type
      if (errorType && msg.type === errorType) {
        cleanup();
        const error = msg.error || 'Unknown error';
        reject(new Error(`Session message error: ${error}`));
        return;
      }

      // Check for success type
      if (successTypes.includes(msg.type)) {
        // Run custom validator if provided
        if (validator) {
          try {
            const shouldResolve = validator(msg);
            if (!shouldResolve) {
              return; // Validator said to ignore this message
            }
          } catch (err) {
            cleanup();
            reject(err);
            return;
          }
        }

        cleanup();
        resolve();
      }
    };

    const cleanup = () => {
      clearTimeout(timeout);
      worker.removeEventListener('message', messageHandler);
    };

    worker.addEventListener('message', messageHandler);
  });
}

/**
 * Wait for the worker to acknowledge successful attachment of the WrapKeySeed port.
 * This provides early detection of attach failures instead of only seeing late WASM errors.
 *
 * @param worker - The worker that should send the ACK
 * @param sessionId - The session ID to match
 * @param timeoutMs - How long to wait before rejecting (default: 2000ms)
 * @returns Promise that resolves on success ACK, rejects on error or timeout
 */
export function waitForWrapKeyPortAttach(
  worker: Worker,
  sessionId: string,
  timeoutMs: number = 2000
): Promise<void> {
  return waitForSessionMessage(worker, {
    successType: WorkerControlMessage.ATTACH_WRAP_KEY_SEED_PORT_OK,
    errorType: WorkerControlMessage.ATTACH_WRAP_KEY_SEED_PORT_ERROR,
    sessionId,
    timeoutMs,
  });
}
