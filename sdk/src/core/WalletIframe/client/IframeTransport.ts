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
import { isObject } from '@/utils/validation';
import { serializeRegistrationCredentialWithPRF, serializeAuthenticationCredentialWithPRF } from '../../WebAuthnManager/credentialsHelpers';
import { ensureOverlayBase } from './overlay-styles';
import { WebAuthnBridgeMessage } from '../../WebAuthnManager/WebAuthnFallbacks';

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const WILDCARD_CONNECT_ATTEMPTS = 6;

// Message constants (typed string literals, tree‑shake friendly)
export const IframeMessage = {
  Connect: 'CONNECT',
  Ready: 'READY',
  HostBooted: 'SERVICE_HOST_BOOTED',
  HostDebugOrigin: 'SERVICE_HOST_DEBUG_ORIGIN',
  HostLog: 'SERVICE_HOST_LOG',
} as const;

// Bridge request payloads
type CreateReq = { requestId?: string; publicKey?: PublicKeyCredentialCreationOptions };
type GetReq = { requestId?: string; publicKey?: PublicKeyCredentialRequestOptions };

export interface IframeTransportOptions {
  walletOrigin: string;     // e.g., https://wallet.example.com
  servicePath?: string;      // default '/wallet-service'
  connectTimeoutMs?: number; // total budget for handshake retries
  debug?: boolean;           // enable verbose transport logging
  testOptions?: {
    routerId?: string;         // identity tag for the iframe element
    ownerTag?: string;         // e.g., 'app' | 'tests'
  };
}

export class IframeTransport {
  private readonly opts: Required<IframeTransportOptions>;
  private iframeEl: HTMLIFrameElement | null = null;
  private serviceBooted = false; // set when wallet host sends SERVICE_HOST_BOOTED (best-effort only)
  private connectInFlight: Promise<MessagePort> | null = null;
  private readonly walletServiceUrl: URL;
  private readonly walletOrigin: string;
  private readonly testOptions: { routerId?: string; ownerTag?: string };
  private debug = false;
  private readonly onWindowMessage = (e: MessageEvent): void => {
    const data = e.data as unknown;
    if (!isObject(data)) return;
    const type = (data as { type?: unknown }).type;
    if (type === IframeMessage.HostDebugOrigin) {
      if (this.debug) {
        console.debug('[IframeTransport][host-origin]', {
          origin: (data as { origin?: unknown }).origin,
          href: (data as { href?: unknown }).href,
          eventOrigin: e.origin,
        });
      }
      return;
    }
    if (e.origin !== this.walletOrigin) return;
    if (type === IframeMessage.HostBooted) {
      this.serviceBooted = true;
      return;
    }
    if (type === IframeMessage.HostLog) {
      if (this.debug) {
        console.debug('[IframeTransport][wallet-log]', (data as { payload?: unknown }).payload);
      }
      return;
    }
    if (type === WebAuthnBridgeMessage.Create || type === WebAuthnBridgeMessage.Get) {
      this.performWebAuthnBridge(type as typeof WebAuthnBridgeMessage.Create | typeof WebAuthnBridgeMessage.Get, data, e);
    }
  };

  constructor(options: IframeTransportOptions) {
    this.opts = {
      servicePath: '/wallet-service',
      connectTimeoutMs: 8000,
      debug: false,
      ...options,
    } as Required<IframeTransportOptions>;

    try {
      this.walletServiceUrl = new URL(this.opts.servicePath, this.opts.walletOrigin);
    } catch (err) {
      throw new Error(`[IframeTransport] Invalid wallet origin (${options.walletOrigin}) or servicePath (${options.servicePath || '/wallet-service'})`);
    }
    this.walletOrigin = this.walletServiceUrl.origin;
    this.testOptions = {
      routerId: options.testOptions?.routerId,
      ownerTag: options.testOptions?.ownerTag,
    };
    this.debug = !!this.opts.debug;

    // Listen for a best-effort boot hint from the wallet host. Not required for correctness,
    // but helps reduce redundant CONNECT posts while the host script is still booting.
    if (typeof window !== 'undefined') {
      window.addEventListener('message', this.onWindowMessage);
    }
  }

