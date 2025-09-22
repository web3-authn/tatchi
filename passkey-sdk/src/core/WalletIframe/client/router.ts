import {
  type ParentToChildEnvelope,
  type ChildToParentEnvelope,
  type ProgressPayload,
} from '../shared/messages';
import { SignedTransaction } from '../../NearClient';
import { ProgressBus, defaultPhaseHeuristics } from './progress-bus';
import type {
  RegistrationResult,
  LoginResult,
  VerifyAndSignTransactionResult,
  LoginState,
  ActionResult,
  ActionSSEEvent,
  RegistrationSSEEvent,
  LoginSSEvent,
  DeviceLinkingSSEEvent,
  AccountRecoverySSEEvent,
  BeforeCall,
  AfterCall,
  SignAndSendTransactionHooksOptions,
  SendTransactionHooksOptions,
  ActionHooksOptions,
  ExportNearKeypairWithTouchIdResult,
  GetRecentLoginsResult,
} from '../../types/passkeyManager';
import {
  RegistrationPhase,
  LoginPhase,
  ActionPhase,
  DeviceLinkingPhase,
  AccountRecoveryPhase,
} from '../../types/passkeyManager';
import {
  ActionArgs,
  TransactionInput,
  TxExecutionStatus
} from '../../types';
import { IframeTransport } from './IframeTransport';
import { isObject, isPlainSignedTransactionLike, extractBorshBytesFromPlainSignedTx, isBoolean } from '../validation';
import type { WalletUIRegistry } from '../host/lit-element-registry';
import { toError } from '../../../utils/errors';
import {
  DeviceLinkingQRData,
  LinkDeviceResult,
  StartDevice2LinkingFlowArgs,
  StartDevice2LinkingFlowResults,
} from '../../types/linkDevice'
import type { AuthenticatorOptions } from '../../types/authenticatorOptions';
import type { ConfirmationConfig } from '../../types/signer-worker';
import type { AccessKeyList } from '../../NearClient';
import type { SignNEP413MessageResult } from '../../PasskeyManager/signNEP413';
import type { RecoveryResult } from '../../PasskeyManager';

// Simple, framework-agnostic service iframe client.
//
// Responsibilities split:
// - IframeTransport: low-level mount + load + CONNECT/READY handshake (MessagePort)
// - WalletIframeRouter (this): request/response correlation, progress events,
//   overlay display, and high-level wallet RPC helpers

export interface WalletIframeRouterOptions {
  walletOrigin?: string; // e.g., https://wallet.example.com (optional; empty => same-origin srcdoc)
  servicePath?: string; // default '/service'
  connectTimeoutMs?: number; // default 8000
  requestTimeoutMs?: number; // default 20000
  theme?: 'dark' | 'light';
  // Enable verbose client-side logging for debugging
  debug?: boolean;
  // Optional config forwarded to wallet host
  nearRpcUrl?: string;
  nearNetwork?: 'testnet' | 'mainnet';
  contractId?: string;
  relayer?: {
    accountId: string;
    url: string
  };
  vrfWorkerConfigs?: Record<string, unknown>;
  rpIdOverride?: string;
  authenticatorOptions?: AuthenticatorOptions;
  // SDK asset base path for embedded bundles when mounting same‑origin via srcdoc
  // Must serve dist/esm under this base path. Defaults to '/sdk'.
  sdkBasePath?: string;
  // Optional: pre-register UI components in wallet host
  uiRegistry?: Record<string, unknown>;
}

type Pending = {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
  timer: number | undefined;
  onProgress?: (payload: ProgressPayload) => void;
};

type PostResult<T> = {
  ok: boolean,
  result: T
}

export class WalletIframeRouter {
  private opts: Required<WalletIframeRouterOptions>;
  // Low-level transport handling iframe mount + handshake
  private transport: IframeTransport;
  private port: MessagePort | null = null;
  private ready = false;
  // Deduplicate concurrent init() calls and avoid race conditions
  private initInFlight: Promise<void> | null = null;
  private pending = new Map<string, Pending>();
  private reqCounter = 0;
  private readyListeners: Set<() => void> = new Set();
  private activationOverlayVisible = false;
  private vrfStatusListeners: Set<(status: { active: boolean; nearAccountId: string | null; sessionDuration?: number }) => void> = new Set();
  // Coalesce duplicate Device2 start calls (e.g., React StrictMode double-effects)
  private device2StartPromise: Promise<{ qrData: DeviceLinkingQRData; qrCodeDataURL: string }> | null = null;
  private progressBus: ProgressBus;
  private debug = false;

