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
  ThemeName,
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
import { ConfirmationConfig, mergeSignerMode, type ConfirmationBehavior, type SignerMode, type WasmSignedDelegate } from '../types/signer-worker';
import { DEFAULT_AUTHENTICATOR_OPTIONS } from '../types/authenticatorOptions';
import { toAccountId, type AccountId } from '../types/accountIds';
import type { DerivedAddressRecord, RecoveryEmailRecord } from '../IndexedDBManager';
import { configureIndexedDB, IndexedDBManager } from '../IndexedDBManager';
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
import { coerceThemeName } from '../../utils/theme';
import { isOffline, openOfflineExport } from '../OfflineExport';
import type { DelegateActionInput } from '../types/delegate';
import { buildConfigsFromEnv } from '../defaultConfigs';
import type { EmailRecoveryFlowOptions } from '../types/emailRecovery';
import type { WebAuthnRegistrationCredential } from '../types';
import type { VRFChallenge } from '../types/vrf-worker';
import type {
  ExtensionMigrationOptions,
  ExtensionMigrationResult,
  ExtensionMigrationState,
} from '../types/extensionMigration';
import { ExtensionMigrationStatus, ExtensionMigrationStep } from '../types/extensionMigration';
import { resolveSigningWalletTarget } from './signerRouting';

///////////////////////////////////////
// PASSKEY MANAGER
///////////////////////////////////////

export interface PasskeyManagerContext {
  webAuthnManager: WebAuthnManager;
  nearClient: NearClient;
  configs: TatchiConfigs;
  theme: ThemeName;
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
  theme: ThemeName;
  private iframeRouter: WalletIframeRouter | null = null;
  private webIframeRouter: WalletIframeRouter | null = null;
  private extensionIframeRouter: WalletIframeRouter | null = null;
  // Deduplicate concurrent initWalletIframe() calls to avoid mounting multiple iframes.
  private walletIframeInitInFlight: Promise<void> | null = null;
  private walletIframeInitInFlightByKind: { web: Promise<void> | null; extension: Promise<void> | null } = {
    web: null,
    extension: null,
  };
  // Wallet-iframe mode: mirror wallet-host preferences into app-origin in-memory cache.
  private walletIframePrefsUnsubscribe: (() => void) | null = null;
  // Internal active Device2 flow when running locally (not exposed)
  private activeDeviceLinkFlow: import('./linkDevice').LinkDeviceFlow | null = null;
  private activeEmailRecoveryFlow: import('./emailRecovery').EmailRecoveryFlow | null = null;
  private activeExtensionMigrationFlow: import('./extensionMigration').ExtensionMigrationFlow | null = null;
  private pendingExtensionMigrationDeviceRegistration: Map<string, {
    credential: WebAuthnRegistrationCredential;
    vrfChallenge: VRFChallenge;
    deviceNumber: number;
    deterministicVrfPublicKey: string;
    expiresAt: number;
  }> = new Map();

  constructor(
    configs: TatchiConfigsInput,
    nearClient?: NearClient
  ) {
    this.configs = buildConfigsFromEnv(configs);
    // Configure IndexedDB naming before any local persistence is touched.
    // - Wallet iframe host keeps canonical DB names.
    // - App origin disables IndexedDB entirely when iframe mode is enabled.
    const hasAnyWalletOrigin = !!(
      this.configs.iframeWallet?.walletOrigin || this.configs.iframeWallet?.extensionWalletOrigin
    );
    const mode = __isWalletIframeHostMode()
      ? 'wallet'
      : (hasAnyWalletOrigin ? 'disabled' : 'legacy');
    configureIndexedDB({ mode });
    // Use provided client or create default one
    this.nearClient = nearClient || new MinimalNearClient(this.configs.nearRpcUrl);
    this.webAuthnManager = new WebAuthnManager(this.configs, this.nearClient);

    this.theme = 'dark';

    // Wallet-iframe mode: delegate signerMode persistence to the wallet host.
    // Non-iframe mode: ensure any previous writer is cleared (UserPreferences is a singleton).
    this.userPreferences.configureWalletIframeSignerModeWriter(
      this.shouldUseWalletIframe()
        ? async (next) => {
          const nearAccountId = String(this.userPreferences.getCurrentUserAccountId?.() || '').trim() || undefined;
          // Mirror immediately so app UI stays responsive even when host persistence is async.
          this.userPreferences.applyWalletHostSignerMode({
            nearAccountId: nearAccountId ? toAccountId(nearAccountId) : null,
            signerMode: next,
          });
          try {
            const webRouter = await this.requireWalletIframeRouterForUnauthFlow(nearAccountId);
            await webRouter.setSignerMode(next, nearAccountId ? { nearAccountId } : undefined);
          } catch { }
          try {
            if (this.configs.iframeWallet?.extensionWalletOrigin) {
              const extRouter = await this.requireWalletIframeRouterByKind('extension', nearAccountId);
              await extRouter.setSignerMode(next, nearAccountId ? { nearAccountId } : undefined);
            }
          } catch { }
        }
        : null
    );
    // VRF worker initializes automatically in the constructor
  }

