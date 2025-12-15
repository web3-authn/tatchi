import type { AccountId } from '../../../types/accountIds';
import type {
  EncryptedVRFKeypair,
  ServerEncryptedVrfKeypair,
  VRFInputData,
} from '../../../types/vrf-worker';
import type { VRFChallenge } from '../../../types/vrf-worker';
import type { WebAuthnAuthenticationCredential } from '../../../types/webauthn';
import { extractPrfFromCredential } from '../../credentialsHelpers';
import type { VrfWorkerManagerHandlerContext } from './types';
import { deriveVrfKeypairFromPrfOutput } from './deriveVrfKeypairFromPrfOutput';

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
