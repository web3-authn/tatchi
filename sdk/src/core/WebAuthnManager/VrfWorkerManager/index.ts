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
} from '../../types/vrf-worker';
import { WebAuthnRegistrationCredential } from '../../types';
import { VRFChallenge, validateVRFChallenge } from '../../types/vrf-worker';
import { BUILD_PATHS } from '../../../../build-paths.js';
import { resolveWorkerScriptUrl } from '../../wasmLoader';
import { AccountId, toAccountId } from '../../types/accountIds';
import { extractPrfFromCredential } from '../credentialsHelpers';

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

  constructor(config: VrfWorkerManagerConfig = {}) {
    this.config = {
      // Default to client-hosted worker file using centralized config
      vrfWorkerUrl: BUILD_PATHS.RUNTIME.VRF_WORKER,
      workerTimeout: 60_000,
      debug: false,
      ...config
    };
  }

  setWorkerBaseOrigin(origin: string | undefined): void {
    this.workerBaseOrigin = origin;
  }

  /**
   * Ensure VRF worker is initialized and ready
   */


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
      const vrfUrlStr = this.workerBaseOrigin
        ? new URL(this.config.vrfWorkerUrl || BUILD_PATHS.RUNTIME.VRF_WORKER, this.workerBaseOrigin).toString()
        : resolveWorkerScriptUrl(this.config.vrfWorkerUrl || BUILD_PATHS.RUNTIME.VRF_WORKER);
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
        const response = event.data as VRFWorkerResponse;
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
    credential: import('../../types/webauthn').WebAuthnAuthenticationCredential,
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

    console.debug('VRF Manager: VRF challenge generated successfully');
    return validateVRFChallenge(response.data);
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
        return {
          active: response.data.active,
          nearAccountId: this.currentVrfAccountId ? toAccountId(this.currentVrfAccountId) : null,
          sessionDuration: response.data.sessionDuration
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
      const challengeData = response.data.vrf_challenge_data;
      if (!challengeData) {
        throw new Error('VRF challenge data failed to be generated');
      }
      const vrfPublicKey = response.data.vrfPublicKey || challengeData.vrfPublicKey;
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
    credential: import('../../types/webauthn').WebAuthnAuthenticationCredential;
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
      const vrfPublicKey = response.data.vrfPublicKey || response.data.vrfChallengeData?.vrfPublicKey;
      if (!vrfPublicKey) {
        throw new Error('VRF public key not found in response');
      }
      if (!response.data.encryptedVrfKeypair) {
        throw new Error('Encrypted VRF keypair not found in response - this is required for registration');
      }
      console.debug('VRF Manager: Deterministic VRF keypair derivation successful');

      // VRF challenge data is optional - only generated if vrfInputData was provided
      const vrfChallenge = response.data.vrfChallengeData
        ? validateVRFChallenge({
            vrfInput: response.data.vrfChallengeData.vrfInput,
            vrfOutput: response.data.vrfChallengeData.vrfOutput,
            vrfProof: response.data.vrfChallengeData.vrfProof,
            vrfPublicKey: response.data.vrfChallengeData.vrfPublicKey,
            userId: response.data.vrfChallengeData.userId,
            rpId: response.data.vrfChallengeData.rpId,
            blockHeight: response.data.vrfChallengeData.blockHeight,
            blockHash: response.data.vrfChallengeData.blockHash,
          })
        : null;

      const result: {
        vrfPublicKey: string;
        vrfChallenge: VRFChallenge | null;
        encryptedVrfKeypair: EncryptedVRFKeypair;
        serverEncryptedVrfKeypair: ServerEncryptedVrfKeypair | null;
      } = {
        vrfPublicKey,
        vrfChallenge,
        encryptedVrfKeypair: response.data.encryptedVrfKeypair,
        serverEncryptedVrfKeypair: response.data.serverEncryptedVrfKeypair,
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

    const vrfChallenge = response.data.vrfChallengeData
      ? validateVRFChallenge({
          vrfInput: response.data.vrfChallengeData.vrfInput,
          vrfOutput: response.data.vrfChallengeData.vrfOutput,
          vrfProof: response.data.vrfChallengeData.vrfProof,
          vrfPublicKey: response.data.vrfChallengeData.vrfPublicKey,
          userId: response.data.vrfChallengeData.userId,
          rpId: response.data.vrfChallengeData.rpId,
          blockHeight: response.data.vrfChallengeData.blockHeight,
          blockHash: response.data.vrfChallengeData.blockHash,
        })
      : null;

    const vrfPublicKey = response.data.vrfPublicKey || response.data.vrfChallengeData?.vrfPublicKey;
    if (!vrfPublicKey) {
      throw new Error('VRF public key not found in response');
    }

    return {
      vrfPublicKey,
      vrfChallenge,
      encryptedVrfKeypair: response.data.encryptedVrfKeypair,
      serverEncryptedVrfKeypair: response.data.serverEncryptedVrfKeypair || null,
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
    const { ciphertextVrfB64u, kek_s_b64u, serverKeyId } = response.data as any;
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
