import { ActionPhase, ActionStatus } from '../types/passkeyManager';
import { ActionType } from '../types/actions';
import { toAccountId } from '../types/accountIds';
import {
  IndexedDBManager,
  type ClientUserData,
  type ClientAuthenticatorData,
} from '../IndexedDBManager';
import { StoreUserDataInput } from '../IndexedDBManager/passkeyClientDB';
import {
  type NearClient,
  SignedTransaction
} from '../NearClient';
import { SignerWorkerManager } from './signerWorkerManager';
import { VrfWorkerManager } from './vrfWorkerManager';
import { TouchIdPrompt } from './touchIdPrompt';
import { base64UrlEncode } from '../../utils/encoders';
import { type ActionParams } from '../types/signer-worker';
import { extractPrfFromCredential } from './credentialsHelpers';
import { EncryptedVRFKeypair, VRFInputData } from '../types/vrf-worker';
import type { PasskeyManagerConfigs, onProgressEvents } from '../types/passkeyManager';
import { VRFChallenge } from '../types/vrf-worker';
import type { VerifyAndSignTransactionResult } from '../types/passkeyManager';
import type { AccountId } from '../types/accountIds';
import type { AuthenticatorOptions } from '../types/authenticatorOptions';


/**
 * WebAuthnManager - Main orchestrator for WebAuthn operations
 *
 * Architecture:
 * - index.ts (this file): Main class orchestrating everything
 * - signerWorkerManager: NEAR transaction signing, and VRF Web3Authn verification RPC calls
 * - vrfWorkerManager: VRF keypair generation, challenge generation
 * - touchIdPrompt: TouchID prompt for biometric authentication
 */
export class WebAuthnManager {
  private readonly vrfWorkerManager: VrfWorkerManager;
  private readonly signerWorkerManager: SignerWorkerManager;
  readonly configs: PasskeyManagerConfigs;
  readonly touchIdPrompt: TouchIdPrompt;

  constructor(configs: PasskeyManagerConfigs) {
    this.vrfWorkerManager = new VrfWorkerManager();
    this.signerWorkerManager = new SignerWorkerManager();
    this.touchIdPrompt = new TouchIdPrompt();
    this.configs = configs;

    // VRF worker initializes on-demand with proper error propagation
    console.debug('WebAuthnManager: Constructor complete, VRF worker will initialize on-demand');
  }

  ///////////////////////////////////////
  // VRF MANAGER FUNCTIONS
  ///////////////////////////////////////

  async generateVrfChallenge(vrfInputData: VRFInputData): Promise<VRFChallenge> {
    return this.vrfWorkerManager.generateVrfChallenge(vrfInputData);
  }

  /**
   * Generate VRF keypair for bootstrapping - stores in memory unencrypted temporarily
   * This is used during registration to generate a VRF keypair that will be used for
   * WebAuthn ceremony and later encrypted with the real PRF output
   *
   * @param saveInMemory - Whether to persist the generated VRF keypair in WASM worker memory
   * @param vrfInputParams - Optional parameters to generate VRF challenge/proof in same call
   * @returns VRF public key and optionally VRF challenge data
   */
  async generateVrfKeypair(
    saveInMemory: boolean,
    vrfInputData: VRFInputData
  ): Promise<{
    vrfPublicKey: string;
    vrfChallenge: VRFChallenge;
  }> {
    const result = await this.vrfWorkerManager.generateVrfKeypair(vrfInputData, saveInMemory);
    if (!result.vrfChallenge) {
      throw new Error('VRF challenge generation failed');
    }
    return {
      vrfPublicKey: result.vrfPublicKey,
      vrfChallenge: result.vrfChallenge
    };
  }