  constructor(options: WalletIframeRouterOptions) {
    this.opts = {
      connectTimeoutMs: 8000,
      requestTimeoutMs: 20000,
      servicePath: '/service',
      sdkBasePath: '/sdk',
      walletOrigin: '',
      ...options,
    } as Required<WalletIframeRouterOptions>;
    this.debug = !!this.opts.debug || !!((globalThis as unknown as { __W3A_DEBUG__?: boolean }).__W3A_DEBUG__);
    // Encapsulate iframe mount + handshake logic in transport
    this.transport = new IframeTransport({
      walletOrigin: this.opts.walletOrigin,
      servicePath: this.opts.servicePath,
      sdkBasePath: this.opts.sdkBasePath,
      connectTimeoutMs: this.opts.connectTimeoutMs,
    });

    // Initialize progress router with overlay control and phase heuristics
    this.progressBus = new ProgressBus(
      {
        show: () => this.showFrameForActivation(),
        hide: () => this.hideFrameForActivation()
      },
      defaultPhaseHeuristics,
      this.debug
        ? (msg: string, data?: Record<string, unknown>) => {
            try { console.debug('[WalletIframeRouter][ProgressBus]', msg, data || {}); } catch {}
          }
        : undefined
    );
  }

  /**
   * Subscribe to service-ready event. Returns an unsubscribe function.
   * If already ready, the listener is invoked on next microtask.
   */
  onReady(listener: () => void): () => void {
    if (this.ready) {
      Promise.resolve().then(() => {
        try { listener(); } catch {}
      });
      return () => {};
    }
    this.readyListeners.add(listener);
    return () => { this.readyListeners.delete(listener); };
  }

  private emitReady(): void {
    if (!this.readyListeners.size) return;
    for (const cb of Array.from(this.readyListeners)) {
      try { cb(); } catch {}
    }
    // Keep listeners registered; callers can unsubscribe if desired.
  }

  /**
   * Initialize the transport and configure the wallet host.
   * Safe to call multiple times; concurrent calls deduplicate via initInFlight.
   */
  async init(): Promise<void> {
    if (this.ready) return;
    if (this.initInFlight) { return this.initInFlight; }
    this.initInFlight = (async () => {
      try { console.debug('[WalletIframeRouter] init: connecting transport'); } catch {}
      this.port = await this.transport.connect();
      this.port.onmessage = (ev) => this.onPortMessage(ev);
      this.port.start?.();
      this.ready = true;
      try { console.debug('[WalletIframeRouter] init: connected, sending PM_SET_CONFIG'); } catch {}
      await this.post({
        type: 'PM_SET_CONFIG',
        payload: {
          theme: this.opts.theme,
          nearRpcUrl: this.opts.nearRpcUrl,
          nearNetwork: this.opts.nearNetwork,
          contractId: this.opts.contractId,
          relayer: this.opts.relayer,
          vrfWorkerConfigs: this.opts.vrfWorkerConfigs,
          rpIdOverride: this.opts.rpIdOverride,
          authenticatorOptions: this.opts.authenticatorOptions,
          uiRegistry: this.opts.uiRegistry,
          // for embedded Lit components
          assetsBaseUrl: (() => {
            try {
              // When wallet runs cross-origin, ensure embedded assets resolve under the wallet origin
              const origin = this.opts.walletOrigin || window.location.origin;
              const base = new URL(this.opts.sdkBasePath, origin).toString();
              return base.endsWith('/') ? base : base + '/';
            } catch {
              // Fallbacks: prefer walletOrigin if available
              if (this.opts.walletOrigin) {
                const o = this.opts.walletOrigin.endsWith('/') ? this.opts.walletOrigin.slice(0, -1) : this.opts.walletOrigin;
                const b = this.opts.sdkBasePath.startsWith('/') ? this.opts.sdkBasePath : '/' + this.opts.sdkBasePath;
                return o + b + '/';
              }
              return '/sdk/';
            }
          })(),
        }
      });
      this.emitReady();
    })();
    try {
      await this.initInFlight;
    } finally {
      this.initInFlight = null;
    }
  }

