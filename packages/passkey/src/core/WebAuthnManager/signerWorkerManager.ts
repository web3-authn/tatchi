import type { NearClient } from '../NearClient';
import { getNonceBlockHashAndHeight } from "../PasskeyManager/actions";
import { SignedTransaction } from "../NearClient";
import { base58Decode } from '../../utils/encoders';
import {
  WorkerRequestType,
  WorkerResponseType,
  EncryptionResult,
  RecoverKeypairResult,
  RegistrationCheckResult,
  RegistrationResult,
  TransactionSignResult,
  DecryptPrivateKeyResult,
  WasmSignedTransaction,
} from '../../wasm_signer_worker/wasm_signer_worker.js';
import {
  type ActionParams,
  validateActionParams,
  WorkerResponseForRequest,
  isWorkerProgress,
  isWorkerError,
  isWorkerSuccess,
  isDeriveNearKeypairAndEncryptSuccess,
  isDecryptPrivateKeyWithPrfSuccess,
  isCheckCanRegisterUserSuccess,
  isSignVerifyAndRegisterUserSuccess,
  isRecoverKeypairFromPasskeySuccess,
  isExtractCosePublicKeySuccess,
  isSignNep413MessageSuccess,
  WorkerProgressResponse,
  WorkerErrorResponse,
  WasmTransactionSignResult,
} from '../types/signer-worker';
import {
  type WebAuthnAuthenticationCredential,
  type WebAuthnRegistrationCredential,
} from '../types/webauthn';
import {
  extractPrfFromCredential,
  serializeCredentialWithPRF,
  type DualPrfOutputs,
} from './credentialsHelpers';
import { ClientAuthenticatorData } from '../IndexedDBManager';
import { PasskeyNearKeysDBManager, type EncryptedKeyData } from '../IndexedDBManager/passkeyNearKeysDB';
import { TouchIdPrompt } from "./touchIdPrompt";
import { VRFChallenge } from '../types/vrf-worker';
import type { onProgressEvents } from '../types/passkeyManager';
import { AccountId, toAccountId } from "../types/accountIds";
import { SIGNER_WORKER_MANAGER_CONFIG } from "../../config";
import type { AuthenticatorOptions } from '../types/authenticatorOptions';

// === IMPORT AUTO-GENERATED WASM TYPES ===
// WASM-generated types now correctly match runtime data with js_name attributes
import * as wasmModule from '../../wasm_signer_worker/wasm_signer_worker.js';

/**
 * WebAuthnWorkers handles PRF, workers, and COSE operations
 *
 * Note: Challenge store removed as VRF provides cryptographic freshness
 * without needing centralized challenge management
 */
export class SignerWorkerManager {

  private nearKeysDB: PasskeyNearKeysDBManager;

  constructor() {
    this.nearKeysDB = new PasskeyNearKeysDBManager();
  }

