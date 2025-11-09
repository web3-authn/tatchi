/**
 * PasskeyManagerIframe - Entry Point Layer
 *
 * This is the main API that developers interact with when using the WalletIframe system.
 * It provides the same interface as the regular PasskeyManager but routes all calls to
 * a secure iframe for enhanced security and WebAuthn compatibility.
 *
 * Key Responsibilities:
 * - Acts as a transparent proxy to the real PasskeyManager running in the iframe
 * - Maintains API compatibility with the regular PasskeyManager
 * - Handles hook callbacks (afterCall, onError, onEvent) locally
 * - Provides fallback to local PasskeyManager for operations not yet iframe-enabled
 * - Manages theme preferences and user settings synchronization
 * - Bridges progress events from iframe back to developer callbacks
 *
 * Architecture:
 * - Uses WalletIframeRouter for all iframe communication
 * - Maintains local state for immediate synchronous access (theme, config)
 * - Provides NearClient facade that routes calls to iframe when ready
 * - Handles both iframe and fallback local execution paths
 */

import { WalletIframeRouter } from './client/router';
import { PasskeyManager } from '../PasskeyManager';
import { MinimalNearClient } from '../NearClient';
import type { NearClient, SignedTransaction, AccessKeyList } from '../NearClient';
import type {
  PasskeyManagerConfigs,
  RegistrationResult,
  LoginResult,
  VerifyAndSignTransactionResult,
  LoginState,
  SignNEP413HooksOptions,
  ActionHooksOptions,
  AccountRecoveryHooksOptions,
  GetRecentLoginsResult,
  ActionResult,
  SignAndSendTransactionHooksOptions,
  SignTransactionHooksOptions,
} from '../types/passkeyManager';
import type { ActionArgs, TransactionInput, TxExecutionStatus } from '../types';
import type { DeviceLinkingQRData, StartDevice2LinkingFlowArgs, StartDevice2LinkingFlowResults, StartDeviceLinkingOptionsDevice2 } from '../types/linkDevice';
import type { ScanAndLinkDeviceOptionsDevice1, LinkDeviceResult } from '../types/linkDevice';
import type { ConfirmationConfig } from '../types/signer-worker';
import { DEFAULT_CONFIRMATION_CONFIG } from '../types/signer-worker';
import type { RegistrationHooksOptions, LoginHooksOptions, SendTransactionHooksOptions } from '../types/passkeyManager';
import type { SignNEP413MessageParams, SignNEP413MessageResult } from '../PasskeyManager/signNEP413';
import type { RecoveryResult } from '../PasskeyManager';
import { toError } from '../../utils/errors';
import type { WalletUIRegistry } from './host/iframe-lit-element-registry';


export class PasskeyManagerIframe {
  readonly configs: PasskeyManagerConfigs;
  private router: WalletIframeRouter;
  private fallbackLocal: PasskeyManager | null = null;
  private lastConfirmationConfig: ConfirmationConfig = DEFAULT_CONFIRMATION_CONFIG;
  private themeListeners: Set<(t: 'light' | 'dark') => void> = new Set();
  private themePollTimer: number | null = null;
  private readonly themePollMs = 1500;

  // Expose a userPreferences shim so API matches PasskeyManager
  get userPreferences() {
    return {
      onThemeChange: (cb: (t: 'light' | 'dark') => void) => {
        this.themeListeners.add(cb);
        // Immediately emit current value
        cb(this.lastConfirmationConfig.theme);
        return () => {
          this.themeListeners.delete(cb);
        };
      },
      getUserTheme: () => this.lastConfirmationConfig.theme,
      setUserTheme: (t: 'light' | 'dark') => {
        this.setUserTheme(t);
        // Optimistically update local cache and notify listeners
        this.lastConfirmationConfig = { ...this.lastConfirmationConfig, theme: t } as ConfirmationConfig;
        this.notifyTheme(t);
      },
      setConfirmBehavior: (b: 'requireClick' | 'autoProceed') => { this.setConfirmBehavior(b); },
      setConfirmationConfig: (c: ConfirmationConfig) => { this.setConfirmationConfig(c); },
      getConfirmationConfig: () => this.getConfirmationConfig(),
    };
  }

