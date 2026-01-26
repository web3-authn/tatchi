import { SIGNER_WORKER_MANAGER_CONFIG } from "../../../config";
import { ClientAuthenticatorData, UnifiedIndexedDBManager } from '../../IndexedDBManager';
import { IndexedDBManager } from '../../IndexedDBManager';
import { SignedTransaction, type NearClient } from '../../NearClient';
import { isObject } from '@/utils/validation';
import { resolveWorkerUrl } from '../../sdkPaths';
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
import { VrfWorkerManager } from '../VrfWorkerManager';
import { VRFChallenge } from '../../types/vrf-worker';
import type { ActionArgsWasm, TransactionInputWasm } from '../../types/actions';
import type { DelegateActionInput } from '../../types/delegate';
import type { onProgressEvents, RegistrationEventStep3 } from '../../types/sdkSentEvents';
import type { AuthenticatorOptions } from '../../types/authenticatorOptions';
import { AccountId } from "../../types/accountIds";
import { TransactionContext } from '../../types/rpc';
import {
  ConfirmationConfig,
  type SignerMode,
  WasmSignedDelegate,
} from '../../types/signer-worker';
import type { ThresholdBehavior } from '../../types/signer-worker';
import { TouchIdPrompt } from "../touchIdPrompt";
import { isSignerWorkerControlMessage } from './sessionMessages';
import { WorkerControlMessage } from '../../workerControlMessages';

import {
  decryptPrivateKeyWithPrf,
  checkCanRegisterUser,
  signTransactionsWithActions,
  recoverKeypairFromPasskey,
  extractCosePublicKey,
  signTransactionWithKeyPair,
  signNep413Message,
  deriveNearKeypairAndEncryptFromSerialized,
  signDelegateAction,
  registerDevice2WithDerivedKey,
  exportNearKeypairUi,
  deriveThresholdEd25519ClientVerifyingShare,
} from './handlers';
import { RpcCallPayload } from '../../types/signer-worker';
import { UserPreferencesManager } from '../userPreferences';
import { NonceManager } from '../../nonceManager';
import type { ThemeName } from '../../types/tatchi';
import { WebAuthnAuthenticationCredential, WebAuthnRegistrationCredential } from '../../types';
import { toError } from '@/utils/errors';
import { withSessionId } from './handlers/session';
import { attachSessionPort } from './sessionHandshake.js';

type WithOptionalSessionId<T> = T extends { sessionId: string }
  ? Omit<T, 'sessionId'> & { sessionId?: string }
  : T;

type SigningSessionEntry = {
  worker: Worker;
  wrapKeySeedPort?: MessagePort;
  createdAt: number;
};

