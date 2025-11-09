/**
 * WalletIframeRouter - Client-Side Communication Layer
 *
 * This is the main communication manager that handles all interaction between
 * the parent application and the wallet iframe. It provides a high-level RPC
 * interface while managing the complex details of iframe communication.
 *
 * Key Responsibilities:
 * - Request/Response Correlation: Tracks pending requests with unique IDs
 * - Progress Event Bridging: Routes progress events from iframe to parent callbacks
 * - Overlay Management: Controls iframe visibility for user activation
 * - Timeout Handling: Manages request timeouts and cleanup
 * - Message Serialization: Strips non-serializable functions from messages
 * - Error Handling: Converts iframe errors to parent-appropriate errors
 *
 * Architecture:
 * - Uses IframeTransport for low-level iframe management
 * - Uses ProgressBus for overlay visibility control
 * - Maintains pending request registry for correlation
 * - Provides typed RPC methods for all PasskeyManager operations
 *
 * Communication Flow:
 * 1. Parent calls RPC method (e.g., registerPasskey)
 * 2. Router creates unique request ID and pending entry
 * 3. Message sent to iframe via MessagePort
 * 4. Progress events bridged back to parent callbacks
 * 5. Final result resolves the pending promise
 * 6. Cleanup removes pending entry and hides overlay
 */

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
  AfterCall,
  SignAndSendTransactionHooksOptions,
  SendTransactionHooksOptions,
  ActionHooksOptions,
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
import OverlayController, { type DOMRectLike } from './overlay-controller';
import { isObject, isPlainSignedTransactionLike, extractBorshBytesFromPlainSignedTx, isBoolean } from '../validation';
import type { WalletUIRegistry } from '../host/iframe-lit-element-registry';
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
  walletOrigin: string; // e.g., https://wallet.example.com
  servicePath?: string; // default '/wallet-service'
  connectTimeoutMs?: number; // default 8000
  requestTimeoutMs?: number; // default 20000
  theme?: 'dark' | 'light';
  // Enable verbose client-side logging for debugging
  debug?: boolean;
  // Test-only/diagnostic options (not part of the public API contract for apps)
  testOptions?: {
    // Optional identity/ownership tags for the iframe instance (useful for tests/tools)
    routerId?: string;
    ownerTag?: string; // e.g., 'app' | 'tests'
    // Lazy mounting: when false, do not auto-connect/mount during init(); connect on first use
    autoMount?: boolean;
  };
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
  // Optional: explorer base URL for TxTree links
  nearExplorerUrl?: string;
}