  constructor(configs: PasskeyManagerConfigs) {
    this.configs = configs;

    const walletOrigin = configs.iframeWallet?.walletOrigin;
    if (!walletOrigin) {
      throw new Error('[PasskeyManagerIframe] iframeWallet.walletOrigin is required to enable the wallet iframe. Configure it to a dedicated origin.');
    }

    let parsedWalletOrigin: URL;
    try {
      parsedWalletOrigin = new URL(walletOrigin);
    } catch (err) {
      throw new Error(`[PasskeyManagerIframe] Invalid iframeWallet.walletOrigin (${walletOrigin}). Provide an absolute URL.`);
    }

    if (typeof window !== 'undefined') {
      const parentOrigin = window.location.origin;
      if (parsedWalletOrigin.origin === parentOrigin) {
        console.warn('[PasskeyManagerIframe] iframeWallet.walletOrigin matches the host origin. Isolation is reduced; consider serving the wallet from a dedicated origin.');
      }
    }

    this.router = new WalletIframeRouter({
      walletOrigin: parsedWalletOrigin.toString(),
      servicePath: configs.iframeWallet?.walletServicePath || '/wallet-service',
      // Lower connect timeout to reduce initial boot-wait window (25% of this).
      // With 3_000ms, boot wait caps at ~750ms; improves sub‑second readiness in dev.
      connectTimeoutMs: 3_000,
      requestTimeoutMs: 60_000,
      theme: configs.walletTheme,
      nearRpcUrl: configs.nearRpcUrl,
      nearNetwork: configs.nearNetwork,
      contractId: configs.contractId,
      relayer: configs.relayer,
      vrfWorkerConfigs: configs.vrfWorkerConfigs,
      rpIdOverride: configs.iframeWallet?.rpIdOverride,
      authenticatorOptions: configs.authenticatorOptions,
    });
  }

  async initWalletIframe(): Promise<void> {
    await this.router.init();
    try {
      const cfg = await this.router.getConfirmationConfig();
      this.lastConfirmationConfig = {
        ...DEFAULT_CONFIRMATION_CONFIG,
        ...cfg
      } as ConfirmationConfig;
      this.notifyTheme(this.lastConfirmationConfig.theme);
    } catch {}
  }

  isReady(): boolean { return this.router.isReady(); }

  onReady(cb: () => void): () => void { return this.router.onReady(cb); }

  onVrfStatusChanged(
    cb: (status: {
      active: boolean;
      nearAccountId: string | null;
      sessionDuration?: number;
    }) => void
  ): () => void {
    return this.router.onVrfStatusChanged(cb);
  }

  // === Generic Wallet UI registration/mounting ===
  registerWalletUI(types: WalletUIRegistry): void { this.router.registerUiTypes(types); }
  mountWalletUI(params: { key: string; props?: Record<string, unknown>; targetSelector?: string; id?: string }): void {
    this.router.mountUiComponent(params);
  }
  updateWalletUI(id: string, props?: Record<string, unknown>): void {
    this.router.updateUiComponent({ id, props });
  }
  unmountWalletUI(id: string): void { this.router.unmountUiComponent(id); }

  async registerPasskey(nearAccountId: string, options: RegistrationHooksOptions = {}): Promise<RegistrationResult> {
    try {
      // Route the registration request to the iframe via WalletIframeRouter
      // This will:
      // - Create a unique request ID
      // - Send PM_REGISTER message to iframe
      // - Show overlay for WebAuthn activation
      // - Bridge progress events back to onEvent callback
      const res = await this.router.registerPasskey({
        nearAccountId,
        options: { onEvent: options?.onEvent } // Bridge progress events from iframe to parent
      });
      await options?.afterCall?.(true, res);
      return res;
    } catch (err: unknown) {
      const e = toError(err);
      await options?.onError?.(e);
      await options?.afterCall?.(false);
      throw e;
    }
  }

