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
import {
  MinimalNearClient,
  type NearClient,
  type SignedTransaction,
  type AccessKeyList,
} from '../NearClient';
import type {
  PasskeyManagerConfigs,
  RegistrationResult,
  LoginResult,
  BaseHooksOptions,
  RegistrationHooksOptions,
  LoginHooksOptions,
  ActionHooksOptions,
  ActionResult,
  LoginState,
  AccountRecoveryHooksOptions,
  VerifyAndSignTransactionResult,
  SignAndSendTransactionHooksOptions,
  SendTransactionHooksOptions,
  ExportNearKeypairWithTouchIdResult,
  GetRecentLoginsResult,
} from '../types/passkeyManager';
import { ActionPhase, ActionStatus } from '../types/passkeyManager';
import { ConfirmationConfig } from '../types/signer-worker';
import { DEFAULT_AUTHENTICATOR_OPTIONS } from '../types/authenticatorOptions';
import { toAccountId, type AccountId } from '../types/accountIds';
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
  ScanQRCodeFlow,
  type ScanQRCodeFlowOptions,
  type ScanQRCodeFlowEvents,
} from '../../utils/qrScanner';
import {
  signNEP413Message,
  type SignNEP413MessageParams,
  type SignNEP413MessageResult
} from './signNEP413';
import { getOptimalCameraFacingMode } from '@/utils';
import type { UserPreferencesManager } from '../WebAuthnManager/userPreferences';
import { WalletIframeRouter } from '../WalletIframe/client/router';

///////////////////////////////////////
// PASSKEY MANAGER
///////////////////////////////////////

export interface PasskeyManagerContext {
  webAuthnManager: WebAuthnManager;
  nearClient: NearClient;
  configs: PasskeyManagerConfigs;
}

/**
 * Main PasskeyManager class that provides framework-agnostic passkey operations
 * with flexible event-based callbacks for custom UX implementation
 */
export class PasskeyManager {
  private readonly webAuthnManager: WebAuthnManager;
  private readonly nearClient: NearClient;
  readonly configs: PasskeyManagerConfigs;
  private iframeRouter: WalletIframeRouter | null = null;
  // Internal active Device2 flow when running locally (not exposed)
  private activeDeviceLinkFlow: LinkDeviceFlow | null = null;
  private activeAccountRecoveryFlow: AccountRecoveryFlow | null = null;

  constructor(
    configs: PasskeyManagerConfigs,
    nearClient?: NearClient
  ) {
    this.configs = configs;
    // Use provided client or create default one
    this.nearClient = nearClient || new MinimalNearClient(configs.nearRpcUrl);
    this.webAuthnManager = new WebAuthnManager(configs, this.nearClient);
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
   * Initialize the hidden wallet service iframe client (optional).
   * If `walletOrigin` is not provided in configs, this is a no‑op.
   */
  async initWalletIframe(): Promise<void> {
    if (!this.configs.iframeWallet?.walletOrigin) return;
    if (this.iframeRouter) return;
    this.iframeRouter = new WalletIframeRouter({
      walletOrigin: this.configs.iframeWallet?.walletOrigin,
      servicePath: this.configs.iframeWallet?.walletServicePath || '/service',
      connectTimeoutMs: 20000,
      requestTimeoutMs: 30000,
      theme: this.configs.walletTheme,
      nearRpcUrl: this.configs.nearRpcUrl,
      nearNetwork: this.configs.nearNetwork,
      contractId: this.configs.contractId,
      // Ensure relay server config reaches the wallet host for atomic registration
      relayer: this.configs.relayer,
      vrfWorkerConfigs: this.configs.vrfWorkerConfigs,
      rpIdOverride: this.configs.iframeWallet?.rpIdOverride,
    });
    await this.iframeRouter.init();
  }

  /** Get the service iframe client if initialized. */
  getServiceClient(): WalletIframeRouter | null { return this.iframeRouter; }

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
      try { await options?.beforeCall?.(); } catch {}
      try {
        const res = await this.iframeRouter.registerPasskey({ nearAccountId, options: { onEvent: options?.onEvent }});
        try { await options?.afterCall?.(true, res); } catch {}
        return res;
      } catch (err: any) {
        try { options?.onError?.(err); } catch {}
        try { await options?.afterCall?.(false, err); } catch {}
        throw err;
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
      try { await options?.beforeCall?.(); } catch {}
      try {
        const res = await this.iframeRouter.loginPasskey({ nearAccountId, options: { onEvent: options?.onEvent }});
        try { await options?.afterCall?.(true, res); } catch {}
        return res;
      } catch (err: any) {
        try { options?.onError?.(err); } catch {}
        try { await options?.afterCall?.(false, err); } catch {}
        throw err;
      }
    }
    // Initialize current user before login
    await this.webAuthnManager.initializeCurrentUser(toAccountId(nearAccountId), this.nearClient);
    return loginPasskey(this.getContext(), toAccountId(nearAccountId), options);
  }

