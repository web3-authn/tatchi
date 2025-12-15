import type { AccountId } from '../../../types/accountIds';
import type { EncryptedVRFKeypair, ServerEncryptedVrfKeypair, VRFInputData } from '../../../types/vrf-worker';
import type { VRFChallenge } from '../../../types/vrf-worker';
import type { VrfWorkerManagerHandlerContext } from './types';
import { deriveVrfKeypairFromPrfOutput } from './deriveVrfKeypairFromPrfOutput';

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
