import type { AccountId } from '../../../types/accountIds';
import type {
  VRFWorkerMessage,
  VRFWorkerResponse,
  WasmShamir3PassClientDecryptVrfKeypairRequest
} from '../../../types/vrf-worker';
import type { VrfWorkerManagerHandlerContext } from './types';

/**
 * Shamir 3-pass (client): decrypt/unlock a VRF keypair using a server-protected envelope.
 *
 * On success, the VRF keypair becomes active in the VRF worker and is bound (in TS state) to `nearAccountId`.
 */
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
