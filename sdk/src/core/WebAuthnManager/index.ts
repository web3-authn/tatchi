import {
  IndexedDBManager,
  type ClientUserData,
  type ClientAuthenticatorData,
  type UnifiedIndexedDBManager,
} from '../IndexedDBManager';
import { StoreUserDataInput } from '../IndexedDBManager/passkeyClientDB';
import { type NearClient, SignedTransaction } from '../NearClient';
import { SignerWorkerManager } from './SignerWorkerManager';
import { VrfWorkerManager } from './VrfWorkerManager';
import { AllowCredential, TouchIdPrompt, authenticatorsToAllowCredentials } from './touchIdPrompt';
import { toAccountId } from '../types/accountIds';
import { UserPreferencesManager } from './userPreferences';
import UserPreferencesInstance from './userPreferences';
import { NonceManager } from '../nonceManager';
import NonceManagerInstance from '../nonceManager';
import {
  EncryptedVRFKeypair,
  ServerEncryptedVrfKeypair,
  VRFInputData,
  VRFChallenge
} from '../types/vrf-worker';
import type { ActionArgsWasm, TransactionInputWasm } from '../types/actions';
import type { RegistrationHooksOptions, RegistrationSSEEvent, onProgressEvents } from '../types/sdkSentEvents';
import type { SignTransactionResult, TatchiConfigs } from '../types/tatchi';
import type { AccountId } from '../types/accountIds';
import type { AuthenticatorOptions } from '../types/authenticatorOptions';
import type { DelegateActionInput } from '../types/delegate';
import type { ConfirmationConfig, RpcCallPayload, WasmSignedDelegate } from '../types/signer-worker';
import { WebAuthnRegistrationCredential, WebAuthnAuthenticationCredential } from '../types';
import { RegistrationCredentialConfirmationPayload } from './SignerWorkerManager/handlers/validation';
import { resolveWorkerBaseOrigin, onEmbeddedBaseChange } from '../sdkPaths';
import { extractPrfFromCredential } from './credentialsHelpers';
import { DEFAULT_WAIT_STATUS } from '../types/rpc';
import { getLastLoggedInDeviceNumber } from './SignerWorkerManager/getDeviceNumber';

