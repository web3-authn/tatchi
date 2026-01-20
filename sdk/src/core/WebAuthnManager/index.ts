import {
  IndexedDBManager,
  type ClientUserData,
  type ClientAuthenticatorData,
  type UnifiedIndexedDBManager,
} from '../IndexedDBManager';
import { StoreUserDataInput } from '../IndexedDBManager/passkeyClientDB';
import type { ThresholdEd25519_2p_V1Material } from '../IndexedDBManager/passkeyNearKeysDB';
import { buildThresholdEd25519Participants2pV1 } from '../../threshold/participants';
import { type NearClient, SignedTransaction } from '../NearClient';
import { SignerWorkerManager } from './SignerWorkerManager';
import { VrfWorkerManager } from './VrfWorkerManager';
import { AllowCredential, TouchIdPrompt } from './touchIdPrompt';
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
import { ActionType, type ActionArgsWasm, type TransactionInputWasm } from '../types/actions';
import type { RegistrationEventStep3, RegistrationHooksOptions, RegistrationSSEEvent, onProgressEvents } from '../types/sdkSentEvents';
import type { SignTransactionResult, TatchiConfigs, ThemeName } from '../types/tatchi';
import type { AccountId } from '../types/accountIds';
import type { AuthenticatorOptions } from '../types/authenticatorOptions';
import type { DelegateActionInput } from '../types/delegate';
import {
  INTERNAL_WORKER_REQUEST_TYPE_SIGN_ADD_KEY_THRESHOLD_PUBLIC_KEY_NO_PROMPT,
  isSignAddKeyThresholdPublicKeyNoPromptSuccess,
  type ConfirmationConfig,
  type RpcCallPayload,
  type SignerMode,
  type ThresholdBehavior,
  type WasmSignedDelegate,
} from '../types/signer-worker';
import { WebAuthnRegistrationCredential, WebAuthnAuthenticationCredential } from '../types';
import { RegistrationCredentialConfirmationPayload } from './SignerWorkerManager/handlers/validation';
import { resolveWorkerBaseOrigin, onEmbeddedBaseChange } from '../sdkPaths';
import { DEFAULT_WAIT_STATUS, type TransactionContext } from '../types/rpc';
import { getLastLoggedInDeviceNumber } from './SignerWorkerManager/getDeviceNumber';
import { __isWalletIframeHostMode } from '../WalletIframe/host-mode';
import { hasAccessKey } from '../rpcCalls';
import { ensureEd25519Prefix } from '../../utils/validation';
import { enrollThresholdEd25519KeyHandler } from './threshold/enrollThresholdEd25519Key';
import { rotateThresholdEd25519KeyPostRegistrationHandler } from './threshold/rotateThresholdEd25519KeyPostRegistration';
import { collectAuthenticationCredentialForVrfChallenge as collectAuthenticationCredentialForVrfChallengeImpl } from './collectAuthenticationCredentialForVrfChallenge';