  isReady(): boolean { return this.ready; }

  // ===== UI registry/window-message helpers (generic mounting) =====
  registerUiTypes(registry: WalletUIRegistry): void {
    const iframe = this.transport.ensureIframeMounted();
    const w = iframe.contentWindow;
    if (!w) return;
    const target = this.opts.walletOrigin ? new URL(this.opts.walletOrigin).origin : '*';
    try { w.postMessage({ type: 'WALLET_UI_REGISTER_TYPES', payload: registry }, target); } catch {}
  }

  mountUiComponent(params: { key: string; props?: Record<string, unknown>; targetSelector?: string; id?: string }): void {
    const iframe = this.transport.ensureIframeMounted();
    const w = iframe.contentWindow;
    if (!w) return;
    const target = this.opts.walletOrigin ? new URL(this.opts.walletOrigin).origin : '*';
    try { w.postMessage({ type: 'WALLET_UI_MOUNT', payload: params }, target); } catch {}
  }

  updateUiComponent(params: { id: string; props?: Record<string, unknown> }): void {
    const iframe = this.transport.ensureIframeMounted();
    const w = iframe.contentWindow;
    if (!w) return;
    const target = this.opts.walletOrigin ? new URL(this.opts.walletOrigin).origin : '*';
    try { w.postMessage({ type: 'WALLET_UI_UPDATE', payload: params }, target); } catch {}
  }

  unmountUiComponent(id: string): void {
    const iframe = this.transport.ensureIframeMounted();
    const w = iframe.contentWindow;
    if (!w) return;
    const target = this.opts.walletOrigin ? new URL(this.opts.walletOrigin).origin : '*';
    try { w.postMessage({ type: 'WALLET_UI_UNMOUNT', payload: { id } }, target); } catch {}
  }

  // ===== Public RPC helpers =====

  // Subscribe to VRF status changes observed by this client
  onVrfStatusChanged(listener: (status: {
    active: boolean;
    nearAccountId: string | null;
    sessionDuration?: number
  }) => void): () => void {
    this.vrfStatusListeners.add(listener);
    return () => { this.vrfStatusListeners.delete(listener); };
  }

  private emitVrfStatusChanged(status: {
    active: boolean;
    nearAccountId: string | null;
    sessionDuration?: number
  }): void {
    for (const cb of Array.from(this.vrfStatusListeners)) {
      try { cb(status); } catch {}
    }
  }

  // ===== PasskeyManager-first RPCs =====

  async signTransactionsWithActions(payload: {
    nearAccountId: string;
    transactions: TransactionInput[];
    options?: {
      onEvent?: (ev: ActionSSEEvent) => void;
      onError?: (error: Error) => void;
      beforeCall?: BeforeCall;
      afterCall?: AfterCall<VerifyAndSignTransactionResult[]>;
    }
  }): Promise<VerifyAndSignTransactionResult[]> {
    // Do not forward non-cloneable functions in options; host emits its own PROGRESS messages
    const res = await this.post<VerifyAndSignTransactionResult>({
      type: 'PM_SIGN_TXS_WITH_ACTIONS',
      payload: {
        nearAccountId: payload.nearAccountId,
        transactions: payload.transactions
      },
      options: { onProgress: this.wrapOnEvent(payload.options?.onEvent, isActionSSEEvent) }
    });
    return normalizeSignedTransactionObject(res.result)
  }

  async registerPasskey(payload: {
    nearAccountId: string;
    options?: {
      onEvent?: (ev: RegistrationSSEEvent) => void
    }
  }): Promise<RegistrationResult> {
    this.showFrameForActivation();
    try {
      const safeOptions = removeFunctionsFromOptions(payload.options);
      const res = await this.post<RegistrationResult>({
        type: 'PM_REGISTER',
        payload: {
          nearAccountId: payload.nearAccountId,
          options: safeOptions
        },
        options: { onProgress: this.wrapOnEvent(payload.options?.onEvent, isRegistrationSSEEvent) }
      });
      const st = await this.getLoginState(payload.nearAccountId);
      this.emitVrfStatusChanged({ active: !!st.vrfActive, nearAccountId: st.nearAccountId, sessionDuration: st.vrfSessionDuration });
      return res?.result;
    } finally {
      this.hideFrameForActivation();
    }
  }

