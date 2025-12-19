/**
 * TatchiPasskeyIframe - Entry Point Layer
 *
 * This is the main API that developers interact with when using the WalletIframe system.
 * It provides the same interface as the regular TatchiPasskey but routes all calls to
 * a secure iframe for enhanced security and WebAuthn compatibility.
 *
 * Key Responsibilities:
 * - Acts as a transparent proxy to the real TatchiPasskey running in the iframe
 * - Maintains API compatibility with the regular TatchiPasskey
 * - Handles hook callbacks (afterCall, onError, onEvent) locally
 * - Avoids app-origin IndexedDB persistence (no silent fallbacks)
 * - Manages theme preferences and user settings synchronization
 * - Bridges progress events from iframe back to developer callbacks
 *
 * Architecture:
 * - Uses WalletIframeRouter for all iframe communication
 * - Maintains local state for immediate synchronous access (theme, config)
 * - Provides NearClient facade that routes calls to iframe when ready
 * - Does not fall back to app-origin persistence when the iframe is unavailable
 */

import { WalletIframeRouter } from './client/router';
import { TatchiPasskey } from '../TatchiPasskey';
import { MinimalNearClient } from '../NearClient';
import type { NearClient, SignedTransaction, AccessKeyList } from '../NearClient';
import type {
  ActionResult,
  GetRecentLoginsResult,
  LoginAndCreateSessionResult,
  LoginSession,
  LoginState,
  RegistrationResult,
  SignDelegateActionResult,
  SignTransactionResult,
  TatchiConfigs,
  TatchiConfigsInput,
} from '../types/tatchi';
import type {
  AccountRecoveryHooksOptions,
  ActionHooksOptions,
  DelegateActionHooksOptions,
  LoginHooksOptions,
  RegistrationHooksOptions,
  SendTransactionHooksOptions,
  SignAndSendTransactionHooksOptions,
  SignNEP413HooksOptions,
  SignTransactionHooksOptions,
} from '../types/sdkSentEvents';

import type { ActionArgs, TransactionInput, TxExecutionStatus } from '../types';
import type { DeviceLinkingQRData, StartDevice2LinkingFlowArgs, StartDevice2LinkingFlowResults, StartDeviceLinkingOptionsDevice2 } from '../types/linkDevice';
import type { ScanAndLinkDeviceOptionsDevice1, LinkDeviceResult } from '../types/linkDevice';
import { EmailRecoveryFlowOptions } from '../TatchiPasskey/emailRecovery';
import type { ConfirmationConfig } from '../types/signer-worker';
import { DEFAULT_CONFIRMATION_CONFIG } from '../types/signer-worker';
import type { SignNEP413MessageParams, SignNEP413MessageResult } from '../TatchiPasskey/signNEP413';
import type { RecoveryResult, PasskeyManagerContext } from '../TatchiPasskey';
import { toError } from '../../utils/errors';
import type { WalletUIRegistry } from './host/iframe-lit-element-registry';
import type { DelegateActionInput } from '../types/delegate';
import { buildConfigsFromEnv } from '../defaultConfigs';
import { configureIndexedDB, type DerivedAddressRecord } from '../IndexedDBManager';


export class TatchiPasskeyIframe {
  readonly configs: TatchiConfigs;
  private router: WalletIframeRouter;
  private fallbackLocal: TatchiPasskey | null = null;
  private lastConfirmationConfig: ConfirmationConfig = DEFAULT_CONFIRMATION_CONFIG;
  private themeListeners: Set<(t: 'light' | 'dark') => void> = new Set();
  private themePollTimer: number | null = null;
  private readonly themePollMs = 1500;

  // Expose a userPreferences shim so API matches TatchiPasskey
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

