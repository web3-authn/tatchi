import { WebAuthnManager } from '../WebAuthnManager';
import {
  loginAndCreateSession,
  getLoginSession,
  getRecentLogins,
  logoutAndClearSession,
} from './login';
import {
  executeAction,
  signTransactionsWithActions,
  sendTransaction,
  signAndSendTransactions,
} from './actions';
import type { SyncAccountResult } from './syncAccount';
import { registerPasskey } from './registration';
import { registerPasskeyInternal } from './registration';
import {
  MinimalNearClient,
  type NearClient,
  type SignedTransaction,
  type AccessKeyList,
} from '../NearClient';
import type {
  ActionResult,
  DelegateRelayResult,
  GetRecentLoginsResult,
  LoginAndCreateSessionResult,
  LoginResult,
  LoginSession,
  LoginState,
  RegistrationResult,
  SignAndSendDelegateActionResult,
  SignDelegateActionResult,
  SignTransactionResult,
  TatchiConfigs,
  TatchiConfigsInput,
} from '../types/tatchi';
import type {
  SyncAccountHooksOptions,
  ActionHooksOptions,
  DelegateActionHooksOptions,
  DelegateRelayHooksOptions,
  LoginHooksOptions,
  RegistrationHooksOptions,
  SendTransactionHooksOptions,
  SignAndSendDelegateActionHooksOptions,
  SignAndSendTransactionHooksOptions,
  SignNEP413HooksOptions,
  SignTransactionHooksOptions,
} from '../types/sdkSentEvents';
import { ActionPhase, ActionStatus } from '../types/sdkSentEvents';
import { ConfirmationConfig, type SignerMode, type WasmSignedDelegate } from '../types/signer-worker';
import { DEFAULT_AUTHENTICATOR_OPTIONS } from '../types/authenticatorOptions';
import { toAccountId, type AccountId } from '../types/accountIds';
import type { DerivedAddressRecord, RecoveryEmailRecord } from '../IndexedDBManager';
import { configureIndexedDB } from '../IndexedDBManager';
import { chainsigAddressManager } from '../ChainsigAddressManager';
import { ActionType, type ActionArgs, type TransactionInput } from '../types/actions';
import type {
  DeviceLinkingQRData,
  LinkDeviceResult,
  ScanAndLinkDeviceOptionsDevice1,
  StartDevice2LinkingFlowArgs,
  StartDevice2LinkingFlowResults
} from '../types/linkDevice';
import type {
  SignNEP413MessageParams,
  SignNEP413MessageResult
} from './signNEP413';
import { SignedDelegate } from '../types/delegate';
import type { UserPreferencesManager } from '../WebAuthnManager/userPreferences';
import type { WalletIframeRouter } from '../WalletIframe/client/router';
import { __isWalletIframeHostMode } from '../WalletIframe/host-mode';
import { toError } from '../../utils/errors';
import { isOffline, openOfflineExport } from '../OfflineExport';
import type { DelegateActionInput } from '../types/delegate';
import { buildConfigsFromEnv } from '../defaultConfigs';
import type { EmailRecoveryFlowOptions } from '../types/emailRecovery';

///////////////////////////////////////
// PASSKEY MANAGER
///////////////////////////////////////

export interface PasskeyManagerContext {
  webAuthnManager: WebAuthnManager;
  nearClient: NearClient;
  configs: TatchiConfigs;
}

let warnedAboutSameOriginWallet = false;

/**
 * Main TatchiPasskey class that provides framework-agnostic passkey operations
 * with flexible event-based callbacks for custom UX implementation
 */
export class TatchiPasskey {
  private readonly webAuthnManager: WebAuthnManager;
  private readonly nearClient: NearClient;
  readonly configs: TatchiConfigs;
  private iframeRouter: WalletIframeRouter | null = null;
  // Deduplicate concurrent initWalletIframe() calls to avoid mounting multiple iframes.
  private walletIframeInitInFlight: Promise<void> | null = null;
	// Wallet-iframe mode: mirror wallet-host preferences into app-origin in-memory cache.
	private walletIframePrefsUnsubscribe: (() => void) | null = null;
	// Internal active Device2 flow when running locally (not exposed)
	private activeDeviceLinkFlow: import('./linkDevice').LinkDeviceFlow | null = null;
	private activeEmailRecoveryFlow: import('./emailRecovery').EmailRecoveryFlow | null = null;

  constructor(
    configs: TatchiConfigsInput,
    nearClient?: NearClient
  ) {
    this.configs = buildConfigsFromEnv(configs);
    // Configure IndexedDB naming before any local persistence is touched.
    // - Wallet iframe host keeps canonical DB names.
    // - App origin disables IndexedDB entirely when iframe mode is enabled.
    const mode = __isWalletIframeHostMode()
      ? 'wallet'
      : (this.configs.iframeWallet?.walletOrigin ? 'disabled' : 'legacy');
    configureIndexedDB({ mode });
    // Use provided client or create default one
    this.nearClient = nearClient || new MinimalNearClient(this.configs.nearRpcUrl);
    this.webAuthnManager = new WebAuthnManager(this.configs, this.nearClient);
    // Wallet-iframe mode: delegate signerMode persistence to the wallet host.
    // Non-iframe mode: ensure any previous writer is cleared (UserPreferences is a singleton).
    this.userPreferences.configureWalletIframeSignerModeWriter(
      this.shouldUseWalletIframe()
        ? async (next) => {
          const router = await this.requireWalletIframeRouter();
          await router.setSignerMode(next);
        }
        : null
    );
    // VRF worker initializes automatically in the constructor
  }

  /**
   * Direct access to user preferences manager for convenience
   * Example: tatchi.userPreferences.onThemeChange(cb)
   */
  get userPreferences(): UserPreferencesManager {
    return this.webAuthnManager.getUserPreferences();
  }

