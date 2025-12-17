import type { VRFWorkerMessage, WasmVrfWorkerRequestType } from '../../../types/vrf-worker';
import type { VrfWorkerManagerHandlerContext } from './types';

/**
 * Full VRF logout: zeroize the in-memory VRF keypair and clear all VRF worker caches.
 *
 * This differs from `clearSession`, which only clears a single signing session (`sessionId`).
 * Use this when the user explicitly logs out / locks the VRF keypair.
 */
export async function clearVrfSession(ctx: VrfWorkerManagerHandlerContext): Promise<void> {
  console.debug('VRF Manager: Clearing VRF session...');

  await ctx.ensureWorkerReady();

  try {
    const message: VRFWorkerMessage<WasmVrfWorkerRequestType> = {
      type: 'CLEAR_VRF',
      id: ctx.generateMessageId(),
      payload: {} as WasmVrfWorkerRequestType
    };

    const response = await ctx.sendMessage(message);

    if (response.success) {
      // Clear the TypeScript-tracked account ID
      ctx.setCurrentVrfAccountId(null);
      console.debug('VRF Manager: VRF session cleared (key material zeroized)');
    } else {
      console.warn('️VRF Manager: Clear VRF failed:', response.error);
    }
  } catch (error) {
    console.warn('VRF Manager: Clear VRF error:', error);
  }
}
