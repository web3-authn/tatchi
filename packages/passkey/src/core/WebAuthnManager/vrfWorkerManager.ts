/**
 * VRF Manager
 * Uses Web Workers for VRF keypair management with client-hosted worker files.
 */

import { ClientAuthenticatorData } from '../IndexedDBManager/passkeyClientDB';
import type {
  VRFWorkerStatus,
  VrfWorkerManagerConfig,
  EncryptedVRFKeypair,
  VRFInputData,
  VRFWorkerMessage,
  VRFWorkerResponse
} from '../types/vrf-worker';
import { VRFChallenge } from '../types/vrf-worker';
import { TouchIdPrompt } from './touchIdPrompt';
import { base64UrlEncode, base58Decode } from '../../utils';
import { BUILD_PATHS } from '../../../build-paths.js';
import { AccountId, toAccountId } from '../types/accountIds';

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

  constructor(config: VrfWorkerManagerConfig = {}) {
    this.config = {
      // Default to client-hosted worker file using centralized config
      vrfWorkerUrl: BUILD_PATHS.RUNTIME.VRF_WORKER,
      workerTimeout: 10000,
      debug: false,
      ...config
    };
  }

  /**
   * Ensure VRF worker is initialized and ready
   */


  /**
   * Ensure VRF worker is ready for operations
   * @param requireHealthCheck - Whether to perform health check after initialization
   */
  private async ensureWorkerReady(requireHealthCheck = false): Promise<void> {
    // Initialize if needed
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
          data: {}
        }, 3000);

        if (!healthResponse.success) {
          throw new Error('VRF Worker failed health check');
        }
      } catch (error) {
        console.error('🛡️ VRF Manager: Health check failed:', error);
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
    console.debug('VRF Manager: Initialization completed successfully');
    return result;
  }

  /**
   * Initialize Web Worker with client-hosted VRF worker
   */
  private async createVrfWorker(): Promise<void> {
    try {
      console.debug('VRF Manager: Worker URL:', this.config.vrfWorkerUrl);
      // Create Web Worker from client-hosted file
      this.vrfWorker = new Worker(this.config.vrfWorkerUrl!, {
        type: 'module',
        name: 'Web3AuthnVRFWorker'
      });
      // Set up error handling
      this.vrfWorker.onerror = (error) => {
        console.error('VRF Manager: Web Worker error:', error);
      };
      // Test communication with the Web Worker
      await this.testWebWorkerCommunication();

    } catch (error: any) {
      throw new Error(`VRF Web Worker initialization failed: ${error.message}`);
    }
  }

  /**
   * Send message to Web Worker and wait for response
   */
  private async sendMessage(message: VRFWorkerMessage, customTimeout?: number): Promise<VRFWorkerResponse> {
    return new Promise((resolve, reject) => {
      if (!this.vrfWorker) {
        reject(new Error('VRF Web Worker not available'));
        return;
      }

      const timeoutMs = customTimeout || 30000;
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
    touchIdPrompt,
    nearAccountId,
    encryptedVrfKeypair,
    authenticators,
    prfOutput,
    onEvent,
  }: {
    touchIdPrompt: TouchIdPrompt,
    nearAccountId: AccountId,
    encryptedVrfKeypair: EncryptedVRFKeypair,
    authenticators: ClientAuthenticatorData[],
    prfOutput?: ArrayBuffer,
    onEvent?: (event: { type: string, data: { step: string, message: string } }) => void,
  }): Promise<VRFWorkerResponse> {

    await this.ensureWorkerReady(true);

    if (!prfOutput) {
      let challenge = crypto.getRandomValues(new Uint8Array(32));
      let credential = await touchIdPrompt.getCredentials({
        nearAccountId,
        challenge,
        authenticators,
      });
      prfOutput = credential.getClientExtensionResults()?.prf?.results?.first as ArrayBuffer;
      if (!prfOutput) {
        throw new Error('PRF output not found in WebAuthn credentials');
      }

      onEvent?.({
        type: 'loginProgress',
        data: {
          step: 'verifying-server',
          message: 'TouchId success! Unlocking VRF keypair in secure memory...'
        }
      });
    }

    const message: VRFWorkerMessage = {
      type: 'UNLOCK_VRF_KEYPAIR',
      id: this.generateMessageId(),
      data: {
        nearAccountId,
        encryptedVrfKeypair,
        prfKey: base64UrlEncode(prfOutput) // ArrayBuffer → base64url string
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
    console.debug('VRF Manager: Generating VRF challenge...');
    await this.ensureWorkerReady(true);

    const message: VRFWorkerMessage = {
      type: 'GENERATE_VRF_CHALLENGE',
      id: this.generateMessageId(),
      data: {
        user_id: inputData.userId,
        rp_id: inputData.rpId,
        block_height: inputData.blockHeight,
        // Convert base58 blockHash to byte array to be
        // consistent with Rust Vec<u8>
        block_hash: Array.from(base58Decode(inputData.blockHash)),
        timestamp: Date.now()
      }
    };

    const response = await this.sendMessage(message);

    if (!response.success || !response.data) {
      throw new Error(`VRF challenge generation failed: ${response.error}`);
    }

    console.debug('VRF Manager: VRF challenge generated successfully');
    return new VRFChallenge(response.data);
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
      const message: VRFWorkerMessage = {
        type: 'CHECK_VRF_STATUS',
        id: this.generateMessageId(),
        data: {}
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
      const message: VRFWorkerMessage = {
        type: 'LOGOUT',
        id: this.generateMessageId(),
        data: {}
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
  async generateVrfKeypair(
    vrfInputData: VRFInputData,
    saveInMemory: boolean,
  ): Promise<{
    vrfPublicKey: string;
    vrfChallenge: VRFChallenge;
  }> {
    console.debug('VRF Manager: Generating bootstrap VRF keypair', {
      saveInMemory,
      withChallenge: !!vrfInputData
    });

    await this.ensureWorkerReady();

    try {
      const message: VRFWorkerMessage = {
        type: 'GENERATE_VRF_KEYPAIR_BOOTSTRAP',
        id: this.generateMessageId(),
        data: {
          // Include VRF input parameters if provided for challenge generation
          vrfInputParams: vrfInputData ? {
            user_id: vrfInputData.userId,
            rp_id: vrfInputData.rpId,
            block_height: vrfInputData.blockHeight,
            block_hash: Array.from(base58Decode(vrfInputData.blockHash)),
            timestamp: Date.now()
          } : undefined
        }
      };

      const response = await this.sendMessage(message);

      if (!response.success || !response.data) {
        throw new Error(`VRF bootstrap keypair generation failed: ${response.error}`);
      }
      // If VRF challenge data was also generated, include it in the result
      if (!response?.data?.vrf_challenge_data) {
        throw new Error('VRF challenge data failed to be generated');
      }
      if (vrfInputData && saveInMemory) {
        // Track the account ID for this VRF session if saving in memory
        this.currentVrfAccountId = vrfInputData.userId;
      }

      // TODO: strong types generated by Rust wasm-bindgen
      return {
        vrfPublicKey: response.data.vrf_public_key,
        vrfChallenge: new VRFChallenge({
          vrfInput: response.data.vrf_challenge_data.vrfInput,
          vrfOutput: response.data.vrf_challenge_data.vrfOutput,
          vrfProof: response.data.vrf_challenge_data.vrfProof,
          vrfPublicKey: response.data.vrf_challenge_data.vrfPublicKey,
          userId: response.data.vrf_challenge_data.userId,
          rpId: response.data.vrf_challenge_data.rpId,
          blockHeight: response.data.vrf_challenge_data.blockHeight,
          blockHash: response.data.vrf_challenge_data.blockHash,
        })
      }

    } catch (error: any) {
      console.error('VRF Manager: Bootstrap VRF keypair generation failed:', error);
      throw new Error(`Failed to generate bootstrap VRF keypair: ${error.message}`);
    }
  }

  /**
   * Encrypt VRF keypair with PRF output - looks up in-memory keypair and encrypts it
   * This is called after WebAuthn ceremony to encrypt the same VRF keypair with real PRF
   *
   * @param expectedPublicKey - Expected VRF public key to verify we're encrypting the right keypair
   * @param credential - WebAuthn credentials for encryption
   * @returns Encrypted VRF keypair data ready for storage
   */
  async encryptVrfKeypairWithCredentials(
    expectedPublicKey: string,
    credential: PublicKeyCredential
  ): Promise<{
    vrfPublicKey: string;
    encryptedVrfKeypair: EncryptedVRFKeypair;
  }> {
    await this.ensureWorkerReady();

    const prfOutput = credential.getClientExtensionResults()?.prf?.results?.first as ArrayBuffer;
    if (!prfOutput) {
      throw new Error('PRF output not found in WebAuthn credentials');
    }

    try {
      const message: VRFWorkerMessage = {
        type: 'ENCRYPT_VRF_KEYPAIR_WITH_PRF',
        id: this.generateMessageId(),
        data: {
          expectedPublicKey: expectedPublicKey,
          prfKey: base64UrlEncode(prfOutput)
        }
      };

      const response = await this.sendMessage(message);

      if (!response.success || !response.data) {
        throw new Error(`VRF keypair encryption failed: ${response.error}`);
      }

      const result = {
        vrfPublicKey: response.data.vrf_public_key,
        encryptedVrfKeypair: response.data.encrypted_vrf_keypair
      };

      console.debug('VRF Manager: VRF keypair encryption successful');
      return result;
    } catch (error: any) {
      console.error('VRF Manager: VRF keypair encryption failed:', error);
      throw new Error(`Failed to encrypt VRF keypair: ${error.message}`);
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
  async deriveVrfKeypairFromSeed({
    prfOutput,
    nearAccountId,
    vrfInputData
  }: {
    prfOutput: string;
    nearAccountId: AccountId;
    vrfInputData?: VRFInputData;
  }): Promise<{
    vrfPublicKey: string;
    vrfChallenge?: VRFChallenge;
    encryptedVrfKeypair?: EncryptedVRFKeypair;
  }> {
    console.debug('VRF Manager: Deriving deterministic VRF keypair from PRF output');
    try {
      await this.ensureWorkerReady();

      // Pass base64url string directly - VRF worker handles conversion internally
      const messageData: any = {
        prfOutput: prfOutput, // Base64url string → VRF worker handles conversion
        nearAccountId: nearAccountId
      };

      // Add VRF input parameters if provided for challenge generation
      if (vrfInputData) {
        messageData.vrfInputParams = {
          user_id: vrfInputData.userId,
          rp_id: vrfInputData.rpId,
          block_height: vrfInputData.blockHeight,
          block_hash: Array.from(base58Decode(vrfInputData.blockHash)),
          timestamp: Date.now()
        };
      }

      const message: VRFWorkerMessage = {
        type: 'DERIVE_VRF_KEYPAIR_FROM_PRF',
        id: this.generateMessageId(),
        data: messageData
      };

      const response = await this.sendMessage(message);

      if (!response.success || !response.data) {
        throw new Error(`VRF keypair derivation failed: ${response.error}`);
      }

      console.debug('VRF Manager: Deterministic VRF keypair derivation successful');

      const result: {
        vrfPublicKey: string;
        vrfChallenge?: VRFChallenge;
        encryptedVrfKeypair?: EncryptedVRFKeypair;
      } = {
        vrfPublicKey: response.data.vrf_public_key
      };

      // Add VRF challenge if it was generated
      if (response.data.vrf_challenge_data) {
        result.vrfChallenge = new VRFChallenge({
          vrfInput: response.data.vrf_challenge_data.vrfInput,
          vrfOutput: response.data.vrf_challenge_data.vrfOutput,
          vrfProof: response.data.vrf_challenge_data.vrfProof,
          vrfPublicKey: response.data.vrf_challenge_data.vrfPublicKey,
          userId: response.data.vrf_challenge_data.userId,
          rpId: response.data.vrf_challenge_data.rpId,
          blockHeight: response.data.vrf_challenge_data.blockHeight,
          blockHash: response.data.vrf_challenge_data.blockHash,
        });
      }

      // Add encrypted VRF keypair if it was generated
      if (response.data.encrypted_vrf_keypair) {
        result.encryptedVrfKeypair = response.data.encrypted_vrf_keypair;
      }

      return result;

    } catch (error: any) {
      console.error('VRF Manager: VRF keypair derivation failed:', error);
      throw new Error(`VRF keypair derivation failed: ${error.message}`);
    }
  }

  /**
   * Test Web Worker communication with progressive retry
   */
  private async testWebWorkerCommunication(): Promise<void> {
    const maxAttempts = 3;
    const baseDelay = 1000;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        console.debug(`VRF Manager: Communication test attempt ${attempt}/${maxAttempts}`);
        const timeoutMs = attempt === 1 ? 8000 : 5000;

        const pingResponse = await this.sendMessage({
          type: 'PING',
          id: this.generateMessageId(),
          data: {}
        }, timeoutMs);

        if (!pingResponse.success) {
          throw new Error(`VRF Web Worker PING failed: ${pingResponse.error}`);
        }

        console.debug('VRF Manager: Web Worker communication verified');
        return;
      } catch (error: any) {
        console.warn(`️ VRF Manager: Communication test attempt ${attempt} failed:`, error.message);

        if (attempt === maxAttempts) {
          throw new Error(`Communication test failed after ${maxAttempts} attempts: ${error.message}`);
        }

        const delay = baseDelay * attempt;
        console.debug(`   Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
}
