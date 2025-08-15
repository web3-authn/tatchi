import { SignedTransaction, type NearClient } from '../NearClient';
import { getNonceBlockHashAndHeight } from "../PasskeyManager/actions";
import { ClientAuthenticatorData, PasskeyClientDBManager } from '../IndexedDBManager';
import { PasskeyNearKeysDBManager, type EncryptedKeyData } from '../IndexedDBManager/passkeyNearKeysDB';
import { TouchIdPrompt } from "./touchIdPrompt";
import { SIGNER_WORKER_MANAGER_CONFIG } from "../../config";

import { type ActionParams, validateActionParams } from '../types/actions';
import {
  WorkerRequestType,  // from wasm worker
  WorkerResponseType, // from wasm worker
  WorkerResponseForRequest,
  isWorkerProgress,
  isWorkerError,
  isWorkerSuccess,
  isDeriveNearKeypairAndEncryptSuccess,
  isDecryptPrivateKeyWithPrfSuccess,
  isCheckCanRegisterUserSuccess,
  isSignVerifyAndRegisterUserSuccess,
  isSignTransactionsWithActionsSuccess,
  isRecoverKeypairFromPasskeySuccess,
  isExtractCosePublicKeySuccess,
  isSignNep413MessageSuccess,
  WorkerProgressResponse,
  WorkerErrorResponse,
  WasmTransactionSignResult,
  WasmSignTransactionWithKeyPairRequest,
  WasmSignTransactionsWithActionsRequest,
  WasmSignVerifyAndRegisterUserRequest,
  WorkerRequestTypeMap,
} from '../types/signer-worker';
import { toEnumUserVerificationPolicy } from '../types/authenticatorOptions';
import {
  extractPrfFromCredential,
  serializeRegistrationCredentialWithPRF,
  serializeAuthenticationCredentialWithPRF,
  type DualPrfOutputs,
} from './credentialsHelpers';
import { VRFChallenge } from '../types/vrf-worker';
import type { onProgressEvents } from '../types/passkeyManager';
import { AccountId, toAccountId } from "../types/accountIds";
import type { AuthenticatorOptions } from '../types/authenticatorOptions';

// === SECURE CONFIRM TYPES ===

/**
 * Unified confirmation configuration that controls the entire confirmation flow
 */
interface ConfirmationConfig {
  /** Whether to show confirmation UI before TouchID prompt (true) or go straight to TouchID (false) */
  showPreConfirm: boolean;

  /** Type of UI to display for confirmation */
  uiMode: 'native' | 'shadow' | 'embedded' | 'popup';

  /** How the confirmation UI behaves */
  behavior: 'requireClick' | 'autoProceed' | 'autoProceedWithDelay';

  /** Delay in milliseconds before auto-proceeding (only used with autoProceedWithDelay) */
  autoProceedDelay?: number;
}

interface SecureConfirmData {
  requestId: string;
  summary: string | object;
  actions?: string;
  intentDigest?: string;
  nearAccountId?: string; // Account ID for credential lookup
  vrfChallenge?: any; // VRF challenge for credential generation
  confirmationConfig?: ConfirmationConfig; // Confirmation configuration from WASM worker
}

export enum SecureConfirmMessageType {
  PASSKEY_SECURE_CONFIRM = 'PASSKEY_SECURE_CONFIRM',
  PASSKEY_SECURE_CONFIRM_DECISION = 'PASSKEY_SECURE_CONFIRM_DECISION',
}

interface SecureConfirmMessage {
  type: SecureConfirmMessageType;
  data: SecureConfirmData;
}

interface SecureConfirmDecision {
  requestId: string;
  intentDigest?: string;
  confirmed: boolean;
  credential?: any; // Serialized WebAuthn credential
  prfOutput?: string; // Base64url-encoded PRF output
}

