
import { SignedTransaction, type NearClient } from '../../NearClient';
import { ClientAuthenticatorData, UnifiedIndexedDBManager } from '../../IndexedDBManager';
import { IndexedDBManager } from '../../IndexedDBManager';
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
import { VrfWorkerManager } from '../VrfWorkerManager';
import type { ActionArgsWasm, TransactionInputWasm } from '../../types/actions';
import type { onProgressEvents } from '../../types/passkeyManager';
import type { AuthenticatorOptions } from '../../types/authenticatorOptions';
import { AccountId } from "../../types/accountIds";
import { ConfirmationConfig } from '../../types/signer-worker';
import { toAccountId } from '../../types/accountIds';
import { getDeviceNumberForAccount } from './getDeviceNumber';
import { isObject } from '../../WalletIframe/validation';

import {
  decryptPrivateKeyWithPrf,
  checkCanRegisterUser,
  signTransactionsWithActions,
  recoverKeypairFromPasskey,
  extractCosePublicKey,
  signTransactionWithKeyPair,
  signNep413Message,
  requestRegistrationCredentialConfirmation,
  deriveNearKeypairAndEncryptFromSerialized,
} from './handlers';
import {
  SecureConfirmMessageType,
  handlePromptUserConfirmInJsMainThread,
} from './confirmTxFlow';
import { RpcCallPayload } from '../../types/signer-worker';
import { UserPreferencesManager } from '../userPreferences';
import { NonceManager } from '../../nonceManager';
import { WebAuthnAuthenticationCredential, WebAuthnRegistrationCredential } from '../../types';
import type { RegistrationCredentialConfirmationPayload } from './handlers/validation';
import { toError } from '@/utils/errors';