type SigningSessionOptions = {
  /** PRF-bearing credential; VRF worker extracts PRF outputs internally */
  credential: WebAuthnRegistrationCredential | WebAuthnAuthenticationCredential;
  /**
   * Optional wrapKeySalt for WrapKeySeed delivery.
   * When provided, VRF worker will reuse this salt instead of generating a new one.
   */
  wrapKeySalt?: string;
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
  private theme: ThemeName = 'dark';
  // VRF-owned signing session id per account (warm session reuse).
  private activeSigningSessionIds: Map<string, string> = new Map();

  readonly tatchiPasskeyConfigs: TatchiConfigs;

  constructor(tatchiPasskeyConfigs: TatchiConfigs, nearClient: NearClient) {
    this.tatchiPasskeyConfigs = tatchiPasskeyConfigs;
    this.nearClient = nearClient;
    // Respect rpIdOverride. Safari get() bridge fallback is always enabled.
    this.touchIdPrompt = new TouchIdPrompt(
      tatchiPasskeyConfigs.iframeWallet?.rpIdOverride,
      true,
    );
    this.userPreferencesManager = UserPreferencesInstance;
    // Apply integrator-provided default signer mode (in-memory only; user preferences may override later).
    this.userPreferencesManager.configureDefaultSignerMode?.(tatchiPasskeyConfigs.signerMode);
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
        getTheme: () => this.theme,
      }
    );
    this.signerWorkerManager = new SignerWorkerManager(
      this.vrfWorkerManager,
      nearClient,
      this.userPreferencesManager,
      this.nonceManager,
      this.tatchiPasskeyConfigs.relayer.url,
      tatchiPasskeyConfigs.iframeWallet?.rpIdOverride,
      true,
      tatchiPasskeyConfigs.nearExplorerUrl,
      () => this.theme,
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

    // Best-effort: load persisted preferences unless we are in app-origin iframe mode,
    // where the wallet origin owns persistence and the app should avoid IndexedDB.
    const shouldAvoidAppOriginIndexedDB =
      !!tatchiPasskeyConfigs.iframeWallet?.walletOrigin && !__isWalletIframeHostMode();
    if (!shouldAvoidAppOriginIndexedDB) {
      void this.userPreferencesManager.initFromIndexedDB().catch(() => undefined);
    }
  }

  /**
   * Public pre-warm hook to initialize signer workers ahead of time.
   * Safe to call multiple times; errors are non-fatal.
   */
  prewarmSignerWorkers(): void {
    if (typeof window === 'undefined' || typeof (window as any).Worker === 'undefined') return;
    // Avoid noisy SecurityError in cross‑origin dev: only prewarm when same‑origin
    if (this.workerBaseOrigin && this.workerBaseOrigin !== window.location.origin) return;
    this.signerWorkerManager.preWarmWorkerPool().catch(() => { });
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

  /**
   * Resolve the effective rpId used for WebAuthn operations.
   * Delegates to TouchIdPrompt to centralize rpId selection logic.
   */
  getRpId(): string {
    return this.touchIdPrompt.getRpId();
  }

  /** Getter for NonceManager instance */
  getNonceManager(): NonceManager {
    return this.nonceManager;
  }

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
    const ttlMs = this.toNonNegativeInt(args.ttlMs)
      ?? this.tatchiPasskeyConfigs.signingSessionDefaults.ttlMs;
    const remainingUses = this.toNonNegativeInt(args.remainingUses)
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

  private async withSigningSession<T>(args: {
    sessionId?: string;
    prefix?: string;
    options?: SigningSessionOptions;
    handler: (sessionId: string) => Promise<T>;
  }): Promise<T> {
    if (typeof args.handler !== 'function') {
      throw new Error('withSigningSession requires a handler function');
    }
    const sessionId = args.sessionId || (args.prefix ? this.generateSessionId(args.prefix) : '');
    if (!sessionId) {
      throw new Error('withSigningSession requires a sessionId or prefix');
    }
    return await this.withSigningSessionInternal({ sessionId, options: args.options, handler: args.handler });
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
          wrapKeySalt: args.options.wrapKeySalt,
          credential: args.options.credential,
        });
      }
      return await args.handler(args.sessionId);
    } finally {
      this.signerWorkerManager.releaseSigningSession(args.sessionId);
    }
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
    confirmerText?: { title?: string; body?: string };
    confirmationConfigOverride?: Partial<ConfirmationConfig>;
  }): Promise<RegistrationCredentialConfirmationPayload> {
    return this.vrfWorkerManager.requestRegistrationCredentialConfirmation({
      nearAccountId: params.nearAccountId,
      deviceNumber: params.deviceNumber,
      confirmerText: params.confirmerText,
      confirmationConfigOverride: params.confirmationConfigOverride,
      contractId: this.tatchiPasskeyConfigs.contractId,
      nearRpcUrl: this.tatchiPasskeyConfigs.nearRpcUrl,
    });
  }

  setTheme(next: ThemeName): void {
    if (next !== 'light' && next !== 'dark') return;
    this.theme = next;
  }

  getTheme(): ThemeName {
    return this.theme;
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

    // Load VRF material for this device so the VRF worker can unlock the correct
    // VRF keypair in a fresh/offline worker instance.
    const userForDevice = await IndexedDBManager.clientDB.getUserByDevice(nearAccountId, deviceNumber).catch(() => null);
    const encryptedVrfKeypair = userForDevice?.encryptedVrfKeypair;

    // Gather encrypted key + wrapKeySalt and public key from IndexedDB for this device
    const keyMaterial = await IndexedDBManager.nearKeysDB.getLocalKeyMaterial(nearAccountId, deviceNumber);
    if (!keyMaterial) {
      console.error('WebAuthnManager: No encrypted key found for decrypt session', {
        nearAccountId: String(nearAccountId),
        deviceNumber,
      });
      throw new Error(`No key material found for account: ${nearAccountId}`);
    }
    const wrapKeySalt = keyMaterial.wrapKeySalt;
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
        encryptedVrfKeypair,
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

  async collectAuthenticationCredentialForVrfChallenge(args: {
    nearAccountId: AccountId | string;
    vrfChallenge: VRFChallenge;
    onBeforePrompt?: (info: {
      authenticators: ClientAuthenticatorData[];
      authenticatorsForPrompt: ClientAuthenticatorData[];
      vrfChallenge: VRFChallenge;
    }) => void;
    /**
     * When true, include PRF.second in the serialized credential.
     * Use only for explicit recovery/export flows (higher-friction paths).
     */
    includeSecondPrfOutput?: boolean;
  }): Promise<WebAuthnAuthenticationCredential> {
    return collectAuthenticationCredentialForVrfChallengeImpl({
      indexedDB: IndexedDBManager,
      touchIdPrompt: this.touchIdPrompt,
      nearAccountId: args.nearAccountId,
      vrfChallenge: args.vrfChallenge,
      includeSecondPrfOutput: args.includeSecondPrfOutput,
      onBeforePrompt: args.onBeforePrompt,
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
  }): Promise<{
    success: boolean;
    nearAccountId: string;
    publicKey: string;
    chacha20NonceB64u?: string;
    wrapKeySalt?: string;
    error?: string;
  }> {
    return this.withSigningSession({
      prefix: 'reg',
      options: { credential },
      handler: (sessionId) =>
        this.signerWorkerManager.deriveNearKeypairAndEncryptFromSerialized({
          credential,
          nearAccountId: toAccountId(nearAccountId),
          options,
          sessionId,
        }),
    });
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

      // Retrieve encrypted key data and wrapKeySalt from IndexedDB
      const keyMaterial = await IndexedDBManager.nearKeysDB.getLocalKeyMaterial(
        nearAccountId,
        deviceNumber
      );
      if (!keyMaterial) {
        throw new Error(`No key material found for account ${nearAccountId} device ${deviceNumber}`);
      }

      const wrapKeySalt = keyMaterial.wrapKeySalt;
      if (!wrapKeySalt) {
        throw new Error(`Missing wrapKeySalt for account ${nearAccountId} device ${deviceNumber}`);
      }

      // === STEP 1: Create MessagePort session for WrapKeySeed delivery ===
      const signerPort = await this.vrfWorkerManager.createSigningSessionChannel(sessionId);
      await this.signerWorkerManager.reserveSignerWorkerSession(sessionId, { signerPort });

      // === STEP 2: VRF worker re-derives WrapKeySeed and sends to signer ===
      // This extracts PRF.second from the credential and delivers both WrapKeySeed + PRF.second
      // to the signer worker via MessagePort
      await this.vrfWorkerManager.mintSessionKeysAndSendToSigner({
        sessionId,
        wrapKeySalt,
        credential, // VRF will extract PRF.second from this
      });

      // === STEP 4: Get transaction context for registration ===
      const transactionContext = await this.nonceManager.getNonceBlockHashAndHeight(this.nearClient);

      // === STEP 5: Determine deterministic VRF public key ===
      // Try: provided parameter → authenticator table → fallback to ephemeral VRF from challenge
      let vrfPublicKey = deterministicVrfPublicKey;
      // Fallback to ephemeral VRF public key from challenge if still not found
      const finalVrfPublicKey = vrfPublicKey || vrfChallenge.vrfPublicKey;

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
    credential: WebAuthnRegistrationCredential | WebAuthnAuthenticationCredential;
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
      const vrfResult = await this.vrfWorkerManager.deriveVrfKeypairFromPrf({
        credential,
        nearAccountId,
        vrfInputData,
        saveInMemory,
      });

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
    credential: WebAuthnAuthenticationCredential | WebAuthnRegistrationCredential;
  }): Promise<{ success: boolean; error?: string }> {
    try {
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
      this.signerWorkerManager.preWarmWorkerPool().catch(() => { });

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
    serverEncrypted: ServerEncryptedVrfKeypair,
    deviceNumber?: number
  ): Promise<void> {
    await IndexedDBManager.clientDB.updateUser(nearAccountId, {
      serverEncryptedVrfKeypair: {
        ciphertextVrfB64u: serverEncrypted.ciphertextVrfB64u,
        kek_s_b64u: serverEncrypted.kek_s_b64u,
        serverKeyId: serverEncrypted.serverKeyId,
        updatedAt: Date.now(),
      }
    }, deviceNumber);
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
   * Mint/refresh a VRF-owned warm signing session using an already-collected WebAuthn credential.
   *
   * This is used to avoid a second TouchID prompt during login flows when we already
   * performed an authentication ceremony (e.g., to unlock the VRF keypair).
   *
   * Notes:
   * - This method does not initiate a WebAuthn prompt.
   * - Contract verification is optional and only performed when `contractId` + `nearRpcUrl` are provided.
   */
	  async mintSigningSessionFromCredential(args: {
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

	    const credentialRawId = String(args.credential?.rawId || '').trim();
	    const authenticators = await this.getAuthenticatorsByUser(nearAccountId).catch(() => []);

	    // Fetch wrapKeySalt from vault so the derived WrapKeySeed can decrypt the stored NEAR keys.
	    let deviceNumber: number;
	    try {
	      deviceNumber = await getLastLoggedInDeviceNumber(nearAccountId, IndexedDBManager.clientDB);
	    } catch (err) {
	      // Fallback: if lastUser was not set (e.g., cross-origin flows), infer the deviceNumber
	      // from the credential rawId so we can still mint a session for the selected passkey.
	      if (credentialRawId) {
	        const matched = authenticators.find((a) => a.credentialId === credentialRawId);
	        const inferred =
	          matched && typeof matched.deviceNumber === 'number' && Number.isFinite(matched.deviceNumber)
	            ? matched.deviceNumber
	            : null;
	        if (inferred !== null) {
	          deviceNumber = inferred;
	          // Best-effort: align lastUser to the passkey that was actually used.
	          await this.setLastUser(nearAccountId, inferred).catch(() => undefined);
	        } else {
	          throw err;
	        }
	      } else {
	        throw err;
	      }
	    }

	    // If multiple passkeys exist, ensure the credential used for session minting matches
	    // the currently selected/last-user device. This avoids deriving a WrapKeySeed that
	    // cannot decrypt the expected vault entry.
	    if (credentialRawId && authenticators.length > 1) {
	      const { wrongPasskeyError } = await IndexedDBManager.clientDB.ensureCurrentPasskey(
	        nearAccountId,
	        authenticators,
	        credentialRawId,
	      );
	      if (wrongPasskeyError) {
	        throw new Error(wrongPasskeyError);
	      }
	    }

	    const keyMaterial = await IndexedDBManager.nearKeysDB.getLocalKeyMaterial(nearAccountId, deviceNumber);
	    if (!keyMaterial) {
	      throw new Error(`No key material found for account ${nearAccountId} device ${deviceNumber}`);
	    }
	    const wrapKeySalt = keyMaterial.wrapKeySalt;
    if (!wrapKeySalt) {
      throw new Error('Missing wrapKeySalt in vault; re-register to upgrade vault format.');
    }

    // Extract PRF.first_auth from the already-collected credential.
    const { ttlMs, remainingUses } = this.resolveSigningSessionPolicy(args);

    await this.vrfWorkerManager.mintSessionKeysAndSendToSigner({
      sessionId,
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
  async getWarmSigningSessionStatus(nearAccountId: AccountId): Promise<{
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
      await this.updateServerEncryptedVrfKeypair(nearAccountId, refreshed, userData?.deviceNumber);
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
      deviceNumber: userData.deviceNumber ?? 1,
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
    const deviceNumber = Number(authenticatorData.deviceNumber);
    const normalizedDeviceNumber = Number.isSafeInteger(deviceNumber) && deviceNumber >= 1 ? deviceNumber : 1;
    const authData = {
      ...authenticatorData,
      nearAccountId: toAccountId(authenticatorData.nearAccountId),
      deviceNumber: normalizedDeviceNumber, // Default to device 1 (1-indexed)
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
  }: {
    nearAccountId: AccountId;
    credential: WebAuthnRegistrationCredential;
    publicKey: string;
    encryptedVrfKeypair: EncryptedVRFKeypair;
    vrfPublicKey: string;
    serverEncryptedVrfKeypair: ServerEncryptedVrfKeypair | null;
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
        version: 2,
        serverEncryptedVrfKeypair: serverEncryptedVrfKeypair ? {
          ciphertextVrfB64u: serverEncryptedVrfKeypair?.ciphertextVrfB64u,
          kek_s_b64u: serverEncryptedVrfKeypair?.kek_s_b64u,
          serverKeyId: serverEncryptedVrfKeypair?.serverKeyId,
          updatedAt: Date.now(),
        } : undefined,
      });

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
    signerMode,
    confirmationConfigOverride,
    title,
    body,
    onEvent,
  }: {
    transactions: TransactionInputWasm[],
    rpcCall: RpcCallPayload,
    signerMode: SignerMode;
    // Accept partial override; merging happens in handlers layer
    confirmationConfigOverride?: Partial<ConfirmationConfig>,
    title?: string;
    body?: string;
    onEvent?: (update: onProgressEvents) => void,
  }): Promise<SignTransactionResult[]> {
    return this.withSigningSession({
      sessionId: this.getOrCreateActiveSigningSessionId(toAccountId(rpcCall.nearAccountId)),
      handler: (sessionId) =>
        this.signerWorkerManager.signTransactionsWithActions({
          transactions,
          rpcCall,
          signerMode,
          confirmationConfigOverride,
          title,
          body,
          onEvent,
          sessionId,
        }),
    });
  }

  /**
   * Sign AddKey(thresholdPublicKey) for `receiverId === nearAccountId` without running confirmTxFlow.
   *
   * This is a narrowly-scoped, internal-only helper for post-registration activation flows where
   * the caller already has a PRF-bearing credential in memory (e.g., immediately after registration)
   * and wants to avoid an extra TouchID/WebAuthn prompt.
   */
  async signAddKeyThresholdPublicKeyNoPrompt(args: {
    nearAccountId: AccountId | string;
    credential: WebAuthnRegistrationCredential | WebAuthnAuthenticationCredential;
    wrapKeySalt: string;
    transactionContext: TransactionContext;
    thresholdPublicKey: string;
    relayerVerifyingShareB64u: string;
    clientParticipantId?: number;
    relayerParticipantId?: number;
    deviceNumber?: number;
    onEvent?: (update: onProgressEvents) => void;
  }): Promise<SignTransactionResult> {
    const nearAccountId = toAccountId(args.nearAccountId);
    const wrapKeySalt = args.wrapKeySalt;
    if (!wrapKeySalt) throw new Error('Missing wrapKeySalt for AddKey(thresholdPublicKey) signing');
    if (!args.credential) throw new Error('Missing credential for AddKey(thresholdPublicKey) signing');
    if (!args.transactionContext) throw new Error('Missing transactionContext for no-prompt signing');
    const thresholdPublicKey = ensureEd25519Prefix(args.thresholdPublicKey);
    if (!thresholdPublicKey) throw new Error('Missing thresholdPublicKey for AddKey(thresholdPublicKey) signing');
    const relayerVerifyingShareB64u = args.relayerVerifyingShareB64u;
    if (!relayerVerifyingShareB64u) throw new Error('Missing relayerVerifyingShareB64u for AddKey(thresholdPublicKey) signing');

    const deviceNumber = Number(args.deviceNumber);
    const resolvedDeviceNumber = Number.isSafeInteger(deviceNumber) && deviceNumber >= 1
      ? deviceNumber
      : await getLastLoggedInDeviceNumber(nearAccountId, IndexedDBManager.clientDB).catch(() => 1);

    const localKeyMaterial = await IndexedDBManager.nearKeysDB.getLocalKeyMaterial(
      nearAccountId,
      resolvedDeviceNumber,
    );
    if (!localKeyMaterial) {
      throw new Error(`No local key material found for account ${nearAccountId} device ${resolvedDeviceNumber}`);
    }

    if (localKeyMaterial.wrapKeySalt !== wrapKeySalt) {
      throw new Error('wrapKeySalt mismatch for AddKey(thresholdPublicKey) signing');
    }

    return await this.withSigningSession({
      prefix: 'no-prompt-add-threshold-key',
      options: { credential: args.credential, wrapKeySalt },
      handler: async (sessionId) => {
        const response = await this.signerWorkerManager.getContext().sendMessage({
          sessionId,
          message: {
            type: INTERNAL_WORKER_REQUEST_TYPE_SIGN_ADD_KEY_THRESHOLD_PUBLIC_KEY_NO_PROMPT,
            payload: {
              createdAt: Date.now(),
              decryption: {
                encryptedPrivateKeyData: localKeyMaterial.encryptedSk,
                encryptedPrivateKeyChacha20NonceB64u: localKeyMaterial.chacha20NonceB64u,
              },
              transactionContext: args.transactionContext,
              nearAccountId,
              thresholdPublicKey,
              relayerVerifyingShareB64u,
              clientParticipantId: typeof args.clientParticipantId === 'number' ? args.clientParticipantId : undefined,
              relayerParticipantId: typeof args.relayerParticipantId === 'number' ? args.relayerParticipantId : undefined,
            },
          },
          onEvent: args.onEvent,
        });

        if (!isSignAddKeyThresholdPublicKeyNoPromptSuccess(response)) {
          throw new Error('AddKey(thresholdPublicKey) signing failed');
        }
        if (!response.payload.success) {
          throw new Error(response.payload.error || 'AddKey(thresholdPublicKey) signing failed');
        }

        const signedTransactions = response.payload.signedTransactions || [];
        if (signedTransactions.length !== 1) {
          throw new Error(`Expected 1 signed transaction but received ${signedTransactions.length}`);
        }

        const signedTx = signedTransactions[0];
        if (!signedTx || !(signedTx as any).transaction || !(signedTx as any).signature) {
          throw new Error('Incomplete signed transaction data received for AddKey(thresholdPublicKey)');
        }
        return {
          signedTransaction: new SignedTransaction({
            transaction: (signedTx as any).transaction,
            signature: (signedTx as any).signature,
            borsh_bytes: Array.from((signedTx as any).borshBytes || []),
          }),
          nearAccountId: String(nearAccountId),
          logs: response.payload.logs || [],
        };
      },
    });
  }

  async signDelegateAction({
    delegate,
    rpcCall,
    signerMode,
    confirmationConfigOverride,
    title,
    body,
    onEvent,
  }: {
    delegate: DelegateActionInput;
    rpcCall: RpcCallPayload;
    signerMode: SignerMode;
    // Accept partial override; merging happens in handlers layer
    confirmationConfigOverride?: Partial<ConfirmationConfig>;
    title?: string;
    body?: string;
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

    try {
      const activeSessionId = this.getOrCreateActiveSigningSessionId(nearAccountId);
      return await this.withSigningSession({
        sessionId: activeSessionId,
        handler: (sessionId) => {
          console.debug('[WebAuthnManager][delegate] session created', { sessionId });
          return this.signerWorkerManager.signDelegateAction({
            delegate,
            rpcCall: normalizedRpcCall,
            signerMode,
            confirmationConfigOverride,
            title,
            body,
            onEvent,
            sessionId,
          });
        }
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
    signerMode: SignerMode;
    title?: string;
    body?: string;
    confirmationConfigOverride?: Partial<ConfirmationConfig>;
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
      const contractId = this.tatchiPasskeyConfigs.contractId;
      const nearRpcUrl = (this.tatchiPasskeyConfigs.nearRpcUrl.split(',')[0] || this.tatchiPasskeyConfigs.nearRpcUrl);
      const result = await this.withSigningSession({
        sessionId: activeSessionId,
        handler: (sessionId) =>
          this.signerWorkerManager.signNep413Message({ ...payload, sessionId, contractId, nearRpcUrl }),
      });
      if (result.success) {
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
    options?: { variant?: 'drawer' | 'modal', theme?: 'dark' | 'light' }
  ): Promise<void> {
    const resolvedTheme = options?.theme ?? this.theme;
    await this.withSigningSession({
      prefix: 'export-session', handler: async (sessionId) => {
        // Phase 1: collect PRF via LocalOnly(DECRYPT_PRIVATE_KEY_WITH_PRF) inside VRF worker
        // and derive WrapKeySeed with the vault-provided wrapKeySalt.
        await this.confirmDecryptAndDeriveWrapKeySeed({ nearAccountId, sessionId });

        // Phase 2 + 3: decrypt inside signer worker using the reserved session,
        // then show the export viewer UI.
        return this.signerWorkerManager.exportNearKeypairUi({
          nearAccountId,
          variant: options?.variant,
          theme: resolvedTheme,
          sessionId,
        });
      }
    });
  }

  async exportNearKeypairWithUI(
    nearAccountId: AccountId,
    options?: {
      variant?: 'drawer' | 'modal';
      theme?: 'dark' | 'light'
    }
  ): Promise<{ accountId: string; publicKey: string; privateKey: string }> {
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
      publicKey: userData?.clientNearPublicKey ?? '',
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
    onEvent?: (update: RegistrationEventStep3) => void
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
    /**
     * Base64url-encoded AEAD nonce (ChaCha20-Poly1305) for the encrypted private key.
     */
    chacha20NonceB64u: string;
    accountIdHint?: string;
    wrapKeySalt: string;
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
      // Orchestrate a VRF-owned signing session with WrapKeySeed derivation, then ask
      // the signer to recover and re-encrypt the NEAR keypair.
      const result = await this.withSigningSession({
        prefix: 'recover',
        options: { credential: authenticationCredential },
        handler: (sessionId) =>
          this.signerWorkerManager.recoverKeypairFromPasskey({
            credential: authenticationCredential,
            accountIdHint,
            sessionId,
          }),
      });
      return result;

    } catch (error: any) {
      console.error('WebAuthnManager: Deterministic keypair derivation error:', error);
      throw new Error(`Deterministic keypair derivation failed: ${error.message}`);
    }
  }

  async getAuthenticationCredentialsSerializedDualPrf({
    nearAccountId,
    challenge,
    credentialIds,
  }: {
    nearAccountId: AccountId;
    challenge: VRFChallenge,
    credentialIds: string[];
  }): Promise<WebAuthnAuthenticationCredential> {
    // Same as getAuthenticationCredentialsSerialized but returns both PRF outputs (PRF.first + PRF.second).
    return this.touchIdPrompt.getAuthenticationCredentialsSerializedDualPrf({
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
  // Threshold Signing
  // ==============================

  /**
   * Derive the deterministic threshold client verifying share (2-of-2 ed25519) from WrapKeySeed.
   * This is safe to call during registration because it only requires the PRF-bearing credential
   * (no on-chain verification needed) and returns public material only.
   */
  async deriveThresholdEd25519ClientVerifyingShareFromCredential(args: {
    credential: WebAuthnRegistrationCredential | WebAuthnAuthenticationCredential;
    nearAccountId: AccountId | string;
    wrapKeySalt?: string;
  }): Promise<{
    success: boolean;
    nearAccountId: string;
    clientVerifyingShareB64u: string;
    wrapKeySalt: string;
    error?: string;
  }> {
    const nearAccountId = toAccountId(args.nearAccountId);
    try {
      return await this.withSigningSession({
        prefix: 'threshold-client-share',
        options: { credential: args.credential, wrapKeySalt: args.wrapKeySalt },
        handler: (sessionId) =>
          this.signerWorkerManager.deriveThresholdEd25519ClientVerifyingShare({
            sessionId,
            nearAccountId,
          }),
      });
    } catch (error: unknown) {
      const message = String((error as { message?: unknown })?.message ?? error);
      return {
        success: false,
        nearAccountId,
        clientVerifyingShareB64u: '',
        wrapKeySalt: '',
        error: message,
      };
    }
  }

  /**
   * Threshold key enrollment (post-registration):
   * prompts for a dual-PRF WebAuthn authentication to obtain PRF.first/second,
   * then runs the `/threshold-ed25519/keygen` enrollment flow.
   *
   * This is intended to be called only after the passkey is registered on-chain.
   */
  async enrollThresholdEd25519KeyPostRegistration(args: {
    nearAccountId: AccountId | string;
    deviceNumber?: number;
  }): Promise<{
    success: boolean;
    publicKey: string;
    relayerKeyId: string;
    wrapKeySalt: string;
    error?: string;
  }> {
    const nearAccountId = toAccountId(args.nearAccountId);

    try {
      const rpId = this.touchIdPrompt.getRpId();
      if (!rpId) throw new Error('Missing rpId for WebAuthn VRF challenge');

      // Generate a fresh VRF challenge for a dual-PRF authentication prompt (PRF.first + PRF.second).
      const block = await this.nearClient.viewBlock({ finality: 'final' } as any);
      const blockHeight = String((block as any)?.header?.height ?? '');
      const blockHash = String((block as any)?.header?.hash ?? '');
      if (!blockHeight || !blockHash) throw new Error('Failed to fetch NEAR block context for VRF challenge');

      const vrfChallenge = await this.vrfWorkerManager.generateVrfChallengeOnce({
        userId: nearAccountId,
        rpId,
        blockHeight,
        blockHash,
      });

      const authenticators = await this.getAuthenticatorsByUser(nearAccountId);
      if (!authenticators.length) {
        throw new Error(`No passkey authenticators found for account ${nearAccountId}`);
      }

      const authCredential = await this.collectAuthenticationCredentialForVrfChallenge({
        nearAccountId,
        vrfChallenge,
        includeSecondPrfOutput: true,
      });

      return await this.enrollThresholdEd25519Key({
        credential: authCredential,
        nearAccountId,
        deviceNumber: args.deviceNumber,
      });
    } catch (error: unknown) {
      const message = String((error as { message?: unknown })?.message ?? error);
      return { success: false, publicKey: '', relayerKeyId: '', wrapKeySalt: '', error: message };
    }
  }

  /**
   * Threshold key rotation (post-registration):
   * - keygen (new relayerKeyId + publicKey)
   * - AddKey(new threshold publicKey)
   * - DeleteKey(old threshold publicKey)
   *
   * Uses the local signer key for AddKey/DeleteKey, and requires the account to already
   * have a stored `threshold_ed25519_2p_v1` key material entry for the target device.
   */
  async rotateThresholdEd25519KeyPostRegistration(args: {
    nearAccountId: AccountId | string;
    deviceNumber?: number;
  }): Promise<{
    success: boolean;
    oldPublicKey: string;
    oldRelayerKeyId: string;
    publicKey: string;
    relayerKeyId: string;
    wrapKeySalt: string;
    deleteOldKeyAttempted: boolean;
    deleteOldKeySuccess: boolean;
    warning?: string;
    error?: string;
  }> {
    const nearAccountId = toAccountId(args.nearAccountId);

    let oldPublicKey = '';
    let oldRelayerKeyId = '';

    try {
      const deviceNumber = Number(args.deviceNumber);
      const resolvedDeviceNumber = Number.isSafeInteger(deviceNumber) && deviceNumber >= 1
        ? deviceNumber
        : await getLastLoggedInDeviceNumber(nearAccountId, IndexedDBManager.clientDB).catch(() => 1);

      const existing = await IndexedDBManager.nearKeysDB.getThresholdKeyMaterial(nearAccountId, resolvedDeviceNumber);
      if (!existing) {
        throw new Error(
          `No threshold key material found for account ${nearAccountId} device ${resolvedDeviceNumber}. Call enrollThresholdEd25519Key() first.`,
        );
      }
      oldPublicKey = existing.publicKey;
      oldRelayerKeyId = existing.relayerKeyId;

      const enrollment = await this.enrollThresholdEd25519KeyPostRegistration({
        nearAccountId,
        deviceNumber: resolvedDeviceNumber,
      });
      if (!enrollment.success) {
        throw new Error(enrollment.error || 'Threshold keygen/enrollment failed');
      }

      return await rotateThresholdEd25519KeyPostRegistrationHandler(
        {
          nearClient: this.nearClient,
          contractId: this.tatchiPasskeyConfigs.contractId,
          nearRpcUrl: this.tatchiPasskeyConfigs.nearRpcUrl,
          signTransactionsWithActions: (params) => this.signTransactionsWithActions(params),
        },
        {
          nearAccountId,
          deviceNumber: resolvedDeviceNumber,
          oldPublicKey,
          oldRelayerKeyId,
          newPublicKey: enrollment.publicKey,
          newRelayerKeyId: enrollment.relayerKeyId,
          wrapKeySalt: enrollment.wrapKeySalt,
        },
      );
    } catch (error: unknown) {
      const message = String((error as { message?: unknown })?.message ?? error);
      return {
        success: false,
        oldPublicKey,
        oldRelayerKeyId,
        publicKey: '',
        relayerKeyId: '',
        wrapKeySalt: '',
        deleteOldKeyAttempted: false,
        deleteOldKeySuccess: false,
        error: message,
      };
    }
  }

  /**
   * Threshold key enrollment (2-of-2): deterministically derive the client verifying share
   * from WrapKeySeed and register the corresponding relayer share via `/threshold-ed25519/keygen`.
   *
   * Stores a v3 vault entry of kind `threshold_ed25519_2p_v1` (breaking; no migration).
   */
  async enrollThresholdEd25519Key(args: {
    credential: WebAuthnRegistrationCredential | WebAuthnAuthenticationCredential;
    nearAccountId: AccountId | string;
    deviceNumber?: number;
  }): Promise<{
    success: boolean;
    publicKey: string;
    relayerKeyId: string;
    wrapKeySalt: string;
    error?: string;
  }> {
    const nearAccountId = toAccountId(args.nearAccountId);
    const relayerUrl = this.tatchiPasskeyConfigs.relayer.url;

    try {
      if (!relayerUrl) throw new Error('Missing relayer url (configs.relayer.url)');
      if (!args.credential) throw new Error('Missing credential');

      const deviceNumber = Number(args.deviceNumber);
      const resolvedDeviceNumber = Number.isSafeInteger(deviceNumber) && deviceNumber >= 1
        ? deviceNumber
        : await getLastLoggedInDeviceNumber(nearAccountId, IndexedDBManager.clientDB).catch(() => 1);

      const keygen = await this.withSigningSession({
        prefix: 'threshold-keygen',
        options: { credential: args.credential },
        handler: (sessionId) =>
          enrollThresholdEd25519KeyHandler(
            {
              nearClient: this.nearClient,
              vrfWorkerManager: this.vrfWorkerManager,
              signerWorkerManager: this.signerWorkerManager,
              touchIdPrompt: this.touchIdPrompt,
              relayerUrl,
            },
            { sessionId, nearAccountId },
          ),
      });

      if (!keygen.success) {
        throw new Error(keygen.error || 'Threshold keygen failed');
      }

      const publicKey = keygen.publicKey;
      const clientVerifyingShareB64u = keygen.clientVerifyingShareB64u;
      const relayerKeyId = keygen.relayerKeyId;
      const relayerVerifyingShareB64u = keygen.relayerVerifyingShareB64u;
      if (!clientVerifyingShareB64u) throw new Error('Threshold keygen returned empty clientVerifyingShareB64u');

      // Activate threshold enrollment on-chain by submitting AddKey(publicKey) signed with the local key.
      const localKeyMaterial = await IndexedDBManager.nearKeysDB.getLocalKeyMaterial(nearAccountId, resolvedDeviceNumber);
      if (!localKeyMaterial) {
        throw new Error(`No local key material found for account ${nearAccountId} device ${resolvedDeviceNumber}`);
      }

      // If the key is already present, skip AddKey and just persist local threshold metadata.
      const alreadyActive = await hasAccessKey(this.nearClient, nearAccountId, publicKey, { attempts: 1, delayMs: 0 });
      if (!alreadyActive) {
        this.nonceManager.initializeUser(nearAccountId, localKeyMaterial.publicKey);
        const txContext = await this.nonceManager.getNonceBlockHashAndHeight(this.nearClient, { force: true });

        const signed = await this.signAddKeyThresholdPublicKeyNoPrompt({
          nearAccountId,
          credential: args.credential,
          wrapKeySalt: localKeyMaterial.wrapKeySalt,
          transactionContext: txContext,
          thresholdPublicKey: publicKey,
          relayerVerifyingShareB64u,
          clientParticipantId: keygen.clientParticipantId,
          relayerParticipantId: keygen.relayerParticipantId,
          deviceNumber: resolvedDeviceNumber,
        });

        const signedTx = signed?.signedTransaction;
        if (!signedTx) throw new Error('Failed to sign AddKey(thresholdPublicKey) transaction');

        await this.nearClient.sendTransaction(signedTx, DEFAULT_WAIT_STATUS.thresholdAddKey);

        const activated = await hasAccessKey(this.nearClient, nearAccountId, publicKey);
        if (!activated) throw new Error('Threshold access key not found on-chain after AddKey');
      }

      const keyMaterial: ThresholdEd25519_2p_V1Material = {
        kind: 'threshold_ed25519_2p_v1',
        nearAccountId,
        deviceNumber: resolvedDeviceNumber,
        publicKey,
        wrapKeySalt: keygen.wrapKeySalt,
        relayerKeyId,
        clientShareDerivation: 'prf_first_v1',
        participants: buildThresholdEd25519Participants2pV1({
          clientParticipantId: keygen.clientParticipantId,
          relayerParticipantId: keygen.relayerParticipantId,
          relayerKeyId,
          relayerUrl,
          clientVerifyingShareB64u,
          relayerVerifyingShareB64u,
          clientShareDerivation: 'prf_first_v1',
        }),
        timestamp: Date.now(),
      };
      await IndexedDBManager.nearKeysDB.storeKeyMaterial(keyMaterial);

      return {
        success: true,
        publicKey,
        relayerKeyId,
        wrapKeySalt: keygen.wrapKeySalt,
      };
    } catch (error: unknown) {
      const message = String((error as { message?: unknown })?.message ?? error);
      return { success: false, publicKey: '', relayerKeyId: '', wrapKeySalt: '', error: message };
    }
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