  /**
   * Initialize the hidden wallet service iframe client (optional) and warm critical resources.
   * Always warms local resources; initializes iframe when `walletOrigin` is provided.
   * Idempotent and safe to call multiple times.
   */
  async initWalletIframe(nearAccountId?: string): Promise<void> {
    const walletOriginConfigured = !!this.configs.iframeWallet?.walletOrigin;
    // Warm local critical resources (NonceManager, workers) regardless of iframe usage.
    // In iframe mode, avoid persisting user state (lastUserAccountId, preferences) on the app origin.
    const shouldAvoidLocalUserState = walletOriginConfigured && !__isWalletIframeHostMode();
    await this.webAuthnManager.warmCriticalResources(shouldAvoidLocalUserState ? undefined : nearAccountId);

    // Guardrail: when running inside the wallet service iframe host, never attempt to
    // initialize a nested wallet iframe client, even if configs accidentally include iframeWallet.
    // The host runs the real TatchiPasskey instance and must remain self-contained.
    if (__isWalletIframeHostMode()) {
      return;
    }

    const walletIframeConfig = this.configs.iframeWallet;
    const walletOrigin = walletIframeConfig?.walletOrigin;
    // If no wallet origin configured, we're done after local warm-up
    if (!walletOrigin) {
      // Reflect local login state so callers depending on init() get fresh status
      await this.getLoginSession(nearAccountId);
      return;
    }

    // Emit same-origin co-hosting warning only when actually initializing the iframe
    if (!warnedAboutSameOriginWallet) {
      try {
        const isWalletIframeHost = __isWalletIframeHostMode();
        const parsed = new URL(walletOrigin);
        if (typeof window !== 'undefined' && parsed.origin === window.location.origin && !isWalletIframeHost) {
          warnedAboutSameOriginWallet = true;
          console.warn('[TatchiPasskey] iframeWallet.walletOrigin matches the host origin. Consider moving the wallet to a dedicated origin for stronger isolation.');
        }
      } catch {
        // ignore invalid URL here; constructor downstream will surface an error
      }
    }

    // Initialize iframe router once (and prevent concurrent calls from mounting multiple iframes).
    if (!this.iframeRouter) {
      if (!this.walletIframeInitInFlight) {
        this.walletIframeInitInFlight = (async () => {
          const { WalletIframeRouter } = await import('../WalletIframe/client/router');
          this.iframeRouter = new WalletIframeRouter({
            walletOrigin,
            servicePath: walletIframeConfig?.walletServicePath || '/wallet-service',
            connectTimeoutMs: 20_000, // 20s
            requestTimeoutMs: 60_000, // 60s
            theme: this.configs.initialTheme,
            signerMode: this.configs.signerMode,
            nearRpcUrl: this.configs.nearRpcUrl,
            nearNetwork: this.configs.nearNetwork,
            contractId: this.configs.contractId,
            nearExplorerUrl: this.configs.nearExplorerUrl,
            // Ensure relay server config reaches the wallet host for atomic registration
            relayer: this.configs.relayer,
            vrfWorkerConfigs: this.configs.vrfWorkerConfigs,
            emailRecoveryContracts: this.configs.emailRecoveryContracts,
            rpIdOverride: walletIframeConfig?.rpIdOverride,
            // Allow apps/CI to control where embedded bundles are served from
            sdkBasePath: walletIframeConfig?.sdkBasePath,
          });

          await this.iframeRouter.init();
          // Opportunistically warm remote NonceManager
          try { await this.iframeRouter.prefetchBlockheight(); } catch { }
        })();
      }

      try {
        await this.walletIframeInitInFlight;
      } finally {
        this.walletIframeInitInFlight = null;
      }
    } else {
      await this.iframeRouter.init();
      // Opportunistically warm remote NonceManager
      try { await this.iframeRouter.prefetchBlockheight(); } catch { }
    }

    // Wallet-iframe mode: keep app-origin UI prefs in sync with the wallet host.
    if (this.iframeRouter) {
      this.ensureWalletIframePreferencesMirror(this.iframeRouter);
      // Best-effort pull snapshot to cover missed events / older hosts.
      const cfg = await this.iframeRouter.getConfirmationConfig().catch(() => null);
      if (cfg) {
        this.userPreferences.applyWalletHostConfirmationConfig({
          nearAccountId: nearAccountId ? toAccountId(nearAccountId) : null,
          confirmationConfig: cfg,
        });
      }
      const signerMode = await this.iframeRouter.getSignerMode?.({ timeoutMs: 1000 }).catch(() => null);
      if (signerMode) {
        this.userPreferences.applyWalletHostSignerMode?.({
          nearAccountId: nearAccountId ? toAccountId(nearAccountId) : null,
          signerMode,
        });
      }
    }

    await this.getLoginSession(nearAccountId);
  }

  /** Get the wallet iframe client if initialized. */
  getWalletIframeClient(): WalletIframeRouter | null {
    return this.iframeRouter;
  }

  private ensureWalletIframePreferencesMirror(router: WalletIframeRouter): void {
    if (this.walletIframePrefsUnsubscribe) return;
    const unsubscribe = router.onPreferencesChanged?.(payload => {
      const id = payload?.nearAccountId;
      const nearAccountId = id ? toAccountId(id) : null;
      this.userPreferences.applyWalletHostConfirmationConfig({
        nearAccountId,
        confirmationConfig: payload?.confirmationConfig,
      });
      if (payload?.signerMode) {
        this.userPreferences.applyWalletHostSignerMode?.({
          nearAccountId,
          signerMode: payload.signerMode,
        });
      }
    });
    this.walletIframePrefsUnsubscribe = unsubscribe ?? null;
  }

  /**
   * True when the SDK is running on the app origin with a wallet iframe configured.
   * In this mode, sensitive persistence must live in the wallet-iframe origin.
   */
  private shouldUseWalletIframe(): boolean {
    return !!this.configs.iframeWallet?.walletOrigin && !__isWalletIframeHostMode();
  }

  private async requireWalletIframeRouter(nearAccountId?: string): Promise<WalletIframeRouter> {
    if (!this.shouldUseWalletIframe()) {
      throw new Error('[TatchiPasskey] Wallet iframe is not configured.');
    }
    if (!this.iframeRouter) {
      await this.initWalletIframe(nearAccountId);
    }
    if (!this.iframeRouter) {
      throw new Error('[TatchiPasskey] Wallet iframe is configured but unavailable.');
    }
    return this.iframeRouter;
  }

  getContext(): PasskeyManagerContext {
    return {
      webAuthnManager: this.webAuthnManager,
      nearClient: this.nearClient,
      configs: this.configs
    }
  }

  getNearClient(): NearClient {
    return this.nearClient;
  }

  /**
   * Warm critical resources: delegates to WebAuthnManager and ensures iframe handshake when configured.
   */
  async warmCriticalResources(nearAccountId?: string): Promise<void> {
    // Maintain backward compatibility: delegate to consolidated init
    await this.initWalletIframe(nearAccountId);
  }

  /**
   * Pre-warm resources on a best-effort basis without changing visible state.
   * - When iframe=true, initializes the wallet iframe client (and warms local resources).
   * - When workers=true, warms local critical resources (nonce, IndexedDB, workers) without touching iframe.
   * - When both are false/omitted, does nothing.
   */
  async prewarm(opts?: { iframe?: boolean; workers?: boolean; nearAccountId?: string }): Promise<void> {
    const iframe = !!opts?.iframe;
    const workers = !!opts?.workers;
    const nearAccountId = opts?.nearAccountId;

    const tasks: Promise<unknown>[] = [];

    if (iframe) {
      // initWalletIframe also calls WebAuthnManager.warmCriticalResources internally
      tasks.push(this.initWalletIframe(nearAccountId));
    } else if (workers) {
      // Warm local-only resources without touching the iframe.
      // In iframe mode, avoid persisting user state (lastUserAccountId, preferences) on the app origin.
      const shouldAvoidLocalUserState = !!this.configs.iframeWallet?.walletOrigin && !__isWalletIframeHostMode();
      tasks.push(this.webAuthnManager.warmCriticalResources(shouldAvoidLocalUserState ? undefined : nearAccountId));
    }

    if (tasks.length === 0) return;
    try {
      await Promise.all(tasks);
    } catch {
      // Best-effort: swallow errors so prewarm never breaks app flows
    }
  }

  /**
   * View all access keys for a given account
   * @param accountId - NEAR account ID to view access keys for
   * @returns Promise resolving to access key list
   */
  async viewAccessKeyList(accountId: string): Promise<AccessKeyList> {
    if (this.iframeRouter) {
      return await this.iframeRouter.viewAccessKeyList(accountId);
    }
    return this.nearClient.viewAccessKeyList(accountId);
  }

  ///////////////////////////////////////
  // === Registration and Login ===
  ///////////////////////////////////////

  /**
   * Register a new passkey for the given NEAR account ID
   * Uses AccountId for on-chain operations and PRF salt derivation
   */
  async registerPasskey(
    nearAccountId: string,
    options: RegistrationHooksOptions = {}
  ): Promise<RegistrationResult> {
    // In wallet-iframe mode, always run inside the wallet origin (no app-origin fallback).
    if (this.shouldUseWalletIframe()) {
      try {
        const router = await this.requireWalletIframeRouter(nearAccountId);
        const confirmationConfig = options?.confirmationConfig;
        const res = await router.registerPasskey({
          nearAccountId,
          confirmationConfig,
          options: {
            onEvent: options?.onEvent,
            ...(options?.signerMode ? { signerMode: options.signerMode } : {}),
            ...(options?.confirmerText ? { confirmerText: options.confirmerText } : {})
          }
        });
        // Opportunistically warm resources (non-blocking)
        void (async () => { try { await this.warmCriticalResources(nearAccountId); } catch { } })();
        await options?.afterCall?.(true, res);
        return res;
      } catch (error: unknown) {
        const e = toError(error);
        await options?.onError?.(e);
        await options?.afterCall?.(false);
        throw e;
      }
    }
    return registerPasskey(
      this.getContext(),
      toAccountId(nearAccountId),
      options,
      this.configs.authenticatorOptions || DEFAULT_AUTHENTICATOR_OPTIONS,
    );
  }

