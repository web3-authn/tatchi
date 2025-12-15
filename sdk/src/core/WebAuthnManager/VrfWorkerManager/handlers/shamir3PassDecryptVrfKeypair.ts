import type { AccountId } from '../../../types/accountIds';
import type {
  VRFWorkerMessage,
  VRFWorkerResponse,
  WasmShamir3PassClientDecryptVrfKeypairRequest
} from '../../../types/vrf-worker';
import type { VrfWorkerManagerHandlerContext } from './types';

export async function shamir3PassDecryptVrfKeypair(
  ctx: VrfWorkerManagerHandlerContext,
  args: {
    nearAccountId: AccountId;
    kek_s_b64u: string;
    ciphertextVrfB64u: string;
    serverKeyId: string;
  }
): Promise<VRFWorkerResponse> {
  await ctx.ensureWorkerReady(true);
  const message: VRFWorkerMessage<WasmShamir3PassClientDecryptVrfKeypairRequest> = {
    type: 'SHAMIR3PASS_CLIENT_DECRYPT_VRF_KEYPAIR',
    id: ctx.generateMessageId(),
    payload: {
      nearAccountId: args.nearAccountId,
      kek_s_b64u: args.kek_s_b64u,
      ciphertextVrfB64u: args.ciphertextVrfB64u,
      // Required key for server selection
      keyId: args.serverKeyId,
    },
  };
  const response = await ctx.sendMessage(message);
  if (response.success) {
    ctx.setCurrentVrfAccountId(args.nearAccountId);
  }
  return response;
}

