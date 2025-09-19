
import { SignedTransaction } from '../../../NearClient';
import type { EncryptedKeyData } from '../../../IndexedDBManager/passkeyNearKeysDB';
import type { AuthenticatorOptions } from '../../../types/authenticatorOptions';
import {
  WorkerRequestType,
  isDeriveNearKeypairAndEncryptSuccess,
} from '../../../types/signer-worker';
import { toEnumUserVerificationPolicy } from '../../../types/authenticatorOptions';
import { serializeRegistrationCredentialWithPRF, type DualPrfOutputs } from '../../credentialsHelpers';
import { AccountId, toAccountId } from "../../../types/accountIds";
import { VRFChallenge } from '../../../types/vrf-worker';
import { SignerWorkerManagerContext } from '..';
import { getDeviceNumberForAccount } from '../getDeviceNumber';

/**
 * Secure registration flow with dual PRF: WebAuthn + WASM worker encryption using dual PRF
 * Optionally signs a link_device_register_user transaction if VRF data is provided
 */
export async function deriveNearKeypairAndEncrypt({
  ctx,
  credential,
  nearAccountId,
  options,
}: {
  ctx: SignerWorkerManagerContext,
  credential: PublicKeyCredential,
  nearAccountId: AccountId,
  options?: {
    vrfChallenge: VRFChallenge;
    deterministicVrfPublicKey: string; // Add VRF public key for registration transactions
    contractId: string;
    nonce: string;
    blockHash: string;
    authenticatorOptions?: AuthenticatorOptions; // Authenticator options for registration
  }
}): Promise<{
  success: boolean;
  nearAccountId: AccountId;
  publicKey: string;
  signedTransaction?: SignedTransaction;
}> {
  try {
    console.info('WebAuthnManager: Starting secure registration with dual PRF using deterministic derivation');

    const registrationCredential = serializeRegistrationCredentialWithPRF({
      credential,
      firstPrfOutput: true,
      secondPrfOutput: true, // only for deriving NEAR keys
    });

    // Extract dual PRF outputs from credential (same as decryption phase)
    if (!registrationCredential.clientExtensionResults?.prf?.results?.first) {
      throw new Error('First PRF output missing from serialized credential');
    }
    if (!registrationCredential.clientExtensionResults?.prf?.results?.second) {
      throw new Error('Second PRF output missing from serialized credential');
    }

    const dualPrfOutputs: DualPrfOutputs = {
      chacha20PrfOutput: registrationCredential.clientExtensionResults.prf.results.first,
      ed25519PrfOutput: registrationCredential.clientExtensionResults.prf.results.second,
    };

    // Use generic sendMessage with specific request type for better type safety
    const response = await ctx.sendMessage<WorkerRequestType.DeriveNearKeypairAndEncrypt>({
      message: {
        type: WorkerRequestType.DeriveNearKeypairAndEncrypt,
        payload: {
          dualPrfOutputs: dualPrfOutputs,
          nearAccountId: nearAccountId,
          credential: registrationCredential,
          // Optional device linking registration transaction
          registrationTransaction: (options?.vrfChallenge && options?.contractId && options?.nonce && options?.blockHash) ? {
            vrfChallenge: options.vrfChallenge,
            contractId: options.contractId,
            nonce: options.nonce,
            blockHash: options.blockHash,
            // Pass VRF public key to WASM worker (device number determined by contract)
            deterministicVrfPublicKey: options.deterministicVrfPublicKey,
          } : undefined,
          authenticatorOptions: {
            userVerification: toEnumUserVerificationPolicy(options?.authenticatorOptions?.userVerification),
            originPolicy: options?.authenticatorOptions?.originPolicy,
          }
        }
      }
    });

    // Response is specifically EncryptionSuccessResponse | EncryptionFailureResponse
    if (!isDeriveNearKeypairAndEncryptSuccess(response)) {
      throw new Error('Dual PRF registration failed');
    }

    // response.payload is a WasmEncryptionResult with proper WASM types
    const wasmResult = response.payload;
    // Store the encrypted key in IndexedDB using the manager
    // Determine deviceNumber (default 1 for initial device)
    const deviceNumber = await getDeviceNumberForAccount(ctx, nearAccountId);
    const keyData: EncryptedKeyData = {
      nearAccountId: nearAccountId,
      deviceNumber,
      encryptedData: wasmResult.encryptedData,
      iv: wasmResult.iv,
      timestamp: Date.now()
    };

    await ctx.indexedDB.nearKeysDB.storeEncryptedKey(keyData);

    // Verify storage
    const verified = await ctx.indexedDB.nearKeysDB.verifyKeyStorage(nearAccountId, deviceNumber);
    if (!verified) {
      throw new Error('Key storage verification failed');
    }
    console.info('WebAuthnManager: Encrypted key stored and verified in IndexedDB');

    // Use WASM signed transaction directly - just map borshBytes to borsh_bytes
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
    console.error('WebAuthnManager: Dual PRF registration error:', error);
    return {
      success: false,
      nearAccountId: nearAccountId,
      publicKey: ''
    };
  }
}