  /**
   * Internal variant that accepts a one-time confirmationConfig override.
   * Used by wallet-iframe host to force modal/autoProceed behavior for ArrowButtonLit.
   */
  async registerPasskeyInternal(
    nearAccountId: string,
    options: RegistrationHooksOptions = {},
    confirmationConfigOverride?: ConfirmationConfig
  ): Promise<RegistrationResult> {
    // In wallet-iframe mode, always run inside the wallet origin (no app-origin fallback).
    if (this.shouldUseWalletIframe()) {
      try {
        const router = await this.requireWalletIframeRouter(nearAccountId);
        const confirmationConfig = confirmationConfigOverride ?? options?.confirmationConfig;
        const res = await router.registerPasskey({
          nearAccountId,
          confirmationConfig,
          options: {
            onEvent: options?.onEvent,
            ...(options?.signerMode ? { signerMode: options.signerMode } : {}),
            ...(options?.confirmerText ? { confirmerText: options.confirmerText } : {})
          }
        });
        void (async () => { try { await this.warmCriticalResources(nearAccountId); } catch { } })();
        await options?.afterCall?.(true, res);
        return res;
      } catch (error: unknown) {
        const e = toError(error);
        await options?.onError?.(e);
        await options?.afterCall?.(false);
        throw e;
      }
    }
    // App-wallet path: call core internal with override
    return registerPasskeyInternal(
      this.getContext(),
      toAccountId(nearAccountId),
      options,
      this.configs.authenticatorOptions || DEFAULT_AUTHENTICATOR_OPTIONS,
      confirmationConfigOverride,
    );
  }

  /**
   * Post-registration threshold enrollment.
   * Runs `/threshold-ed25519/keygen` authorization and stores `threshold_ed25519_2p_v1`
   * key material locally. Intended to be called after the passkey is registered on-chain.
   */
  async enrollThresholdEd25519Key(
    nearAccountId: string,
    options?: {
      deviceNumber?: number;
      relayerUrl?: string;
    }
  ): Promise<{
    success: boolean;
    publicKey: string;
    relayerKeyId: string;
    wrapKeySalt: string;
    error?: string;
  }> {
    // In wallet-iframe mode, always run inside the wallet origin (no app-origin fallback).
    if (this.shouldUseWalletIframe()) {
      const router = await this.requireWalletIframeRouter(nearAccountId);
      return await router.enrollThresholdEd25519Key({
        nearAccountId,
        options: options || {},
      });
    }

    return await this.webAuthnManager.enrollThresholdEd25519KeyPostRegistration({
      nearAccountId: toAccountId(nearAccountId),
      deviceNumber: options?.deviceNumber,
    });
  }

  /**
   * Threshold key rotation helper:
   * keygen → AddKey(new) → DeleteKey(old).
   */
  async rotateThresholdEd25519Key(
    nearAccountId: string,
    options?: {
      deviceNumber?: number;
    }
  ): Promise<{
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
    // In wallet-iframe mode, always run inside the wallet origin (no app-origin fallback).
    if (this.shouldUseWalletIframe()) {
      const router = await this.requireWalletIframeRouter(nearAccountId);
      return await router.rotateThresholdEd25519Key({
        nearAccountId,
        options: options || {},
      });
    }

    return await this.webAuthnManager.rotateThresholdEd25519KeyPostRegistration({
      nearAccountId: toAccountId(nearAccountId),
      deviceNumber: options?.deviceNumber,
    });
  }

  /**
   * Login and ensure a warm signing session exists.
   * - Unlocks VRF keypair (Shamir auto-unlock when possible; else WebAuthn prompt)
   * - Mints a warm signing session (policy from configs, override via options.signingSession)
   * - Optional: mints a server session (JWT/cookie) via options.session
   */
  async loginAndCreateSession(
    nearAccountId: string,
    options?: LoginHooksOptions
  ): Promise<LoginAndCreateSessionResult> {
    // In wallet-iframe mode, always run inside the wallet origin (no app-origin fallback).
    if (this.shouldUseWalletIframe()) {
      try {
        const router = await this.requireWalletIframeRouter(nearAccountId);
        // Forward serializable options to wallet host, including session config
        const res = await router.loginAndCreateSession({
          nearAccountId,
          options: {
            onEvent: options?.onEvent,
            deviceNumber: options?.deviceNumber,
            // Pass through session so the wallet host calls relay to mint JWT/cookie sessions
            session: options?.session,
            signingSession: options?.signingSession,
          }
        });
        // Best-effort warm-up after successful login (non-blocking)
        void (async () => { try { await this.warmCriticalResources(nearAccountId); } catch { } })();
        await options?.afterCall?.(true, res);
        return res;
      } catch (error: unknown) {
        const e = toError(error);
        await options?.onError?.(e);
        await options?.afterCall?.(false);
        throw e;
      }
    }
    // Initialize current user before login
    await this.webAuthnManager.initializeCurrentUser(toAccountId(nearAccountId), this.nearClient);
    const res = await loginAndCreateSession(this.getContext(), toAccountId(nearAccountId), options);
    // Best-effort warm-up after successful login (non-blocking)
    try { void this.warmCriticalResources(nearAccountId); } catch { }
    return res;
  }

  /**
   * Logout: clears VRF keypair and all in-worker session state.
   */
  async logoutAndClearSession(): Promise<void> {
    await logoutAndClearSession(this.getContext());
    // Also clear wallet-origin VRF session if service iframe is active
    if (this.iframeRouter) {
      try { await this.iframeRouter.clearVrfSession?.(); } catch { }
    }
  }

  /**
   * Read login state + warm signing session status (no prompts).
   */
  async getLoginSession(nearAccountId?: string): Promise<LoginSession> {
    if (this.shouldUseWalletIframe()) {
      const router = await this.requireWalletIframeRouter(nearAccountId);
      const session = await router.getLoginSession(nearAccountId);
      try { await router.prefetchBlockheight(); } catch { }
      return session;
    }
    return await getLoginSession(this.getContext(), nearAccountId ? toAccountId(nearAccountId) : undefined);
  }

  /**
   * Get check if accountId has a passkey from IndexedDB
   */
  async hasPasskeyCredential(nearAccountId: AccountId): Promise<boolean> {
    if (this.shouldUseWalletIframe()) {
      const router = await this.requireWalletIframeRouter();
      return await router.hasPasskeyCredential(nearAccountId);
    }
    const baseAccountId = toAccountId(nearAccountId);
    return await this.webAuthnManager.hasPasskeyCredential(baseAccountId);
  }

  ///////////////////////////////////////
  // === User Settings ===
  ///////////////////////////////////////

  /**
   * Set confirmation behavior setting for the current user
   */
  setConfirmBehavior(behavior: 'requireClick' | 'autoProceed'): void {
    if (this.shouldUseWalletIframe()) {
      // Fire and forget; persistence handled in wallet host. Avoid unhandled rejections.
      void (async () => {
        try {
          const router = await this.requireWalletIframeRouter();
          await router.setConfirmBehavior(behavior);
        } catch { }
      })();
      return;
    }
    this.webAuthnManager.getUserPreferences().setConfirmBehavior(behavior);
  }

  /**
   * Set the unified confirmation configuration
   */
  setConfirmationConfig(config: ConfirmationConfig): void {
    if (this.shouldUseWalletIframe()) {
      // Fire and forget; avoid unhandled rejections in consumers
      void (async () => {
        try {
          const router = await this.requireWalletIframeRouter();
          await router.setConfirmationConfig(config);
        } catch { }
      })();
      return;
    }
    this.webAuthnManager.getUserPreferences().setConfirmationConfig(config);
  }

