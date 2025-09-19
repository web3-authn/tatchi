/**
 * IframeTransport
 *
 * Encapsulates all logic for safely creating, loading and connecting to the
 * wallet service iframe, including:
 * - DOM creation and attribute hardening (sandbox/allow)
 * - Waiting for the load event to avoid early postMessage races
 * - Performing a robust CONNECT → READY handshake using MessageChannel
 * - Handling cross‑origin boot latency (optional SERVICE_HOST_BOOTED hint)
 * - Deduplicating concurrent connect() calls
 *
 * This module exposes a small surface area that the higher‑level
 * WalletIframeRouter can depend on without worrying about browser quirks.
 */

import type { ChildToParentEnvelope } from '../shared/messages';
import { isObject } from '../validation';
import { sanitizeSdkBasePath, escapeHtmlAttribute } from '../sanitization';

export interface IframeTransportOptions {
  walletOrigin?: string;     // e.g., https://wallet.example.com (optional; empty => same-origin srcdoc)
  servicePath?: string;      // default '/service'
  sdkBasePath?: string;      // base for same-origin srcdoc, default '/sdk'
  connectTimeoutMs?: number; // total budget for handshake retries
}

export class IframeTransport {
  private readonly opts: Required<IframeTransportOptions>;
  private iframeEl: HTMLIFrameElement | null = null;
  private serviceBooted = false; // set when wallet host sends SERVICE_HOST_BOOTED (best-effort only)
  private connectInFlight: Promise<MessagePort> | null = null;

  constructor(options: IframeTransportOptions) {
    this.opts = {
      walletOrigin: '',
      servicePath: '/service',
      sdkBasePath: '/sdk',
      connectTimeoutMs: 8000,
      ...options,
    } as Required<IframeTransportOptions>;

    // Listen for a best-effort boot hint from the wallet host. Not required for correctness,
    // but helps reduce redundant CONNECT posts while the host script is still booting.
    try {
      const { walletOrigin } = this.opts;
      if (walletOrigin) {
        window.addEventListener('message', (e) => {
          const data = e.data as unknown;
          // Narrow to expected boot message shape without using any
          if (
            e.origin === walletOrigin &&
            isObject(data) &&
            (data as { type?: unknown }).type === 'SERVICE_HOST_BOOTED'
          ) {
            try { console.debug('[IframeTransport] SERVICE_HOST_BOOTED from wallet'); } catch {}
            this.serviceBooted = true;
          }
        });
      }
    } catch {}
  }

  /** Returns the underlying iframe element if it exists. */
  getIframeEl(): HTMLIFrameElement | null { return this.iframeEl; }

  /** Ensure the iframe element exists and is appended to the DOM. Idempotent. */
  ensureIframeMounted(): HTMLIFrameElement {
    if (this.iframeEl) return this.iframeEl;

    const iframe = document.createElement('iframe');
    // Hidden by default; higher layers can temporarily show for activation.
    iframe.style.position = 'fixed';
    iframe.style.width = '0px';
    iframe.style.height = '0px';
    iframe.style.opacity = '0';
    iframe.style.pointerEvents = 'none';
    iframe.setAttribute('aria-hidden', 'true');
    iframe.setAttribute('tabindex', '-1');

    // Sandbox only for same‑origin srcdoc case; cross‑origin service pages
    // avoid sandbox for consistent MessagePort behavior across browsers.
    if (!this.opts.walletOrigin) {
      iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');
    }

    // Delegate WebAuthn capabilities to the wallet origin frame when cross-origin
    try {
      if (this.opts.walletOrigin) {
        const origin = new URL(this.opts.walletOrigin).origin;
        const allow = `publickey-credentials-get ${origin}; publickey-credentials-create ${origin}`;
        iframe.setAttribute('allow', allow);
      } else {
        iframe.setAttribute('allow', "publickey-credentials-get 'self'; publickey-credentials-create 'self'");
      }
    } catch {
      iframe.setAttribute('allow', "publickey-credentials-get 'self'; publickey-credentials-create 'self'");
    }

    // Track load state to guard against races where we post before content is listening
    try {
      iframe._svc_loaded = false;
      iframe.addEventListener('load', () => { iframe._svc_loaded = true; }, { once: true });
    } catch {}

    // Choose source based on origin configuration
    if (this.opts.walletOrigin) {
      const src = new URL(this.opts.servicePath, this.opts.walletOrigin).toString();
      try { console.debug('[IframeTransport] mount: external origin', src); } catch {}
      iframe.src = src;
    } else {
      // Same‑origin: embed host via srcdoc referencing SDK assets. This avoids bundler/path issues.
      const sanitizedBasePath = sanitizeSdkBasePath(this.opts.sdkBasePath);
      const serviceHostUrl = `${sanitizedBasePath}/esm/react/embedded/wallet-iframe-host.js`;
      const escapedUrl = escapeHtmlAttribute(serviceHostUrl);
      const html = `<!doctype html><html><head><meta charset="utf-8"/><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"/></head><body><script type=\"module\" src=\"${escapedUrl}\"></script></body></html>`;
      iframe.srcdoc = html;
    }

    document.body.appendChild(iframe);
    try { console.debug('[IframeTransport] mount: iframe appended'); } catch {}
    this.iframeEl = iframe;
    return iframe;
  }

