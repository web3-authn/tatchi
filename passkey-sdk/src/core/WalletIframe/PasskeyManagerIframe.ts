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
  BaseHooksOptions,
  ActionHooksOptions,
  AccountRecoveryHooksOptions,
  GetRecentLoginsResult,
  ActionResult,
  SignAndSendTransactionHooksOptions,
} from '../types/passkeyManager';
import type { ActionArgs, TransactionInput, TxExecutionStatus } from '../types';
import type { DeviceLinkingQRData, StartDevice2LinkingFlowArgs, StartDevice2LinkingFlowResults, StartDeviceLinkingOptionsDevice2 } from '../types/linkDevice';
import type { ScanAndLinkDeviceOptionsDevice1, LinkDeviceResult } from '../types/linkDevice';
import type { ConfirmationConfig } from '../types/signer-worker';
import { DEFAULT_CONFIRMATION_CONFIG } from '../types/signer-worker';
import type { RegistrationHooksOptions, LoginHooksOptions, SendTransactionHooksOptions } from '../types/passkeyManager';
import type { SignNEP413MessageParams, SignNEP413MessageResult } from '../PasskeyManager/signNEP413';
import type { RecoveryResult } from '../PasskeyManager';
import type { WalletUIRegistry } from './host/lit-element-registry';