  setUserTheme(theme: 'dark' | 'light'): void {
    if (this.shouldUseWalletIframe()) {
      void (async () => {
        try {
          const router = await this.requireWalletIframeRouter();
          await router.setTheme(theme);
        } catch { }
      })();
      return;
    }
    this.webAuthnManager.getUserPreferences().setUserTheme(theme);
  }

  setSignerMode(signerMode: SignerMode | SignerMode['mode']): void {
    this.webAuthnManager.getUserPreferences().setSignerMode(signerMode);
  }

  /**
   * Get the current confirmation configuration
   */
  getConfirmationConfig(): ConfirmationConfig {
    // Prefer wallet host value when available
    // Note: synchronous signature; returns last-known local value if iframe reply is async
    // Callers needing fresh remote value should use TatchiPasskeyIframe directly.
    return this.webAuthnManager.getUserPreferences().getConfirmationConfig();
  }

  getSignerMode(): SignerMode {
    return this.webAuthnManager.getUserPreferences().getSignerMode();
  }

  /**
   * Prefetch latest block height/hash (and nonce if context missing) to reduce
   * perceived latency when the user initiates a signing flow.
   */
  async prefetchBlockheight(): Promise<void> {
    if (this.iframeRouter) {
      await this.iframeRouter.prefetchBlockheight();
      return;
    }
    try { await this.webAuthnManager.getNonceManager().prefetchBlockheight(this.nearClient); } catch { }
  }

  async getRecentLogins(): Promise<GetRecentLoginsResult> {
    // In iframe mode, do not fall back to app-origin IndexedDB.
    if (this.shouldUseWalletIframe()) {
      try {
        const router = await this.requireWalletIframeRouter();
        return await router.getRecentLogins();
      } catch {
        return { accountIds: [], lastUsedAccount: null };
      }
    }

    return getRecentLogins(this.getContext());
  }

  ///////////////////////////////////////
  // === Transactions ===
  ///////////////////////////////////////

  /**
   * Execute a NEAR blockchain action using passkey-derived credentials
   * Supports all NEAR action types: Transfer, FunctionCall, AddKey, etc.
   *
   * @param nearAccountId - NEAR account ID to execute action with
   * @param actionArgs - Action to execute (single action or array for batched transactions)
   * @param options - Action options for event handling
   * - onEvent: EventCallback<ActionSSEEvent> - Optional event callback
   * - onError: (error: Error) => void - Optional error callback
   * - afterCall: AfterCall - Optional after call hooks
   * - waitUntil: TxExecutionStatus - Optional waitUntil status
   * @returns Promise resolving to action result
   *
   * @example
   * ```typescript
   * // Basic transfer
   * const result = await tatchi.executeAction('alice.near', {
   *   type: ActionType.Transfer,
   *   receiverId: 'bob.near',
   *   amount: '1000000000000000000000000' // 1 NEAR
   * });
   *
   * // Function call with gas and deposit (already available in ActionArgs)
   * const result = await tatchi.executeAction('alice.near', {
   *   type: ActionType.FunctionCall,
   *   receiverId: 'contract.near',
   *   methodName: 'set_value',
   *   args: { value: 42 },
   *   gas: '50000000000000', // 50 TGas
   *   deposit: '100000000000000000000000' // 0.1 NEAR
   * });
   *
   * // Batched transaction
   * const result = await tatchi.executeAction('alice.near', [
   *   {
   *     type: ActionType.Transfer,
   *     receiverId: 'bob.near',
   *     amount: '1000000000000000000000000'
   *   },
   *   {
   *     type: ActionType.FunctionCall,
   *     receiverId: 'contract.near',
   *     methodName: 'log_transfer',
   *     args: { recipient: 'bob.near' }
   *   }
   * ], {
   *   onEvent: (event) => console.log('Action progress:', event)
   * });
   * ```
   */
  async executeAction(args: {
    nearAccountId: string,
    receiverId: string,
    actionArgs: ActionArgs | ActionArgs[],
    options: ActionHooksOptions
  }): Promise<ActionResult> {
    // In wallet-iframe mode, always run inside the wallet origin (no app-origin fallback).
    if (this.shouldUseWalletIframe()) {
      try {
        const router = await this.requireWalletIframeRouter(args.nearAccountId);
        const res = await router.executeAction({
          nearAccountId: args.nearAccountId,
          receiverId: args.receiverId,
          actionArgs: args.actionArgs,
          options: args.options
        });
        await args.options?.afterCall?.(true, res);
        return res;
      } catch (error: unknown) {
        const e = toError(error);
        await args.options?.onError?.(e);
        await args.options?.afterCall?.(false);
        throw e;
      }
    }
    // same-origin mode
    return executeAction({
      context: this.getContext(),
      nearAccountId: toAccountId(args.nearAccountId),
      receiverId: toAccountId(args.receiverId),
      actionArgs: args.actionArgs,
      options: args.options
    });
  }

  /**
   * Sign and send multiple transactions with actions
   * This method signs transactions with actions and sends them to the network
   *
   * @param nearAccountId - NEAR account ID to sign and send transactions with
   * @param transactionInputs - Transaction inputs to sign and send
   * @param options - Sign and send transaction options
   * - onEvent: EventCallback<ActionSSEEvent> - Optional event callback
   * - onError: (error: Error) => void - Optional error callback
   * - afterCall: AfterCall - Optional after call hooks
   * - waitUntil: TxExecutionStatus - Optional waitUntil status
   * - executeSequentially: boolean - Wait for each transaction to finish before sending the next (default: true)
   * @returns Promise resolving to action results
   *
   * @example
   * ```typescript
   * // Sign and send multiple transactions in a batch
   * const results = await tatchi.signAndSendTransactions('alice.near', {
   *   transactions: [
   *     {
   *       receiverId: 'bob.near',
   *       actions: [{
   *         action_type: ActionType.Transfer,
   *         deposit: '1000000000000000000000000'
   *       }],
   *     },
   *     {
   *       receiverId: 'contract.near',
   *       actions: [{
   *         action_type: ActionType.FunctionCall,
   *         method_name: 'log_transfer',
   *         args: JSON.stringify({ recipient: 'bob.near' }),
   *         gas: '30000000000000',
   *         deposit: '0'
   *       }],
   *     }
   *   ],
   *   options: {
   *     onEvent: (event) => console.log('Signing and sending progress:', event)
   *     executeSequentially: true
   *   }
   * });
   * ```
   */
  async signAndSendTransactions({
    nearAccountId,
    transactions,
    options
  }: {
    nearAccountId: string,
    transactions: TransactionInput[],
    options: SignAndSendTransactionHooksOptions,
  }): Promise<ActionResult[]> {

    // In wallet-iframe mode, always run inside the wallet origin (no app-origin fallback).
    if (this.shouldUseWalletIframe()) {
      try {
        const router = await this.requireWalletIframeRouter(nearAccountId);
        const routerOptions: SignAndSendTransactionHooksOptions = {
          ...options,
          executionWait: options?.executionWait ?? { mode: 'sequential', waitUntil: options?.waitUntil },
        };
        const res = await router.signAndSendTransactions({
          nearAccountId,
          transactions: transactions.map(t => ({ receiverId: t.receiverId, actions: t.actions })),
          options: routerOptions
        });
        // Emit completion
        const txIds = (res || []).map(r => r?.transactionId).filter(Boolean).join(', ');
        options?.onEvent?.({ step: 8, phase: ActionPhase.STEP_8_ACTION_COMPLETE, status: ActionStatus.SUCCESS, message: `All transactions sent: ${txIds}` });
        await options?.afterCall?.(true, res);
        return res;
      } catch (error: unknown) {
        const e = toError(error);
        await options?.onError?.(e);
        await options?.afterCall?.(false);
        throw e;
      }
    }

    return signAndSendTransactions({
      context: this.getContext(),
      nearAccountId: toAccountId(nearAccountId),
      transactionInputs: transactions,
      options
    }).then(txResults => {
      const txIds = txResults.map(txResult => txResult.transactionId).join(', ');
      options?.onEvent?.({
        step: 8,
        phase: ActionPhase.STEP_8_ACTION_COMPLETE,
        status: ActionStatus.SUCCESS,
        message: `All transactions sent: ${txIds}`
      });
      return txResults;
    });
  }

