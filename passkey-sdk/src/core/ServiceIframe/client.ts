import {
  type ParentToChildEnvelope,
  type ChildToParentEnvelope,
  type ServiceProtocolVersion,
} from './messages';
import { sanitizeSdkBasePath, escapeHtmlAttribute } from './sanitization';

// Simple, framework-agnostic service iframe client.

export interface ServiceIframeClientOptions {
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
  // SDK asset base path for embedded bundles when mounting same‑origin via srcdoc
  // Must serve dist/esm under this base path. Defaults to '/sdk'.
  sdkBasePath?: string;
}

type Pending = {
  resolve: (value: any) => void;
  reject: (reason?: any) => void;
  timer: number | undefined;
};

export class ServiceIframeClient {
  private opts: Required<ServiceIframeClientOptions>;
  private iframeEl: HTMLIFrameElement | null = null;
  private port: MessagePort | null = null;
  private ready = false;
  private pending = new Map<string, Pending>();
  private reqCounter = 0;

  constructor(options: ServiceIframeClientOptions) {
    this.opts = {
      connectTimeoutMs: 8000,
      requestTimeoutMs: 20000,
      servicePath: '/service',
      sdkBasePath: '/sdk',
      walletOrigin: '',
      ...options,
    } as Required<ServiceIframeClientOptions>;
  }

  async init(): Promise<void> {
    if (this.ready) return;
    this.mountHiddenIframe();
    await this.handshake();
    await this.post({
      type: 'SET_CONFIG',
      payload: {
        theme: this.opts.theme,
        nearRpcUrl: this.opts.nearRpcUrl,
        nearNetwork: this.opts.nearNetwork,
        contractId: this.opts.contractId,
        relayer: this.opts.relayer,
        vrfWorkerConfigs: this.opts.vrfWorkerConfigs,
      }
    });
  }

  isReady(): boolean { return this.ready; }

  // ===== Public RPC helpers =====

  async requestSign(payload: { nearAccountId: string; txSigningRequests: Array<{ receiverId: string; actions: unknown[] }>; options?: Record<string, unknown> }) {
    return this.post({ type: 'REQUEST_SIGN', payload });
  }

  // Handler-aligned convenience method
  async signTransactionsWithActions(payload: { nearAccountId: string; txSigningRequests: Array<{ receiverId: string; actions: unknown[] }>; rpcCall?: Record<string, unknown>; confirmationConfig?: Record<string, unknown>; options?: Record<string, unknown> }) {
    return this.post({ type: 'REQUEST_signTransactionsWithActions', payload } as any);
  }

  async requestRegister(payload: { nearAccountId: string }) {
    return this.post({ type: 'REQUEST_REGISTER', payload });
  }

  async getUser(nearAccountId: string) {
    return this.post({ type: 'DB_GET_USER', payload: { nearAccountId } });
  }

  async getPreferences(nearAccountId: string) {
    return this.post({ type: 'DB_GET_PREFERENCES', payload: { nearAccountId } });
  }

  async updatePreferences(nearAccountId: string, patch: Record<string, unknown>) {
    return this.post({ type: 'DB_UPDATE_PREFERENCES', payload: { nearAccountId, patch } });
  }

  async getConfirmationConfig(nearAccountId: string) {
    return this.post({ type: 'DB_GET_CONFIRMATION_CONFIG', payload: { nearAccountId } });
  }

  async getTheme(nearAccountId: string) {
    return this.post({ type: 'DB_GET_THEME', payload: { nearAccountId } });
  }

  async setTheme(nearAccountId: string, theme: 'dark' | 'light') {
    return this.post({ type: 'DB_SET_THEME', payload: { nearAccountId, theme } });
  }

  // ===== Internals =====

  async signNep413Message(payload: { nearAccountId: string; message: string; recipient: string; state?: string }) {
    return this.post({ type: 'REQUEST_signNep413Message', payload } as any);
  }

  async signVerifyAndRegisterUser(payload: {
    contractId?: string;
    credential: unknown;
    vrfChallenge: unknown;
    deterministicVrfPublicKey: string;
    nearAccountId: string;
    nearPublicKeyStr: string;
    deviceNumber?: number;
    authenticatorOptions?: Record<string, unknown>;
  }) {
    return this.post({ type: 'REQUEST_signVerifyAndRegisterUser', payload } as any);
  }

