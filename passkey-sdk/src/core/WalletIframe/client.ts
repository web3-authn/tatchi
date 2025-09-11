import {
  type ParentToChildEnvelope,
  type ChildToParentEnvelope,
} from './messages';
import { sanitizeSdkBasePath, escapeHtmlAttribute } from './sanitization';
import { SignedTransaction } from '../NearClient';
import { ProgressBus, defaultPhaseHeuristics } from './progress-bus';
import type { RegistrationResult, LoginResult, VerifyAndSignTransactionResult, LoginState, ActionResult } from '../types/passkeyManager';
import { IframeTransport } from './IframeTransport';
import {
  DeviceLinkingQRData
} from '../types/linkDevice'
import type { AuthenticatorOptions } from '../types/authenticatorOptions';

// Simple, framework-agnostic service iframe client.
//
// Responsibilities split:
// - IframeTransport: low-level mount + load + CONNECT/READY handshake (MessagePort)
// - WalletIframeClient (this): request/response correlation, progress events,
//   overlay display, and high-level wallet RPC helpers

export interface WalletIframeClientOptions {
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
  relayer?: { initialUseRelayer: boolean; accountId: string; url: string };
  vrfWorkerConfigs?: Record<string, unknown>;
  rpIdOverride?: string;
  authenticatorOptions?: AuthenticatorOptions;
  // SDK asset base path for embedded bundles when mounting same‑origin via srcdoc
  // Must serve dist/esm under this base path. Defaults to '/sdk'.
  sdkBasePath?: string;
}

type Pending = {
  resolve: (value: any) => void;
  reject: (reason?: any) => void;
  timer: number | undefined;
  onProgress?: (payload: any) => void;
};

export class WalletIframeClient {
  private opts: Required<WalletIframeClientOptions>;
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
  private device2StartPromise: Promise<{ qrData: any; qrCodeDataURL: string }> | null = null;
  private progressBus: ProgressBus;
  private debug = false;