  /**
   * Convenience helper to sign and send a single transaction with actions.
   * Internally delegates to signAndSendTransactions() and returns the first result.
   */
  async signAndSendTransaction({
    nearAccountId,
    receiverId,
    actions,
    options
  }: {
    nearAccountId: string;
    receiverId: string;
    actions: ActionArgs[];
    options: SignAndSendTransactionHooksOptions;
  }): Promise<ActionResult> {
    const results = await this.signAndSendTransactions({
      nearAccountId,
      transactions: [
        {
          receiverId,
          actions
        }
      ],
      options
    });
    return results[0] as ActionResult;
  }

  /**
   * Batch sign transactions (with actions), allows you to sign transactions
   * to different receivers with a single TouchID prompt.
   * This method does not broadcast transactions, use sendTransaction() to do that.
   *
   * This method fetches the current nonce and increments it for the next N transactions,
   * so you do not need to manually increment the nonce for each transaction.
   *
   * @param nearAccountId - NEAR account ID to sign transactions with
   * @param params - Transaction signing parameters
   * - @param params.transactions: Array of transaction objects with nearAccountId, receiverId, actions, and nonce
   * - @param params.onEvent: Optional progress event callback
   * @returns Promise resolving to signed transaction results
   *
   * @example
   * ```typescript
   * // Sign a single transaction
   * const signedTransactions = await tatchi.signTransactionsWithActions('alice.near', {
   *   transactions: [{
   *     receiverId: 'bob.near',
   *     actions: [{
   *       action_type: ActionType.Transfer,
   *       deposit: '1000000000000000000000000'
   *     }],
   *   }],
   *   onEvent: (event) => console.log('Signing progress:', event)
   * });
   *
   * // Sign multiple transactions in a batch
   * const signedTransactions = await tatchi.signTransactionsWithActions('alice.near', {
   *   transactions: [
   *     {
   *       receiverId: 'bob.near',
   *       actions: [{
   *         action_type: ActionType.Transfer,
   *         deposit: '1000000000000000000000000'
   *       }],
   *     },
   *     {
   *       receiverId: 'contract.near',
   *       actions: [{
   *         action_type: ActionType.FunctionCall,
   *         method_name: 'log_transfer',
   *         args: JSON.stringify({ recipient: 'bob.near' }),
   *         gas: '30000000000000',
   *         deposit: '0'
   *       }],
   *     }
   *   ]
   * });
   * ```
   */
  async signTransactionsWithActions({ nearAccountId, transactions, options }: {
    nearAccountId: string,
    transactions: TransactionInput[],
    options: SignTransactionHooksOptions
  }): Promise<SignTransactionResult[]> {
    // route signing via wallet origin
    if (this.shouldUseWalletIframe()) {
      try {
        const router = await this.requireWalletIframeRouter(nearAccountId);
        const txs = transactions.map((t) => ({ receiverId: t.receiverId, actions: t.actions }));
        const result = await router.signTransactionsWithActions({
          nearAccountId,
          transactions: txs,
          options: {
            signerMode: options.signerMode,
            onEvent: options.onEvent,
            confirmationConfig: options.confirmationConfig,
            confirmerText: options.confirmerText,
          },
        });
        const arr: SignTransactionResult[] = Array.isArray(result) ? result : [];
        await options?.afterCall?.(true, arr);
        return arr;
      } catch (error: unknown) {
        const e = toError(error);
        await options?.onError?.(e);
        await options?.afterCall?.(false);
        throw e;
      }
    }

    return signTransactionsWithActions({
      context: this.getContext(),
      nearAccountId: toAccountId(nearAccountId),
      transactionInputs: transactions,
      options
    });
  }

  /**
   * Send a signed transaction to the NEAR network
   * This method broadcasts a previously signed transaction and waits for execution
   *
   * @param signedTransaction - The signed transaction to broadcast
   * @param waitUntil - The execution status to wait for (defaults to FINAL)
   * @returns Promise resolving to the transaction execution outcome
   *
   * @example
   * ```typescript
   * // Sign a transaction first
   * const signedTransactions = await tatchi.signTransactionsWithActions('alice.near', {
   *   transactions: [{
   *     receiverId: 'bob.near',
   *     actions: [{
   *       action_type: ActionType.Transfer,
   *       deposit: '1000000000000000000000000'
   *     }],
   *   }]
   * });
   *
   * // Then broadcast it
   * const result = await tatchi.sendTransaction(
   *   signedTransactions[0].signedTransaction,
   *   TxExecutionStatus.FINAL
   * );
   * ```
   */
  async sendTransaction({ signedTransaction, options }: {
    signedTransaction: SignedTransaction,
    options?: SendTransactionHooksOptions
  }): Promise<ActionResult> {
    // In wallet-iframe mode, always run inside the wallet origin (no app-origin fallback).
    if (this.shouldUseWalletIframe()) {
      try {
        const router = await this.requireWalletIframeRouter();
        const res = await router.sendTransaction({
          signedTransaction,
          options: {
            onEvent: options?.onEvent,
            ...(options && ('waitUntil' in options)
              ? { waitUntil: options.waitUntil }
              : {})
          }
        });
        await options?.afterCall?.(true, res);
        options?.onEvent?.({ step: 8, phase: ActionPhase.STEP_8_ACTION_COMPLETE, status: ActionStatus.SUCCESS, message: `Transaction ${res?.transactionId} broadcasted` });
        return res;
      } catch (error: unknown) {
        const e = toError(error);
        await options?.onError?.(e);
        await options?.afterCall?.(false);
        throw e;
      }
    }

    return sendTransaction({ context: this.getContext(), signedTransaction, options })
      .then(txResult => {
        options?.onEvent?.({ step: 8, phase: ActionPhase.STEP_8_ACTION_COMPLETE, status: ActionStatus.SUCCESS, message: `Transaction ${txResult.transactionId} broadcasted` });
        return txResult;
      });
  }

  ///////////////////////////////////////
  // === DELEGATE ACTION SIGNING (NEP-461) ===
  ///////////////////////////////////////

  async signDelegateAction({
    nearAccountId,
    delegate,
    options,
  }: {
    nearAccountId: string;
    delegate: DelegateActionInput;
    options: DelegateActionHooksOptions;
  }): Promise<SignDelegateActionResult> {
    // In wallet-iframe mode, always run inside the wallet origin (no app-origin fallback).
    if (this.shouldUseWalletIframe()) {
      try {
        const router = await this.requireWalletIframeRouter(nearAccountId);
        const result = await router.signDelegateAction({
          nearAccountId,
          delegate,
          options: {
            signerMode: options.signerMode,
            onEvent: options.onEvent,
            confirmationConfig: options.confirmationConfig,
            confirmerText: options.confirmerText,
          }
        }) as SignDelegateActionResult;
        await options?.afterCall?.(true, result);
        return result;
      } catch (error: unknown) {
        const e = toError(error);
        await options?.onError?.(e);
        await options?.afterCall?.(false);
        throw e;
      }
    }

    const { signDelegateAction } = await import('./delegateAction');
    return signDelegateAction({
      context: this.getContext(),
      nearAccountId: toAccountId(nearAccountId),
      delegate,
      options,
    });
  }

  /**
   * Convenience helper to POST a signed delegate to a relayer.
   * Does not enforce any relayer semantics; simply forwards the payload.
   */
  async sendDelegateActionViaRelayer(args: {
    relayerUrl: string;
    signedDelegate: SignedDelegate | WasmSignedDelegate;
    hash: string;
    signal?: AbortSignal;
    options?: DelegateRelayHooksOptions;
  }): Promise<DelegateRelayResult> {
    const base = args.relayerUrl.replace(/\/+$/, '');
    const route = (this.configs.relayer?.delegateActionRoute || '/signed-delegate').replace(/^\/?/, '/');
    const endpoint = `${base}${route}`;
    const { sendDelegateActionViaRelayer } = await import('./relay');
    return sendDelegateActionViaRelayer({
      url: endpoint,
      payload: {
        hash: args.hash,
        signedDelegate: args.signedDelegate,
      },
      signal: args.signal,
      options: args.options,
    });
  }