  async loginPasskey(payload: {
    nearAccountId: string;
    options?: {
      onEvent?: (ev: LoginSSEvent) => void
    }
  }): Promise<LoginResult> {
    this.showFrameForActivation();
    try {
      const safeOptions = removeFunctionsFromOptions(payload.options);
      const res = await this.post<LoginResult>({
        type: 'PM_LOGIN',
        payload: {
          nearAccountId: payload.nearAccountId,
          options: safeOptions
        },
        options: { onProgress: this.wrapOnEvent(payload.options?.onEvent, isLoginSSEEvent) }
      });
      const st = await this.getLoginState(payload.nearAccountId);
      this.emitVrfStatusChanged({ active: !!st.vrfActive, nearAccountId: st.nearAccountId, sessionDuration: st.vrfSessionDuration });
      return res?.result;
    } finally {
      this.hideFrameForActivation();
    }
  }

  async getLoginState(nearAccountId?: string): Promise<LoginState> {
    const res = await this.post<LoginState>({
      type: 'PM_GET_LOGIN_STATE',
      payload: nearAccountId ? { nearAccountId } : undefined
    });
    return res.result;
  }

  async checkVrfStatus(): Promise<PostResult<{ active: boolean; nearAccountId: string | null; sessionDuration?: number }>> {
    const st = await this.getLoginState();
    return {
      ok: true,
      result: {
        active: !!st.vrfActive,
        nearAccountId: st.nearAccountId,
        sessionDuration: st.vrfSessionDuration
      }
    };
  }

  async clearVrfSession(): Promise<PostResult<void>> {
    await this.post<void>({ type: 'PM_LOGOUT' });
    this.emitVrfStatusChanged({ active: false, nearAccountId: null });
    return { ok: true, result: undefined };
  }

  async signNep413Message(payload: {
    nearAccountId: string;
    message: string;
    recipient: string;
    state?: string;
    options?: { onEvent?: (ev: ActionSSEEvent) => void }
  }): Promise<SignNEP413MessageResult> {
    const res = await this.post<SignNEP413MessageResult>({
      type: 'PM_SIGN_NEP413',
      payload: {
        nearAccountId: payload.nearAccountId,
        params: {
          message: payload.message,
          recipient: payload.recipient,
          state: payload.state
        }
      },
      options: { onProgress: this.wrapOnEvent(payload.options?.onEvent, isActionSSEEvent) }
    });
    return res.result
  }

  async signTransactionWithKeyPair(payload: {
    signedTransaction: SignedTransaction;
    options?: {
      onEvent?: (ev: ActionSSEEvent) => void
    }
  }): Promise<ActionResult> {
    // Strip non-cloneable functions from options; host emits PROGRESS events
    const { options } = payload;
    const res = await this.post<ActionResult>( {
      type: 'PM_SEND_TRANSACTION',
      payload: {
        signedTransaction: payload.signedTransaction,
        options: options
      },
      options: { onProgress: this.wrapOnEvent(options?.onEvent, isActionSSEEvent) }
    });
    return res.result;
  }

  async executeAction(payload: {
    nearAccountId: string;
    receiverId: string;
    actionArgs: ActionArgs | ActionArgs[];
    options?: ActionHooksOptions
  }): Promise<ActionResult> {
    // Strip non-cloneable functions from options; host emits PROGRESS events
    const { options } = payload;
    const safeOptions = options
      ? { waitUntil: options.waitUntil }
      : undefined;

    const res = await this.post<ActionResult>({
      type: 'PM_EXECUTE_ACTION',
      payload: {
        ...payload,
        options: safeOptions
      },
      options: { onProgress: this.wrapOnEvent(options?.onEvent, isActionSSEEvent) }
    });
    return res.result;
  }

  async setConfirmBehavior(behavior: 'requireClick' | 'autoProceed'): Promise<void> {
    if (!this.ready) {
      try { await this.init(); } catch {}
    }
    let { nearAccountId } = await this.getLoginState();
    await this.post<void>({
      type: 'PM_SET_CONFIRM_BEHAVIOR',
      payload: { behavior, nearAccountId }
    });
  }

  async setConfirmationConfig(config: ConfirmationConfig): Promise<void> {
    if (!this.ready) {
      try { await this.init(); } catch {}
    }
    let { nearAccountId } = await this.getLoginState();
    await this.post<void>({
      type: 'PM_SET_CONFIRMATION_CONFIG',
      payload: { config, nearAccountId }
    });
  }

