import type { VRFWorkerMessage, WasmClearSessionRequest } from '../../../types/vrf-worker';
import type { VrfWorkerManagerHandlerContext } from './types';

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

