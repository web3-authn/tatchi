import type { VRFWorkerMessage, WasmCheckSessionStatusRequest } from '../../../types/vrf-worker';
import type { VrfWorkerManagerHandlerContext } from './types';

/**
 * Per-`sessionId` signing-session status (WrapKeySeed session gating).
 *
 * This is NOT the same as the "global" VRF unlock status (whether the VRF keypair is active).
 * For VRF keypair unlock status, use `checkVrfStatus`.
 */
export async function checkSessionStatus(
  ctx: VrfWorkerManagerHandlerContext,
  args: { sessionId: string }
): Promise<{
  sessionId: string;
  status: 'active' | 'exhausted' | 'expired' | 'not_found';
  remainingUses?: number;
  expiresAtMs?: number;
  createdAtMs?: number;
}> {
  await ctx.ensureWorkerReady(true);
  const message: VRFWorkerMessage<WasmCheckSessionStatusRequest> = {
    type: 'CHECK_SESSION_STATUS',
    id: ctx.generateMessageId(),
    payload: {
      sessionId: args.sessionId,
    } as any,
  };
  const response = await ctx.sendMessage<WasmCheckSessionStatusRequest>(message);
  if (!response.success) {
    throw new Error(`checkSessionStatus failed: ${response.error}`);
  }
  return (
    (response.data as any) || {
      sessionId: args.sessionId,
      status: 'not_found',
    }
  );
}
