/**
 * VRF Manager
 * Uses Web Workers for VRF keypair management with client-hosted worker files.
 */

import type {
  VRFWorkerStatus,
  VrfWorkerManagerConfig,
  EncryptedVRFKeypair,
  VRFInputData,
  VRFWorkerMessage,
  VRFWorkerResponse,
  ServerEncryptedVrfKeypair,
  WasmVrfWorkerRequestType,
  WasmShamir3PassConfigPRequest,
  WasmShamir3PassConfigServerUrlsRequest,
} from '../../types/vrf-worker';
import type { VRFChallenge } from '../../types/vrf-worker';
import { BUILD_PATHS } from '../../../../build-paths.js';
import { resolveWorkerUrl } from '../../sdkPaths';
import type { AccountId } from '../../types/accountIds';
import type { TouchIdPrompt } from '../touchIdPrompt';
import type { NearClient } from '../../NearClient';
import type { UnifiedIndexedDBManager } from '../../IndexedDBManager';
import type { UserPreferencesManager } from '../userPreferences';
import type { NonceManager } from '../../nonceManager';
import {
  SecureConfirmMessageType,
  type SecureConfirmRequest,
  type SerializableCredential,
} from './confirmTxFlow/types';
import type { TransactionInputWasm } from '../../types/actions';
import type { RpcCallPayload, ConfirmationConfig } from '../../types/signer-worker';
import type { TransactionContext } from '../../types/rpc';
import type { RegistrationCredentialConfirmationPayload } from '../SignerWorkerManager/handlers/validation';
import type { WebAuthnAuthenticationCredential, WebAuthnRegistrationCredential } from '../../types/webauthn';
import { handlePromptUserConfirmInJsMainThread } from './confirmTxFlow';
import type { VrfWorkerManagerHandlerContext } from './handlers/types';
import {
  checkVrfStatus,
  clearSession,
  clearVrfSession,
  confirmAndDeriveDevice2RegistrationSession,
  confirmAndPrepareSigningSession,
  createSigningSessionChannel,
  deriveVrfKeypairFromPrf,
  mintSessionKeysAndSendToSigner,
  dispenseSessionKey,
  generateVrfChallengeForSession,
  generateVrfChallengeOnce,
  generateVrfKeypairBootstrap,
  checkSessionStatus,
  prepareDecryptSession,
  requestRegistrationCredentialConfirmation,
  shamir3PassDecryptVrfKeypair,
  shamir3PassEncryptCurrentVrfKeypair,
  unlockVrfKeypair,
} from './handlers';

/**
 * VRF-owned host context passed into confirmTxFlow.
 */
export interface VrfWorkerManagerContext {
  touchIdPrompt: TouchIdPrompt;
  nearClient: NearClient;
  indexedDB: UnifiedIndexedDBManager;
  userPreferencesManager: UserPreferencesManager;
  nonceManager: NonceManager;
  rpIdOverride?: string;
  nearExplorerUrl?: string;
  vrfWorkerManager?: SessionVrfWorkerManager;
}

/**
 * Narrow VRF manager surface used by confirmTxFlow. This interface only exposes
 * session-bound operations so confirm flows cannot accidentally call the
 * low-level helpers that take an optional sessionId.
 */
export interface SessionVrfWorkerManager {
  generateVrfKeypairBootstrap(args: {
    vrfInputData: VRFInputData;
    saveInMemory: boolean;
    sessionId: string;
  }): Promise<{
    vrfPublicKey: string;
    vrfChallenge: VRFChallenge;
  }>;

  generateVrfChallengeForSession(inputData: VRFInputData, sessionId: string): Promise<VRFChallenge>;

  mintSessionKeysAndSendToSigner(args: {
    sessionId: string;
    wrapKeySalt?: string;
    contractId?: string;
    nearRpcUrl?: string;
    ttlMs?: number;
    remainingUses?: number;
    credential: WebAuthnRegistrationCredential | WebAuthnAuthenticationCredential;
  }): Promise<{ sessionId: string; wrapKeySalt: string }>;

  dispenseSessionKey(args: {
    sessionId: string;
    uses?: number;
  }): Promise<{
    sessionId: string;
    remainingUses?: number;
    expiresAtMs?: number;
  }>;

  prepareDecryptSession(args: {
    sessionId: string;
    nearAccountId: AccountId;
    wrapKeySalt: string;
    encryptedVrfKeypair?: EncryptedVRFKeypair;
    expectedVrfPublicKey?: string;
  }): Promise<void>;