  /**
   * Logout: Clear VRF session (clear VRF keypair in worker)
   */
  async logoutAndClearVrfSession(): Promise<void> {
    await logoutAndClearVrfSession(this.getContext());
    // Also clear wallet-origin VRF session if service iframe is active
    try {
      if (this.iframeRouter) {
        await this.iframeRouter.clearVrfSession?.();
      }
    } catch {}
  }

  /**
   * Get comprehensive login state information
   * Uses AccountId for core account login state
   */
  async getLoginState(nearAccountId?: string): Promise<LoginState> {
    if (this.iframeRouter) {
      return this.iframeRouter.getLoginState(nearAccountId);
    }
    return getLoginState(this.getContext(), nearAccountId ? toAccountId(nearAccountId) : undefined);
  }

  /**
   * Get check if accountId has a passkey from IndexedDB
   */
  async hasPasskeyCredential(nearAccountId: AccountId): Promise<boolean> {
    if (this.iframeRouter) {
      try { return await this.iframeRouter.hasPasskeyCredential(nearAccountId); }
      catch { /* fall through to local */ }
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
      void this.iframeRouter.setConfirmBehavior(behavior).catch(() => {});
      // Mirror locally so UI reads from preferences stay in sync immediately
      try { this.webAuthnManager.getUserPreferences().setConfirmBehavior(behavior); } catch {}
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
      void this.iframeRouter.setConfirmationConfig(config).catch(() => {});
      // Mirror locally for immediate UI coherence
      try { this.webAuthnManager.getUserPreferences().setConfirmationConfig(config); } catch {}
      return;
    }
    this.webAuthnManager.getUserPreferences().setConfirmationConfig(config);
  }

