import type { VRFWorkerMessage, WasmGetSessionStatusRequest } from '../../../types/vrf-worker';
import type { VrfWorkerManagerHandlerContext } from './types';

/**
 * Per-`sessionId` signing-session status (WrapKeySeed session gating).
 *
 * This is NOT the same as the "global" VRF unlock status (whether the VRF keypair is active).
 * For VRF keypair unlock status, use `checkVrfStatus`.
 */
export async function getSessionStatus(
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
  const message: VRFWorkerMessage<WasmGetSessionStatusRequest> = {
    type: 'GET_SESSION_STATUS',
    id: ctx.generateMessageId(),
    payload: {
      sessionId: args.sessionId,
    } as any,
  };
  const response = await ctx.sendMessage<WasmGetSessionStatusRequest>(message);
  if (!response.success) {
    throw new Error(`getSessionStatus failed: ${response.error}`);
  }
  return (
    (response.data as any) || {
      sessionId: args.sessionId,
      status: 'not_found',
    }
  );
}