  requestRegistrationCredentialConfirmation(params: {
    nearAccountId: string;
    deviceNumber: number;
    confirmerText?: { title?: string; body?: string };
    confirmationConfigOverride?: Partial<ConfirmationConfig>;
    contractId: string;
    nearRpcUrl: string;
  }): Promise<RegistrationCredentialConfirmationPayload>;

  confirmAndDeriveDevice2RegistrationSession(params: {
    sessionId: string;
    nearAccountId: AccountId;
    deviceNumber: number;
    contractId: string;
    nearRpcUrl: string;
    authenticatorOptions?: object;
    wrapKeySalt?: string;
  }): Promise<{
    confirmed: boolean;
    sessionId: string;
    credential: WebAuthnRegistrationCredential;
    vrfChallenge: VRFChallenge;
    transactionContext: TransactionContext;
    wrapKeySalt: string;
    requestId: string;
    intentDigest: string;
    deterministicVrfPublicKey: string;
    encryptedVrfKeypair: EncryptedVRFKeypair;
    error?: string;
  }>;

  checkVrfStatus(): Promise<VRFWorkerStatus>;
}

/**
 * VRF Worker Manager
 *
 * This class manages VRF operations using Web Workers for:
 * - VRF keypair unlocking (login)
 * - VRF challenge generation (authentication)
 * - Session management (browser session only)
 * - Client-hosted worker files
 */
export class VrfWorkerManager {
  private vrfWorker: Worker | null = null;
  private initializationPromise: Promise<void> | null = null;
  private messageId = 0;
  private config: VrfWorkerManagerConfig;
  private currentVrfAccountId: string | null = null;
  private workerBaseOrigin: string | undefined;
  private context: VrfWorkerManagerContext;

  constructor(config: VrfWorkerManagerConfig, context: VrfWorkerManagerContext) {
    this.config = {
      // Default to client-hosted worker file using centralized config
      vrfWorkerUrl: BUILD_PATHS.RUNTIME.VRF_WORKER,
      workerTimeout: 60_000,
      debug: false,
      ...config
    };
    // Attach a self-reference so confirmTxFlow helpers can call back into VRF APIs.
    this.context = {
      ...context,
      vrfWorkerManager: this,
    };
  }

  /**
   * Context used by confirmTxFlow for VRF-driven flows.
   */
  getContext(): VrfWorkerManagerContext {
    return this.context;
  }

  private getHandlerContext(): VrfWorkerManagerHandlerContext {
    return {
      ensureWorkerReady: this.ensureWorkerReady.bind(this),
      sendMessage: this.sendMessage.bind(this),
      generateMessageId: this.generateMessageId.bind(this),
      getContext: this.getContext.bind(this),
      postToWorker: (message: unknown, transfer?: Transferable[]) => {
        if (!this.vrfWorker) {
          throw new Error('VRF Web Worker not available');
        }
        this.vrfWorker.postMessage(message, transfer as any);
      },
      getCurrentVrfAccountId: () => this.currentVrfAccountId,
      setCurrentVrfAccountId: (next: string | null) => {
        this.currentVrfAccountId = next;
      },
    };
  }

  /**
   * Create a VRF-owned MessageChannel for signing and return the signer-facing port.
   * VRF retains the sibling port for WrapKeySeed delivery.
   */
  async createSigningSessionChannel(sessionId: string): Promise<MessagePort> {
    return createSigningSessionChannel(this.getHandlerContext(), sessionId);
  }

  /**
   * Derive WrapKeySeed in the VRF worker and deliver it (along with PRF.second if credential provided)
   * to the signer worker via the registered port.
   */
  async mintSessionKeysAndSendToSigner(args: {
    sessionId: string;
    // Optional vault wrapKeySalt. When omitted or empty, VRF worker will generate a fresh wrapKeySalt.
    wrapKeySalt?: string;
    // Optional contract verification context; when provided, VRF Rust will call
    // verify_authentication_response before deriving WrapKeySeed.
    contractId?: string;
    nearRpcUrl?: string;
    // Optional signing-session config. When omitted, VRF worker uses defaults.
    ttlMs?: number;
    remainingUses?: number;
    // Optional credential for PRF.second extraction (registration or authentication)
    credential: WebAuthnRegistrationCredential | WebAuthnAuthenticationCredential;
  }): Promise<{ sessionId: string; wrapKeySalt: string }> {
    return mintSessionKeysAndSendToSigner(this.getHandlerContext(), args);
  }

