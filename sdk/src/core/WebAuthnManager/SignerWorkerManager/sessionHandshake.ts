/**
 * Session Handshake Orchestration for Signer Worker
 *
 * This module provides high-level functions for setting up and validating
 * signing sessions with the signer worker. It orchestrates the complete
 * handshake flow from port attachment to seed readiness.
 */

import { waitForWrapKeyPortAttach, waitForWrapKeySeedReady } from './sessionMessages.js';

/**
 * Attach a WrapKeySeed MessagePort to the signer worker and wait for acknowledgment.
 * This ensures the port is successfully attached before proceeding.
 *
 * Flow:
 * 1. Register ACK listener (avoids race where worker responds before we listen)
 * 2. Send ATTACH_WRAP_KEY_SEED_PORT message with port transfer
 * 3. Wait for ATTACH_WRAP_KEY_SEED_PORT_OK acknowledgment
 *
 * @param worker - The signer worker to attach the port to
 * @param sessionId - The signing session ID
 * @param signerPort - The MessagePort for receiving WrapKeySeed material
 * @param timeoutMs - How long to wait for ACK (default: 2000ms)
 * @throws Error if attachment fails or times out
 */
export async function attachSessionPort(
  worker: Worker,
  sessionId: string,
  signerPort: MessagePort,
  timeoutMs: number = 2000
): Promise<void> {
  // Register the ACK listener BEFORE sending the message to avoid race condition
  const waitPromise = waitForWrapKeyPortAttach(worker, sessionId, timeoutMs);

  // Send the attach command (transfer the port)
  worker.postMessage(
    { type: 'ATTACH_WRAP_KEY_SEED_PORT', sessionId },
    [signerPort]
  );

  // Wait for the worker to acknowledge successful attachment
  await waitPromise;
}

/**
 * Wait for a WrapKeySeed to be ready for the given session.
 * This ensures the signer worker has received and stored the seed before signing begins.
 *
 * Flow:
 * 1. VRF worker derives WrapKeySeed
 * 2. VRF sends seed via MessagePort to signer worker
 * 3. Signer WASM receives and stores seed in WRAP_KEY_SEED_SESSIONS
 * 4. Signer notifies main thread via WRAP_KEY_SEED_READY
 * 5. This function resolves
 *
 * @param worker - The signer worker to wait for
 * @param sessionId - The signing session ID
 * @param timeoutMs - How long to wait for ready signal (default: 2000ms)
 * @throws Error if seed doesn't arrive or times out
 */
export async function waitForSessionReady(
  worker: Worker,
  sessionId: string,
  timeoutMs: number = 2000
): Promise<void> {
  await waitForWrapKeySeedReady(worker, sessionId, timeoutMs);
}