  createSecureWorker(): Worker {
    // Simple path resolution - build:all copies worker files to /workers/
    const workerUrl = new URL(SIGNER_WORKER_MANAGER_CONFIG.WORKER.URL, window.location.origin);
    console.debug('Creating secure worker from:', workerUrl.href);

    try {
      const worker = new Worker(workerUrl, {
        type: SIGNER_WORKER_MANAGER_CONFIG.WORKER.TYPE,
        name: SIGNER_WORKER_MANAGER_CONFIG.WORKER.NAME
      });

      // Add error handling
      worker.onerror = (event) => {
        console.error('Worker error:', event);
      };

      return worker;
    } catch (error) {
      console.error('Failed to create worker:', error);
      throw new Error(`Failed to create secure worker: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * === EXECUTE WORKER OPERATION METHOD ===
   * Execute worker operation with optional progress updates (handles both single and multiple response patterns)
   *
   * FEATURES:
   * - Single-response operations (traditional request-response)
   * - Multi-response operations with progress updates (streaming SSE-like pattern)
   * - Consistent error handling and timeouts
   * - Strong WASM-generated types for all responses
   * - Generic typing based on request type for better type safety
   */
  private async executeWorkerOperation<T extends WorkerRequestType>({
    message,
    onEvent,
    timeoutMs = SIGNER_WORKER_MANAGER_CONFIG.TIMEOUTS.DEFAULT // 10s
  }: {
    message: { type: T } & Record<string, any>,
    onEvent?: (update: onProgressEvents) => void,
    timeoutMs?: number
  }): Promise<WorkerResponseForRequest<T>> {

    const worker = this.createSecureWorker();

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        worker.terminate();
        reject(new Error(`Worker operation timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      const responses: WorkerResponseForRequest<T>[] = [];

      worker.onmessage = (event) => {
        try {
          // Use strong typing from WASM-generated types
          const response = event.data as WorkerResponseForRequest<T>;
          responses.push(response);

          // Add detailed logging for debugging
          console.log('Worker response received:', {
            type: response?.type,
            hasPayload: !!response?.payload,
            payloadKeys: response?.payload ? Object.keys(response.payload) : [],
            fullResponse: response
          });

          // Handle progress updates using WASM-generated numeric enum values
          if (isWorkerProgress(response)) {
            const progressResponse = response as WorkerProgressResponse;
            onEvent?.(progressResponse.payload as onProgressEvents);
            return; // Continue listening for more messages
          }

          // Handle errors using WASM-generated enum
          if (isWorkerError(response)) {
            clearTimeout(timeoutId);
            worker.terminate();
            const errorResponse = response as WorkerErrorResponse;
            console.error('Worker error response:', errorResponse);
            reject(new Error(errorResponse.payload.error));
            return;
          }

          // Handle successful completion types using strong typing
          if (isWorkerSuccess(response)) {
            clearTimeout(timeoutId);
            worker.terminate();
            console.log('Worker success response:', response);
            resolve(response as WorkerResponseForRequest<T>);
            return;
          }

          // If we reach here, the response doesn't match any expected type
          console.error('Unexpected worker response format:', {
            response,
            responseType: typeof response,
            isObject: typeof response === 'object',
            hasType: response && typeof response === 'object' && 'type' in response,
            type: (response as any)?.type
          });

          // Check if it's a generic Error object
          if (response && typeof response === 'object' && 'message' in response && 'stack' in response) {
            clearTimeout(timeoutId);
            worker.terminate();
            console.error('Worker sent generic Error object:', response);
            reject(new Error(`Worker sent generic error: ${(response as Error).message}`));
            return;
          }

          // Unknown response format
          clearTimeout(timeoutId);
          worker.terminate();
          reject(new Error(`Unknown worker response format: ${JSON.stringify(response)}`));
        } catch (error) {
          clearTimeout(timeoutId);
          worker.terminate();
          console.error('Error processing worker message:', error);
          reject(new Error(`Worker message processing error: ${error instanceof Error ? error.message : String(error)}`));
        }
      };

      worker.onerror = (event) => {
        clearTimeout(timeoutId);
        worker.terminate();
        const errorMessage = event.error?.message || event.message || 'Unknown worker error';
        console.error('Worker error details (progress):', {
          message: errorMessage,
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
          error: event.error
        });
        reject(new Error(`Worker error: ${errorMessage}`));
      };

      // Format message for Rust SignerWorkerMessage structure using WASM types
      const formattedMessage = {
        type: message.type, // Numeric enum value from WorkerRequestType
        payload: message.payload,
      };

      worker.postMessage(formattedMessage);
    });
  }

  // === PRF OPERATIONS ===