export interface SignerWorkerManagerContext {
  touchIdPrompt: TouchIdPrompt;
  nearClient: NearClient;
  indexedDB: UnifiedIndexedDBManager;
  vrfWorkerManager?: VrfWorkerManager;
  userPreferencesManager: UserPreferencesManager;
  nonceManager: NonceManager;
  rpIdOverride?: string;
  sendMessage: <T extends keyof WorkerRequestTypeMap>(args: {
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

  private indexedDB: UnifiedIndexedDBManager;
  private touchIdPrompt: TouchIdPrompt;
  private vrfWorkerManager: VrfWorkerManager;
  private nearClient: NearClient;
  private userPreferencesManager: UserPreferencesManager;
  private nonceManager: NonceManager;

  constructor(
    vrfWorkerManager: VrfWorkerManager,
    nearClient: NearClient,
    userPreferencesManager: UserPreferencesManager,
    nonceManager: NonceManager,
    rpIdOverride?: string,
    enableSafariGetWebauthnRegistrationFallback: boolean = false,
  ) {
    this.indexedDB = IndexedDBManager;
    this.touchIdPrompt = new TouchIdPrompt(rpIdOverride, enableSafariGetWebauthnRegistrationFallback);
    this.vrfWorkerManager = vrfWorkerManager;
    this.nearClient = nearClient;
    this.userPreferencesManager = userPreferencesManager;
    this.nonceManager = nonceManager;
  }

  private getContext(): SignerWorkerManagerContext {
    return {
      sendMessage: this.sendMessage.bind(this), // bind to access this.createSecureWorker
      indexedDB: this.indexedDB,
      touchIdPrompt: this.touchIdPrompt,
      vrfWorkerManager: this.vrfWorkerManager,
      nearClient: this.nearClient,
      userPreferencesManager: this.userPreferencesManager,
      nonceManager: this.nonceManager,
      rpIdOverride: this.touchIdPrompt.getRpId(),
    };
  }

  createSecureWorker(): Worker {
    // Simple path resolution - build:all copies worker files to /workers/
    const workerUrl = new URL(SIGNER_WORKER_MANAGER_CONFIG.WORKER.URL, window.location.origin);
    // console.debug('Creating secure worker from:', workerUrl.href);
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
  private workerPool: Worker[] = [];
  private readonly MAX_WORKER_POOL_SIZE = 3; // Increased for security model

  private getWorkerFromPool(): Worker {
    if (this.workerPool.length > 0) {
      return this.workerPool.pop()!;
    }
    return this.createSecureWorker();
  }

  private terminateAndReplaceWorker(worker: Worker): void {
    // Always terminate workers to clear memory
    worker.terminate();
    // Asynchronously create a replacement worker for the pool
    this.createReplacementWorker();
  }

  private async createReplacementWorker(): Promise<void> {
    try {
      const worker = this.createSecureWorker();

      // Simple health check
      const healthPromise = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Health check timeout')), 5000);

        const onMessage = (event: MessageEvent) => {
          if (event.data?.type === 'WORKER_READY' || event.data?.ready) {
            worker.removeEventListener('message', onMessage);
            clearTimeout(timeout);
            resolve();
          }
        };

        worker.addEventListener('message', onMessage);
        worker.onerror = () => {
          worker.removeEventListener('message', onMessage);
          clearTimeout(timeout);
          reject(new Error('Worker error during health check'));
        };
      });

      await healthPromise;

      if (this.workerPool.length < this.MAX_WORKER_POOL_SIZE) {
        this.workerPool.push(worker);
      } else {
        worker.terminate();
      }
    } catch (error: unknown) {
      console.warn('SignerWorkerManager: Failed to create replacement worker:', error);
    }
  }

  /**
   * Pre-warm worker pool by creating and initializing workers in advance
   * This reduces latency for the first transaction by having workers ready
   */
  async preWarmWorkerPool(): Promise<void> {
    const promises: Promise<void>[] = [];

    for (let i = 0; i < this.MAX_WORKER_POOL_SIZE; i++) {
      promises.push(
        new Promise<void>((resolve, reject) => {
          try {
            const worker = this.createSecureWorker();

            // Set up one-time ready handler
            const onReady = (event: MessageEvent) => {
              if (event.data?.type === 'WORKER_READY' || event.data?.ready) {
                worker.removeEventListener('message', onReady);
                this.terminateAndReplaceWorker(worker);
                resolve();
              }
            };

            worker.addEventListener('message', onReady);

            // Set up error handler
            worker.onerror = (error) => {
              worker.removeEventListener('message', onReady);
              console.error(`WebAuthnManager: Worker ${i + 1} pre-warm failed:`, error);
              reject(error);
            };

            // Timeout after 5 seconds
            setTimeout(() => {
              worker.removeEventListener('message', onReady);
              console.warn(`WebAuthnManager: Worker ${i + 1} pre-warm timeout`);
              reject(new Error('Pre-warm timeout'));
            }, 5000);

          } catch (error: unknown) {
            console.error(`WebAuthnManager: Failed to create worker ${i + 1}:`, error);
            reject(toError(error));
          }
        })
      );
    }

    try {
      await Promise.allSettled(promises);
    } catch (error: unknown) {
      console.warn('WebAuthnManager: Some workers failed to pre-warm:', error);
    }
  }

  private async sendMessage<T extends WorkerRequestType>({
    message,
    onEvent,
    timeoutMs = SIGNER_WORKER_MANAGER_CONFIG.TIMEOUTS.DEFAULT // 60s
  }: {
    message: { type: T; payload: WorkerRequestTypeMap[T]['request'] };
    onEvent?: (update: onProgressEvents) => void;
    timeoutMs?: number;
  }): Promise<WorkerResponseForRequest<T>> {

    const worker = this.getWorkerFromPool();

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        try {
          this.terminateAndReplaceWorker(worker);
        } catch {}
        // Notify any open modal host to transition to error state
        try {
          const seconds = Math.round(timeoutMs / 1000);
          window.postMessage({ type: 'MODAL_TIMEOUT', payload: `Timed out after ${seconds}s, try again` }, '*');
        } catch {}
        reject(new Error(`Worker operation timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      const responses: WorkerResponseForRequest<T>[] = [];

      worker.onmessage = async (event) => {
        try {
          // Ignore readiness pings that can arrive if a worker was just spawned
          if (event?.data?.type === 'WORKER_READY' || event?.data?.ready) {
            return; // not a response to an operation
          }
          // Use strong typing from WASM-generated types
          const response = event.data as WorkerResponseForRequest<T>;
          responses.push(response);

          // Intercept secure confirm handshake
          if (event.data.type === SecureConfirmMessageType.PROMPT_USER_CONFIRM_IN_JS_MAIN_THREAD) {
            await handlePromptUserConfirmInJsMainThread(
              this.getContext(),
              event.data as {
                type: SecureConfirmMessageType.PROMPT_USER_CONFIRM_IN_JS_MAIN_THREAD,
                data: import('./confirmTxFlow/types').SecureConfirmRequest,
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
            this.terminateAndReplaceWorker(worker);
            const errorResponse = response as WorkerErrorResponse;
            console.error('Worker error response:', errorResponse);
            reject(new Error(errorResponse.payload.error));
            return;
          }

          // Handle successful completion types using strong typing
          if (isWorkerSuccess(response)) {
            clearTimeout(timeoutId);
            this.terminateAndReplaceWorker(worker);
            resolve(response as WorkerResponseForRequest<T>);
            return;
          }

          // If we reach here, the response doesn't match any expected type
          console.error('Unexpected worker response format:', {
            response,
            responseType: typeof response,
            isObject: isObject(response),
            hasType: isObject(response) && 'type' in response,
            type: (isObject(response) && 'type' in response) ? (response as { type?: unknown }).type : undefined
          });

          // Check if it's a generic Error object
          if (isObject(response) && 'message' in response && 'stack' in response) {
            clearTimeout(timeoutId);
            this.terminateAndReplaceWorker(worker);
            console.error('Worker sent generic Error object:', response);
            reject(new Error(`Worker sent generic error: ${(response as Error).message}`));
            return;
          }

          // Unknown response format
          clearTimeout(timeoutId);
          this.terminateAndReplaceWorker(worker);
          reject(new Error(`Unknown worker response format: ${JSON.stringify(response)}`));
        } catch (error: unknown) {
          clearTimeout(timeoutId);
          this.terminateAndReplaceWorker(worker);
          console.error('Error processing worker message:', error);
          const err = toError(error);
          reject(new Error(`Worker message processing error: ${err.message}`));
        }
      };

      worker.onerror = (event) => {
        clearTimeout(timeoutId);
        this.terminateAndReplaceWorker(worker);
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
   * Derive NEAR keypair from a serialized WebAuthn registration credential
   */
  async deriveNearKeypairAndEncryptFromSerialized(args: {
    credential: WebAuthnRegistrationCredential;
    nearAccountId: AccountId;
    options?: {
      vrfChallenge?: VRFChallenge;
      deterministicVrfPublicKey?: string;
      contractId?: string;
      nonce?: string;
      blockHash?: string;
      authenticatorOptions?: AuthenticatorOptions;
      deviceNumber?: number;
    };
  }): Promise<{
    success: boolean;
    nearAccountId: AccountId;
    publicKey: string;
    signedTransaction?: SignedTransaction;
  }> {
    return deriveNearKeypairAndEncryptFromSerialized({ ctx: this.getContext(), ...args });
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
    credential: WebAuthnRegistrationCredential,
    contractId: string;
    nearRpcUrl: string;
    authenticatorOptions?: AuthenticatorOptions; // Authenticator options for registration check
    onEvent?: (update: onProgressEvents) => void;
  }): Promise<{
    success: boolean;
    verified?: boolean;
    registrationInfo?: unknown;
    logs?: string[];
    signedTransactionBorsh?: number[];
    error?: string;
  }> {
    return checkCanRegisterUser({ ctx: this.getContext(), ...args });
  }

  // === ACTION-BASED SIGNING METHODS ===

  /**
   * Sign multiple transactions with shared VRF challenge and credential
   * Efficiently processes multiple transactions with one PRF authentication
   */
  async signTransactionsWithActions(args: {
    transactions: TransactionInputWasm[],
    rpcCall: RpcCallPayload,
    onEvent?: (update: onProgressEvents) => void,
    confirmationConfigOverride?: ConfirmationConfig,
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
    credential: WebAuthnAuthenticationCredential;
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
    credential: import('../../types/webauthn').WebAuthnAuthenticationCredential;
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

  /**
   * Prompt user for registration credential confirmation (create() with PRF) and return artifacts
   * Used for registration (device 1) and link-device (device N) flows.
   */
  async requestRegistrationCredentialConfirmation(args: {
    nearAccountId: string;
    deviceNumber: number;
    contractId: string;
    nearRpcUrl: string;
    confirmationConfig?: ConfirmationConfig;
  }): Promise<RegistrationCredentialConfirmationPayload> {
    return requestRegistrationCredentialConfirmation({ ctx: this.getContext(), ...args });
  }

  /**
   * Two-phase export (worker-driven):
   *  - Phase 1: collect PRF (uiMode: 'skip')
   *  - Decrypt inside worker
   *  - Phase 2: show export UI with decrypted key (kept open until user closes)
   */
  async exportNearKeypairUi(args: { nearAccountId: AccountId, variant?: 'drawer'|'modal', theme?: 'dark'|'light' }): Promise<void> {
    const ctx = this.getContext();
    const accountId = toAccountId(args.nearAccountId);
    // Gather encrypted key + IV and public key from IndexedDB
    const deviceNumber = await getDeviceNumberForAccount(ctx, accountId);
    const [keyData, user] = await Promise.all([
      ctx.indexedDB.nearKeysDB.getEncryptedKey(accountId, deviceNumber),
      ctx.indexedDB.clientDB.getUser(accountId),
    ]);
    const publicKey = user?.clientNearPublicKey || '';
    if (!keyData || !publicKey) {
      throw new Error('Missing local key material for export');
    }
    await (ctx as any).sendMessage({
      message: {
        type: WorkerRequestType.ExportNearKeypairUI,
        payload: {
          nearAccountId: accountId,
          publicKey,
          encryptedPrivateKeyData: keyData.encryptedData,
          encryptedPrivateKeyIv: keyData.iv,
          variant: args.variant,
          theme: args.theme,
        } as any,
      },
    });
  }

}