  constructor(options: WalletIframeClientOptions) {
    this.opts = {
      connectTimeoutMs: 8000,
      requestTimeoutMs: 20000,
      servicePath: '/service',
      sdkBasePath: '/sdk',
      walletOrigin: '',
      ...options,
    } as Required<WalletIframeClientOptions>;
    this.debug = !!(this.opts as any).debug || !!(globalThis as any).__W3A_DEBUG__;
    // Encapsulate iframe mount + handshake logic in transport
    this.transport = new IframeTransport({
      walletOrigin: this.opts.walletOrigin,
      servicePath: this.opts.servicePath,
      sdkBasePath: this.opts.sdkBasePath,
      connectTimeoutMs: this.opts.connectTimeoutMs,
    });

    // Initialize progress router with overlay control and phase heuristics
    this.progressBus = new ProgressBus(
      { show: () => this.showFrameForActivation(), hide: () => this.hideFrameForActivation() },
      defaultPhaseHeuristics,
      this.debug ? ((msg, data) => { try { console.debug('[WalletIframeClient][ProgressBus]', msg, data || ''); } catch {} }) : undefined
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
      try { console.debug('[WalletIframeClient] init: connecting transport'); } catch {}
      this.port = await this.transport.connect();
      this.port.onmessage = (ev) => this.onPortMessage(ev);
      this.port.start?.();
      this.ready = true;
      try { console.debug('[WalletIframeClient] init: connected, sending PM_SET_CONFIG'); } catch {}
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
          // for embedded Lit components
          assetsBaseUrl: (() => {
            try {
              const base = new URL(this.opts.sdkBasePath, window.location.origin).toString();
              return base.endsWith('/') ? base : base + '/';
            } catch { return '/sdk/'; }
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

  // ===== Public RPC helpers =====

  // Subscribe to VRF status changes observed by this client
  onVrfStatusChanged(listener: (status: { active: boolean; nearAccountId: string | null; sessionDuration?: number }) => void): () => void {
    this.vrfStatusListeners.add(listener);
    return () => { this.vrfStatusListeners.delete(listener); };
  }

  private emitVrfStatusChanged(status: { active: boolean; nearAccountId: string | null; sessionDuration?: number }): void {
    for (const cb of Array.from(this.vrfStatusListeners)) {
      try { cb(status); } catch {}
    }
  }

  // ===== PasskeyManager-first RPCs =====

  async signTransactionsWithActions(payload: {
    nearAccountId: string;
    transactions: {
      receiverId: string;
      actions: unknown[]
    }[];
    options?: {
      onEvent?: (ev: any) => void
    }
  }): Promise<VerifyAndSignTransactionResult[]> {
    // Do not forward non-cloneable functions in options; host emits its own PROGRESS messages
    const res = await this.post<any>({ type: 'PM_SIGN_TXS_WITH_ACTIONS', payload: { nearAccountId: payload.nearAccountId, transactions: payload.transactions } as any }, { onProgress: payload.options?.onEvent as any });
    const arr: any[] = Array.isArray(res?.result) ? (res.result as any[]) : [];
    const normalized = arr.map((entry: any) => {
      if (entry?.signedTransaction) {
        const st = entry.signedTransaction;
        if (st && typeof st.base64Encode !== 'function' && (st.borsh_bytes || st.borshBytes)) {
          try {
            entry.signedTransaction = new SignedTransaction({
              transaction: st.transaction,
              signature: st.signature,
              borsh_bytes: Array.isArray(st.borsh_bytes) ? st.borsh_bytes : Array.from(st.borshBytes || []),
            });
          } catch {}
        }
      }
      return entry;
    });
    return normalized as VerifyAndSignTransactionResult[];
  }

  async registerPasskey(payload: {
    nearAccountId: string;
    options?: {
      onEvent?: (ev: any) => void
    }
  }): Promise<RegistrationResult> {
    this.showFrameForActivation();
    try {
      const safeOptions = payload.options
        ? Object.fromEntries(Object.entries(payload.options).filter(([, v]) => typeof v !== 'function'))
        : undefined;
      const res = await this.post<any>({
          type: 'PM_REGISTER',
          payload: {
            nearAccountId: payload.nearAccountId,
            options: safeOptions
          }
        },
        { onProgress: payload.options?.onEvent as any }
      );
      try {
        const st = await this.getLoginState(payload.nearAccountId);
        this.emitVrfStatusChanged({ active: !!st.vrfActive, nearAccountId: st.nearAccountId || null, sessionDuration: st.vrfSessionDuration });
      } catch {}
      return (res?.result || { success: false, error: 'Registration failed' }) as RegistrationResult;
    } finally {
      this.hideFrameForActivation();
    }
  }

  async loginPasskey(payload: {
    nearAccountId: string;
    options?: {
      onEvent?: (ev: any) => void
    }
  }): Promise<LoginResult> {
    this.showFrameForActivation();
    try {
      const safeOptions = payload.options
        ? Object.fromEntries(Object.entries(payload.options).filter(([, v]) => typeof v !== 'function'))
        : undefined;
      const res = await this.post<any>(
        {
          type: 'PM_LOGIN',
          payload: {
            nearAccountId: payload.nearAccountId,
            options: safeOptions
          }
        },
        { onProgress: payload.options?.onEvent as any }
      );
      try {
        const st = await this.getLoginState(payload.nearAccountId);
        this.emitVrfStatusChanged({ active: !!st.vrfActive, nearAccountId: st.nearAccountId || null, sessionDuration: st.vrfSessionDuration });
      } catch {}
      return (res?.result || { success: false, error: 'Login failed' }) as LoginResult;
    } finally {
      this.hideFrameForActivation();
    }
  }

  async getLoginState(nearAccountId?: string): Promise<LoginState> {
    const res = await this.post<any>({ type: 'PM_GET_LOGIN_STATE', payload: nearAccountId ? { nearAccountId } : undefined as any });
    return (res?.result as any) as LoginState;
  }

  async checkVrfStatus(): Promise<{ ok: boolean; result: { active: boolean; nearAccountId: string | null; sessionDuration?: number } }> {
    const st = await this.getLoginState();
    return { ok: true, result: { active: !!st.vrfActive, nearAccountId: st.nearAccountId || null, sessionDuration: st.vrfSessionDuration } };
  }

  async clearVrfSession(): Promise<{ ok: boolean }> {
    await this.post<any>({ type: 'PM_LOGOUT' } as any);
    try { this.emitVrfStatusChanged({ active: false, nearAccountId: null }); } catch {}
    return { ok: true };
  }

  async signNep413Message(payload: { nearAccountId: string; message: string; recipient: string; state?: string; options?: { onEvent?: (ev: any) => void } }): Promise<any> {
    const res = await this.post<any>({ type: 'PM_SIGN_NEP413', payload: { nearAccountId: payload.nearAccountId, params: { message: payload.message, recipient: payload.recipient, state: payload.state } } }, { onProgress: payload.options?.onEvent as any });
    return res?.result as any;
  }

  async signTransactionWithKeyPair(payload: { signedTransaction: SignedTransaction; options?: { onEvent?: (ev: any) => void } & Record<string, unknown> }): Promise<ActionResult> {
    // Strip non-cloneable functions from options; host emits PROGRESS events
    const { options } = payload || {};
    const safeOptions: Record<string, unknown> | undefined = options ? ({
      ...(typeof (options as any).waitUntil !== 'undefined' ? { waitUntil: (options as any).waitUntil } : {}),
    } as any) : undefined;
    const res = await this.post<any>({ type: 'PM_SEND_TRANSACTION', payload: { signedTransaction: payload.signedTransaction, options: safeOptions } as any }, { onProgress: options?.onEvent as any });
    return (res?.result as any) as ActionResult;
  }

  async executeAction(payload: { nearAccountId: string; receiverId: string; actionArgs: unknown | unknown[]; options?: { onEvent?: (ev: any) => void } & Record<string, unknown> }): Promise<any> {
    // Strip non-cloneable functions from options; host emits PROGRESS events
    const { options } = payload || {};
    const safeOptions: Record<string, unknown> | undefined = options ? ({
      ...(typeof (options as any).waitUntil !== 'undefined' ? { waitUntil: (options as any).waitUntil } : {}),
    } as any) : undefined;
    const res = await this.post<any>({ type: 'PM_EXECUTE_ACTION', payload: { ...payload, options: safeOptions } as any }, { onProgress: options?.onEvent as any });
    return res?.result;
  }

  async setConfirmBehavior(behavior: 'requireClick' | 'autoProceed'): Promise<void> {
    if (!this.ready) {
      try { await this.init(); } catch {}
    }
    let nearAccountId: string | undefined;
    try { nearAccountId = (await this.getLoginState())?.nearAccountId || undefined; } catch {}
    console.log("[WalletIframeClient] >>> setConfirmBehavior", behavior, nearAccountId);
    await this.post<any>({ type: 'PM_SET_CONFIRM_BEHAVIOR', payload: { behavior, nearAccountId } as any });
  }

  async setConfirmationConfig(config: Record<string, unknown>): Promise<void> {
    if (!this.ready) {
      try { await this.init(); } catch {}
    }
    let nearAccountId: string | undefined;
    try { nearAccountId = (await this.getLoginState())?.nearAccountId || undefined; } catch {}
    console.log("[WalletIframeClient] >>> setConfirmationConfig", config, nearAccountId);
    await this.post<any>({ type: 'PM_SET_CONFIRMATION_CONFIG', payload: { config, nearAccountId } as any });
  }

  async getConfirmationConfig(): Promise<any> {
    const res = await this.post<any>({ type: 'PM_GET_CONFIRMATION_CONFIG' } as any);
    return res?.result;
  }

  async setTheme(theme: 'dark' | 'light'): Promise<void> {
    await this.post<any>({ type: 'PM_SET_THEME', payload: { theme } as any });
  }

  async prefetchBlockheight(): Promise<void> {
    await this.post<any>({ type: 'PM_PREFETCH_BLOCKHEIGHT' } as any);
  }

  async getRecentLogins(): Promise<any> {
    const res = await this.post<any>({ type: 'PM_GET_RECENT_LOGINS' } as any);
    return res?.result;
  }

  async signAndSendTransactions(payload: {
    nearAccountId: string;
    transactions: { receiverId: string; actions: unknown[] }[];
    options?: { executeSequentially?: boolean; waitUntil?: any; onEvent?: (ev: any) => void } & Record<string, unknown>;
  }): Promise<ActionResult[]> {
    const { options } = payload || {};
    const safeOptions: Record<string, unknown> | undefined = options ? ({
      ...(typeof (options as any).waitUntil !== 'undefined' ? { waitUntil: (options as any).waitUntil } : {}),
      ...(typeof (options as any).executeSequentially !== 'undefined' ? { executeSequentially: (options as any).executeSequentially } : {}),
    } as any) : undefined;
    const res = await this.post<any>({ type: 'PM_SIGN_AND_SEND_TXS', payload: { nearAccountId: payload.nearAccountId, transactions: payload.transactions, options: safeOptions } as any }, { onProgress: options?.onEvent as any });
    const arr = Array.isArray(res?.result) ? res.result as any[] : [];
    return arr as ActionResult[];
  }

  async hasPasskeyCredential(nearAccountId: string): Promise<boolean> {
    const res = await this.post<any>({ type: 'PM_HAS_PASSKEY', payload: { nearAccountId } as any });
    return !!res?.result;
  }

  async viewAccessKeyList(accountId: string): Promise<any> {
    const res = await this.post<any>({ type: 'PM_VIEW_ACCESS_KEYS', payload: { accountId } as any });
    return res?.result;
  }

  async deleteDeviceKey(accountId: string, publicKeyToDelete: string, options?: { onEvent?: (ev: any) => void }): Promise<any> {
    const res = await this.post<any>({ type: 'PM_DELETE_DEVICE_KEY', payload: { accountId, publicKeyToDelete } as any }, { onProgress: options?.onEvent as any });
    return res?.result;
  }

  async sendTransaction(args: { signedTransaction: SignedTransaction; options?: { onEvent?: (ev: any) => void } & Record<string, unknown> }): Promise<ActionResult> {
    // Strip non-cloneable functions from options; host emits PROGRESS events
    const { options } = args || {};
    const safeOptions: Record<string, unknown> | undefined = options ? ({
      ...(typeof (options as any).waitUntil !== 'undefined' ? { waitUntil: (options as any).waitUntil } : {}),
    } as any) : undefined;
    const res = await this.post<any>({ type: 'PM_SEND_TRANSACTION', payload: { signedTransaction: args.signedTransaction, options: safeOptions } as any }, { onProgress: options?.onEvent as any });
    return res?.result as any;
  }

  async exportNearKeypairWithTouchId(nearAccountId: string): Promise<{ accountId: string; privateKey: string; publicKey: string }> {
    const res = await this.post<any>({ type: 'PM_EXPORT_NEAR_KEYPAIR', payload: { nearAccountId } as any });
    return res?.result as any;
  }

  // ===== Account Recovery (single-endpoint flow) =====
  async recoverAccountFlow(payload: { accountId?: string; onEvent?: (ev: any) => void }): Promise<any> {
    const res = await this.post<any>({ type: 'PM_RECOVER_ACCOUNT_FLOW', payload: { accountId: payload.accountId } as any }, { onProgress: payload.onEvent as any, sticky: true });
    return res?.result as any;
  }

  // ===== Device Linking (iframe-hosted) =====
  async linkDeviceWithScannedQRData(payload: {
    qrData: DeviceLinkingQRData;
    fundingAmount: string;
    options?: { onEvent?: (ev: any) => void }
  }): Promise<any> {
    // TouchID required within host
    this.showFrameForActivation();
    try {
      const res = await this.post<any>(
        {
          type: 'PM_LINK_DEVICE_WITH_SCANNED_QR_DATA',
          payload: {
            qrData: payload.qrData,
            fundingAmount: payload.fundingAmount
          }
        },
        { onProgress: payload.options?.onEvent }
      );
      return res?.result as any;
    } finally {
      this.hideFrameForActivation();
    }
  }

  async startDevice2LinkingFlow(payload?: {
    accountId?: string;
    ui?: 'modal' | 'inline';
    onEvent?: (ev: any) => void
  }): Promise<{
    qrData: DeviceLinkingQRData;
    qrCodeDataURL: string
  }> {
    // No user activation required at QR-generation step
    if (this.device2StartPromise) return this.device2StartPromise as any;
    const p = this.post<any>(
      {
        type: 'PM_START_DEVICE2_LINKING_FLOW',
        payload: { accountId: payload?.accountId, ui: payload?.ui } as any
      },
      { onProgress: payload?.onEvent, sticky: true }
    ).then((res) => (res?.result || {}) as any)
    .finally(() => { this.device2StartPromise = null; });

    this.device2StartPromise = p as any;

    return p as any;
  }

  async stopDevice2LinkingFlow(): Promise<void> {
    await this.post<any>({ type: 'PM_STOP_DEVICE2_LINKING_FLOW' } as any);
    try { this.progressBus.clearAll(); } catch {}
  }

  // ===== Control APIs =====
  async cancelRequest(requestId: string): Promise<void> {
    // Best-effort cancel. Host will attempt to close any open modal and mark the request as cancelled.
    await this.post<any>({ type: 'PM_CANCEL', payload: { requestId } as any });
  }

  async cancelAll(): Promise<void> {
    await this.post<any>({ type: 'PM_CANCEL', payload: {} as any });
  }

  // mount + handshake are handled by IframeTransport

  private onPortMessage(e: MessageEvent) {
    const msg = e.data as ChildToParentEnvelope;
    if (!msg || typeof msg !== 'object') return;

    // Bridge PROGRESS events to caller-provided onEvent callback via pending registry
    if (msg.type === 'PROGRESS') {
      const rid = msg.requestId as string | undefined;
      if (!rid) return;
      const payload = (msg as any).payload;
      // Route via ProgressBus (handles overlay + sticky delivery)
      this.progressBus.dispatch(rid, payload);
      // Refresh timeout for long-running operations whenever progress is received
      const pend = this.pending.get(rid);
      if (pend) {
        try { if (pend.timer) window.clearTimeout(pend.timer as any); } catch {}
        pend.timer = window.setTimeout(() => {
          this.pending.delete(rid);
          pend.reject(new Error('Wallet request timeout'));
        }, this.opts.requestTimeoutMs) as any;
      }
      return;
    }
    try { console.debug('[WalletIframeClient] message:', msg); } catch {}

    const requestId = (msg as any).requestId as string | undefined;
    if (!requestId) return;

    const pending = this.pending.get(requestId);
    if (!pending) return;
    this.pending.delete(requestId);
    if (pending.timer) window.clearTimeout(pending.timer);

    // Hide iframe overlay when a request completes (success or error)
    try { this.hideFrameForActivation(); } catch {}

    if (msg.type === 'ERROR') {
      const err = new Error((msg.payload as any)?.message || 'Wallet error');
      (err as any).code = (msg.payload as any)?.code;
      (err as any).details = (msg.payload as any)?.details;
      // Deliver to pending promise if present
      pending.reject(err);
      // Also notify any progress subscribers for this requestId
      try {
        const rid = (msg as any).requestId as string | undefined;
        if (rid) {
          this.progressBus.dispatch(rid, { step: 0, phase: 'error', status: 'error', message: (msg.payload as any)?.message });
          this.progressBus.unregister(rid);
        }
      } catch {}
      return;
    }

    pending.resolve(msg.payload);
    try {
      if (requestId && !this.progressBus.isSticky(requestId)) {
        this.progressBus.unregister(requestId);
      }
    } catch {}
  }

  /**
   * Post a typed envelope over the MessagePort with robust readiness handling.
   * If the port is not ready yet, lazily initializes the transport (awaits init()).
   */
  private async post<T = any>(envelope: Omit<ParentToChildEnvelope, 'requestId'>, opts?: { onProgress?: (payload: any) => void; sticky?: boolean }): Promise<T> {
    // Lazily initialize the iframe/client if not ready yet
    if (!this.ready || !this.port) {
      try {
        await this.init();
      } catch (e) {
        throw (e instanceof Error) ? e : new Error('Wallet iframe init failed');
      }
    }
    const requestId = `${Date.now()}-${++this.reqCounter}`;
    const full: ParentToChildEnvelope = { ...envelope, requestId } as any;

    return new Promise<T>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`Wallet request timeout for ${envelope.type}`));
      }, this.opts.requestTimeoutMs);

      this.pending.set(requestId, { resolve, reject, timer, onProgress: opts?.onProgress });
      // Register progress handler; overlay handled by ProgressBus
      this.progressBus.register(requestId, (payload: any) => {
        try { opts?.onProgress?.(payload); } catch {}
      }, !!opts?.sticky);
      try {
        this.port!.postMessage(full);
      } catch (err) {
        this.pending.delete(requestId);
        window.clearTimeout(timer);
        try { this.progressBus.unregister(requestId); } catch {}
        reject(err);
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
      (iframe.style as any).inset = '0';
      iframe.style.top = '0';
      iframe.style.left = '0';
      iframe.style.width = '100vw';
      iframe.style.height = '100vh';
      iframe.style.opacity = '1';
      iframe.style.pointerEvents = 'auto';
      // Put iframe one layer below modal card rendered inside (which uses 2147483647).
      // Some browsers cap z-index per stacking context; use a high value and ensure visibility.
      iframe.style.zIndex = '2147483646';
      iframe.setAttribute('aria-hidden', 'false');
      iframe.removeAttribute('tabindex');
      console.debug('[WalletIframeClient] Activation overlay applied:', {
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

  // Public subscription API for observability/testing
  subscribeProgress(requestId: string, handler: (payload: any) => void, opts?: { sticky?: boolean }): () => void {
    this.progressBus.register(requestId, handler, !!opts?.sticky);
    return () => { try { this.progressBus.unregister(requestId); } catch {} };
  }

  getProgressStats(requestId: string): { count: number; lastPhase: string | null; lastAt: number | null } | null {
    return this.progressBus.getStats(requestId);
  }
}
