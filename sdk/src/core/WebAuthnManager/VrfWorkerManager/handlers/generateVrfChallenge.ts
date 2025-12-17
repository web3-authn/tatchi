import type {
  VRFInputData,
  VRFWorkerMessage,
  WasmGenerateVrfChallengeRequest,
} from '../../../types/vrf-worker';
import { validateVRFChallenge, type VRFChallenge } from '../../../types/vrf-worker';
import type { VrfWorkerManagerHandlerContext } from './types';

/**
 * Generate a VRF challenge and cache it under `sessionId` inside the VRF worker.
 *
 * This is used by SecureConfirm flows so later steps (e.g. contract verification) can rely on
 * worker-owned challenge data instead of JS-provided state.
 */
export async function generateVrfChallengeForSession(
  ctx: VrfWorkerManagerHandlerContext,
  inputData: VRFInputData,
  sessionId: string
): Promise<VRFChallenge> {
  return generateVrfChallengeInternal(ctx, inputData, sessionId);
}

/**
 * Generate a one-off VRF challenge without caching it in the VRF worker.
 *
 * Used for standalone WebAuthn prompts where we don't need to later look up the challenge by `sessionId`.
 */
export async function generateVrfChallengeOnce(
  ctx: VrfWorkerManagerHandlerContext,
  inputData: VRFInputData
): Promise<VRFChallenge> {
  return generateVrfChallengeInternal(ctx, inputData);
}

async function generateVrfChallengeInternal(
  ctx: VrfWorkerManagerHandlerContext,
  inputData: VRFInputData,
  sessionId?: string
): Promise<VRFChallenge> {
  await ctx.ensureWorkerReady(true);
  const message: VRFWorkerMessage<WasmGenerateVrfChallengeRequest> = {
    type: 'GENERATE_VRF_CHALLENGE',
    id: ctx.generateMessageId(),
    payload: {
      sessionId,
      vrfInputData: {
        userId: inputData.userId,
        rpId: inputData.rpId,
        blockHeight: String(inputData.blockHeight),
        blockHash: inputData.blockHash,
      },
    },
  };

  const response = await ctx.sendMessage(message);

  if (!response.success || !response.data) {
    throw new Error(`VRF challenge generation failed: ${response.error}`);
  }

  const data = response.data as unknown as VRFChallenge;
  console.debug('VRF Manager: VRF challenge generated successfully');
  return validateVRFChallenge(data);
}
