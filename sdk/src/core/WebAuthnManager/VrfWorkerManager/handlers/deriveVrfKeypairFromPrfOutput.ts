import type { AccountId } from '../../../types/accountIds';
import type {
  EncryptedVRFKeypair,
  ServerEncryptedVrfKeypair,
  VRFInputData,
  VRFWorkerMessage,
  WasmDeriveVrfKeypairFromPrfRequest,
} from '../../../types/vrf-worker';
import { validateVRFChallenge, type VRFChallenge } from '../../../types/vrf-worker';
import type { VrfWorkerManagerHandlerContext } from './types';

/**
 * Shared implementation: derive a deterministic VRF keypair from a base64url PRF output string.
 *
 * This is used by:
 * - `deriveVrfKeypairFromPrf` (extracts PRF output from a credential)
 * - `deriveVrfKeypairFromRawPrf` (PRF output already available as a string)
 */
export async function deriveVrfKeypairFromPrfOutput(
  ctx: VrfWorkerManagerHandlerContext,
  args: {
    prfOutput: string;
    nearAccountId: AccountId;
    vrfInputData?: VRFInputData;
    saveInMemory?: boolean;
    requireEncryptedVrfKeypair?: boolean;
  }
): Promise<{
  vrfPublicKey: string;
  vrfChallenge: VRFChallenge | null;
  encryptedVrfKeypair: EncryptedVRFKeypair;
  serverEncryptedVrfKeypair: ServerEncryptedVrfKeypair | null;
}> {
  const saveInMemory = args.saveInMemory ?? true;
  await ctx.ensureWorkerReady();

  const vrfInputData = args.vrfInputData;
  const hasVrfInputData = vrfInputData?.blockHash
    && vrfInputData?.blockHeight
    && vrfInputData?.userId
    && vrfInputData?.rpId;

  const message: VRFWorkerMessage<WasmDeriveVrfKeypairFromPrfRequest> = {
    type: 'DERIVE_VRF_KEYPAIR_FROM_PRF',
    id: ctx.generateMessageId(),
    payload: {
      prfOutput: args.prfOutput,
      nearAccountId: args.nearAccountId,
      saveInMemory,
      vrfInputData: hasVrfInputData ? {
        userId: vrfInputData.userId,
        rpId: vrfInputData.rpId,
        blockHeight: String(vrfInputData.blockHeight),
        blockHash: vrfInputData.blockHash,
      } : undefined,
    }
  };

  const response = await ctx.sendMessage(message);

  if (!response.success || !response.data) {
    throw new Error(`VRF keypair derivation failed: ${response.error}`);
  }
  const data = response.data as {
    vrfPublicKey?: string;
    vrfChallengeData?: VRFChallenge;
    encryptedVrfKeypair: EncryptedVRFKeypair;
    serverEncryptedVrfKeypair?: ServerEncryptedVrfKeypair | null;
  };

  const vrfPublicKey = data.vrfPublicKey || data.vrfChallengeData?.vrfPublicKey;
  if (!vrfPublicKey) {
    throw new Error('VRF public key not found in response');
  }

  if (args.requireEncryptedVrfKeypair && !data.encryptedVrfKeypair) {
    throw new Error('Encrypted VRF keypair not found in response - this is required for registration');
  }

  const vrfChallenge = data.vrfChallengeData
    ? validateVRFChallenge({
      vrfInput: data.vrfChallengeData.vrfInput,
      vrfOutput: data.vrfChallengeData.vrfOutput,
      vrfProof: data.vrfChallengeData.vrfProof,
      vrfPublicKey: data.vrfChallengeData.vrfPublicKey,
      userId: data.vrfChallengeData.userId,
      rpId: data.vrfChallengeData.rpId,
      blockHeight: data.vrfChallengeData.blockHeight,
      blockHash: data.vrfChallengeData.blockHash,
    })
    : null;

  if (saveInMemory) {
    ctx.setCurrentVrfAccountId(args.nearAccountId);
    console.debug(`VRF Manager: VRF keypair loaded in memory for ${args.nearAccountId}`);
  }

  return {
    vrfPublicKey,
    vrfChallenge,
    encryptedVrfKeypair: data.encryptedVrfKeypair,
    serverEncryptedVrfKeypair: data.serverEncryptedVrfKeypair || null,
  };
}

