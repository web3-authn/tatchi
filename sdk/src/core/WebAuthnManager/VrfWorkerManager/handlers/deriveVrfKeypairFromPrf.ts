import type { AccountId } from '../../../types/accountIds';
import type {
  EncryptedVRFKeypair,
  ServerEncryptedVrfKeypair,
  VRFInputData,
  VRFWorkerMessage,
  WasmDeriveVrfKeypairFromPrfRequest,
} from '../../../types/vrf-worker';
import { validateVRFChallenge, type VRFChallenge } from '../../../types/vrf-worker';
import type { WebAuthnAuthenticationCredential } from '../../../types/webauthn';
import { extractPrfFromCredential } from '../../credentialsHelpers';
import type { VrfWorkerManagerHandlerContext } from './types';

/**
 * Derive deterministic VRF keypair from PRF output embedded in a WebAuthn credential.
 *
 * If you already have the base64url PRF output string (e.g. from a serialized credential / secureConfirm),
 * use `deriveVrfKeypairFromRawPrf` instead.
 */
export async function deriveVrfKeypairFromPrf(
  ctx: VrfWorkerManagerHandlerContext,
  args: {
    credential: WebAuthnAuthenticationCredential;
    nearAccountId: AccountId;
    vrfInputData?: VRFInputData;
    saveInMemory?: boolean;
  }
): Promise<{
  vrfPublicKey: string;
  vrfChallenge: VRFChallenge | null;
  encryptedVrfKeypair: EncryptedVRFKeypair;
  serverEncryptedVrfKeypair: ServerEncryptedVrfKeypair | null;
}> {
  const saveInMemory = args.saveInMemory ?? true;
  console.debug('VRF Manager: Deriving deterministic VRF keypair from PRF output');
  try {
    const { chacha20PrfOutput } = extractPrfFromCredential({
      credential: args.credential,
      firstPrfOutput: true,
      secondPrfOutput: false,
    });
    const result = await deriveVrfKeypairFromPrfOutput(ctx, {
      prfOutput: chacha20PrfOutput,
      nearAccountId: args.nearAccountId,
      vrfInputData: args.vrfInputData,
      saveInMemory,
      requireEncryptedVrfKeypair: true,
    });
    console.debug('VRF Manager: Deterministic VRF keypair derivation successful');
    return result;

  } catch (error: any) {
    console.error('VRF Manager: VRF keypair derivation failed:', error);
    throw new Error(`VRF keypair derivation failed: ${error.message}`);
  }
}

/**
 * Derive deterministic VRF keypair from a pre-extracted base64url PRF output string.
 *
 * If you have a live WebAuthn credential with PRF extension results, prefer `deriveVrfKeypairFromPrf`,
 * which extracts the PRF output from the credential for you.
 */
export async function deriveVrfKeypairFromRawPrf(
  ctx: VrfWorkerManagerHandlerContext,
  args: {
    prfOutput: string;
    nearAccountId: AccountId;
    vrfInputData?: VRFInputData;
    saveInMemory?: boolean;
  }
): Promise<{
  vrfPublicKey: string;
  vrfChallenge: VRFChallenge | null;
  encryptedVrfKeypair: EncryptedVRFKeypair;
  serverEncryptedVrfKeypair: ServerEncryptedVrfKeypair | null;
}> {
  return deriveVrfKeypairFromPrfOutput(ctx, {
    prfOutput: args.prfOutput,
    nearAccountId: args.nearAccountId,
    vrfInputData: args.vrfInputData,
    saveInMemory: args.saveInMemory,
  });
}

async function deriveVrfKeypairFromPrfOutput(
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
