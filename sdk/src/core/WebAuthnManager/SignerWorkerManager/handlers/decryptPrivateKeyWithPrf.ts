
import { ClientAuthenticatorData } from '../../../IndexedDBManager';
import {
  WorkerRequestType,
  isDecryptPrivateKeyWithPrfSuccess,
} from '../../../types/signer-worker';
import { AccountId, toAccountId } from "../../../types/accountIds";

import { SignerWorkerManagerContext } from '..';
import { getLastLoggedInDeviceNumber } from '../getDeviceNumber';
import { isObject } from '@/utils/validation';
import { withSessionId } from './session';

export async function decryptPrivateKeyWithPrf({
  ctx,
  nearAccountId,
  authenticators,
  sessionId,
}: {
  ctx: SignerWorkerManagerContext,
  nearAccountId: AccountId,
  authenticators: ClientAuthenticatorData[],
  sessionId: string,
}): Promise<{ decryptedPrivateKey: string; nearAccountId: AccountId }> {
  try {
    console.info('WebAuthnManager: Starting private key decryption with dual PRF (local operation)');
    // Retrieve encrypted key data from IndexedDB in main thread
    const deviceNumber = await getLastLoggedInDeviceNumber(nearAccountId, ctx.indexedDB.clientDB);
    const keyMaterial = await ctx.indexedDB.nearKeysDB.getLocalKeyMaterial(nearAccountId, deviceNumber);
    if (!keyMaterial) {
      throw new Error(`No key material found for account: ${nearAccountId}`);
    }

    const response = await ctx.sendMessage({
      sessionId,
      message: {
        type: WorkerRequestType.DecryptPrivateKeyWithPrf,
        payload: withSessionId(sessionId, {
          nearAccountId: nearAccountId,
          encryptedPrivateKeyData: keyMaterial.encryptedSk,
          encryptedPrivateKeyChacha20NonceB64u: keyMaterial.chacha20NonceB64u,
        })
      },
    });

    if (!isDecryptPrivateKeyWithPrfSuccess(response)) {
      console.error('WebAuthnManager: Dual PRF private key decryption failed:', response);
      const payloadError = isObject(response?.payload) && (response as any)?.payload?.error;
      throw new Error(payloadError || 'Private key decryption failed');
    }
    return {
      decryptedPrivateKey: response.payload.privateKey,
      nearAccountId: toAccountId(response.payload.nearAccountId)
    };
  } catch (error: unknown) {
    console.error('WebAuthnManager: Dual PRF private key decryption error:', error);
    throw error;
  }
}
