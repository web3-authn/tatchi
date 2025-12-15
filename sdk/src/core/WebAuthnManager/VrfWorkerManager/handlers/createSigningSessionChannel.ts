import { WorkerControlMessage } from '../../../workerControlMessages';
import type { VrfWorkerManagerHandlerContext } from './types';

/**
 * Create a VRF-owned MessageChannel for signing and return the signer-facing port.
 * VRF retains the sibling port for WrapKeySeed delivery.
 */
export async function createSigningSessionChannel(
  ctx: VrfWorkerManagerHandlerContext,
  sessionId: string
): Promise<MessagePort> {
  await ctx.ensureWorkerReady(true);
  const channel = new MessageChannel();
  try {
    ctx.postToWorker(
      { type: WorkerControlMessage.ATTACH_WRAP_KEY_SEED_PORT, sessionId },
      [channel.port1],
    );
  } catch (err) {
    console.error('[VrfWorkerManager] Failed to attach WrapKeySeed port to VRF worker', err);
    throw err;
  }
  return channel.port2;
}