  /**
   * Convenience helper to sign a delegate action and immediately forward it to the relayer.
   * Emits delegate signing events and relay broadcasting events through the provided options.
   */
  async signAndSendDelegateAction(args: {
    nearAccountId: string;
    delegate: DelegateActionInput;
    relayerUrl: string;
    signal?: AbortSignal;
    options: SignAndSendDelegateActionHooksOptions;
  }): Promise<SignAndSendDelegateActionResult> {
    const { nearAccountId, delegate, relayerUrl, signal, options } = args;

    const signOptions: DelegateActionHooksOptions | undefined = options
      ? {
        signerMode: options.signerMode,
        onEvent: options.onEvent,
        onError: options.onError,
        waitUntil: options.waitUntil,
        confirmationConfig: options.confirmationConfig,
        confirmerText: options.confirmerText,
        // suppress afterCall so we can call afterCall() once at the end of the lifecycle.
        afterCall: () => { },
      }
      : undefined;

    let signResult: SignDelegateActionResult;
    try {
      signResult = await this.signDelegateAction({
        nearAccountId,
        delegate,
        options: signOptions as DelegateActionHooksOptions,
      });
    } catch (error) {
      await options?.afterCall?.(false);
      throw error;
    }

    const relayOptions: DelegateRelayHooksOptions | undefined = options
      ? {
        onEvent: options.onEvent,
        onError: options.onError,
      }
      : undefined;

    let relayResult: DelegateRelayResult;
    try {
      relayResult = await this.sendDelegateActionViaRelayer({
        relayerUrl,
        hash: signResult.hash,
        signedDelegate: signResult.signedDelegate,
        signal,
        options: relayOptions,
      });
    } catch (error) {
      await options?.afterCall?.(false);
      throw error;
    }

    const combined: SignAndSendDelegateActionResult = {
      signResult,
      relayResult,
    };

    const success = relayResult.ok !== false;
    if (success) {
      await options?.afterCall?.(true, combined);
    } else {
      await options?.afterCall?.(false);
    }
    return combined;
  }

  ///////////////////////////////////////
  // === NEP-413 MESSAGE SIGNING ===
  ///////////////////////////////////////

  /**
   * Sign a NEP-413 message using the user's passkey-derived private key:
   * - Creates a payload with message, recipient, nonce, and state
   * - Serializes using Borsh
   * - Adds NEP-413 prefix
   * - Hashes with SHA-256
   * - Signs with Ed25519
   * - Returns base64-encoded signature
   *
   * @param nearAccountId - NEAR account ID to sign with
   * @param params - NEP-413 signing parameters
   * - message: string - The message to sign
   * - recipient: string - The recipient of the message
   * - state: string - Optional state parameter
   * @param options - Action options for event handling
   * - onEvent: EventCallback<ActionSSEEvent> - Optional event callback
   * - onError: (error: Error) => void - Optional error callback
   * - afterCall: AfterCall - Optional after call hooks
   * - waitUntil: TxExecutionStatus - Optional waitUntil status
   * @returns Promise resolving to signing result
   *
   * @example
   * ```typescript
   * const result = await tatchi.signNEP413Message('alice.near', {
   *   message: 'Hello World',
   *   recipient: 'app.example.com',
   *   state: 'optional-state'
   * });
   * ```
   */
  async signNEP413Message(args: {
    nearAccountId: string,
    params: SignNEP413MessageParams,
    options: SignNEP413HooksOptions
  }): Promise<SignNEP413MessageResult> {
    // In wallet-iframe mode, always run inside the wallet origin (no app-origin fallback).
    if (this.shouldUseWalletIframe()) {
      try {
        const router = await this.requireWalletIframeRouter(args.nearAccountId);
        const result = await router.signNep413Message({
          nearAccountId: args.nearAccountId,
          message: args.params.message,
          recipient: args.params.recipient,
          state: args.params.state,
          options: {
            signerMode: args.options.signerMode,
            onEvent: args.options.onEvent,
            confirmerText: args.options.confirmerText,
            confirmationConfig: args.options.confirmationConfig,
          }
        });
        await args.options?.afterCall?.(true, result);
        // Expect wallet to return the same shape as WebAuthnManager.signNEP413Message
        return result as SignNEP413MessageResult;
      } catch (error: unknown) {
        const e = toError(error);
        await args.options?.onError?.(e);
        await args.options?.afterCall?.(false);
        throw e;
      }
    }

    const { signNEP413Message } = await import('./signNEP413');
    const res = await signNEP413Message({
      context: this.getContext(),
      nearAccountId: toAccountId(args.nearAccountId),
      params: args.params,
      options: args.options
    });
    if (res?.success) {
      await args.options?.afterCall?.(true, res);
    } else {
      await args.options?.afterCall?.(false);
    }
    return res;
  }

  ///////////////////////////////////////
  // === KEY MANAGEMENT ===
  ///////////////////////////////////////

  /**
   * Canonical entrypoint to show the Export Private Key UI (secure drawer/modal)
   * without returning the key to the caller. All dApps should use this wrapper;
   * the underlying WebAuthnManager.exportNearKeypairWithUI() is fully worker-
   * driven and only ever reveals the private key inside trusted UI surfaces.
   */
  async exportNearKeypairWithUI(
    nearAccountId: string,
    options?: { variant?: 'drawer' | 'modal'; theme?: 'dark' | 'light' }
  ): Promise<void> {
    if (isOffline()) {
      // If offline, open the offline-export route
      await openOfflineExport({
        accountId: nearAccountId,
        routerOpen: this.iframeRouter?.openOfflineExport?.bind(this.iframeRouter),
        walletOrigin: this.configs?.iframeWallet?.walletOrigin,
        target: '_blank',
      });
    } else {
      // Prefer wallet iframe when ready
      if (this.iframeRouter?.isReady?.()) {
        await this.iframeRouter.exportNearKeypairWithUI(nearAccountId, options);
        return;
      }
      // Online but router not ready: prefer offline-export route via router (or new tab)
      // Only do this when we have a wallet origin configured or router API is available
      const routerOpen = this.iframeRouter?.openOfflineExport?.bind(this.iframeRouter);
      const walletOrigin = this.configs?.iframeWallet?.walletOrigin;
      if (routerOpen || walletOrigin) {
        await openOfflineExport({ accountId: nearAccountId, routerOpen, walletOrigin, target: '_blank' });
        return;
      }
      // Final fallback: local worker-driven UI
      await this.webAuthnManager.exportNearKeypairWithUI(toAccountId(nearAccountId), options);
    }
  }

  ///////////////////////////////////////
  // === DERIVED ADDRESSES (public helpers) ===
  ///////////////////////////////////////

  /** Store a derived address for an account + contract + path (multi-chain capable via path encoding). */
  async setDerivedAddress(
    nearAccountId: string,
    args: { contractId: string; path: string; address: string }
  ): Promise<void> {
    if (this.shouldUseWalletIframe()) {
      let router: WalletIframeRouter;
      try {
        router = await this.requireWalletIframeRouter();
      } catch {
        throw new Error('[TatchiPasskey] Wallet iframe is configured but unavailable; refusing to write derived addresses to app origin.');
      }
      return await router.setDerivedAddress({ nearAccountId, args });
    }
    await chainsigAddressManager.setDerivedAddress(toAccountId(nearAccountId), args);
  }