  /**
   * Derive deterministic VRF keypair from PRF output for recovery
   * Optionally generates VRF challenge if input parameters are provided
   * This enables deterministic VRF key derivation from WebAuthn credentials
   *
   * @param credential - WebAuthn credential containing PRF outputs
   * @param nearAccountId - NEAR account ID for key derivation salt
   * @param vrfInputParams - Optional VRF input parameters for challenge generation
   * @returns Deterministic VRF public key, optional VRF challenge, and encrypted VRF keypair for storage
   */
  async deriveVrfKeypairFromPrf({
    credential,
    nearAccountId,
    vrfInputData
  }: {
    credential: PublicKeyCredential;
    nearAccountId: AccountId;
    vrfInputData?: VRFInputData;
  }): Promise<{
    success: boolean;
    vrfPublicKey: string;
    vrfChallenge?: VRFChallenge;
    encryptedVrfKeypair?: EncryptedVRFKeypair;
  }> {
    try {
      console.debug('WebAuthnManager: Deriving deterministic VRF keypair from PRF output');
      // Extract ChaCha20 PRF output from credential
      const { chacha20PrfOutput } = extractPrfFromCredential({
        credential,
        firstPrfOutput: true,
        secondPrfOutput: false,
      });

      // Use the first PRF output for VRF keypair derivation (AES PRF output)
      // This ensures deterministic derivation: same PRF + same account = same VRF keypair
      const vrfResult = await this.vrfWorkerManager.deriveVrfKeypairFromSeed({
        prfOutput: chacha20PrfOutput,
        nearAccountId,
        vrfInputData
      });

      console.debug(`Derived VRF public key: ${vrfResult.vrfPublicKey}`);
      if (vrfResult.vrfChallenge) {
        console.debug(`Generated VRF challenge with output: ${vrfResult.vrfChallenge.vrfOutput.substring(0, 20)}...`);
      }
      if (vrfResult.encryptedVrfKeypair) {
        console.debug(`Generated encrypted VRF keypair for storage`);
      }
      console.debug('WebAuthnManager: Deterministic VRF keypair derived successfully');

      const result: {
        success: boolean;
        vrfPublicKey: string;
        vrfChallenge?: VRFChallenge;
        encryptedVrfKeypair?: EncryptedVRFKeypair;
      } = {
        success: true,
        vrfPublicKey: vrfResult.vrfPublicKey
      };

      if (vrfResult.vrfChallenge) {
        result.vrfChallenge = vrfResult.vrfChallenge;
      }

      if (vrfResult.encryptedVrfKeypair) {
        result.encryptedVrfKeypair = vrfResult.encryptedVrfKeypair;
      }

      return result;

    } catch (error: any) {
      console.error('WebAuthnManager: VRF keypair derivation from PRF error:', error);
      throw new Error(`VRF keypair derivation from PRF failed ${error.message}`);
    }
  }

  /**
   * Encrypt VRF keypair with PRF output - looks up in-memory keypair and encrypts it
   * This is called after WebAuthn ceremony to encrypt the same VRF keypair with real PRF
   *
   * @param expectedPublicKey - Expected VRF public key to verify we're encrypting the right keypair
   * @param prfOutput - PRF output from WebAuthn ceremony for encryption
   * @returns Encrypted VRF keypair data ready for storage
   */
  async encryptVrfKeypairWithCredentials({
    credential,
    vrfPublicKey,
  }: {
    credential: PublicKeyCredential,
    vrfPublicKey: string,
  }): Promise<{
    vrfPublicKey: string;
    encryptedVrfKeypair: EncryptedVRFKeypair;
  }> {
    return await this.vrfWorkerManager.encryptVrfKeypairWithCredentials(vrfPublicKey, credential);
  }