  async getConfirmationConfig(): Promise<ConfirmationConfig> {
    const res = await this.post<ConfirmationConfig>({ type: 'PM_GET_CONFIRMATION_CONFIG' });
    return res.result
  }

  async setTheme(theme: 'dark' | 'light'): Promise<void> {
    await this.post<void>({ type: 'PM_SET_THEME', payload: { theme } });
  }

  async prefetchBlockheight(): Promise<void> {
    await this.post<void>({ type: 'PM_PREFETCH_BLOCKHEIGHT' } );
  }

  async getRecentLogins(): Promise<GetRecentLoginsResult> {
    const res = await this.post<GetRecentLoginsResult>({ type: 'PM_GET_RECENT_LOGINS' } );
    return res.result;
  }

  // Bridge typed public onEvent callbacks to the transport's onProgress callback.
  // - onEvent: consumer's strongly-typed event handler (e.g., ActionSSEEvent)
  // - isExpectedEvent: runtime type guard that validates a ProgressPayload as that event type
  // Returns an onProgress handler that safely narrows before invoking onEvent.
  private wrapOnEvent<TEvent extends ProgressPayload>(
    onEvent: ((event: TEvent) => void) | undefined,
    isExpectedEvent: (progress: ProgressPayload) => progress is TEvent
  ): ((progress: ProgressPayload) => void) | undefined {
    if (!onEvent) return undefined;
    return (progress: ProgressPayload) => {
      try {
        if (isExpectedEvent(progress)) onEvent(progress);
      } catch {}
    };
  }

  async signAndSendTransactions(payload: {
    nearAccountId: string;
    transactions: TransactionInput[];
    options?: SignAndSendTransactionHooksOptions
  }): Promise<ActionResult[]> {

    const { options } = payload;
    // cannot send objects/functions through postMessage(), clean options first
    const safeOptions = options
      ? {
          waitUntil: options.waitUntil,
          executionWait: options.executionWait
        }
      : undefined;

    const res = await this.post<ActionResult[]>({
      type: 'PM_SIGN_AND_SEND_TXS',
      payload: {
        nearAccountId: payload.nearAccountId,
        transactions: payload.transactions,
        options: safeOptions
      },
      options: { onProgress: this.wrapOnEvent(options?.onEvent, isActionSSEEvent) }
    });
    return res.result;
  }

  async hasPasskeyCredential(nearAccountId: string): Promise<boolean> {
    const res = await this.post<boolean>({
      type: 'PM_HAS_PASSKEY',
      payload: { nearAccountId }
    });
    return !!res?.result;
  }

  async viewAccessKeyList(accountId: string): Promise<AccessKeyList> {
    const res = await this.post<AccessKeyList>({
      type: 'PM_VIEW_ACCESS_KEYS',
      payload: { accountId }
    });
    return res.result
  }

  async deleteDeviceKey(
    accountId: string,
    publicKeyToDelete: string,
    options?: { onEvent?: (ev: ActionSSEEvent) => void }
  ) : Promise<ActionResult> {
    const res = await this.post<ActionResult>({
      type: 'PM_DELETE_DEVICE_KEY',
      payload: {
        accountId,
        publicKeyToDelete
      },
      options: { onProgress: this.wrapOnEvent(options?.onEvent, isActionSSEEvent) }
    });
    return res.result
  }

  async sendTransaction(args: {
    signedTransaction: SignedTransaction;
    options?: SendTransactionHooksOptions;
  }): Promise<ActionResult> {
    // Strip non-cloneable functions from options; host emits PROGRESS events
    const { options } = args;
    const safeOptions = options
      ? { waitUntil: options.waitUntil }
      : undefined;

    const res = await this.post<ActionResult>({
      type: 'PM_SEND_TRANSACTION',
      payload: {
        signedTransaction: args.signedTransaction,
        options: safeOptions
      },
      options: { onProgress: this.wrapOnEvent(options?.onEvent, isActionSSEEvent) }
    });
    return res.result
  }

  async exportNearKeypairWithTouchId(nearAccountId: string): Promise<ExportNearKeypairWithTouchIdResult> {
    const res = await this.post<ExportNearKeypairWithTouchIdResult>({
      type: 'PM_EXPORT_NEAR_KEYPAIR',
      payload: { nearAccountId }
    });
    return res?.result
  }