  async loginPasskey(nearAccountId: string, options?: LoginHooksOptions): Promise<LoginResult> {
    try {
      // Route login request to iframe - similar flow to registerPasskey
      // The iframe will handle WebAuthn authentication and VRF session creation
      const res = await this.router.loginPasskey({
        nearAccountId,
        options: { onEvent: options?.onEvent } // Progress events flow back to parent
      });
      await options?.afterCall?.(true, res);
      return res;
    } catch (err: unknown) {
      const e = toError(err);
      await options?.onError?.(e);
      await options?.afterCall?.(false);
      throw e;
    }
  }

  async logoutAndClearVrfSession(): Promise<void> {
    await this.router.clearVrfSession();
  }

  async getLoginState(nearAccountId?: string): Promise<LoginState> {
    if (!this.router.isReady()) {
      return {
        isLoggedIn: false,
        nearAccountId: null,
        publicKey: null,
        userData: null,
        vrfActive: false,
      } as LoginState;
    }
    return this.router.getLoginState(nearAccountId);
  }

  async signTransactionsWithActions(args: {
    nearAccountId: string;
    transactions: TransactionInput[];
    options?: SignTransactionHooksOptions
  }): Promise<VerifyAndSignTransactionResult[]> {
    try {
      // Route transaction signing to iframe
      // This will:
      // - Send PM_SIGN_TXS_WITH_ACTIONS message to iframe
      // - Show overlay during user confirmation and WebAuthn phases
      // - Handle transaction signing in secure iframe context
      // - Bridge progress events back to parent
      const res = await this.router.signTransactionsWithActions({
        nearAccountId: args.nearAccountId,
        transactions: args.transactions,
        options: {
          onEvent: args.options?.onEvent // Progress events: user-confirmation, webauthn-authentication, etc.
        }
      });
      await args.options?.afterCall?.(true, res);
      return res;
    } catch (err: unknown) {
      const e = toError(err);
      await args.options?.onError?.(e);
      await args.options?.afterCall?.(false);
      throw e;
    }
  }

  async signNEP413Message(args: {
    nearAccountId: string;
    params: SignNEP413MessageParams;
    options?: SignNEP413HooksOptions
  }): Promise<SignNEP413MessageResult> {
    try {
      const res = await this.router.signNep413Message({
        nearAccountId: args.nearAccountId,
        message: args.params.message,
        recipient: args.params.recipient,
        state: args.params.state,
        options: { onEvent: args.options?.onEvent }
      });
      await args.options?.afterCall?.(true, res);
      return res;
    } catch (err: unknown) {
      const e = toError(err);
      await args.options?.onError?.(e);
      await args.options?.afterCall?.(false);
      throw e;
    }
  }

  // Flows not yet proxied: fall back to local manager with identical APIs
  private ensureFallbackLocal(): PasskeyManager {
    if (!this.fallbackLocal) {
      const near = new MinimalNearClient(this.configs.nearRpcUrl);
      this.fallbackLocal = new PasskeyManager(this.configs, near);
    }
    return this.fallbackLocal;
  }

  getNearClient(): NearClient {
    // The fallback PasskeyManager holds a fully-implemented NearClient (MinimalNearClient).
    // Returning it directly avoids API drift and stays aligned with core behavior.
    return this.ensureFallbackLocal().getNearClient();
  }

  async recoverAccountFlow(args: {
    accountId?: string;
    options?: AccountRecoveryHooksOptions
  }): Promise<RecoveryResult> {
    if (this.router.isReady()) {
      try {
        const res = await this.router.recoverAccountFlow({
          accountId: args.accountId,
          onEvent: args.options?.onEvent
        });
        await args.options?.afterCall?.(true, res);
        return res;
      } catch (err: unknown) {
        const e = toError(err);
        await args.options?.onError?.(e);
        await args.options?.afterCall?.(false);
        throw e;
      }
    }
    return await this.ensureFallbackLocal().recoverAccountFlow({
      accountId: args.accountId,
      options: args.options
    });
  }

