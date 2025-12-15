import type { VRFWorkerMessage, WasmDispenseSessionKeyRequest } from '../../../types/vrf-worker';
import type { VrfWorkerManagerHandlerContext } from './types';

export async function dispenseSessionKey(
  ctx: VrfWorkerManagerHandlerContext,
  args: { sessionId: string; uses?: number }
): Promise<{
  sessionId: string;
  remainingUses?: number;
  expiresAtMs?: number;
}> {
  await ctx.ensureWorkerReady(true);
  const message: VRFWorkerMessage<WasmDispenseSessionKeyRequest> = {
    type: 'DISPENSE_SESSION_KEY',
    id: ctx.generateMessageId(),
    payload: {
      sessionId: args.sessionId,
      uses: args.uses,
    } as any,
  };
  const response = await ctx.sendMessage<WasmDispenseSessionKeyRequest>(message);
  if (!response.success) {
    throw new Error(`dispenseSessionKey failed: ${response.error}`);
  }
  return (response.data as any) || { sessionId: args.sessionId };
}

