import type { VRFWorkerMessage, WasmVrfWorkerRequestType } from '../../../types/vrf-worker';
import type { VrfWorkerManagerHandlerContext } from './types';

export async function shamir3PassEncryptCurrentVrfKeypair(
  ctx: VrfWorkerManagerHandlerContext,
): Promise<{
  ciphertextVrfB64u: string;
  kek_s_b64u: string;
  serverKeyId: string;
}> {
  await ctx.ensureWorkerReady(true);
  const message: VRFWorkerMessage<WasmVrfWorkerRequestType> = {
    type: 'SHAMIR3PASS_CLIENT_ENCRYPT_CURRENT_VRF_KEYPAIR',
    id: ctx.generateMessageId(),
    payload: {} as WasmVrfWorkerRequestType,
  };
  const response = await ctx.sendMessage(message);
  if (!response.success || !response.data) {
    throw new Error(`VRF encrypt-current failed: ${response.error}`);
  }
  const { ciphertextVrfB64u, kek_s_b64u, serverKeyId } = response.data as {
    ciphertextVrfB64u: string;
    kek_s_b64u: string;
    serverKeyId: string;
  };
  if (!ciphertextVrfB64u || !kek_s_b64u) {
    throw new Error('Invalid encrypt-current response');
  }
  if (!serverKeyId) {
    throw new Error('Server did not return keyId from apply-server-lock');
  }
  return { ciphertextVrfB64u, kek_s_b64u, serverKeyId };
}

