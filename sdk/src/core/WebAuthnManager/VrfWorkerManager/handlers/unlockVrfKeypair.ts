import type { AccountId } from '../../../types/accountIds';
import type {
  EncryptedVRFKeypair,
  VRFWorkerMessage,
  VRFWorkerResponse,
  WasmUnlockVrfKeypairRequest,
} from '../../../types/vrf-worker';
import type { WebAuthnAuthenticationCredential } from '../../../types/webauthn';
import type { VrfWorkerManagerHandlerContext } from './types';

/**
 * Unlock/load the VRF keypair into VRF worker memory using a WebAuthn authentication credential.
 *
 * This is the "login" / "unlock" path: the VRF worker decrypts the stored encrypted VRF keypair
 * using PRF output, and keeps it active in-memory for subsequent operations (challenge gen, sessions, etc.).
 */
export async function unlockVrfKeypair(
  ctx: VrfWorkerManagerHandlerContext,
  args: {
    credential: WebAuthnAuthenticationCredential;
    nearAccountId: AccountId;
    encryptedVrfKeypair: EncryptedVRFKeypair;
    onEvent?: (event: { type: string; data: { step: string; message: string } }) => void;
  }
): Promise<VRFWorkerResponse> {
  await ctx.ensureWorkerReady(true);

  args.onEvent?.({
    type: 'loginProgress',
    data: {
      step: 'verifying-server',
      message: 'TouchId success! Unlocking VRF keypair...'
    }
  });

  const message: VRFWorkerMessage<WasmUnlockVrfKeypairRequest> = {
    type: 'UNLOCK_VRF_KEYPAIR',
    id: ctx.generateMessageId(),
    payload: {
      nearAccountId: args.nearAccountId,
      encryptedVrfKeypair: args.encryptedVrfKeypair,
      credential: args.credential,
    }
  };

  const response = await ctx.sendMessage(message);
  if (response.success) {
    // Track the current VRF session account at TypeScript level
    ctx.setCurrentVrfAccountId(args.nearAccountId);
    console.debug(`VRF Manager: VRF keypair unlocked for ${args.nearAccountId}`);
  } else {
    console.error('VRF Manager: Failed to unlock VRF keypair:', response.error);
    console.error('VRF Manager: Full response:', JSON.stringify(response, null, 2));
    console.error('VRF Manager: Message that was sent:', JSON.stringify(message, null, 2));
  }

  return response;
}
