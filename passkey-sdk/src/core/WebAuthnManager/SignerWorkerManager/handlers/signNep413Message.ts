
import { WorkerRequestType, isSignNep413MessageSuccess } from '../../../types/signer-worker';
import { extractPrfFromCredential } from '../../credentialsHelpers';
import { SignerWorkerManagerContext } from '..';


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
    credential: PublicKeyCredential;
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
    const encryptedKeyData = await ctx.indexedDB.nearKeysDB.getEncryptedKey(payload.accountId);

    if (!encryptedKeyData) {
      throw new Error(`No encrypted key found for account: ${payload.accountId}`);
    }

    const { chacha20PrfOutput } = extractPrfFromCredential({
      credential: payload.credential,
      firstPrfOutput: true,
      secondPrfOutput: false,
    });

    const response = await ctx.sendMessage<WorkerRequestType.SignNep413Message>({
      message: {
        type: WorkerRequestType.SignNep413Message,
        payload: {
          message: payload.message,
          recipient: payload.recipient,
          nonce: payload.nonce,
          state: payload.state || undefined,
          accountId: payload.accountId,
          prfOutput: chacha20PrfOutput, // Use ChaCha20 PRF output for decryption
          encryptedPrivateKeyData: encryptedKeyData.encryptedData,
          encryptedPrivateKeyIv: encryptedKeyData.iv
        }
      }
    });

    if (!isSignNep413MessageSuccess(response)) {
      console.error('SignerWorkerManager: NEP-413 signing failed:', response);
      throw new Error('NEP-413 signing failed');
    }

    return {
      success: true,
      accountId: response.payload.accountId,
      publicKey: response.payload.publicKey,
      signature: response.payload.signature,
      state: response.payload.state || undefined
    };

  } catch (error: any) {
    console.error('SignerWorkerManager: NEP-413 signing error:', error);
    return {
      success: false,
      accountId: '',
      publicKey: '',
      signature: '',
      error: error.message || 'Unknown error'
    };
  }
}