  // Device2: Start QR generation + polling inside wallet iframe, return QR to parent
  async startDevice2LinkingFlow({
    ui,
    accountId,
    afterCall,
    onError,
    onEvent,
  }: StartDevice2LinkingFlowArgs): Promise<StartDevice2LinkingFlowResults> {
    // If iframe router present, prefer secure host flow; otherwise fallback to local QR generation
    try {
      if (this.router.isReady()) {
        const res = await this.router.startDevice2LinkingFlow({
          accountId: accountId,
          ui: ui,
          onEvent: onEvent
        });
        await afterCall?.(true, res);
        return res
      }
      const {
        qrData,
        qrCodeDataURL
      } = await this.ensureFallbackLocal().startDevice2LinkingFlow({
        accountId: accountId,
        onEvent: onEvent,
      });
      const res = { qrData, qrCodeDataURL };
      await afterCall?.(true, res);
      return res;
    } catch (err: unknown) {
      const e = toError(err);
      await onError?.(e);
      await afterCall?.(false);
      throw e;
    }
  }

  async stopDevice2LinkingFlow(): Promise<void> {
    if (!this.router.isReady()) { await this.ensureFallbackLocal().stopDevice2LinkingFlow(); return; }
    await this.router.stopDevice2LinkingFlow();
  }

  // Device1: Link device in the host (AddKey + mapping) using scanned QR payload
  async linkDeviceWithScannedQRData(
    qrData: DeviceLinkingQRData,
    options: ScanAndLinkDeviceOptionsDevice1
  ): Promise<LinkDeviceResult> {
    try {
      if (this.router.isReady()) {
        const res = await this.router.linkDeviceWithScannedQRData({
          qrData,
          fundingAmount: options.fundingAmount,
          options: {
            onEvent: options?.onEvent
          }
        });
        await options?.afterCall?.(true, res);
        return res;
      }
      const res = await this.ensureFallbackLocal().linkDeviceWithScannedQRData(
        qrData,
        options
      );
      await options?.afterCall?.(true, res);
      return res;
    } catch (err: unknown) {
      const e = toError(err);
      await options?.onError?.(e);
      await options?.afterCall?.(false);
      throw e;
    }
  }