  setUserTheme(theme: 'dark' | 'light'): void {
    if (this.iframeRouter) {
      // Ensure local UI updates immediately while propagating to wallet host
      try { void this.webAuthnManager.getUserPreferences().setUserTheme(theme); } catch {}
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
    // Callers needing fresh remote value should use PasskeyManagerIframe directly.
    return this.webAuthnManager.getUserPreferences().getConfirmationConfig();
  }

  /**
   * Prefetch latest block height/hash (and nonce if context missing) to reduce
   * perceived latency when the user initiates a signing flow.
   */
  async prefetchBlockheight(): Promise<void> {
    try {
      if (this.iframeRouter) { await this.iframeRouter.prefetchBlockheight(); return; }
      await this.webAuthnManager.getNonceManager().prefetchBlockheight(this.nearClient);
    } catch {}
  }

  async getRecentLogins(): Promise<GetRecentLoginsResult> {
    if (this.iframeRouter) {
      return await this.iframeRouter.getRecentLogins()
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
   * - beforeCall: BeforeCall - Optional before call hooks
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
      try { await args.options?.beforeCall?.(); } catch {}
      try {
        const res = await this.iframeRouter.executeAction({
          nearAccountId: args.nearAccountId,
          receiverId: args.receiverId,
          actionArgs: args.actionArgs,
          options: {
            onEvent: args.options?.onEvent,
            ...({ waitUntil: args.options?.waitUntil })
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
   * - beforeCall: BeforeCall - Optional before call hooks
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
    options = { executeSequentially: true }
  }: {
    nearAccountId: string,
    transactions: TransactionInput[],
    options?: SignAndSendTransactionHooksOptions,
  }): Promise<ActionResult[]> {
    if (this.iframeRouter) {
      await options?.beforeCall?.();
      try {
        const res = await this.iframeRouter.signAndSendTransactions({
          nearAccountId,
          transactions: transactions.map(t => ({ receiverId: t.receiverId, actions: t.actions })),
          options: { onEvent: options?.onEvent, executeSequentially: options?.executeSequentially }
        });
        // Emit completion
        const txIds = (res || []).map(r => r?.transactionId).filter(Boolean).join(', ');
        options?.onEvent?.({ step: 9, phase: ActionPhase.STEP_9_ACTION_COMPLETE, status: ActionStatus.SUCCESS, message: `All transactions sent: ${txIds}` });
        await options?.afterCall?.(true, res);
        return res;
      } catch (err: any) {
        await options?.onError?.(err);
        await options?.afterCall?.(false, err);
        throw err;
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
    options?: ActionHooksOptions
  }): Promise<VerifyAndSignTransactionResult[]> {
    // If a service iframe is initialized, route signing via wallet origin
    if (this.iframeRouter) {
      try { await options?.beforeCall?.(); } catch {}
      try {
        const txs = transactions.map((t) => ({ receiverId: t.receiverId, actions: t.actions }));
        const result = await this.iframeRouter.signTransactionsWithActions({
          nearAccountId, transactions:
          txs,
          options: { onEvent: options?.onEvent }
        });
        const arr: VerifyAndSignTransactionResult[] = Array.isArray(result) ? result : [];
        try { await options?.afterCall?.(true, arr); } catch {}
        return arr;
      } catch (err: any) {
        try { options?.onError?.(err); } catch {}
        try { await options?.afterCall?.(false, err); } catch {}
        throw err;
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
   * console.log('Transaction ID:', result.transaction_outcome?.id);
   * ```
   */
  async sendTransaction({ signedTransaction, options }: {
    signedTransaction: SignedTransaction,
    options?: SendTransactionHooksOptions
  }): Promise<ActionResult> {
    if (this.iframeRouter) {
      try { await options?.beforeCall?.(); } catch {}
      try {
        const res = await this.iframeRouter.sendTransaction({
          signedTransaction,
          options: {
            onEvent: options?.onEvent,
            ...(typeof options?.waitUntil !== 'undefined'
              ? { waitUntil: options?.waitUntil }
              : {})
          }
        });
        try { await options?.afterCall?.(true, res); } catch {}
        options?.onEvent?.({ step: 9, phase: ActionPhase.STEP_9_ACTION_COMPLETE, status: ActionStatus.SUCCESS, message: `Transaction ${res?.transactionId} broadcasted` });
        return res;
      } catch (err: any) {
        try { options?.onError?.(err); } catch {}
        try { await options?.afterCall?.(false, err); } catch {}
        throw err;
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
   * - beforeCall: BeforeCall - Optional before call hooks
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
   *
   * if (result.success) {
   *   console.log('Signature:', result.signature);
   *   console.log('Public key:', result.publicKey);
   * }
   * ```
   */
  async signNEP413Message(args: {
    nearAccountId: string,
    params: SignNEP413MessageParams,
    options?: BaseHooksOptions
  }): Promise<SignNEP413MessageResult> {
    // Route via wallet service if available for stronger isolation
    if (this.iframeRouter) {
      const payload = {
        nearAccountId: args.nearAccountId,
        message: args.params.message,
        recipient: args.params.recipient,
        state: args.params.state,
      };
      try { await args.options?.beforeCall?.(); } catch {}
      const result = await this.iframeRouter.signNep413Message({
        ...payload,
        options: { onEvent: args.options?.onEvent }
      });
      try { await args.options?.afterCall?.(true, result); } catch {}
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
   * Export key pair (both private and public keys)
   * Uses AccountId for consistent PRF salt derivation
   */
  async exportNearKeypairWithTouchId(nearAccountId: string): Promise<ExportNearKeypairWithTouchIdResult> {
    if (this.iframeRouter) {
      return await this.iframeRouter.exportNearKeypairWithTouchId(nearAccountId);
    }
    return await this.webAuthnManager.exportNearKeypairWithTouchId(toAccountId(nearAccountId))
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
    try {
      if (this.configs.iframeWallet?.walletOrigin && !(this.iframeRouter?.isReady?.())) {
        console.warn('[PasskeyManager] recoverAccountFlow running outside wallet origin; expected to run within wallet iframe context.');
      }
    } catch {}
    // Local orchestration using AccountRecoveryFlow for a single-call UX
    await options?.beforeCall?.();
    try {
      const flow = new AccountRecoveryFlow(this.getContext(), options);
      // Phase 1: Discover available accounts
      const discovered = await flow.discover(accountIdInput || '');
      if (!Array.isArray(discovered) || discovered.length === 0) {
        const err = new Error('No recoverable accounts found');
        try { options?.onError?.(err); } catch {}
        await options?.afterCall?.(false, err);
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

    } catch (e: any) {
      try { options?.onError?.(e); } catch {}
      await options?.afterCall?.(false, e);
      throw e;
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
    if (this.iframeRouter) {
      return await this.iframeRouter.startDevice2LinkingFlow({
        accountId: args?.accountId,
        ui: args?.ui,
        onEvent: args?.onEvent
      });
    }
    // Local fallback: keep internal flow reference for cancellation
    try { this.activeDeviceLinkFlow?.cancel(); } catch {}
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
    try { this.activeDeviceLinkFlow?.cancel(); } catch {}
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
  PasskeyManagerConfigs,
  RegistrationHooksOptions,
  RegistrationResult,
  RegistrationSSEEvent,
  LoginHooksOptions,
  LoginResult,
  LoginSSEvent,
  BaseHooksOptions,
  ActionHooksOptions,
  ActionResult,
  EventCallback,
  BeforeCall,
  AfterCall,
} from '../types/passkeyManager';

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

// (No longer re-exporting LinkDeviceFlow; flow is internal only)

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