interface TransactionSummary {
  to?: string;
  amount?: string;
  method?: string;
  fingerprint?: string;
}

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
  private clientDB: PasskeyClientDBManager;
  private touchIdPrompt: TouchIdPrompt;

  /** Unified confirmation configuration */
  private confirmationConfig: ConfirmationConfig = {
    showPreConfirm: true,
    uiMode: 'shadow',
    behavior: 'requireClick',
    autoProceedDelay: 2000, // 2 seconds default delay
  };

  private currentUserAccountId: string | null = null;

  constructor() {
    this.nearKeysDB = new PasskeyNearKeysDBManager();
    this.clientDB = new PasskeyClientDBManager();
    this.touchIdPrompt = new TouchIdPrompt();
  }

  /**
   * Set the unified confirmation configuration
   */
  setConfirmationConfig(config: Partial<ConfirmationConfig>): void {
    this.confirmationConfig = { ...this.confirmationConfig, ...config };
    this.saveUserSettings();
  }

  /**
   * Set whether to show confirmation UI before TouchID prompt
   */
  setShowPreConfirm(show: boolean): void {
    this.confirmationConfig.showPreConfirm = show;
    this.saveUserSettings();
  }

  /**
   * Set the UI mode for confirmation
   */
  setConfirmationUIMode(mode: ConfirmationConfig['uiMode']): void {
    this.confirmationConfig.uiMode = mode;
    this.saveUserSettings();
  }

  /**
   * Set the confirmation behavior
   */
  setConfirmBehavior(behavior: ConfirmationConfig['behavior']): void {
    this.confirmationConfig.behavior = behavior;
    this.saveUserSettings();
  }

  /**
   * Set the auto-proceed delay (only used with autoProceedWithDelay behavior)
   */
  setAutoProceedDelay(delayMs: number): void {
    this.confirmationConfig.autoProceedDelay = delayMs;
    this.saveUserSettings();
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
    this.loadUserSettings();
  }

  /**
   * Load user confirmation settings from IndexedDB
   */
  private async loadUserSettings(): Promise<void> {
    if (!this.currentUserAccountId) {
      console.debug('[SignerWorkerManager]: No current user set, using default settings');
      return;
    }

    try {
      const user = await this.clientDB.getUser(toAccountId(this.currentUserAccountId));
      if (user?.preferences) {
        // Load legacy settings and convert to new format
        if (user.preferences.usePreConfirmFlow !== undefined) {
          this.confirmationConfig.showPreConfirm = user.preferences.usePreConfirmFlow;
          console.debug('[SignerWorkerManager]: Loaded showPreConfirm setting:', this.confirmationConfig.showPreConfirm);
        }
        if (user.preferences.confirmBehavior) {
          // Convert legacy behavior to new format
          this.confirmationConfig.behavior = user.preferences.confirmBehavior === 'autoProceed' ? 'autoProceedWithDelay' : 'requireClick';
          console.debug('[SignerWorkerManager]: Loaded confirmBehavior setting:', this.confirmationConfig.behavior);
        }
        // Load new unified confirmationConfig if available
        if (user.preferences.confirmationConfig) {
          this.confirmationConfig = { ...this.confirmationConfig, ...user.preferences.confirmationConfig };
          console.debug('[SignerWorkerManager]: Loaded unified confirmationConfig:', this.confirmationConfig);
        }
      }
    } catch (error) {
      console.warn('[SignerWorkerManager]: Failed to load user settings:', error);
    }
  }

  /**
   * Save current confirmation settings to IndexedDB
   */
  private async saveUserSettings(): Promise<void> {
    if (!this.currentUserAccountId) {
      console.debug('[SignerWorkerManager]: No current user set, skipping settings save');
      return;
    }

    try {
      // Save both legacy format (for backward compatibility) and new format
      await this.clientDB.updatePreferences(toAccountId(this.currentUserAccountId), {
        usePreConfirmFlow: this.confirmationConfig.showPreConfirm,
        confirmBehavior: this.confirmationConfig.behavior === 'autoProceedWithDelay' ? 'autoProceed' : this.confirmationConfig.behavior,
        // Save unified confirmationConfig
        confirmationConfig: this.confirmationConfig,
      });
      console.debug('[SignerWorkerManager]: Saved user settings:', {
        showPreConfirm: this.confirmationConfig.showPreConfirm,
        uiMode: this.confirmationConfig.uiMode,
        behavior: this.confirmationConfig.behavior,
        autoProceedDelay: this.confirmationConfig.autoProceedDelay,
      });
    } catch (error) {
      console.warn('[SignerWorkerManager]: Failed to save user settings:', error);
    }
  }

  private async renderConfirmUI(
    summary: TransactionSummary,
    actionsJson?: string
  ): Promise<boolean> {
    switch (this.confirmationConfig.uiMode) {
      case 'native': {
        const message = `Confirm transaction?\nTo: ${summary?.to ?? ''}\nAmount: ${summary?.amount ?? ''}${summary?.method ? `\nMethod: ${summary?.method}` : ''}${actionsJson ? `\nActions: ${actionsJson}` : ''}`;
        return window.confirm(message);
      }
      case 'shadow': {
        // Components are imported dynamically to avoid DOM APIs in worker context
        const { mountSecureTxConfirm } = await import('./Components');
        return mountSecureTxConfirm({
          summary: {
            to: summary?.to,
            amount: summary?.amount,
            method: summary?.method,
            fingerprint: summary?.fingerprint,
          },
          actionsJson,
          mode: 'modal'
        });
      }
      case 'embedded': {
        // TODO: Implement embedded shadow DOM confirmation
        const message = `Confirm transaction?\nTo: ${summary?.to ?? ''}\nAmount: ${summary?.amount ?? ''}${summary?.method ? `\nMethod: ${summary?.method}` : ''}${actionsJson ? `\nActions: ${actionsJson}` : ''}`;
        return window.confirm(message);
      }
      case 'popup': {
        // TODO: Implement sandboxed iframe/popup confirmation
        const message = `Confirm transaction?\nTo: ${summary?.to ?? ''}\nAmount: ${summary?.amount ?? ''}${summary?.method ? `\nMethod: ${summary?.method}` : ''}${actionsJson ? `\nActions: ${actionsJson}` : ''}`;
        return window.confirm(message);
      }
      default:
        return window.confirm('Confirm transaction?');
    }
  }

  /**
   * Handles secure confirmation requests from the worker with robust error handling
   * and proper data validation. Supports both transaction and registration confirmation flows.
   */
  private async handleSecureConfirmRequest(message: SecureConfirmMessage, worker: Worker): Promise<void> {
    try {
      console.log('[SignerWorkerManager]: Processing secure confirm request:', {
        requestId: message.data?.requestId,
        hasActions: !!message.data?.actions,
        hasSummary: !!message.data?.summary,
        hasIntentDigest: !!message.data?.intentDigest
      });

      // Validate required fields
      const data = message.data;
      if (!data || !data.requestId) {
        console.error('[SignerWorkerManager]: Invalid secure confirm request - missing requestId');
        return;
      }

      // Parse and validate summary data (can contain extra fields we need)
      const summary = this.parseTransactionSummary(data.summary);
      const isRegistration = summary?.isRegistration || (summary as any)?.type === 'registration';

      // Get confirmation configuration from data or use default
      const confirmationConfig = data.confirmationConfig || this.confirmationConfig;
      console.log('[SignerWorkerManager]: Using confirmation config:', confirmationConfig);

      const transactionSummary: TransactionSummary = {
        to: summary?.to || (isRegistration ? 'Registration' : undefined),
        amount: summary?.amount,
        method: summary?.method || (isRegistration ? 'Register Account' : undefined),
        fingerprint: data.intentDigest
      };

      // Render confirmation per behavior
      let confirmed = false;
      let decision: SecureConfirmDecision = {
        requestId: data.requestId,
        intentDigest: data.intentDigest,
        confirmed: false
      };

      if (confirmationConfig.uiMode === 'shadow' && confirmationConfig.behavior === 'autoProceedWithDelay') {
        // Show modal as context but do not wait for click; we'll close it after TouchID
        const { mountSecureTxConfirmWithHandle } = await import('./Components');
        const handle = mountSecureTxConfirmWithHandle({
          summary: {
            to: transactionSummary.to,
            amount: transactionSummary.amount,
            method: transactionSummary.method,
            fingerprint: transactionSummary.fingerprint,
          },
          actionsJson: data.actions,
          mode: 'modal',
          loading: true // Show loading state with only cancel button
        });

        // Give user time to read transaction details before TouchID prompt
        const delay = confirmationConfig.autoProceedDelay || 2000;
        console.log(`[SignerWorkerManager]: Showing transaction details for ${delay}ms before TouchID prompt...`);
        await new Promise(resolve => setTimeout(resolve, delay));

        // We proceed to TouchID after delay; close will be called after completion
        confirmed = true; // treat as user intent to proceed
        // We'll close the modal after credential collection below
        (decision as any)._confirmHandle = handle; // temp stash for later close
      } else {
        // Require explicit confirm
        confirmed = await this.renderConfirmUI(transactionSummary, data.actions);
      }

      decision.confirmed = confirmed;

      // If confirmed, collect credentials and PRF output
      // Derive parameters from either top-level fields or summary payload
      const nearAccountIdFromMsg = data.nearAccountId || (summary && (summary.nearAccountId || summary.summary?.nearAccountId));
      const vrfLike = data.vrfChallenge || (summary && (summary.vrfChallenge || summary.summary?.vrfChallenge));

      if (confirmed && nearAccountIdFromMsg && vrfLike) {
        try {
          console.log('[SignerWorkerManager]: User confirmed - collecting credentials...');

          // Get credentials using TouchID prompt
          const vrfChallengeObj = (typeof (vrfLike as any)?.outputAs32Bytes === 'function')
            ? vrfLike
            : new VRFChallenge({
                vrfInput: vrfLike.vrfInput,
                vrfOutput: vrfLike.vrfOutput,
                vrfProof: vrfLike.vrfProof,
                vrfPublicKey: vrfLike.vrfPublicKey,
                userId: vrfLike.userId,
                rpId: vrfLike.rpId,
                blockHeight: vrfLike.blockHeight,
                blockHash: vrfLike.blockHash,
              });

          const authenticators = await this.clientDB.getAuthenticatorsByUser(nearAccountIdFromMsg);

          const credential = await this.touchIdPrompt.getCredentials({
            nearAccountId: nearAccountIdFromMsg,
            challenge: vrfChallengeObj.outputAs32Bytes(),
            authenticators: authenticators,
          });

          // Extract PRF output for decryption (registration needs both PRF outputs)
          const dualPrfOutputs = extractPrfFromCredential({
            credential,
            firstPrfOutput: true,
            secondPrfOutput: isRegistration, // Registration needs second PRF output
          });

          if (!dualPrfOutputs.chacha20PrfOutput) {
            throw new Error('Failed to extract PRF outputs from credential');
          }

          // Serialize credential for WASM worker (use appropriate serializer based on flow type)
          const serializedCredential = isRegistration
            ? serializeRegistrationCredentialWithPRF({
                credential,
                firstPrfOutput: true,
                secondPrfOutput: true
              })
            : serializeAuthenticationCredentialWithPRF({ credential });

          // Add credentials to decision
          decision.credential = serializedCredential;
          decision.prfOutput = dualPrfOutputs.chacha20PrfOutput;

          console.log('[SignerWorkerManager]: Credentials collected successfully');

          // If we auto-mounted the modal for context, close it now
          const confirmHandle = (decision as any)._confirmHandle as { close: (confirmed: boolean) => void } | undefined;
          if (confirmHandle && typeof confirmHandle.close === 'function') {
            try { confirmHandle.close(true); } catch {}
            (decision as any)._confirmHandle = undefined;
          }
        } catch (credentialError) {
          console.error('[SignerWorkerManager]: Failed to collect credentials:', credentialError);
          // If credential collection fails, reject the transaction
          decision.confirmed = false;
          // Close auto-mounted modal if present
          const confirmHandle = (decision as any)._confirmHandle as { close: (confirmed: boolean) => void } | undefined;
          if (confirmHandle && typeof confirmHandle.close === 'function') {
            try { confirmHandle.close(false); } catch {}
            (decision as any)._confirmHandle = undefined;
          }
        }
      }

      console.log('[SignerWorkerManager]: Sending secure confirm decision:', {
        requestId: decision.requestId,
        confirmed: decision.confirmed,
        hasIntentDigest: !!decision.intentDigest
      });

      worker.postMessage({
        type: SecureConfirmMessageType.PASSKEY_SECURE_CONFIRM_DECISION,
        data: decision
      });

    } catch (error) {
      console.error('[SignerWorkerManager]: Failed to handle secure confirm request:', error);

      // Send rejection decision on error
      try {
        const errorDecision: SecureConfirmDecision = {
          requestId: message.data?.requestId || 'unknown',
          intentDigest: message.data?.intentDigest,
          confirmed: false
        };
        worker.postMessage({
          type: SecureConfirmMessageType.PASSKEY_SECURE_CONFIRM_DECISION,
          data: errorDecision
        });
      } catch (postError) {
        console.error('[SignerWorkerManager]: Failed to send error decision:', postError);
      }
    }
  }

  /**
   * Safely parses transaction summary data, handling both string and object formats
   */
  private parseTransactionSummary(summaryData: string | object | undefined): any {
    if (!summaryData) {
      return {};
    }

    if (typeof summaryData === 'string') {
      try {
        return JSON.parse(summaryData);
      } catch (error) {
        console.warn('[SignerWorkerManager]: Failed to parse summary JSON:', error);
        return {};
      }
    }

    if (typeof summaryData === 'object') {
      return summaryData;
    }

    console.warn('[SignerWorkerManager]: Unexpected summary data type:', typeof summaryData);
    return {};
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

          // Add detailed logging for debugging
          console.log('Worker response received:', {
            type: response?.type,
            hasPayload: !!response?.payload,
            fullResponse: response
          });

          // Intercept secure confirm handshake (Phase A: pluggable UI)
          if (event.data.type === SecureConfirmMessageType.PASSKEY_SECURE_CONFIRM) {
            await this.handleSecureConfirmRequest(event.data as SecureConfirmMessage, worker);
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
      const response = await this.sendMessage<WorkerRequestType.DeriveNearKeypairAndEncrypt>({
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

      const response = await this.sendMessage({
        message: {
          type: WorkerRequestType.DecryptPrivateKeyWithPrf,
          payload: {
            nearAccountId: nearAccountId,
            chacha20PrfOutput: dualPrfOutputs.chacha20PrfOutput, // Use ChaCha20 PRF output for decryption
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
      const wasmResult = response.payload;
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

      const response = await this.sendMessage<WorkerRequestType.CheckCanRegisterUser>({
        message: {
          type: WorkerRequestType.CheckCanRegisterUser,
          payload: {
            vrfChallenge: {
              vrfInput: vrfChallenge.vrfInput,
              vrfOutput: vrfChallenge.vrfOutput,
              vrfProof: vrfChallenge.vrfProof,
              vrfPublicKey: vrfChallenge.vrfPublicKey,
              userId: vrfChallenge.userId,
              rpId: vrfChallenge.rpId,
              blockHeight: vrfChallenge.blockHeight,
              blockHash: vrfChallenge.blockHash,
            },
            credential: serializeRegistrationCredentialWithPRF({ credential }),
            contractId,
            nearRpcUrl,
            authenticatorOptions: authenticatorOptions ? {
              userVerification: toEnumUserVerificationPolicy(authenticatorOptions.userVerification),
              originPolicy: authenticatorOptions.originPolicy,
            } : undefined
          }
        },
        onEvent,
        timeoutMs: SIGNER_WORKER_MANAGER_CONFIG.TIMEOUTS.TRANSACTION
      });

      if (!isCheckCanRegisterUserSuccess(response)) {
        const errorDetails = isWorkerError(response) ? response.payload.error : 'Unknown worker error';
        throw new Error(`Registration check failed: ${errorDetails}`);
      }

      const wasmResult = response.payload;
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

      const {
        accessKeyInfo,
        nextNonce,
        txBlockHash,
        txBlockHeight,
      } = await getNonceBlockHashAndHeight({ nearClient, nearPublicKeyStr, nearAccountId });

      // Step 2: Execute registration transaction via WASM
      // Credentials will be collected during the confirmation flow
      const response = await this.sendMessage({
        message: {
          type: WorkerRequestType.SignVerifyAndRegisterUser,
          payload: {
            verification: {
              contractId: contractId,
              nearRpcUrl: nearRpcUrl,
              vrfChallenge: vrfChallenge,
            },
            decryption: {
              encryptedPrivateKeyData: encryptedKeyData.encryptedData,
              encryptedPrivateKeyIv: encryptedKeyData.iv
            },
            registration: {
              nearAccountId,
              nonce: nextNonce,
              blockHash: txBlockHash,
              deterministicVrfPublicKey,
              deviceNumber, // Pass device number for multi-device support
              authenticatorOptions: authenticatorOptions ? {
                userVerification: toEnumUserVerificationPolicy(authenticatorOptions.userVerification),
                originPolicy: authenticatorOptions.originPolicy,
              } : undefined
            },
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
          signedTransaction: new SignedTransaction({
            transaction: wasmResult.signedTransaction!.transaction,
            signature: wasmResult.signedTransaction!.signature,
            borsh_bytes: Array.from(wasmResult.signedTransaction!.borshBytes || [])
          }),
          preSignedDeleteTransaction: wasmResult.preSignedDeleteTransaction
            ? new SignedTransaction({
                transaction: wasmResult.preSignedDeleteTransaction.transaction,
                signature: wasmResult.preSignedDeleteTransaction.signature,
                borsh_bytes: Array.from(wasmResult.preSignedDeleteTransaction.borshBytes || [])
              })
            : null
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
    authenticators,
    vrfChallenge,
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
    authenticators: ClientAuthenticatorData[];
    vrfChallenge: VRFChallenge;
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

      // Credentials and PRF outputs are now collected during user confirmation handshake

      // Create transaction signing requests
      const txSigningRequests = transactions.map(tx => ({
        nearAccountId: tx.nearAccountId,
        receiverId: tx.receiverId,
        actions: JSON.stringify(tx.actions),
        nonce: tx.nonce,
        blockHash: blockHash
      }));

      // Send batch signing request to WASM worker
      const response = await this.sendMessage({
        message: {
          type: WorkerRequestType.SignTransactionsWithActions,
          payload: {
            verification: {
              contractId: contractId,
              nearRpcUrl: nearRpcUrl,
              vrfChallenge: vrfChallenge,
            },
            decryption: {
              encryptedPrivateKeyData: encryptedKeyData.encryptedData,
              encryptedPrivateKeyIv: encryptedKeyData.iv
            },
            txSigningRequests: txSigningRequests,
            preConfirm: this.confirmationConfig.showPreConfirm,
            confirmationConfig: {
              showPreConfirm: this.confirmationConfig.showPreConfirm,
              uiMode: this.confirmationConfig.uiMode as any,
              behavior: this.confirmationConfig.behavior as any,
              autoProceedDelay: this.confirmationConfig.autoProceedDelay,
            }
          }
        },
        onEvent
      });

      if (!isSignTransactionsWithActionsSuccess(response)) {
        console.error('WebAuthnManager: Batch transaction signing failed:', response);
        throw new Error('Batch transaction signing failed');
      }
      if (!response.payload.success) {
        throw new Error(response.payload.error || 'Batch transaction signing failed');
      }
      // Extract arrays from the single result - wasmResult contains arrays of all transactions
      const signedTransactions = response.payload.signedTransactions || [];
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
          logs: response.payload.logs
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
      const authenticationCredential = serializeAuthenticationCredentialWithPRF({
        credential,
        firstPrfOutput: true,
        secondPrfOutput: true, // only for recovering NEAR keys
      });

      // Verify dual PRF outputs are available
      if (!authenticationCredential.clientExtensionResults?.prf?.results?.first ||
          !authenticationCredential.clientExtensionResults?.prf?.results?.second) {
        throw new Error('Dual PRF outputs required for account recovery - both ChaCha20 and Ed25519 PRF outputs must be available');
      }

      // Use generic sendMessage with specific request type for better type safety
      const response = await this.sendMessage<WorkerRequestType.RecoverKeypairFromPasskey>({
        message: {
          type: WorkerRequestType.RecoverKeypairFromPasskey,
          payload: {
            credential: authenticationCredential,
            accountIdHint: accountIdHint,
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

      const response = await this.sendMessage({
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

      const response = await this.sendMessage<WorkerRequestType.SignTransactionWithKeyPair>({
        message: {
          type: WorkerRequestType.SignTransactionWithKeyPair,
          payload: {
            nearPrivateKey,
            signerAccountId,
            receiverId,
            nonce,
            blockHash: blockHash,
            actions: JSON.stringify(actions)
          }
        }
      });

      if (response.type !== WorkerResponseType.SignTransactionWithKeyPairSuccess) {
        console.error('SignerWorkerManager: Transaction signing with private key failed:', response);
        throw new Error('Transaction signing with private key failed');
      }

      const wasmResult = response.payload as WasmTransactionSignResult;
      if (!wasmResult.success) {
        throw new Error(wasmResult.error || 'Transaction signing failed');
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

      const response = await this.sendMessage<WorkerRequestType.SignNep413Message>({
        message: {
          type: WorkerRequestType.SignNep413Message,
          payload: {
            message: payload.message,
            recipient: payload.recipient,
            nonce: payload.nonce,
            state: payload.state || undefined,
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