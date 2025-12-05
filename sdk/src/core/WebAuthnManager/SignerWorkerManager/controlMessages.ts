/**
 * Control Message Handling for Signer Worker
 *
 * This module provides helpers for waiting on control messages from the signer worker.
 * Control messages are JS-only messages that never go through the Rust JSON pipeline
 * and are used for worker lifecycle management and session setup.
 */

/**
 * Generic helper for waiting on control messages from a worker.
 * Registers a listener, sends no message (caller handles that), and waits for a matching response.
 *
 * @param worker - The worker to listen to
 * @param options - Configuration for what to wait for
 * @returns Promise that resolves when the expected message arrives, rejects on timeout or error
 */
export function waitForControlMessage(
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
    validator?: (msg: any) => boolean;
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
        `Timeout waiting for control message (${successTypes.join('|')})${sessionId ? ` for session ${sessionId}` : ''}`
      ));
    }, timeoutMs);

    const messageHandler = (event: MessageEvent) => {
      const msg = event.data;

      // Skip if message doesn't have a type
      if (!msg || typeof msg.type !== 'string') {
        return;
      }

      // Check if sessionId matches (if specified)
      if (sessionId && msg.sessionId !== sessionId) {
        return;
      }

      // Check for error type
      if (errorType && msg.type === errorType) {
        cleanup();
        const error = msg.error || 'Unknown error';
        reject(new Error(`Control message error: ${error}`));
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
  return waitForControlMessage(worker, {
    successType: 'ATTACH_WRAP_KEY_SEED_PORT_OK',
    errorType: 'ATTACH_WRAP_KEY_SEED_PORT_ERROR',
    sessionId,
    timeoutMs,
  });
}

/**
 * Wait for the worker to signal that a WrapKeySeed has been received and stored.
 * This ensures the session is fully ready for signing operations.
 *
 * @param worker - The worker that should send the ready signal
 * @param sessionId - The session ID to match
 * @param timeoutMs - How long to wait before rejecting (default: 2000ms)
 * @returns Promise that resolves when seed is ready, rejects on timeout
 */
export function waitForWrapKeySeedReady(
  worker: Worker,
  sessionId: string,
  timeoutMs: number = 2000
): Promise<void> {
  return waitForControlMessage(worker, {
    successType: 'WRAP_KEY_SEED_READY',
    sessionId,
    timeoutMs,
  });
}
