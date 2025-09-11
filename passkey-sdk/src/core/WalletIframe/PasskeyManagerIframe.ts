import { WalletIframeClient } from './client';
import { PasskeyManager } from '../PasskeyManager';
import { MinimalNearClient } from '../NearClient';
import type { NearClient, SignedTransaction } from '../NearClient';
import type {
  PasskeyManagerConfigs,
  RegistrationResult,
  LoginResult,
  VerifyAndSignTransactionResult,
  LoginState,
  BaseHooksOptions,
  ActionHooksOptions,
  AccountRecoveryHooksOptions,
} from '../types/passkeyManager';
import type { DeviceLinkingQRData, StartDeviceLinkingOptionsDevice2 } from '../types/linkDevice';
import type { ScanAndLinkDeviceOptionsDevice1 } from '../types/linkDevice';
import type { ConfirmationConfig } from '../types/signer-worker';
import { DEFAULT_CONFIRMATION_CONFIG } from '../types/signer-worker';


export class PasskeyManagerIframe {
  readonly configs: PasskeyManagerConfigs;
  private client: WalletIframeClient;
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
        try { cb(this.lastConfirmationConfig.theme); } catch {}
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
      setConfirmBehavior: (b: 'requireClick' | 'autoProceed') => { try { this.setConfirmBehavior(b); } catch {} },
      setConfirmationConfig: (c: Record<string, unknown>) => { try { this.setConfirmationConfig(c); } catch {} },
      getConfirmationConfig: () => this.getConfirmationConfig(),
    };
  }

  constructor(configs: PasskeyManagerConfigs) {
    this.configs = configs;
    this.client = new WalletIframeClient({
      walletOrigin: configs.walletOrigin || '',
      servicePath: configs.walletServicePath || '/service',
      connectTimeoutMs: 20000,
      requestTimeoutMs: 30000,
      theme: configs.walletTheme,
      nearRpcUrl: configs.nearRpcUrl,
      nearNetwork: configs.nearNetwork,
      contractId: configs.contractId,
      relayer: configs.relayer as any,
      vrfWorkerConfigs: configs.vrfWorkerConfigs as any,
      rpIdOverride: configs.rpIdOverride,
      authenticatorOptions: configs.authenticatorOptions,
    });
  }

  async initWalletIframe(): Promise<void> {
    await this.client.init();
    try {
      const cfg = await this.client.getConfirmationConfig();
      if (cfg && typeof cfg === 'object') {
        this.lastConfirmationConfig = { ...DEFAULT_CONFIRMATION_CONFIG, ...(cfg as any) } as ConfirmationConfig;
        this.notifyTheme(this.lastConfirmationConfig.theme);
      }
    } catch {}
  }

  isReady(): boolean { return this.client.isReady(); }

  onReady(cb: () => void): () => void { return this.client.onReady(cb); }

  onVrfStatusChanged(
    cb: (status: {
      active: boolean;
      nearAccountId: string | null;
      sessionDuration?: number;
    }) => void
  ): () => void {
    return this.client.onVrfStatusChanged(cb);
  }

  async registerPasskey(nearAccountId: string, options: any = {}): Promise<RegistrationResult> {
    try { await options?.beforeCall?.(); } catch {}
    try {
      const res = await this.client.registerPasskey({
        nearAccountId,
        options: { onEvent: options?.onEvent }
      });
      try { await options?.afterCall?.(true, res); } catch {}
      return res;
    } catch (err: any) {
      try { options?.onError?.(err); } catch {}
      try { await options?.afterCall?.(false, err); } catch {}
      throw err;
    }
  }

  async loginPasskey(nearAccountId: string, options?: any): Promise<LoginResult> {
    try { await options?.beforeCall?.(); } catch {}
    try {
      const res = await this.client.loginPasskey({ nearAccountId, options: { onEvent: options?.onEvent } });
      try { await options?.afterCall?.(true, res); } catch {}
      return res;
    } catch (err: any) {
      try { options?.onError?.(err); } catch {}
      try { await options?.afterCall?.(false, err); } catch {}
      throw err;
    }
  }

  async logoutAndClearVrfSession(): Promise<void> { await this.client.clearVrfSession(); }

  async getLoginState(nearAccountId?: string): Promise<LoginState> {
    if (!this.client.isReady()) {
      return {
        isLoggedIn: false,
        nearAccountId: null as any,
        publicKey: null,
        userData: null,
        vrfActive: false,
      } as LoginState;
    }
    return this.client.getLoginState(nearAccountId);
  }

  async signTransactionsWithActions(args: {
    nearAccountId: string;
    transactions: { receiverId: string; actions: unknown[] }[];
    options?: ActionHooksOptions
  }): Promise<VerifyAndSignTransactionResult[]> {
    try { await args.options?.beforeCall?.(); } catch {}
    try {
      const res = await this.client.signTransactionsWithActions({
        nearAccountId: args.nearAccountId,
        transactions: args.transactions,
        options: {
          onEvent: args.options?.onEvent
        }
      });
      try { await args.options?.afterCall?.(true, res as any); } catch {}
      return res;
    } catch (err: any) {
      try { args.options?.onError?.(err); } catch {}
      try { await args.options?.afterCall?.(false, err); } catch {}
      throw err;
    }
  }

  async signNEP413Message(args: {
    nearAccountId: string;
    params: any;
    options?: BaseHooksOptions
  }): Promise<any> {
    const res = await this.client.signNep413Message({
      nearAccountId: args.nearAccountId,
      message: args.params.message,
      recipient: args.params.recipient,
      state: args.params.state,
      options: { onEvent: (args.options as any)?.onEvent }
    });
    return res as any;
  }

  // Flows not yet proxied: fall back to local manager with identical APIs
  private ensureFallbackLocal(): PasskeyManager {
    if (!this.fallbackLocal) {
      const near = new MinimalNearClient(this.configs.nearRpcUrl);
      this.fallbackLocal = new PasskeyManager(this.configs, near);
    }
    return this.fallbackLocal;
  }

  // Provide a NearClient facade so hooks that call getNearClient() work with the iframe manager too
  getNearClient(): NearClient {
    const local = this.ensureFallbackLocal();
    const base = local.getNearClient();
    const self = this;
    return {
      // Prefer wallet iframe when ready; otherwise fallback to local NearClient
      async viewAccessKeyList(accountId: string) {
        if (self.client.isReady()) return await self.client.viewAccessKeyList(accountId);
        return await base.viewAccessKeyList(accountId);
      },
      async sendTransaction(signedTransaction: SignedTransaction, waitUntil?: any) {
        if (self.client.isReady()) {
          const res = await self.client.sendTransaction({ signedTransaction, options: { ...(typeof waitUntil !== 'undefined' ? { waitUntil } : {}) } as any });
          // Align with NearClient.sendTransaction returning FinalExecutionOutcome shape
          return (res as any);
        }
        return await (base as any).sendTransaction(signedTransaction, waitUntil);
      },
      // Delegate remaining methods to local NearClient (used rarely in UI layer)
      viewAccessKey: base.viewAccessKey.bind(base),
      viewAccount: base.viewAccount.bind(base),
      viewBlock: base.viewBlock.bind(base),
      query: base.query.bind(base),
      callFunction: base.callFunction.bind(base),
      view: base.view.bind(base),
      getAccessKeys: base.getAccessKeys.bind(base),
    } as NearClient;
  }

  async recoverAccountFlow(args: { accountId?: string; options?: AccountRecoveryHooksOptions }): Promise<any> {
    const options = args.options;
    if (this.client.isReady()) {
      try { await options?.beforeCall?.(); } catch {}
      try {
        const res = await (this.client as any).recoverAccountFlow({ accountId: args.accountId, onEvent: options?.onEvent });
        try { await options?.afterCall?.(true, res); } catch {}
        return res;
      } catch (e: any) {
        try { options?.onError?.(e); } catch {}
        try { await options?.afterCall?.(false, e); } catch {}
        throw e;
      }
    }
    return await this.ensureFallbackLocal().recoverAccountFlow({ accountId: args.accountId, options: args.options } as any);
  }

  // Device2: Start QR generation + polling inside wallet iframe, return QR to parent
  async startDevice2LinkingFlow(args?: { accountId?: string; ui?: 'modal' | 'inline' } & StartDeviceLinkingOptionsDevice2): Promise<{ qrData: DeviceLinkingQRData; qrCodeDataURL: string }> {
    // If iframe client present, prefer secure host flow; otherwise fallback to local QR generation
    if (this.client.isReady()) {
      return (this.client as any).startDevice2LinkingFlow({ accountId: args?.accountId, ui: args?.ui, onEvent: args?.onEvent });
    }
    const { qrData, qrCodeDataURL } = await this.ensureFallbackLocal().startDevice2LinkingFlow({ accountId: args?.accountId, onEvent: args?.onEvent, ensureUserActivation: (args as any)?.ensureUserActivation } as any);
    return { qrData, qrCodeDataURL } as any;
  }

  async stopDevice2LinkingFlow(): Promise<void> {
    if (!this.client.isReady()) {
      try { await this.ensureFallbackLocal().stopDevice2LinkingFlow(); } catch {}
      return;
    }
    await this.client.stopDevice2LinkingFlow();
  }

  // Device1: Link device in the host (AddKey + mapping) using scanned QR payload
  async linkDeviceWithScannedQRData(qrData: DeviceLinkingQRData, options: ScanAndLinkDeviceOptionsDevice1): Promise<any> {
    if (this.client.isReady()) {
      return await this.client.linkDeviceWithScannedQRData({ qrData, fundingAmount: (options as any).fundingAmount, options: { onEvent: (options as any)?.onEvent } });
    }
    return await this.ensureFallbackLocal().linkDeviceWithScannedQRData(qrData, options as any);
  }

  // Parity with PasskeyManager API
  setConfirmBehavior(behavior: 'requireClick' | 'autoProceed'): void {
    this.client.setConfirmBehavior(behavior);
  }
  setConfirmationConfig(config: Record<string, unknown>): void {
    // Update local cache synchronously for immediate reads
    this.lastConfirmationConfig = { ...DEFAULT_CONFIRMATION_CONFIG, ...this.lastConfirmationConfig, ...(config as any) } as ConfirmationConfig;
    this.client.setConfirmationConfig(config);
  }
  setUserTheme(theme: 'dark' | 'light'): void {
    this.lastConfirmationConfig = { ...this.lastConfirmationConfig, theme } as ConfirmationConfig;
    this.client.setTheme(theme);
    this.notifyTheme(theme);
  }
  getConfirmationConfig(): any {
    // Synchronous API parity with PasskeyManager
    return this.lastConfirmationConfig;
  }
  async prefetchBlockheight(): Promise<void> {
    await this.client.prefetchBlockheight();
  }
  async getRecentLogins(): Promise<any> {
    if (!this.client.isReady()) {
      return { accountIds: [], lastUsedAccountId: null };
    }
    return this.client.getRecentLogins();
  }
  async hasPasskeyCredential(nearAccountId: string): Promise<boolean> {
    return this.client.hasPasskeyCredential(nearAccountId);
  }
  async viewAccessKeyList(accountId: string): Promise<any> {
    return this.client.viewAccessKeyList(accountId);
  }
  async deleteDeviceKey(accountId: string, publicKeyToDelete: string, options?: ActionHooksOptions): Promise<any> {
    return this.client.deleteDeviceKey(accountId, publicKeyToDelete, { onEvent: options?.onEvent as any });
  }
  async executeAction(args: {
    nearAccountId: string;
    receiverId: string;
    actionArgs: unknown | unknown[];
    options?: ActionHooksOptions
  }): Promise<any> {
    // Route via iframe client with PROGRESS bridging
    try { await args.options?.beforeCall?.(); } catch {}
    try {
      const res = await this.client.executeAction({
        nearAccountId: args.nearAccountId,
        receiverId: args.receiverId,
        actionArgs: args.actionArgs,
        options: {
          onEvent: args.options?.onEvent,
          ...(typeof args.options?.waitUntil !== 'undefined'
            ? { waitUntil: args.options?.waitUntil }
            : {})
        }
      } as any);
      try { await args.options?.afterCall?.(true, res); } catch {}
      return res;
    } catch (err: any) {
      try { args.options?.onError?.(err); } catch {}
      try { await args.options?.afterCall?.(false, err); } catch {}
      throw err;
    }
  }
  async sendTransaction(args: { signedTransaction: any; options?: Record<string, unknown> }): Promise<any> {
    // Route via iframe client with PROGRESS bridging
    const options: any = args.options || {};
    options?.beforeCall?.();
    try {
      const res = await this.client.sendTransaction({
        signedTransaction: args.signedTransaction,
        options: {
          onEvent: (options as any)?.onEvent,
          ...(typeof options?.waitUntil !== 'undefined'
            ? { waitUntil: options?.waitUntil }
            : {}
          )
        }
      });
      await options?.afterCall?.(true, res);
      return res;
    } catch (err: any) {
      options?.onError?.(err);
      options?.afterCall?.(false, err);
      throw err;
    }
  }

  async exportNearKeypairWithTouchId(nearAccountId: string): Promise<{
    accountId: string;
    privateKey: string;
    publicKey: string
  }> {
    return this.client.exportNearKeypairWithTouchId(nearAccountId);
  }

  // Utility: sign and send in one call via wallet iframe (single before/after)
  async signAndSendTransactions(args: {
    nearAccountId: string;
    transactions: { receiverId: string; actions: unknown[] }[];
    options?: { executeSequentially?: boolean } & ActionHooksOptions;
  }): Promise<any[]> {
    const options: any = args.options || {};
    try { await options?.beforeCall?.(); } catch {}
    try {
      const res = await (this.client as any).signAndSendTransactions({
        nearAccountId: args.nearAccountId,
        transactions: args.transactions,
        options: { onEvent: options?.onEvent, executeSequentially: options?.executeSequentially }
      });
      try { await options?.afterCall?.(true, res as any); } catch {}
      return res as any[];
    } catch (err: any) {
      try { options?.onError?.(err); } catch {}
      try { await options?.afterCall?.(false, err); } catch {}
      throw err;
    }
  }

  // === Theme sync helpers (iframe-host source of truth) ===
  private ensureThemePolling(): void {
    if (this.themePollTimer !== null) return;
    const tick = async () => {
      try {
        const cfg = await this.client.getConfirmationConfig();
        const theme = (cfg as any)?.theme as 'light' | 'dark' | undefined;
        if (theme && theme !== this.lastConfirmationConfig.theme) {
          this.lastConfirmationConfig = { ...DEFAULT_CONFIRMATION_CONFIG, ...(cfg as any) } as ConfirmationConfig;
          this.notifyTheme(theme);
        }
      } catch {}
    };
    this.themePollTimer = window.setInterval(tick, this.themePollMs) as any;
  }

  private maybeStopThemePolling(): void {
    if (this.themeListeners.size === 0 && this.themePollTimer !== null) {
      try { window.clearInterval(this.themePollTimer as any); } catch {}
      this.themePollTimer = null;
    }
  }

  private notifyTheme(t: 'light' | 'dark'): void {
    for (const cb of Array.from(this.themeListeners)) {
      try { cb(t); } catch {}
    }
  }
}
