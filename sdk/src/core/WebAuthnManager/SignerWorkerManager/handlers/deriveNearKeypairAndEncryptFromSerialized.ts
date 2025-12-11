
import type { EncryptedKeyData } from '../../../IndexedDBManager/passkeyNearKeysDB';
import type { AuthenticatorOptions } from '../../../types/authenticatorOptions';
import {
  WorkerRequestType,
  isDeriveNearKeypairAndEncryptSuccess,
} from '../../../types/signer-worker';
import { AccountId, toAccountId } from "../../../types/accountIds";
import { getLastLoggedInDeviceNumber } from '../getDeviceNumber';
import { SignerWorkerManagerContext } from '..';
import type { WebAuthnRegistrationCredential } from '@/core/types/webauthn';
import { toEnumUserVerificationPolicy } from '../../../types/authenticatorOptions';
import { withSessionId } from './session';

/**
 * Derive NEAR keypair and encrypt it from a serialized WebAuthn registration credential
 * (shape compatible with SerializedRegistrationCredential from WASM) by extracting PRF outputs from it.
 */
export async function deriveNearKeypairAndEncryptFromSerialized({
  ctx,
  credential,
  nearAccountId,
  options,
  sessionId,
}: {
  ctx: SignerWorkerManagerContext,
  credential: WebAuthnRegistrationCredential;
  nearAccountId: AccountId,
  options?: {
    authenticatorOptions?: AuthenticatorOptions;
    deviceNumber?: number;
  };
  sessionId: string;
}): Promise<{
  success: boolean;
  nearAccountId: AccountId;
  publicKey: string;
  iv?: string;
  wrapKeySalt?: string;
  error?: string;
}> {
  try {
    // PRF outputs are now extracted by VRF worker and delivered to signer worker via MessagePort
    // No need to extract or send them through main thread
    if (!sessionId) throw new Error('Missing sessionId for registration WrapKeySeed delivery');

    const response = await ctx.sendMessage<WorkerRequestType.DeriveNearKeypairAndEncrypt>({
      message: {
        type: WorkerRequestType.DeriveNearKeypairAndEncrypt,
        payload: withSessionId({
          nearAccountId: nearAccountId,
          credential,
          authenticatorOptions: options?.authenticatorOptions ? {
            userVerification: toEnumUserVerificationPolicy(options.authenticatorOptions.userVerification),
            originPolicy: options.authenticatorOptions.originPolicy,
          } : undefined,
        }, sessionId)
      },
      sessionId,
    });

    if (!isDeriveNearKeypairAndEncryptSuccess(response)) {
      throw new Error('Dual PRF registration (from serialized) failed');
    }

    const wasmResult = response.payload;
    const version = (wasmResult as any).version ?? 2;
    const wrapKeySaltPersisted = (wasmResult as any).wrapKeySalt;
    // Prefer explicitly provided deviceNumber, else derive from IndexedDB state
    const deviceNumber = (typeof options?.deviceNumber === 'number')
      ? options!.deviceNumber!
      : await getLastLoggedInDeviceNumber(nearAccountId, ctx.indexedDB.clientDB);
    const keyData: EncryptedKeyData = {
      nearAccountId: nearAccountId,
      deviceNumber,
      encryptedData: wasmResult.encryptedData,
      iv: wasmResult.iv,
      wrapKeySalt: wrapKeySaltPersisted,
      version,
      timestamp: Date.now()
    };
    await ctx.indexedDB.nearKeysDB.storeEncryptedKey(keyData);

    return {
      success: true,
      nearAccountId: toAccountId(wasmResult.nearAccountId),
      publicKey: wasmResult.publicKey,
      iv: wasmResult.iv,
      wrapKeySalt: wrapKeySaltPersisted,
    };
  } catch (error: unknown) {
    console.error('WebAuthnManager: deriveNearKeypairAndEncryptFromSerialized error:', error);
    const message = String((error as { message?: unknown })?.message || error || '');
    return {
      success: false,
      nearAccountId,
      publicKey: '',
      error: message
    };
  }
}
