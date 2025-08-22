
import { ClientAuthenticatorData } from '../../../IndexedDBManager';
import { TouchIdPrompt } from "../../touchIdPrompt";
import {
  WorkerRequestType,
  isDecryptPrivateKeyWithPrfSuccess,
} from '../../../types/signer-worker';
import { extractPrfFromCredential } from '../../credentialsHelpers';
import { AccountId, toAccountId } from "../../../types/accountIds";

import { SignerWorkerManagerContext } from '..';


export async function decryptPrivateKeyWithPrf({
  ctx,
  nearAccountId,
  authenticators,
}: {
  ctx: SignerWorkerManagerContext,
  nearAccountId: AccountId,
  authenticators: ClientAuthenticatorData[],
}): Promise<{ decryptedPrivateKey: string; nearAccountId: AccountId }> {
  try {
    console.info('WebAuthnManager: Starting private key decryption with dual PRF (local operation)');
    // Retrieve encrypted key data from IndexedDB in main thread
    const encryptedKeyData = await ctx.nearKeysDB.getEncryptedKey(nearAccountId);
    if (!encryptedKeyData) {
      throw new Error(`No encrypted key found for account: ${nearAccountId}`);
    }

    // For private key export, no VRF challenge is needed.
    // we can use local random challenge for WebAuthn authentication.
    // Security comes from device possession + biometrics, not challenge validation
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    // TouchID prompt
    const credential = await ctx.touchIdPrompt.getCredentials({
      nearAccountId,
      challenge,
      authenticators,
    });

    // Extract dual PRF outputs and use the AES one for decryption
    const dualPrfOutputs = extractPrfFromCredential({
      credential,
      firstPrfOutput: true,
      secondPrfOutput: false,
    });
    console.debug('WebAuthnManager: Extracted ChaCha20 PRF output for decryption');

    const response = await ctx.sendMessage({
      message: {
        type: WorkerRequestType.DecryptPrivateKeyWithPrf,
        payload: {
          nearAccountId: nearAccountId,
          chacha20PrfOutput: dualPrfOutputs.chacha20PrfOutput, // Use ChaCha20 PRF output for decryption
          encryptedPrivateKeyData: encryptedKeyData.encryptedData,
          encryptedPrivateKeyIv: encryptedKeyData.iv
        }
      }
    });

    if (!isDecryptPrivateKeyWithPrfSuccess(response)) {
      console.error('WebAuthnManager: Dual PRF private key decryption failed:', response);
      throw new Error('Private key decryption failed');
    }
    return {
      decryptedPrivateKey: response.payload.privateKey,
      nearAccountId: toAccountId(response.payload.nearAccountId)
    };
  } catch (error: any) {
    console.error('WebAuthnManager: Dual PRF private key decryption error:', error);
    throw error;
  }
}