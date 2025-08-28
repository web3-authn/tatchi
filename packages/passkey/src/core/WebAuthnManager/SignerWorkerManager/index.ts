
import { SignedTransaction, type NearClient } from '../../NearClient';
import { ClientAuthenticatorData, PasskeyClientDBManager } from '../../IndexedDBManager';
import { PasskeyNearKeysDBManager } from '../../IndexedDBManager/passkeyNearKeysDB';
import { TouchIdPrompt } from "../touchIdPrompt";
import { SIGNER_WORKER_MANAGER_CONFIG } from "../../../config";
import {
  WorkerRequestType,
  WorkerResponseForRequest,
  isWorkerProgress,
  isWorkerError,
  isWorkerSuccess,
  WorkerProgressResponse,
  WorkerErrorResponse,
  WorkerRequestTypeMap,
} from '../../types/signer-worker';
import { VRFChallenge } from '../../types/vrf-worker';
import type { ActionArgsWasm } from '../../types/actions';
import type { onProgressEvents } from '../../types/passkeyManager';
import type { AuthenticatorOptions } from '../../types/authenticatorOptions';
import { AccountId } from "../../types/accountIds";
import { ConfirmationConfig } from '../../types/signer-worker';

import {
  deriveNearKeypairAndEncrypt,
  decryptPrivateKeyWithPrf,
  checkCanRegisterUser,
  signVerifyAndRegisterUser,
  signTransactionsWithActions,
  recoverKeypairFromPasskey,
  extractCosePublicKey,
  signTransactionWithKeyPair,
  signNep413Message,
} from './handlers';

import {
  loadUserSettings,
  saveUserSettings,
  SecureConfirmMessageType,
  SecureConfirmMessage,
  SecureConfirmData,
  handlePromptUserConfirmInJsMainThread,
} from './confirmTxFlow';


export interface SignerWorkerManagerContext {
  clientDB: PasskeyClientDBManager;
  touchIdPrompt: TouchIdPrompt;
  confirmationConfig: ConfirmationConfig;
  currentUserAccountId: string | null;
  nearKeysDB: PasskeyNearKeysDBManager;
  sendMessage: <T extends WorkerRequestType>(args: {
    message: {
      type: T;
      payload: WorkerRequestTypeMap[T]['request']
    };
    onEvent?: (update: onProgressEvents) => void;
    timeoutMs?: number;
  }) => Promise<WorkerResponseForRequest<T>>;
}

/**
 * WebAuthnWorkers handles PRF, workers, and COSE operations
 *
 * Note: Challenge store removed as VRF provides cryptographic freshness
 * without needing centralized challenge management
 */
export class SignerWorkerManager {

  private nearKeysDB: PasskeyNearKeysDBManager;
  private clientDB: PasskeyClientDBManager;
  private touchIdPrompt: TouchIdPrompt;

  /** Default confirmation configs (if user settings are unset */
  private confirmationConfig: ConfirmationConfig = {
    uiMode: 'modal',
    behavior: 'autoProceed',
    autoProceedDelay: 1000, // 1 seconds default delay
  };

  private currentUserAccountId: string | null = null;

  constructor() {
    this.nearKeysDB = new PasskeyNearKeysDBManager();
    this.clientDB = new PasskeyClientDBManager();
    this.touchIdPrompt = new TouchIdPrompt();
  }

  private getContext(): SignerWorkerManagerContext {
    return {
      nearKeysDB: this.nearKeysDB,
      sendMessage: this.sendMessage.bind(this), // bind to access this.createSecureWorker
      clientDB: this.clientDB,
      touchIdPrompt: this.touchIdPrompt,
      confirmationConfig: this.confirmationConfig,
      currentUserAccountId: this.currentUserAccountId,
    };
  }

  /**
   * Set the unified confirmation configuration
   */
  setConfirmationConfig(config: ConfirmationConfig): void {
    this.confirmationConfig = { ...this.confirmationConfig, ...config };
    saveUserSettings(this.getContext());
  }

  /**
   * Set the UI mode for confirmation
   */
  setConfirmationUIMode(mode: ConfirmationConfig['uiMode']): void {
    if (mode === "skip") {
      this.confirmationConfig.autoProceedDelay = 0;
    }
    this.confirmationConfig.uiMode = mode;
    saveUserSettings(this.getContext());
  }

  /**
   * Set the confirmation behavior
   */
  setConfirmBehavior(behavior: ConfirmationConfig['behavior']): void {
    this.confirmationConfig.behavior = behavior;
    saveUserSettings(this.getContext());
  }

  /**
   * Set the auto-proceed delay (only used with autoProceed)
   */
  setAutoProceedDelay(delayMs: number): void {
    this.confirmationConfig.autoProceedDelay = delayMs;
    saveUserSettings(this.getContext());
  }

  /**
   * Get the current confirmation configuration
   */
  getConfirmationConfig(): ConfirmationConfig {
    return { ...this.confirmationConfig };
  }