  /** Retrieve the full derived address record (or null if not found). */
  async getDerivedAddressRecord(
    nearAccountId: string,
    args: { contractId: string; path: string }
  ): Promise<DerivedAddressRecord | null> {
    if (this.shouldUseWalletIframe()) {
      let router: WalletIframeRouter;
      try {
        router = await this.requireWalletIframeRouter();
      } catch {
        throw new Error('[TatchiPasskey] Wallet iframe is configured but unavailable; refusing to read derived addresses from app origin.');
      }
      return await router.getDerivedAddressRecord({ nearAccountId, args });
    }
    return await chainsigAddressManager.getDerivedAddressRecord(toAccountId(nearAccountId), args);
  }

  /** Retrieve only the derived address string for convenience. */
  async getDerivedAddress(
    nearAccountId: string,
    args: { contractId: string; path: string }
  ): Promise<string | null> {
    if (this.shouldUseWalletIframe()) {
      let router: WalletIframeRouter;
      try {
        router = await this.requireWalletIframeRouter();
      } catch {
        throw new Error('[TatchiPasskey] Wallet iframe is configured but unavailable; refusing to read derived addresses from app origin.');
      }
      return await router.getDerivedAddress({ nearAccountId, args });
    }
    return await chainsigAddressManager.getDerivedAddress(toAccountId(nearAccountId), args);
  }

  ///////////////////////////////////////
  // === Email Recovery (public helpers) ===
  ///////////////////////////////////////

  /**
   * Get recovery emails for an account.
   * - Fetches on-chain recovery email hashes via get_recovery_emails.
   * - Resolves hashes to canonical emails using local IndexedDB mapping when available.
   * - Returns an array of { hashHex, email }, where `email` is a human-readable label
   *   (canonical email when known on this device, otherwise the hash hex).
   */
  async getRecoveryEmails(nearAccountId: string): Promise<Array<{ hashHex: string; email: string }>> {
    if (this.shouldUseWalletIframe()) {
      let router: WalletIframeRouter;
      try {
        router = await this.requireWalletIframeRouter(nearAccountId);
      } catch {
        throw new Error('[TatchiPasskey] Wallet iframe is configured but unavailable; refusing to read recovery email mappings from app origin.');
      }
      return await router.getRecoveryEmails(nearAccountId);
    }
    const accountId = toAccountId(nearAccountId);

    // Dynamic import for rpc/email utils
    const { getRecoveryEmailHashesContractCall } = await import('../rpcCalls');
    const { getLocalRecoveryEmails, bytesToHex } = await import('../EmailRecovery');

    // Fetch on-chain recovery email hashes
    const rawHashes = await getRecoveryEmailHashesContractCall(this.nearClient, accountId);
    if (!rawHashes.length) {
      return [];
    }

    // Load local mapping from IndexedDB (best-effort)
    let local: RecoveryEmailRecord[] = [];
    try {
      local = await getLocalRecoveryEmails(accountId);
    } catch (error) {
      console.warn('[TatchiPasskey] Failed to load local recovery emails', error);
    }

    const emailByHashHex = new Map<string, string>();
    for (const rec of local) {
      if (!rec?.hashHex || !rec?.email) continue;
      if (!emailByHashHex.has(rec.hashHex)) {
        emailByHashHex.set(rec.hashHex, rec.email);
      }
    }

    return rawHashes.map(hashBytes => {
      const hashHex = bytesToHex(hashBytes);
      const email = emailByHashHex.get(hashHex) || hashHex;
      return { hashHex, email };
    });
  }

  /**
   * Set recovery emails for an account:
   * - Canonicalizes and hashes emails client-side.
   * - Persists mapping in IndexedDB.
   * - Deploys/attaches the EmailRecoverer contract when needed.
   * - Calls set_recovery_emails(...) on the per-account contract.
   */
  async setRecoveryEmails(
    nearAccountId: string,
    recoveryEmails: string[],
    options: ActionHooksOptions
  ): Promise<ActionResult> {
    if (this.shouldUseWalletIframe()) {
      try {
        const router = await this.requireWalletIframeRouter(nearAccountId);
        const res = await router.setRecoveryEmails({ nearAccountId, recoveryEmails, options });
        await options?.afterCall?.(true, res);
        return res;
      } catch (error: unknown) {
        const e = toError(error);
        await options?.onError?.(e);
        await options?.afterCall?.(false);
        throw e;
      }
    }
    const accountId = toAccountId(nearAccountId);

    // Dynamic import
    const { prepareRecoveryEmails } = await import('../EmailRecovery');
    const { buildSetRecoveryEmailsActions } = await import('../rpcCalls');

    // Canonicalize, hash, and persist mapping locally (best-effort)
    const { hashes: recoveryEmailHashes } = await prepareRecoveryEmails(accountId, recoveryEmails);

    const actions: ActionArgs[] = await buildSetRecoveryEmailsActions(
      this.nearClient,
      accountId,
      recoveryEmailHashes,
      this.configs.emailRecoveryContracts
    );

    // Delegate to executeAction so iframe vs same-origin routing is respected.
    return this.executeAction({
      nearAccountId,
      receiverId: nearAccountId,
      actionArgs: actions,
      options,
    });
  }

	  ///////////////////////////////////////
	  // === Account Sync Flow ===
	  ///////////////////////////////////////

	  /**
	   * Sync account state from on-chain data using an existing passkey.
	   */
	  async syncAccount(args: {
	    accountId?: string;
	    options?: SyncAccountHooksOptions
	  }): Promise<SyncAccountResult> {

    const accountIdInput = args?.accountId || '';
	    const options = args?.options;
	    if (this.shouldUseWalletIframe()) {
	      try {
	        const router = await this.requireWalletIframeRouter();
	        const res = await router.syncAccount({
	          accountId: accountIdInput,
	          onEvent: options?.onEvent
	        });
	        await options?.afterCall?.(true, res);
	        return res;
      } catch (error: unknown) {
        const e = toError(error);
        await options?.onError?.(e);
        await options?.afterCall?.(false);
        throw e;
      }
	    }

	    // Local orchestration using SyncAccountFlow for a single-call UX
	    try {
	      const { SyncAccountFlow } = await import('./syncAccount');
	      const flow = new SyncAccountFlow(this.getContext(), options);
	      // Phase 1: Discover available accounts
	      const discovered = await flow.discover(accountIdInput || '');
	      if (!Array.isArray(discovered) || discovered.length === 0) {
	        const err = new Error('No syncable accounts found');
	        await options?.onError?.(err);
	        await options?.afterCall?.(false);
	        return { success: false, accountId: accountIdInput || '', publicKey: '', message: err.message, error: err.message };
	      }
      // Phase 2: User selects account in UI
      // Select the first account-scope; OS chooser selects the actual credential
      const selected = discovered[0];

	      // Phase 3: Execute sync with secure credential lookup
	      const result = await flow.sync({
	        credentialId: selected.credentialId,
	        accountId: selected.accountId
	      });

      await options?.afterCall?.(true, result);
      return result;

    } catch (error: unknown) {
      const e = toError(error);
      await options?.onError?.(e);
      await options?.afterCall?.(false);
      throw e;
    }
  }

  ///////////////////////////////////////
  // === Email Recovery Flow ===
  ///////////////////////////////////////


  private async ensureEmailRecoveryFlow(options?: EmailRecoveryFlowOptions) {
    const { EmailRecoveryFlow } = await import('./emailRecovery');
    if (!this.activeEmailRecoveryFlow) {
      this.activeEmailRecoveryFlow = new EmailRecoveryFlow(this.getContext(), options);
    } else if (options) {
      this.activeEmailRecoveryFlow.setOptions(options);
    }
    return this.activeEmailRecoveryFlow;
  }

