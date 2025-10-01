/**
 * IframeTransport - Client-Side Communication Layer
 *
 * This module handles the low-level iframe management and connection establishment.
 * It encapsulates all the complex browser-specific logic for safely creating and
 * connecting to the wallet service iframe.
 *
 * Key Responsibilities:
 * - Iframe Creation: Creates and mounts the iframe element with proper security attributes
 * - Security Hardening: Sets appropriate allow/sandbox attributes for WebAuthn and clipboard access
 * - Load Event Handling: Waits for iframe load to avoid postMessage races
 * - Connection Handshake: Performs robust CONNECT → READY handshake using MessageChannel
 * - Boot Latency Handling: Manages cross-origin boot delays with SERVICE_HOST_BOOTED hints
 * - Connection Deduplication: Prevents multiple concurrent connection attempts
 * - Error Handling: Provides clear error messages for connection failures
 *
 * Security Model:
 * - Uses explicit allow attributes for WebAuthn and clipboard permissions
 * - Avoids sandboxing for cross-origin deployments (prevents MessagePort transfer issues)
 * - Validates wallet origin URLs to prevent security issues
 * - Uses MessageChannel for secure, bidirectional communication
 *
 * Browser Compatibility:
 * - Handles various browser quirks around iframe loading and MessagePort transfer
 * - Provides fallback behavior for different browser implementations
 * - Manages timing issues with cross-origin iframe boot sequences
 */

import type { ChildToParentEnvelope } from '../shared/messages';
import { isObject } from '../validation';

export interface IframeTransportOptions {
  walletOrigin: string;     // e.g., https://wallet.example.com
  servicePath?: string;      // default '/service'
  connectTimeoutMs?: number; // total budget for handshake retries
}

export class IframeTransport {
  private readonly opts: Required<IframeTransportOptions>;
  private iframeEl: HTMLIFrameElement | null = null;
  private serviceBooted = false; // set when wallet host sends SERVICE_HOST_BOOTED (best-effort only)
  private connectInFlight: Promise<MessagePort> | null = null;
  private readonly walletServiceUrl: URL;
  private readonly walletOrigin: string;

  constructor(options: IframeTransportOptions) {
    this.opts = {
      servicePath: '/service',
      connectTimeoutMs: 8000,
      ...options,
    } as Required<IframeTransportOptions>;

    try {
      this.walletServiceUrl = new URL(this.opts.servicePath, this.opts.walletOrigin);
    } catch (err) {
      throw new Error(`[IframeTransport] Invalid wallet origin (${options.walletOrigin}) or servicePath (${options.servicePath || '/service'})`);
    }
    this.walletOrigin = this.walletServiceUrl.origin;

    // Listen for a best-effort boot hint from the wallet host. Not required for correctness,
    // but helps reduce redundant CONNECT posts while the host script is still booting.
    try {
      window.addEventListener('message', (e) => {
        const data = e.data as unknown;
        if (
          e.origin === this.walletOrigin &&
          isObject(data) &&
          (data as { type?: unknown }).type === 'SERVICE_HOST_BOOTED'
        ) {
          try { console.debug('[IframeTransport] SERVICE_HOST_BOOTED from wallet'); } catch {}
          this.serviceBooted = true;
        }
      });
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
    iframe.style.border = 'none';
    iframe.style.boxSizing = 'border-box';
    iframe.style.width = '0px';
    iframe.style.height = '0px';
    iframe.style.opacity = '0';
    iframe.style.pointerEvents = 'none';
    iframe.setAttribute('aria-hidden', 'true');
    iframe.setAttribute('tabindex', '-1');

    // Delegate WebAuthn + clipboard capabilities to the wallet origin frame
    try {
      const allow = `publickey-credentials-get ${this.walletOrigin}; publickey-credentials-create ${this.walletOrigin}; clipboard-read; clipboard-write`;
      iframe.setAttribute('allow', allow);
    } catch {
      iframe.setAttribute('allow', "publickey-credentials-get 'self'; publickey-credentials-create 'self'; clipboard-read; clipboard-write");
    }

    // Track load state to guard against races where we post before content is listening
    try {
      iframe._svc_loaded = false;
      iframe.addEventListener('load', () => { iframe._svc_loaded = true; }, { once: true });
    } catch {}

    const src = this.walletServiceUrl.toString();
    try { console.debug('[IframeTransport] mount: external origin', src); } catch {}
    iframe.src = src;

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
      const bootWaitMs = Math.min(this.opts.connectTimeoutMs / 4, 1500);
      const startBoot = Date.now();
      while (!this.serviceBooted && (Date.now() - startBoot) < bootWaitMs) {
        await new Promise(r => setTimeout(r, 50));
      }

      let resolved = false;
      let attempt = 0;
      let warnedNullOrigin = false;
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

          // Ensure the receiving side is actively listening before we post the CONNECT
          try { port1.start?.(); } catch {}

          const cw = iframe.contentWindow;
          if (!cw) {
            cleanup();
            return reject(new Error('Wallet iframe window missing'));
          }
          // Explicitly target the wallet origin so Chromium delivers the MessagePort
          // transfer across origins. Using '*' can silently drop the transferable
          // port in stricter environments, preventing the host from ever adopting it.
          try {
            cw.postMessage({ type: 'CONNECT' }, this.walletOrigin, [port2]);
          } catch (e) {
            const message = e instanceof Error ? e.message ?? String(e) : String(e);
            if (!warnedNullOrigin && message.includes("'null'")) {
              warnedNullOrigin = true;
              try {
                console.warn(
                  '[IframeTransport] CONNECT blocked; iframe origin appears to be null. Check that %s is reachable and responds with Cross-Origin-Resource-Policy: cross-origin.',
                  this.walletServiceUrl.toString(),
                );
              } catch {}
            }
            // Some browsers will throw if the current document has an opaque
            // ('null') origin during early navigation. As a pragmatic fallback,
            // attempt a wildcard target to avoid dropping the port, then keep
            // retrying with the strict origin until timeout.
            try {
              cw.postMessage({ type: 'CONNECT' }, '*', [port2]);
              console.debug('[IframeTransport] CONNECT fallback posted with "*" target; continuing retries');
            } catch {}
            try { console.debug('[IframeTransport] CONNECT postMessage threw; retrying', e); } catch {}
          }

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