type SigningSessionOptions = {
  /** PRF.first_auth for WrapKeySeed derivation (base64url) */
  prfFirstAuthB64u: string;
  /** Optional credential for PRF.second extraction by VRF worker */
  credential?: WebAuthnRegistrationCredential | WebAuthnAuthenticationCredential;
};

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
  private readonly touchIdPrompt: TouchIdPrompt;
  private readonly userPreferencesManager: UserPreferencesManager;
  private readonly nearClient: NearClient;
  private readonly nonceManager: NonceManager;
  private workerBaseOrigin: string = '';
  // VRF-owned signing session id per account (warm session reuse).
  private activeSigningSessionIds: Map<string, string> = new Map();

  readonly tatchiPasskeyConfigs: TatchiConfigs;

  /**
   * Public getter for NonceManager instance
   */
  getNonceManager(): NonceManager {
    return this.nonceManager;
  }

  constructor(tatchiPasskeyConfigs: TatchiConfigs, nearClient: NearClient) {
    this.tatchiPasskeyConfigs = tatchiPasskeyConfigs;
    this.nearClient = nearClient;
    // Respect rpIdOverride. Safari get() bridge fallback is always enabled.
    this.touchIdPrompt = new TouchIdPrompt(
      tatchiPasskeyConfigs.iframeWallet?.rpIdOverride,
      true,
    );
    this.userPreferencesManager = UserPreferencesInstance;
    this.nonceManager = NonceManagerInstance;
    const { vrfWorkerConfigs } = tatchiPasskeyConfigs;
    // Group VRF worker configuration and pass context
    this.vrfWorkerManager = new VrfWorkerManager(
      {
        shamirPB64u: vrfWorkerConfigs?.shamir3pass?.p,
        relayServerUrl: vrfWorkerConfigs?.shamir3pass?.relayServerUrl,
        applyServerLockRoute: vrfWorkerConfigs?.shamir3pass?.applyServerLockRoute,
        removeServerLockRoute: vrfWorkerConfigs?.shamir3pass?.removeServerLockRoute,
      },
      {
        touchIdPrompt: this.touchIdPrompt,
        nearClient: this.nearClient,
        indexedDB: IndexedDBManager,
        userPreferencesManager: this.userPreferencesManager,
        nonceManager: this.nonceManager,
        rpIdOverride: this.touchIdPrompt.getRpId(),
        nearExplorerUrl: tatchiPasskeyConfigs.nearExplorerUrl,
      }
    );
    this.signerWorkerManager = new SignerWorkerManager(
      this.vrfWorkerManager,
      nearClient,
      this.userPreferencesManager,
      this.nonceManager,
      tatchiPasskeyConfigs.iframeWallet?.rpIdOverride,
      true,
      tatchiPasskeyConfigs.nearExplorerUrl,
    );
    // VRF worker initializes on-demand with proper error propagation

    // Compute initial worker base origin once
    this.workerBaseOrigin = resolveWorkerBaseOrigin() || (typeof window !== 'undefined' ? window.location.origin : '');
    this.signerWorkerManager.setWorkerBaseOrigin(this.workerBaseOrigin);
    this.vrfWorkerManager.setWorkerBaseOrigin?.(this.workerBaseOrigin as any);

    // Keep base origin updated if the wallet sets a new embedded base
    if (typeof window !== 'undefined') {
      onEmbeddedBaseChange((url) => {
        const origin = new URL(url, window.location.origin).origin;
        if (origin && origin !== this.workerBaseOrigin) {
          this.workerBaseOrigin = origin;
          this.signerWorkerManager.setWorkerBaseOrigin(origin);
          this.vrfWorkerManager.setWorkerBaseOrigin?.(origin as any);
        }
      });
    }
  }

  /**
   * Resolve the effective rpId used for WebAuthn operations.
   * Delegates to TouchIdPrompt to centralize rpId selection logic.
   */
  getRpId(): string {
    return this.touchIdPrompt.getRpId();
  }

  /**
   * Public pre-warm hook to initialize signer workers ahead of time.
   * Safe to call multiple times; errors are non-fatal.
   */
  prewarmSignerWorkers(): void {
    if (typeof window === 'undefined' || typeof (window as any).Worker === 'undefined') return;
    // Avoid noisy SecurityError in cross‑origin dev: only prewarm when same‑origin
    if (this.workerBaseOrigin && this.workerBaseOrigin !== window.location.origin) return;
    this.signerWorkerManager.preWarmWorkerPool().catch(() => {});
  }

  /**
   * Warm critical resources to reduce first-action latency.
   * - Initialize current user (sets up NonceManager and local state)
   * - Prefetch latest block context (and nonce if missing)
   * - Pre-open IndexedDB and warm encrypted key for the active account (best-effort)
   * - Pre-warm signer workers in the background
   */
  async warmCriticalResources(nearAccountId?: string): Promise<void> {
    // Initialize current user first (best-effort)
    if (nearAccountId) {
      await this.initializeCurrentUser(toAccountId(nearAccountId), this.nearClient).catch(() => null);
    }
    // Prefetch latest block/nonce context (best-effort)
    await this.nonceManager.prefetchBlockheight(this.nearClient).catch(() => null);
    // Best-effort: open IndexedDB and warm key data for the account
    if (nearAccountId) {
      await IndexedDBManager.getUserWithKeys(toAccountId(nearAccountId)).catch(() => null);
    }
    // Warm signer workers in background
    this.prewarmSignerWorkers();
  }

  // getContext(): WebAuthnManagerContext {
  //   return {
  //     touchIdPrompt: this.touchIdPrompt,
  //     nearClient: this.nearClient,
  //     indexedDB: IndexedDBManager,
  //     userPreferencesManager: this.userPreferencesManager,
  //     nonceManager: this.nonceManager,
  //     rpIdOverride: this.touchIdPrompt.getRpId(),
  //     nearExplorerUrl: this.tatchiPasskeyConfigs.nearExplorerUrl,
  //   }
  // }

  /**
   * WebAuthnManager-level orchestrator for VRF-owned signing sessions.
   * Creates sessionId, wires MessagePort between VRF and signer workers, and ensures cleanup.
   *
   * Overload 1: plain signing session (no WrapKeySeed derivation).
   * Overload 2: signing session with WrapKeySeed derivation, when `SigningSessionOptions`
   *             (PRF.first_auth) are provided. wrapKeySalt is generated inside the VRF worker
   *             when a new vault entry is being created.
   */
  private generateSessionId(prefix: string): string {
    return (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
      ? crypto.randomUUID()
      : `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  private toNonNegativeInt(value: unknown): number | undefined {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return undefined;
    return Math.floor(value);
  }

  private resolveSigningSessionPolicy(args: {
    ttlMs?: number;
    remainingUses?: number;
  }): {
    ttlMs: number;
    remainingUses: number;
  } {
    const ttlMs =
      this.toNonNegativeInt(args.ttlMs)
        ?? this.tatchiPasskeyConfigs.signingSessionDefaults.ttlMs;
    const remainingUses =
      this.toNonNegativeInt(args.remainingUses)
        ?? this.tatchiPasskeyConfigs.signingSessionDefaults.remainingUses;
    return { ttlMs, remainingUses };
  }

  private getOrCreateActiveSigningSessionId(nearAccountId: AccountId): string {
    const key = String(toAccountId(nearAccountId));
    const existing = this.activeSigningSessionIds.get(key);
    if (existing) return existing;
    const sessionId = this.generateSessionId('signing-session');
    this.activeSigningSessionIds.set(key, sessionId);
    return sessionId;
  }

  private async withSigningSessionInternal<T>(args: {
    sessionId: string;
    options?: SigningSessionOptions;
    handler: (sessionId: string) => Promise<T>;
  }): Promise<T> {
    const signerPort = await this.vrfWorkerManager.createSigningSessionChannel(args.sessionId);
    await this.signerWorkerManager.reserveSignerWorkerSession(args.sessionId, { signerPort });
    try {
      // If PRF is provided, derive WrapKeySeed in VRF worker and deliver it
      // (along with PRF.second if credential is provided) to the signer worker
      // via the reserved MessagePort before invoking the handler.
      if (args.options) {
        await this.vrfWorkerManager.mintSessionKeysAndSendToSigner({
          sessionId: args.sessionId,
          prfFirstAuthB64u: args.options.prfFirstAuthB64u,
          credential: args.options.credential,
        });
      }
      return await args.handler(args.sessionId);
    } finally {
      this.signerWorkerManager.releaseSigningSession(args.sessionId);
    }
  }

  private async withSigningSession<T>(
    prefix: string,
    fn: (sessionId: string) => Promise<T>
  ): Promise<T>;

  private async withSigningSession<T>(
    prefix: string,
    opts: SigningSessionOptions,
    fn: (sessionId: string) => Promise<T>
  ): Promise<T>;

  private async withSigningSession<T>(
    prefix: string,
    arg2: SigningSessionOptions | ((sessionId: string) => Promise<T>),
    arg3?: (sessionId: string) => Promise<T>
  ): Promise<T> {

    const hasOptions = typeof arg2 === 'object' && typeof arg3 === 'function';
    const options = hasOptions ? (arg2 as SigningSessionOptions) : undefined;
    const handler = (hasOptions ? arg3 : arg2) as (sessionId: string) => Promise<T>;
    if (typeof handler !== 'function') {
      throw new Error('withSigningSession requires a handler function');
    }

    const sessionId = this.generateSessionId(prefix);
    return await this.withSigningSessionInternal({ sessionId, options, handler });
  }

  private async withSigningSessionId<T>(
    sessionId: string,
    fn: (sessionId: string) => Promise<T>
  ): Promise<T>;

  private async withSigningSessionId<T>(
    sessionId: string,
    opts: SigningSessionOptions,
    fn: (sessionId: string) => Promise<T>
  ): Promise<T>;

  private async withSigningSessionId<T>(
    sessionId: string,
    arg2: SigningSessionOptions | ((sessionId: string) => Promise<T>),
    arg3?: (sessionId: string) => Promise<T>
  ): Promise<T> {
    if (!sessionId) {
      throw new Error('withSigningSessionId requires a non-empty sessionId');
    }

    // Overload 1: withSigningSessionId(sessionId, handler)
    if (typeof arg2 === 'function') {
      const sessionHandler = arg2;
      return await this.withSigningSessionInternal({
        sessionId,
        handler: sessionHandler,
      });
    }

    // Overload 2: withSigningSessionId(sessionId, options, handler)
    const signingSessionOptions = arg2;
    const sessionHandler = arg3;
    if (typeof sessionHandler !== 'function') {
      throw new Error('withSigningSessionId requires a handler function');
    }
    return await this.withSigningSessionInternal({
      sessionId,
      options: signingSessionOptions,
      handler: sessionHandler,
    });
  }

  /**
   * VRF-driven registration confirmation helper.
   * Runs confirmTxFlow and returns registration artifacts.
   *
   * SecureConfirm wrapper for link-device / registration: prompts user in-iframe to create a
   * new passkey (device N), returning artifacts for subsequent derivation.
   */
  async requestRegistrationCredentialConfirmation(params: {
    nearAccountId: string;
    deviceNumber: number;
    confirmationConfigOverride?: ConfirmationConfig;
  }): Promise<RegistrationCredentialConfirmationPayload> {
    return this.vrfWorkerManager.requestRegistrationCredentialConfirmation({
      nearAccountId: params.nearAccountId,
      deviceNumber: params.deviceNumber,
      confirmationConfigOverride: params.confirmationConfigOverride,
      contractId: this.tatchiPasskeyConfigs.contractId,
      nearRpcUrl: this.tatchiPasskeyConfigs.nearRpcUrl,
    });
  }

  /**
   * Helper for export/decrypt flows:
   *  - Read vault wrapKeySalt
   *  - Ask VRF worker to run LocalOnly(DECRYPT_PRIVATE_KEY_WITH_PRF) + derive WrapKeySeed
   *  - WrapKeySeed travels only over the VRF→Signer MessagePort
   */
  private async confirmDecryptAndDeriveWrapKeySeed(args: {
    nearAccountId: AccountId;
    sessionId: string;
  }): Promise<void> {
    const nearAccountId = toAccountId(args.nearAccountId);
    console.debug('WebAuthnManager: Preparing VRF decrypt session', {
      nearAccountId: String(nearAccountId),
      sessionId: args.sessionId,
    });
    // Resolve deviceNumber consistently with signer paths so both VRF and signer
    // operate on the same vault entry. Prefer the last logged-in device for this
    // account; if unavailable, fall back to the most recently updated user row.
    const [last, latest] = await Promise.all([
      IndexedDBManager.clientDB.getLastUser().catch(() => null),
      IndexedDBManager.clientDB.getLastDBUpdatedUser(nearAccountId).catch(() => null)
    ]);

    const deviceNumber =
      (last && last.nearAccountId === nearAccountId && typeof last.deviceNumber === 'number')
        ? last.deviceNumber
        : (latest && typeof latest.deviceNumber === 'number')
          ? latest.deviceNumber
          : null;

    if (deviceNumber === null) {
      throw new Error(`No deviceNumber found for account ${nearAccountId} (decrypt session)`);
    }

    // Gather encrypted key + wrapKeySalt and public key from IndexedDB for this device
    const encryptedKeyData = await IndexedDBManager.nearKeysDB.getEncryptedKey(nearAccountId, deviceNumber);
    if (!encryptedKeyData) {
      console.error('WebAuthnManager: No encrypted key found for decrypt session', {
        nearAccountId: String(nearAccountId),
        deviceNumber,
      });
      throw new Error(`No encrypted key found for account: ${nearAccountId}`);
    }
    // For v2+ vaults, wrapKeySalt is the canonical salt.
    // iv fallback is retained only for legacy entries that were created
    // before VRF-owned WrapKeySeed derivation.
    const wrapKeySalt = encryptedKeyData.wrapKeySalt || encryptedKeyData.iv || '';
    if (!wrapKeySalt) {
      console.error('WebAuthnManager: Missing wrapKeySalt in vault for decrypt session', {
        nearAccountId: String(nearAccountId),
        deviceNumber,
      });
      throw new Error('Missing wrapKeySalt in vault; re-register to upgrade vault format.');
    }

    try {
      await this.vrfWorkerManager.prepareDecryptSession({
        sessionId: args.sessionId,
        nearAccountId,
        wrapKeySalt,
      });
      console.debug('WebAuthnManager: VRF decrypt session ready', {
        nearAccountId: String(nearAccountId),
        sessionId: args.sessionId,
      });
    } catch (error) {
      console.error('WebAuthnManager: VRF decrypt session failed', {
        nearAccountId: String(nearAccountId),
        sessionId: args.sessionId,
        error,
      });
      throw error;
    }
  }

  getAuthenticationCredentialsSerialized({
    nearAccountId,
    challenge,
    allowCredentials
  }: {
    nearAccountId: AccountId;
    challenge: VRFChallenge;
    allowCredentials: AllowCredential[];
  }): Promise<WebAuthnAuthenticationCredential> {
    return this.touchIdPrompt.getAuthenticationCredentialsSerialized({
      nearAccountId,
      challenge,
      allowCredentials
    });
  }

  ///////////////////////////////////////
  // VRF MANAGER FUNCTIONS
  ///////////////////////////////////////

  /**
   * Generate a VRF challenge bound to a specific signing/confirm session.
   * The challenge will be cached in the VRF worker under this sessionId so
   * later contract verification (MINT_SESSION_KEYS_AND_SEND_TO_SIGNER) can look it up.
   */
  async generateVrfChallengeForSession(
    sessionId: string,
    vrfInputData: VRFInputData,
  ): Promise<VRFChallenge> {
    return this.vrfWorkerManager.generateVrfChallengeForSession(vrfInputData, sessionId);
  }

  /**
   * Generate a one-off VRF challenge without caching it in the VRF worker.
   * Use this for flows that don't perform contract verification or derive
   * wrap keys via MINT_SESSION_KEYS_AND_SEND_TO_SIGNER.
   */
  async generateVrfChallengeOnce(vrfInputData: VRFInputData): Promise<VRFChallenge> {
    return this.vrfWorkerManager.generateVrfChallengeOnce(vrfInputData);
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
  async generateVrfKeypairBootstrap(args: {
    saveInMemory: boolean;
    vrfInputData: VRFInputData;
    sessionId?: string;
  }): Promise<{
    vrfPublicKey: string;
    vrfChallenge: VRFChallenge;
  }> {
    return this.vrfWorkerManager.generateVrfKeypairBootstrap({
      vrfInputData: args.vrfInputData,
      saveInMemory: args.saveInMemory,
      sessionId: args.sessionId,
    });
  }

  /**
   * Derive NEAR keypair directly from a serialized WebAuthn registration credential
   */
  async deriveNearKeypairAndEncryptFromSerialized({
    credential,
    nearAccountId,
    options,
  }: {
    credential: WebAuthnRegistrationCredential;
    nearAccountId: string;
    options?: {
      authenticatorOptions?: AuthenticatorOptions;
      deviceNumber?: number;
    };
  }): Promise<{ success: boolean; nearAccountId: string; publicKey: string; iv?: string; wrapKeySalt?: string; error?: string }>{
    // Extract PRF.first for WrapKeySeed derivation
    const { chacha20PrfOutput } = extractPrfFromCredential({
      credential,
      firstPrfOutput: true,
      secondPrfOutput: false,
    });
    if (!chacha20PrfOutput) {
      throw new Error('PRF outputs missing from registration credential');
    }

    return this.withSigningSession(
      'reg',
      { prfFirstAuthB64u: chacha20PrfOutput, credential },
      (sessionId) =>
        this.signerWorkerManager.deriveNearKeypairAndEncryptFromSerialized({
          credential,
          nearAccountId: toAccountId(nearAccountId),
          options,
          sessionId,
        }),
    );
  }


  /**
   * **Sign Device2 registration transaction with already-stored key (no prompt)**
   *
   * Used by linkDevice flow after key swap to sign the registration transaction
   * without prompting the user again. Reuses the credential collected earlier.
   *
   * Flow:
   * 1. Extract PRF.first from the provided credential
   * 2. Create new MessagePort session for WrapKeySeed delivery
   * 3. VRF worker re-derives WrapKeySeed and sends to signer (with PRF.second)
   * 4. Signer worker retrieves encrypted key from IndexedDB
   * 5. Signer worker decrypts key and signs registration transaction
   *
   * @param nearAccountId - NEAR account ID for Device2
   * @param credential - WebAuthn registration credential from earlier prompt
   * @param vrfChallenge - VRF challenge from earlier prompt
   * @param deviceNumber - Device number for Device2
   * @returns Signed registration transaction ready for submission
   */
  async signDevice2RegistrationWithStoredKey(args: {
    nearAccountId: AccountId;
    credential: WebAuthnRegistrationCredential;
    vrfChallenge: VRFChallenge;
    deviceNumber: number;
    deterministicVrfPublicKey: string;
  }): Promise<{
    success: boolean;
    publicKey?: string;
    signedTransaction?: any;
    error?: string;
  }> {
    const { nearAccountId, credential, vrfChallenge, deviceNumber, deterministicVrfPublicKey } = args;
    const contractId = this.tatchiPasskeyConfigs.contractId;

    try {
      // Generate new session ID for this signing operation
      const sessionId = `device2-sign-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

      console.debug('[WebAuthnManager] Signing Device2 registration with stored key', {
        nearAccountId,
        deviceNumber,
        sessionId,
      });

      // Retrieve encrypted key data and wrapKeySalt from IndexedDB
      const encryptedKeyData = await IndexedDBManager.nearKeysDB.getEncryptedKey(
        nearAccountId,
        deviceNumber
      );
      if (!encryptedKeyData) {
        throw new Error(`No encrypted key found for account ${nearAccountId} device ${deviceNumber}`);
      }

      const wrapKeySalt = encryptedKeyData.wrapKeySalt;
      if (!wrapKeySalt) {
        throw new Error(`Missing wrapKeySalt for account ${nearAccountId} device ${deviceNumber}`);
      }
      console.debug('[WebAuthnManager] Retrieved wrapKeySalt from IndexedDB:', wrapKeySalt);

      // Extract PRF.first from the credential
      const { chacha20PrfOutput: prfFirstB64u } = extractPrfFromCredential({
        credential,
        firstPrfOutput: true,
        secondPrfOutput: false,
      });
      if (!prfFirstB64u) {
        throw new Error('Failed to extract PRF.first from credential');
      }

      // === STEP 1: Create MessagePort session for WrapKeySeed delivery ===
      const signerPort = await this.vrfWorkerManager.createSigningSessionChannel(sessionId);
      await this.signerWorkerManager.reserveSignerWorkerSession(sessionId, { signerPort });

      // === STEP 2: VRF worker re-derives WrapKeySeed and sends to signer ===
      // This extracts PRF.second from the credential and delivers both WrapKeySeed + PRF.second
      // to the signer worker via MessagePort
      await this.vrfWorkerManager.mintSessionKeysAndSendToSigner({
        sessionId,
        prfFirstAuthB64u: prfFirstB64u,
        wrapKeySalt,
        credential, // VRF will extract PRF.second from this
      });

      console.debug('[WebAuthnManager] WrapKeySeed sent to signer worker');

      // === STEP 4: Get transaction context for registration ===
      const transactionContext = await this.nonceManager.getNonceBlockHashAndHeight(this.nearClient);

      // === STEP 5: Determine deterministic VRF public key ===
      // Try: provided parameter → authenticator table → fallback to ephemeral VRF from challenge
      let vrfPublicKey = deterministicVrfPublicKey;
      console.debug('[WebAuthnManager] VRF public key lookup result', {
        vrfPublicKey,
      });
      // Fallback to ephemeral VRF public key from challenge if still not found
      const finalVrfPublicKey = vrfPublicKey || vrfChallenge.vrfPublicKey;
      console.debug('[WebAuthnManager] Final VRF public key for Device2 registration', {
        source: vrfPublicKey ? (deterministicVrfPublicKey ? 'provided' : 'authenticator') : 'challenge',
        finalVrfPublicKey,
        ephemeralVrfPublicKey: vrfChallenge.vrfPublicKey,
      });

      // === STEP 6: Signer worker signs registration transaction ===
      // WrapKeySeed and PRF.second are already in signer worker via MessagePort
      const signerResult = await this.signerWorkerManager.registerDevice2WithDerivedKey({
        sessionId,
        nearAccountId,
        credential,
        vrfChallenge,
        transactionContext,
        contractId,
        wrapKeySalt,
        deviceNumber,
        deterministicVrfPublicKey: finalVrfPublicKey,
      });

      console.debug('[WebAuthnManager] Device2 registration signed with stored key', {
        publicKey: signerResult.publicKey,
      });

      return {
        success: true,
        publicKey: signerResult.publicKey,
        signedTransaction: signerResult.signedTransaction,
      };

    } catch (error: any) {
      console.error('[WebAuthnManager] Failed to sign Device2 registration with stored key:', error);
      return {
        success: false,
        error: error.message || String(error),
      };
    }
  }

  /**
   * Derive deterministic VRF keypair from PRF output for recovery
   * Optionally generates VRF challenge if input parameters are provided
   * This enables deterministic VRF key derivation from WebAuthn credentials
   *
   * @param credential - WebAuthn credential containing PRF outputs
   * @param nearAccountId - NEAR account ID for key derivation salt
   * @param vrfInputParams - Optional VRF inputs, if provided will generate a challenge
   * @param saveInMemory - Whether to save the derived VRF keypair in worker memory for immediate use
   * @returns Deterministic VRF public key, optional VRF challenge, and encrypted VRF keypair for storage
   */
  async deriveVrfKeypair({
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
    success: boolean;
    vrfPublicKey: string;
    encryptedVrfKeypair: EncryptedVRFKeypair;
    vrfChallenge: VRFChallenge | null;
    serverEncryptedVrfKeypair: ServerEncryptedVrfKeypair | null;
  }> {
    try {
      console.debug('WebAuthnManager: Deriving deterministic VRF keypair from PRF output');
      const vrfResult = await this.vrfWorkerManager.deriveVrfKeypairFromPrf({
        credential,
        nearAccountId,
        vrfInputData,
        saveInMemory,
      });

      console.debug(`Derived VRF public key: ${vrfResult.vrfPublicKey}`);
      if (vrfResult.vrfChallenge) {
        console.debug(`Generated VRF challenge with output: ${vrfResult.vrfChallenge.vrfOutput.substring(0, 20)}...`);
      } else {
        console.debug('No VRF challenge generated (vrfInputData not provided)');
      }
      if (vrfResult.encryptedVrfKeypair) {
        console.debug(`Generated encrypted VRF keypair for storage`);
      }
      console.debug('WebAuthnManager: Deterministic VRF keypair derived successfully');

      const result: {
        success: boolean;
        vrfPublicKey: string;
        encryptedVrfKeypair: EncryptedVRFKeypair;
        vrfChallenge: VRFChallenge | null;
        serverEncryptedVrfKeypair: ServerEncryptedVrfKeypair | null;
      } = {
        success: true,
        vrfPublicKey: vrfResult.vrfPublicKey,
        encryptedVrfKeypair: vrfResult.encryptedVrfKeypair,
        vrfChallenge: vrfResult.vrfChallenge,
        serverEncryptedVrfKeypair: vrfResult.serverEncryptedVrfKeypair,
      };

      return result;

    } catch (error: any) {
      console.error('WebAuthnManager: VRF keypair derivation error:', error);
      throw new Error(`VRF keypair derivation failed ${error.message}`);
    }
  }

  /**
   * Derive deterministic VRF keypair from a raw base64url PRF output.
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
    success: boolean;
    vrfPublicKey: string;
    encryptedVrfKeypair: EncryptedVRFKeypair;
    vrfChallenge: VRFChallenge | null;
    serverEncryptedVrfKeypair: ServerEncryptedVrfKeypair | null;
  }> {
    const r = await this.vrfWorkerManager.deriveVrfKeypairFromRawPrf({
      prfOutput,
      nearAccountId,
      vrfInputData,
      saveInMemory,
    });
    return {
      success: true,
      vrfPublicKey: r.vrfPublicKey,
      encryptedVrfKeypair: r.encryptedVrfKeypair,
      vrfChallenge: r.vrfChallenge,
      serverEncryptedVrfKeypair: r.serverEncryptedVrfKeypair,
    };
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
    credential: WebAuthnAuthenticationCredential;
  }): Promise<{ success: boolean; error?: string }> {
    try {
      console.debug('WebAuthnManager: Unlocking VRF keypair', {
        nearAccountId,
        hasEncryptedData: !!encryptedVrfKeypair?.encryptedVrfDataB64u,
      });

      const unlockResult = await this.vrfWorkerManager.unlockVrfKeypair({
        credential,
        nearAccountId,
        encryptedVrfKeypair,
      });

      if (!unlockResult.success) {
        console.error('WebAuthnManager: VRF keypair unlock failed');
        return { success: false, error: 'VRF keypair unlock failed' };
      }

      // Warm up signer workers after a successful unlock to minimize first-use latency
      this.signerWorkerManager.preWarmWorkerPool().catch(() => {});

      return { success: true };

    } catch (error: any) {
      console.error('WebAuthnManager: VRF keypair unlock failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Perform Shamir 3-pass commutative decryption within WASM worker
   * This securely decrypts a server-encrypted KEK (key encryption key)
   * which the wasm worker uses to unlock a key to decrypt the VRF keypair and loads it into memory
   * The server never knows the real value of the KEK, nor the VRF keypair
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
  }): Promise<{ success: boolean; error?: string }> {
    const result = await this.vrfWorkerManager.shamir3PassDecryptVrfKeypair({
      nearAccountId,
      kek_s_b64u,
      ciphertextVrfB64u,
      serverKeyId,
    });

    return {
      success: result.success,
      error: result.error
    };
  }

  /**
   * Shamir 3-pass: encrypt the unlocked VRF keypair under the server key
   * Returns a fresh blob to store in IndexedDB for future auto-login.
   */
  async shamir3PassEncryptCurrentVrfKeypair(): Promise<ServerEncryptedVrfKeypair> {
    const res = await this.vrfWorkerManager.shamir3PassEncryptCurrentVrfKeypair();
    return {
      ciphertextVrfB64u: res.ciphertextVrfB64u,
      kek_s_b64u: res.kek_s_b64u,
      serverKeyId: res.serverKeyId,
    };
  }

  /**
   * Persist refreshed server-encrypted VRF keypair in IndexedDB.
   */
  async updateServerEncryptedVrfKeypair(
    nearAccountId: AccountId,
    serverEncrypted: ServerEncryptedVrfKeypair
  ): Promise<void> {
    await IndexedDBManager.clientDB.updateUser(nearAccountId, {
      serverEncryptedVrfKeypair: {
        ciphertextVrfB64u: serverEncrypted.ciphertextVrfB64u,
        kek_s_b64u: serverEncrypted.kek_s_b64u,
        serverKeyId: serverEncrypted.serverKeyId,
        updatedAt: Date.now(),
      }
    });
  }

  async clearVrfSession(): Promise<void> {
    // In cross-origin dev, skip local worker init; wallet iframe handles PM_LOGOUT
    if (typeof window !== 'undefined' && this.workerBaseOrigin !== window.location.origin) {
      return;
    }
    return await this.vrfWorkerManager.clearVrfSession();
  }

  /**
   * Check VRF worker status
   */
  async checkVrfStatus(): Promise<{
    active: boolean;
    nearAccountId: AccountId | null;
    sessionDuration?: number
  }> {
    return this.vrfWorkerManager.checkVrfStatus();
  }

  /**
   * Unlock (mint/refresh) the VRF-owned signing session for warm signing.
   *
   * This prompts for TouchID/FaceID to obtain PRF.first_auth, then derives WrapKeySeed
   * inside the VRF worker and stores it under the per-account sessionId.
   *
   * Session policy:
   * - `remainingUses` is decremented on `DISPENSE_SESSION_KEY` (warm signing).
   * - `ttlMs` controls the in-worker expiry timestamp.
   */
  async unlockSigningSession(args: {
    nearAccountId: AccountId;
    remainingUses?: number;
    ttlMs?: number;
  }): Promise<{
    sessionId: string;
    status: 'active' | 'exhausted' | 'expired' | 'not_found';
    remainingUses?: number;
    expiresAtMs?: number;
    createdAtMs?: number;
  }> {
    const nearAccountId = toAccountId(args.nearAccountId);
    const sessionId = this.getOrCreateActiveSigningSessionId(nearAccountId);

    // Ensure VRF keypair is active and bound to the same account.
    const vrfStatus = await this.vrfWorkerManager.checkVrfStatus();
    if (!vrfStatus.active) {
      throw new Error('VRF keypair not active in memory. Please log in again.');
    }
    if (!vrfStatus.nearAccountId || String(vrfStatus.nearAccountId) !== String(nearAccountId)) {
      throw new Error('VRF keypair active but bound to a different account. Please log in again.');
    }

    // Fetch wrapKeySalt from vault so the derived WrapKeySeed can decrypt the stored NEAR keys.
    const deviceNumber = await getLastLoggedInDeviceNumber(nearAccountId, IndexedDBManager.clientDB);
    const encryptedKeyData = await IndexedDBManager.nearKeysDB.getEncryptedKey(nearAccountId, deviceNumber);
    if (!encryptedKeyData) {
      throw new Error(`No encrypted key found for account ${nearAccountId} device ${deviceNumber}`);
    }
    const wrapKeySalt = encryptedKeyData.wrapKeySalt || encryptedKeyData.iv || '';
    if (!wrapKeySalt) {
      throw new Error('Missing wrapKeySalt in vault; re-register to upgrade vault format.');
    }

    const { ttlMs, remainingUses } = this.resolveSigningSessionPolicy(args);

    // Provide contract verification context (best-effort) so the VRF worker can gate
    // session creation on verify_authentication_response when supported.
    const contractId = this.tatchiPasskeyConfigs.contractId;
    const nearRpcUrl = this.tatchiPasskeyConfigs.nearRpcUrl;

    // Generate a VRF challenge bound to this sessionId (cached in the VRF worker).
    // VRF challenges must be fresh enough for on-chain verification (block-height max age).
    // Force-refresh to avoid subtle cache issues when this is called infrequently.
    const txCtx = await this.nonceManager.getNonceBlockHashAndHeight(this.nearClient, { force: true });
    const vrfChallenge = await this.vrfWorkerManager.generateVrfChallengeForSession(
      {
        userId: String(nearAccountId),
        rpId: this.touchIdPrompt.getRpId(),
        blockHeight: txCtx.txBlockHeight,
        blockHash: txCtx.txBlockHash,
      },
      sessionId,
    );

    // Prompt for TouchID/FaceID and extract PRF.first_auth.
    const authenticators = await IndexedDBManager.clientDB.getAuthenticatorsByUser(nearAccountId);
    const { authenticatorsForPrompt } = await IndexedDBManager.clientDB.ensureCurrentPasskey(
      nearAccountId,
      authenticators,
    );
    const credential = await this.touchIdPrompt.getAuthenticationCredentialsSerialized({
      nearAccountId: String(nearAccountId),
      challenge: vrfChallenge,
      allowCredentials: authenticatorsToAllowCredentials(authenticatorsForPrompt),
    });
    const { chacha20PrfOutput: prfFirstAuthB64u } = extractPrfFromCredential({
      credential,
      firstPrfOutput: true,
      secondPrfOutput: false,
    });
    if (!prfFirstAuthB64u) {
      throw new Error('Failed to extract PRF.first from credential');
    }

    await this.vrfWorkerManager.mintSessionKeysAndSendToSigner({
      sessionId,
      prfFirstAuthB64u,
      wrapKeySalt,
      contractId,
      nearRpcUrl,
      ttlMs,
      remainingUses,
      credential,
    });

    return await this.vrfWorkerManager.checkSessionStatus({ sessionId });
  }

  /**
   * Mint/refresh a VRF-owned warm signing session using an already-collected WebAuthn credential.
   *
   * This is used to avoid a second TouchID prompt during login flows when we already
   * performed an authentication ceremony (e.g., to unlock the VRF keypair).
   *
   * Notes:
   * - This method does not initiate a WebAuthn prompt.
   * - Contract verification is optional and only performed when `contractId` + `nearRpcUrl` are provided.
   */
  async unlockSigningSessionFromCredential(args: {
    nearAccountId: AccountId;
    credential: WebAuthnAuthenticationCredential;
    remainingUses?: number;
    ttlMs?: number;
    contractId?: string;
    nearRpcUrl?: string;
  }): Promise<{
    sessionId: string;
    status: 'active' | 'exhausted' | 'expired' | 'not_found';
    remainingUses?: number;
    expiresAtMs?: number;
    createdAtMs?: number;
  }> {
    const nearAccountId = toAccountId(args.nearAccountId);
    const sessionId = this.getOrCreateActiveSigningSessionId(nearAccountId);

    // Ensure VRF keypair is active and bound to the same account.
    const vrfStatus = await this.vrfWorkerManager.checkVrfStatus();
    if (!vrfStatus.active) {
      throw new Error('VRF keypair not active in memory. Please log in again.');
    }
    if (!vrfStatus.nearAccountId || String(vrfStatus.nearAccountId) !== String(nearAccountId)) {
      throw new Error('VRF keypair active but bound to a different account. Please log in again.');
    }

    // Fetch wrapKeySalt from vault so the derived WrapKeySeed can decrypt the stored NEAR keys.
    const deviceNumber = await getLastLoggedInDeviceNumber(nearAccountId, IndexedDBManager.clientDB);
    const encryptedKeyData = await IndexedDBManager.nearKeysDB.getEncryptedKey(nearAccountId, deviceNumber);
    if (!encryptedKeyData) {
      throw new Error(`No encrypted key found for account ${nearAccountId} device ${deviceNumber}`);
    }
    const wrapKeySalt = encryptedKeyData.wrapKeySalt || encryptedKeyData.iv || '';
    if (!wrapKeySalt) {
      throw new Error('Missing wrapKeySalt in vault; re-register to upgrade vault format.');
    }

    // Extract PRF.first_auth from the already-collected credential.
    const { chacha20PrfOutput: prfFirstAuthB64u } = extractPrfFromCredential({
      credential: args.credential,
      firstPrfOutput: true,
      secondPrfOutput: false,
    });
    if (!prfFirstAuthB64u) {
      throw new Error('Failed to extract PRF.first from credential');
    }

    const { ttlMs, remainingUses } = this.resolveSigningSessionPolicy(args);

    await this.vrfWorkerManager.mintSessionKeysAndSendToSigner({
      sessionId,
      prfFirstAuthB64u,
      wrapKeySalt,
      contractId: args.contractId,
      nearRpcUrl: args.nearRpcUrl,
      ttlMs,
      remainingUses,
      credential: args.credential,
    });

    return await this.vrfWorkerManager.checkSessionStatus({ sessionId });
  }

  /**
   * Introspect the VRF-owned signing session for UI (no prompt, metadata only).
   * Session usage (`remainingUses`) is decremented on `DISPENSE_SESSION_KEY` calls.
   */
  async getSigningSessionStatus(nearAccountId: AccountId): Promise<{
    sessionId: string;
    status: 'active' | 'exhausted' | 'expired' | 'not_found';
    remainingUses?: number;
    expiresAtMs?: number;
    createdAtMs?: number;
  }> {
    const sessionId = this.getOrCreateActiveSigningSessionId(nearAccountId);
    return await this.vrfWorkerManager.checkSessionStatus({ sessionId });
  }

  /**
   * Explicitly clear the VRF-owned signing session material for UI "Lock" actions.
   * This does not log out the VRF keypair; it only clears session-bound WrapKeySeed material and ports.
   */
  async clearSigningSession(nearAccountId: AccountId): Promise<{
    sessionId: string;
    clearedSession: boolean;
    clearedChallenge: boolean;
    clearedPort: boolean;
  }> {
    const sessionId = this.getOrCreateActiveSigningSessionId(nearAccountId);
    return await this.vrfWorkerManager.clearSession({ sessionId });
  }

  /**
   * Fetch Shamir server key info to support proactive refresh.
   */
  async getShamirKeyInfo(): Promise<{
    currentKeyId: string | null;
    p_b64u: string | null;
    graceKeyIds?: string[]
  } | null> {
    try {
      const relayUrl = this.tatchiPasskeyConfigs?.vrfWorkerConfigs?.shamir3pass?.relayServerUrl;
      if (!relayUrl) return null;
      const res = await fetch(`${relayUrl}/shamir/key-info`, { method: 'GET' });
      if (!res.ok) return null;
      const data = await res.json();
      return {
        currentKeyId: data?.currentKeyId ?? null,
        p_b64u: data?.p_b64u ?? null,
        graceKeyIds: Array.isArray(data?.graceKeyIds) ? data.graceKeyIds : undefined,
      };
    } catch {
      return null;
    }
  }

  /**
   * If server key changed and VRF is unlocked in memory, re-encrypt under the new server key.
   * Returns true if refreshed, false otherwise.
   */
  async maybeProactiveShamirRefresh(nearAccountId: AccountId): Promise<boolean> {
    try {
      const relayUrl = this.tatchiPasskeyConfigs?.vrfWorkerConfigs?.shamir3pass?.relayServerUrl;
      if (!relayUrl) return false;
      const userData = await this.getLastUser();
      const stored = userData?.serverEncryptedVrfKeypair;
      if (!stored || !stored.kek_s_b64u || !stored.ciphertextVrfB64u || !stored.serverKeyId) return false;

      const keyInfo = await this.getShamirKeyInfo();
      const currentKeyId = keyInfo?.currentKeyId;
      if (!currentKeyId || currentKeyId === stored.serverKeyId) return false;

      const status = await this.checkVrfStatus();
      const active = status.active && status.nearAccountId === nearAccountId;
      if (!active) return false;

      const refreshed = await this.shamir3PassEncryptCurrentVrfKeypair();
      await this.updateServerEncryptedVrfKeypair(nearAccountId, refreshed);
      return true;
    } catch {
      return false;
    }
  }

  ///////////////////////////////////////
  // INDEXEDDB OPERATIONS
  ///////////////////////////////////////

  async storeUserData(userData: StoreUserDataInput): Promise<void> {
    await IndexedDBManager.clientDB.storeWebAuthnUserData({
      ...userData,
      version: userData.version || 2,
    });
  }

  async getAllUsers(): Promise<ClientUserData[]> {
    return await IndexedDBManager.clientDB.getAllUsers();
  }

  async getUserByDevice(nearAccountId: AccountId, deviceNumber: number): Promise<ClientUserData | null> {
    return await IndexedDBManager.clientDB.getUserByDevice(nearAccountId, deviceNumber);
  }

  async getLastUser(): Promise<ClientUserData | null> {
    return await IndexedDBManager.clientDB.getLastUser();
  }

  async getAuthenticatorsByUser(nearAccountId: AccountId): Promise<ClientAuthenticatorData[]> {
    return await IndexedDBManager.clientDB.getAuthenticatorsByUser(nearAccountId);
  }

  async updateLastLogin(nearAccountId: AccountId): Promise<void> {
    return await IndexedDBManager.clientDB.updateLastLogin(nearAccountId);
  }

  /**
   * Set the last logged-in user
   * @param nearAccountId - The account ID of the user
   * @param deviceNumber - The device number (defaults to 1)
   */
  async setLastUser(nearAccountId: AccountId, deviceNumber: number = 1): Promise<void> {
    return await IndexedDBManager.clientDB.setLastUser(nearAccountId, deviceNumber);
  }


  /**
   * Initialize current user authentication state
   * This should be called after VRF keypair is successfully unlocked in memory
   * to ensure the user is properly logged in and can perform transactions
   *
   * @param nearAccountId - The NEAR account ID to initialize
   * @param nearClient - The NEAR client for nonce prefetching
   */
  async initializeCurrentUser(
    nearAccountId: AccountId,
    nearClient?: NearClient,
  ): Promise<void> {
    const accountId = toAccountId(nearAccountId);

    // Set as last user for future sessions, preserving the current deviceNumber
    // when it is already known for this account.
    let deviceNumberToUse: number | null = null;
    const lastUser = await IndexedDBManager.clientDB.getLastUser().catch(() => null);
    if (
      lastUser &&
      toAccountId(lastUser.nearAccountId) === accountId &&
      Number.isFinite(lastUser.deviceNumber)
    ) {
      deviceNumberToUse = lastUser.deviceNumber;
    }

    if (deviceNumberToUse === null) {
      const userForAccount = await IndexedDBManager.clientDB
        .getUserByDevice(accountId, 1)
        .catch(() => null);
      if (userForAccount && Number.isFinite(userForAccount.deviceNumber)) {
        deviceNumberToUse = userForAccount.deviceNumber;
      }
    }

    if (deviceNumberToUse === null) {
      deviceNumberToUse = 1;
    }

    await this.setLastUser(accountId, deviceNumberToUse);

    // Set as current user for immediate use
    this.userPreferencesManager.setCurrentUser(accountId);
    // Ensure confirmation preferences are loaded before callers read them (best-effort)
    await this.userPreferencesManager.reloadUserSettings().catch(() => undefined);

    // Initialize NonceManager with the selected user's public key (best-effort)
    const userData = await IndexedDBManager.clientDB
      .getUserByDevice(accountId, deviceNumberToUse)
      .catch(() => null);
    if (userData && userData.clientNearPublicKey) {
      this.nonceManager.initializeUser(accountId, userData.clientNearPublicKey);
    }

    // Prefetch block height for better UX (non-fatal if it fails and nearClient is provided)
    if (nearClient) {
      await this.nonceManager
        .prefetchBlockheight(nearClient)
        .catch((prefetchErr) => console.debug('Nonce prefetch after authentication state initialization failed (non-fatal):', prefetchErr));
    }
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

  /**
   * Atomically store all registration data (user, authenticator, VRF credentials)
   */
  async atomicStoreRegistrationData({
    nearAccountId,
    credential,
    publicKey,
    encryptedVrfKeypair,
    vrfPublicKey,
    serverEncryptedVrfKeypair,
    wrapKeySalt,
  }: {
    nearAccountId: AccountId;
    credential: WebAuthnRegistrationCredential;
    publicKey: string;
    encryptedVrfKeypair: EncryptedVRFKeypair;
    vrfPublicKey: string;
    serverEncryptedVrfKeypair: ServerEncryptedVrfKeypair | null;
    wrapKeySalt?: string;
  }): Promise<void> {
    await this.atomicOperation(async (db) => {
      // Store credential for authentication
      const credentialId: string = credential.rawId;
      const attestationB64u: string = credential.response.attestationObject;
      const transports: string[] = credential.response?.transports;

      await this.storeAuthenticator({
        nearAccountId: nearAccountId,
        credentialId: credentialId,
        credentialPublicKey: await this.extractCosePublicKey(attestationB64u),
        transports,
        name: `VRF Passkey for ${this.extractUsername(nearAccountId)}`,
        registered: new Date().toISOString(),
        syncedAt: new Date().toISOString(),
        vrfPublicKey: vrfPublicKey,
      });

      // Store WebAuthn user data with encrypted VRF credentials
      await this.storeUserData({
        nearAccountId,
        deviceNumber: 1,
        clientNearPublicKey: publicKey,
        lastUpdated: Date.now(),
        passkeyCredential: {
          id: credential.id,
          rawId: credentialId
        },
        encryptedVrfKeypair: {
          encryptedVrfDataB64u: encryptedVrfKeypair.encryptedVrfDataB64u,
          chacha20NonceB64u: encryptedVrfKeypair.chacha20NonceB64u,
        },
        wrapKeySalt,
        version: 2,
        serverEncryptedVrfKeypair: serverEncryptedVrfKeypair ? {
          ciphertextVrfB64u: serverEncryptedVrfKeypair?.ciphertextVrfB64u,
          kek_s_b64u: serverEncryptedVrfKeypair?.kek_s_b64u,
          serverKeyId: serverEncryptedVrfKeypair?.serverKeyId,
          updatedAt: Date.now(),
        } : undefined,
      });

      console.debug('Registration data stored atomically');
      return true;
    });
  }

  ///////////////////////////////////////
  // SIGNER WASM WORKER OPERATIONS
  ///////////////////////////////////////

  /**
   * Transaction signing with contract verification and progress updates.
   * Demonstrates the "streaming" worker pattern similar to SSE.
   *
   * Requires a successful TouchID/biometric prompt before transaction signing in wasm worker
   * Automatically verifies the authentication with the web3authn contract.
   *
   * @param transactions - Transaction payload containing:
   *   - receiverId: NEAR account ID receiving the transaction
   *   - actions: Array of NEAR actions to execute
   * @param rpcCall: RpcCallPayload containing:
   *   - contractId: Web3Authn contract ID for verification
   *   - nearRpcUrl: NEAR RPC endpoint URL
   *   - nearAccountId: NEAR account ID performing the transaction
   * @param confirmationConfigOverride: Optional confirmation configuration override
   * @param onEvent: Optional callback for progress updates during signing
   * @param onEvent - Optional callback for progress updates during signing
   */
  async signTransactionsWithActions({
    transactions,
    rpcCall,
    confirmationConfigOverride,
    onEvent,
  }: {
    transactions: TransactionInputWasm[],
    rpcCall: RpcCallPayload,
    // Accept partial override; merging happens in handlers layer
    confirmationConfigOverride?: Partial<ConfirmationConfig>,
    onEvent?: (update: onProgressEvents) => void,
  }): Promise<SignTransactionResult[]> {

    if (transactions.length === 0) {
      throw new Error('No payloads provided for signing');
    }
    const activeSessionId = this.getOrCreateActiveSigningSessionId(toAccountId(rpcCall.nearAccountId));
    return this.withSigningSessionId(activeSessionId, (sessionId) =>
      this.signerWorkerManager.signTransactionsWithActions({
        transactions,
        rpcCall,
        confirmationConfigOverride,
        onEvent,
        sessionId,
      })
    );
  }

  async signDelegateAction({
    delegate,
    rpcCall,
    confirmationConfigOverride,
    onEvent,
  }: {
    delegate: DelegateActionInput;
    rpcCall: RpcCallPayload;
    // Accept partial override; merging happens in handlers layer
    confirmationConfigOverride?: Partial<ConfirmationConfig>;
    onEvent?: (update: onProgressEvents) => void;
  }): Promise<{
    signedDelegate: WasmSignedDelegate;
    hash: string;
    nearAccountId: AccountId;
    logs?: string[];
  }> {
    const nearAccountId = toAccountId(rpcCall.nearAccountId || delegate.senderId);
    const normalizedRpcCall: RpcCallPayload = {
      contractId: rpcCall.contractId || this.tatchiPasskeyConfigs.contractId,
      nearRpcUrl: rpcCall.nearRpcUrl || this.tatchiPasskeyConfigs.nearRpcUrl,
      nearAccountId,
    };

    // Lightweight debug logs to help trace delegate signing stalls.
    // eslint-disable-next-line no-console
    console.debug('[WebAuthnManager][delegate] start', {
      nearAccountId: String(nearAccountId),
      receiverId: delegate.receiverId,
      actions: delegate.actions?.length ?? 0,
      nonce: delegate.nonce,
      maxBlockHeight: delegate.maxBlockHeight,
      rpcCall: normalizedRpcCall,
    });

    try {
      const activeSessionId = this.getOrCreateActiveSigningSessionId(nearAccountId);
      return await this.withSigningSessionId(activeSessionId, (sessionId) => {
        // eslint-disable-next-line no-console
        console.debug('[WebAuthnManager][delegate] session created', { sessionId });
        return this.signerWorkerManager.signDelegateAction({
          delegate,
          rpcCall: normalizedRpcCall,
          confirmationConfigOverride,
          onEvent,
          sessionId,
        });
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[WebAuthnManager][delegate] failed', err);
      throw err;
    }
  }

  async signNEP413Message(payload: {
    message: string;
    recipient: string;
    nonce: string;
    state: string | null;
    accountId: AccountId;
  }): Promise<{
    success: boolean;
    accountId: string;
    publicKey: string;
    signature: string;
    state?: string;
    error?: string;
  }> {
    try {
      const activeSessionId = this.getOrCreateActiveSigningSessionId(payload.accountId);
      const result = await this.withSigningSessionId(activeSessionId, (sessionId) =>
        this.signerWorkerManager.signNep413Message({ ...payload, sessionId })
      );
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

  // === COSE OPERATIONS ===

  /**
   * Extract COSE public key from WebAuthn attestation object using WASM worker
   */
  async extractCosePublicKey(attestationObjectBase64url: string): Promise<Uint8Array> {
    return await this.signerWorkerManager.extractCosePublicKey(attestationObjectBase64url);
  }

  ///////////////////////////////////////
  // PRIVATE KEY EXPORT (Drawer/Modal in sandboxed iframe)
  ///////////////////////////////////////

  /** Worker-driven export: two-phase V2 (collect PRF → decrypt → show UI) */
  async exportNearKeypairWithUIWorkerDriven(
    nearAccountId: AccountId,
    options?: { variant?: 'drawer'|'modal', theme?: 'dark'|'light' }
  ): Promise<void> {
    await this.withSigningSession('export-session', async (sessionId) => {
      // Phase 1: collect PRF via LocalOnly(DECRYPT_PRIVATE_KEY_WITH_PRF) inside VRF worker
      // and derive WrapKeySeed with the vault-provided wrapKeySalt.
      await this.confirmDecryptAndDeriveWrapKeySeed({ nearAccountId, sessionId });

      // Phase 2 + 3: decrypt inside signer worker using the reserved session,
      // then show the export viewer UI.
      return this.signerWorkerManager.exportNearKeypairUi({
        nearAccountId,
        variant: options?.variant,
        theme: options?.theme,
        sessionId,
      });
    });
  }

  async exportNearKeypairWithUI(
    nearAccountId: AccountId,
    options?: {
      variant?: 'drawer' | 'modal';
      theme?: 'dark' | 'light'
    }
  ): Promise<{ accountId: string; publicKey: string; privateKey: string }>{
    // Route to worker-driven two-phase flow. UI is shown inside the wallet host; no secrets are returned.
    await this.exportNearKeypairWithUIWorkerDriven(nearAccountId, options);
    // Surface the freshest device key for this account to the caller.
    // Prefer last user when it matches the account, else pick the most recently
    // updated user record for this account.
    let userData = await this.getLastUser();
    if (!userData || userData.nearAccountId !== nearAccountId) {
      userData = await IndexedDBManager.clientDB.getLastDBUpdatedUser(nearAccountId);
    }
    return {
      accountId: String(nearAccountId),
      publicKey: String(userData?.clientNearPublicKey || ''),
      privateKey: '',
    };
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
    credential: WebAuthnRegistrationCredential,
    vrfChallenge: VRFChallenge,
    authenticatorOptions?: AuthenticatorOptions;
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
      nearRpcUrl: this.tatchiPasskeyConfigs.nearRpcUrl,
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
    authenticationCredential: WebAuthnAuthenticationCredential,
    accountIdHint?: string,
  ): Promise<{
    publicKey: string;
    encryptedPrivateKey: string;
    iv: string;
    accountIdHint?: string;
    wrapKeySalt?: string;
    stored?: boolean;
  }> {
    try {
      // Verify we have an authentication credential (not registration)
      if (!authenticationCredential) {
        throw new Error(
          'Authentication credential required for account recovery. ' +
          'Use an existing credential with dual PRF outputs to re-derive the same NEAR keypair.'
        );
      }

      // Verify dual PRF outputs are available
      const prfResults = authenticationCredential.clientExtensionResults?.prf?.results;
      if (!prfResults?.first || !prfResults?.second) {
        throw new Error('Dual PRF outputs required for account recovery - both AES and Ed25519 PRF outputs must be available');
      }

      // Extract PRF.first for WrapKeySeed derivation
      const { chacha20PrfOutput } = extractPrfFromCredential({
        credential: authenticationCredential,
        firstPrfOutput: true,
        secondPrfOutput: false,
      });
      if (!chacha20PrfOutput) {
        throw new Error('PRF outputs missing from authentication credential for recovery');
      }

      // Orchestrate a VRF-owned signing session with WrapKeySeed derivation, then ask
      // the signer to recover and re-encrypt the NEAR keypair.
      const result = await this.withSigningSession(
        'recover',
        { prfFirstAuthB64u: chacha20PrfOutput },
        (sessionId) =>
          this.signerWorkerManager.recoverKeypairFromPasskey({
            credential: authenticationCredential,
            accountIdHint,
            sessionId,
          }),
      );
      return result;

    } catch (error: any) {
      console.error('WebAuthnManager: Deterministic keypair derivation error:', error);
      throw new Error(`Deterministic keypair derivation failed: ${error.message}`);
    }
  }

  async getAuthenticationCredentialsForRecovery({
    nearAccountId,
    challenge,
    credentialIds,
  }: {
    nearAccountId: AccountId;
    challenge: VRFChallenge,
    credentialIds: string[];
  }): Promise<WebAuthnAuthenticationCredential> {
    // Same as getAuthenticationCredentialsSerialized but returns both PRF outputs
    // for account recovery
    return this.touchIdPrompt.getAuthenticationCredentialsForRecovery({
      nearAccountId,
      challenge,
      allowCredentials: credentialIds.map(id => ({
        id: id,
        type: 'public-key',
        transports: ['internal', 'hybrid', 'usb', 'ble'] as AuthenticatorTransport[]
      })),
    });
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
    actions: ActionArgsWasm[];
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

  // ==============================
  // USER SETTINGS
  // ==============================

  /** * Get user preferences manager */
  getUserPreferences(): UserPreferencesManager {
    return this.userPreferencesManager;
  }

  /** * Clean up resources */
  destroy(): void {
    if (this.userPreferencesManager) {
      this.userPreferencesManager.destroy();
    }
    if (this.nonceManager) {
      this.nonceManager.clear();
    }
    this.activeSigningSessionIds.clear();
  }

}