  /** Returns the underlying iframe element if it exists. */
  getIframeEl(): HTMLIFrameElement | null { return this.iframeEl; }

  /** Remove global listeners created by this transport instance. */
  dispose(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('message', this.onWindowMessage);
    }
  }

  private isDevHost(): boolean {
    if (typeof window === 'undefined') return false;
    const env = (globalThis as { process?: { env?: Record<string, string | undefined> } })?.process?.env?.NODE_ENV;
    if (env && env !== 'production') return true;
    const h = window.location.hostname || '';
    return /localhost|127\.(?:0|[1-9]\d?)\.(?:0|[1-9]\d?)\.(?:0|[1-9]\d?)|\.local(?:host)?$/i.test(h);
  }

  private isOverlayForOrigin(el: HTMLIFrameElement): boolean {
    const dsOrigin = (el as { dataset?: { w3aOrigin?: string } }).dataset?.w3aOrigin;
    if (dsOrigin) return dsOrigin === this.walletOrigin;
    try {
      return new URL(el.src).origin === this.walletOrigin;
    } catch {
      return false;
    }
  }

  /**
   * Guardrail: prevent multiple overlay iframes accumulating when apps accidentally
   * create more than one WalletIframeRouter/TatchiPasskey instance.
   */
  private removeExistingOverlaysForOrigin(): void {
    if (typeof document === 'undefined') return;
    const existing = Array.from(document.querySelectorAll('iframe.w3a-wallet-overlay')) as HTMLIFrameElement[];
    const matches = existing.filter((el) => this.isOverlayForOrigin(el));
    if (!matches.length) return;

    if (this.isDevHost()) {
      const routerIds = matches
        .map((el) => (el as { dataset?: { w3aRouterId?: string } }).dataset?.w3aRouterId)
        .filter((v): v is string => typeof v === 'string' && v.length > 0);
      console.warn(
        `[IframeTransport] Found existing wallet overlay iframe(s) for ${this.walletOrigin}. This usually indicates multiple SDK instances. Removing old iframe(s) to avoid duplicates.`,
        { count: matches.length, routerIds }
      );
    }

    for (const el of matches) {
      try { el.remove(); } catch {}
    }
  }

  /** Ensure the iframe element exists and is appended to the DOM. Idempotent. */
  ensureIframeMounted(): HTMLIFrameElement {
    if (this.iframeEl) {
      return this.iframeEl;
    }

    this.removeExistingOverlaysForOrigin();

    const iframe = document.createElement('iframe');
    // Hidden by default via CSS classes; higher layers toggle state using overlay-styles.
    iframe.classList.add('w3a-wallet-overlay', 'is-hidden');
    // Ensure the base overlay stylesheet is installed early so computed styles
    // (opacity/pointer-events) reflect the hidden state immediately after mount.
    try { ensureOverlayBase(iframe); } catch {}
    // Ensure no initial footprint even before stylesheet attaches
    iframe.setAttribute('width', '0');
    iframe.setAttribute('height', '0');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.setAttribute('tabindex', '-1');
    // Hint higher priority fetch for the iframe document on supporting browsers
    iframe.setAttribute('loading', 'eager');
    iframe.setAttribute('fetchpriority', 'high');

    iframe.dataset.w3aRouterId = this.testOptions?.routerId || '';
    if (this.testOptions?.ownerTag) iframe.dataset.w3aOwner = this.testOptions.ownerTag;
    iframe.dataset.w3aOrigin = this.walletOrigin;

    // Delegate WebAuthn + clipboard capabilities to the wallet origin frame
    try {
      iframe.setAttribute('allow', this.buildAllowAttr(this.walletOrigin));
    } catch {
      iframe.setAttribute('allow', "publickey-credentials-get 'self'; publickey-credentials-create 'self'; clipboard-read; clipboard-write");
    }

    // Track load state to guard against races where we post before content is listening
    iframe._svc_loaded = false;
    iframe.addEventListener('load', () => { iframe._svc_loaded = true; }, { once: true });

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

      // For cross-origin pages, give the host only a very brief moment to boot its script
      // Keep this low to avoid adding noticeable latency to the first CONNECT attempt.
      // The handshake will continue retrying regardless, so a shorter wait improves TTFB.
      const bootWaitMs = Math.min(this.opts.connectTimeoutMs / 12, 300);
      await this.waitForBootHint(bootWaitMs);

      return this.handshake(iframe);
    })();

    try {
      return await this.connectInFlight;
    } finally {
      this.connectInFlight = null;
    }
  }

  private async waitForBootHint(timeoutMs: number): Promise<void> {
    if (this.serviceBooted || timeoutMs <= 0) return;
    const start = Date.now();
    while (!this.serviceBooted && (Date.now() - start) < timeoutMs) {
      await sleep(50);
    }
  }

  private async handshake(iframe: HTMLIFrameElement): Promise<MessagePort> {
    let resolved = false;
    let attempt = 0;
    let warnedNullOrigin = false;
    const start = Date.now();
    const overallTimeout = this.opts.connectTimeoutMs;

    return await new Promise<MessagePort>((resolve, reject) => {
      const tick = () => {
        if (resolved) return;
        const elapsed = Date.now() - start;
        if (elapsed >= overallTimeout) {
          resolved = true;
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
          if (data.type === IframeMessage.Ready) {
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
          resolved = true;
          cleanup();
          return reject(new Error('Wallet iframe window missing'));
        }
        // Use strict origin once the host is booted; allow a short wildcard window
        // to tolerate opaque/unstable origins and dev mismatches until READY arrives.
        const targetOrigin = this.getConnectTargetOrigin(attempt);
        ({ warnedNullOrigin } = this.postConnectMessage(
          cw,
          { type: IframeMessage.Connect },
          port2,
          targetOrigin,
          warnedNullOrigin,
          elapsed,
          attempt,
        ));

        // Schedule next tick if not resolved yet (light backoff to reduce spam)
        const interval = attempt < 10 ? 200 : attempt < 20 ? 400 : 800;
        setTimeout(() => { if (!resolved) tick(); }, interval);
      };

      tick();
    });
  }

  private getConnectTargetOrigin(attempt: number): string {
    if (this.serviceBooted) return this.walletOrigin;
    if (attempt <= WILDCARD_CONNECT_ATTEMPTS) return '*';
    return this.walletOrigin;
  }

  private postConnectMessage(
    cw: Window,
    data: unknown,
    port2: MessagePort,
    targetOrigin: string,
    warnedNullOrigin: boolean,
    elapsed: number,
    attempt: number,
  ): { warnedNullOrigin: boolean } {
    try {
      cw.postMessage(data, targetOrigin, [port2]);
      return { warnedNullOrigin };
    } catch (e) {
      const message = e instanceof Error ? e.message ?? String(e) : String(e);
      if (!warnedNullOrigin && message.includes("'null'")) {
        warnedNullOrigin = true;
        console.warn('[IframeTransport] CONNECT blocked; iframe origin appears to be null. Check that %s is reachable and responds with Cross-Origin-Resource-Policy: cross-origin.', this.walletServiceUrl.toString());
      }
      // Attempt wildcard fallback and continue retries
      try { cw.postMessage(data, '*', [port2]); } catch {}
      console.debug('[IframeTransport] CONNECT attempt %d threw after %d ms; retrying.', attempt, elapsed);
      return { warnedNullOrigin };
    }
  }

  /** Guard against posting to the iframe before it has fired load. */
  private async waitForLoad(iframe: HTMLIFrameElement): Promise<void> {
    if (iframe._svc_loaded) return;
    await new Promise<void>((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        resolve();
      };
      const timeout = window.setTimeout(() => {
        if (!done && this.debug) {
          console.debug('[IframeTransport] waitForLoad did not observe load event within 150ms; continuing');
        }
        finish();
      }, 150);
      iframe.addEventListener('load', () => {
        clearTimeout(timeout);
        finish();
      }, { once: true });
    });
  }

  private buildAllowAttr(walletOrigin: string): string {
    return `publickey-credentials-get 'self' ${walletOrigin}; publickey-credentials-create 'self' ${walletOrigin}; clipboard-read; clipboard-write`;
  }

  private formatBridgeError(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
  }

  private postBridgeResult(
    source: WindowProxy | null,
    type: 'WALLET_WEBAUTHN_CREATE_RESULT' | 'WALLET_WEBAUTHN_GET_RESULT',
    requestId: string,
    ok: boolean,
    payload: { credential?: unknown; error?: string },
  ): void {
    // Reply directly to the requesting window; wildcard target avoids transient
    // 'null' origin warnings during early navigation while remaining safe since
    // we already validated the sender's origin before bridging.
    source?.postMessage({ type, requestId, ok, ...payload }, '*');
  }

  private performWebAuthnBridge(
    kind: typeof WebAuthnBridgeMessage.Create | typeof WebAuthnBridgeMessage.Get,
    raw: unknown,
    e: MessageEvent,
  ): void {
    if (kind === WebAuthnBridgeMessage.Create) {
      void this.handleWebAuthnCreate(raw as CreateReq, e);
      return;
    }
    // kind === 'WALLET_WEBAUTHN_GET'
    void this.handleWebAuthnGet(raw as GetReq, e);
  }

  private async handleWebAuthnCreate(req: CreateReq, e: MessageEvent): Promise<void> {
    const requestId = req?.requestId || '';
    if (!isObject(req?.publicKey)) {
      this.postBridgeResult(e.source as WindowProxy | null, WebAuthnBridgeMessage.CreateResult, requestId, false, { error: 'publicKey options required' });
      return;
    }
    if (!navigator.credentials?.create) {
      this.postBridgeResult(e.source as WindowProxy | null, WebAuthnBridgeMessage.CreateResult, requestId, false, { error: 'WebAuthn create not available' });
      return;
    }
    try {
      const src = req.publicKey as PublicKeyCredentialCreationOptions;
      const rpName = src.rp?.name || 'WebAuthn';
      const rpId = src.rp?.id || window.location.hostname;
      const pub: PublicKeyCredentialCreationOptions = { ...src, rp: { name: rpName, id: rpId } };
      const cred = await navigator.credentials.create({ publicKey: pub }) as PublicKeyCredential;
      const serialized = serializeRegistrationCredentialWithPRF({ credential: cred, firstPrfOutput: true, secondPrfOutput: true });
      this.postBridgeResult(e.source as WindowProxy | null, WebAuthnBridgeMessage.CreateResult, requestId, true, { credential: serialized });
    } catch (err) {
      const message = this.formatBridgeError(err);
      console.warn('[IframeTransport][bridge] CREATE failed', { requestId, err: message });
      this.postBridgeResult(e.source as WindowProxy | null, WebAuthnBridgeMessage.CreateResult, requestId, false, { error: message });
    }
  }

  private async handleWebAuthnGet(req: GetReq, e: MessageEvent): Promise<void> {
    const requestId = req?.requestId || '';
    if (!isObject(req?.publicKey)) {
      this.postBridgeResult(e.source as WindowProxy | null, WebAuthnBridgeMessage.GetResult, requestId, false, { error: 'publicKey options required' });
      return;
    }
    if (!navigator.credentials?.get) {
      this.postBridgeResult(e.source as WindowProxy | null, WebAuthnBridgeMessage.GetResult, requestId, false, { error: 'WebAuthn get not available' });
      return;
    }
    try {
      const src = req.publicKey as PublicKeyCredentialRequestOptions;
      const rpId = src.rpId || window.location.hostname;
      const pub: PublicKeyCredentialRequestOptions = { ...src, rpId };
      const cred = await navigator.credentials.get({ publicKey: pub }) as PublicKeyCredential;
      const serialized = serializeAuthenticationCredentialWithPRF({ credential: cred, firstPrfOutput: true, secondPrfOutput: true });
      this.postBridgeResult(e.source as WindowProxy | null, WebAuthnBridgeMessage.GetResult, requestId, true, { credential: serialized });
    } catch (err) {
      const message = this.formatBridgeError(err);
      console.warn('[IframeTransport][bridge] GET failed', { requestId, err: message });
      this.postBridgeResult(e.source as WindowProxy | null, WebAuthnBridgeMessage.GetResult, requestId, false, { error: message });
    }
  }
}
