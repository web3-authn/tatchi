import { WebAuthnManager } from '../WebAuthnManager';
import { loginPasskey, getLoginState, getRecentLogins, logoutAndClearVrfSession } from './login';
import {
  executeAction,
  signTransactionsWithActions,
  sendTransaction,
  signAndSendTransactions,
} from './actions';
import { AccountRecoveryFlow, type RecoveryResult } from './recoverAccount';
import { registerPasskey } from './registration';
import { registerPasskeyInternal } from './registration';
import {
  MinimalNearClient,
  type NearClient,
  type SignedTransaction,
  type AccessKeyList,
} from '../NearClient';
import type {
  TatchiPasskeyConfigs,
  RegistrationResult,
  LoginResult,
  SignNEP413HooksOptions,
  RegistrationHooksOptions,
  LoginHooksOptions,
  ActionHooksOptions,
  ActionResult,
  LoginState,
  AccountRecoveryHooksOptions,
  VerifyAndSignTransactionResult,
  SignAndSendTransactionHooksOptions,
  SendTransactionHooksOptions,
  SignTransactionHooksOptions,
  GetRecentLoginsResult,
} from '../types/passkeyManager';
import { ActionPhase, ActionStatus } from '../types/passkeyManager';
import { ConfirmationConfig } from '../types/signer-worker';
import { DEFAULT_AUTHENTICATOR_OPTIONS } from '../types/authenticatorOptions';
import { toAccountId, type AccountId } from '../types/accountIds';
import type { DerivedAddressRecord, RecoveryEmailRecord } from '../IndexedDBManager';
import { chainsigAddressManager } from '../ChainsigAddressManager';
import {
  ActionType,
  type ActionArgs,
  type TransactionInput
} from '../types/actions';
import type {
  DeviceLinkingQRData,
  LinkDeviceResult,
  StartDeviceLinkingOptionsDevice2,
  ScanAndLinkDeviceOptionsDevice1,
  StartDevice2LinkingFlowArgs,
  StartDevice2LinkingFlowResults
} from '../types/linkDevice';
import { LinkDeviceFlow } from './linkDevice';
import { linkDeviceWithScannedQRData } from './scanDevice';
import {
  signNEP413Message,
  type SignNEP413MessageParams,
  type SignNEP413MessageResult
} from './signNEP413';
import type { UserPreferencesManager } from '../WebAuthnManager/userPreferences';
import type { WalletIframeRouter } from '../WalletIframe/client/router';
import { __isWalletIframeHostMode } from '../WalletIframe/host-mode';
import { toError } from '../../utils/errors';
import { isOffline, openOfflineExport } from '../OfflineExport';
import {
  prepareRecoveryEmails,
  getLocalRecoveryEmails,
  clearLocalRecoveryEmails,
  EMAIL_RECOVERER_CODE_ACCOUNT_ID,
  ZK_EMAIL_VERIFIER_ACCOUNT_ID,
  EMAIL_DKIM_VERIFIER_ACCOUNT_ID,
  bytesToHex,
} from '../EmailRecovery';
let warnedAboutSameOriginWallet = false;

///////////////////////////////////////
// PASSKEY MANAGER
///////////////////////////////////////

export interface PasskeyManagerContext {
  webAuthnManager: WebAuthnManager;
  nearClient: NearClient;
  configs: TatchiPasskeyConfigs;
}

/**
 * Main TatchiPasskey class that provides framework-agnostic passkey operations
 * with flexible event-based callbacks for custom UX implementation
 */
export class TatchiPasskey {
  private readonly webAuthnManager: WebAuthnManager;
  private readonly nearClient: NearClient;
  readonly configs: TatchiPasskeyConfigs;
  private iframeRouter: WalletIframeRouter | null = null;
  // Internal active Device2 flow when running locally (not exposed)
  private activeDeviceLinkFlow: LinkDeviceFlow | null = null;
  private activeAccountRecoveryFlow: AccountRecoveryFlow | null = null;
  private activeEmailRecoveryFlow: import('./emailRecovery').EmailRecoveryFlow | null = null;

