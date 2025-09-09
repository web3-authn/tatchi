import {
  type ParentToChildEnvelope,
  type ChildToParentEnvelope,
  type WalletProtocolVersion,
  type DbResultPayload,
  type SignResultPayload,
  type RegisterResultPayload,
  type Nep413ResultPayload,
  type TransactionInputLite,
  type RequestSignTransactionsWithActionsPayload,
  type RequestSignPayload,
} from './messages';
import { sanitizeSdkBasePath, escapeHtmlAttribute } from './sanitization';
import { SignedTransaction } from '../NearClient';
import type { VerifyAndSignTransactionResult, RegistrationResult, LoginResult } from '../types/passkeyManager';
import { toAccountId } from '../types/accountIds';

// Simple, framework-agnostic service iframe client.

export interface WalletIframeClientOptions {
  walletOrigin?: string; // e.g., https://wallet.example.com (optional; empty => same-origin srcdoc)
  servicePath?: string; // default '/service'
  connectTimeoutMs?: number; // default 8000
  requestTimeoutMs?: number; // default 20000
  theme?: 'dark' | 'light';
  // Optional config forwarded to wallet host
  nearRpcUrl?: string;
  nearNetwork?: 'testnet' | 'mainnet';
  contractId?: string;
  relayer?: { initialUseRelayer: boolean; accountId: string; url: string };
  vrfWorkerConfigs?: Record<string, unknown>;
  rpIdOverride?: string;
  // SDK asset base path for embedded bundles when mounting same‑origin via srcdoc
  // Must serve dist/esm under this base path. Defaults to '/sdk'.
  sdkBasePath?: string;
}

type Pending = {
  resolve: (value: any) => void;
  reject: (reason?: any) => void;
  timer: number | undefined;
};

export class WalletIframeClient {
  private opts: Required<WalletIframeClientOptions>;
  private iframeEl: HTMLIFrameElement | null = null;
  private port: MessagePort | null = null;
  private ready = false;
  private pending = new Map<string, Pending>();
  private reqCounter = 0;
  private readyListeners: Set<() => void> = new Set();
  private activationOverlayVisible = false;
  private vrfStatusListeners: Set<(status: { active: boolean; nearAccountId: string | null; sessionDuration?: number }) => void> = new Set();
  private serviceBooted = false;

