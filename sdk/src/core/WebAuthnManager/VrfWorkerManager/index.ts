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
  WasmGenerateVrfChallengeRequest,
  WasmGenerateVrfKeypairBootstrapRequest,
  WasmShamir3PassConfigPRequest,
  WasmShamir3PassConfigServerUrlsRequest,
  WasmShamir3PassClientDecryptVrfKeypairRequest,
  WasmUnlockVrfKeypairRequest,
  WasmDeriveVrfKeypairFromPrfRequest,
  WasmDeriveWrapKeySeedAndSessionRequest,
  WasmDevice2RegistrationSessionRequest,
} from '../../types/vrf-worker';
import { VRFChallenge, validateVRFChallenge } from '../../types/vrf-worker';
import { BUILD_PATHS } from '../../../../build-paths.js';
import { resolveWorkerUrl } from '../../sdkPaths';
import { AccountId, toAccountId } from '../../types/accountIds';
import { extractPrfFromCredential } from '../credentialsHelpers';
import type { TouchIdPrompt } from '../touchIdPrompt';
import type { NearClient } from '../../NearClient';
import type { UnifiedIndexedDBManager } from '../../IndexedDBManager';
import type { UserPreferencesManager } from '../userPreferences';
import type { NonceManager } from '../../nonceManager';
import { runSecureConfirm } from './secureConfirmBridge';
import {
  SecureConfirmationType,
  SecureConfirmMessageType,
  type SecureConfirmRequest,
  type SignTransactionPayload,
  type TransactionSummary,
  type SerializableCredential,
} from './confirmTxFlow/types';
import type { SignNep413Payload } from './confirmTxFlow/types';
import { ActionType, type TransactionInputWasm } from '../../types/actions';
import type { RpcCallPayload, ConfirmationConfig } from '../../types/signer-worker';
import { computeUiIntentDigestFromTxs, orderActionForDigest } from '../LitComponents/common/tx-digest';
import { TransactionContext } from '../../types/rpc';
import {
  requestRegistrationCredentialConfirmation
} from './confirmTxFlow/flows/requestRegistrationCredentialConfirmation';
import type { RegistrationCredentialConfirmationPayload } from '../SignerWorkerManager/handlers/validation';
import { WebAuthnAuthenticationCredential, WebAuthnRegistrationCredential } from '../../types/webauthn';
import { handlePromptUserConfirmInJsMainThread } from './confirmTxFlow';

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
  vrfWorkerManager?: VrfWorkerManager;
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

  /**
   * Create a VRF-owned MessageChannel for signing and return the signer-facing port.
   * VRF retains the sibling port for WrapKeySeed delivery.
   */
  async createSigningSessionChannel(sessionId: string): Promise<MessagePort> {
    await this.ensureWorkerReady(true);
    const channel = new MessageChannel();
    // Hand one port to the VRF worker (Rust) so it can deliver WrapKeySeed directly
    // to the signer worker without exposing it to the main thread.
    try {
      this.vrfWorker!.postMessage(
        { type: 'ATTACH_WRAP_KEY_SEED_PORT', sessionId },
        [channel.port1],
      );
    } catch (err) {
      console.error('[VrfWorkerManager] Failed to attach WrapKeySeed port to VRF worker', err);
      throw err;
    }
    return channel.port2;
  }

  /**
   * Derive WrapKeySeed in the VRF worker and deliver it (along with PRF.second if credential provided)
   * to the signer worker via the registered port.
   */
  async deriveWrapKeySeedAndSendToSigner(args: {
    sessionId: string;
    prfFirstAuthB64u: string;
    // Optional vault wrapKeySalt. When omitted or empty, VRF worker will generate a fresh wrapKeySalt.
    wrapKeySalt?: string;
    // Optional contract verification context; when provided, VRF Rust will call
    // verify_authentication_response before deriving WrapKeySeed.
    contractId?: string;
    nearRpcUrl?: string;
    vrfChallenge?: VRFChallenge;
    // Optional credential for PRF.second extraction (registration or authentication)
    credential?: WebAuthnRegistrationCredential | WebAuthnAuthenticationCredential;
  }): Promise<{ sessionId: string; wrapKeySalt: string }> {
    await this.ensureWorkerReady(true);
    const message: VRFWorkerMessage<WasmDeriveWrapKeySeedAndSessionRequest> = {
      type: 'DERIVE_WRAP_KEY_SEED_AND_SESSION',
      id: this.generateMessageId(),
      payload: {
        sessionId: args.sessionId,
        prfFirstAuthB64u: args.prfFirstAuthB64u,
        // Use empty string as a sentinel to tell the VRF worker to generate wrapKeySalt when none is provided.
        wrapKeySalt: args.wrapKeySalt ?? '',
        contractId: args.contractId,
        nearRpcUrl: args.nearRpcUrl,
        vrfChallenge: args.vrfChallenge,
        credential: args.credential,
      }
    };
    const response = await this.sendMessage<WasmDeriveWrapKeySeedAndSessionRequest>(message);
    if (!response.success) {
      throw new Error(`deriveWrapKeySeedAndSendToSigner failed: ${response.error}`);
    }
    // VRF WASM now delivers WrapKeySeed + wrapKeySalt directly to the signer worker via the
    // attached MessagePort; TS only needs to know that the session is prepared and
    // what wrapKeySalt was actually used (for new vault entries).
    const data = (response.data as unknown) as { sessionId: string; wrapKeySalt?: string } | undefined;
    const wrapKeySalt = data?.wrapKeySalt ?? args.wrapKeySalt ?? '';
    if (!wrapKeySalt) {
      throw new Error('deriveWrapKeySeedAndSendToSigner: VRF worker did not return wrapKeySalt');
    }
    return { sessionId: data?.sessionId ?? args.sessionId, wrapKeySalt };
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
  }): Promise<void> {
    if (!args.wrapKeySalt) {
      throw new Error('wrapKeySalt is required for decrypt session');
    }
    await this.ensureWorkerReady(true);
    const message: VRFWorkerMessage<any> = {
      type: 'DECRYPT_SESSION',
      id: this.generateMessageId(),
      payload: {
        sessionId: args.sessionId,
        nearAccountId: String(args.nearAccountId),
        wrapKeySalt: args.wrapKeySalt,
      },
    };
    try {
      console.debug('[VRF] prepareDecryptSession: start', {
        sessionId: args.sessionId,
        nearAccountId: String(args.nearAccountId),
      });
      const response = await this.sendMessage(message);
      if (!response.success) {
        console.error('[VRF] prepareDecryptSession: worker reported failure', {
          sessionId: args.sessionId,
          nearAccountId: String(args.nearAccountId),
          error: response.error,
        });
        throw new Error(`prepareDecryptSession failed: ${response.error}`);
      }
      console.debug('[VRF] prepareDecryptSession: success', {
        sessionId: args.sessionId,
        nearAccountId: String(args.nearAccountId),
      });
    } catch (error) {
      console.error('[VRF] prepareDecryptSession: error', {
        sessionId: args.sessionId,
        nearAccountId: String(args.nearAccountId),
        error,
      });
      throw error;
    }
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
    confirmationConfigOverride?: Partial<ConfirmationConfig>;
  } | {
    ctx: VrfWorkerManagerContext;
    sessionId: string;
    kind: 'nep413';
    nearAccountId: string;
    message: string;
    recipient: string;
    confirmationConfigOverride?: Partial<ConfirmationConfig>;
  }): Promise<{
    sessionId: string;
    wrapKeySalt: string;
    vrfChallenge: VRFChallenge;
    transactionContext: TransactionContext;
    intentDigest: string;
    credential: SerializableCredential;
  }> {
    const { ctx, sessionId } = params;

    // Canonical intent digest for transactions: hash only receiverId + ordered actions,
    // excluding nonce and other per-tx metadata, to stay in sync with UI confirmers.
    const intentDigest = params.kind === 'transaction'
      ? await computeUiIntentDigestFromTxs(
          params.txSigningRequests.map(tx => ({
            receiverId: tx.receiverId,
            actions: tx.actions.map(orderActionForDigest),
          })) as TransactionInputWasm[]
        )
      : `${params.nearAccountId}:${params.recipient}:${params.message}`;

    const summary: TransactionSummary = params.kind === 'transaction'
      ? {
          intentDigest,
          receiverId: params.txSigningRequests[0]?.receiverId,
          totalAmount: computeTotalAmountYocto(params.txSigningRequests),
        }
      : {
          intentDigest,
          method: 'NEP-413',
          receiverId: params.recipient,
        };

    const request: SecureConfirmRequest<SignTransactionPayload | SignNep413Payload, TransactionSummary> =
      params.kind === 'transaction'
        ? {
            schemaVersion: 2,
            requestId: sessionId,
            type: SecureConfirmationType.SIGN_TRANSACTION,
            summary,
            payload: {
              txSigningRequests: params.txSigningRequests,
              intentDigest,
              rpcCall: params.rpcCall,
            },
            confirmationConfig: params.confirmationConfigOverride,
            intentDigest,
          }
        : {
            schemaVersion: 2,
            requestId: sessionId,
            type: SecureConfirmationType.SIGN_NEP413_MESSAGE,
            summary,
            payload: {
              nearAccountId: params.nearAccountId,
              message: params.message,
              recipient: params.recipient,
            },
            confirmationConfig: params.confirmationConfigOverride,
            intentDigest,
          };

    const decision = await runSecureConfirm(ctx, request);
    if (!decision.confirmed) {
      throw new Error(decision.error || 'User rejected signing request');
    }
    if (!decision.credential) {
      throw new Error('Missing credential from confirmation flow');
    }
    if (!decision.vrfChallenge) {
      throw new Error('Missing vrfChallenge from confirmation flow');
    }
    if (!decision.transactionContext) {
      throw new Error('Missing transactionContext from confirmation flow');
    }
    const wrapKeySalt = decision.wrapKeySalt || '';

    return {
      sessionId,
      wrapKeySalt,
      vrfChallenge: decision.vrfChallenge,
      transactionContext: decision.transactionContext,
      intentDigest: decision.intentDigest || intentDigest,
      credential: decision.credential,
    };
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
    confirmationConfigOverride?: Partial<ConfirmationConfig>;
    contractId: string;
    nearRpcUrl: string;
  }): Promise<RegistrationCredentialConfirmationPayload> {

    const ctx = this.getContext();
    const decision = await requestRegistrationCredentialConfirmation({
      ctx: ctx,
      ...params,
    });

    if (!decision.confirmed) {
      throw new Error(decision.error || 'User rejected registration request');
    }
    if (!decision.credential) {
      throw new Error('Missing credential from registration confirmation');
    }
    if (!decision.vrfChallenge) {
      throw new Error('Missing vrfChallenge from registration confirmation');
    }
    if (!decision.transactionContext) {
      throw new Error('Missing transactionContext from registration confirmation');
    }

    return decision;
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
    await this.ensureWorkerReady(true);

    const message: VRFWorkerMessage<WasmDevice2RegistrationSessionRequest> = {
      type: 'DEVICE2_REGISTRATION_SESSION',
      id: this.generateMessageId(),
      payload: {
        sessionId: params.sessionId,
        nearAccountId: params.nearAccountId,
        deviceNumber: params.deviceNumber,
        contractId: params.contractId,
        nearRpcUrl: params.nearRpcUrl,
        wrapKeySalt: params.wrapKeySalt || '',
        // No confirmationConfig override for now; can add later if needed
      }
    };

    const response = await this.sendMessage<WasmDevice2RegistrationSessionRequest>(message);

    if (!response.success) {
      throw new Error(`Device2 registration session failed: ${response.error}`);
    }

    const data = response.data as any;

    if (!data.confirmed) {
      throw new Error(data.error || 'User rejected Device2 registration');
    }

    if (!data.credential) {
      throw new Error('Missing credential from Device2 registration session');
    }
    if (!data.vrfChallenge) {
      throw new Error('Missing vrfChallenge from Device2 registration session');
    }
    if (!data.transactionContext) {
      throw new Error('Missing transactionContext from Device2 registration session');
    }
    if (!data.wrapKeySalt) {
      throw new Error('Missing wrapKeySalt from Device2 registration session');
    }

    return {
      confirmed: true,
      sessionId: data.sessionId,
      credential: data.credential,
      vrfChallenge: data.vrfChallenge,
      transactionContext: data.transactionContext,
      wrapKeySalt: data.wrapKeySalt,
      requestId: data.requestId,
      intentDigest: data.intentDigest,
      deterministicVrfPublicKey: data.deterministicVrfPublicKey,
      encryptedVrfKeypair: data.encryptedVrfKeypair,
    };
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
  async unlockVrfKeypair({
    credential,
    nearAccountId,
    encryptedVrfKeypair,
    onEvent,
  }: {
    credential: WebAuthnAuthenticationCredential,
    nearAccountId: AccountId,
    encryptedVrfKeypair: EncryptedVRFKeypair,
    onEvent?: (event: { type: string, data: { step: string, message: string } }) => void,
  }): Promise<VRFWorkerResponse> {
    await this.ensureWorkerReady(true);

    const { chacha20PrfOutput } = extractPrfFromCredential({
      credential,
      firstPrfOutput: true,
      secondPrfOutput: false,
    });

    if (!chacha20PrfOutput) {
      throw new Error('ChaCha20 PRF output not found in WebAuthn credentials');
    }

    onEvent?.({
      type: 'loginProgress',
      data: {
        step: 'verifying-server',
        message: 'TouchId success! Unlocking VRF keypair...'
      }
    });

    const message: VRFWorkerMessage<WasmUnlockVrfKeypairRequest> = {
      type: 'UNLOCK_VRF_KEYPAIR',
      id: this.generateMessageId(),
      payload: {
        nearAccountId,
        encryptedVrfKeypair: encryptedVrfKeypair,
        prfKey: chacha20PrfOutput // already a base64url string
      }
    };

    const response = await this.sendMessage(message);
    if (response.success) {
      // Track the current VRF session account at TypeScript level
      this.currentVrfAccountId = nearAccountId;
      console.debug(`VRF Manager: VRF keypair unlocked for ${nearAccountId}`);
    } else {
      console.error('VRF Manager: Failed to unlock VRF keypair:', response.error);
      console.error('VRF Manager: Full response:', JSON.stringify(response, null, 2));
      console.error('VRF Manager: Message that was sent:', JSON.stringify(message, null, 2));
    }

    return response;
  }

  /**
   * Generate VRF challenge using in-memory VRF keypair
   * This is called during authentication to create WebAuthn challenges
   */
  async generateVrfChallenge(inputData: VRFInputData): Promise<VRFChallenge> {
    await this.ensureWorkerReady(true);
    const message: VRFWorkerMessage<WasmGenerateVrfChallengeRequest> = {
      type: 'GENERATE_VRF_CHALLENGE',
      id: this.generateMessageId(),
      payload: {
        vrfInputData: {
          userId: inputData.userId,
          rpId: inputData.rpId,
          blockHeight: String(inputData.blockHeight),
          blockHash: inputData.blockHash,
        }
      }
    };

    const response = await this.sendMessage(message);

    if (!response.success || !response.data) {
      throw new Error(`VRF challenge generation failed: ${response.error}`);
    }

    const data = response.data as unknown as VRFChallenge;
    console.debug('VRF Manager: VRF challenge generated successfully');
    return validateVRFChallenge(data);
  }

  /**
   * Get current VRF session status
   */
  async checkVrfStatus(): Promise<VRFWorkerStatus> {
    try {
      await this.ensureWorkerReady();
    } catch (error) {
      // If initialization fails, return inactive status
      return { active: false, nearAccountId: null };
    }

    try {
      const message: VRFWorkerMessage<WasmVrfWorkerRequestType> = {
        type: 'CHECK_VRF_STATUS',
        id: this.generateMessageId(),
        payload: {} as WasmVrfWorkerRequestType
      };

      const response = await this.sendMessage(message);

      if (response.success && response.data) {
        const data = response.data as { active: boolean; sessionDuration?: number };
        return {
          active: data.active,
          nearAccountId: this.currentVrfAccountId ? toAccountId(this.currentVrfAccountId) : null,
          sessionDuration: data.sessionDuration
        };
      }

      return { active: false, nearAccountId: null };
    } catch (error) {
      console.warn('VRF Manager: Failed to get VRF status:', error);
      return { active: false, nearAccountId: null };
    }
  }

  /**
   * Logout and clear VRF session
   */
  async clearVrfSession(): Promise<void> {
    console.debug('VRF Manager: Logging out...');

    await this.ensureWorkerReady();

    try {
      const message: VRFWorkerMessage<WasmVrfWorkerRequestType> = {
        type: 'LOGOUT',
        id: this.generateMessageId(),
        payload: {} as WasmVrfWorkerRequestType
      };

      const response = await this.sendMessage(message);

      if (response.success) {
        // Clear the TypeScript-tracked account ID
        this.currentVrfAccountId = null;
        console.debug('VRF Manager: Logged out: VRF keypair securely zeroized');
      } else {
        console.warn('️VRF Manager: Logout failed:', response.error);
      }
    } catch (error) {
      console.warn('VRF Manager: Logout error:', error);
    }
  }

  /**
   * Set the current VRF account ID at the TypeScript level
   * Used after VRF keypair is loaded in WASM memory (e.g., after deriveVrfKeypairFromRawPrf)
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
  async generateVrfKeypairBootstrap({
    vrfInputData,
    saveInMemory = true,
  }: {
    vrfInputData: VRFInputData,
    saveInMemory: boolean,
  }): Promise<{
    vrfPublicKey: string;
    vrfChallenge: VRFChallenge;
  }> {
    await this.ensureWorkerReady();
    try {
      const message: VRFWorkerMessage<WasmGenerateVrfKeypairBootstrapRequest> = {
        type: 'GENERATE_VRF_KEYPAIR_BOOTSTRAP',
        id: this.generateMessageId(),
        payload: {
          // Include VRF input data if provided for challenge generation
          vrfInputData: vrfInputData ? {
            userId: vrfInputData.userId,
            rpId: vrfInputData.rpId,
            blockHeight: String(vrfInputData.blockHeight),
            blockHash: vrfInputData.blockHash,
          } : undefined
        }
      };

      const response = await this.sendMessage(message);

      if (!response.success || !response.data) {
        throw new Error(`VRF bootstrap keypair generation failed: ${response.error}`);
      }
      const data = response.data as { vrf_challenge_data?: VRFChallenge; vrfPublicKey?: string };
      const challengeData = data.vrf_challenge_data as VRFChallenge | undefined;
      if (!challengeData) {
        throw new Error('VRF challenge data failed to be generated');
      }
      const vrfPublicKey = data.vrfPublicKey || challengeData.vrfPublicKey;
      if (!vrfPublicKey) {
        throw new Error('VRF public key missing in bootstrap response');
      }
      if (vrfInputData && saveInMemory) {
        // Track the account ID for this VRF session if saving in memory
        this.currentVrfAccountId = vrfInputData.userId;
      }

      // TODO: strong types generated by Rust wasm-bindgen
      return {
        vrfPublicKey,
        vrfChallenge: validateVRFChallenge({
          vrfInput: challengeData.vrfInput,
          vrfOutput: challengeData.vrfOutput,
          vrfProof: challengeData.vrfProof,
          vrfPublicKey: challengeData.vrfPublicKey,
          userId: challengeData.userId,
          rpId: challengeData.rpId,
          blockHeight: challengeData.blockHeight,
          blockHash: challengeData.blockHash,
        })
      }

    } catch (error: any) {
      console.error('VRF Manager: Bootstrap VRF keypair generation failed:', error);
      throw new Error(`Failed to generate bootstrap VRF keypair: ${error.message}`);
    }
  }

  /**
   * Derive deterministic VRF keypair from PRF output for account recovery
   * Optionally generates VRF challenge if input parameters are provided
   * This enables deterministic VRF key derivation without needing stored VRF keypairs
   *
   * @param prfOutput - Base64url-encoded PRF output from WebAuthn credential (PRF Output 1)
   * @param nearAccountId - NEAR account ID for key derivation salt
   * @param vrfInputParams - Optional VRF input parameters for challenge generation
   * @returns Deterministic VRF public key, optional VRF challenge, and encrypted VRF keypair for storage
   */
  async deriveVrfKeypairFromPrf({
    credential,
    nearAccountId,
    vrfInputData,
    saveInMemory = true,
  }: {
    credential: WebAuthnAuthenticationCredential;
    nearAccountId: AccountId;
    vrfInputData?: VRFInputData; // optional, for challenge generation
    saveInMemory?: boolean; // optional, whether to save in worker memory
  }): Promise<{
    vrfPublicKey: string;
    vrfChallenge: VRFChallenge | null;
    encryptedVrfKeypair: EncryptedVRFKeypair;
    serverEncryptedVrfKeypair: ServerEncryptedVrfKeypair | null;
  }> {
    console.debug('VRF Manager: Deriving deterministic VRF keypair from PRF output');
    try {
      await this.ensureWorkerReady();

      // Extract ChaCha20 PRF output from credential
      // This ensures deterministic derivation: same PRF + same account = same VRF keypair
      const { chacha20PrfOutput } = extractPrfFromCredential({
        credential,
        firstPrfOutput: true,
        secondPrfOutput: false,
      });

      // optional VRF Input data, only needed if generating VRF challenge simultaneously
      const hasVrfInputData = vrfInputData?.blockHash
        && vrfInputData?.blockHeight
        && vrfInputData?.userId
        && vrfInputData?.rpId;


      const message: VRFWorkerMessage<WasmDeriveVrfKeypairFromPrfRequest> = {
        type: 'DERIVE_VRF_KEYPAIR_FROM_PRF',
        id: this.generateMessageId(),
        payload: {
          prfOutput: chacha20PrfOutput,
          nearAccountId: nearAccountId,
          saveInMemory: saveInMemory,
          // Add VRF input parameters if provided for challenge generation
          vrfInputData: hasVrfInputData ? {
            userId: vrfInputData.userId,
            rpId: vrfInputData.rpId,
            blockHeight: String(vrfInputData.blockHeight),
            blockHash: vrfInputData.blockHash,
          } : undefined,
        }
      };

      const response = await this.sendMessage(message);

      if (!response.success || !response.data) {
        throw new Error(`VRF keypair derivation failed: ${response.error}`);
      }
      const data = response.data as {
        vrfPublicKey?: string;
        vrfChallengeData?: VRFChallenge;
        encryptedVrfKeypair: EncryptedVRFKeypair;
        serverEncryptedVrfKeypair?: ServerEncryptedVrfKeypair;
      };
      const vrfPublicKey = data.vrfPublicKey || data.vrfChallengeData?.vrfPublicKey;
      if (!vrfPublicKey) {
        throw new Error('VRF public key not found in response');
      }
      if (!data.encryptedVrfKeypair) {
        throw new Error('Encrypted VRF keypair not found in response - this is required for registration');
      }
      console.debug('VRF Manager: Deterministic VRF keypair derivation successful');

      // VRF challenge data is optional - only generated if vrfInputData was provided
      const vrfChallenge = data.vrfChallengeData
        ? validateVRFChallenge({
            vrfInput: data.vrfChallengeData.vrfInput,
            vrfOutput: data.vrfChallengeData.vrfOutput,
            vrfProof: data.vrfChallengeData.vrfProof,
            vrfPublicKey: data.vrfChallengeData.vrfPublicKey,
            userId: data.vrfChallengeData.userId,
            rpId: data.vrfChallengeData.rpId,
            blockHeight: data.vrfChallengeData.blockHeight,
            blockHash: data.vrfChallengeData.blockHash,
          })
        : null;

      // Track the VRF account ID at TypeScript level when saving in memory
      if (saveInMemory) {
        this.currentVrfAccountId = nearAccountId;
        console.debug(`VRF Manager: VRF keypair loaded in memory for ${nearAccountId}`);
      }

      const result: {
        vrfPublicKey: string;
        vrfChallenge: VRFChallenge | null;
        encryptedVrfKeypair: EncryptedVRFKeypair;
        serverEncryptedVrfKeypair: ServerEncryptedVrfKeypair | null;
      } = {
        vrfPublicKey,
        vrfChallenge,
        encryptedVrfKeypair: data.encryptedVrfKeypair,
        serverEncryptedVrfKeypair: data.serverEncryptedVrfKeypair || null,
      };

      return result;

    } catch (error: any) {
      console.error('VRF Manager: VRF keypair derivation failed:', error);
      throw new Error(`VRF keypair derivation failed: ${error.message}`);
    }
  }

  /**
   * Derive deterministic VRF keypair directly from a base64url PRF output string.
   * Useful when PRF has been obtained via a serialized credential (secureConfirm).
   */
  async deriveVrfKeypairFromRawPrf({
    prfOutput,
    nearAccountId,
    vrfInputData,
    saveInMemory = true,
  }: {
    prfOutput: string;
    nearAccountId: AccountId;
    vrfInputData?: VRFInputData;
    saveInMemory?: boolean;
  }): Promise<{
    vrfPublicKey: string;
    vrfChallenge: VRFChallenge | null;
    encryptedVrfKeypair: EncryptedVRFKeypair;
    serverEncryptedVrfKeypair: ServerEncryptedVrfKeypair | null;
  }> {
    await this.ensureWorkerReady();

    const hasVrfInputData = vrfInputData?.blockHash
      && vrfInputData?.blockHeight
      && vrfInputData?.userId
      && vrfInputData?.rpId;

    const message: VRFWorkerMessage<WasmDeriveVrfKeypairFromPrfRequest> = {
      type: 'DERIVE_VRF_KEYPAIR_FROM_PRF',
      id: this.generateMessageId(),
      payload: {
        prfOutput,
        nearAccountId: nearAccountId,
        saveInMemory: saveInMemory,
        vrfInputData: hasVrfInputData ? {
          userId: vrfInputData.userId,
          rpId: vrfInputData.rpId,
          blockHeight: String(vrfInputData.blockHeight),
          blockHash: vrfInputData.blockHash,
        } : undefined,
      }
    };

    const response = await this.sendMessage(message);
    if (!response.success || !response.data) {
      throw new Error(`VRF keypair derivation failed: ${response.error}`);
    }
    const data = response.data as {
      vrfChallengeData?: VRFChallenge;
      vrfPublicKey?: string;
      encryptedVrfKeypair: EncryptedVRFKeypair;
      serverEncryptedVrfKeypair?: ServerEncryptedVrfKeypair | null;
    };

    const vrfChallenge = data.vrfChallengeData
      ? validateVRFChallenge({
          vrfInput: data.vrfChallengeData.vrfInput,
          vrfOutput: data.vrfChallengeData.vrfOutput,
          vrfProof: data.vrfChallengeData.vrfProof,
          vrfPublicKey: data.vrfChallengeData.vrfPublicKey,
          userId: data.vrfChallengeData.userId,
          rpId: data.vrfChallengeData.rpId,
          blockHeight: data.vrfChallengeData.blockHeight,
          blockHash: data.vrfChallengeData.blockHash,
        })
      : null;

    const vrfPublicKey = data.vrfPublicKey || data.vrfChallengeData?.vrfPublicKey;
    if (!vrfPublicKey) {
      throw new Error('VRF public key not found in response');
    }

    // Track the VRF account ID at TypeScript level when saving in memory
    if (saveInMemory) {
      this.currentVrfAccountId = nearAccountId;
      console.debug(`VRF Manager: VRF keypair loaded in memory for ${nearAccountId}`);
    }

    return {
      vrfPublicKey,
      vrfChallenge,
      encryptedVrfKeypair: data.encryptedVrfKeypair,
      serverEncryptedVrfKeypair: data.serverEncryptedVrfKeypair || null,
    };
  }

  /**
   * This securely decrypts the shamir3Pass encrypted VRF keypair and loads it into memory
   * It performs Shamir-3-Pass commutative decryption within WASM worker with the relay-server
   */
  async shamir3PassDecryptVrfKeypair({
    nearAccountId,
    kek_s_b64u,
    ciphertextVrfB64u,
    serverKeyId,
  }: {
    nearAccountId: AccountId;
    kek_s_b64u: string;
    ciphertextVrfB64u: string;
    serverKeyId: string;
  }): Promise<VRFWorkerResponse> {
    await this.ensureWorkerReady(true);
    const message: VRFWorkerMessage<WasmShamir3PassClientDecryptVrfKeypairRequest> = {
      type: 'SHAMIR3PASS_CLIENT_DECRYPT_VRF_KEYPAIR',
      id: this.generateMessageId(),
      payload: {
        nearAccountId,
        kek_s_b64u,
        ciphertextVrfB64u,
        // Required key for server selection
        keyId: serverKeyId,
      },
    };
    const response = await this.sendMessage(message);
    if (response.success) {
      this.currentVrfAccountId = nearAccountId;
    }
    return response;
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
    await this.ensureWorkerReady(true);
    const message: VRFWorkerMessage<WasmVrfWorkerRequestType> = {
      type: 'SHAMIR3PASS_CLIENT_ENCRYPT_CURRENT_VRF_KEYPAIR',
      id: this.generateMessageId(),
      payload: {} as WasmVrfWorkerRequestType,
    };
    const response = await this.sendMessage(message);
    if (!response.success || !response.data) {
      throw new Error(`VRF encrypt-current failed: ${response.error}`);
    }
    const { ciphertextVrfB64u, kek_s_b64u, serverKeyId } = response.data as {
      ciphertextVrfB64u: string;
      kek_s_b64u: string;
      serverKeyId: string;
    };
    if (!ciphertextVrfB64u || !kek_s_b64u) {
      throw new Error('Invalid encrypt-current response');
    }
    if (!serverKeyId) {
      throw new Error('Server did not return keyId from apply-server-lock');
    }
    return { ciphertextVrfB64u, kek_s_b64u, serverKeyId };
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

function computeTotalAmountYocto(txSigningRequests: TransactionInputWasm[]): string | undefined {
  try {
    let total = BigInt(0);
    for (const tx of txSigningRequests) {
      for (const action of tx.actions) {
        switch (action.action_type) {
          case ActionType.Transfer:
            total += BigInt(action.deposit || '0');
            break;
          case ActionType.FunctionCall:
            total += BigInt(action.deposit || '0');
            break;
          case ActionType.Stake:
            total += BigInt(action.stake || '0');
            break;
          default:
            break;
        }
      }
    }
    return total > BigInt(0) ? total.toString() : undefined;
  } catch {
    return undefined;
  }
}