  async exportNearKeypairWithUI(nearAccountId: string, options?: { variant?: 'drawer' | 'modal'; theme?: 'dark' | 'light' }): Promise<void> {
    // Make the wallet iframe visible while the export viewer is open.
    // Unlike request/response flows, the wallet host renders UI and manages
    // its own lifecycle; it will notify us when to hide via window message.
    this.showFrameForActivation();
    const onUiClosed = (ev: MessageEvent) => {
      try {
        const origin = this.opts.walletOrigin || window.location.origin;
        if (ev.origin !== origin) return;
        const data = ev.data as unknown;
        if (!data || (data as any).type !== 'WALLET_UI_CLOSED') return;
        this.hideFrameForActivation();
        window.removeEventListener('message', onUiClosed);
      } catch {}
    };
    try { window.addEventListener('message', onUiClosed); } catch {}

    await this.post<void>({
      type: 'PM_EXPORT_NEAR_KEYPAIR_UI',
      payload: { nearAccountId, variant: options?.variant, theme: options?.theme },
      // Keep the iframe visible after this request resolves; the wallet host
      // will drive the UI lifecycle and send WALLET_UI_CLOSED when done.
      options: { sticky: true }
    });
  }

  // ===== Account Recovery (single-endpoint flow) =====
  async recoverAccountFlow(payload: {
    accountId?: string;
    onEvent?: (ev: AccountRecoverySSEEvent) => void
  }): Promise<RecoveryResult> {
    const res = await this.post<RecoveryResult>({
      type: 'PM_RECOVER_ACCOUNT_FLOW',
      payload: { accountId: payload.accountId },
      options: {
        onProgress: this.wrapOnEvent(payload.onEvent, isAccountRecoverySSEEvent),
        sticky: true
      }
    });
    return res.result
  }

  // ===== Device Linking (iframe-hosted) =====
  async linkDeviceWithScannedQRData(payload: {
    qrData: DeviceLinkingQRData;
    fundingAmount: string;
    options?: { onEvent?: (ev: DeviceLinkingSSEEvent) => void }
  }): Promise<LinkDeviceResult> {
    // TouchID required within host
    this.showFrameForActivation();
    try {
      const res = await this.post<LinkDeviceResult>({
        type: 'PM_LINK_DEVICE_WITH_SCANNED_QR_DATA',
        payload: {
          qrData: payload.qrData,
          fundingAmount: payload.fundingAmount
        },
        options: {
          onProgress: this.wrapOnEvent(payload.options?.onEvent, isDeviceLinkingSSEEvent)
        }
      });
      return res.result
    } finally {
      this.hideFrameForActivation();
    }
  }

  async startDevice2LinkingFlow(payload?: StartDevice2LinkingFlowArgs): Promise<StartDevice2LinkingFlowResults> {
    if (this.device2StartPromise) {
      return this.device2StartPromise
    }
    const p = this.post<StartDevice2LinkingFlowResults>({
      type: 'PM_START_DEVICE2_LINKING_FLOW',
      payload: {
        accountId: payload?.accountId,
        ui: payload?.ui
      },
      options: {
        onProgress: this.wrapOnEvent(payload?.onEvent, isDeviceLinkingSSEEvent),
        sticky: true
      }
    }).then((res) => res.result)
    .finally(() => { this.device2StartPromise = null; });

    this.device2StartPromise = p;
    return p;
  }

  async stopDevice2LinkingFlow(): Promise<void> {
    await this.post<void>({ type: 'PM_STOP_DEVICE2_LINKING_FLOW' });
    try { this.progressBus.clearAll(); } catch {}
  }

  // ===== Control APIs =====
  async cancelRequest(requestId: string): Promise<void> {
    // Best-effort cancel. Host will attempt to close open modals and mark the request as cancelled.
    await this.post<void>({ type: 'PM_CANCEL', payload: { requestId } });
  }

  async cancelAll(): Promise<void> {
    await this.post<void>({ type: 'PM_CANCEL', payload: {} });
  }

