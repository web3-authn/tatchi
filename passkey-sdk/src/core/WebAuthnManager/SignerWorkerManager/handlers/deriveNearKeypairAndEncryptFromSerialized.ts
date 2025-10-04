import { SignedTransaction } from '../../../NearClient';
import type { EncryptedKeyData } from '../../../IndexedDBManager/passkeyNearKeysDB';
import type { AuthenticatorOptions } from '../../../types/authenticatorOptions';
import {
  WorkerRequestType,
  isDeriveNearKeypairAndEncryptSuccess,
} from '../../../types/signer-worker';
import { AccountId, toAccountId } from "../../../types/accountIds";
import { getDeviceNumberForAccount } from '../getDeviceNumber';
import { SignerWorkerManagerContext } from '..';
import type { WebAuthnRegistrationCredential } from '@/core/types/webauthn';
import type { VRFChallenge } from '../../../types/vrf-worker';
import { toEnumUserVerificationPolicy } from '../../../types/authenticatorOptions';
import { toError } from '@/utils/errors';

function logPrfSupportHint(ua: string, hasFirst: boolean, hasSecond: boolean) {
  try {
    const missing = !hasFirst || !hasSecond;
    if (!missing) return;
    const note = [
      '[PRF] Compatibility hint (non-authoritative):',
      '- PRF is an optional WebAuthn extension and some mobile engines omit PRF results on create().',
      '- Desktop Chrome (recent) and macOS Safari (recent) typically return PRF results; iOS engines may omit them.',
      '- We rely on runtime feature detection rather than user agent checks.',
      '- See docs/mobile-registration-errors.md for mitigations.'
    ].join(' ');
    // Single consolidated line to keep devtools logs tidy
    console.warn(`${note} UA=${ua}`);
  } catch {}
}

/**
 * Derive NEAR keypair and encrypt it from a serialized WebAuthn registration credential
 * (shape compatible with SerializedRegistrationCredential from WASM) by extracting PRF outputs from it.
 */
export async function deriveNearKeypairAndEncryptFromSerialized({
  ctx,
  credential,
  nearAccountId,
  options,
}: {
  ctx: SignerWorkerManagerContext,
  credential: WebAuthnRegistrationCredential;
  nearAccountId: AccountId,
  options?: {
    vrfChallenge?: VRFChallenge;
    deterministicVrfPublicKey?: string;
    contractId?: string;
    nonce?: string;
    blockHash?: string;
    authenticatorOptions?: AuthenticatorOptions;
    deviceNumber?: number;
  }
}): Promise<{
  success: boolean;
  nearAccountId: AccountId;
  publicKey: string;
  signedTransaction?: SignedTransaction;
}> {
  try {
    const first = credential?.clientExtensionResults?.prf?.results?.first as string | undefined;
    const second = credential?.clientExtensionResults?.prf?.results?.second as string | undefined;
    const hasFirst = typeof first === 'string' && first.length > 0;
    const hasSecond = typeof second === 'string' && second.length > 0;
    // Log PRF presence to help diagnose mobile engines that omit PRF on create()
    try {
      const ua = (typeof navigator !== 'undefined' ? navigator.userAgent : 'server');
      console.debug('[deriveNearKeypairAndEncryptFromSerialized] PRF presence', { hasFirst, hasSecond, ua });
      logPrfSupportHint(ua, hasFirst, hasSecond);
    } catch {}
    if (!hasFirst || !hasSecond) {
      throw new Error('PRF outputs missing from serialized credential');
    }

    const response = await ctx.sendMessage<WorkerRequestType.DeriveNearKeypairAndEncrypt>({
      message: {
        type: WorkerRequestType.DeriveNearKeypairAndEncrypt,
        payload: {
          dualPrfOutputs: { chacha20PrfOutput: first, ed25519PrfOutput: second },
          nearAccountId: nearAccountId,
          credential,
          registrationTransaction: (options?.vrfChallenge && options?.contractId && options?.nonce && options?.blockHash && options?.deterministicVrfPublicKey) ? {
            vrfChallenge: options.vrfChallenge,
            contractId: options.contractId,
            nonce: options.nonce,
            blockHash: options.blockHash,
            deterministicVrfPublicKey: options.deterministicVrfPublicKey,
          } : undefined,
          authenticatorOptions: options?.authenticatorOptions ? {
            userVerification: toEnumUserVerificationPolicy(options.authenticatorOptions.userVerification),
            originPolicy: options.authenticatorOptions.originPolicy,
          } : undefined
        }
      }
    });

    if (!isDeriveNearKeypairAndEncryptSuccess(response)) {
      throw new Error('Dual PRF registration (from serialized) failed');
    }

    const wasmResult = response.payload;
    // Prefer explicitly provided deviceNumber, else derive from IndexedDB state
    const deviceNumber = (typeof options?.deviceNumber === 'number')
      ? options!.deviceNumber!
      : await getDeviceNumberForAccount(ctx, nearAccountId);
    const keyData: EncryptedKeyData = {
      nearAccountId: nearAccountId,
      deviceNumber,
      encryptedData: wasmResult.encryptedData,
      iv: wasmResult.iv,
      timestamp: Date.now()
    };
    await ctx.indexedDB.nearKeysDB.storeEncryptedKey(keyData);

    let signedTransaction: SignedTransaction | undefined = undefined;
    if (wasmResult.signedTransaction) {
      signedTransaction = new SignedTransaction({
        transaction: wasmResult.signedTransaction.transaction,
        signature: wasmResult.signedTransaction.signature,
        borsh_bytes: Array.from(wasmResult.signedTransaction.borshBytes || [])
      });
    }

    return {
      success: true,
      nearAccountId: toAccountId(wasmResult.nearAccountId),
      publicKey: wasmResult.publicKey,
      signedTransaction
    };
  } catch (error: unknown) {
    console.error('WebAuthnManager: deriveNearKeypairAndEncryptFromSerialized error:', error);
    return {
      success: false,
      nearAccountId,
      publicKey: ''
    };
  }
}
