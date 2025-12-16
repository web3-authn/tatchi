import { base64UrlDecode } from '../../../../utils';
import type { EncryptedKeyData } from '../../../IndexedDBManager/passkeyNearKeysDB';
import {
  WorkerRequestType,
  isRegisterDevice2WithDerivedKeySuccess,
} from '../../../types/signer-worker';
import { AccountId, toAccountId } from "../../../types/accountIds";
import { SignerWorkerManagerContext } from '..';
import type { WebAuthnRegistrationCredential } from '@/core/types/webauthn';
import type { VRFChallenge } from '../../../types/vrf-worker';
import type { TransactionContext } from '../../../types/rpc';
import { withSessionId } from './session';
import { UserVerificationPolicy, toEnumUserVerificationPolicy } from '../../../types/authenticatorOptions';

/**
 * Combined Device2 registration flow: derive NEAR keypair + sign registration transaction
 * in a single operation without requiring a separate authentication prompt.
 *
 * This handler orchestrates:
 * 1. Retrieving PRF.second and WrapKeySeed from session storage (delivered via MessagePort)
 * 2. Deriving NEAR ed25519 keypair from PRF.second
 * 3. Encrypting the NEAR private key with KEK (derived from WrapKeySeed + wrapKeySalt)
 * 4. Building the Device2 registration transaction (`link_device_register_user`)
 * 5. Signing the transaction with the derived NEAR keypair
 * 6. Storing encrypted key data in IndexedDB
 *
 * Security: PRF.second and WrapKeySeed never traverse the main thread - they're delivered
 * directly from VRF worker to Signer worker via MessagePort.
 */
export async function registerDevice2WithDerivedKey({
  ctx,
  sessionId,
  nearAccountId,
  credential,
  vrfChallenge,
  transactionContext,
  contractId,
  wrapKeySalt,
  deviceNumber,
  deterministicVrfPublicKey,
}: {
  ctx: SignerWorkerManagerContext;
  sessionId: string;
  nearAccountId: AccountId;
  credential: WebAuthnRegistrationCredential;
  vrfChallenge: VRFChallenge;
  transactionContext: TransactionContext;
  contractId: string;
  wrapKeySalt: string;
  deviceNumber?: number;
  deterministicVrfPublicKey?: string;
}): Promise<{
  success: boolean;
  publicKey: string;
  signedTransaction: any;
  wrapKeySalt: string;
  encryptedData?: string;
  /**
   * Base64url-encoded AEAD nonce (ChaCha20-Poly1305) for the encrypted private key.
   */
  chacha20NonceB64u?: string;
  /**
   * @deprecated Use `chacha20NonceB64u`.
   */
  iv?: string;
  error?: string;
}> {
  try {
    if (!sessionId) {
      throw new Error('Missing sessionId for Device2 registration');
    }

    console.debug('[SignerWorkerManager] Starting Device2 combined registration', {
      nearAccountId,
      sessionId,
      deviceNumber,
    });

    // Helper to convert base64url string to byte array (number[])
    const b64ToBytes = (s: string | undefined): number[] => {
      if (!s) return [];
      return Array.from(base64UrlDecode(s));
    };
    // Construct contractArgs in TypeScript and use JSON.stringify() here.
    // This is native to JS, extremely fast, and means the Rust worker just receives a "dumb" string that it can blindly convert to bytes
    const finalContractArgs = {
      vrf_data: {
        vrf_input_data: b64ToBytes(vrfChallenge.vrfInput),
        vrf_output: b64ToBytes(vrfChallenge.vrfOutput),
        vrf_proof: b64ToBytes(vrfChallenge.vrfProof),
        public_key: b64ToBytes(vrfChallenge.vrfPublicKey),
        user_id: vrfChallenge.userId,
        rp_id: vrfChallenge.rpId,
        block_height: Number(vrfChallenge.blockHeight),
        block_hash: b64ToBytes(vrfChallenge.blockHash),
      },
      webauthn_registration: credential,
      deterministic_vrf_public_key: b64ToBytes(deterministicVrfPublicKey),
      authenticator_options: {
        userVerification: toEnumUserVerificationPolicy(UserVerificationPolicy.Preferred),
        originPolicy: {
          single: undefined,
          all_subdomains: true,
          multiple: undefined,
        },
      },
    };

    // Build request payload for combined Device2 registration
    const response = await ctx.sendMessage<WorkerRequestType.RegisterDevice2WithDerivedKey>({
      message: {
        type: WorkerRequestType.RegisterDevice2WithDerivedKey,
        payload: withSessionId(sessionId, {
          credential,
          nearAccountId,
          transactionContext: {
            txBlockHash: transactionContext.txBlockHash,
            txBlockHeight: transactionContext.txBlockHeight,
            baseNonce: transactionContext.nextNonce,
          },
          contractId,
          contractArgsJson: JSON.stringify(finalContractArgs),
        }),
      },
      sessionId,
    });

    if (!isRegisterDevice2WithDerivedKeySuccess(response)) {
      throw new Error('Device2 combined registration failed');
    }

    const wasmResult = response.payload;

    console.debug('[SignerWorkerManager] Device2 registration complete, storing encrypted key');

    // Store encrypted NEAR key in IndexedDB
    const chacha20NonceB64u = wasmResult.chacha20NonceB64u || wasmResult.iv || '';
    const keyData: EncryptedKeyData = {
      nearAccountId,
      deviceNumber: deviceNumber ?? 2, // Default to device 2
      encryptedData: wasmResult.encryptedData,
      chacha20NonceB64u,
      wrapKeySalt: wasmResult.wrapKeySalt,
      version: 2,
      timestamp: Date.now(),
    };
    await ctx.indexedDB.nearKeysDB.storeEncryptedKey(keyData);

    console.debug('[SignerWorkerManager] Device2 encrypted key stored successfully');

    return {
      success: true,
      publicKey: wasmResult.publicKey,
      signedTransaction: wasmResult.signedTransaction,
      wrapKeySalt: wasmResult.wrapKeySalt,
      encryptedData: wasmResult.encryptedData,
      chacha20NonceB64u,
      iv: chacha20NonceB64u,
    };
  } catch (error: unknown) {
    console.error('[SignerWorkerManager] registerDevice2WithDerivedKey error:', error);
    const message = String((error as { message?: unknown })?.message || error || '');
    return {
      success: false,
      publicKey: '',
      signedTransaction: null,
      wrapKeySalt: '',
      error: message,
    };
  }
}
