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
import { serializeRegistrationCredentialWithPRF, serializeAuthenticationCredentialWithPRF } from '../../WebAuthnManager/credentialsHelpers';

// Message constants for clarity and typo safety
const MSG_CONNECT = 'CONNECT' as const;
const MSG_READY = 'READY' as const;
const MSG_SERVICE_HOST_BOOTED = 'SERVICE_HOST_BOOTED' as const;
const MSG_SERVICE_HOST_DEBUG_ORIGIN = 'SERVICE_HOST_DEBUG_ORIGIN' as const;
const MSG_SERVICE_HOST_LOG = 'SERVICE_HOST_LOG' as const;
const MSG_CREATE = 'WALLET_WEBAUTHN_CREATE' as const;
const MSG_GET = 'WALLET_WEBAUTHN_GET' as const;
const MSG_CREATE_RESULT = 'WALLET_WEBAUTHN_CREATE_RESULT' as const;
const MSG_GET_RESULT = 'WALLET_WEBAUTHN_GET_RESULT' as const;

// Bridge request payloads
type CreateReq = { requestId?: string; publicKey?: PublicKeyCredentialCreationOptions };
type GetReq = { requestId?: string; publicKey?: PublicKeyCredentialRequestOptions };

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
        if (!isObject(data)) return;
        const type = (data as { type?: unknown }).type;
        if (type === 'SERVICE_HOST_BOOTED' && e.origin === this.walletOrigin) {
          this.serviceBooted = true;
          return;
        }
        if (type === 'SERVICE_HOST_DEBUG_ORIGIN') {
        }
        if (type === 'SERVICE_HOST_LOG') {
          // Only surface wallet logs when debug is enabled
          console.debug('[IframeTransport][wallet-log]', (data as { payload?: unknown }).payload);
        }
        // Parent‑performed WebAuthn bridge for Safari cross‑origin scenarios.
        // Only accept requests originating from the wallet iframe origin.
        if (e.origin === this.walletOrigin) {
          if (type === 'WALLET_WEBAUTHN_CREATE' || type === 'WALLET_WEBAUTHN_GET') {
            // Delegate to common bridge handler
            this.performWebAuthnBridge(type as 'WALLET_WEBAUTHN_CREATE' | 'WALLET_WEBAUTHN_GET', data, e);
            return;
          }
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
      iframe.setAttribute('allow', this.buildAllowAttr(this.walletOrigin));
    } catch {
      iframe.setAttribute('allow', "publickey-credentials-get 'self'; publickey-credentials-create 'self'; clipboard-read; clipboard-write");
    }

    // Track load state to guard against races where we post before content is listening
    try {
      iframe._svc_loaded = false;
      iframe.addEventListener('load', () => { iframe._svc_loaded = true; }, { once: true });
    } catch {}

    const src = this.walletServiceUrl.toString();
    console.debug('[IframeTransport] mount: external origin', src);
    iframe.src = src;

    document.body.appendChild(iframe);
    console.debug('[IframeTransport] mount: iframe appended');
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
            console.debug('[IframeTransport] handshake timeout after %d ms', elapsed);
            return reject(new Error('Wallet iframe READY timeout'));
          }

          attempt += 1;
          const channel = new MessageChannel();
          const port1 = channel.port1;
          const port2 = channel.port2;
          const cleanup = () => { try { port1.onmessage = null; } catch {} };

          port1.onmessage = (e: MessageEvent<ChildToParentEnvelope>) => {
            const data = e.data;
            if (data.type === MSG_READY) {
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
            cw.postMessage({ type: MSG_CONNECT }, this.walletOrigin, [port2]);
            } catch (e) {
              const message = e instanceof Error ? e.message ?? String(e) : String(e);
              if (!warnedNullOrigin && message.includes("'null'")) {
                warnedNullOrigin = true;
                console.warn(
                  '[IframeTransport] CONNECT blocked; iframe origin appears to be null. Check that %s is reachable and responds with Cross-Origin-Resource-Policy: cross-origin.',
                  this.walletServiceUrl.toString(),
                );
              }
              // Some browsers will throw if the current document has an opaque
              // ('null') origin during early navigation. As a pragmatic fallback,
              // attempt a wildcard target to avoid dropping the port, then keep
              // retrying with the strict origin until timeout.
            try {
              cw.postMessage({ type: MSG_CONNECT }, '*', [port2]);
              console.debug('[IframeTransport] CONNECT fallback posted with "*" target; continuing retries');
            } catch {}
            console.debug('[IframeTransport] CONNECT attempt %d threw after %d ms; retrying.', attempt, elapsed);
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
        let timeout: number | undefined;
        iframe.addEventListener?.('load', () => {
          if (typeof timeout === 'number') {
            clearTimeout(timeout);
          }
          resolve();
        }, { once: true });
        // Safety net: resolve shortly even if load listener fails to attach
        timeout = window.setTimeout(() => {
          console.debug('[IframeTransport] waitForLoad did not observe load event within 150ms; continuing');
          resolve();
        }, 150);
      } catch {
        resolve();
      }
    });
  }

  private buildAllowAttr(walletOrigin: string): string {
    return `publickey-credentials-get 'self' ${walletOrigin}; publickey-credentials-create 'self' ${walletOrigin}; clipboard-read; clipboard-write`;
  }

  private postBridgeResult(
    source: WindowProxy | null,
    type: 'WALLET_WEBAUTHN_CREATE_RESULT' | 'WALLET_WEBAUTHN_GET_RESULT',
    requestId: string,
    ok: boolean,
    payload: { credential?: unknown; error?: string },
  ): void {
    try { source?.postMessage({ type, requestId, ok, ...payload }, this.walletOrigin); } catch {}
  }

  private performWebAuthnBridge(
    kind: typeof MSG_CREATE | typeof MSG_GET,
    raw: unknown,
    e: MessageEvent,
  ): void {
    if (kind === MSG_CREATE) {
      (async () => {
        const req = raw as CreateReq;
        const requestId = req?.requestId || '';
        try {
          const src = req?.publicKey || ({} as PublicKeyCredentialCreationOptions);
          const rpName = src.rp?.name || 'WebAuthn';
          const rpId = src.rp?.id || window.location.hostname;
          const pub: PublicKeyCredentialCreationOptions = { ...src, rp: { name: rpName, id: rpId } };
          console.debug('[IframeTransport][bridge] CREATE received', { requestId, from: e.origin, rpId: pub.rp?.id });
          const cred = await navigator.credentials.create({ publicKey: pub }) as PublicKeyCredential;
          const serialized = serializeRegistrationCredentialWithPRF({ credential: cred, firstPrfOutput: true, secondPrfOutput: true });
          this.postBridgeResult(e.source as WindowProxy | null, MSG_CREATE_RESULT, requestId, true, { credential: serialized });
          console.debug('[IframeTransport][bridge] CREATE ok', { requestId });
        } catch (err) {
          try { console.warn('[IframeTransport][bridge] CREATE failed', { requestId, err: String((err as Error)?.message || err) }); } catch {}
          this.postBridgeResult(e.source as WindowProxy | null, MSG_CREATE_RESULT, requestId, false, { error: String((err as Error)?.message || err) });
        }
      })();
      return;
    }

    // kind === 'WALLET_WEBAUTHN_GET'
    (async () => {
      const req = raw as GetReq;
      const requestId = req?.requestId || '';
      try {
        const src = req?.publicKey || ({} as PublicKeyCredentialRequestOptions);
        const rpId = src.rpId || window.location.hostname;
        const pub: PublicKeyCredentialRequestOptions = { ...src, rpId };
        console.debug('[IframeTransport][bridge] GET received', { requestId, from: e.origin, rpId: pub.rpId });
        const cred = await navigator.credentials.get({ publicKey: pub }) as PublicKeyCredential;
        const serialized = serializeAuthenticationCredentialWithPRF({ credential: cred, firstPrfOutput: true, secondPrfOutput: true });
        this.postBridgeResult(e.source as WindowProxy | null, MSG_GET_RESULT, requestId, true, { credential: serialized });
        console.debug('[IframeTransport][bridge] GET ok', { requestId });
      } catch (err) {
        try { console.warn('[IframeTransport][bridge] GET failed', { requestId, err: String((err as Error)?.message || err) }); } catch {}
        this.postBridgeResult(e.source as WindowProxy | null, MSG_GET_RESULT, requestId, false, { error: String((err as Error)?.message || err) });
      }
    })();
  }
}
