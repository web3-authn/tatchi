import { SignedTransaction } from '../../../NearClient';
import type { EncryptedKeyData } from '../../../IndexedDBManager/passkeyNearKeysDB';
import type { AuthenticatorOptions } from '../../../types/authenticatorOptions';
import {
  WorkerRequestType,
  isDeriveNearKeypairAndEncryptSuccess,
} from '../../../types/signer-worker';
import { AccountId, toAccountId } from "../../../types/accountIds";
import { SignerWorkerManagerContext } from '..';

/**
 * Same as deriveNearKeypairAndEncrypt, but takes a serialized WebAuthn registration credential
 * (shape compatible with SerializedRegistrationCredential from WASM) and extracts PRF outputs from it.
 */
export async function deriveNearKeypairAndEncryptFromSerialized({
  ctx,
  credential,
  nearAccountId,
  options,
}: {
  ctx: SignerWorkerManagerContext,
  credential: any; // SerializedRegistrationCredential
  nearAccountId: AccountId,
  options?: {
    vrfChallenge?: any;
    deterministicVrfPublicKey?: string;
    contractId?: string;
    nonce?: string;
    blockHash?: string;
    authenticatorOptions?: AuthenticatorOptions;
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
    if (!first || !second) {
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
            userVerification: (options.authenticatorOptions as any)?.userVerification,
            originPolicy: options.authenticatorOptions.originPolicy,
          } : undefined
        } as any
      }
    });

    if (!isDeriveNearKeypairAndEncryptSuccess(response)) {
      throw new Error('Dual PRF registration (from serialized) failed');
    }

    const wasmResult = response.payload;
    const deviceNumber = 1; // fallback; storage API determines actual device number later where applicable
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
  } catch (error: any) {
    console.error('WebAuthnManager: deriveNearKeypairAndEncryptFromSerialized error:', error);
    return {
      success: false,
      nearAccountId,
      publicKey: ''
    };
  }
}