export interface SignerWorkerManagerContext {
  touchIdPrompt: TouchIdPrompt;
  nearClient: NearClient;
  indexedDB: UnifiedIndexedDBManager;
  userPreferencesManager: UserPreferencesManager;
  nonceManager: NonceManager;
  getTheme?: () => ThemeName;
  relayerUrl: string;
  rpIdOverride?: string;
  nearExplorerUrl?: string;
  vrfWorkerManager?: VrfWorkerManager;
  sendMessage: <T extends keyof WorkerRequestTypeMap>(args: {
    message: {
      type: T;
      payload: WithOptionalSessionId<WorkerRequestTypeMap[T]['request']>;
    };
    onEvent?: (update: onProgressEvents) => void;
    timeoutMs?: number;
    sessionId?: string;
  }) => Promise<WorkerResponseForRequest<T>>;
};

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
  private relayerUrl: string;
  private workerBaseOrigin: string | undefined;
  private nearExplorerUrl?: string;
  private getTheme?: () => ThemeName;

  constructor(
    vrfWorkerManager: VrfWorkerManager,
    nearClient: NearClient,
    userPreferencesManager: UserPreferencesManager,
    nonceManager: NonceManager,
    relayerUrl: string,
    rpIdOverride?: string,
    enableSafariGetWebauthnRegistrationFallback: boolean = true,
    nearExplorerUrl?: string,
    getTheme?: () => ThemeName,
  ) {
    this.indexedDB = IndexedDBManager;
    this.touchIdPrompt = new TouchIdPrompt(rpIdOverride, enableSafariGetWebauthnRegistrationFallback);
    this.vrfWorkerManager = vrfWorkerManager;
    this.nearClient = nearClient;
    this.userPreferencesManager = userPreferencesManager;
    this.nonceManager = nonceManager;
    this.relayerUrl = relayerUrl;
    this.nearExplorerUrl = nearExplorerUrl;
    this.getTheme = getTheme;
  }

  setWorkerBaseOrigin(origin: string | undefined): void {
    this.workerBaseOrigin = origin;
  }

  getContext(): SignerWorkerManagerContext {
    return {
      sendMessage: this.sendMessage.bind(this), // bind to access this.createSecureWorker
      indexedDB: this.indexedDB,
      touchIdPrompt: this.touchIdPrompt,
      vrfWorkerManager: this.vrfWorkerManager,
      nearClient: this.nearClient,
      userPreferencesManager: this.userPreferencesManager,
      nonceManager: this.nonceManager,
      getTheme: this.getTheme,
      rpIdOverride: this.touchIdPrompt.getRpId(),
      nearExplorerUrl: this.nearExplorerUrl,
      relayerUrl: this.relayerUrl,
    };
  }

  createSecureWorker(): Worker {
    const workerUrlStr = resolveWorkerUrl(
      SIGNER_WORKER_MANAGER_CONFIG.WORKER.URL,
      { worker: 'signer', baseOrigin: this.workerBaseOrigin }
    )
    try {
      const worker = new Worker(workerUrlStr, {
        type: SIGNER_WORKER_MANAGER_CONFIG.WORKER.TYPE,
        name: SIGNER_WORKER_MANAGER_CONFIG.WORKER.NAME
      });
      // minimal error handler in tests; avoid noisy logs
      worker.onerror = () => {};
      return worker;
    } catch (error) {
      // Do not silently downgrade to same‑origin. Cross‑origin workers must be
      // resolvable under the configured wallet origin with proper headers.
      // Surface a precise error so tests assert the real path.
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to create secure worker: ${msg}`);
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
  // Map of active signing sessions to reserved workers and optional WrapKeySeed ports
  private signingSessions: Map<string, SigningSessionEntry> = new Map();
  private readonly SIGNING_SESSION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
  // Queue operations per Worker instance to avoid clobbering `worker.onmessage`
  // when multiple sendMessage() calls target the same session worker concurrently.
  private sendQueueByWorker: WeakMap<Worker, Promise<unknown>> = new WeakMap();

  private enqueueOnWorker<T>(worker: Worker, task: () => Promise<T>): Promise<T> {
    const prev = this.sendQueueByWorker.get(worker) ?? Promise.resolve();
    const next = prev.catch(() => undefined).then(task);
    this.sendQueueByWorker.set(worker, next as Promise<unknown>);
    // Best-effort cleanup so resolved promises don't accumulate for long-lived session workers.
    void next.finally(() => {
      if (this.sendQueueByWorker.get(worker) === (next as Promise<unknown>)) {
        this.sendQueueByWorker.delete(worker);
      }
    });
    return next;
  }

  /**
   * Force-terminate all worker instances and session state.
   *
   * Intended for explicit logout flows where we want to:
   * - cancel any in-flight signing operations
   * - close any session MessagePorts
   * - zeroize worker memory by terminating workers
   */
  reset(): void {
    // Terminate all active session workers and close associated ports.
    for (const [sessionId, entry] of Array.from(this.signingSessions.entries())) {
      try { entry.wrapKeySeedPort?.close(); } catch {}
      try { entry.worker.terminate(); } catch {}
      this.signingSessions.delete(sessionId);
    }

    // Terminate any idle workers in the pool.
    for (const worker of this.workerPool) {
      try { worker.terminate(); } catch {}
    }
    this.workerPool = [];
    // Drop any queued message chains tied to terminated worker instances.
    this.sendQueueByWorker = new WeakMap();
  }

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

  /**
   * Reserve a signer worker "session"
   *
   * What this does:
   * - Reserves a specific `Worker` instance from the pool and pins it to `sessionId`.
   * - Ensures the signer worker has a dedicated `MessagePort` attached for receiving `WrapKeySeed`
   *   from the VRF worker (VRF → Signer channel).
   *
   * Port wiring:
   * - The VRF worker retains one end of a `MessageChannel` and the signer worker receives the other.
   * - This method attaches the signer-facing port via a control message (`ATTACH_WRAP_KEY_SEED_PORT`)
   *   and waits for an ACK (`ATTACH_WRAP_KEY_SEED_PORT_OK`) before exposing the session.
   *
   * @param sessionId - Session identifier used to correlate MessagePorts + ready signals.
   * @param opts.signerPort - Optional signer-facing `MessagePort` created/owned by the caller (VRF-created channel).
   *                         If omitted, this method creates a fresh `MessageChannel` and returns `vrfPort` so the
   *                         caller can transfer it to the VRF worker.
   * @returns `{ worker, signerPort, vrfPort }` where `vrfPort` is only present when we created the channel here.
   */
  async reserveSignerWorkerSession(sessionId: string, opts?: { signerPort?: MessagePort }): Promise<{ worker: Worker; signerPort?: MessagePort; vrfPort?: MessagePort }> {
    if (this.signingSessions.has(sessionId)) {
      throw new Error(`Signing session already exists for id: ${sessionId}`);
    }
    // Reserve a worker from the pool for this sessionId.
    const worker = this.getWorkerFromPool();
    let signerPort = opts?.signerPort;
    let vrfPort: MessagePort | undefined;
    if (!signerPort) {
      // If caller did not provide a signer-facing port, create a channel.
      // - port1 => signer worker (receiver)
      // - port2 => VRF worker (sender) returned to caller
      const channel = new MessageChannel();
      signerPort = channel.port1;
      vrfPort = channel.port2;
    }

    // Attach the signerPort to the worker and wait for ACK before adding to signingSessions
    try {
      if (!signerPort) {
        throw new Error('Missing signerPort for signing session');
      }

      // Use centralized handshake logic (registers listener, sends message, waits for ACK)
      await attachSessionPort(worker, sessionId, signerPort);

      // Only add to signingSessions after successful attachment
      // (prevents callers from observing a session that can't receive WrapKeySeed yet).
      this.signingSessions.set(sessionId, {
        worker,
        wrapKeySeedPort: signerPort,
        createdAt: Date.now(),
      });

    } catch (err) {
      console.error('[SignerWorkerManager]: Failed to attach WrapKeySeed port to signer worker', err);
      // Best-effort cleanup
      try { signerPort?.close(); } catch {}
      try { vrfPort?.close(); } catch {}
      this.terminateAndReplaceWorker(worker);
      this.signingSessions.delete(sessionId);
      throw err;
    }
    return { worker, signerPort, vrfPort };
  }

  /**
   * Release a signing session: close ports and terminate/replace the worker to zeroize state.
   */
  releaseSigningSession(sessionId: string): void {
    const entry = this.signingSessions.get(sessionId);
    if (!entry) return;
    try { entry.wrapKeySeedPort?.close() } catch {}
    try { this.terminateAndReplaceWorker(entry.worker) } catch {}
    this.signingSessions.delete(sessionId);
  }

  /**
   * Sweep expired signing sessions based on createdAt and timeout.
   */
  sweepExpiredSigningSessions(): void {
    const now = Date.now();
    for (const [sessionId, entry] of this.signingSessions.entries()) {
      if (now - entry.createdAt > this.SIGNING_SESSION_TIMEOUT_MS) {
        this.releaseSigningSession(sessionId);
      }
    }
  }

  private async createReplacementWorker(): Promise<void> {
    try {
      const worker = this.createSecureWorker();

      // Simple health check
      const healthPromise = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Health check timeout')), 5000);

        const onMessage = (event: MessageEvent) => {
          if (event.data?.type === WorkerControlMessage.WORKER_READY || event.data?.ready) {
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
              if (event.data?.type === WorkerControlMessage.WORKER_READY || event.data?.ready) {
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
              // Pre-warm timeouts are benign; workers will be created on-demand later.
              // console.debug(`WebAuthnManager: Worker ${i + 1} pre-warm timeout`);
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

  private async sendMessage<T extends keyof WorkerRequestTypeMap>({
    sessionId,
    message,
    onEvent,
    timeoutMs = SIGNER_WORKER_MANAGER_CONFIG.TIMEOUTS.DEFAULT, // 60s
  }: {
    sessionId?: string;
    message: { type: T; payload: WithOptionalSessionId<WorkerRequestTypeMap[T]['request']> };
    onEvent?: (update: onProgressEvents) => void;
    timeoutMs?: number;
  }): Promise<WorkerResponseForRequest<T>> {

    // Clean up any expired signing sessions before allocating a worker
    this.sweepExpiredSigningSessions();

    const payloadSessionId = (message.payload as any)?.sessionId as string | undefined;
    if (sessionId && payloadSessionId && payloadSessionId !== sessionId) {
      throw new Error(
        `sendMessage: payload.sessionId (${payloadSessionId}) does not match provided sessionId (${sessionId})`
      );
    }

    const effectiveSessionId = sessionId || payloadSessionId;
    const sessionEntry = effectiveSessionId ? this.signingSessions.get(effectiveSessionId) : undefined;
    if (effectiveSessionId && !sessionEntry) {
      throw new Error(`Signing session not found for id: ${effectiveSessionId}`);
    }

    // Normalize/inject sessionId into payload once to avoid duplication at call sites.
    const finalPayload = effectiveSessionId
      ? withSessionId(effectiveSessionId, message.payload)
      : (message.payload);

    const worker = sessionEntry ? sessionEntry.worker : this.getWorkerFromPool();
    const isSessionWorker = !!sessionEntry;

    return this.enqueueOnWorker(worker, () => new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        try {
          if (isSessionWorker && effectiveSessionId) {
            // Release reserved session to avoid leaking worker/port
            this.releaseSigningSession(effectiveSessionId);
          } else {
            this.terminateAndReplaceWorker(worker);
          }
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
          // Ignore control messages (lifecycle/session setup) – they are handled elsewhere.
          if (isSignerWorkerControlMessage(event?.data)) {
            return;
          }
          // Ignore readiness pings that can arrive if a worker was just spawned
          if (event?.data?.type === WorkerControlMessage.WORKER_READY || event?.data?.ready) {
            return; // not a response to an operation
          }
          // Use strong typing from WASM-generated types
          const response = event.data as WorkerResponseForRequest<T>;
          responses.push(response);

          // Handle progress updates using WASM-generated numeric enum values
          if (isWorkerProgress(response)) {
            const progressResponse = response as WorkerProgressResponse;
            onEvent?.(progressResponse.payload as onProgressEvents);
            return; // Continue listening for more messages
          }

          // Handle errors using WASM-generated enum
          if (isWorkerError(response)) {
            clearTimeout(timeoutId);
            if (!isSessionWorker) this.terminateAndReplaceWorker(worker);
            const errorResponse = response as WorkerErrorResponse;
            console.error('Worker error response:', errorResponse);
            reject(new Error(errorResponse.payload.error));
            return;
          }

          // Handle successful completion types using strong typing
          if (isWorkerSuccess(response)) {
            clearTimeout(timeoutId);
            if (!isSessionWorker) this.terminateAndReplaceWorker(worker);
            resolve(response as WorkerResponseForRequest<T>);
            return;
          }

          // If we reach here, the response doesn't match any expected type
          console.error('Unexpected worker response format:', {
            response,
          });

          // Check if it's a generic Error object
          if (isObject(response) && 'message' in response && 'stack' in response) {
            clearTimeout(timeoutId);
            if (!isSessionWorker) this.terminateAndReplaceWorker(worker);
            console.error('Worker sent generic Error object:', response);
            reject(new Error(`Worker sent generic error: ${(response as Error).message}`));
            return;
          }

          // Unknown response format
          clearTimeout(timeoutId);
          if (!isSessionWorker) this.terminateAndReplaceWorker(worker);
          reject(new Error(`Unknown worker response format: ${JSON.stringify(response)}`));
        } catch (error: unknown) {
          clearTimeout(timeoutId);
          if (!isSessionWorker) this.terminateAndReplaceWorker(worker);
          console.error('Error processing worker message:', error);
          const err = toError(error);
          reject(new Error(`Worker message processing error: ${err.message}`));
        }
      };

      worker.onerror = (event) => {
        clearTimeout(timeoutId);
        if (!isSessionWorker) this.terminateAndReplaceWorker(worker);
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
        payload: finalPayload,
      };

      worker.postMessage(formattedMessage);
    }));
  }

  /**
   * Derive NEAR keypair from a serialized WebAuthn registration credential
   */
  async deriveNearKeypairAndEncryptFromSerialized(args: {
    credential: WebAuthnRegistrationCredential;
    nearAccountId: AccountId;
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
  }> {
    return deriveNearKeypairAndEncryptFromSerialized({ ctx: this.getContext(), ...args });
  }

  async deriveThresholdEd25519ClientVerifyingShare(args: {
    sessionId: string;
    nearAccountId: AccountId;
  }): Promise<{
    success: boolean;
    nearAccountId: string;
    clientVerifyingShareB64u: string;
    wrapKeySalt: string;
    error?: string;
  }> {
    return deriveThresholdEd25519ClientVerifyingShare({
      ctx: this.getContext(),
      sessionId: args.sessionId,
      nearAccountId: String(args.nearAccountId),
    });
  }

  /**
   * Secure private key decryption with dual PRF
   */
  async decryptPrivateKeyWithPrf(args: {
    nearAccountId: AccountId,
    authenticators: ClientAuthenticatorData[],
    sessionId: string,
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
    onEvent?: (update: RegistrationEventStep3) => void;
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

  /**
   * Combined Device2 registration: derive NEAR keypair + sign registration transaction
   * in a single operation without requiring a separate authentication prompt.
   *
   * This replaces the old two-step flow (register → authenticate → sign).
   * PRF.second and WrapKeySeed are already in the signer worker via MessagePort.
   */
  async registerDevice2WithDerivedKey(args: {
    sessionId: string;
    nearAccountId: AccountId;
    credential: WebAuthnRegistrationCredential;
    vrfChallenge: VRFChallenge;
    transactionContext: TransactionContext;
    contractId: string;
    wrapKeySalt: string;
    deviceNumber?: number;
    deterministicVrfPublicKey: string;
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
    error?: string;
  }> {
    return registerDevice2WithDerivedKey({ ctx: this.getContext(), ...args });
  }

  // === ACTION-BASED SIGNING METHODS ===

  /**
   * Sign multiple transactions with shared VRF challenge and credential
   * Efficiently processes multiple transactions with one PRF authentication
   */
  async signTransactionsWithActions(args: {
    transactions: TransactionInputWasm[],
    rpcCall: RpcCallPayload,
    signerMode: SignerMode,
    onEvent?: (update: onProgressEvents) => void,
    confirmationConfigOverride?: Partial<ConfirmationConfig>,
    title?: string;
    body?: string;
    sessionId: string,
  }): Promise<Array<{
    signedTransaction: SignedTransaction;
    nearAccountId: AccountId;
    logs?: string[]
  }>> {
    return signTransactionsWithActions({
      ctx: this.getContext(),
      ...args
    });
  }

  async signDelegateAction(args: {
    delegate: DelegateActionInput;
    rpcCall: RpcCallPayload;
    signerMode: SignerMode;
    onEvent?: (update: onProgressEvents) => void;
    confirmationConfigOverride?: Partial<ConfirmationConfig>;
    title?: string;
    body?: string;
    sessionId: string;
  }): Promise<{
    signedDelegate: WasmSignedDelegate;
    hash: string;
    nearAccountId: AccountId;
    logs?: string[];
  }> {
    return signDelegateAction({ ctx: this.getContext(), ...args });
  }

  /**
   * Recover keypair from authentication credential for account recovery
   * Uses dual PRF-based Ed25519 key derivation with account-specific HKDF and AES encryption
   */
  async recoverKeypairFromPasskey(args: {
    credential: WebAuthnAuthenticationCredential;
    accountIdHint?: string;
    sessionId: string,
  }): Promise<{
    publicKey: string;
    encryptedPrivateKey: string;
    /** Base64url-encoded AEAD nonce (ChaCha20-Poly1305) for encrypted key */
    chacha20NonceB64u: string;
    accountIdHint?: string;
    wrapKeySalt: string;
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
    signerMode: SignerMode;
    title?: string;
    body?: string;
    confirmationConfigOverride?: Partial<ConfirmationConfig>;
    sessionId: string;
    contractId?: string;
    nearRpcUrl?: string;
  }): Promise<{
    success: boolean;
    accountId: string;
    publicKey: string;
    signature: string;
    state?: string;
    error?: string;
  }> {
    return signNep413Message({
      ctx: this.getContext(),
      payload
    });
  }

  /**
   * Two-phase export (worker-driven):
   *  - Phase 1: collect PRF (uiMode: 'none')
   *  - Decrypt inside worker
   *  - Phase 2: show export UI with decrypted key (kept open until user closes)
   */
  async exportNearKeypairUi(args: {
    nearAccountId: AccountId,
    variant?: 'drawer'|'modal',
    theme?: 'dark'|'light',
    sessionId: string,
  }): Promise<void> {
    return exportNearKeypairUi({ ctx: this.getContext(), ...args });
  }

}
