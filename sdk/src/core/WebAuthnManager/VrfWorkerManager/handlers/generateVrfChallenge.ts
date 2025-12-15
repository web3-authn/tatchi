import type {
  VRFInputData,
  VRFWorkerMessage,
  WasmGenerateVrfChallengeRequest,
} from '../../../types/vrf-worker';
import { validateVRFChallenge, type VRFChallenge } from '../../../types/vrf-worker';
import type { VrfWorkerManagerHandlerContext } from './types';

export async function generateVrfChallengeForSession(
  ctx: VrfWorkerManagerHandlerContext,
  inputData: VRFInputData,
  sessionId: string
): Promise<VRFChallenge> {
  return generateVrfChallengeInternal(ctx, inputData, sessionId);
}

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