  /**
   * Dispense an existing VRF-owned session key (WrapKeySeed + wrapKeySalt) over the
   * attached MessagePort for `sessionId`, enforcing TTL/usage in the VRF worker.
   *
   * This is the primitive needed for "warm" signing sessions: 1 VRF worker → N one-shot signer workers.
   */
  async dispenseSessionKey(args: {
    sessionId: string;
    uses?: number;
  }): Promise<{
    sessionId: string;
    remainingUses?: number;
    expiresAtMs?: number;
  }> {
    return dispenseSessionKey(this.getHandlerContext(), args);
  }

  /**
   * Query VRF-owned signing session status for UI introspection.
   * This does not prompt and does not reveal secrets; it only returns metadata.
   */
  async checkSessionStatus(args: {
    sessionId: string;
  }): Promise<{
    sessionId: string;
    status: 'active' | 'exhausted' | 'expired' | 'not_found';
    remainingUses?: number;
    expiresAtMs?: number;
    createdAtMs?: number;
  }> {
    return checkSessionStatus(this.getHandlerContext(), args);
  }

  /**
   * Clear VRF-owned signing session material for a given `sessionId`.
   * Intended for explicit "Lock" actions or lifecycle cleanup.
   */
  async clearSession(args: {
    sessionId: string;
  }): Promise<{
    sessionId: string;
    clearedSession: boolean;
    clearedChallenge: boolean;
    clearedPort: boolean;
  }> {
    return clearSession(this.getHandlerContext(), args);
  }

  /**
   * VRF-driven decrypt session for export flows.
   * Kicks off a LocalOnly DECRYPT_PRIVATE_KEY_WITH_PRF confirm via VRF Rust and derives
   * WrapKeySeed using the vault-provided wrapKeySalt. WrapKeySeed + wrapKeySalt are sent to the signer over
   * the dedicated MessagePort for the given sessionId.
   */
  async prepareDecryptSession(args: {
    sessionId: string;
    nearAccountId: AccountId;
    wrapKeySalt: string;
    encryptedVrfKeypair?: EncryptedVRFKeypair;
    expectedVrfPublicKey?: string;
  }): Promise<void> {
    return prepareDecryptSession(this.getHandlerContext(), args);
  }

  /**
   * VRF-driven confirmation + WrapKeySeed derivation for signing flows.
   * Runs confirmTxFlow on the main thread, derives WrapKeySeed in the VRF worker, and returns
   * the session metadata needed by the signer worker. WrapKeySeed itself travels only over the
   * reserved MessagePort registered via registerSignerWrapKeySeedPort.
   */
  async confirmAndPrepareSigningSession(params: {
    ctx: VrfWorkerManagerContext;
    sessionId: string;
    kind: 'transaction';
    txSigningRequests: TransactionInputWasm[];
    rpcCall: RpcCallPayload;
    title?: string;
    body?: string;
    confirmationConfigOverride?: Partial<ConfirmationConfig>;
  } | {
    ctx: VrfWorkerManagerContext;
    sessionId: string;
    kind: 'delegate';
    nearAccountId: string;
    title?: string;
    body?: string;
    delegate: {
      senderId: string;
      receiverId: string;
      actions: TransactionInputWasm['actions'];
      nonce: string | number | bigint;
      maxBlockHeight: string | number | bigint;
    };
    rpcCall: RpcCallPayload;
    confirmationConfigOverride?: Partial<ConfirmationConfig>;
  } | {
    ctx: VrfWorkerManagerContext;
    sessionId: string;
    kind: 'nep413';
    nearAccountId: string;
    message: string;
    recipient: string;
    title?: string;
    body?: string;
    contractId?: string;
    nearRpcUrl?: string;
    confirmationConfigOverride?: Partial<ConfirmationConfig>;
  }): Promise<{
    sessionId: string;
    transactionContext: TransactionContext;
    intentDigest: string;
    credential?: SerializableCredential;
    vrfChallenge?: VRFChallenge;
  }> {
    return confirmAndPrepareSigningSession(this.getHandlerContext(), params);
  }

  /**
   * VRF-driven helper for registration confirmation.
   * Runs confirmTxFlow on the main thread and returns registration artifacts.
   * WrapKeySeed derivation is handled later when we call into signing/derivation
   * flows with PRF + withSigningSession.
   */
  async requestRegistrationCredentialConfirmation(params: {
    nearAccountId: string;
    deviceNumber: number;
    confirmerText?: { title?: string; body?: string };
    confirmationConfigOverride?: Partial<ConfirmationConfig>;
    contractId: string;
    nearRpcUrl: string;
  }): Promise<RegistrationCredentialConfirmationPayload> {
    return requestRegistrationCredentialConfirmation(this.getHandlerContext(), params);
  }

