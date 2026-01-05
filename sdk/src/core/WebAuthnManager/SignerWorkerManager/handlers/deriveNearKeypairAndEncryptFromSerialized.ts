
import type { LocalNearSkV3Material } from '../../../IndexedDBManager/passkeyNearKeysDB';
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
  /**
   * Base64url-encoded AEAD nonce (ChaCha20-Poly1305) for the encrypted private key.
   */
  chacha20NonceB64u?: string;
  wrapKeySalt?: string;
  error?: string;
}> {
  try {
    // PRF outputs are now extracted by VRF worker and delivered to signer worker via MessagePort
    // No need to extract or send them through main thread
    if (!sessionId) throw new Error('Missing sessionId for registration WrapKeySeed delivery');

    const response = await ctx.sendMessage<WorkerRequestType.DeriveNearKeypairAndEncrypt>({
      sessionId,
      message: {
        type: WorkerRequestType.DeriveNearKeypairAndEncrypt,
        payload: withSessionId(sessionId, {
          nearAccountId: nearAccountId,
          credential,
          authenticatorOptions: options?.authenticatorOptions ? {
            userVerification: toEnumUserVerificationPolicy(options.authenticatorOptions.userVerification),
            originPolicy: options.authenticatorOptions.originPolicy,
          } : undefined,
        })
      },
    });

    if (!isDeriveNearKeypairAndEncryptSuccess(response)) {
      throw new Error('Dual PRF registration (from serialized) failed');
    }

    const wasmResult = response.payload;
    const wrapKeySaltPersisted = wasmResult.wrapKeySalt;
    if (!wrapKeySaltPersisted) {
      throw new Error('Missing wrapKeySalt in deriveNearKeypairAndEncrypt result');
    }
    // Prefer explicitly provided deviceNumber, else derive from IndexedDB state
    const deviceNumber = (typeof options?.deviceNumber === 'number')
      ? options!.deviceNumber!
      : await getLastLoggedInDeviceNumber(nearAccountId, ctx.indexedDB.clientDB);
    const chacha20NonceB64u = wasmResult.chacha20NonceB64u;
    if (!chacha20NonceB64u) {
      throw new Error('Missing chacha20NonceB64u in deriveNearKeypairAndEncrypt result');
    }
    const keyMaterial: LocalNearSkV3Material = {
      kind: 'local_near_sk_v3',
      nearAccountId,
      deviceNumber,
      publicKey: wasmResult.publicKey,
      encryptedSk: wasmResult.encryptedData,
      chacha20NonceB64u,
      wrapKeySalt: wrapKeySaltPersisted,
      timestamp: Date.now(),
    };
    await ctx.indexedDB.nearKeysDB.storeKeyMaterial(keyMaterial);

    return {
      success: true,
      nearAccountId: toAccountId(wasmResult.nearAccountId),
      publicKey: wasmResult.publicKey,
      chacha20NonceB64u,
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
