import type { VRFWorkerMessage, VRFWorkerStatus, WasmVrfWorkerRequestType } from '../../../types/vrf-worker';
import { toAccountId } from '../../../types/accountIds';
import type { VrfWorkerManagerHandlerContext } from './types';

/**
 * "Global" VRF status: is the VRF keypair currently unlocked/active inside the VRF worker?
 *
 * This is NOT the same as a signing session status (WrapKeySeed session gating).
 * For per-`sessionId` signing-session status, use `checkSessionStatus`.
 */
export async function checkVrfStatus(ctx: VrfWorkerManagerHandlerContext): Promise<VRFWorkerStatus> {
  try {
    await ctx.ensureWorkerReady();
  } catch {
    // If initialization fails, return inactive status
    return { active: false, nearAccountId: null, vrfPublicKey: null };
  }

  try {
    const message: VRFWorkerMessage<WasmVrfWorkerRequestType> = {
      type: 'CHECK_VRF_STATUS',
      id: ctx.generateMessageId(),
      payload: {} as WasmVrfWorkerRequestType
    };

    const response = await ctx.sendMessage(message);

    if (response.success && response.data) {
      const data = response.data as { active: boolean; sessionDuration?: number; vrfPublicKey?: string };
      const current = ctx.getCurrentVrfAccountId();
      return {
        active: data.active,
        nearAccountId: current ? toAccountId(current) : null,
        sessionDuration: data.sessionDuration,
        vrfPublicKey: data.vrfPublicKey ?? null,
      };
    }

    return { active: false, nearAccountId: null, vrfPublicKey: null };
  } catch (error) {
    console.warn('VRF Manager: Failed to get VRF status:', error);
    return { active: false, nearAccountId: null, vrfPublicKey: null };
  }
}