  /**
   * Unlock VRF keypair in memory using PRF output
   * This is called during login to decrypt and load the VRF keypair in-memory
   */
  async unlockVRFKeypair({
    nearAccountId,
    encryptedVrfKeypair,
    credential,
  }: {
    nearAccountId: AccountId;
    encryptedVrfKeypair: EncryptedVRFKeypair;
    credential: PublicKeyCredential;
  }): Promise<{ success: boolean; error?: string }> {
    try {
      console.debug('WebAuthnManager: Unlocking VRF keypair');

      const prfOutput = credential.getClientExtensionResults()?.prf?.results?.first as ArrayBuffer;
      if (!prfOutput) {
        throw new Error('PRF output not found in WebAuthn credentials');
      }

      const unlockResult = await this.vrfWorkerManager.unlockVrfKeypair({
        touchIdPrompt: this.touchIdPrompt,
        nearAccountId,
        encryptedVrfKeypair,
        authenticators: [], // Empty array since we already have the credential
        prfOutput: prfOutput
      });

      if (!unlockResult.success) {
        console.error('WebAuthnManager: VRF keypair unlock failed');
        return { success: false, error: 'VRF keypair unlock failed' };
      }

      console.debug('WebAuthnManager: VRF keypair unlocked successfully');
      return { success: true };

    } catch (error: any) {
      console.error('WebAuthnManager: VRF keypair unlock failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  async clearVrfSession(): Promise<void> {
    return await this.vrfWorkerManager.clearVrfSession();
  }

  ///////////////////////////////////////
  // INDEXEDDB OPERATIONS
  ///////////////////////////////////////

  async storeUserData(userData: StoreUserDataInput): Promise<void> {
    await IndexedDBManager.clientDB.storeWebAuthnUserData(userData);
  }

  async getUser(nearAccountId: AccountId): Promise<ClientUserData | null> {
    return await IndexedDBManager.clientDB.getUser(nearAccountId);
  }

  async getAllUserData(): Promise<ClientUserData[]> {
    return await IndexedDBManager.clientDB.getAllUsers();
  }

  async getAllUsers(): Promise<ClientUserData[]> {
    return await IndexedDBManager.clientDB.getAllUsers();
  }

  async getAuthenticatorsByUser(nearAccountId: AccountId): Promise<ClientAuthenticatorData[]> {
    return await IndexedDBManager.clientDB.getAuthenticatorsByUser(nearAccountId);
  }

  async updateLastLogin(nearAccountId: AccountId): Promise<void> {
    return await IndexedDBManager.clientDB.updateLastLogin(nearAccountId);
  }

  async registerUser(storeUserData: StoreUserDataInput): Promise<ClientUserData> {
    return await IndexedDBManager.clientDB.registerUser(storeUserData);
  }

  async storeAuthenticator(authenticatorData: {
    credentialId: string;
    credentialPublicKey: Uint8Array;
    transports?: string[];
    name?: string;
    nearAccountId: AccountId;
    registered: string;
    syncedAt: string;
    vrfPublicKey: string;
    deviceNumber?: number;
  }): Promise<void> {
    const authData = {
      ...authenticatorData,
      nearAccountId: toAccountId(authenticatorData.nearAccountId),
      deviceNumber: authenticatorData.deviceNumber || 1 // Default to device 1 (1-indexed)
    };
    return await IndexedDBManager.clientDB.storeAuthenticator(authData);
  }

  extractUsername(nearAccountId: AccountId): string {
    return IndexedDBManager.clientDB.extractUsername(nearAccountId);
  }

  async atomicOperation<T>(callback: (db: any) => Promise<T>): Promise<T> {
    return await IndexedDBManager.clientDB.atomicOperation(callback);
  }

  async rollbackUserRegistration(nearAccountId: AccountId): Promise<void> {
    return await IndexedDBManager.clientDB.rollbackUserRegistration(nearAccountId);
  }

  async hasPasskeyCredential(nearAccountId: AccountId): Promise<boolean> {
    return await IndexedDBManager.clientDB.hasPasskeyCredential(nearAccountId);
  }

  async getLastUsedNearAccountId(): Promise<{
    nearAccountId: AccountId;
    deviceNumber: number;
  } | null> {
    const lastUser = await IndexedDBManager.clientDB.getLastUser();
    if (!lastUser) return null;
    return {
      nearAccountId: lastUser.nearAccountId,
      deviceNumber: lastUser.deviceNumber,
    };
  }

  ///////////////////////////////////////
  // SIGNER WASM WORKER OPERATIONS
  ///////////////////////////////////////

  /**
   * Secure registration flow with PRF: WebAuthn + WASM worker encryption using PRF
   * Optionally signs a link_device_register_user transaction if VRF data is provided
   */
  async deriveNearKeypairAndEncrypt({
    nearAccountId,
    credential,
    options
  }: {
    credential: PublicKeyCredential;
    nearAccountId: AccountId;
    options?: {
      vrfChallenge: VRFChallenge;
      deterministicVrfPublicKey: string; // Add VRF public key for registration transactions
      contractId: string;
      nonce: string;
      blockHash: string;
    };
  }): Promise<{
    success: boolean;
    nearAccountId: AccountId;
    publicKey: string;
    signedTransaction?: SignedTransaction;
  }> {
    return await this.signerWorkerManager.deriveNearKeypairAndEncrypt(
      credential,
      nearAccountId,
      options
    );
  }

  /**
   * Export private key using PRF-based decryption
   * Requires TouchId
   *
   * SECURITY MODEL: Local random challenge is sufficient for private key export because:
   * - User must possess physical authenticator device
   * - Device enforces biometric/PIN verification before PRF access
   * - No network communication or replay attack surface
   * - Challenge only needs to be random to prevent pre-computation
   * - Security comes from device possession + biometrics, not challenge validation
   */
  async exportNearKeypairWithTouchId(nearAccountId: AccountId): Promise<{
    accountId: string,
    publicKey: string,
    privateKey: string
  }> {
    console.debug(`🔐 Exporting private key for account: ${nearAccountId}`);
    // Get user data to verify user exists
    const userData = await this.getUser(nearAccountId);
    if (!userData) {
      throw new Error(`No user data found for ${nearAccountId}`);
    }
    if (!userData.clientNearPublicKey) {
      throw new Error(`No public key found for ${nearAccountId}`);
    }
    // Get stored authenticator data for this user
    const authenticators = await this.getAuthenticatorsByUser(nearAccountId);
    if (authenticators.length === 0) {
      throw new Error(`No authenticators found for account ${nearAccountId}. Please register first.`);
    }

    // Use WASM worker to decrypt private key
    const decryptionResult = await this.signerWorkerManager.decryptPrivateKeyWithPrf(
      this.touchIdPrompt,
      nearAccountId,
      authenticators,
    );

    return {
      accountId: userData.nearAccountId,
      publicKey: userData.clientNearPublicKey,
      privateKey: decryptionResult.decryptedPrivateKey,
    }
  }

  /**
   * Transaction signing with contract verification and progress updates.
   * Demonstrates the "streaming" worker pattern similar to SSE.
   *
   * Requires a successful TouchID/biometric prompt before transaction signing in wasm worker
   * Automatically verifies the authentication with the web3authn contract.
   *
   * @param transactions - Transaction payload containing:
   *   - nearAccountId: NEAR account ID performing the transaction
   *   - receiverId: NEAR account ID receiving the transaction
   *   - actions: Array of NEAR actions to execute
   *   - nonce: Transaction nonce
   * @param blockHashBytes: Recent block hash for transaction freshness
   * @param contractId: Web3Authn contract ID for verification
   * @param vrfChallenge: VRF challenge used in authentication
   * @param credential: WebAuthn credential from TouchID prompt
   * @param onEvent - Optional callback for progress updates during signing
   */
  async signTransactionsWithActions({
    transactions,
    blockHash,
    contractId,
    vrfChallenge,
    credential,
    nearRpcUrl,
    onEvent,
  }: {
    transactions: Array<{
      nearAccountId: AccountId;
      receiverId: string;
      actions: ActionParams[];
      nonce: string;
    }>,
    // Common parameters for all transactions
    blockHash: string,
    contractId: string,
    vrfChallenge: VRFChallenge,
    credential: PublicKeyCredential,
    nearRpcUrl: string,
    onEvent?: (update: onProgressEvents) => void
  }): Promise<VerifyAndSignTransactionResult[]> {

    if (transactions.length === 0) {
      throw new Error('No payloads provided for signing');
    }

    return await this.signerWorkerManager.signTransactionsWithActions(
      {
        transactions,
        blockHash,
        contractId,
        vrfChallenge,
        credential,
        nearRpcUrl,
        onEvent
      },
    );
  }

  async signNEP413Message(payload: {
    message: string;
    recipient: string;
    nonce: string;
    state: string | null;
    accountId: AccountId;
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
      // Send to WASM worker for signing
      const result = await this.signerWorkerManager.signNep413Message(payload);
      if (result.success) {
        console.debug('WebAuthnManager: NEP-413 message signed successfully');
        return result;
      } else {
        throw new Error(`NEP-413 signing failed: ${result.error || 'Unknown error'}`);
      }
    } catch (error: any) {
      console.error('WebAuthnManager: NEP-413 signing error:', error);
      return {
        success: false,
        accountId: '',
        publicKey: '',
        signature: '',
        error: error.message || 'Unknown error'
      };
    }
  }

  // === COSE OPERATIONS (Delegated to WebAuthnWorkers) ===

  /**
   * Extract COSE public key from WebAuthn attestation object using WASM worker
   */
  async extractCosePublicKey(attestationObjectBase64url: string): Promise<Uint8Array> {
    return await this.signerWorkerManager.extractCosePublicKey(attestationObjectBase64url);
  }

  ///////////////////////////////////////
  // REGISTRATION
  ///////////////////////////////////////

  async checkCanRegisterUser({
    contractId,
    credential,
    vrfChallenge,
    authenticatorOptions,
    onEvent,
  }: {
    contractId: string,
    credential: PublicKeyCredential,
    vrfChallenge: VRFChallenge,
    authenticatorOptions?: AuthenticatorOptions; // Authenticator options for registration check
    onEvent?: (update: onProgressEvents) => void
  }): Promise<{
    success: boolean;
    verified?: boolean;
    registrationInfo?: any;
    logs?: string[];
    signedTransactionBorsh?: number[];
    error?: string;
  }> {
    return await this.signerWorkerManager.checkCanRegisterUser({
      contractId,
      credential,
      vrfChallenge,
      authenticatorOptions,
      onEvent,
      nearRpcUrl: this.configs.nearRpcUrl,
    });
  }

  /**
   * Register user on-chain with transaction (STATE-CHANGING)
   * This performs the actual on-chain registration transaction
   * @deprecated Testnet only, use createAccountAndRegisterWithRelayServer instead for prod
   */
  async signVerifyAndRegisterUser({
    contractId,
    credential,
    vrfChallenge,
    deterministicVrfPublicKey,
    signerAccountId,
    nearAccountId,
    nearPublicKeyStr,
    nearClient,
    deviceNumber = 1, // Default to device number 1 for first device (1-indexed)
    authenticatorOptions,
    onEvent,
  }: {
    contractId: string,
    credential: PublicKeyCredential,
    vrfChallenge: VRFChallenge,
    deterministicVrfPublicKey: string, // deterministic VRF key for key recovery
    signerAccountId: string;
    nearAccountId: AccountId;
    nearPublicKeyStr: string;
    nearClient: NearClient;
    deviceNumber?: number; // Device number for multi-device support (defaults to 1)
    authenticatorOptions?: AuthenticatorOptions; // Authenticator options for registration
    onEvent?: (update: onProgressEvents) => void;
  }): Promise<{
    success: boolean;
    verified: boolean;
    registrationInfo?: any;
    logs?: string[];
    signedTransaction: SignedTransaction;
    preSignedDeleteTransaction: SignedTransaction;
    error?: string;
  }> {
    try {
      const registrationResult = await this.signerWorkerManager.signVerifyAndRegisterUser({
        vrfChallenge,
        credential,
        contractId,
        deterministicVrfPublicKey, // Pass through the deterministic VRF key
        signerAccountId,
        nearAccountId,
        nearPublicKeyStr,
        nearClient,
        deviceNumber, // Pass device number for multi-device support
        authenticatorOptions, // Pass authenticator options
        onEvent,
        nearRpcUrl: this.configs.nearRpcUrl,
      });

      console.debug("On-chain registration completed:", registrationResult);

      if (registrationResult.verified) {
        console.debug('On-chain user registration successful');
        return {
          success: true,
          verified: registrationResult.verified,
          registrationInfo: registrationResult.registrationInfo,
          logs: registrationResult.logs,
          signedTransaction: registrationResult.signedTransaction,
          preSignedDeleteTransaction: registrationResult.preSignedDeleteTransaction,
        };
      } else {
        console.warn('On-chain user registration failed - WASM worker returned unverified result');
        // Note: This should never happen since WASM worker throws on failure
        // But if it does, we don't have access to preSignedDeleteTransaction
        throw new Error('On-chain registration transaction failed');
      }
    } catch (error: any) {
      console.error('WebAuthnManager: On-chain registration error:', error);
      throw error;
    }
  }

  /**
   * Atomically store all registration data (user, authenticator, VRF credentials)
   */
  async atomicStoreRegistrationData({
    nearAccountId,
    credential,
    publicKey,
    encryptedVrfKeypair,
    vrfPublicKey,
    onEvent
  }: {
    nearAccountId: AccountId;
    credential: PublicKeyCredential;
    publicKey: string;
    encryptedVrfKeypair: EncryptedVRFKeypair;
    vrfPublicKey: string;
    onEvent?: (event: any) => void;
  }): Promise<void> {

    await this.atomicOperation(async (db) => {

      // Store credential for authentication
      const credentialId = base64UrlEncode(credential.rawId);
      const response = credential.response as AuthenticatorAttestationResponse;

      await this.storeAuthenticator({
        nearAccountId: nearAccountId,
        credentialId: credentialId,
        credentialPublicKey: await this.extractCosePublicKey(
          base64UrlEncode(response.attestationObject)
        ),
        transports: response.getTransports?.() || [],
        name: `VRF Passkey for ${this.extractUsername(nearAccountId)}`,
        registered: new Date().toISOString(),
        syncedAt: new Date().toISOString(),
        vrfPublicKey: vrfPublicKey,
      });

      // Store WebAuthn user data with encrypted VRF credentials
      await this.storeUserData({
        nearAccountId,
        clientNearPublicKey: publicKey,
        lastUpdated: Date.now(),
        passkeyCredential: {
          id: credential.id,
          rawId: credentialId
        },
        encryptedVrfKeypair: encryptedVrfKeypair,
      });

      console.debug('✅ registration data stored atomically');
      return true;
    });

    onEvent?.({
      step: 5,
      phase: 'database-storage',
      status: 'success',
      message: 'VRF registration data stored successfully'
    });
  }

  ///////////////////////////////////////
  // ACCOUNT RECOVERY
  ///////////////////////////////////////

  /**
   * Recover keypair from authentication credential for account recovery
   * Uses dual PRF outputs to re-derive the same NEAR keypair and re-encrypt it
   * @param challenge - Random challenge for WebAuthn authentication ceremony
   * @param authenticationCredential - The authentication credential with dual PRF outputs
   * @param accountIdHint - Optional account ID hint for recovery
   * @returns Public key and encrypted private key for secure storage
   */
  async recoverKeypairFromPasskey(
    challenge: Uint8Array<ArrayBuffer>,
    authenticationCredential: PublicKeyCredential,
    accountIdHint?: string,
  ): Promise<{
    publicKey: string;
    encryptedPrivateKey: string;
    iv: string;
    accountIdHint?: string;
    stored?: boolean;
  }> {
    try {
      console.debug('WebAuthnManager: recovering keypair from authentication credential with dual PRF outputs');

      // Verify we have an authentication credential (not registration)
      if (!authenticationCredential) {
        throw new Error(
          'Authentication credential required for account recovery. ' +
          'Use an existing credential with dual PRF outputs to re-derive the same NEAR keypair.'
        );
      }

      // Verify dual PRF outputs are available
      const prfResults = authenticationCredential.getClientExtensionResults()?.prf?.results;
      if (!prfResults?.first || !prfResults?.second) {
        throw new Error('Dual PRF outputs required for account recovery - both AES and Ed25519 PRF outputs must be available');
      }

      // Call the WASM worker to derive and encrypt the keypair using dual PRF
      const result = await this.signerWorkerManager.recoverKeypairFromPasskey(
        authenticationCredential,
        base64UrlEncode(challenge),
        accountIdHint
      );

       console.debug('WebAuthnManager: Deterministic keypair derivation successful');
       return result;

    } catch (error: any) {
      console.error('WebAuthnManager: Deterministic keypair derivation error:', error);
      throw new Error(`Deterministic keypair derivation failed: ${error.message}`);
    }
  }

  /**
   * Sign transaction with raw private key
   * for key replacement in device linking
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
    return await this.signerWorkerManager.signTransactionWithKeyPair({
      nearPrivateKey,
      signerAccountId,
      receiverId,
      nonce,
      blockHash,
      actions
    });
  }

  /**
   * Check VRF worker status
   */
  async checkVrfStatus(): Promise<{ active: boolean; nearAccountId: AccountId | null; sessionDuration?: number }> {
    return this.vrfWorkerManager.checkVrfStatus();
  }

}