  /**
   * Direct access to user preferences manager for convenience
   * For theming, prefer `tatchi.theme` + `tatchi.setTheme(...)` instead.
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
    const walletTarget = this.resolveWalletIframeTarget();
    const walletOriginConfigured = !!walletTarget.walletOrigin;
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
    const walletOrigin = walletTarget.walletOrigin;
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
          const webTarget = {
            walletOrigin: walletIframeConfig?.walletOrigin || '',
            servicePath: walletIframeConfig?.walletServicePath || '/wallet-service',
            rpIdOverride: walletIframeConfig?.rpIdOverride,
          };
          const shouldFallbackToWeb = !!(
            walletTarget.walletOrigin
            && walletTarget.walletOrigin.startsWith('chrome-extension://')
            && webTarget.walletOrigin
            && webTarget.walletOrigin !== walletTarget.walletOrigin
          );
          const targetsToTry = shouldFallbackToWeb ? [walletTarget, webTarget] : [walletTarget];

          let lastError: unknown = null;
          for (const target of targetsToTry) {
            const connectTimeoutMs = target.walletOrigin?.startsWith('chrome-extension://')
              ? 6_000 // keep extension-init snappy; fall back to web if it can't connect quickly
              : 20_000;
            const router = new WalletIframeRouter({
              walletOrigin: target.walletOrigin!,
              servicePath: target.servicePath,
              connectTimeoutMs,
              requestTimeoutMs: 60_000, // 60s
              signerMode: this.configs.signerMode,
              nearRpcUrl: this.configs.nearRpcUrl,
              nearNetwork: this.configs.nearNetwork,
              contractId: this.configs.contractId,
              nearExplorerUrl: this.configs.nearExplorerUrl,
              // Ensure relay server config reaches the wallet host for atomic registration
              relayer: this.configs.relayer,
              vrfWorkerConfigs: this.configs.vrfWorkerConfigs,
              emailRecoveryContracts: this.configs.emailRecoveryContracts,
              rpIdOverride: target.rpIdOverride,
              // Allow apps/CI to control where embedded bundles are served from
              sdkBasePath: walletIframeConfig?.sdkBasePath,
            });

            try {
              await router.init();
              // Opportunistically warm remote NonceManager
              try { await router.prefetchBlockheight(); } catch { }
              this.iframeRouter = router;
              // Cache by kind for per-request routing (threshold vs local).
              try {
                const origin = router.getWalletOrigin();
                if (origin.startsWith('chrome-extension://')) {
                  this.extensionIframeRouter = router;
                } else {
                  this.webIframeRouter = router;
                }
              } catch { }
              return;
            } catch (err) {
              lastError = err;
              try { router.dispose({ removeIframe: true }); } catch { }
              if (shouldFallbackToWeb && target === walletTarget) {
                console.warn('[TatchiPasskey] Extension wallet iframe unavailable; falling back to web wallet origin.', err);
              }
            }
          }

          throw lastError ?? new Error('[TatchiPasskey] Wallet iframe init failed');
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
      try {
        const origin = this.iframeRouter.getWalletOrigin();
        if (origin.startsWith('chrome-extension://')) {
          this.extensionIframeRouter = this.iframeRouter;
        } else {
          this.webIframeRouter = this.iframeRouter;
        }
      } catch { }
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
    return !!this.resolveWalletIframeTarget().walletOrigin && !__isWalletIframeHostMode();
  }

  private resolveWalletIframeTarget(): {
    walletOrigin: string | null;
    servicePath: string;
    rpIdOverride?: string;
  } {
    const cfg = this.configs.iframeWallet;
    if (!cfg) {
      return { walletOrigin: null, servicePath: '/wallet-service' };
    }

    const webOrigin = cfg.walletOrigin || '';
    const extensionOrigin = cfg.extensionWalletOrigin || '';
    const preferExtension = !!this.userPreferences.getUseExtensionWallet?.();

    const selectedWalletOrigin =
      (preferExtension && extensionOrigin)
        ? extensionOrigin
        : (webOrigin || extensionOrigin);
    if (!selectedWalletOrigin) {
      return { walletOrigin: null, servicePath: cfg.walletServicePath };
    }

    const isExtension = selectedWalletOrigin.startsWith('chrome-extension://');
    const servicePath = isExtension
      ? (cfg.extensionWalletServicePath || '/wallet-service.html')
      : cfg.walletServicePath;
    // Extension wallet uses extension-scoped rpId; do not override.
    const rpIdOverride = isExtension ? undefined : cfg.rpIdOverride;
    return { walletOrigin: selectedWalletOrigin, servicePath, rpIdOverride };
  }

  private resolveWalletIframeTargetByKind(kind: 'web' | 'extension'): {
    walletOrigin: string | null;
    servicePath: string;
    rpIdOverride?: string;
  } {
    const cfg = this.configs.iframeWallet;
    if (!cfg) {
      return { walletOrigin: null, servicePath: '/wallet-service' };
    }

    if (kind === 'web') {
      const walletOrigin = cfg.walletOrigin || null;
      return {
        walletOrigin,
        servicePath: cfg.walletServicePath || '/wallet-service',
        rpIdOverride: cfg.rpIdOverride,
      };
    }

    const walletOrigin = cfg.extensionWalletOrigin || null;
    return {
      walletOrigin,
      servicePath: cfg.extensionWalletServicePath || '/wallet-service.html',
      rpIdOverride: undefined,
    };
  }

  private async requireWalletIframeRouterByKind(kind: 'web' | 'extension', nearAccountId?: string): Promise<WalletIframeRouter> {
    if (__isWalletIframeHostMode()) {
      throw new Error('[TatchiPasskey] Wallet iframe client cannot be initialized in wallet-host mode.');
    }

    const target = this.resolveWalletIframeTargetByKind(kind);
    if (!target.walletOrigin) {
      throw new Error(`[TatchiPasskey] Wallet iframe ${kind} origin is not configured.`);
    }

    // Reuse the preferred router when it matches the desired origin.
    if (this.iframeRouter) {
      try {
        if (this.iframeRouter.getWalletOrigin() === target.walletOrigin) {
          if (kind === 'web') this.webIframeRouter = this.iframeRouter;
          else this.extensionIframeRouter = this.iframeRouter;
        }
      } catch { }
    }

    const existing = kind === 'web' ? this.webIframeRouter : this.extensionIframeRouter;
    if (existing) {
      await existing.init();
      try { await existing.prefetchBlockheight(); } catch { }
      return existing;
    }

    // Deduplicate concurrent init calls per target.
    const inFlight = this.walletIframeInitInFlightByKind[kind];
    if (inFlight) {
      await inFlight;
      const ready = kind === 'web' ? this.webIframeRouter : this.extensionIframeRouter;
      if (ready) return ready;
      throw new Error(`[TatchiPasskey] Wallet iframe ${kind} init failed`);
    }

    this.walletIframeInitInFlightByKind[kind] = (async () => {
      const { WalletIframeRouter } = await import('../WalletIframe/client/router');
      const cfg = this.configs.iframeWallet;
      const connectTimeoutMs = kind === 'extension' ? 6_000 : 20_000;
      const router = new WalletIframeRouter({
        walletOrigin: target.walletOrigin!,
        servicePath: target.servicePath,
        connectTimeoutMs,
        requestTimeoutMs: 60_000,
        signerMode: this.configs.signerMode,
        nearRpcUrl: this.configs.nearRpcUrl,
        nearNetwork: this.configs.nearNetwork,
        contractId: this.configs.contractId,
        nearExplorerUrl: this.configs.nearExplorerUrl,
        relayer: this.configs.relayer,
        vrfWorkerConfigs: this.configs.vrfWorkerConfigs,
        emailRecoveryContracts: this.configs.emailRecoveryContracts,
        rpIdOverride: target.rpIdOverride,
        sdkBasePath: cfg?.sdkBasePath,
      });

      await router.init();
      try { await router.prefetchBlockheight(); } catch { }

      if (kind === 'web') this.webIframeRouter = router;
      else this.extensionIframeRouter = router;
    })();

    try {
      await this.walletIframeInitInFlightByKind[kind];
    } finally {
      this.walletIframeInitInFlightByKind[kind] = null;
    }

    const ready = kind === 'web' ? this.webIframeRouter : this.extensionIframeRouter;
    if (!ready) {
      throw new Error(`[TatchiPasskey] Wallet iframe ${kind} is configured but unavailable.`);
    }
    return ready;
  }

  private async requireWalletIframeRouterForSigning(args: {
    nearAccountId?: string;
    signerMode: SignerMode;
  }): Promise<WalletIframeRouter> {
    const cfg = this.configs.iframeWallet;
    const webAvailable = !!cfg?.walletOrigin;
    const extensionAvailable = !!cfg?.extensionWalletOrigin;
    const kind = await resolveSigningWalletTarget({
      signerMode: args.signerMode,
      nearAccountId: args.nearAccountId,
      webAvailable,
      extensionAvailable,
      getExtensionRouter: extensionAvailable
        ? async () => this.requireWalletIframeRouterByKind('extension', args.nearAccountId)
        : undefined,
    });
    return await this.requireWalletIframeRouterByKind(kind, args.nearAccountId);
  }

  private async requireWalletIframeRouterForUnauthFlow(nearAccountId?: string): Promise<WalletIframeRouter> {
    const cfg = this.configs.iframeWallet;
    if (cfg?.walletOrigin) {
      return await this.requireWalletIframeRouterByKind('web', nearAccountId);
    }
    // Fallback: no web wallet configured; use the preferred target.
    return await this.requireWalletIframeRouter(nearAccountId);
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
      configs: this.configs,
      theme: this.theme,
    }
  }

  /**
   * Set SDK theme and propagate to wallet/confirmation UI (best-effort).
   * Theme propagation rules:
   * - Always update in-memory theme immediately.
   * - In wallet host mode, update `document.documentElement[data-w3a-theme]`.
   * - In app-origin iframe mode, best-effort `router.setTheme(next)`.
   * This never throws; callers should treat it as a fire-and-forget update.
   */
  setTheme(next: ThemeName): void {
    const nextTheme = coerceThemeName(next);
    if (!nextTheme) return;
    if (this.theme === nextTheme) return;
    this.theme = nextTheme;

    try {
      this.webAuthnManager.setTheme(nextTheme);
    } catch { }

    if (__isWalletIframeHostMode()) {
      try {
        document.documentElement.setAttribute('data-w3a-theme', nextTheme);
      } catch { }
    }

    if (this.shouldUseWalletIframe()) {
      void (async () => {
        try {
          const router = await this.requireWalletIframeRouter();
          await router.setTheme(nextTheme);
        } catch { }
      })();
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
      const shouldAvoidLocalUserState = this.shouldUseWalletIframe();
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
    const forcedSignerMode: SignerMode = { mode: 'threshold-signer' };
    // In wallet-iframe mode, always run inside the wallet origin (no app-origin fallback).
    if (this.shouldUseWalletIframe()) {
      try {
        const router = await this.requireWalletIframeRouterForUnauthFlow(nearAccountId);
        const confirmationConfig = options?.confirmationConfig;
        const res = await router.registerPasskey({
          nearAccountId,
          confirmationConfig,
          options: {
            onEvent: options?.onEvent,
            signerMode: forcedSignerMode,
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
      { ...options, signerMode: forcedSignerMode },
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
    const forcedSignerMode: SignerMode = { mode: 'threshold-signer' };
    // In wallet-iframe mode, always run inside the wallet origin (no app-origin fallback).
    if (this.shouldUseWalletIframe()) {
      try {
        const router = await this.requireWalletIframeRouterForUnauthFlow(nearAccountId);
        const confirmationConfig = confirmationConfigOverride ?? options?.confirmationConfig;
        const res = await router.registerPasskey({
          nearAccountId,
          confirmationConfig,
          options: {
            onEvent: options?.onEvent,
            signerMode: forcedSignerMode,
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
      { ...options, signerMode: forcedSignerMode },
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
        const router = await this.requireWalletIframeRouterForUnauthFlow(nearAccountId);
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
      // Anchor session discovery to the web wallet origin when available.
      // The web wallet is where unauthenticated flows (registration/login/emailRecovery/syncAccount)
      // run by default, and it has a separate storage partition from the extension origin.
      const router = await this.requireWalletIframeRouterForUnauthFlow(nearAccountId);
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
      const accountId = String(nearAccountId);
      const webPromise = (async (): Promise<boolean> => {
        const webRouter = await this.requireWalletIframeRouterForUnauthFlow();
        return await webRouter.hasPasskeyCredential(accountId);
      })();

      const extPromise = (async (): Promise<boolean> => {
        if (!this.configs.iframeWallet?.extensionWalletOrigin) return false;
        const extRouter = await this.requireWalletIframeRouterByKind('extension', accountId);
        return await extRouter.hasPasskeyCredential(accountId);
      })();

      const [webHas, extHas] = await Promise.allSettled([webPromise, extPromise]).then((results) => {
        const values = results.map((r) => (r.status === 'fulfilled' ? !!r.value : false));
        return values as [boolean, boolean];
      });

      return !!(webHas || extHas);
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
  setConfirmBehavior(behavior: ConfirmationBehavior): void {
    // Always update local in-memory state so app UI reflects changes immediately.
    this.webAuthnManager.getUserPreferences().setConfirmBehavior(behavior);

    if (!this.shouldUseWalletIframe()) return;

    // Fire and forget; persistence handled in wallet hosts (web + extension).
    void (async () => {
      const nearAccountId = String(this.userPreferences.getCurrentUserAccountId?.() || '').trim();
      try {
        const webRouter = await this.requireWalletIframeRouterForUnauthFlow(nearAccountId || undefined);
        await webRouter.setConfirmBehavior(behavior, nearAccountId ? { nearAccountId } : undefined);
      } catch { }
      try {
        if (this.configs.iframeWallet?.extensionWalletOrigin) {
          const extRouter = await this.requireWalletIframeRouterByKind('extension', nearAccountId || undefined);
          await extRouter.setConfirmBehavior(behavior, nearAccountId ? { nearAccountId } : undefined);
        }
      } catch { }
    })();
  }

  /**
   * Set the unified confirmation configuration
   */
  setConfirmationConfig(config: ConfirmationConfig): void {
    // Always update local in-memory state so app UI reflects changes immediately.
    this.webAuthnManager.getUserPreferences().setConfirmationConfig(config);

    if (!this.shouldUseWalletIframe()) return;

    // Fire and forget; persistence handled in wallet hosts (web + extension).
    void (async () => {
      const nearAccountId = String(this.userPreferences.getCurrentUserAccountId?.() || '').trim();
      try {
        const webRouter = await this.requireWalletIframeRouterForUnauthFlow(nearAccountId || undefined);
        await webRouter.setConfirmationConfig(config, nearAccountId ? { nearAccountId } : undefined);
      } catch { }
      try {
        if (this.configs.iframeWallet?.extensionWalletOrigin) {
          const extRouter = await this.requireWalletIframeRouterByKind('extension', nearAccountId || undefined);
          await extRouter.setConfirmationConfig(config, nearAccountId ? { nearAccountId } : undefined);
        }
      } catch { }
    })();
  }

  setSignerMode(signerMode: SignerMode | SignerMode['mode']): void {
    // In wallet-iframe mode on the app origin, IndexedDB persistence is disabled and
    // signerMode must be stored on the wallet origin(s). Update local state immediately
    // for UI responsiveness, then persist to wallet host(s) best-effort.
    if (this.shouldUseWalletIframe()) {
      const nearAccountId = String(this.userPreferences.getCurrentUserAccountId?.() || '').trim() || undefined;
      const next = mergeSignerMode(this.getSignerMode(), signerMode);
      this.userPreferences.applyWalletHostSignerMode({
        nearAccountId: nearAccountId ? toAccountId(nearAccountId) : null,
        signerMode: next,
      });
      void (async () => {
        try {
          const webRouter = await this.requireWalletIframeRouterForUnauthFlow(nearAccountId);
          await webRouter.setSignerMode(next, nearAccountId ? { nearAccountId } : undefined);
        } catch { }
        try {
          if (this.configs.iframeWallet?.extensionWalletOrigin) {
            const extRouter = await this.requireWalletIframeRouterByKind('extension', nearAccountId);
            await extRouter.setSignerMode(next, nearAccountId ? { nearAccountId } : undefined);
          }
        } catch { }
      })();
      return;
    }

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
        const webRouter = await this.requireWalletIframeRouterForUnauthFlow();
        const web = await webRouter.getRecentLogins();

        // Best-effort: also include extension-scoped accounts.
        const ext = await (async () => {
          if (!this.configs.iframeWallet?.extensionWalletOrigin) return null;
          try {
            const p = (async () => {
              const extRouter = await this.requireWalletIframeRouterByKind('extension');
              return await extRouter.getRecentLogins();
            })();
            const timeoutMs = 1200;
            const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs));
            return await Promise.race([p, timeout]);
          } catch {
            return null;
          }
        })();

        const accountIds = Array.from(new Set([...(web?.accountIds || []), ...((ext as any)?.accountIds || [])]));
        const lastUsedAccount = web?.lastUsedAccount || (ext as any)?.lastUsedAccount || null;
        return { accountIds, lastUsedAccount };
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
        const signerMode = mergeSignerMode(this.getSignerMode(), args.options?.signerMode);
        const router = await this.requireWalletIframeRouterForSigning({
          nearAccountId: args.nearAccountId,
          signerMode,
        });
        const res = await router.executeAction({
          nearAccountId: args.nearAccountId,
          receiverId: args.receiverId,
          actionArgs: args.actionArgs,
          options: { ...args.options, signerMode }
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
        const signerMode = mergeSignerMode(this.getSignerMode(), options?.signerMode);
        const router = await this.requireWalletIframeRouterForSigning({ nearAccountId, signerMode });
        const routerOptions: SignAndSendTransactionHooksOptions = {
          ...options,
          signerMode,
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
        const signerMode = mergeSignerMode(this.getSignerMode(), options?.signerMode);
        const router = await this.requireWalletIframeRouterForSigning({ nearAccountId, signerMode });
        const txs = transactions.map((t) => ({ receiverId: t.receiverId, actions: t.actions }));
        const result = await router.signTransactionsWithActions({
          nearAccountId,
          transactions: txs,
          options: {
            signerMode,
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
        const signerMode = mergeSignerMode(this.getSignerMode(), options?.signerMode);
        const router = await this.requireWalletIframeRouterForSigning({ nearAccountId, signerMode });
        const result = await router.signDelegateAction({
          nearAccountId,
          delegate,
          options: {
            signerMode,
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
        const signerMode = mergeSignerMode(this.getSignerMode(), args.options?.signerMode);
        const router = await this.requireWalletIframeRouterForSigning({ nearAccountId: args.nearAccountId, signerMode });
        const result = await router.signNep413Message({
          nearAccountId: args.nearAccountId,
          message: args.params.message,
          recipient: args.params.recipient,
          state: args.params.state,
          options: {
            signerMode,
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
    const resolvedOptions = {
      ...options,
      theme: options?.theme ?? this.theme,
    };
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
        await this.iframeRouter.exportNearKeypairWithUI(nearAccountId, resolvedOptions);
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
      await this.webAuthnManager.exportNearKeypairWithUI(toAccountId(nearAccountId), resolvedOptions);
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
        const router = await this.requireWalletIframeRouterForUnauthFlow();
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
        const router = await this.requireWalletIframeRouterForUnauthFlow();
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
        const router = await this.requireWalletIframeRouterForUnauthFlow();
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
        const router = await this.requireWalletIframeRouterForUnauthFlow();
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
  // === Extension Migration (scaffold) ===
  ///////////////////////////////////////

  private async ensureExtensionMigrationFlow(options?: ExtensionMigrationOptions) {
    const { ExtensionMigrationFlow } = await import('./extensionMigration');
    if (!this.activeExtensionMigrationFlow) {
      this.activeExtensionMigrationFlow = new ExtensionMigrationFlow(
        this.getContext(),
        options,
        {
          getWebWalletRouter: async () => {
            if (!this.configs.iframeWallet?.walletOrigin) return null;
            return await this.requireWalletIframeRouterByKind('web');
          },
        }
      );
    } else if (options) {
      this.activeExtensionMigrationFlow.setOptions(options);
    }
    return this.activeExtensionMigrationFlow;
  }

  async startExtensionMigration(args: {
    accountId: string;
    options?: ExtensionMigrationOptions;
  }): Promise<ExtensionMigrationResult> {
    const flow = await this.ensureExtensionMigrationFlow(args.options);
    return flow.start({ accountId: args.accountId, options: args.options });
  }

  cancelExtensionMigration(message?: string): void {
    if (!this.activeExtensionMigrationFlow) return;
    this.activeExtensionMigrationFlow.cancel(message);
  }

  getExtensionMigrationState(): ExtensionMigrationState {
    if (this.activeExtensionMigrationFlow) {
      return this.activeExtensionMigrationFlow.getState();
    }
    return {
      status: ExtensionMigrationStatus.IDLE,
      step: ExtensionMigrationStep.IDLE,
      accountId: null,
      startedAt: undefined,
      updatedAt: undefined,
      message: undefined,
      error: undefined,
    };
  }

  ///////////////////////////////////////
  // === Extension Migration (host-only helpers) ===
  ///////////////////////////////////////

  /**
   * Wallet-host only: prepare an extension-scoped passkey + derived key material for an existing account.
   * This intentionally does NOT create a new NEAR account; it mirrors the "accountId (deviceNumber)" storage
   * convention used by linkDevice/emailRecovery flows.
   */
  async prepareExtensionMigrationDevice(args: {
    accountId: string;
    deviceNumber: number;
    options?: {
      confirmerText?: { title?: string; body?: string };
      confirmationConfig?: Partial<ConfirmationConfig>;
    };
  }): Promise<RegistrationResult> {
    const accountId = toAccountId(args.accountId);
    const deviceNumber = Number(args.deviceNumber);
    if (!Number.isSafeInteger(deviceNumber) || deviceNumber < 1) {
      return { success: false, error: `Invalid deviceNumber: ${String(args.deviceNumber)}` };
    }

    // Opportunistically evict stale pending entries.
    const now = Date.now();
    for (const [key, value] of this.pendingExtensionMigrationDeviceRegistration.entries()) {
      if (value.expiresAt <= now) this.pendingExtensionMigrationDeviceRegistration.delete(key);
    }

    try {
      const confirm = await this.webAuthnManager.requestRegistrationCredentialConfirmation({
        nearAccountId: accountId,
        deviceNumber,
        confirmerText: args.options?.confirmerText ?? {
          title: 'Create extension passkey',
          body: 'Approve creating a new passkey for the extension wallet.',
        },
        confirmationConfigOverride: args.options?.confirmationConfig,
      });

      if (!confirm.confirmed || !confirm.credential || !confirm.vrfChallenge) {
        return { success: false, error: 'User cancelled extension passkey creation.' };
      }

      const vrfDerivationResult = await this.webAuthnManager.deriveVrfKeypair({
        credential: confirm.credential,
        nearAccountId: accountId,
      });
      if (!vrfDerivationResult.encryptedVrfKeypair || !vrfDerivationResult.vrfPublicKey) {
        return { success: false, error: 'Failed to derive VRF keypair for extension passkey.' };
      }

      const nearKeyResult = await this.webAuthnManager.deriveNearKeypairAndEncryptFromSerialized({
        nearAccountId: accountId,
        credential: confirm.credential,
        options: { deviceNumber },
      });
      if (!nearKeyResult.success || !nearKeyResult.publicKey) {
        return { success: false, error: nearKeyResult.error || 'Failed to derive NEAR keypair for extension passkey.' };
      }

      // Initialize nonce manager for this new device key so downstream steps that
      // need tx context (e.g., device registration signing) can fetch nonce/blockhash.
      try {
        this.webAuthnManager.getNonceManager().initializeUser(accountId, nearKeyResult.publicKey);
      } catch {}

      // Persist user + authenticator metadata under (accountId, deviceNumber), like linkDevice.
      await this.webAuthnManager.storeUserData({
        nearAccountId: accountId,
        deviceNumber,
        clientNearPublicKey: nearKeyResult.publicKey,
        lastUpdated: Date.now(),
        passkeyCredential: {
          id: confirm.credential.id,
          rawId: confirm.credential.rawId,
        },
        encryptedVrfKeypair: {
          encryptedVrfDataB64u: vrfDerivationResult.encryptedVrfKeypair.encryptedVrfDataB64u,
          chacha20NonceB64u: vrfDerivationResult.encryptedVrfKeypair.chacha20NonceB64u,
        },
        serverEncryptedVrfKeypair: vrfDerivationResult.serverEncryptedVrfKeypair || undefined,
      });

      const attestationB64u = confirm.credential.response.attestationObject;
      const credentialPublicKey = await this.webAuthnManager.extractCosePublicKey(attestationB64u);
      await this.webAuthnManager.storeAuthenticator({
        nearAccountId: accountId,
        deviceNumber,
        credentialId: confirm.credential.rawId,
        credentialPublicKey,
        transports: confirm.credential.response?.transports ?? ['internal'],
        name: `Device ${deviceNumber} Passkey for ${String(accountId).split('.')[0]}`,
        registered: new Date().toISOString(),
        syncedAt: new Date().toISOString(),
        vrfPublicKey: vrfDerivationResult.vrfPublicKey,
      });

      // Ensure allowCredentials selection prefers this device going forward.
      try { await this.webAuthnManager.setLastUser(accountId, deviceNumber); } catch { }

      // Cache the credential+challenge so the host can sign the device registration tx after AddKey lands.
      this.pendingExtensionMigrationDeviceRegistration.set(String(accountId), {
        credential: confirm.credential,
        vrfChallenge: confirm.vrfChallenge,
        deviceNumber,
        deterministicVrfPublicKey: vrfDerivationResult.vrfPublicKey,
        expiresAt: Date.now() + 5 * 60_000,
      });

      return {
        success: true,
        nearAccountId: accountId,
        clientNearPublicKey: nearKeyResult.publicKey,
      };
    } catch (err) {
      const e = toError(err);
      return { success: false, error: e.message };
    }
  }

  /**
   * Wallet-host only: finalize extension migration by signing + submitting the device registration
   * transaction with the already-prepared (accountId, deviceNumber) key material.
   */
  async finalizeExtensionMigrationDevice(args: {
    accountId: string;
  }): Promise<{ success: boolean; transactionId?: string; error?: string }> {
    const accountId = toAccountId(args.accountId);
    const pending = this.pendingExtensionMigrationDeviceRegistration.get(String(accountId));
    if (!pending) {
      return { success: false, error: 'No pending extension migration registration found. Please restart the migration.' };
    }
    if (pending.expiresAt <= Date.now()) {
      this.pendingExtensionMigrationDeviceRegistration.delete(String(accountId));
      return { success: false, error: 'Extension migration registration expired. Please restart the migration.' };
    }

    try {
      const registrationResult = await this.webAuthnManager.signDevice2RegistrationWithStoredKey({
        nearAccountId: accountId,
        credential: pending.credential,
        vrfChallenge: pending.vrfChallenge,
        deviceNumber: pending.deviceNumber,
        deterministicVrfPublicKey: pending.deterministicVrfPublicKey,
      });

      if (!registrationResult.success || !registrationResult.signedTransaction) {
        return { success: false, error: registrationResult.error || 'Failed to sign extension device registration transaction.' };
      }

      const outcome = await this.nearClient.sendTransaction(registrationResult.signedTransaction);
      const txHash = (outcome as any)?.transaction?.hash;
      this.pendingExtensionMigrationDeviceRegistration.delete(String(accountId));

      return {
        success: true,
        transactionId: typeof txHash === 'string' && txHash.trim() ? txHash : undefined,
      };
    } catch (err) {
      const e = toError(err);
      return { success: false, error: e.message };
    }
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
