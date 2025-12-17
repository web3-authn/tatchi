import type { AccountId } from '../../../types/accountIds';
import type { EncryptedVRFKeypair, VRFWorkerMessage } from '../../../types/vrf-worker';
import type { VrfWorkerManagerHandlerContext } from './types';

/**
 * Prepare an export/decrypt session by having the VRF worker derive and deliver WrapKeySeed
 * to the signer worker, using the VRF-owned confirmation flow.
 *
 * This is used by "offline export" / decrypt flows where secrets must not touch the main thread.
 */
export async function prepareDecryptSession(
  ctx: VrfWorkerManagerHandlerContext,
  args: {
    sessionId: string;
    nearAccountId: AccountId;
    wrapKeySalt: string;
    /**
     * Optional: local encrypted VRF keypair for this account/device.
     * Supplying this lets the VRF worker unlock the correct VRF secret in offline mode.
     */
    encryptedVrfKeypair?: EncryptedVRFKeypair;
    /**
     * Optional: expected VRF public key (base64url) for sanity checking/fallback derivation.
     */
    expectedVrfPublicKey?: string;
  }
): Promise<void> {
  if (!args.wrapKeySalt) {
    throw new Error('wrapKeySalt is required for decrypt session');
  }
  await ctx.ensureWorkerReady(true);
  const message: VRFWorkerMessage<any> = {
    type: 'DECRYPT_SESSION',
    id: ctx.generateMessageId(),
    payload: {
      sessionId: args.sessionId,
      nearAccountId: String(args.nearAccountId),
      wrapKeySalt: args.wrapKeySalt,
      encryptedVrfKeypair: args.encryptedVrfKeypair,
      expectedVrfPublicKey: args.expectedVrfPublicKey,
    },
  };
  try {
    console.debug('[VRF] prepareDecryptSession: start', {
      sessionId: args.sessionId,
      nearAccountId: String(args.nearAccountId),
    });
    const response = await ctx.sendMessage(message);
    if (!response.success) {
      console.error('[VRF] prepareDecryptSession: worker reported failure', {
        sessionId: args.sessionId,
        nearAccountId: String(args.nearAccountId),
        error: response.error,
      });
      throw new Error(`prepareDecryptSession failed: ${response.error}`);
    }
    console.debug('[VRF] prepareDecryptSession: success', {
      sessionId: args.sessionId,
      nearAccountId: String(args.nearAccountId),
    });
  } catch (error) {
    console.error('[VRF] prepareDecryptSession: error', {
      sessionId: args.sessionId,
      nearAccountId: String(args.nearAccountId),
      error,
    });
    throw error;
  }
}
