/**
 * Session Handshake Orchestration for Signer Worker
 *
 * This module provides high-level functions for setting up and validating
 * signing sessions with the signer worker. It orchestrates the complete
 * handshake flow from port attachment to seed readiness.
 */

import { waitForWrapKeyPortAttach, waitForWrapKeySeedReady } from './sessionMessages.js';
import { computeUiIntentDigestFromTxs, orderActionForDigest } from '../txDigest';
import type { NearClient } from '../../NearClient';
import type { NonceManager } from '../../nonceManager';
import type { TransactionContext } from '../../types/rpc';
import type { TransactionInputWasm } from '../../types/actions';
import { WorkerControlMessage } from '../../workerControlMessages';

type VrfSessionKeyDispenser = {
  dispenseSessionKey: (args: { sessionId: string; uses?: number }) => Promise<unknown>;
};
type WaitForSeedReadyFn = (sessionId: string, timeoutMs?: number) => Promise<void>;

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
    { type: WorkerControlMessage.ATTACH_WRAP_KEY_SEED_PORT, sessionId },
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

export const generateSessionId = (): string => {
  return (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
    ? crypto.randomUUID()
    : `sign-session-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function isWarmSessionUnavailableError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('SESSION_NOT_FOUND') ||
    msg.includes('SESSION_EXPIRED') ||
    msg.includes('SESSION_EXHAUSTED')
  );
}

function releaseNoncesBestEffort(nonceManager: NonceManager, nonces: string[]): void {
  for (const n of nonces) {
    try { nonceManager.releaseNonce(n); } catch {}
  }
}

/**
 * Warm signing helper for transaction-like operations.
 *
 * - Computes canonical `intentDigest` for UI/signer validation
 * - Reserves nonces for `txCount` to avoid collisions
 * - Attempts VRF session key dispense (WrapKeySeed + wrapKeySalt) without prompting
 *
 * Returns null when the VRF session is missing/expired/exhausted so callers can
 * fall back to full confirmTxFlow.
 */
export async function tryPrepareWarmSigningContext(args: {
  nearClient: NearClient;
  nonceManager: NonceManager;
  txInputsForDigest: TransactionInputWasm[];
  sessionId: string;
  vrfWorkerManager: VrfSessionKeyDispenser;
  waitForSeedReady: WaitForSeedReadyFn;
  nonceCount?: number;
  uses?: number;
}): Promise<{ intentDigest: string; transactionContext: TransactionContext } | null> {
  const baseCtx = await args.nonceManager.getNonceBlockHashAndHeight(args.nearClient);
  const txCount = Math.max(1, args.nonceCount ?? args.txInputsForDigest.length ?? 1);
  const reservedNonces = args.nonceManager.reserveNonces(txCount);

  let keepReservations = false;
  try {
    const transactionContext: TransactionContext = {
      ...baseCtx,
      nextNonce: reservedNonces[0] ?? baseCtx.nextNonce,
    };

    const intentDigest = await computeUiIntentDigestFromTxs(
      args.txInputsForDigest.map(tx => ({
        receiverId: tx.receiverId,
        actions: tx.actions.map(orderActionForDigest),
      })) as TransactionInputWasm[]
    );

    const uses = Math.max(1, args.uses ?? txCount);
    try {
      await args.vrfWorkerManager.dispenseSessionKey({ sessionId: args.sessionId, uses });
      await args.waitForSeedReady(args.sessionId);
    } catch (err) {
      if (isWarmSessionUnavailableError(err)) {
        return null;
      }
      throw err;
    }

    keepReservations = true;
    return { intentDigest, transactionContext };
  } finally {
    if (!keepReservations) {
      releaseNoncesBestEffort(args.nonceManager, reservedNonces);
    }
  }
}