  async decryptPrivateKeyWithPrf(nearAccountId: string) {
    return this.post({ type: 'REQUEST_decryptPrivateKeyWithPrf', payload: { nearAccountId } } as any);
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
  }) {
    return this.post({ type: 'REQUEST_deriveNearKeypairAndEncrypt', payload } as any);
  }

  async recoverKeypairFromPasskey(payload: { authenticationCredential: unknown; accountIdHint?: string }) {
    return this.post({ type: 'REQUEST_recoverKeypairFromPasskey', payload } as any);
  }

  async signTransactionWithKeyPair(payload: { nearPrivateKey: string; signerAccountId: string; receiverId: string; nonce: string; blockHash: string; actions: unknown[] }) {
    return this.post({ type: 'REQUEST_signTransactionWithKeyPair', payload } as any);
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
    // Hidden service iframe does not perform WebAuthn; avoid exposing permissions.
    // Keep same-origin for srcdoc so module imports and storage work as expected.
    iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');

    if (this.opts.walletOrigin) {
      // External (or explicit) origin provided: load service page by URL
      const src = new URL(this.opts.servicePath, this.opts.walletOrigin).toString();
      iframe.src = src;
    } else {
      // No external origin: mount same‑origin service via srcdoc and a module asset URL
      // Resolve the embedded service host relative to this ESM module for zero‑config
      let serviceHostUrl = '';
      try {
        serviceHostUrl = new URL('../../../embedded/service-host.js', import.meta.url).toString();
      } catch {
        // Fallback to sdkBasePath for non‑ESM environments
        const sanitizedBasePath = sanitizeSdkBasePath(this.opts.sdkBasePath);
        serviceHostUrl = `${sanitizedBasePath}/embedded/service-host.js`;
      }
      const escapedUrl = escapeHtmlAttribute(serviceHostUrl);
      const html = `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/></head><body><script type="module" src="${escapedUrl}"></script></body></html>`;
      iframe.srcdoc = html;
    }
    document.body.appendChild(iframe);
    this.iframeEl = iframe;
  }

  private async handshake(): Promise<void> {
    const { iframeEl } = this;
    if (!iframeEl || !iframeEl.contentWindow) throw new Error('Service iframe not mounted');

    // Create a dedicated MessageChannel and send one port to the iframe
    const channel = new MessageChannel();
    const port = channel.port1;
    const childPort = channel.port2;

    const cleanup = () => {
      try { port.onmessage = null as any; } catch {}
    };

    const readyPromise = new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        cleanup();
        reject(new Error('Service iframe READY timeout'));
      }, this.opts.connectTimeoutMs);

      port.onmessage = (e: MessageEvent) => {
        const data = e.data as ChildToParentEnvelope;
        if (!data || typeof data !== 'object') return;
        if (data.type === 'READY') {
          window.clearTimeout(timer);
          cleanup();
          this.ready = true;
          resolve();
        }
      };
    });

    // Kick off port adoption in child
    const targetOrigin = this.opts.walletOrigin || '*';
    iframeEl.contentWindow.postMessage({ type: 'CONNECT' }, targetOrigin, [childPort]);
    this.port = port;
    this.port.onmessage = (e) => this.onPortMessage(e);
    this.port.start?.();
    await readyPromise;
  }

  private onPortMessage(e: MessageEvent) {
    const msg = e.data as ChildToParentEnvelope;
    if (!msg || typeof msg !== 'object') return;

    // Ready/Pong/Progress are fire-and-forget unless correlated
    if (msg.type === 'PROGRESS') return;

    const requestId = (msg as any).requestId as string | undefined;
    if (!requestId) return;

    const pending = this.pending.get(requestId);
    if (!pending) return;
    this.pending.delete(requestId);
    if (pending.timer) window.clearTimeout(pending.timer);

    if (msg.type === 'ERROR') {
      const err = new Error((msg.payload as any)?.message || 'Service error');
      (err as any).code = (msg.payload as any)?.code;
      (err as any).details = (msg.payload as any)?.details;
      pending.reject(err);
      return;
    }

    pending.resolve(msg.payload);
  }

  private post<T = any>(envelope: Omit<ParentToChildEnvelope, 'requestId'>): Promise<T> {
    if (!this.ready || !this.port) return Promise.reject(new Error('Service iframe not ready'));
    const requestId = `${Date.now()}-${++this.reqCounter}`;
    const full: ParentToChildEnvelope = { ...envelope, requestId } as any;

    return new Promise<T>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`Service request timeout for ${envelope.type}`));
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
}