export class PasskeyManagerIframe {
  readonly configs: PasskeyManagerConfigs;
  private client: WalletIframeRouter;
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
      setConfirmationConfig: (c: ConfirmationConfig) => { try { this.setConfirmationConfig(c); } catch {} },
      getConfirmationConfig: () => this.getConfirmationConfig(),
    };
  }

  constructor(configs: PasskeyManagerConfigs) {
    this.configs = configs;
    this.client = new WalletIframeRouter({
      walletOrigin: configs.iframeWallet?.walletOrigin || '',
      servicePath: configs.iframeWallet?.walletServicePath || '/service',
      connectTimeoutMs: 20000,
      requestTimeoutMs: 30000,
      theme: configs.walletTheme,
      nearRpcUrl: configs.nearRpcUrl,
      nearNetwork: configs.nearNetwork,
      contractId: configs.contractId,
      relayer: configs.relayer,
      vrfWorkerConfigs: configs.vrfWorkerConfigs,
      rpIdOverride: configs.iframeWallet?.rpIdOverride,
      authenticatorOptions: configs.authenticatorOptions,
      uiRegistry: configs.iframeWallet?.uiRegistry as any,
    });
  }

  async initWalletIframe(): Promise<void> {
    await this.client.init();
    try {
      const cfg = await this.client.getConfirmationConfig();
      this.lastConfirmationConfig = {
        ...DEFAULT_CONFIRMATION_CONFIG,
        ...cfg
      } as ConfirmationConfig;
      this.notifyTheme(this.lastConfirmationConfig.theme);
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

  // === Generic Wallet UI registration/mounting ===
  registerWalletUI(types: WalletUIRegistry): void { this.client.registerUiTypes(types); }
  mountWalletUI(params: { key: string; props?: Record<string, unknown>; targetSelector?: string; id?: string }): void {
    this.client.mountUiComponent(params);
  }
  updateWalletUI(id: string, props?: Record<string, unknown>): void {
    this.client.updateUiComponent({ id, props });
  }
  unmountWalletUI(id: string): void { this.client.unmountUiComponent(id); }

  async registerPasskey(nearAccountId: string, options: RegistrationHooksOptions = {}): Promise<RegistrationResult> {
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

  async loginPasskey(nearAccountId: string, options?: LoginHooksOptions): Promise<LoginResult> {
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
        nearAccountId: null,
        publicKey: null,
        userData: null,
        vrfActive: false,
      } as LoginState;
    }
    return this.client.getLoginState(nearAccountId);
  }

  async signTransactionsWithActions(args: {
    nearAccountId: string;
    transactions: TransactionInput[];
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
      try { await args.options?.afterCall?.(true, res); } catch {}
      return res;
    } catch (err: any) {
      try { args.options?.onError?.(err); } catch {}
      try { await args.options?.afterCall?.(false, err); } catch {}
      throw err;
    }
  }

  async signNEP413Message(args: {
    nearAccountId: string;
    params: SignNEP413MessageParams;
    options?: BaseHooksOptions
  }): Promise<SignNEP413MessageResult> {
    try { await args.options?.beforeCall?.(); } catch {}
    try {
      const res = await this.client.signNep413Message({
        nearAccountId: args.nearAccountId,
        message: args.params.message,
        recipient: args.params.recipient,
        state: args.params.state,
        options: { onEvent: args.options?.onEvent }
      });
      try { await args.options?.afterCall?.(true, res); } catch {}
      return res;
    } catch (err: any) {
      try { args.options?.onError?.(err); } catch {}
      try { await args.options?.afterCall?.(false, err); } catch {}
      throw err;
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

  // TODO: refactor NearClient in WalletIframe
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
      async sendTransaction(
        signedTransaction: SignedTransaction,
        waitUntil?: TxExecutionStatus
      ) {
        if (self.client.isReady()) {
          const res = await self.client.sendTransaction({
            signedTransaction,
            options: { waitUntil }
          });
          // Align with NearClient.sendTransaction returning FinalExecutionOutcome shape
          return res;
        }
        return await base.sendTransaction(signedTransaction, waitUntil);
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

  async recoverAccountFlow(args: {
    accountId?: string;
    options?: AccountRecoveryHooksOptions
  }): Promise<RecoveryResult> {
    const options = args.options;
    if (this.client.isReady()) {
      try { await options?.beforeCall?.(); } catch {}
      try {
        const res = await this.client.recoverAccountFlow({
          accountId: args.accountId,
          onEvent: options?.onEvent
        });
        try { await options?.afterCall?.(true, res); } catch {}
        return res;
      } catch (e: any) {
        try { options?.onError?.(e); } catch {}
        try { await options?.afterCall?.(false, e); } catch {}
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
    beforeCall,
    afterCall,
    onError,
    onEvent,
  }: StartDevice2LinkingFlowArgs): Promise<StartDevice2LinkingFlowResults> {
    // If iframe client present, prefer secure host flow; otherwise fallback to local QR generation
    try { await beforeCall?.(); } catch {}
    try {
      if (this.client.isReady()) {
        const res = await this.client.startDevice2LinkingFlow({
          accountId: accountId,
          ui: ui,
          onEvent: onEvent
        });
        try { await afterCall?.(true, res); } catch {}
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
      try { await afterCall?.(true, res); } catch {}
      return res;
    } catch (err: any) {
      try { onError?.(err); } catch {}
      try { await afterCall?.(false, err); } catch {}
      throw err;
    }
  }

  async stopDevice2LinkingFlow(): Promise<void> {
    if (!this.client.isReady()) {
      try { await this.ensureFallbackLocal().stopDevice2LinkingFlow(); } catch {}
      return;
    }
    await this.client.stopDevice2LinkingFlow();
  }

  // Device1: Link device in the host (AddKey + mapping) using scanned QR payload
  async linkDeviceWithScannedQRData(
    qrData: DeviceLinkingQRData,
    options: ScanAndLinkDeviceOptionsDevice1
  ): Promise<LinkDeviceResult> {
    const optsAny = options;
    try { await optsAny?.beforeCall?.(); } catch {}
    try {
      if (this.client.isReady()) {
        const res = await this.client.linkDeviceWithScannedQRData({
          qrData,
          fundingAmount: optsAny.fundingAmount,
          options: {
            onEvent: optsAny?.onEvent
          }
        });
        try { await optsAny?.afterCall?.(true, res); } catch {}
        return res as LinkDeviceResult;
      }
      const res = await this.ensureFallbackLocal().linkDeviceWithScannedQRData(
        qrData,
        options
      );
      try { await optsAny?.afterCall?.(true, res); } catch {}
      return res as LinkDeviceResult;
    } catch (err: any) {
      try { optsAny?.onError?.(err); } catch {}
      try { await optsAny?.afterCall?.(false, err); } catch {}
      throw err;
    }
  }

  // Parity with PasskeyManager API
  setConfirmBehavior(behavior: 'requireClick' | 'autoProceed'): void {
    this.client.setConfirmBehavior(behavior);
  }
  setConfirmationConfig(config: ConfirmationConfig): void {
    // Update local cache synchronously for immediate reads
    this.lastConfirmationConfig = {
      ...DEFAULT_CONFIRMATION_CONFIG,
      ...this.lastConfirmationConfig,
      ...config
    } as ConfirmationConfig;
    this.client.setConfirmationConfig(config);
  }
  setUserTheme(theme: 'dark' | 'light'): void {
    this.lastConfirmationConfig = { ...this.lastConfirmationConfig, theme } as ConfirmationConfig;
    this.client.setTheme(theme);
    this.notifyTheme(theme);
  }
  getConfirmationConfig(): ConfirmationConfig {
    // Synchronous API parity with PasskeyManager
    return this.lastConfirmationConfig;
  }
  async prefetchBlockheight(): Promise<void> {
    await this.client.prefetchBlockheight();
  }
  async getRecentLogins(): Promise<GetRecentLoginsResult> {
    // Avoid readiness race by ensuring the client initializes.
    try { await this.client.init(); } catch {}
    let remote: GetRecentLoginsResult | null = null;
    try {
      remote = await this.client.getRecentLogins();
    } catch (err) {
      // Wallet host may be on older bundle (IDB VersionError). Fallback to local.
      try {
        return await this.ensureFallbackLocal().getRecentLogins();
      } catch {}
      throw err;
    }
    // If wallet-origin has no last user yet (common in first-run dev),
    // fall back to local IndexedDB for lastUsedAccountId so the UI can prefill.
    try {
      if (!remote?.lastUsedAccountId) {
        const local = this.ensureFallbackLocal();
        const loc = await local.getRecentLogins();
        if (loc?.lastUsedAccountId) {
          remote = { accountIds: remote?.accountIds || [], lastUsedAccountId: loc.lastUsedAccountId };
        }
      }
    } catch {}
    return remote as GetRecentLoginsResult;
  }
  async hasPasskeyCredential(nearAccountId: string): Promise<boolean> {
    return this.client.hasPasskeyCredential(nearAccountId);
  }
  async viewAccessKeyList(accountId: string): Promise<AccessKeyList> {
    return this.client.viewAccessKeyList(accountId);
  }
  async deleteDeviceKey(accountId: string, publicKeyToDelete: string, options?: ActionHooksOptions): Promise<import('../types/passkeyManager').ActionResult> {
    try { await options?.beforeCall?.(); } catch {}
    try {
      const res = await this.client.deleteDeviceKey(
        accountId,
        publicKeyToDelete,
        { onEvent: options?.onEvent }
      );
      try { await options?.afterCall?.(true, res); } catch {}
      return res;
    } catch (err: any) {
      try { options?.onError?.(err); } catch {}
      try { await options?.afterCall?.(false, err); } catch {}
      throw err;
    }
  }
  async executeAction(args: {
    nearAccountId: string;
    receiverId: string;
    actionArgs: ActionArgs | ActionArgs[];
    options?: ActionHooksOptions
  }): Promise<ActionResult> {
    // Route via iframe client with PROGRESS bridging
    try { await args.options?.beforeCall?.(); } catch {}
    try {
      const res = await this.client.executeAction({
        nearAccountId: args.nearAccountId,
        receiverId: args.receiverId,
        actionArgs: args.actionArgs,
        options: {
          onEvent: args.options?.onEvent,
          waitUntil: args.options?.waitUntil,
        }
      });
      try { await args.options?.afterCall?.(true, res); } catch {}
      return res;
    } catch (err: any) {
      try { args.options?.onError?.(err); } catch {}
      try { await args.options?.afterCall?.(false, err); } catch {}
      throw err;
    }
  }
  async sendTransaction(args: {
    signedTransaction: SignedTransaction;
    options?: SendTransactionHooksOptions
  }): Promise<ActionResult> {
    // Route via iframe client with PROGRESS bridging
    const options = args.options;
    options?.beforeCall?.();
    try {
      const res = await this.client.sendTransaction({
        signedTransaction: args.signedTransaction,
        options: {
          onEvent: options?.onEvent,
          waitUntil: options?.waitUntil,
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
    transactions: TransactionInput[];
    options?: SignAndSendTransactionHooksOptions;
  }): Promise<ActionResult[]> {
    const options = args.options;
    try { await options?.beforeCall?.(); } catch {}
    try {
      const res = await this.client.signAndSendTransactions({
        nearAccountId: args.nearAccountId,
        transactions: args.transactions,
        // Default to sequential execution unless explicitly disabled
        options: { onEvent: options?.onEvent, executeSequentially: options?.executeSequentially ?? true }
      });
      try { await options?.afterCall?.(true, res); } catch {}
      return res;
    } catch (err: any) {
      try { options?.onError?.(err); } catch {}
      try { await options?.afterCall?.(false, err); } catch {}
      throw err;
    }
  }

  private notifyTheme(t: 'light' | 'dark'): void {
    for (const cb of Array.from(this.themeListeners)) {
      try { cb(t); } catch {}
    }
  }
}