  /**
   * Set the current user account ID for settings persistence
   */
  setCurrentUser(accountId: string): void {
    this.currentUserAccountId = accountId;
    loadUserSettings(this.getContext());
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
      worker.onerror = (event) => { console.error('Worker error:', event); };
      // Add error handling
      return worker;
    } catch (error) {
      console.error('Failed to create worker:', error);
      throw new Error(`Failed to create secure worker: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Executes a worker operation by sending a message to the secure worker.
   * Handles progress updates via onEvent callback, supports both single and multiple response patterns.
   * Intercepts secure confirmation handshake messages for pluggable UI.
   * Resolves with the final worker response or rejects on error/timeout.
   *
   * @template T - Worker request type.
   * @param params.message - The message to send to the worker.
   * @param params.onEvent - Optional callback for progress events.
   * @param params.timeoutMs - Optional timeout in milliseconds.
   * @returns Promise resolving to the worker response for the request.
   */
  private async sendMessage<T extends WorkerRequestType>({
    message,
    onEvent,
    timeoutMs = SIGNER_WORKER_MANAGER_CONFIG.TIMEOUTS.DEFAULT // 10s
  }: {
    message: {
      type: T;
      payload: WorkerRequestTypeMap[T]['request'];
    };
    onEvent?: (update: onProgressEvents) => void;
    timeoutMs?: number;
  }): Promise<WorkerResponseForRequest<T>> {

    const worker = this.createSecureWorker();

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        worker.terminate();
        reject(new Error(`Worker operation timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      const responses: WorkerResponseForRequest<T>[] = [];

      worker.onmessage = async (event) => {
        try {
          // Use strong typing from WASM-generated types
          const response = event.data as WorkerResponseForRequest<T>;
          responses.push(response);

          // Intercept secure confirm handshake (Phase A: pluggable UI)
          if (event.data.type === SecureConfirmMessageType.PROMPT_USER_CONFIRM_IN_JS_MAIN_THREAD) {
            await handlePromptUserConfirmInJsMainThread(
              this.getContext(),
              event.data as {
                type: SecureConfirmMessageType.PROMPT_USER_CONFIRM_IN_JS_MAIN_THREAD,
                data: SecureConfirmData,
              },
              worker
            );
            return; // do not treat as a worker response, continue listening for more messages
          }

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

  /**
   * Secure registration flow with dual PRF: WebAuthn + WASM worker encryption using dual PRF
   * Optionally signs a link_device_register_user transaction if VRF data is provided
   */
  async deriveNearKeypairAndEncrypt(args: {
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
    return deriveNearKeypairAndEncrypt({ ctx: this.getContext(), ...args });
  }

  /**
   * Secure private key decryption with dual PRF
   */
  async decryptPrivateKeyWithPrf(args: {
    nearAccountId: AccountId,
    authenticators: ClientAuthenticatorData[],
  }): Promise<{
    decryptedPrivateKey: string;
    nearAccountId: AccountId
  }> {
    return decryptPrivateKeyWithPrf({ ctx: this.getContext(), ...args });
  }

  async checkCanRegisterUser(args: {
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
    return checkCanRegisterUser({ ctx: this.getContext(), ...args });
  }

  /**
   * @deprecated Testnet only, use createAccountAndRegisterWithRelayServer instead for prod
   */
  async signVerifyAndRegisterUser(args: {
    vrfChallenge: VRFChallenge,
    credential: PublicKeyCredential,
    contractId: string;
    deterministicVrfPublicKey: string; // Required deterministic VRF key for dual registration
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
    preSignedDeleteTransaction: SignedTransaction | null;
  }> {
    return signVerifyAndRegisterUser({ ctx: this.getContext(), ...args });
  }

  // === ACTION-BASED SIGNING METHODS ===

  /**
   * Sign multiple transactions with shared VRF challenge and credential
   * Efficiently processes multiple transactions with one PRF authentication
   */
  async signTransactionsWithActions(args: {
    transactions: Array<{
      nearAccountId: AccountId;
      receiverId: string;
      actions: ActionArgsWasm[];
      nonce: string;
    }>;
    blockHash: string;
    contractId: string;
    vrfChallenge: VRFChallenge;
    nearRpcUrl: string;
    onEvent?: (update: onProgressEvents) => void;
    confirmationConfigOverride?: ConfirmationConfig;
  }): Promise<Array<{
    signedTransaction: SignedTransaction;
    nearAccountId: AccountId;
    logs?: string[]
  }>> {
    return signTransactionsWithActions({ ctx: this.getContext(), ...args });
  }

  /**
   * Recover keypair from authentication credential for account recovery
   * Uses dual PRF-based Ed25519 key derivation with account-specific HKDF and AES encryption
   */
  async recoverKeypairFromPasskey(args: {
    credential: PublicKeyCredential;
    accountIdHint?: string;
  }): Promise<{
    publicKey: string;
    encryptedPrivateKey: string;
    iv: string;
    accountIdHint?: string;
  }> {
    return recoverKeypairFromPasskey({ ctx: this.getContext(), ...args });
  }

  /**
   * Extract COSE public key from WebAuthn attestation object
   * Simple operation that doesn't require TouchID or progress updates
   */
  async extractCosePublicKey(attestationObjectBase64url: string): Promise<Uint8Array> {
    return extractCosePublicKey({ ctx: this.getContext(), attestationObjectBase64url });
  }

  /**
   * Sign transaction with raw private key (for key replacement in Option D device linking)
   * No TouchID/PRF required - uses provided private key directly
   */
  async signTransactionWithKeyPair(args: {
    nearPrivateKey: string;
    signerAccountId: string;
    receiverId: string;
    nonce: string;
    blockHash: string;
    actions: ActionArgsWasm[];
  }): Promise<{
    signedTransaction: SignedTransaction;
    logs?: string[];
  }> {
    return signTransactionWithKeyPair({ ctx: this.getContext(), ...args });
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
    return signNep413Message({ ctx: this.getContext(), payload });
  }

}