  constructor(
    configs: TatchiPasskeyConfigs,
    nearClient?: NearClient
  ) {
    this.configs = configs;
    // Use provided client or create default one
    this.nearClient = nearClient || new MinimalNearClient(configs.nearRpcUrl);
    this.webAuthnManager = new WebAuthnManager(this.configs, this.nearClient);
    // VRF worker initializes automatically in the constructor
  }

  /**
   * Direct access to user preferences manager for convenience
   * Example: passkeyManager.userPreferences.onThemeChange(cb)
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
    // Warm local critical resources (NonceManager, IndexedDB, workers) regardless of iframe usage
    await this.webAuthnManager.warmCriticalResources(nearAccountId);

    const walletIframeConfig = this.configs.iframeWallet;
    const walletOrigin = walletIframeConfig?.walletOrigin;
    // If no wallet origin configured, we're done after local warm-up
    if (!walletOrigin) {
      // Reflect local login state so callers depending on init() get fresh status
      await this.getLoginState(nearAccountId);
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

    // Initialize iframe router once
    if (!this.iframeRouter) {
      const { WalletIframeRouter } = await import('../WalletIframe/client/router');
      this.iframeRouter = new WalletIframeRouter({
        walletOrigin,
        servicePath: walletIframeConfig?.walletServicePath || '/wallet-service',
        connectTimeoutMs: 20_000, // 20s
        requestTimeoutMs: 60_000, // 60s
        theme: this.configs.walletTheme,
        nearRpcUrl: this.configs.nearRpcUrl,
        nearNetwork: this.configs.nearNetwork,
        contractId: this.configs.contractId,
        nearExplorerUrl: this.configs.nearExplorerUrl,
        // Ensure relay server config reaches the wallet host for atomic registration
        relayer: this.configs.relayer,
        vrfWorkerConfigs: this.configs.vrfWorkerConfigs,
        rpIdOverride: walletIframeConfig?.rpIdOverride,
        // Allow apps/CI to control where embedded bundles are served from
        sdkBasePath: walletIframeConfig?.sdkBasePath,
      });
    }

    await this.iframeRouter.init();
    // Opportunistically warm remote NonceManager and surface initial login state
    try { await this.iframeRouter.prefetchBlockheight(); } catch {}
    await this.getLoginState(nearAccountId);
  }

  /** Get the wallet iframe client if initialized. */
  getWalletIframeClient(): WalletIframeRouter | null {
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
      // Warm local-only resources without touching the iframe
      tasks.push(this.webAuthnManager.warmCriticalResources(nearAccountId));
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
    // Route via wallet iframe when available so WebAuthn ceremony runs inside host
    if (this.iframeRouter) {
      try {
        const res = await this.iframeRouter.registerPasskey({ nearAccountId, options: { onEvent: options?.onEvent }});
        // Mirror wallet-host initialization locally so preferences (theme, confirm config)
        // have a current user context immediately after successful registration.
        if (res?.success) {
          try { await this.webAuthnManager.initializeCurrentUser(toAccountId(nearAccountId), this.nearClient); } catch {}
        }
        // Opportunistically warm resources (non-blocking)
        void (async () => { try { await this.warmCriticalResources(nearAccountId); } catch {} })();
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
    if (this.iframeRouter) {
      try {
        const res = await this.iframeRouter.registerPasskey({
          nearAccountId,
          confirmationConfig: confirmationConfigOverride,
          options: { onEvent: options?.onEvent }
        });
        // Ensure local manager knows the current user
        if (res?.success) {
          try { await this.webAuthnManager.initializeCurrentUser(toAccountId(nearAccountId), this.nearClient); } catch {}
        }
        void (async () => { try { await this.warmCriticalResources(nearAccountId); } catch {} })();
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
   * Login with an existing passkey
   * Uses AccountId for on-chain operations and VRF operations
   */
  async loginPasskey(
    nearAccountId: string,
    options?: LoginHooksOptions
  ): Promise<LoginResult> {
    if (this.iframeRouter) {
      // Keep local preferences in sync
      try { await this.webAuthnManager.initializeCurrentUser(toAccountId(nearAccountId), this.nearClient); } catch {}
      try {
        // Forward serializable options to wallet host, including session config
        const res = await this.iframeRouter.loginPasskey({
          nearAccountId,
          options: {
            onEvent: options?.onEvent,
            // Pass through session so the wallet host calls relay to mint JWT/cookie sessions
            session: options?.session,
          }
        });
        // Best-effort warm-up after successful login (non-blocking)
        void (async () => { try { await this.warmCriticalResources(nearAccountId); } catch {} })();
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
    const res = await loginPasskey(this.getContext(), toAccountId(nearAccountId), options);
    // Best-effort warm-up after successful login (non-blocking)
    try { void this.warmCriticalResources(nearAccountId); } catch {}
    return res;
  }

  /**
   * Logout: Clear VRF session (clear VRF keypair in worker)
   */
  async logoutAndClearVrfSession(): Promise<void> {
    await logoutAndClearVrfSession(this.getContext());
    // Also clear wallet-origin VRF session if service iframe is active
    if (this.iframeRouter) {
      try { await this.iframeRouter.clearVrfSession?.(); } catch {}
    }
  }

  /**
   * Get comprehensive login state information
   * Uses AccountId for core account login state
   */
  async getLoginState(nearAccountId?: string): Promise<LoginState> {
    if (this.iframeRouter) {
      const state = await this.iframeRouter.getLoginState(nearAccountId);
      // Best-effort prefetch of latest block context at wallet origin
      try { await this.iframeRouter.prefetchBlockheight(); } catch {}
      return state;
    }
    return getLoginState(this.getContext(), nearAccountId ? toAccountId(nearAccountId) : undefined);
  }

  /**
   * Get check if accountId has a passkey from IndexedDB
   */
  async hasPasskeyCredential(nearAccountId: AccountId): Promise<boolean> {
    if (this.iframeRouter) {
      return await this.iframeRouter.hasPasskeyCredential(nearAccountId);
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
    if (this.iframeRouter) {
      // Fire and forget; persistence handled in wallet host. Avoid unhandled rejections.
      const router = this.iframeRouter;
      void router.setConfirmBehavior(behavior).catch(() => undefined);
      // Mirror locally so UI reads from preferences stay in sync immediately
      this.webAuthnManager.getUserPreferences().setConfirmBehavior(behavior);
      return;
    }
    this.webAuthnManager.getUserPreferences().setConfirmBehavior(behavior);
  }

  /**
   * Set the unified confirmation configuration
   */
  setConfirmationConfig(config: ConfirmationConfig): void {
    if (this.iframeRouter) {
      // Fire and forget; avoid unhandled rejections in consumers
      const router = this.iframeRouter;
      void router.setConfirmationConfig(config).catch(() => undefined);
      // Mirror locally for immediate UI coherence
      this.webAuthnManager.getUserPreferences().setConfirmationConfig(config);
      return;
    }
    this.webAuthnManager.getUserPreferences().setConfirmationConfig(config);
  }

  setUserTheme(theme: 'dark' | 'light'): void {
    if (this.iframeRouter) {
      // Ensure local UI updates immediately while propagating to wallet host
      void this.webAuthnManager.getUserPreferences().setUserTheme(theme);
      void this.iframeRouter.setTheme(theme);
      return;
    }
    this.webAuthnManager.getUserPreferences().setUserTheme(theme);
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

  /**
   * Prefetch latest block height/hash (and nonce if context missing) to reduce
   * perceived latency when the user initiates a signing flow.
   */
  async prefetchBlockheight(): Promise<void> {
    if (this.iframeRouter) {
      await this.iframeRouter.prefetchBlockheight();
      return;
    }
    try { await this.webAuthnManager.getNonceManager().prefetchBlockheight(this.nearClient); } catch {}
  }

  async getRecentLogins(): Promise<GetRecentLoginsResult> {
    // Ensure wallet iframe client is initialized when iframe mode is configured,
    // so we read recent accounts from the wallet origin's IndexedDB rather than
    // the app origin. This avoids empty lists before initWalletIframe() completes.
    if (this.configs.iframeWallet?.walletOrigin && !this.iframeRouter) {
      try { await this.initWalletIframe(); } catch {}
    }
    if (this.iframeRouter) {
      return await this.iframeRouter.getRecentLogins();
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
   * const result = await passkeyManager.executeAction('alice.near', {
   *   type: ActionType.Transfer,
   *   receiverId: 'bob.near',
   *   amount: '1000000000000000000000000' // 1 NEAR
   * });
   *
   * // Function call with gas and deposit (already available in ActionArgs)
   * const result = await passkeyManager.executeAction('alice.near', {
   *   type: ActionType.FunctionCall,
   *   receiverId: 'contract.near',
   *   methodName: 'set_value',
   *   args: { value: 42 },
   *   gas: '50000000000000', // 50 TGas
   *   deposit: '100000000000000000000000' // 0.1 NEAR
   * });
   *
   * // Batched transaction
   * const result = await passkeyManager.executeAction('alice.near', [
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
    options?: ActionHooksOptions
  }): Promise<ActionResult> {
    // cross-origin iframe mode
    if (this.iframeRouter) {
      try {
        const res = await this.iframeRouter.executeAction({
          nearAccountId: args.nearAccountId,
          receiverId: args.receiverId,
          actionArgs: args.actionArgs,
          options: {
            onEvent: args.options?.onEvent,
            waitUntil: args.options?.waitUntil,
            confirmationConfig: args.options?.confirmationConfig,
          }
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
   * const results = await passkeyManager.signAndSendTransactions('alice.near', {
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
    options = {}
  }: {
    nearAccountId: string,
    transactions: TransactionInput[],
    options?: SignAndSendTransactionHooksOptions,
  }): Promise<ActionResult[]> {

    if (this.iframeRouter) {
      try {
        const res = await this.iframeRouter.signAndSendTransactions({
          nearAccountId,
          transactions: transactions.map(t => ({ receiverId: t.receiverId, actions: t.actions })),
          options: {
            onEvent: options?.onEvent,
            executionWait: options?.executionWait ?? { mode: 'sequential', waitUntil: options?.waitUntil },
            confirmationConfig: options?.confirmationConfig,
          }
        });
        // Emit completion
        const txIds = (res || []).map(r => r?.transactionId).filter(Boolean).join(', ');
        options?.onEvent?.({ step: 9, phase: ActionPhase.STEP_9_ACTION_COMPLETE, status: ActionStatus.SUCCESS, message: `All transactions sent: ${txIds}` });
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
        step: 9,
        phase: ActionPhase.STEP_9_ACTION_COMPLETE,
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
    options = {}
  }: {
    nearAccountId: string;
    receiverId: string;
    actions: ActionArgs[];
    options?: SignAndSendTransactionHooksOptions;
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
   * const signedTransactions = await passkeyManager.signTransactionsWithActions('alice.near', {
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
   * const signedTransactions = await passkeyManager.signTransactionsWithActions('alice.near', {
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
    options?: SignTransactionHooksOptions
  }): Promise<VerifyAndSignTransactionResult[]> {
    // route signing via wallet origin
    if (this.iframeRouter) {
      try {
        const txs = transactions.map((t) => ({ receiverId: t.receiverId, actions: t.actions }));
        const result = await this.iframeRouter.signTransactionsWithActions({
          nearAccountId, transactions:
          txs,
          options: {
            onEvent: options?.onEvent,
            confirmationConfig: options?.confirmationConfig
          }
        });
        const arr: VerifyAndSignTransactionResult[] = Array.isArray(result) ? result : [];
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
   * const signedTransactions = await passkeyManager.signTransactionsWithActions('alice.near', {
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
   * const result = await passkeyManager.sendTransaction(
   *   signedTransactions[0].signedTransaction,
   *   TxExecutionStatus.FINAL
   * );
   * ```
   */
  async sendTransaction({ signedTransaction, options }: {
    signedTransaction: SignedTransaction,
    options?: SendTransactionHooksOptions
  }): Promise<ActionResult> {

    if (this.iframeRouter) {
      try {
        const res = await this.iframeRouter.sendTransaction({
          signedTransaction,
          options: {
            onEvent: options?.onEvent,
            ...(options && ('waitUntil' in options)
              ? { waitUntil: options.waitUntil }
              : {})
          }
        });
        await options?.afterCall?.(true, res);
        options?.onEvent?.({ step: 9, phase: ActionPhase.STEP_9_ACTION_COMPLETE, status: ActionStatus.SUCCESS, message: `Transaction ${res?.transactionId} broadcasted` });
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
        options?.onEvent?.({ step: 9, phase: ActionPhase.STEP_9_ACTION_COMPLETE, status: ActionStatus.SUCCESS, message: `Transaction ${txResult.transactionId} broadcasted` });
        return txResult;
      });
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
   * const result = await passkeyManager.signNEP413Message('alice.near', {
   *   message: 'Hello World',
   *   recipient: 'app.example.com',
   *   state: 'optional-state'
   * });
   * ```
   */
  async signNEP413Message(args: {
    nearAccountId: string,
    params: SignNEP413MessageParams,
    options?: SignNEP413HooksOptions
  }): Promise<SignNEP413MessageResult> {
    // Route via wallet service for isolation
    if (this.iframeRouter) {
      const payload = {
        nearAccountId: args.nearAccountId,
        message: args.params.message,
        recipient: args.params.recipient,
        state: args.params.state,
      };

      const result = await this.iframeRouter.signNep413Message({
        ...payload,
        options: { onEvent: args.options?.onEvent }
      });
      await args.options?.afterCall?.(true, result);
      // Expect wallet to return the same shape as WebAuthnManager.signNEP413Message
      return result as SignNEP413MessageResult;
    }

    return signNEP413Message({
      context: this.getContext(),
      nearAccountId: toAccountId(args.nearAccountId),
      params: args.params,
      options: args.options
    });
  }

  ///////////////////////////////////////
  // === KEY MANAGEMENT ===
  ///////////////////////////////////////

  /**
   * Show Export Private Key UI (secure drawer/modal) without returning the key to caller
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
    await chainsigAddressManager.setDerivedAddress(toAccountId(nearAccountId), args);
  }

  /** Retrieve the full derived address record (or null if not found). */
  async getDerivedAddressRecord(
    nearAccountId: string,
    args: { contractId: string; path: string }
  ): Promise<DerivedAddressRecord | null> {
    return await chainsigAddressManager.getDerivedAddressRecord(toAccountId(nearAccountId), args);
  }

  /** Retrieve only the derived address string for convenience. */
  async getDerivedAddress(
    nearAccountId: string,
    args: { contractId: string; path: string }
  ): Promise<string | null> {
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
    const accountId = toAccountId(nearAccountId);

    // Fetch on-chain recovery email hashes
    let rawHashes: number[][] = [];
    try {
      const code = await this.nearClient.viewCode(accountId);
      const hasContract = !!code && code.byteLength > 0;
      if (!hasContract) return [];

      const hashes = await this.nearClient.view<Record<string, never>, number[][]>({
        account: accountId,
        method: 'get_recovery_emails',
        args: {} as Record<string, never>,
      });

      if (Array.isArray(hashes)) {
        rawHashes = hashes as number[][];
      } else {
        return [];
      }
    } catch (error) {
      console.error('[TatchiPasskey] Failed to fetch on-chain recovery emails', error);
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
    options?: ActionHooksOptions
  ): Promise<ActionResult> {
    const accountId = toAccountId(nearAccountId);

    // Canonicalize, hash, and persist mapping locally (best-effort)
    const { hashes: recoveryEmailHashes } = await prepareRecoveryEmails(accountId, recoveryEmails);

    // Detect whether the per-account EmailRecoverer contract is already deployed:
    // - If code exists on this account, assume recoverer is present and just call set_recovery_emails.
    // - If no code is present, attach the global email-recoverer and call new(...) with emails.
    let hasContract = false;
    try {
      const code = await this.nearClient.viewCode(accountId);
      hasContract = !!code && code.byteLength > 0;
    } catch {
      hasContract = false;
    }

    const actions: ActionArgs[] = hasContract
      ? [
          {
            type: ActionType.UseGlobalContract,
            accountId: EMAIL_RECOVERER_CODE_ACCOUNT_ID,
          },
          {
            type: ActionType.FunctionCall,
            methodName: 'set_recovery_emails',
            args: {
              recovery_emails: recoveryEmailHashes,
            },
            gas: '80000000000000',
            deposit: '0',
          },
        ]
      : [
          {
            type: ActionType.UseGlobalContract,
            accountId: EMAIL_RECOVERER_CODE_ACCOUNT_ID,
          },
          {
            type: ActionType.FunctionCall,
            methodName: 'new',
            args: {
              zk_email_verifier: ZK_EMAIL_VERIFIER_ACCOUNT_ID,
              email_dkim_verifier: EMAIL_DKIM_VERIFIER_ACCOUNT_ID,
              policy: null,
              recovery_emails: recoveryEmailHashes,
            },
            gas: '80000000000000',
            deposit: '0',
          },
        ];

    // Delegate to executeAction so iframe vs same-origin routing is respected.
    return this.executeAction({
      nearAccountId,
      receiverId: nearAccountId,
      actionArgs: actions,
      options,
    });
  }

  /**
   * Clear recovery emails for an account:
   * - Calls set_recovery_emails([]) on the per-account contract.
   * - Clears local IndexedDB mapping for this account.
   */
  async clearRecoveryEmails(
    nearAccountId: string,
    options?: ActionHooksOptions
  ): Promise<ActionResult> {
    const result = await this.executeAction({
      nearAccountId,
      receiverId: nearAccountId,
      actionArgs: {
        type: ActionType.FunctionCall,
        methodName: 'set_recovery_emails',
        args: {
          recovery_emails: [] as number[][],
        },
        gas: '80000000000000',
        deposit: '0',
      },
      options,
    });

    if (result?.success) {
      try {
        await clearLocalRecoveryEmails(toAccountId(nearAccountId));
      } catch (error) {
        console.warn('[TatchiPasskey] Failed to clear local recovery emails', error);
      }
    }

    return result;
  }

  ///////////////////////////////////////
  // === Account Recovery Flow ===
  ///////////////////////////////////////

  /**
   * Creates an AccountRecoveryFlow instance, for step-by-step account recovery UX
   */
  async recoverAccountFlow(args: {
    accountId?: string;
    options?: AccountRecoveryHooksOptions
  }): Promise<RecoveryResult> {

    const accountIdInput = args?.accountId || '';
    const options = args?.options;
    // Ensure wallet iframe is initialized when walletOrigin is configured
    if (this.configs.iframeWallet?.walletOrigin && !this.iframeRouter) {
      try { await this.initWalletIframe(); } catch {}
    }
    // Prefer wallet-origin implementation when available
    if (this.iframeRouter?.isReady?.()) {
      return await this.iframeRouter.recoverAccountFlow({
        accountId: accountIdInput,
        onEvent: options?.onEvent
      });
    }
    // If walletOrigin is configured but iframe is not ready, warn: recovery should run under wallet.*
    if (this.configs.iframeWallet?.walletOrigin && !(this.iframeRouter?.isReady?.())) {
      console.warn('[TatchiPasskey] recoverAccountFlow running outside wallet origin; expected to run within wallet iframe context.');
    }

    // Local orchestration using AccountRecoveryFlow for a single-call UX
    try {
      const flow = new AccountRecoveryFlow(this.getContext(), options);
      // Phase 1: Discover available accounts
      const discovered = await flow.discover(accountIdInput || '');
      if (!Array.isArray(discovered) || discovered.length === 0) {
        const err = new Error('No recoverable accounts found');
        await options?.onError?.(err);
        await options?.afterCall?.(false);
        return { success: false, accountId: accountIdInput || '', publicKey: '', message: err.message, error: err.message };
      }
      // Phase 2: User selects account in UI
      // Select the first account-scope; OS chooser selects the actual credential
      const selected = discovered[0];

      // Phase 3: Execute recovery with secure credential lookup
      const result = await flow.recover({
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

  private getEmailRecoveryFlow(options?: import('./emailRecovery').EmailRecoveryFlowOptions) {
    const { EmailRecoveryFlow } = require('./emailRecovery') as typeof import('./emailRecovery');
    if (!this.activeEmailRecoveryFlow) {
      this.activeEmailRecoveryFlow = new EmailRecoveryFlow(this.getContext(), options);
    } else if (options) {
      this.activeEmailRecoveryFlow.setOptions(options);
    }
    return this.activeEmailRecoveryFlow;
  }

  async startEmailRecovery(args: {
    accountId: string;
    recoveryEmail: string;
    options?: import('./emailRecovery').EmailRecoveryFlowOptions;
  }): Promise<{ mailtoUrl: string; nearPublicKey: string }> {
    const { accountId, recoveryEmail, options } = args;
    if (this.iframeRouter) {
      const res = await this.iframeRouter.startEmailRecovery({
        accountId,
        recoveryEmail,
        onEvent: options?.onEvent as any,
      });
      // Let the host flow own afterCall/onError; avoid double-calling
      return res;
    }
    const flow = this.getEmailRecoveryFlow(options);
    return await flow.start({ accountId, recoveryEmail });
  }

  async finalizeEmailRecovery(args: {
    accountId: string;
    nearPublicKey?: string;
    options?: import('./emailRecovery').EmailRecoveryFlowOptions;
  }): Promise<void> {
    const { accountId, nearPublicKey, options } = args;
    if (this.iframeRouter) {
      await this.iframeRouter.finalizeEmailRecovery({
        accountId,
        nearPublicKey,
        onEvent: options?.onEvent as any,
      });
      // Let the host flow own afterCall/onError; avoid double-calling
      return;
    }
    const flow = this.getEmailRecoveryFlow(options);
    await flow.finalize({ accountId, nearPublicKey });
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
    if (this.iframeRouter) {
      return await this.iframeRouter.startDevice2LinkingFlow({
        accountId: args?.accountId,
        ui: args?.ui,
        onEvent: args?.onEvent
      });
    }
    // Local fallback: keep internal flow reference for cancellation
    this.activeDeviceLinkFlow?.cancel();
    const flow = new LinkDeviceFlow(this.getContext(), {
      onEvent: args?.onEvent,
    });
    this.activeDeviceLinkFlow = flow;
    const { qrData, qrCodeDataURL } = await flow.generateQR(args?.accountId ? toAccountId(args.accountId) : undefined);
    return { qrData, qrCodeDataURL };
  }

  /**
   * Device2: Stops device linking flow inside the iframe host.
   */
  async stopDevice2LinkingFlow(): Promise<void> {
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
    if (this.iframeRouter) {
      const res = await this.iframeRouter.linkDeviceWithScannedQRData({
        qrData,
        fundingAmount: options.fundingAmount,
        options: { onEvent: options.onEvent }
      });
      return res as LinkDeviceResult;
    }
    return linkDeviceWithScannedQRData(this.getContext(), qrData, options);
  }

  /**
   * Delete a device key from an account
   */
  async deleteDeviceKey(
    accountId: string,
    publicKeyToDelete: string,
    options?: ActionHooksOptions
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
  TatchiPasskeyConfigs,
  RegistrationHooksOptions,
  RegistrationResult,
  RegistrationSSEEvent,
  LoginHooksOptions,
  LoginResult,
  LoginSSEvent,
  SignNEP413HooksOptions,
  ActionHooksOptions,
  ActionResult,
  EventCallback,
  AfterCall,
} from '../types/passkeyManager';
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

// Re-export account recovery types and classes
export type {
  RecoveryResult,
  AccountLookupResult,
  PasskeyOption,
  PasskeyOptionWithoutCredential,
  PasskeySelection
} from './recoverAccount';

export {
  AccountRecoveryFlow
} from './recoverAccount';

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