  constructor(options: WalletIframeClientOptions) {
    this.opts = {
      connectTimeoutMs: 8000,
      requestTimeoutMs: 20000,
      servicePath: '/service',
      sdkBasePath: '/sdk',
      walletOrigin: '',
      ...options,
    } as Required<WalletIframeClientOptions>;
    try {
      const walletOrigin = this.opts.walletOrigin;
      window.addEventListener('message', (e) => {
        const data = e.data as any;
        // Scope debug logger to wallet origin to avoid extension noise (e.g., MetaMask)
        if (walletOrigin && e.origin === walletOrigin) {
          try { console.debug('[WalletIframeClient] window message (wallet)', e.origin, data); } catch {}
          if (data && typeof data === 'object' && data.type === 'SERVICE_HOST_BOOTED') {
            this.serviceBooted = true;
          }
        }
      });
    } catch {}
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

  async init(): Promise<void> {
    if (this.ready) return;
    try { console.debug('[WalletIframeClient] init: mounting iframe'); } catch {}
    this.mountHiddenIframe();
    try { console.debug('[WalletIframeClient] init: starting handshake'); } catch {}
    await this.handshake();
    try { console.debug('[WalletIframeClient] init: handshake complete, sending SET_CONFIG'); } catch {}
    await this.post({
      type: 'SET_CONFIG',
      payload: {
        theme: this.opts.theme,
        nearRpcUrl: this.opts.nearRpcUrl,
        nearNetwork: this.opts.nearNetwork,
        contractId: this.opts.contractId,
        relayer: this.opts.relayer,
        vrfWorkerConfigs: this.opts.vrfWorkerConfigs,
        rpIdOverride: this.opts.rpIdOverride,
      }
    });
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

  // Handler-aligned convenience method
  async signTransactionsWithActions(payload: RequestSignTransactionsWithActionsPayload): Promise<VerifyAndSignTransactionResult[]> {
    const res = await this.post<SignResultPayload>({ type: 'REQUEST_signTransactionsWithActions', payload } as any);
    const arr: any[] = Array.isArray(res?.signedTransactions) ? res.signedTransactions as any[] : [];
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

  async getUser(nearAccountId: string): Promise<DbResultPayload> {
    return this.post<DbResultPayload>({ type: 'DB_GET_USER', payload: { nearAccountId } });
  }

  async getPreferences(nearAccountId: string): Promise<DbResultPayload> {
    return this.post<DbResultPayload>({ type: 'DB_GET_PREFERENCES', payload: { nearAccountId } });
  }

  // Additional DB helpers
  async getAllUsers(): Promise<DbResultPayload> {
    return this.post<DbResultPayload>({ type: 'DB_GET_ALL_USERS' });
  }

  async storeWebAuthnUser(userData: Record<string, unknown>): Promise<DbResultPayload> {
    return this.post<DbResultPayload>({ type: 'DB_STORE_WEBAUTHN_USER', payload: { userData } });
  }

  async getLastUser(): Promise<DbResultPayload> {
    return this.post<DbResultPayload>({ type: 'DB_GET_LAST_USER' });
  }

  async setLastUser(nearAccountId: string, deviceNumber?: number): Promise<DbResultPayload> {
    return this.post<DbResultPayload>({ type: 'DB_SET_LAST_USER', payload: { nearAccountId, deviceNumber } });
  }

  async getAuthenticators(nearAccountId: string): Promise<DbResultPayload> {
    return this.post<DbResultPayload>({ type: 'DB_GET_AUTHENTICATORS', payload: { nearAccountId } });
  }

  async storeAuthenticator(record: Record<string, unknown>): Promise<DbResultPayload> {
    return this.post<DbResultPayload>({ type: 'DB_STORE_AUTHENTICATOR', payload: { record } });
  }

  async updatePreferences(nearAccountId: string, patch: Record<string, unknown>): Promise<DbResultPayload> {
    return this.post<DbResultPayload>({ type: 'DB_UPDATE_PREFERENCES', payload: { nearAccountId, patch } });
  }

  async getConfirmationConfig(nearAccountId: string): Promise<DbResultPayload> {
    return this.post<DbResultPayload>({ type: 'DB_GET_CONFIRMATION_CONFIG', payload: { nearAccountId } });
  }

  async getTheme(nearAccountId: string): Promise<DbResultPayload> {
    return this.post<DbResultPayload>({ type: 'DB_GET_THEME', payload: { nearAccountId } });
  }

  async setTheme(nearAccountId: string, theme: 'dark' | 'light'): Promise<DbResultPayload> {
    return this.post<DbResultPayload>({ type: 'DB_SET_THEME', payload: { nearAccountId, theme } });
  }

  // Near keys DB (encrypted keys)
  async getAllNearKeys(): Promise<DbResultPayload> {
    return this.post<DbResultPayload>({ type: 'DB_NEAR_KEYS_GET_ALL' });
  }

  async storeNearKey(record: { nearAccountId: string; encryptedData: string; iv: string; timestamp: number }): Promise<DbResultPayload> {
    return this.post<DbResultPayload>({ type: 'DB_NEAR_KEYS_STORE', payload: { record } });
  }

  // ===== Internals =====

  async signNep413Message(payload: { nearAccountId: string; message: string; recipient: string; state?: string }): Promise<Nep413ResultPayload> {
    return this.post<Nep413ResultPayload>({ type: 'REQUEST_signNep413Message', payload } as any);
  }

  // Wallet-origin registration end-to-end inside the iframe
  async registerPasskey(payload: {
    nearAccountId: string;
    deviceNumber?: number;
    authenticatorOptions?: Record<string, unknown>;
    uiMode?: 'modal' | 'drawer'
  }): Promise<RegistrationResult> {

    // Make the iframe visible and interactive to capture a user click inside it
    this.showFrameForActivation();
    try {
      const res = await this.post<RegisterResultPayload>({ type: 'REQUEST_registerPasskey', payload });

      // After registration completes, query VRF status and notify listeners
      try {
        const statusRaw = await this.checkVrfStatus();
        const status = (statusRaw as any)?.result || (statusRaw as any) || {};
        this.emitVrfStatusChanged({
          active: !!status.active,
          nearAccountId: status.nearAccountId || null,
          sessionDuration: status.sessionDuration,
        });
      } catch {}

      // Map to RegistrationResult for drop-in compatibility
      const userRes = await this.getUser(payload.nearAccountId).catch(() => null);
      const clientNearPublicKey = (userRes as any)?.result?.clientNearPublicKey || null;
      const result: RegistrationResult = {
        success: !!res?.success,
        nearAccountId: toAccountId(payload.nearAccountId),
        clientNearPublicKey,
        transactionId: (res as any)?.transactionId ?? null,
        vrfRegistration: (res as any)?.vrfRegistration || (res?.success ? { success: true } : { success: false, error: (res as any)?.error })
      };
      return result;
    } finally {
      // Hide the iframe again after the operation completes
      this.hideFrameForActivation();
    }
  }

  // Wallet-origin login that unlocks VRF keypair in iframe worker
  async loginPasskey(payload: { nearAccountId: string }): Promise<LoginResult> {
    this.showFrameForActivation();
    try {
      const res = await this.post<DbResultPayload>({ type: 'REQUEST_loginPasskey', payload } as any);
      // After login completes, query and emit latest status
      try {
        const statusRaw = await this.checkVrfStatus();
        const status = (statusRaw as any)?.result || (statusRaw as any) || {};
        this.emitVrfStatusChanged({
          active: !!status.active,
          nearAccountId: status.nearAccountId || null,
          sessionDuration: status.sessionDuration,
        });
      } catch {}
      // Return LoginResult for drop-in compatibility
      const userRes = await this.getUser(payload.nearAccountId).catch(() => null);
      const clientNearPublicKey = (userRes as any)?.result?.clientNearPublicKey || null;
      const ok = (res as any)?.ok ?? (res as any)?.success ?? false;
      return ok ? {
        success: true,
        loggedInNearAccountId: payload.nearAccountId,
        clientNearPublicKey,
        nearAccountId: toAccountId(payload.nearAccountId),
      } : { success: false, error: (res as any)?.error || 'Login failed' };
    } finally {
      this.hideFrameForActivation();
    }
  }

  async checkVrfStatus(): Promise<DbResultPayload> {
    return this.post<DbResultPayload>({ type: 'REQUEST_checkVrfStatus' } as any);
  }

  async clearVrfSession(): Promise<DbResultPayload> {
    const res = await this.post<DbResultPayload>({ type: 'REQUEST_clearVrfSession' } as any);
    // Emit cleared status to listeners
    try { this.emitVrfStatusChanged({ active: false, nearAccountId: null }); } catch {}
    return res;
  }

  // Back-compat alias (deprecated)
  async walletRegisterUser(payload: { nearAccountId: string; deviceNumber?: number; authenticatorOptions?: Record<string, unknown> }): Promise<RegisterResultPayload> {
    return this.registerPasskey(payload);
  }

  async decryptPrivateKeyWithPrf(nearAccountId: string): Promise<DbResultPayload> {
    return this.post<DbResultPayload>({ type: 'REQUEST_decryptPrivateKeyWithPrf', payload: { nearAccountId } } as any);
  }

  async deriveNearKeypairAndEncrypt(payload: {
    nearAccountId: string;
    credential: unknown;
    options?: {
      vrfChallenge?: unknown;
      deterministicVrfPublicKey?: string;
      contractId?: string;
      nonce?: string;
      blockHash?: string;
      authenticatorOptions?: Record<string, unknown>;
    };
  }): Promise<DbResultPayload> {
    return this.post<DbResultPayload>({ type: 'REQUEST_deriveNearKeypairAndEncrypt', payload } as any);
  }

  async recoverKeypairFromPasskey(payload: { authenticationCredential: unknown; accountIdHint?: string }): Promise<DbResultPayload> {
    return this.post<DbResultPayload>({ type: 'REQUEST_recoverKeypairFromPasskey', payload } as any);
  }

  async signTransactionWithKeyPair(payload: { nearPrivateKey: string; signerAccountId: string; receiverId: string; nonce: string; blockHash: string; actions: unknown[] }): Promise<{ signedTransaction: SignedTransaction; logs?: string[] }> {
    const res = await this.post<SignResultPayload>({ type: 'REQUEST_signTransactionWithKeyPair', payload } as any);
    const arr: any[] = Array.isArray(res?.signedTransactions) ? res.signedTransactions as any[] : [];
    const first = arr[0] || {};
    if (first?.signedTransaction) {
      const st = first.signedTransaction;
      if (st && typeof st.base64Encode !== 'function' && (st.borsh_bytes || st.borshBytes)) {
        try {
          first.signedTransaction = new SignedTransaction({
            transaction: st.transaction,
            signature: st.signature,
            borsh_bytes: Array.isArray(st.borsh_bytes) ? st.borsh_bytes : Array.from(st.borshBytes || []),
          });
        } catch {}
      }
    }
    return { signedTransaction: first.signedTransaction, logs: first.logs };
  }

  private mountHiddenIframe(): void {
    if (this.iframeEl) return;
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.width = '0px';
    iframe.style.height = '0px';
    iframe.style.opacity = '0';
    iframe.style.pointerEvents = 'none';
    iframe.setAttribute('aria-hidden', 'true');
    iframe.setAttribute('tabindex', '-1');
    // Sandbox only for same‑origin srcdoc case; for cross‑origin service pages,
    // avoid sandbox to reduce inconsistent browser behavior with MessagePorts.
    if (!this.opts.walletOrigin) {
      // Hidden service iframe does not perform WebAuthn; avoid exposing permissions.
      // Keep same-origin for srcdoc so module imports and storage work as expected.
      iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');
    }
    // Delegate WebAuthn capabilities to the wallet origin frame when cross-origin
    try {
      if (this.opts.walletOrigin) {
        const origin = new URL(this.opts.walletOrigin).origin;
        // Use iframe allow directive (Feature-Policy style) which browsers accept on the attribute
        const allow = `publickey-credentials-get ${origin}; publickey-credentials-create ${origin}`;
        iframe.setAttribute('allow', allow);
      } else {
        // Same-origin: explicitly allow to self
        iframe.setAttribute('allow', "publickey-credentials-get 'self'; publickey-credentials-create 'self'");
      }
    } catch {
      // Fallback to permissive allow if parsing fails
      iframe.setAttribute('allow', "publickey-credentials-get 'self'; publickey-credentials-create 'self'");
    }

    // Track load state to avoid missing the event due to races
    try {
      (iframe as any)._svc_loaded = false;
      iframe.addEventListener('load', () => { (iframe as any)._svc_loaded = true; }, { once: true } as any);
    } catch {}

    if (this.opts.walletOrigin) {
      // External (or explicit) origin provided: load service page by URL
      const src = new URL(this.opts.servicePath, this.opts.walletOrigin).toString();
      try { console.debug('[WalletIframeClient] mount: using external origin', src); } catch {}
      iframe.src = src;
    } else {
      // No external origin: mount same‑origin service via srcdoc and a known SDK asset URL
      // Use explicit SDK base path to avoid bundler/path ambiguities in dev environments
      const sanitizedBasePath = sanitizeSdkBasePath(this.opts.sdkBasePath);
      const serviceHostUrl = `${sanitizedBasePath}/esm/react/embedded/wallet-iframe-host.js`;
      const escapedUrl = escapeHtmlAttribute(serviceHostUrl);
      const html = `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/></head><body><script type="module" src="${escapedUrl}"></script></body></html>`;
      iframe.srcdoc = html;
    }
    document.body.appendChild(iframe);
    try { console.debug('[WalletIframeClient] mount: iframe appended to DOM'); } catch {}
    this.iframeEl = iframe;
  }

  private async handshake(): Promise<void> {
    const { iframeEl } = this;
    if (!iframeEl || !iframeEl.contentWindow) throw new Error('Wallet iframe not mounted');

    // Ensure the iframe has fired load at least once (avoid early post before handlers attach)
    if (!(iframeEl as any)._svc_loaded) {
      await new Promise<void>((resolve) => {
        try {
          iframeEl.addEventListener?.('load', () => resolve(), { once: true } as any);
          setTimeout(() => resolve(), 150);
        } catch {
          resolve();
        }
      });
    }

    // For cross-origin pages, give the host a brief moment to boot its script
    if (this.opts.walletOrigin) {
      const bootWaitMs = Math.min(this.opts.connectTimeoutMs / 4, 1500);
      const startBoot = Date.now();
      while (!this.serviceBooted && (Date.now() - startBoot) < bootWaitMs) {
        await new Promise(r => setTimeout(r, 50));
      }
    }

    // Repeatedly post CONNECT with a fresh MessageChannel until READY arrives or timeout elapses
    let resolved = false;
    let attempt = 0;
    const start = Date.now();
    const overallTimeout = this.opts.connectTimeoutMs;

    await new Promise<void>((resolve, reject) => {
      const tick = () => {
        if (resolved) return;
        const elapsed = Date.now() - start;
        if (elapsed >= overallTimeout) {
          try { console.debug('[WalletIframeClient] handshake timeout after %d ms', elapsed); } catch {}
          return reject(new Error('Wallet iframe READY timeout'));
        }

        attempt += 1;
        const channel = new MessageChannel();
        const port = channel.port1;
        const childPort = channel.port2;
        const cleanup = () => { try { (port as any).onmessage = null as any; } catch {} };

        (port as any).onmessage = (e: MessageEvent) => {
          const data = e.data as ChildToParentEnvelope;
          if (!data || typeof data !== 'object') return;
          try { console.debug('[WalletIframeClient] onmessage (attempt %d):', attempt, data); } catch {}
          if (data.type === 'READY') {
            resolved = true;
            cleanup();
            this.ready = true;
            this.port = port;
            this.port.onmessage = (ev) => this.onPortMessage(ev);
            this.port.start?.();
            try { console.debug('[WalletIframeClient] READY received (attempt %d)', attempt); } catch {}
            this.emitReady();
            return resolve();
          }
        };

        const cw = iframeEl.contentWindow;
        if (!cw) {
          cleanup();
          try { console.debug('[WalletIframeClient] contentWindow missing'); } catch {}
          return reject(new Error('Wallet iframe window missing'));
        }
        try { console.debug('[WalletIframeClient] posting CONNECT (attempt %d)', attempt); } catch {}
        const target = this.opts.walletOrigin ? new URL(this.opts.walletOrigin).origin : '*';
        cw.postMessage({ type: 'CONNECT' }, target as any, [childPort]);

        // Schedule next tick if not resolved yet (light backoff to reduce spam)
        const interval = attempt < 10 ? 200 : attempt < 20 ? 400 : 800;
        setTimeout(() => { if (!resolved) tick(); }, interval);
      };

      tick();
    });
  }

  private onPortMessage(e: MessageEvent) {
    const msg = e.data as ChildToParentEnvelope;
    if (!msg || typeof msg !== 'object') return;

    // Ready/Pong/Progress are fire-and-forget unless correlated
    if (msg.type === 'PROGRESS') { try { console.debug('[WalletIframeClient] PROGRESS:', msg); } catch {}; return; }
    try { console.debug('[WalletIframeClient] message:', msg); } catch {}

    const requestId = (msg as any).requestId as string | undefined;
    if (!requestId) return;

    const pending = this.pending.get(requestId);
    if (!pending) return;
    this.pending.delete(requestId);
    if (pending.timer) window.clearTimeout(pending.timer);

    if (msg.type === 'ERROR') {
      const err = new Error((msg.payload as any)?.message || 'Wallet error');
      (err as any).code = (msg.payload as any)?.code;
      (err as any).details = (msg.payload as any)?.details;
      pending.reject(err);
      return;
    }

    pending.resolve(msg.payload);
  }

  private post<T = any>(envelope: Omit<ParentToChildEnvelope, 'requestId'>): Promise<T> {
    if (!this.ready || !this.port) return Promise.reject(new Error('Wallet iframe not ready'));
    const requestId = `${Date.now()}-${++this.reqCounter}`;
    const full: ParentToChildEnvelope = { ...envelope, requestId } as any;

    return new Promise<T>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`Wallet request timeout for ${envelope.type}`));
      }, this.opts.requestTimeoutMs);

      this.pending.set(requestId, { resolve, reject, timer });
      try {
        this.port!.postMessage(full);
      } catch (err) {
        this.pending.delete(requestId);
        window.clearTimeout(timer);
        reject(err);
      }
    });
  }

  // Temporarily show the service iframe to capture user activation
  private showFrameForActivation(): void {
    if (!this.iframeEl) return;
    const iframe = this.iframeEl;
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
    if (!this.iframeEl) return;
    const iframe = this.iframeEl;
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