type Pending = {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
  timer: number | undefined;
  onProgress?: (payload: ProgressPayload) => void;
  onTimeout: () => Error;
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
  private vrfStatusListeners: Set<(status: { active: boolean; nearAccountId: string | null; sessionDuration?: number }) => void> = new Set();
  // Coalesce duplicate Device2 start calls (e.g., React StrictMode double-effects)
  private device2StartPromise: Promise<{ qrData: DeviceLinkingQRData; qrCodeDataURL: string }> | null = null;
  private progressBus: ProgressBus;
  private debug = false;
  private readonly walletOriginUrl: URL;
  private readonly walletOriginOrigin: string;
  private overlay: OverlayController;
  // Force the overlay to remain fullscreen during critical flows (e.g., registration)
  // and ignore anchored rect updates from helper hooks.
  private overlayForceFullscreen = false;
  // Overlay register button window-message bridging (wallet-host UI → parent)
  private readonly registerOverlayResultListeners = new Set<(
    payload: { ok: boolean; result?: RegistrationResult; cancelled?: boolean; error?: string }
  ) => void>();
  private readonly registerOverlaySubmitListeners = new Set<() => void>();
  private windowMsgHandlerBound?: (ev: MessageEvent) => void;

  constructor(options: WalletIframeRouterOptions) {
    if (!options?.walletOrigin) {
      throw new Error('[WalletIframeRouter] walletOrigin is required when using the wallet iframe');
    }

    let parsedOrigin: URL;
    try {
      parsedOrigin = new URL(options.walletOrigin);
    } catch (err) {
      throw new Error(`[WalletIframeRouter] Invalid walletOrigin: ${options.walletOrigin}`);
    }

    if (typeof window !== 'undefined') {
      const parentOrigin = window.location.origin;
      if (parsedOrigin.origin === parentOrigin) {
        console.warn('[WalletIframeRouter] walletOrigin matches the host origin. Isolation safeguards rely on the parent; consider moving the wallet to a dedicated origin.');
      }
    }

    const defaultRouterId = `w3a-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const testOptions = {
      routerId: defaultRouterId,
      ownerTag: undefined as string | undefined,
      autoMount: true,
      ...(options?.testOptions || {}),
    };
    this.opts = {
      connectTimeoutMs: 8000,
      requestTimeoutMs: 20000,
      servicePath: '/wallet-service',
      sdkBasePath: '/sdk',
      testOptions,
      ...options,
    } as Required<WalletIframeRouterOptions>;
    this.walletOriginUrl = parsedOrigin;
    this.walletOriginOrigin = parsedOrigin.origin;
    this.debug = !!this.opts.debug;
    // Encapsulate iframe mount + handshake logic in transport
    this.transport = new IframeTransport({
      walletOrigin: this.opts.walletOrigin,
      servicePath: this.opts.servicePath,
      connectTimeoutMs: this.opts.connectTimeoutMs,
      testOptions: {
        routerId: this.opts.testOptions.routerId,
        ownerTag: this.opts.testOptions.ownerTag,
      },
    });

    // Centralize overlay sizing/visibility
    this.overlay = new OverlayController({ ensureIframe: () => this.transport.ensureIframeMounted() });

    // Initialize progress router with overlay control and phase heuristics
    this.progressBus = new ProgressBus(
      {
        show: () => this.showFrameForActivation(),
        hide: () => this.hideFrameForActivation()
      },
      defaultPhaseHeuristics,
      this.debug
        ? (msg: string, data?: Record<string, unknown>) => {
            console.debug('[WalletIframeRouter][ProgressBus]', msg, data || {});
          }
        : undefined
    );

    // Bridge wallet-host overlay UI messages into router callbacks
    this.windowMsgHandlerBound = (ev: MessageEvent) => {
      try {
        if (ev.origin !== this.walletOriginOrigin) return;
        const data = ev.data as unknown;
        if (!data || typeof data !== 'object') return;
        const type = (data as { type?: unknown }).type;
        if (type === 'REGISTER_BUTTON_SUBMIT') {
          // User clicked the register arrow inside the wallet-anchored UI
          // Force the overlay to fullscreen immediately so the TxConfirmer
          // can mount and capture activation in Safari/iOS/mobile.
          this.overlayForceFullscreen = true;
          this.overlay.setSticky(true);
          this.overlay.showFullscreen();
          for (const cb of Array.from(this.registerOverlaySubmitListeners)) {
            try { cb(); } catch {}
          }
          return;
        }
        if (type === 'REGISTER_BUTTON_RESULT') {
          const payload = (data as { payload?: unknown }).payload as
            | { ok?: boolean; result?: RegistrationResult; cancelled?: boolean; error?: string }
            | undefined;
          const ok = !!payload?.ok;
          for (const cb of Array.from(this.registerOverlayResultListeners)) {
            cb({ ok, result: payload?.result, cancelled: payload?.cancelled, error: payload?.error });
          }
          // Release overlay lock after result
          this.overlayForceFullscreen = false;
          this.overlay.setSticky(false);
          // Progress bus will hide after completion; hide defensively here
          this.hideFrameForActivation();
          if (ok) {
            const acct = payload?.result?.nearAccountId;
            Promise.resolve().then(async () => {
              try {
                const st = await this.getLoginState(acct);
                this.emitVrfStatusChanged({ active: !!st.vrfActive, nearAccountId: st.nearAccountId, sessionDuration: st.vrfSessionDuration });
              } catch {}
            }).catch(() => {});
          }
          return;
        }
      } catch {}
    };
    window.addEventListener('message', this.windowMsgHandlerBound);
  }

  /**
   * Subscribe to service-ready event. Returns an unsubscribe function.
   * If already ready, the listener is invoked on next microtask.
   */
  onReady(listener: () => void): () => void {
    if (this.ready) {
      Promise.resolve().then(() => { listener(); });
      return () => {};
    }
    this.readyListeners.add(listener);
    return () => { this.readyListeners.delete(listener); };
  }

  private emitReady(): void {
    if (!this.readyListeners.size) return;
    for (const cb of Array.from(this.readyListeners)) { cb(); }
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
      // Respect autoMount=false by deferring connect until first use
      if (this.opts.testOptions.autoMount !== false) {
        this.port = await this.transport.connect();
        this.port.onmessage = (ev) => this.onPortMessage(ev);
        this.port.start?.();
        this.ready = true;
      }
      console.debug('[WalletIframeRouter] init: %s', this.ready ? 'connected' : 'deferred (autoMount=false)');
      await this.post({
        type: 'PM_SET_CONFIG',
        payload: {
          theme: this.opts.theme,
          nearRpcUrl: this.opts.nearRpcUrl,
          nearNetwork: this.opts.nearNetwork,
          // Align with PMSetConfigPayload which expects `contractId`
          // while keeping RouterOptions field name `contractId` for external API.
          contractId: this.opts.contractId,
          nearExplorerUrl: this.opts.nearExplorerUrl,
          relayer: this.opts.relayer,
          vrfWorkerConfigs: this.opts.vrfWorkerConfigs,
          rpIdOverride: this.opts.rpIdOverride,
          authenticatorOptions: this.opts.authenticatorOptions,
          uiRegistry: this.opts.uiRegistry,
          // for embedded Lit components
          assetsBaseUrl: (() => {
            try {
              const base = new URL(this.opts.sdkBasePath, this.walletOriginUrl).toString();
              return base.endsWith('/') ? base : `${base}/`;
            } catch {
              const fallback = new URL('/sdk/', this.walletOriginUrl).toString();
              return fallback.endsWith('/') ? fallback : `${fallback}/`;
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
    const target = this.walletOriginOrigin;
    this.postWindowMessage(w, { type: 'WALLET_UI_REGISTER_TYPES', payload: registry }, target);
  }

  mountUiComponent(params: { key: string; props?: Record<string, unknown>; targetSelector?: string; id?: string }): void {
    const iframe = this.transport.ensureIframeMounted();
    const w = iframe.contentWindow;
    if (!w) return;
    const target = this.walletOriginOrigin;
    this.postWindowMessage(w, { type: 'WALLET_UI_MOUNT', payload: params }, target);
  }

  updateUiComponent(params: { id: string; props?: Record<string, unknown> }): void {
    const iframe = this.transport.ensureIframeMounted();
    const w = iframe.contentWindow;
    if (!w) return;
    const target = this.walletOriginOrigin;
    this.postWindowMessage(w, { type: 'WALLET_UI_UPDATE', payload: params }, target);
  }

  unmountUiComponent(id: string): void {
    const iframe = this.transport.ensureIframeMounted();
    const w = iframe.contentWindow;
    if (!w) return;
    const target = this.walletOriginOrigin;
    this.postWindowMessage(w, { type: 'WALLET_UI_UNMOUNT', payload: { id } }, target);
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

  // Overlay register button events (optional convenience API)
  onRegisterOverlayResult(listener: (payload: { ok: boolean; result?: RegistrationResult; cancelled?: boolean; error?: string }) => void): () => void {
    this.registerOverlayResultListeners.add(listener);
    return () => { this.registerOverlayResultListeners.delete(listener); };
  }

  onRegisterOverlaySubmit(listener: () => void): () => void {
    this.registerOverlaySubmitListeners.add(listener);
    return () => { this.registerOverlaySubmitListeners.delete(listener); };
  }

  // ===== PasskeyManager-first RPCs =====

  async signTransactionsWithActions(payload: {
    nearAccountId: string;
    transactions: TransactionInput[];
    options?: {
      onEvent?: (ev: ActionSSEEvent) => void;
      onError?: (error: Error) => void;
      afterCall?: AfterCall<VerifyAndSignTransactionResult[]>;
      // Allow minimal overrides (e.g., { uiMode: 'drawer' })
      confirmationConfig?: Partial<ConfirmationConfig>;
    }
  }): Promise<VerifyAndSignTransactionResult[]> {
    // Do not forward non-cloneable functions in options; host emits its own PROGRESS messages
    const res = await this.post<VerifyAndSignTransactionResult>({
      type: 'PM_SIGN_TXS_WITH_ACTIONS',
      payload: {
        nearAccountId: payload.nearAccountId,
        transactions: payload.transactions,
        options: payload.options?.confirmationConfig
          ? { confirmationConfig: payload.options.confirmationConfig as unknown as Record<string, unknown> }
          : undefined
      },
      options: { onProgress: this.wrapOnEvent(payload.options?.onEvent, isActionSSEEvent) }
    });
    return normalizeSignedTransactionObject(res.result)
  }

  async registerPasskey(payload: {
    nearAccountId: string;
    confirmationConfig?: ConfirmationConfig;
    options?: {
      onEvent?: (ev: RegistrationSSEEvent) => void
    }
  }): Promise<RegistrationResult> {
    // Step 1: For registration, force fullscreen overlay (not anchored to CTA)
    // so the TxConfirmer (drawer/modal) has space to render and capture activation.
    // Lock overlay to fullscreen for the duration of registration
    this.overlayForceFullscreen = true;
    this.overlay.setSticky(true);
    this.overlay.showFullscreen();

    try {
      // Optional one-time confirmation override (non-persistent)
      if (payload.confirmationConfig) {
        try { await this.setConfirmationConfig(payload.confirmationConfig); } catch {}
      }

      // Step 2: Strip non-serializable functions from options (functions can't cross iframe boundary)
      const safeOptions = removeFunctionsFromOptions(payload.options);

      // Step 3: Send PM_REGISTER message to iframe and wait for response
      const res = await this.post<RegistrationResult>({
        type: 'PM_REGISTER',
        payload: {
          nearAccountId: payload.nearAccountId,
          options: safeOptions,
          ...(payload.confirmationConfig ? { confirmationConfig: payload.confirmationConfig as unknown as Record<string, unknown> } : {})
        },
        // Bridge progress events from iframe back to parent callback
        options: { onProgress: this.wrapOnEvent(payload.options?.onEvent, isRegistrationSSEEvent) }
      });

      // Step 4: Update VRF status after successful registration
      const st = await this.getLoginState(payload.nearAccountId);
      this.emitVrfStatusChanged({
        active: !!st.vrfActive,
        nearAccountId: st.nearAccountId,
        sessionDuration: st.vrfSessionDuration
      });

      return res?.result;
    } finally {
      // Step 5: Always release overlay lock and hide when done (success or error)
      this.overlayForceFullscreen = false;
      this.overlay.setSticky(false);
      this.hideFrameForActivation();
    }
  }

  async loginPasskey(payload: {
    nearAccountId: string;
    options?: {
      onEvent?: (ev: LoginSSEvent) => void;
      // Forward session config so host can mint JWT/cookie
      session?: {
        kind: 'jwt' | 'cookie';
        relayUrl?: string;
        route?: string;
      };
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
      ? {
          waitUntil: options.waitUntil,
          confirmationConfig: options.confirmationConfig,
        }
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
    let { nearAccountId } = await this.getLoginState();
    await this.post<void>({
      type: 'PM_SET_CONFIRM_BEHAVIOR',
      payload: { behavior, nearAccountId }
    });
  }

  async setConfirmationConfig(config: ConfirmationConfig): Promise<void> {
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
          executionWait: options.executionWait,
          confirmationConfig: options.confirmationConfig,
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

  async exportNearKeypairWithUI(nearAccountId: string, options?: { variant?: 'drawer' | 'modal'; theme?: 'dark' | 'light' }): Promise<void> {
    // Make the wallet iframe visible while the export viewer is open.
    // Unlike request/response flows, the wallet host renders UI and manages
    // its own lifecycle; it will notify us when to hide via window message.
    this.showFrameForActivation();
    const onUiClosed = (ev: MessageEvent) => {
      const origin = this.opts.walletOrigin || window.location.origin;
      if (ev.origin !== origin) return;
      const data = ev.data as unknown;
      if (!data || (data as any).type !== 'WALLET_UI_CLOSED') return;
      this.overlay.setSticky(false);
      this.hideFrameForActivation();
      window.removeEventListener('message', onUiClosed);
    };
    window.addEventListener('message', onUiClosed);

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
        onProgress: this.wrapOnEvent(payload.onEvent, isAccountRecoverySSEEvent)
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
    this.progressBus.clearAll();
  }

  // ===== Control APIs =====
  async cancelRequest(requestId: string): Promise<void> {
    // Best-effort cancel. Host will attempt to close open modals and mark the request as cancelled.
    await this.post<void>({ type: 'PM_CANCEL', payload: { requestId } }).catch(() => {});
    // Always clear local progress + hide overlay even if the host didn't receive the message
    this.progressBus.unregister(requestId);
    this.hideFrameForActivation();
  }

  async cancelAll(): Promise<void> {
    // Try to cancel all requests on the host, but don't depend on READY/port availability
    await this.post<void>({ type: 'PM_CANCEL', payload: {} }).catch(() => {});
    // Clear all local progress listeners and force-hide the overlay
    this.progressBus.clearAll();
    this.hideFrameForActivation();
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
          const err = pend.onTimeout();
          pend.reject(err);
        }, this.opts.requestTimeoutMs);
      }
      return;
    }

    const pending = this.pending.get(requestId);
    // Hide overlay on completion only if no other requests still need it,
    // and this request wasn't marked sticky (UI-managed lifecycle).
    if (!this.progressBus.isSticky(requestId)) {
      if (!this.progressBus.wantsVisible()) {
        this.hideFrameForActivation();
      }
    }
    if (!pending) {
      // Even if no pending exists (e.g., early cancel or pre-resolved),
      // ensure any lingering progress subscriber is removed.
      if (this.debug) {
        console.debug('[WalletIframeRouter] Non-PROGRESS without pending → hide + unregister', {
          requestId,
          type: (msg as unknown as { type?: unknown })?.type || 'unknown'
        });
      }
      this.progressBus.unregister(requestId);
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
   * This is the core method that handles all communication with the iframe.
   *
   * Flow:
   * 1. Ensure iframe is ready (lazy initialization)
   * 2. Generate unique request ID for correlation
   * 3. Set up timeout and progress handling
   * 4. Send message to iframe via MessagePort
   * 5. Wait for response (PM_RESULT or ERROR)
   * 6. Clean up on completion or timeout
   */
  private async post<T>(
    envelope: Omit<ParentToChildEnvelope, 'requestId'>,
  ): Promise<PostResult<T>> {

    // Step 1: Lazily initialize the iframe/client if not ready yet
    if (!this.ready || !this.port) {
      await this.init();
    }

    // Step 2: Generate unique request ID for correlation
    const requestId = `${Date.now()}-${++this.reqCounter}`;
    const full: ParentToChildEnvelope = { ...(envelope as ParentToChildEnvelope), requestId };
    const { options } = full;

    return new Promise<PostResult<T>>((resolve, reject) => {
      const onTimeout = () => {
        const pending = this.pending.get(requestId);
        if (pending?.timer !== undefined) window.clearTimeout(pending.timer);
        this.pending.delete(requestId);
        this.progressBus.unregister(requestId);
        this.overlay.setSticky(false);
        if (!this.progressBus.wantsVisible()) {
          this.hideFrameForActivation();
        }
      this.sendBestEffortCancel(requestId);
      return new Error(`Wallet request timeout for ${envelope.type}`);
      };

      // Step 3: Set up timeout handler for request
      const timer = window.setTimeout(() => {
        const err = onTimeout();
        reject(err);
      }, this.opts.requestTimeoutMs);

      // Step 4: Register pending request for correlation
      this.pending.set(requestId, {
        resolve: (v) => resolve(v as PostResult<T>),
        reject,
        timer,
        onProgress: options?.onProgress,
        onTimeout,
      });

      // Step 5: Register progress handler for real-time updates
      this.progressBus.register({
        requestId: requestId,
        sticky: !!options?.sticky, // Some flows need to persist after completion
        onProgress: (payload: ProgressPayload) => {
          // Bridge progress events from iframe back to parent callback
          try {
            options?.onProgress?.(payload);
          } catch {}
        },
      });

      try {
        // Step 6: Strip non-cloneable fields (functions) from envelope options before posting
        const wireOptions = (options && isObject(options))
          ? (() => {
              const stickyVal = (options as { sticky?: unknown }).sticky;
              return isBoolean(stickyVal) ? { sticky: stickyVal } : undefined;
            })()
          : undefined;
        const serializableFull = wireOptions ? { ...full, options: wireOptions } : { ...full, options: undefined };

        // Align overlay stickiness with request options (phase 2 will use intents)
        this.overlay.setSticky(!!(wireOptions && (wireOptions as { sticky?: boolean }).sticky));

        // Step 7: Apply overlay intent (conservative) if not already visible, then post
        if (!this.overlay.getState().visible) {
          const intent = this.computeOverlayIntent(serializableFull.type);
          if (intent.mode === 'fullscreen') {
            this.overlay.setSticky(!!(wireOptions && (wireOptions as { sticky?: boolean }).sticky));
            this.overlay.showFullscreen();
          }
        }

        // Send message to iframe via MessagePort
        this.port!.postMessage(serializableFull as ParentToChildEnvelope);
      } catch (err) {
        // Step 8: Handle send errors - clean up and reject
        this.pending.delete(requestId);
        window.clearTimeout(timer);
        this.progressBus.unregister(requestId);
        reject(toError(err));
      }
    });
  }

  /**
   * computeOverlayIntent - Preflight "Show" Decision
   *
   * This method makes the initial decision about whether to show the overlay
   * BEFORE sending the request to the iframe. It's a conservative preflight
   * check that ensures the iframe is visible in time for user activation.
   *
   * Key Responsibilities:
   * - Preflight Decision: Determines overlay visibility before request is sent
   * - User Activation Timing: Ensures iframe is visible when WebAuthn prompts appear
   * - Conservative Approach: Only shows overlay if not already visible
   * - Request Type Mapping: Maps message types to overlay requirements
   *
   * How it differs from other components:
   *
   * vs ProgressBus (lifecycle and close decision):
   * - computeOverlayIntent: "SHOW" decision - runs before sending request
   * - ProgressBus: "CLOSE" decision - runs during operation lifecycle
   * - ProgressBus drives ongoing UI phases and manages sticky behavior
   * - ProgressBus handles PM_RESULT/ERROR and decides when to hide overlay
   *
   * vs OverlayController (single executor):
   * - computeOverlayIntent: DECIDES what to do (show/hide decision logic)
   * - OverlayController: EXECUTES the decision (actual CSS manipulation)
   * - OverlayController receives commands from both intent and ProgressBus
   * - OverlayController keeps all style mutations in one place
   *
   * Architecture Flow:
   * 1. computeOverlayIntent() → decides to show overlay
   * 2. OverlayController.showFullscreen() → executes the decision
   * 3. Request sent to iframe → operation begins
   * 4. ProgressBus manages lifecycle → handles progress events
   * 5. ProgressBus decides to hide → when operation completes
   * 6. OverlayController.hide() → executes the hide decision
   *
   * Special Cases:
   * - Anchored flows (UI registry with viewportRect) are message-driven
   * - Parent sets bounds and sticky via registry messages
   * - computeOverlayIntent returns 'hidden' for these (don't pre-show)
   * - Some legacy paths still call showFrameForActivation() directly
   *
   * Future Evolution:
   * - If host always emits early PROGRESS for a type, this can be reduced
   * - Intent is to move toward ProgressBus-driven lifecycle management
   * - This provides predictable, glitch-free activation without hardcoding
   */
  private computeOverlayIntent(type: ParentToChildEnvelope['type']): { mode: 'hidden' | 'fullscreen' } {
    switch (type) {
      // Operations that require fullscreen overlay for WebAuthn activation
      case 'PM_EXPORT_NEAR_KEYPAIR_UI':
      case 'PM_REGISTER':
      case 'PM_LOGIN':
      case 'PM_LINK_DEVICE_WITH_SCANNED_QR_DATA':
      case 'PM_SIGN_AND_SEND_TXS':
      case 'PM_EXECUTE_ACTION':
      case 'PM_SEND_TRANSACTION':
      case 'PM_SIGN_TXS_WITH_ACTIONS':
        return { mode: 'fullscreen' };

      // All other operations (background/read-only) don't need overlay
      default:
        return { mode: 'hidden' };
    }
  }

  // Temporarily show the service iframe to capture user activation
  private showFrameForActivation(): void {
    // Ensure iframe exists so overlay can be applied immediately
    this.transport.ensureIframeMounted();
    if (this.overlayForceFullscreen) {
      this.overlay.showFullscreen();
    } else {
      // Prefer fullscreen by default; anchored pre-show is deprecated for registration flows
      this.overlay.showFullscreen();
    }
  }

  private hideFrameForActivation(): void {
    if (!this.overlay.getState().visible) return;
    this.overlay.hide();
  }

  private sendBestEffortCancel(targetRequestId?: string): void {
    const port = this.port;
    if (!port) return;
    const cancelEnvelope: ParentToChildEnvelope = {
      type: 'PM_CANCEL',
      requestId: `cancel-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      payload: targetRequestId ? { requestId: targetRequestId } : {}
    };
    port.postMessage(cancelEnvelope);
  }

  /**
   * Public toggle to surface the wallet iframe for user activation or hide it.
   * Useful when mounting inline UI components that require direct user clicks.
   */
  setOverlayVisible(visible: boolean): void {
    if (visible) {
      // Respect fullscreen lock when present
      if (this.overlayForceFullscreen) {
        this.overlay.showFullscreen();
      } else {
        this.showFrameForActivation();
      }
    } else {
      this.hideFrameForActivation();
    }
  }

  /** Public helper for tests/tools: get the underlying iframe element. */
  getIframeEl(): HTMLIFrameElement | null {
    try { return this.transport.getIframeEl(); } catch { return null; }
  }

  /** Public helper for tests/tools: inspect current overlay state. */
  getOverlayState(): { visible: boolean; mode: 'hidden' | 'fullscreen' | 'anchored'; sticky: boolean; rect?: DOMRectLike } {
    try { return this.overlay.getState(); } catch { return { visible: false, mode: 'hidden', sticky: false }; }
  }

  /**
   * Position and show the wallet iframe as an anchored overlay matching a DOMRect.
   * Accepts viewport-relative coordinates (from getBoundingClientRect()).
   *
   * Important: Some apps apply CSS transforms (or filters/perspective) on html/body,
   * which changes the containing block for position: fixed. In those cases a fixed
   * iframe will be offset by the page scroll. To avoid that mismatch, anchor the
   * overlay using absolute positioning in document coordinates.
   */
  setOverlayBounds(rect: { top: number; left: number; width: number; height: number }): void {
    if (this.overlayForceFullscreen) return; // ignore anchored bounds while locked to fullscreen
    this.transport.ensureIframeMounted();
    this.overlay.showAnchored(rect as DOMRectLike);
  }

  // setAnchoredOverlayBounds/clearAnchoredOverlay removed with Arrow overlay deprecation

  // Post a window message and surface errors in debug mode instead of silently swallowing them
  private postWindowMessage(w: Window, data: unknown, target: string): void {
    try {
      w.postMessage(data, target);
    } catch (err) {
      if (this.debug) {
        console.error('[WalletIframeRouter] window.postMessage failed', { error: err, data });
      }
    }
  }

}

// ===== Runtime type guards to safely bridge ProgressPayload → typed SSE events =====
const REGISTRATION_PHASES = new Set<string>(Object.values(RegistrationPhase) as string[]);
const LOGIN_PHASES = new Set<string>(Object.values(LoginPhase) as string[]);
const ACTION_PHASES = new Set<string>(Object.values(ActionPhase) as string[]);
const DEVICE_LINKING_PHASES = new Set<string>(Object.values(DeviceLinkingPhase) as string[]);
const ACCOUNT_RECOVERY_PHASES = new Set<string>(Object.values(AccountRecoveryPhase) as string[]);

function phaseOf(progress: ProgressPayload): string {
  return String((progress as { phase?: unknown })?.phase ?? '');
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