  /**
   * Combined Device2 registration session: single WebAuthn ceremony for credential + WrapKeySeed derivation.
   *
   * This method orchestrates the complete Device2 registration flow:
   * 1. Runs a VRF-driven registration confirmation (single TouchID prompt)
   * 2. Extracts PRF.first from the credential and derives WrapKeySeed
   * 3. Sends WrapKeySeed to signer worker via MessagePort (never exposed to JS)
   * 4. Returns credential (with PRF.second embedded), vrfChallenge, transactionContext, wrapKeySalt
   *
   * The signer worker can then use PRF.second for NEAR key derivation and WrapKeySeed for encryption.
   */
  async confirmAndDeriveDevice2RegistrationSession(params: {
    sessionId: string;
    nearAccountId: AccountId;
    deviceNumber: number;
    contractId: string;
    nearRpcUrl: string;
    authenticatorOptions?: object;
    wrapKeySalt?: string;
  }): Promise<{
    confirmed: boolean;
    sessionId: string;
    credential: WebAuthnRegistrationCredential;
    vrfChallenge: VRFChallenge;
    transactionContext: TransactionContext;
    wrapKeySalt: string;
    requestId: string;
    intentDigest: string;
    deterministicVrfPublicKey: string;
    encryptedVrfKeypair: EncryptedVRFKeypair;
    error?: string;
  }> {
    return confirmAndDeriveDevice2RegistrationSession(this.getHandlerContext(), params);
  }

  setWorkerBaseOrigin(origin: string | undefined): void {
    this.workerBaseOrigin = origin;
  }

  /**
   * Ensure VRF worker is ready for operations
   * @param requireHealthCheck - Whether to perform health check after initialization
   */
  private async ensureWorkerReady(requireHealthCheck = false): Promise<void> {
    if (this.initializationPromise) {
      await this.initializationPromise;
    } else if (!this.vrfWorker) {
      await this.initialize();
    }
    if (!this.vrfWorker) {
      throw new Error('VRF Worker failed to initialize');
    }
    // Optional health check for critical operations
    if (requireHealthCheck) {
      try {
        const healthResponse = await this.sendMessage({
          type: 'PING',
          id: this.generateMessageId(),
          payload: {} as WasmVrfWorkerRequestType
        }, 3000);

        if (!healthResponse.success) {
          throw new Error('VRF Worker failed health check');
        }
      } catch (error) {
        console.error('VRF Manager: Health check failed:', error);
        throw new Error('VRF Worker failed health check');
      }
    }
  }

