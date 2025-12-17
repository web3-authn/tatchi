import type { VRFWorkerMessage, WasmClearSessionRequest } from '../../../types/vrf-worker';
import type { VrfWorkerManagerHandlerContext } from './types';

/**
 * Best-effort cleanup for a single VRF-owned signing session.
 *
 * Clears any VRF worker state bound to `sessionId`:
 * - cached WrapKeySeed session material (TTL/uses),
 * - cached VRF challenge (used for contract verification),
 * - and any attached WrapKeySeed MessagePort.
 *
 * Used by UI "Lock" actions and as a safety valve for session lifecycle cleanup.
 */
export async function clearSession(
  ctx: VrfWorkerManagerHandlerContext,
  args: { sessionId: string }
): Promise<{
  sessionId: string;
  clearedSession: boolean;
  clearedChallenge: boolean;
  clearedPort: boolean;
}> {
  await ctx.ensureWorkerReady(true);
  const message: VRFWorkerMessage<WasmClearSessionRequest> = {
    type: 'CLEAR_SESSION',
    id: ctx.generateMessageId(),
    payload: {
      sessionId: args.sessionId,
    } as any,
  };
  const response = await ctx.sendMessage<WasmClearSessionRequest>(message);
  if (!response.success) {
    throw new Error(`clearSession failed: ${response.error}`);
  }
  return (response.data as any) || {
    sessionId: args.sessionId,
    clearedSession: false,
    clearedChallenge: false,
    clearedPort: false,
  };
}