  /**
   * Connect to the wallet iframe using a MessageChannel handshake.
   * - Repeatedly posts {type:'CONNECT'} with a fresh port until a 'READY' message arrives
   * - Times out after connectTimeoutMs
   * - Deduplicates concurrent calls and returns the same MessagePort promise
   */
  async connect(): Promise<MessagePort> {
    if (this.connectInFlight) return this.connectInFlight;
    this.connectInFlight = (async () => {
      const iframe = this.ensureIframeMounted();

      // Ensure load fired at least once so the host script can attach listeners
      await this.waitForLoad(iframe);

      // For cross-origin pages, give the host a brief moment to boot its script
      if (this.opts.walletOrigin) {
        const bootWaitMs = Math.min(this.opts.connectTimeoutMs / 4, 1500);
        const startBoot = Date.now();
        while (!this.serviceBooted && (Date.now() - startBoot) < bootWaitMs) {
          await new Promise(r => setTimeout(r, 50));
        }
      }

      let resolved = false;
      let attempt = 0;
      const start = Date.now();
      const overallTimeout = this.opts.connectTimeoutMs;

      const port = await new Promise<MessagePort>((resolve, reject) => {
        const tick = () => {
          if (resolved) return;
          const elapsed = Date.now() - start;
          if (elapsed >= overallTimeout) {
            try { console.debug('[IframeTransport] handshake timeout after %d ms', elapsed); } catch {}
            return reject(new Error('Wallet iframe READY timeout'));
          }

          attempt += 1;
          const channel = new MessageChannel();
          const port1 = channel.port1;
          const port2 = channel.port2;
          const cleanup = () => { try { port1.onmessage = null; } catch {} };

          port1.onmessage = (e: MessageEvent<ChildToParentEnvelope>) => {
            const data = e.data;
            if (data.type === 'READY') {
              resolved = true;
              cleanup();
              port1.start?.();
              return resolve(port1);
            }
          };

          const cw = iframe.contentWindow;
          if (!cw) {
            cleanup();
            return reject(new Error('Wallet iframe window missing'));
          }
          // Use '*' for target origin when posting the initial CONNECT with a MessagePort.
          // We are addressing the iframe's contentWindow directly, so there is no
          // risk of delivering the message to an unintended window, and some
          // environments have shown brittleness when specifying an explicit
          // origin during early boot (e.g., port not delivered). The host-side
          // listener already validates the envelope shape before adopting the port.
          cw.postMessage({ type: 'CONNECT' }, '*', [port2]);

          // Schedule next tick if not resolved yet (light backoff to reduce spam)
          const interval = attempt < 10 ? 200 : attempt < 20 ? 400 : 800;
          setTimeout(() => { if (!resolved) tick(); }, interval);
        };

        tick();
      });

      return port;
    })();

    try {
      return await this.connectInFlight;
    } finally {
      this.connectInFlight = null;
    }
  }

  /** Guard against posting to the iframe before it has fired load. */
  private async waitForLoad(iframe: HTMLIFrameElement): Promise<void> {
    if (iframe._svc_loaded) return;
    await new Promise<void>((resolve) => {
      try {
        iframe.addEventListener?.('load', () => resolve(), { once: true });
        // Safety net: resolve shortly even if load listener fails to attach
        setTimeout(() => resolve(), 150);
      } catch {
        resolve();
      }
    });
  }
}