  /**
   * Secure registration flow with dual PRF: WebAuthn + WASM worker encryption using dual PRF
   * Optionally signs a link_device_register_user transaction if VRF data is provided
   */
  async deriveNearKeypairAndEncrypt(
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
  ): Promise<{
    success: boolean;
    nearAccountId: AccountId;
    publicKey: string;
    signedTransaction?: SignedTransaction;
  }> {
    try {
      console.info('WebAuthnManager: Starting secure registration with dual PRF using deterministic derivation');

      const serializedCredential = serializeCredentialWithPRF<WebAuthnRegistrationCredential>({
        credential,
        firstPrfOutput: true,
        secondPrfOutput: true, // only for deriving NEAR keys
      });

      // Extract dual PRF outputs from credential (same as decryption phase)
      if (!serializedCredential.clientExtensionResults?.prf?.results?.first) {
        throw new Error('First PRF output missing from serialized credential');
      }
      if (!serializedCredential.clientExtensionResults?.prf?.results?.second) {
        throw new Error('Second PRF output missing from serialized credential');
      }

      const dualPrfOutputs: DualPrfOutputs = {
        chacha20PrfOutput: serializedCredential.clientExtensionResults?.prf?.results?.first!,
        ed25519PrfOutput: serializedCredential.clientExtensionResults?.prf?.results?.second!,
      };

      // Use generic executeWorkerOperation with specific request type for better type safety
      const response = await this.executeWorkerOperation<typeof WorkerRequestType.DeriveNearKeypairAndEncrypt>({
        message: {
          type: WorkerRequestType.DeriveNearKeypairAndEncrypt,
          payload: {
            dualPrfOutputs: dualPrfOutputs,
            nearAccountId: nearAccountId,
            credential: serializedCredential,
            // Optional device linking registration transaction
            registrationTransaction: (options?.vrfChallenge && options?.contractId && options?.nonce && options?.blockHash) ? {
              vrfChallenge: options.vrfChallenge,
              contractId: options.contractId,
              nonce: options.nonce,
              blockHashBytes: Array.from(base58Decode(options.blockHash)),
              // Pass VRF public key to WASM worker (device number determined by contract)
              deterministicVrfPublicKey: options.deterministicVrfPublicKey,
            } : undefined,
            authenticatorOptions: options?.authenticatorOptions, // Pass authenticator options
          }
        }
      });

      // Response is specifically EncryptionSuccessResponse | EncryptionFailureResponse
      if (!isDeriveNearKeypairAndEncryptSuccess(response)) {
        throw new Error('Dual PRF registration failed');
      }

      console.log('WebAuthnManager: Dual PRF registration successful with deterministic derivation');
      // response.payload is a WasmEncryptionResult with proper WASM types
      const wasmResult = response.payload;
      // Store the encrypted key in IndexedDB using the manager
      const keyData: EncryptedKeyData = {
        nearAccountId: nearAccountId,
        encryptedData: wasmResult.encryptedData,
        iv: wasmResult.iv,
        timestamp: Date.now()
      };

      await this.nearKeysDB.storeEncryptedKey(keyData);

      // Verify storage
      const verified = await this.nearKeysDB.verifyKeyStorage(nearAccountId);
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
    } catch (error: any) {
      console.error('WebAuthnManager: Dual PRF registration error:', error);
      return {
        success: false,
        nearAccountId: nearAccountId,
        publicKey: ''
      };
    }
  }