  private onPortMessage(e: MessageEvent<ChildToParentEnvelope>) {
    const msg = e.data as ChildToParentEnvelope;
    const requestId = msg.requestId;
    if (!requestId) return;

    // Bridge PROGRESS events to caller-provided onEvent callback via pending registry
    if (msg.type === 'PROGRESS') {
      const payload = (msg.payload as ProgressPayload);
      // Route via ProgressBus (handles overlay + sticky delivery)
      this.progressBus.dispatch({ requestId: requestId, payload: payload });
      // Refresh timeout for long-running operations whenever progress is received
      const pend = this.pending.get(requestId);
      if (pend) {
        if (pend.timer) window.clearTimeout(pend.timer);
        pend.timer = window.setTimeout(() => {
          this.pending.delete(requestId);
          pend.reject(new Error('Wallet request timeout'));
        }, this.opts.requestTimeoutMs);
      }
      return;
    }

    const pending = this.pending.get(requestId);
    // Hide iframe overlay when a request completes (success or error),
    // unless this request was registered as sticky (UI-managed lifecycle).
    if (!this.progressBus.isSticky(requestId)) {
      this.hideFrameForActivation();
    }
    if (!pending) {
      // Even if no pending exists (e.g., early cancel or pre-resolved),
      // ensure any lingering progress subscriber is removed.
      try {
        if (this.debug) {
          console.debug('[WalletIframeRouter] Non-PROGRESS without pending → hide + unregister', {
            requestId,
            type: (msg as unknown as { type?: unknown })?.type || 'unknown'
          });
        }
      } catch {}
      try { this.progressBus.unregister(requestId); } catch {}
      return;
    }
    this.pending.delete(requestId);
    if (pending.timer) window.clearTimeout(pending.timer);

    if (msg.type === 'ERROR') {
      const err: Error & { code?: string; details?: unknown } = new Error(msg.payload?.message || 'Wallet error');
      err.code = msg.payload?.code;
      err.details = msg.payload?.details;
      // Deliver to pending promise if present
      pending.reject(err);
      // Also notify all progress subscribers for this requestId
      this.progressBus.dispatch({
        requestId: requestId,
        payload: {
          step: 0,
          phase: 'error',
          status: 'error',
          message: msg.payload?.message
        }
      });
      this.progressBus.unregister(requestId);
      return;
    }

    pending.resolve(msg.payload);
    if (!this.progressBus.isSticky(requestId)) {
      this.progressBus.unregister(requestId);
    }
  }

  /**
   * Post a typed envelope over the MessagePort with robust readiness handling.
   * If the port is not ready yet, lazily initializes the transport (awaits init()).
   */
  private async post<T>(
    envelope: Omit<ParentToChildEnvelope, 'requestId'>,
  ): Promise<PostResult<T>> {

    // Lazily initialize the iframe/client if not ready yet
    if (!this.ready || !this.port) {
      await this.init();
    }
    const requestId = `${Date.now()}-${++this.reqCounter}`;
    const full: ParentToChildEnvelope = { ...(envelope as unknown as ParentToChildEnvelope), requestId };
    const { options } = full;

    return new Promise<PostResult<T>>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`Wallet request timeout for ${envelope.type}`));
      }, this.opts.requestTimeoutMs);

      this.pending.set(requestId, {
        resolve: (v) => resolve(v as PostResult<T>),
        reject,
        timer,
        onProgress: options?.onProgress
      });
      // Register progress handler; overlay handled by ProgressBus
      this.progressBus.register({
        requestId: requestId,
        sticky: !!options?.sticky,
        onProgress: (payload: ProgressPayload) => {
          // link ProgressPayloads from WalletIframe, to onEvent calls in parent app
          try {
            options?.onProgress?.(payload);
          } catch {}
        },
      });

      try {
        // Strip non-cloneable fields (functions) from envelope options before posting
        const wireOptions = (options && isObject(options))
          ? (() => {
              const stickyVal = (options as { sticky?: unknown }).sticky;
              return isBoolean(stickyVal) ? { sticky: stickyVal } : undefined;
            })()
          : undefined;
        const serializableFull = wireOptions ? { ...full, options: wireOptions } : { ...full, options: undefined };
        this.port!.postMessage(serializableFull as ParentToChildEnvelope);
      } catch (err) {
        this.pending.delete(requestId);
        window.clearTimeout(timer);
        try { this.progressBus.unregister(requestId); } catch {}
        reject(toError(err));
      }
    });
  }

  // Temporarily show the service iframe to capture user activation
  private showFrameForActivation(): void {
    // Ensure iframe exists so overlay can be applied immediately
    const iframe = this.transport.ensureIframeMounted();
    if (this.activationOverlayVisible) return;
    this.activationOverlayVisible = true;
    try {
      iframe.style.position = 'fixed';
      iframe.style.inset = '0';
      iframe.style.top = '0';
      iframe.style.left = '0';
      // Ensure no visible border interferes with viewport fit
      iframe.style.border = 'none';
      iframe.style.width = '100vw';
      iframe.style.height = '100vh';
      iframe.style.opacity = '1';
      iframe.style.pointerEvents = 'auto';
      // Put iframe one layer below modal card rendered inside (which uses 2147483647).
      // Some browsers cap z-index per stacking context; use a high value and ensure visibility.
      iframe.style.zIndex = '2147483646';
      iframe.setAttribute('aria-hidden', 'false');
      iframe.removeAttribute('tabindex');
      console.debug('[WalletIframeRouter] Activation overlay applied:', {
        rect: iframe.getBoundingClientRect(),
        pointerEvents: iframe.style.pointerEvents,
        zIndex: iframe.style.zIndex,
        opacity: iframe.style.opacity,
      });
    } catch {}
  }

  private hideFrameForActivation(): void {
    const iframe = this.transport.getIframeEl();
    if (!iframe) return;
    if (!this.activationOverlayVisible) return;
    this.activationOverlayVisible = false;
    try {
      iframe.style.width = '0px';
      iframe.style.height = '0px';
      iframe.style.opacity = '0';
      iframe.style.pointerEvents = 'none';
      iframe.style.zIndex = '';
      iframe.setAttribute('aria-hidden', 'true');
      iframe.setAttribute('tabindex', '-1');
    } catch {}
  }

}

