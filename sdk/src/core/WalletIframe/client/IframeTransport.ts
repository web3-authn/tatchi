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

import type { ReadyPayload } from '../shared/messages';
import { isObject } from '@/utils/validation';
import { WebAuthnBridgeMessage } from '../../WebAuthnManager/WebAuthnFallbacks';
import { IframeMessage } from './iframe-messages';
import { IframeOverlay } from './iframe-overlay';
import { handshakeIframe } from './iframe-handshake';
import { createWebAuthnBridge } from './webauthn-bridge';

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const WILDCARD_CONNECT_ATTEMPTS = 6;

export { IframeMessage };

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
  private readonly overlay: IframeOverlay;
  private readonly webAuthnBridge: ReturnType<typeof createWebAuthnBridge>;
  private serviceBooted = false; // set when wallet host sends SERVICE_HOST_BOOTED (best-effort only)
  private connectInFlight: Promise<MessagePort> | null = null;
  private connectAbort: AbortController | null = null;
  private readyPayload: ReadyPayload | null = null;
  private readonly walletServiceUrl: URL;
  private readonly walletOrigin: string;
  private debug = false;
  private disposed = false;
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
      // Only accept bridge requests from the wallet iframe we created.
      // This prevents other same-origin windows/frames from abusing the parent-bridge path.
      try {
        const expected = this.overlay.contentWindow;
        if (expected && e.source !== expected) return;
      } catch {
        return;
      }
      this.webAuthnBridge.handleMessage(type as typeof WebAuthnBridgeMessage.Create | typeof WebAuthnBridgeMessage.Get, data, e);
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
    this.debug = !!this.opts.debug;
    this.overlay = new IframeOverlay({
      walletOrigin: this.walletOrigin,
      serviceUrl: this.walletServiceUrl,
      debug: this.debug,
      testOptions: options.testOptions,
    });
    this.webAuthnBridge = createWebAuthnBridge({ walletOrigin: this.walletOrigin });

    // Listen for a best-effort boot hint from the wallet host. Not required for correctness,
    // but helps reduce redundant CONNECT posts while the host script is still booting.
    if (typeof window !== 'undefined') {
      window.addEventListener('message', this.onWindowMessage);
    }
  }

  /** Returns the underlying iframe element if it exists. */
  getIframeEl(): HTMLIFrameElement | null { return this.overlay.element; }

  /** Returns the READY handshake protocol version when available. */
  getProtocolVersion(): ReadyPayload['protocolVersion'] | null {
    return this.readyPayload?.protocolVersion ?? null;
  }

  /** Remove global listeners created by this transport instance. */
  dispose(opts?: { removeIframe?: boolean }): void {
    this.disposed = true;
    this.connectAbort?.abort();
    this.connectAbort = null;
    if (typeof window !== 'undefined') {
      window.removeEventListener('message', this.onWindowMessage);
    }
    this.overlay.dispose(opts);
  }

  /** Ensure the iframe element exists and is appended to the DOM. Idempotent. */
  ensureIframeMounted(): HTMLIFrameElement {
    return this.overlay.ensureMounted();
  }

  /**
   * Connect to the wallet iframe using a MessageChannel handshake.
   * - Repeatedly posts {type:'CONNECT'} with a fresh port until a 'READY' message arrives
   * - Times out after connectTimeoutMs
   * - Deduplicates concurrent calls and returns the same MessagePort promise
   */
  async connect(opts?: { signal?: AbortSignal }): Promise<MessagePort> {
    if (this.disposed) {
      throw new Error('IframeTransport is disposed');
    }
    if (this.connectInFlight) return this.connectInFlight;
    const controller = new AbortController();
    this.connectAbort = controller;
    const signal = this.combineSignals(controller.signal, opts?.signal);

    this.connectInFlight = (async () => {
      const iframe = this.ensureIframeMounted();

      // Ensure load fired at least once so the host script can attach listeners
      await this.overlay.waitForLoad(signal);

      // For cross-origin pages, give the host only a very brief moment to boot its script
      // Keep this low to avoid adding noticeable latency to the first CONNECT attempt.
      // The handshake will continue retrying regardless, so a shorter wait improves TTFB.
      const bootWaitMs = Math.min(this.opts.connectTimeoutMs / 12, 300);
      await this.waitForBootHint(bootWaitMs, signal);

      const { port, readyPayload } = await handshakeIframe({
        iframe,
        connectTimeoutMs: this.opts.connectTimeoutMs,
        getTargetOrigin: (attempt) => this.getConnectTargetOrigin(attempt),
        serviceUrl: this.walletServiceUrl.toString(),
        debug: this.debug,
        signal,
      });
      if (readyPayload) this.readyPayload = readyPayload;
      return port;
    })();

    try {
      return await this.connectInFlight;
    } finally {
      this.connectInFlight = null;
      this.connectAbort = null;
    }
  }

  private combineSignals(primary: AbortSignal, secondary?: AbortSignal): AbortSignal {
    if (!secondary) return primary;
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    if (primary.aborted || secondary.aborted) {
      controller.abort();
    } else {
      primary.addEventListener('abort', onAbort, { once: true });
      secondary.addEventListener('abort', onAbort, { once: true });
    }
    return controller.signal;
  }

  private async waitForBootHint(timeoutMs: number, signal?: AbortSignal): Promise<void> {
    if (this.serviceBooted || timeoutMs <= 0) return;
    const start = Date.now();
    while (!this.serviceBooted && (Date.now() - start) < timeoutMs) {
      if (signal?.aborted) {
        const err = new Error('Boot wait aborted');
        (err as { name?: string }).name = 'AbortError';
        throw err;
      }
      await sleep(50);
    }
  }

  private getConnectTargetOrigin(attempt: number): string {
    if (this.serviceBooted) return this.walletOrigin;
    if (attempt <= WILDCARD_CONNECT_ATTEMPTS) return '*';
    return this.walletOrigin;
  }
}
