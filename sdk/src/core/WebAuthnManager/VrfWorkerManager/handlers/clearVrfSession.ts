import type { VRFWorkerMessage, WasmVrfWorkerRequestType } from '../../../types/vrf-worker';
import type { VrfWorkerManagerHandlerContext } from './types';

export async function clearVrfSession(ctx: VrfWorkerManagerHandlerContext): Promise<void> {
  console.debug('VRF Manager: Logging out...');

  await ctx.ensureWorkerReady();

  try {
    const message: VRFWorkerMessage<WasmVrfWorkerRequestType> = {
      type: 'LOGOUT',
      id: ctx.generateMessageId(),
      payload: {} as WasmVrfWorkerRequestType
    };

    const response = await ctx.sendMessage(message);

    if (response.success) {
      // Clear the TypeScript-tracked account ID
      ctx.setCurrentVrfAccountId(null);
      console.debug('VRF Manager: Logged out: VRF keypair securely zeroized');
    } else {
      console.warn('️VRF Manager: Logout failed:', response.error);
    }
  } catch (error) {
    console.warn('VRF Manager: Logout error:', error);
  }
}