  async startEmailRecovery(args: {
    accountId: string;
    options?: EmailRecoveryFlowOptions;
  }): Promise<{ mailtoUrl: string; nearPublicKey: string }> {
    const { accountId, options } = args;
    if (this.shouldUseWalletIframe()) {
      try {
        const router = await this.requireWalletIframeRouter();
        const confirmerText = options?.confirmerText;
        const confirmationConfig = options?.confirmationConfig;
        const safeOptions = {
          ...(confirmerText ? { confirmerText } : {}),
          ...(confirmationConfig ? { confirmationConfig } : {}),
        };
        const res = await router.startEmailRecovery({
          accountId,
          onEvent: options?.onEvent,
          options: Object.keys(safeOptions).length > 0 ? safeOptions : undefined,
        });
        await options?.afterCall?.(true, undefined);
        return res;
      } catch (error: unknown) {
        const e = toError(error);
        await options?.onError?.(e);
        await options?.afterCall?.(false);
        throw e;
      }
    }
    const flow = await this.ensureEmailRecoveryFlow(options);
    return await flow.start({ accountId });
  }

  async finalizeEmailRecovery(args: {
    accountId: string;
    nearPublicKey?: string;
    options?: EmailRecoveryFlowOptions;
  }): Promise<void> {
    const { accountId, nearPublicKey, options } = args;
    if (this.shouldUseWalletIframe()) {
      try {
        const router = await this.requireWalletIframeRouter();
        await router.finalizeEmailRecovery({
          accountId,
          nearPublicKey,
          onEvent: options?.onEvent,
        });
        await options?.afterCall?.(true, undefined);
        return;
      } catch (error: unknown) {
        const e = toError(error);
        await options?.onError?.(e);
        await options?.afterCall?.(false);
        throw e;
      }
    }
    const flow = await this.ensureEmailRecoveryFlow(options);
    await flow.finalize({ accountId, nearPublicKey });
  }

  /**
   * Best-effort cancellation for an in-flight email recovery flow.
   * Intended for UI "user cancelled sending email" / retry UX.
   */
  async cancelEmailRecovery(args?: { accountId?: string; nearPublicKey?: string }): Promise<void> {
    const { accountId, nearPublicKey } = args || {};
    // In wallet-iframe mode, instruct the wallet host to stop the active flow.
    if (this.shouldUseWalletIframe()) {
      try {
        const router = await this.requireWalletIframeRouter();
        await router.stopEmailRecovery({ accountId, nearPublicKey });
      } catch { }
      return;
    }

    try {
      await this.activeEmailRecoveryFlow?.cancelAndReset({ accountId, nearPublicKey });
    } catch { }
    this.activeEmailRecoveryFlow = null;
  }

  ///////////////////////////////////////
  // === Link Device ===
  ///////////////////////////////////////

  /**
   * Device2: Start device linking flow
   * Returns QR payload and data URL to render; emits onEvent during the flow.
   * Runs inside iframe when available for better isolation.
   */
  async startDevice2LinkingFlow(args: StartDevice2LinkingFlowArgs): Promise<StartDevice2LinkingFlowResults> {
    // In wallet-iframe mode, device linking must run inside the wallet origin.
    if (this.shouldUseWalletIframe()) {
      const router = await this.requireWalletIframeRouter();
      const options = args?.options;
      return await router.startDevice2LinkingFlow({
        ui: args?.ui,
        cameraId: args?.cameraId,
        options,
      });
    }
    // Local fallback: keep internal flow reference for cancellation
    this.activeDeviceLinkFlow?.cancel();
    const { LinkDeviceFlow } = await import('./linkDevice');
    const flow = new LinkDeviceFlow(this.getContext(), {
      cameraId: args?.cameraId,
      options: args?.options,
    });
    this.activeDeviceLinkFlow = flow;
    const { qrData, qrCodeDataURL } = await flow.generateQR();
    return { qrData, qrCodeDataURL };
  }

  /**
   * Device2: Stops device linking flow inside the iframe host.
   */
  async stopDevice2LinkingFlow(): Promise<void> {
    if (this.shouldUseWalletIframe()) {
      try {
        const router = await this.requireWalletIframeRouter();
        await router.stopDevice2LinkingFlow();
      } catch { }
      return;
    }
    if (this.iframeRouter) {
      await this.iframeRouter.stopDevice2LinkingFlow();
      return;
    }
    this.activeDeviceLinkFlow?.cancel();
    this.activeDeviceLinkFlow = null;
  }

  /**
   * Device1: Link device using pre-scanned QR data.
   * You can use a QR scanning component of your choice,
   * or use the built-in <QRCodeScanner /> component.
   *
   * @param qrData The QR data obtained from scanning Device2's QR code
   * @param options Device linking options including funding amount and event callbacks
   * @returns Promise that resolves to the linking result
   */
  async linkDeviceWithScannedQRData(
    qrData: DeviceLinkingQRData,
    options: ScanAndLinkDeviceOptionsDevice1
  ): Promise<LinkDeviceResult> {
    // In wallet-iframe mode, device linking must run inside the wallet origin.
    if (this.shouldUseWalletIframe()) {
      const router = await this.requireWalletIframeRouter();
      const res = await router.linkDeviceWithScannedQRData({
        qrData,
        fundingAmount: options.fundingAmount,
        options: {
          onEvent: options.onEvent,
          confirmationConfig: options.confirmationConfig,
          confirmerText: options.confirmerText,
        }
      });
      return res as LinkDeviceResult;
    }
    const { linkDeviceWithScannedQRData } = await import('./scanDevice');
    return linkDeviceWithScannedQRData(this.getContext(), qrData, options);
  }

  /**
   * Delete a device key from an account
   */
  async deleteDeviceKey(
    accountId: string,
    publicKeyToDelete: string,
    options: ActionHooksOptions
  ): Promise<ActionResult> {
    // Validate that we're not deleting the last key
    const keysView = this.iframeRouter
      ? await this.iframeRouter.viewAccessKeyList(accountId)
      : await this.nearClient.viewAccessKeyList(toAccountId(accountId));
    if (keysView.keys.length <= 1) {
      throw new Error('Cannot delete the last access key from an account');
    }

    // Find the key to delete
    const keyToDelete = keysView.keys.find((k: { public_key: string }) => k.public_key === publicKeyToDelete);
    if (!keyToDelete) {
      throw new Error(`Access key ${publicKeyToDelete} not found on account ${accountId}`);
    }

    // Use the executeAction method with DeleteKey action
    return this.executeAction({
      nearAccountId: accountId,
      receiverId: accountId,
      actionArgs: {
        type: ActionType.DeleteKey,
        publicKey: publicKeyToDelete
      },
      options: options
    });
  }

}

// Re-export types for convenience
export type {
  TatchiConfigs,
  TatchiConfigsInput,
  RegistrationResult,
  LoginAndCreateSessionResult,
  LoginResult,
  LoginSession,
  SigningSessionStatus,
  ActionResult,
} from '../types/tatchi';
export type {
  ActionHooksOptions,
  AfterCall,
  EventCallback,
  LoginHooksOptions,
  LoginSSEvent,
  RegistrationHooksOptions,
  RegistrationSSEEvent,
  SignNEP413HooksOptions,
} from '../types/sdkSentEvents';
// Context alias (optional convenience)
export type TatchiPasskeyContext = PasskeyManagerContext;

export type {
  DeviceLinkingQRData,
  DeviceLinkingSession,
  LinkDeviceResult
} from '../types/linkDevice';

// Re-export device linking error types and classes
export {
  DeviceLinkingPhase,
  DeviceLinkingError,
  DeviceLinkingErrorCode
} from '../types/linkDevice';

// Re-export account sync types and classes
export type {
  SyncAccountResult,
  SyncAccountLookupResult,
  PasskeyOption,
  PasskeyOptionWithoutCredential,
  PasskeySelection
} from './syncAccount';

export {
  SyncAccountFlow
} from './syncAccount';

// Re-export NEP-413 types
export type {
  SignNEP413MessageParams,
  SignNEP413MessageResult
} from './signNEP413';

// Re-export QR scanning flow
export {
  ScanQRCodeFlow,
  type ScanQRCodeFlowOptions,
  type ScanQRCodeFlowEvents,
  ScanQRCodeFlowState
} from '../../utils/qrScanner';
