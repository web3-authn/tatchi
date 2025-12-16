
import { WorkerRequestType, isSignNep413MessageSuccess } from '../../../types/signer-worker';
import { getLastLoggedInDeviceNumber } from '../getDeviceNumber';
import { SignerWorkerManagerContext } from '..';
import { isObject } from '../../../WalletIframe/validation';
import { withSessionId } from './session';
import { generateSessionId } from '../sessionHandshake.js';
import { toEncryptedPrivateKeyCiphertext } from './encryptedPrivateKey';

/**
 * Sign a NEP-413 message using the user's passkey-derived private key
 *
 * @param payload - NEP-413 signing parameters including message, recipient, nonce, and state
 * @returns Promise resolving to signing result with account ID, public key, and signature
 */
export async function signNep413Message({ ctx, payload }: {
  ctx: SignerWorkerManagerContext;
  payload: {
    message: string;
    recipient: string;
    nonce: string;
    state: string | null;
    accountId: string;
    sessionId?: string;
    contractId?: string;
    nearRpcUrl?: string;
  };
}): Promise<{
  success: boolean;
  accountId: string;
  publicKey: string;
  signature: string;
  state?: string;
  error?: string;
}> {
  try {
    const deviceNumber = await getLastLoggedInDeviceNumber(payload.accountId, ctx.indexedDB.clientDB);
    const encryptedKeyData = await ctx.indexedDB.nearKeysDB.getEncryptedKey(payload.accountId, deviceNumber);
    if (!encryptedKeyData) {
      throw new Error(`No encrypted key found for account: ${payload.accountId}`);
    }

    // Expect caller (SignerWorkerManager) to reserve a session and wire ports; just use provided sessionId
    const sessionId = payload.sessionId ?? generateSessionId();

    if (!ctx.vrfWorkerManager) {
      throw new Error('VrfWorkerManager not available for NEP-413 signing');
    }

    await ctx.vrfWorkerManager.confirmAndPrepareSigningSession({
      ctx,
      sessionId,
      kind: 'nep413',
      nearAccountId: payload.accountId,
      message: payload.message,
      recipient: payload.recipient,
      contractId: payload.contractId,
      nearRpcUrl: payload.nearRpcUrl,
    });

    const response = await ctx.sendMessage<WorkerRequestType.SignNep413Message>({
      message: {
        type: WorkerRequestType.SignNep413Message,
        payload: withSessionId(sessionId, {
          message: payload.message,
          recipient: payload.recipient,
          nonce: payload.nonce,
          state: payload.state || undefined,
          accountId: payload.accountId,
          ...toEncryptedPrivateKeyCiphertext(encryptedKeyData),
        })
      },
      sessionId,
    });

    if (!isSignNep413MessageSuccess(response)) {
      console.error('SignerWorkerManager: NEP-413 signing failed:', response);
      const payloadError = isObject(response?.payload) && (response as any)?.payload?.error;
      throw new Error(payloadError || 'NEP-413 signing failed');
    }

    return {
      success: true,
      accountId: response.payload.accountId,
      publicKey: response.payload.publicKey,
      signature: response.payload.signature,
      state: response.payload.state || undefined
    };

  } catch (error: unknown) {
    console.error('SignerWorkerManager: NEP-413 signing error:', error);
    return {
      success: false,
      accountId: '',
      publicKey: '',
      signature: '',
      error: (error && typeof (error as { message?: unknown }).message === 'string')
        ? (error as { message: string }).message
        : 'Unknown error'
    };
  }
}