  /**
   * Secure private key decryption with dual PRF
   *
   * For local private key export, we're just decrypting locally stored encrypted private keys
   *    - No network communication with servers
   *    - No transaction signing or blockchain interaction
   *    - No replay attack surface since nothing is transmitted
   *    - Security comes from device possession + biometrics
   *    - Equivalent to: "If you can unlock your phone, you can access your local keychain"
   *
   * DUAL PRF DETERMINISTIC KEY DERIVATION: WebAuthn dual PRF provides cryptographic guarantees
   *    - Same SALT + same authenticator = same PRF output (deterministic)
   *    - Different SALT + same authenticator = different PRF output
   *    - Use account-specific salts for both AES and Ed25519 PRF derivation
   *    - Impossible to derive PRF output without the physical authenticator
   */
  async decryptPrivateKeyWithPrf(
    touchIdPrompt: TouchIdPrompt,
    nearAccountId: AccountId,
    authenticators: ClientAuthenticatorData[],
  ): Promise<{ decryptedPrivateKey: string; nearAccountId: AccountId }> {
    try {
      console.info('WebAuthnManager: Starting private key decryption with dual PRF (local operation)');

      // Retrieve encrypted key data from IndexedDB in main thread
      console.debug('WebAuthnManager: Retrieving encrypted key from IndexedDB for account:', nearAccountId);
      const encryptedKeyData = await this.nearKeysDB.getEncryptedKey(nearAccountId);
      if (!encryptedKeyData) {
        throw new Error(`No encrypted key found for account: ${nearAccountId}`);
      }

      // For private key export, no VRF challenge is needed.
      // we can use local random challenge for WebAuthn authentication.
      // Security comes from device possession + biometrics, not challenge validation
      const challenge = crypto.getRandomValues(new Uint8Array(32));
      // TouchID prompt
      const credential = await touchIdPrompt.getCredentials({
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

      const response = await this.executeWorkerOperation({
        message: {
          type: WorkerRequestType.DecryptPrivateKeyWithPrf,
          payload: {
            nearAccountId: nearAccountId,
            prfOutput: dualPrfOutputs.chacha20PrfOutput, // Use ChaCha20 PRF output for decryption
            encryptedPrivateKeyData: encryptedKeyData.encryptedData,
            encryptedPrivateKeyIv: encryptedKeyData.iv
          }
        }
      });

      if (!isDecryptPrivateKeyWithPrfSuccess(response)) {
        console.error('WebAuthnManager: Dual PRF private key decryption failed:', response);
        throw new Error('Private key decryption failed');
      }
      console.info('WebAuthnManager: Dual PRF private key decryption successful');
      const wasmResult = response.payload as wasmModule.DecryptPrivateKeyResult;
      return {
        decryptedPrivateKey: wasmResult.privateKey,
        nearAccountId: toAccountId(wasmResult.nearAccountId)
      };
    } catch (error: any) {
      console.error('WebAuthnManager: Dual PRF private key decryption error:', error);
      throw error;
    }
  }

  async checkCanRegisterUser({
    vrfChallenge,
    credential,
    contractId,
    nearRpcUrl,
    authenticatorOptions,
    onEvent,
  }: {
    vrfChallenge: VRFChallenge,
    credential: PublicKeyCredential,
    contractId: string;
    nearRpcUrl: string;
    authenticatorOptions?: AuthenticatorOptions; // Authenticator options for registration check
    onEvent?: (update: onProgressEvents) => void;
  }): Promise<{
    success: boolean;
    verified?: boolean;
    registrationInfo?: any;
    logs?: string[];
    signedTransactionBorsh?: number[];
    error?: string;
  }> {
    try {
      console.info('WebAuthnManager: Checking if user can be registered on-chain');

      const response = await this.executeWorkerOperation<typeof WorkerRequestType.CheckCanRegisterUser>({
        message: {
          type: WorkerRequestType.CheckCanRegisterUser,
          payload: {
            vrfChallenge,
            credential: serializeCredentialWithPRF({ credential }),
            contractId,
            nearRpcUrl,
            authenticatorOptions
          }
        },
        onEvent,
        timeoutMs: SIGNER_WORKER_MANAGER_CONFIG.TIMEOUTS.TRANSACTION
      });

      if (!isCheckCanRegisterUserSuccess(response)) {
        const errorDetails = isWorkerError(response) ? response.payload.error : 'Unknown worker error';
        throw new Error(`Registration check failed: ${errorDetails}`);
      }

      const wasmResult = response.payload as wasmModule.RegistrationCheckResult;
      return {
        success: true,
        verified: wasmResult.verified,
        registrationInfo: wasmResult.registrationInfo,
        logs: wasmResult.logs,
        error: wasmResult.error,
      };
    } catch (error: any) {
      // Preserve the detailed error message instead of converting to generic error
      console.error('checkCanRegisterUser failed:', error);
      return {
        success: false,
        verified: false,
        error: error.message || 'Unknown error occurred',
        logs: [],
      };
    }
  }

  /**
   * @deprecated Testnet only, use createAccountAndRegisterWithRelayServer instead for prod
   */
  async signVerifyAndRegisterUser({
    vrfChallenge,
    credential,
    contractId,
    deterministicVrfPublicKey,
    signerAccountId,
    nearAccountId,
    nearPublicKeyStr,
    nearClient,
    nearRpcUrl,
    deviceNumber = 1, // Default to device number 1 for first device (1-indexed)
    authenticatorOptions,
    onEvent,
  }: {
    vrfChallenge: VRFChallenge,
    credential: PublicKeyCredential,
    contractId: string;
    deterministicVrfPublicKey: string; // Required deterministic VRF key for dual registration
    signerAccountId: string;
    nearAccountId: AccountId;
    nearPublicKeyStr: string;
    nearClient: NearClient; // NEAR RPC client for getting transaction metadata
    nearRpcUrl: string; // NEAR RPC URL for contract verification
    deviceNumber?: number; // Device number for multi-device support (defaults to 1)
    authenticatorOptions?: AuthenticatorOptions; // Authenticator options for registration
    onEvent?: (update: onProgressEvents) => void;
  }): Promise<{
    verified: boolean;
    registrationInfo?: any;
    logs?: string[];
    signedTransaction: SignedTransaction;
    preSignedDeleteTransaction: SignedTransaction;
  }> {
    try {
      console.info('WebAuthnManager: Starting on-chain user registration with transaction');

      if (!nearPublicKeyStr) {
        throw new Error('Client NEAR public key not provided - cannot get access key nonce');
      }

      // Retrieve encrypted key data from IndexedDB in main thread
      console.debug('WebAuthnManager: Retrieving encrypted key from IndexedDB for account:', nearAccountId);
      const encryptedKeyData = await this.nearKeysDB.getEncryptedKey(nearAccountId);
      if (!encryptedKeyData) {
        throw new Error(`No encrypted key found for account: ${nearAccountId}`);
      }

      // Extract PRF output from credential
      const dualPrfOutputs = extractPrfFromCredential({
        credential,
        firstPrfOutput: true,
        secondPrfOutput: false,
      });

      const {
        accessKeyInfo,
        nextNonce,
        txBlockHash,
        txBlockHeight,
      } = await getNonceBlockHashAndHeight({ nearClient, nearPublicKeyStr, nearAccountId });

      // Step 2: Execute registration transaction via WASM
      const response = await this.executeWorkerOperation({
        message: {
          type: WorkerRequestType.SignVerifyAndRegisterUser,
          payload: {
            vrfChallenge,
            credential: serializeCredentialWithPRF({ credential }),
            contractId,
            signerAccountId,
            nearAccountId,
            nonce: nextNonce,
            blockHashBytes: Array.from(base58Decode(txBlockHash)),
            // Pass encrypted key data from IndexedDB
            encryptedPrivateKeyData: encryptedKeyData.encryptedData,
            encryptedPrivateKeyIv: encryptedKeyData.iv,
            prfOutput: dualPrfOutputs.chacha20PrfOutput,
            // Add missing nearRpcUrl field
            nearRpcUrl,
            deterministicVrfPublicKey,
            deviceNumber, // Pass device number for multi-device support
            authenticatorOptions, // Pass authenticator options
          }
        },
        onEvent,
        timeoutMs: SIGNER_WORKER_MANAGER_CONFIG.TIMEOUTS.REGISTRATION
      });

      if (isSignVerifyAndRegisterUserSuccess(response)) {
        console.debug('WebAuthnManager: On-chain user registration transaction successful');
        const wasmResult = response.payload;
        return {
          verified: wasmResult.verified,
          registrationInfo: wasmResult.registrationInfo,
          logs: wasmResult.logs,
          signedTransaction: wasmResult.signedTransaction
            ? new SignedTransaction({
                transaction: wasmResult.signedTransaction.transaction,
                signature: wasmResult.signedTransaction.signature,
                borsh_bytes: Array.from(wasmResult.signedTransaction.borshBytes || [])
              })
            : new SignedTransaction({ transaction: {} as any, signature: {} as any, borsh_bytes: [] }),
          preSignedDeleteTransaction: wasmResult.preSignedDeleteTransaction
            ? new SignedTransaction({
                transaction: wasmResult.preSignedDeleteTransaction.transaction,
                signature: wasmResult.preSignedDeleteTransaction.signature,
                borsh_bytes: Array.from(wasmResult.preSignedDeleteTransaction.borshBytes || [])
              })
            : new SignedTransaction({ transaction: {} as any, signature: {} as any, borsh_bytes: [] })
        };
      } else {
        console.error('WebAuthnManager: On-chain user registration transaction failed:', response);
        throw new Error('On-chain user registration transaction failed');
      }
    } catch (error: any) {
      console.error('WebAuthnManager: On-chain user registration error:', error);
      throw error;
    }
  }

  // === ACTION-BASED SIGNING METHODS ===

  /**
   * Sign multiple transactions with shared VRF challenge and credential
   * Efficiently processes multiple transactions with one PRF authentication
   */
  async signTransactionsWithActions({
    transactions,
    blockHash,
    contractId,
    vrfChallenge,
    credential,
    nearRpcUrl,
    onEvent
  }: {
    transactions: Array<{
      nearAccountId: AccountId;
      receiverId: string;
      actions: ActionParams[];
      nonce: string;
    }>;
    blockHash: string;
    contractId: string;
    vrfChallenge: VRFChallenge;
    credential: PublicKeyCredential;
    nearRpcUrl: string;
    onEvent?: (update: onProgressEvents) => void
  }): Promise<Array<{
    signedTransaction: SignedTransaction;
    nearAccountId: AccountId;
    logs?: string[]
  }>> {
    try {
      console.info(`WebAuthnManager: Starting batch transaction signing for ${transactions.length} transactions`);

      if (transactions.length === 0) {
        throw new Error('No transactions provided for batch signing');
      }

      // Validate all actions in all payloads
      transactions.forEach((txPayload, txIndex) => {
        txPayload.actions.forEach((action, actionIndex) => {
          try {
            validateActionParams(action);
          } catch (error) {
            throw new Error(`Transaction ${txIndex}, Action ${actionIndex} validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        });
      });

      // All transactions should use the same account for signing
      const nearAccountId = transactions[0].nearAccountId;

      // Verify all payloads use the same account
      for (const tx of transactions) {
        if (tx.nearAccountId !== nearAccountId) {
          throw new Error('All transactions must be signed by the same account');
        }
      }

      // Retrieve encrypted key data from IndexedDB in main thread
      console.debug('WebAuthnManager: Retrieving encrypted key from IndexedDB for account:', nearAccountId);
      const encryptedKeyData = await this.nearKeysDB.getEncryptedKey(nearAccountId);
      if (!encryptedKeyData) {
        throw new Error(`No encrypted key found for account: ${nearAccountId}`);
      }

      // Extract dual PRF outputs from credential
      const dualPrfOutputs = extractPrfFromCredential({
        credential,
        firstPrfOutput: true,
        secondPrfOutput: false,
      });

      if (!dualPrfOutputs.chacha20PrfOutput) {
        throw new Error('Failed to extract PRF outputs from credential');
      }

      console.debug('WebAuthnManager: Sending batch transaction signing request to worker');

      // Create transaction signing requests
      const txSigningRequests = transactions.map(tx => ({
        nearAccountId: tx.nearAccountId,
        receiverId: tx.receiverId,
        actions: JSON.stringify(tx.actions),
        nonce: tx.nonce,
        blockHashBytes: Array.from(base58Decode(blockHash))
      }));

      // Send batch signing request to WASM worker
      const response = await this.executeWorkerOperation({
        message: {
          type: WorkerRequestType.SignTransactionsWithActions,
          payload: {
            verification: {
              contractId: contractId,
              nearRpcUrl: nearRpcUrl,
              vrfChallenge: vrfChallenge,
              credential: serializeCredentialWithPRF({ credential }),
            },
            decryption: {
              chacha20PrfOutput: dualPrfOutputs.chacha20PrfOutput,
              encryptedPrivateKeyData: encryptedKeyData.encryptedData,
              encryptedPrivateKeyIv: encryptedKeyData.iv
            },
            txSigningRequests: txSigningRequests
          }
        },
        onEvent
      });

      if (response.type !== WorkerResponseType.SignTransactionsWithActionsSuccess) {
        console.error('WebAuthnManager: Batch transaction signing failed:', response);
        throw new Error('Batch transaction signing failed');
      }

      const wasmResult = response.payload as WasmTransactionSignResult;

      // Check if the batch operation succeeded
      if (!wasmResult.success) {
        const errorMsg = wasmResult.error || 'Batch transaction signing failed';
        console.error('WebAuthnManager: Batch transaction operation failed:', {
          success: wasmResult.success,
          error: wasmResult.error,
          logs: wasmResult.logs
        });
        throw new Error(errorMsg);
      }

      // Extract arrays from the single result - wasmResult contains arrays of all transactions
      const signedTransactions = wasmResult.signedTransactions || [];

      if (signedTransactions.length !== transactions.length) {
        throw new Error(`Expected ${transactions.length} signed transactions but received ${signedTransactions.length}`);
      }

      // Process results for each transaction using WASM types directly
      const results = signedTransactions.map((signedTx, index) => {
        if (!signedTx || !signedTx.transaction || !signedTx.signature) {
          throw new Error(`Incomplete signed transaction data received for transaction ${index + 1}`);
        }

        return {
          signedTransaction: new SignedTransaction({
            transaction: signedTx.transaction,
            signature: signedTx.signature,
            borsh_bytes: Array.from(signedTx.borshBytes || [])
          }),
          nearAccountId: transactions[index].nearAccountId,
          logs: wasmResult.logs
        };
      });

      console.debug(`WebAuthnManager: Batch transaction signing successful for ${results.length} transactions`);
      return results;

    } catch (error: any) {
      console.error('WebAuthnManager: Batch transaction signing error:', error);
      throw error;
    }
  }

  /**
   * Recover keypair from authentication credential for account recovery
   * Uses dual PRF-based Ed25519 key derivation with account-specific HKDF and AES encryption
   */
  async recoverKeypairFromPasskey(
    credential: PublicKeyCredential,
    challenge: string,
    accountIdHint?: string
  ): Promise<{
    publicKey: string;
    encryptedPrivateKey: string;
    iv: string;
    accountIdHint?: string;
  }> {
    try {
      console.info('SignerWorkerManager: Starting dual PRF-based keypair recovery from authentication credential');
      // Serialize the authentication credential for the worker (includes dual PRF outputs)
      const serializedCredential = serializeCredentialWithPRF<WebAuthnAuthenticationCredential>({
        credential,
        firstPrfOutput: true,
        secondPrfOutput: true, // only for recovering NEAR keys
      });

      // Verify dual PRF outputs are available
      if (!serializedCredential.clientExtensionResults?.prf?.results?.first ||
          !serializedCredential.clientExtensionResults?.prf?.results?.second) {
        throw new Error('Dual PRF outputs required for account recovery - both ChaCha20 and Ed25519 PRF outputs must be available');
      }

      // Use generic executeWorkerOperation with specific request type for better type safety
      const response = await this.executeWorkerOperation<typeof WorkerRequestType.RecoverKeypairFromPasskey>({
        message: {
          type: WorkerRequestType.RecoverKeypairFromPasskey,
          payload: {
            credential: serializedCredential,
            accountIdHint
          }
        }
      });

      // response is RecoverKeypairSuccessResponse | RecoverKeypairFailureResponse
      if (!isRecoverKeypairFromPasskeySuccess(response)) {
        throw new Error('Dual PRF keypair recovery failed in WASM worker');
      }

      const wasmResult = response.payload;

      return {
        publicKey: wasmResult.publicKey,
        encryptedPrivateKey: wasmResult.encryptedData,
        iv: wasmResult.iv,
        accountIdHint: wasmResult.accountIdHint
      };

    } catch (error: any) {
      console.error('SignerWorkerManager: Dual PRF keypair recovery error:', error);
      throw error;
    }
  }

  /**
   * Extract COSE public key from WebAuthn attestation object
   * Simple operation that doesn't require TouchID or progress updates
   */
  async extractCosePublicKey(attestationObjectBase64url: string): Promise<Uint8Array> {
    try {
      console.info('SignerWorkerManager: Starting COSE public key extraction');

      const response = await this.executeWorkerOperation({
        message: {
          type: WorkerRequestType.ExtractCosePublicKey,
          payload: {
            attestationObjectBase64url
          }
        }
      });

      if (isExtractCosePublicKeySuccess(response)) {
        console.info('SignerWorkerManager: COSE public key extraction successful');
        return response.payload.cosePublicKeyBytes;
      } else {
        console.error('SignerWorkerManager: COSE public key extraction failed:', response);
        throw new Error('COSE public key extraction failed in WASM worker');
      }
    } catch (error: any) {
      console.error('SignerWorkerManager: COSE public key extraction error:', error);
      throw error;
    }
  }

  /**
   * Sign transaction with raw private key (for key replacement in Option D device linking)
   * No TouchID/PRF required - uses provided private key directly
   */
  async signTransactionWithKeyPair({
    nearPrivateKey,
    signerAccountId,
    receiverId,
    nonce,
    blockHash,
    actions
  }: {
    nearPrivateKey: string;
    signerAccountId: string;
    receiverId: string;
    nonce: string;
    blockHash: string;
    actions: ActionParams[];
  }): Promise<{
    signedTransaction: SignedTransaction;
    logs?: string[];
  }> {
    try {
      console.info('SignerWorkerManager: Starting transaction signing with provided private key');

      // Validate actions
      actions.forEach((action, index) => {
        try {
          validateActionParams(action);
        } catch (error) {
          throw new Error(`Action ${index} validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      });

      const response = await this.executeWorkerOperation({
        message: {
          type: WorkerRequestType.SignTransactionWithKeyPair,
          payload: {
            nearPrivateKey,
            signerAccountId,
            receiverId,
            nonce,
            blockHashBytes: Array.from(base58Decode(blockHash)),
            actions: JSON.stringify(actions)
          }
        }
      });

      if (response.type !== WorkerResponseType.SignTransactionWithKeyPairSuccess) {
        console.error('SignerWorkerManager: Transaction signing with private key failed:', response);
        throw new Error('Transaction signing with private key failed');
      }

      const wasmResult = response.payload as WasmTransactionSignResult;

      // Check if the operation succeeded
      if (!wasmResult.success) {
        const errorMsg = wasmResult.error || 'Transaction signing failed';
        console.error('SignerWorkerManager: Transaction signing operation failed:', {
          success: wasmResult.success,
          error: wasmResult.error,
          logs: wasmResult.logs
        });
        throw new Error(errorMsg);
      }

      // Extract the signed transaction
      const signedTransactions = wasmResult.signedTransactions || [];

      if (signedTransactions.length !== 1) {
        throw new Error(`Expected 1 signed transaction but received ${signedTransactions.length}`);
      }

      const signedTx = signedTransactions[0];
      if (!signedTx || !signedTx.transaction || !signedTx.signature) {
        throw new Error('Incomplete signed transaction data received');
      }

      const result = {
        signedTransaction: new SignedTransaction({
          transaction: signedTx.transaction,
          signature: signedTx.signature,
          borsh_bytes: Array.from(signedTx.borshBytes || [])
        }),
        logs: wasmResult.logs
      };

      console.debug('SignerWorkerManager: Transaction signing with private key successful');
      return result;

    } catch (error: any) {
      console.error('SignerWorkerManager: Transaction signing with private key error:', error);
      throw error;
    }
  }

  /**
   * Sign a NEP-413 message using the user's passkey-derived private key
   *
   * @param payload - NEP-413 signing parameters including message, recipient, nonce, and state
   * @returns Promise resolving to signing result with account ID, public key, and signature
   */
  async signNep413Message(payload: {
    message: string;
    recipient: string;
    nonce: string;
    state: string | null;
    accountId: string;
    credential: PublicKeyCredential;
  }): Promise<{
    success: boolean;
    accountId: string;
    publicKey: string;
    signature: string;
    state?: string;
    error?: string;
  }> {
    try {
      console.debug('SignerWorkerManager: Starting NEP-413 message signing');

      const encryptedKeyData = await this.nearKeysDB.getEncryptedKey(payload.accountId);
      if (!encryptedKeyData) {
        throw new Error(`No encrypted key found for account: ${payload.accountId}`);
      }

      const { chacha20PrfOutput } = extractPrfFromCredential({
        credential: payload.credential,
        firstPrfOutput: true,
        secondPrfOutput: false,
      });

      const response = await this.executeWorkerOperation<typeof WorkerRequestType.SignNep413Message>({
        message: {
          type: WorkerRequestType.SignNep413Message,
          payload: {
            message: payload.message,
            recipient: payload.recipient,
            nonce: payload.nonce,
            state: payload.state,
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

      const wasmResult = response.payload as wasmModule.SignNep413Result;
      console.debug('SignerWorkerManager: NEP-413 message signed successfully');

      return {
        success: true,
        accountId: wasmResult.accountId,
        publicKey: wasmResult.publicKey,
        signature: wasmResult.signature,
        state: wasmResult.state || undefined
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

}