  constructor(configs: TatchiConfigsInput) {
    this.configs = buildConfigsFromEnv(configs);
    // In iframe-wallet mode, disable app-origin IndexedDB entirely so no SDK tables are created there.
    // Wallet iframe host uses canonical DB names within the wallet origin.
    try { configureIndexedDB({ mode: 'disabled' }); } catch {}

    const walletOrigin = this.configs.iframeWallet?.walletOrigin;
    if (!walletOrigin) {
      throw new Error('[TatchiPasskeyIframe] iframeWallet.walletOrigin is required to enable the wallet iframe. Configure it to a dedicated origin.');
    }

    let parsedWalletOrigin: URL;
    try {
      parsedWalletOrigin = new URL(walletOrigin);
    } catch (err) {
      throw new Error(`[TatchiPasskeyIframe] Invalid iframeWallet.walletOrigin (${walletOrigin}). Provide an absolute URL.`);
    }

    if (typeof window !== 'undefined') {
      const parentOrigin = window.location.origin;
      if (parsedWalletOrigin.origin === parentOrigin) {
        console.warn('[TatchiPasskeyIframe] iframeWallet.walletOrigin matches the host origin. Isolation is reduced; consider serving the wallet from a dedicated origin.');
      }
    }

    this.router = new WalletIframeRouter({
      walletOrigin: parsedWalletOrigin.toString(),
      servicePath: this.configs.iframeWallet?.walletServicePath || '/wallet-service',
      // Lower connect timeout to reduce initial boot-wait window (25% of this).
      // With 3_000ms, boot wait caps at ~750ms; improves sub‑second readiness in dev.
      connectTimeoutMs: 3_000,
      requestTimeoutMs: 60_000,
      theme: this.configs.walletTheme,
      nearRpcUrl: this.configs.nearRpcUrl,
      nearNetwork: this.configs.nearNetwork,
      contractId: this.configs.contractId,
      // relayer: configs.relayer,
      vrfWorkerConfigs: this.configs.vrfWorkerConfigs,
      emailRecoveryContracts: this.configs.emailRecoveryContracts,
      rpIdOverride: this.configs.iframeWallet?.rpIdOverride,
      authenticatorOptions: this.configs.authenticatorOptions,
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

  private async requireRouterReady(): Promise<WalletIframeRouter> {
    if (!this.router.isReady()) {
      await this.initWalletIframe();
    }
    if (!this.router.isReady()) {
      throw new Error('[TatchiPasskeyIframe] Wallet iframe is configured but unavailable.');
    }
    return this.router;
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

  async loginAndCreateSession(nearAccountId: string, options?: LoginHooksOptions): Promise<LoginAndCreateSessionResult> {
    try {
      // Route login request to iframe - similar flow to registerPasskey
      // The iframe will handle WebAuthn authentication and VRF session creation
      const res = await this.router.loginAndCreateSession({
        nearAccountId,
        options: {
          onEvent: options?.onEvent,
          session: options?.session,
          signingSession: options?.signingSession,
        } // Progress events flow back to parent
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

  async logoutAndClearSession(): Promise<void> {
    await this.router.clearVrfSession();
  }

  async getLoginSession(nearAccountId?: string): Promise<LoginSession> {
    if (!this.router.isReady()) {
      const login: LoginState = {
        isLoggedIn: false,
        nearAccountId: null,
        publicKey: null,
        userData: null,
        vrfActive: false,
      } as LoginState;
      return { login, signingSession: null };
    }
    return await this.router.getLoginSession(nearAccountId);
  }

  async signTransactionsWithActions(args: {
    nearAccountId: string;
    transactions: TransactionInput[];
    options?: SignTransactionHooksOptions
  }): Promise<SignTransactionResult[]> {
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

  async signDelegateAction(args: {
    nearAccountId: string;
    delegate: DelegateActionInput;
    options?: DelegateActionHooksOptions;
  }): Promise<SignDelegateActionResult> {
    const options = args.options;
    try {
      await this.requireRouterReady();
      const res = await this.router.signDelegateAction({
        nearAccountId: args.nearAccountId,
        delegate: args.delegate,
        options: { onEvent: options?.onEvent },
      }) as SignDelegateActionResult;
      await options?.afterCall?.(true, res);
      return res;
    } catch (err: unknown) {
      const e = toError(err);
      await args.options?.onError?.(e);
      await args.options?.afterCall?.(false);
      throw e;
    }
  }

  // Local fallback manager is retained only for API parity helpers (NearClient/context).
  private ensureFallbackLocal(): TatchiPasskey {
    if (!this.fallbackLocal) {
      const near = new MinimalNearClient(this.configs.nearRpcUrl);
      this.fallbackLocal = new TatchiPasskey(this.configs, near);
    }
    return this.fallbackLocal;
  }

  getNearClient(): NearClient {
    // The fallback PasskeyManager holds a fully-implemented NearClient (MinimalNearClient).
    // Returning it directly avoids API drift and stays aligned with core behavior.
    return this.ensureFallbackLocal().getNearClient();
  }

  /**
   * Provide a PasskeyManager-like context. For the iframe proxy, this delegates
   * to the local fallback instance which holds concrete WebAuthn/NearClient state.
   */
  getContext(): PasskeyManagerContext {
    return this.ensureFallbackLocal().getContext();
  }

  /**
   * Internal registration with confirmation config override, for parity with
   * the host-side TatchiPasskey. Routes to the wallet iframe router when ready,
   * otherwise falls back to the local manager.
   */
  async registerPasskeyInternal(
    nearAccountId: string,
    options: RegistrationHooksOptions = {},
    confirmationConfigOverride?: ConfirmationConfig
  ): Promise<RegistrationResult> {
    try {
      await this.requireRouterReady();
      const res = await this.router.registerPasskey({
        nearAccountId,
        confirmationConfig: confirmationConfigOverride,
        options: { onEvent: options?.onEvent }
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

  async recoverAccountFlow(args: {
    accountId?: string;
    options?: AccountRecoveryHooksOptions
  }): Promise<RecoveryResult> {
    try {
      await this.requireRouterReady();
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

  async startEmailRecovery(args: {
    accountId: string;
    recoveryEmail: string;
    options?: EmailRecoveryFlowOptions;
  }): Promise<{ mailtoUrl: string; nearPublicKey: string }> {
    try {
      await this.requireRouterReady();
      const res = await this.router.startEmailRecovery({
        accountId: args.accountId,
        recoveryEmail: args.recoveryEmail,
        onEvent: args.options?.onEvent as any,
      });
      await args.options?.afterCall?.(true, undefined as any);
      return res;
    } catch (err: unknown) {
      const e = toError(err);
      await args.options?.onError?.(e);
      await args.options?.afterCall?.(false);
      throw e;
    }
  }

  async finalizeEmailRecovery(args: {
    accountId: string;
    nearPublicKey?: string;
    options?: EmailRecoveryFlowOptions;
  }): Promise<void> {
    try {
      await this.requireRouterReady();
      await this.router.finalizeEmailRecovery({
        accountId: args.accountId,
        nearPublicKey: args.nearPublicKey,
        onEvent: args.options?.onEvent as any,
      });
      await args.options?.afterCall?.(true, undefined as any);
      return;
    } catch (err: unknown) {
      const e = toError(err);
      await args.options?.onError?.(e);
      await args.options?.afterCall?.(false);
      throw e;
    }
  }

  // Device2: Start QR generation + polling inside wallet iframe, return QR to parent
  async startDevice2LinkingFlow({
    ui,
    afterCall,
    onError,
    onEvent,
  }: StartDevice2LinkingFlowArgs): Promise<StartDevice2LinkingFlowResults> {
    try {
      await this.requireRouterReady();
      const res = await this.router.startDevice2LinkingFlow({
        ui: ui,
        onEvent: onEvent
      });
      await afterCall?.(true, res);
      return res
    } catch (err: unknown) {
      const e = toError(err);
      await onError?.(e);
      await afterCall?.(false);
      throw e;
    }
  }

  async stopDevice2LinkingFlow(): Promise<void> {
    try {
      await this.requireRouterReady();
      await this.router.stopDevice2LinkingFlow();
    } catch {}
  }

  // Device1: Link device in the host (AddKey + mapping) using scanned QR payload
  async linkDeviceWithScannedQRData(
    qrData: DeviceLinkingQRData,
    options: ScanAndLinkDeviceOptionsDevice1
  ): Promise<LinkDeviceResult> {
    try {
      await this.requireRouterReady();
      const res = await this.router.linkDeviceWithScannedQRData({
        qrData,
        fundingAmount: options.fundingAmount,
        options: {
          onEvent: options?.onEvent
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
    // In wallet-iframe mode, do not fall back to app-origin persistence.
    try {
      await this.requireRouterReady();
      return await this.router.getRecentLogins();
    } catch {
      return { accountIds: [], lastUsedAccount: null };
    }
  }

  // === Derived addresses ===

  async setDerivedAddress(
    nearAccountId: string,
    args: { contractId: string; path: string; address: string }
  ): Promise<void> {
    await this.router.setDerivedAddress({ nearAccountId, args });
  }

  async getDerivedAddressRecord(
    nearAccountId: string,
    args: { contractId: string; path: string }
  ): Promise<DerivedAddressRecord | null> {
    return await this.router.getDerivedAddressRecord({ nearAccountId, args });
  }

  async getDerivedAddress(
    nearAccountId: string,
    args: { contractId: string; path: string }
  ): Promise<string | null> {
    return await this.router.getDerivedAddress({ nearAccountId, args });
  }

  // === Recovery emails (on-chain list + wallet-origin mapping) ===

  async getRecoveryEmails(nearAccountId: string): Promise<Array<{ hashHex: string; email: string }>> {
    return await this.router.getRecoveryEmails(nearAccountId);
  }

  async setRecoveryEmails(
    nearAccountId: string,
    recoveryEmails: string[],
    options?: ActionHooksOptions
  ): Promise<ActionResult> {
    try {
      const res = await this.router.setRecoveryEmails({ nearAccountId, recoveryEmails, options });
      await options?.afterCall?.(true, res);
      return res;
    } catch (err: unknown) {
      const e = toError(err);
      await options?.onError?.(e);
      await options?.afterCall?.(false);
      throw e;
    }
  }

  async hasPasskeyCredential(nearAccountId: string): Promise<boolean> {
    return this.router.hasPasskeyCredential(nearAccountId);
  }
  async viewAccessKeyList(accountId: string): Promise<AccessKeyList> {
    return this.router.viewAccessKeyList(accountId);
  }
  async deleteDeviceKey(accountId: string, publicKeyToDelete: string, options?: ActionHooksOptions): Promise<ActionResult> {
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