  /**
   * Initialize VRF functionality using Web Workers
   */
  async initialize(): Promise<void> {
    if (this.initializationPromise) {
      return this.initializationPromise;
    }
    // =============================================================
    // This improved error handling ensures that:
    // 1. Initialization failures are properly logged with full details
    // 2. Errors are re-thrown to callers (no silent swallowing)
    // 3. Failed initialization promise is reset for retry
    // 4. Debug logs actually appear in test output
    this.initializationPromise = this.createVrfWorker().catch(error => {
      console.error('VRF Manager: Initialization failed:', error);
      console.error('VRF Manager: Error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
      // Reset promise so initialization can be retried
      this.initializationPromise = null;
      throw error; // Re-throw so callers know it failed
    });

    const result = await this.initializationPromise;
    return result;
  }

  /**
   * Initialize Web Worker with client-hosted VRF worker
   */
  private async createVrfWorker(): Promise<void> {
    try {
      const relativePath = this.config.vrfWorkerUrl || BUILD_PATHS.RUNTIME.VRF_WORKER;
      const vrfUrlStr = resolveWorkerUrl(relativePath, { worker: 'vrf', baseOrigin: this.workerBaseOrigin })
      console.debug('VRF Manager: Worker URL:', vrfUrlStr);
      // Create Web Worker from resolved URL
      this.vrfWorker = new Worker(vrfUrlStr, {
        type: 'module',
        name: 'Web3AuthnVRFWorker'
      });
      // Set up error handling
      this.vrfWorker.onerror = (error) => {
        console.error('VRF Manager: Web Worker error:', error);
      };
      // Test communication with the Web Worker
      await this.testWebWorkerCommunication();

      // Configure Shamir P if provided
      if (this.config.shamirPB64u) {
        const resp = await this.sendMessage<WasmShamir3PassConfigPRequest>({
          type: 'SHAMIR3PASS_CONFIG_P',
          id: this.generateMessageId(),
          payload: { p_b64u: this.config.shamirPB64u }
        });
        if (!resp.success) {
          throw new Error(`Failed to configure Shamir P: ${resp.error}`);
        }
      }

      // Configure relay server URLs if provided
      if (this.config.relayServerUrl && this.config.applyServerLockRoute && this.config.removeServerLockRoute) {
        const resp2 = await this.sendMessage<WasmShamir3PassConfigServerUrlsRequest>({
          type: 'SHAMIR3PASS_CONFIG_SERVER_URLS',
          id: this.generateMessageId(),
          payload: {
            relayServerUrl: this.config.relayServerUrl,
            applyLockRoute: this.config.applyServerLockRoute,
            removeLockRoute: this.config.removeServerLockRoute,
          }
        });
        if (!resp2.success) {
          throw new Error(`Failed to configure Shamir server URLs: ${resp2.error}`);
        }
      }

    } catch (error: any) {
      throw new Error(`VRF Web Worker initialization failed: ${error.message}`);
    }
  }

  /**
   * Send message to Web Worker and wait for response
   */
  private async sendMessage<T extends WasmVrfWorkerRequestType>(
    message: VRFWorkerMessage<T>,
    customTimeout?: number
  ): Promise<VRFWorkerResponse> {
    return new Promise((resolve, reject) => {
      if (!this.vrfWorker) {
        reject(new Error('VRF Web Worker not available'));
        return;
      }

      const timeoutMs = (customTimeout ?? this.config.workerTimeout ?? 60_000);
      const timeout = setTimeout(() => {
        reject(new Error(`VRF Web Worker communication timeout (${timeoutMs}ms) for message type: ${message.type}`));
      }, timeoutMs);

      const handleMessage = (event: MessageEvent) => {
        const payload = event.data as VRFWorkerResponse | {
          type?: unknown;
          data?: unknown;
        };

        // Intercept SecureConfirm handshake messages from the VRF worker and
        // dispatch them through confirmTxFlow on the main thread. The decision
        // is sent back to the worker as USER_PASSKEY_CONFIRM_RESPONSE and
        // consumed by awaitSecureConfirmationV2; this should not resolve the
        // original VRF request promise.
        if ((payload as any)?.type === SecureConfirmMessageType.PROMPT_USER_CONFIRM_IN_JS_MAIN_THREAD) {
          const env = payload as {
            type: SecureConfirmMessageType.PROMPT_USER_CONFIRM_IN_JS_MAIN_THREAD;
            data: SecureConfirmRequest;
          };
          const ctx = this.getContext();
          if (!this.vrfWorker) {
            console.error('[VRF] SecureConfirm: vrfWorker missing for PROMPT_USER_CONFIRM_IN_JS_MAIN_THREAD');
            return;
          }
          void handlePromptUserConfirmInJsMainThread(ctx, env, this.vrfWorker);
          return;
        }

        const response = payload as VRFWorkerResponse;
        if (response.id === message.id) {
          clearTimeout(timeout);
          this.vrfWorker!.removeEventListener('message', handleMessage);
          resolve(response);
        }
      };

      this.vrfWorker.addEventListener('message', handleMessage);
      this.vrfWorker.postMessage(message);
    });
  }

  /**
   * Generate unique message ID
   */
  private generateMessageId(): string {
    return `vrf_${Date.now()}_${++this.messageId}`;
  }

  /**
   * Unlock VRF keypair in Web Worker memory using PRF output
   * This is called during login to decrypt and load the VRF keypair in-memory
   */
  async unlockVrfKeypair(args: {
    credential: WebAuthnAuthenticationCredential;
    nearAccountId: AccountId;
    encryptedVrfKeypair: EncryptedVRFKeypair;
    onEvent?: (event: { type: string; data: { step: string; message: string } }) => void;
  }): Promise<VRFWorkerResponse> {
    return unlockVrfKeypair(this.getHandlerContext(), args);
  }

  async generateVrfChallengeForSession(inputData: VRFInputData, sessionId: string): Promise<VRFChallenge> {
    return generateVrfChallengeForSession(this.getHandlerContext(), inputData, sessionId);
  }

  async generateVrfChallengeOnce(inputData: VRFInputData): Promise<VRFChallenge> {
    return generateVrfChallengeOnce(this.getHandlerContext(), inputData);
  }

  /**
   * Get current VRF session status
   */
  async checkVrfStatus(): Promise<VRFWorkerStatus> {
    return checkVrfStatus(this.getHandlerContext());
  }

  /**
   * Logout and clear VRF session
   */
  async clearVrfSession(): Promise<void> {
    return clearVrfSession(this.getHandlerContext());
  }

  /**
   * Set the current VRF account ID at the TypeScript level
   * Used after VRF keypair is loaded in WASM memory (e.g., after deriveVrfKeypairFromPrf)
   * to track which account has an active VRF session
   */
  setCurrentVrfAccountId(nearAccountId: AccountId): void {
    this.currentVrfAccountId = nearAccountId;
    console.debug(`VRF Manager: Current VRF account ID set to ${nearAccountId}`);
  }

  /**
   * Generate VRF keypair for bootstrapping - stores in memory unencrypted temporarily
   * This is used during registration to generate a VRF keypair that will be used for
   * WebAuthn ceremony and later encrypted with the real PRF output
   *
   * @param saveInMemory - Always true for bootstrap (VRF keypair stored in memory)
   * @param vrfInputParams - Optional parameters to generate VRF challenge/proof in same call
   * @returns VRF public key and optionally VRF challenge data
   */
  async generateVrfKeypairBootstrap(args: {
    vrfInputData: VRFInputData;
    saveInMemory: boolean;
    sessionId?: string;
  }): Promise<{
    vrfPublicKey: string;
    vrfChallenge: VRFChallenge;
  }> {
    return generateVrfKeypairBootstrap(this.getHandlerContext(), args);
  }

  /**
   * Derive deterministic VRF keypair from PRF output embedded in a WebAuthn credential.
   * Optionally generates VRF challenge if input parameters are provided
   * This enables deterministic VRF key derivation without needing stored VRF keypairs
   *
   * @param credential - WebAuthn credential containing PRF outputs
   * @param nearAccountId - NEAR account ID for key derivation salt
   * @param vrfInputParams - Optional VRF input parameters for challenge generation
   * @returns Deterministic VRF public key, optional VRF challenge, and encrypted VRF keypair for storage
   */
  async deriveVrfKeypairFromPrf(args: {
    credential: WebAuthnRegistrationCredential | WebAuthnAuthenticationCredential;
    nearAccountId: AccountId;
    vrfInputData?: VRFInputData; // optional, for challenge generation
    saveInMemory?: boolean; // optional, whether to save in worker memory
  }): Promise<{
    vrfPublicKey: string;
    vrfChallenge: VRFChallenge | null;
    encryptedVrfKeypair: EncryptedVRFKeypair;
    serverEncryptedVrfKeypair: ServerEncryptedVrfKeypair | null;
  }> {
    return deriveVrfKeypairFromPrf(this.getHandlerContext(), args);
  }

  /**
   * This securely decrypts the shamir3Pass encrypted VRF keypair and loads it into memory
   * It performs Shamir-3-Pass commutative decryption within WASM worker with the relay-server
   */
  async shamir3PassDecryptVrfKeypair(args: {
    nearAccountId: AccountId;
    kek_s_b64u: string;
    ciphertextVrfB64u: string;
    serverKeyId: string;
  }): Promise<VRFWorkerResponse> {
    return shamir3PassDecryptVrfKeypair(this.getHandlerContext(), args);
  }

  /**
   * Shamir 3-pass: encrypt the currently unlocked VRF keypair under the server key
   * Returns a fresh serverEncryptedVrfKeypair blob for IndexedDB.
   * Requires: current VRF keypair is unlocked and present in worker memory.
   */
  async shamir3PassEncryptCurrentVrfKeypair(): Promise<{
    ciphertextVrfB64u: string;
    kek_s_b64u: string;
    serverKeyId: string;
  }> {
    return shamir3PassEncryptCurrentVrfKeypair(this.getHandlerContext());
  }

  /**
   * Test Web Worker communication
   */
  private async testWebWorkerCommunication(): Promise<void> {
    try {
      const timeoutMs = 2000;
      const pingResponse = await this.sendMessage({
        type: 'PING',
        id: this.generateMessageId(),
        payload: {} as WasmVrfWorkerRequestType
      }, timeoutMs);
      if (!pingResponse.success) {
        throw new Error(`VRF Web Worker PING failed: ${pingResponse.error}`);
      }
      return;
    } catch (error: any) {
      console.warn(`️VRF Manager: testWebWorkerCommunication failed:`, error.message);
    }
  }
}