  // Parity with PasskeyManager API
  setConfirmBehavior(behavior: 'requireClick' | 'autoProceed'): void {
    this.router.setConfirmBehavior(behavior);
  }
  setConfirmationConfig(config: ConfirmationConfig): void {
    // Update local cache synchronously for immediate reads
    this.lastConfirmationConfig = {
      ...DEFAULT_CONFIRMATION_CONFIG,
      ...this.lastConfirmationConfig,
      ...config
    } as ConfirmationConfig;
    this.router.setConfirmationConfig(config);
  }
  setUserTheme(theme: 'dark' | 'light'): void {
    this.lastConfirmationConfig = { ...this.lastConfirmationConfig, theme } as ConfirmationConfig;
    this.router.setTheme(theme);
    this.notifyTheme(theme);
  }
  getConfirmationConfig(): ConfirmationConfig {
    // Synchronous API parity with PasskeyManager
    return this.lastConfirmationConfig;
  }
  async prefetchBlockheight(): Promise<void> {
    await this.router.prefetchBlockheight();
  }
  async getRecentLogins(): Promise<GetRecentLoginsResult> {
    // Avoid readiness race by ensuring the router initializes.
    try { await this.router.init(); } catch {}
    let remote: GetRecentLoginsResult | null = null;
    try {
      remote = await this.router.getRecentLogins();
    } catch (err: unknown) {
      // Wallet host may be on older bundle (IDB VersionError). Fallback to local.
      try {
        return await this.ensureFallbackLocal().getRecentLogins();
      } catch {}
      throw toError(err);
    }
    // If wallet-origin has no last user yet (common in first-run dev),
    // fall back to local IndexedDB for lastUsedAccountId so the UI can prefill.
    if (!remote?.lastUsedAccountId) {
      const local = this.ensureFallbackLocal();
      const loc = await local.getRecentLogins();
      if (loc?.lastUsedAccountId) {
        remote = { accountIds: remote?.accountIds || [], lastUsedAccountId: loc.lastUsedAccountId };
      }
    }
    return remote as GetRecentLoginsResult;
  }
  async hasPasskeyCredential(nearAccountId: string): Promise<boolean> {
    return this.router.hasPasskeyCredential(nearAccountId);
  }
  async viewAccessKeyList(accountId: string): Promise<AccessKeyList> {
    return this.router.viewAccessKeyList(accountId);
  }
  async deleteDeviceKey(accountId: string, publicKeyToDelete: string, options?: ActionHooksOptions): Promise<import('../types/passkeyManager').ActionResult> {
    try {
      const res = await this.router.deleteDeviceKey(
        accountId,
        publicKeyToDelete,
        { onEvent: options?.onEvent }
      );
      await options?.afterCall?.(true, res);
      return res;
    } catch (err: unknown) {
      const e = toError(err);
      await options?.onError?.(e);
      await options?.afterCall?.(false);
      throw e;
    }
  }
  async executeAction(args: {
    nearAccountId: string;
    receiverId: string;
    actionArgs: ActionArgs | ActionArgs[];
    options?: ActionHooksOptions
  }): Promise<ActionResult> {
    try {
      const res = await this.router.executeAction({
        nearAccountId: args.nearAccountId,
        receiverId: args.receiverId,
        actionArgs: args.actionArgs,
        options: {
          onEvent: args.options?.onEvent,
          waitUntil: args.options?.waitUntil,
        }
      });
      await args.options?.afterCall?.(true, res);
      return res;
    } catch (err: unknown) {
      const e = toError(err);
      await args.options?.onError?.(e);
      await args.options?.afterCall?.(false);
      throw e;
    }
  }
  async sendTransaction(args: {
    signedTransaction: SignedTransaction;
    options?: SendTransactionHooksOptions
  }): Promise<ActionResult> {
    // Route via iframe router with PROGRESS bridging
    const options = args.options;
    try {
      const res = await this.router.sendTransaction({
        signedTransaction: args.signedTransaction,
        options: {
          onEvent: options?.onEvent,
          waitUntil: options?.waitUntil,
        }
      });
      await options?.afterCall?.(true, res);
      return res;
    } catch (err: unknown) {
      const e = toError(err);
      await options?.onError?.(e);
      await options?.afterCall?.(false);
      throw e;
    }
  }

  async exportNearKeypairWithUI(nearAccountId: string): Promise<void> {
    return this.router.exportNearKeypairWithUI(nearAccountId);
  }

  // Utility: sign and send in one call via wallet iframe (single before/after)
  async signAndSendTransactions(args: {
    nearAccountId: string;
    transactions: TransactionInput[];
    options?: SignAndSendTransactionHooksOptions;
  }): Promise<ActionResult[]> {
    const options = args.options;
    try {
      const res = await this.router.signAndSendTransactions({
        nearAccountId: args.nearAccountId,
        transactions: args.transactions,
        // Default to sequential execution when executionWait is not provided
        options: {
          onEvent: options?.onEvent,
          executionWait: options?.executionWait ?? { mode: 'sequential', waitUntil: options?.waitUntil }
        }
      });
      await options?.afterCall?.(true, res);
      return res;
    } catch (err: unknown) {
      const e = toError(err);
      await options?.onError?.(e);
      await options?.afterCall?.(false);
      throw e;
    }
  }

  private notifyTheme(t: 'light' | 'dark'): void {
    for (const cb of Array.from(this.themeListeners)) {
      try { cb(t); } catch {}
    }
  }
}