// ===== Runtime type guards to safely bridge ProgressPayload → typed SSE events =====
const REGISTRATION_PHASES = new Set<string>(Object.values(RegistrationPhase) as string[]);
const LOGIN_PHASES = new Set<string>(Object.values(LoginPhase) as string[]);
const ACTION_PHASES = new Set<string>(Object.values(ActionPhase) as string[]);
const DEVICE_LINKING_PHASES = new Set<string>(Object.values(DeviceLinkingPhase) as string[]);
const ACCOUNT_RECOVERY_PHASES = new Set<string>(Object.values(AccountRecoveryPhase) as string[]);

function phaseOf(progress: ProgressPayload): string {
  try { return String(progress?.phase || ''); } catch { return ''; }
}

function isRegistrationSSEEvent(progress: ProgressPayload): progress is RegistrationSSEEvent {
  return REGISTRATION_PHASES.has(phaseOf(progress));
}

function isLoginSSEEvent(p: ProgressPayload): p is LoginSSEvent {
  return LOGIN_PHASES.has(phaseOf(p));
}

function isActionSSEEvent(p: ProgressPayload): p is ActionSSEEvent {
  return ACTION_PHASES.has(phaseOf(p));
}

function isDeviceLinkingSSEEvent(p: ProgressPayload): p is DeviceLinkingSSEEvent {
  return DEVICE_LINKING_PHASES.has(phaseOf(p));
}

function isAccountRecoverySSEEvent(p: ProgressPayload): p is AccountRecoverySSEEvent {
  return ACCOUNT_RECOVERY_PHASES.has(phaseOf(p));
}

/**
 * Strips out class functions as they cannot be sent over postMessage to iframe
 */
  function normalizeSignedTransactionObject(result: VerifyAndSignTransactionResult) {
    const arr = Array.isArray(result) ? result : [];
    const normalized = arr.map(entry => {
      if (entry?.signedTransaction) {
        const st = entry.signedTransaction as unknown;
        if (isPlainSignedTransactionLike(st)) {
          entry.signedTransaction = SignedTransaction.fromPlain({
            transaction: (st as { transaction: unknown }).transaction,
            signature: (st as { signature: unknown }).signature,
            borsh_bytes: extractBorshBytesFromPlainSignedTx(st),
          });
        }
      }
      return entry;
    });
    return normalized
  }

/**
 * Strips out functions as they cannot be sent over postMessage to iframe
 */
import { stripFunctionsShallow } from '../validation';

function removeFunctionsFromOptions(options?: object): object | undefined {
  return stripFunctionsShallow(options as Record<string, unknown>);
}
