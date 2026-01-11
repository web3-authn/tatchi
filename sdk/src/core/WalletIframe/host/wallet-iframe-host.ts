
/**
 * Wallet Iframe Host - Host-Side Execution Layer
 *
 * This is the main service host that runs inside the wallet iframe. It receives
 * messages from the parent application and executes the actual TatchiPasskey
 * operations in a secure, isolated environment.
 *
 * Key Responsibilities:
 * - Message Handling: Receives and processes messages from parent via MessagePort
 * - TatchiPasskey Management: Creates and manages the real TatchiPasskey instance
 * - Operation Execution: Executes wallet operations (register, login, sign, etc.)
 * - Progress Broadcasting: Sends progress events back to parent during operations
 * - UI Component Management: Handles mounting/unmounting of Lit-based UI components
 * - Configuration Management: Applies configuration from parent to TatchiPasskey
 * - Error Handling: Converts errors to appropriate message format for parent
 *
 * Architecture:
 * - Uses MessagePort for bidirectional communication with parent
 * - Maintains TatchiPasskey instance with iframe-specific configuration
 * - Integrates with LitElemMounter for UI component management
 * - Handles request cancellation and cleanup
 *
 * Security Model:
 * - Runs in isolated iframe origin with proper WebAuthn permissions
 * - Prevents nested iframe mode to avoid security issues
 *
 * Message Protocol:
 * - Handles PM_* message types for TatchiPasskey operations
 * - Sends PROGRESS messages for real-time updates
 * - Sends PM_RESULT for successful completions
 * - Sends ERROR messages for failures
 * - Supports request cancellation via PM_CANCEL
 */
import { bootstrapTransparentHost } from './bootstrap';

import type {
  ParentToChildEnvelope,
  ParentToChildType,
  ChildToParentEnvelope,
  ReadyPayload,
  PMSetConfigPayload,
  PreferencesChangedPayload,
} from '../shared/messages';
import { CONFIRM_UI_ELEMENT_SELECTORS } from '../../WebAuthnManager/LitComponents/tags';
import { MinimalNearClient } from '../../NearClient';
import { setupLitElemMounter } from './iframe-lit-elem-mounter';
import type { TatchiConfigsInput } from '../../types/tatchi';
import { isObject, isString } from '@/utils/validation';
import { errorMessage } from '../../../utils/errors';
import { TatchiPasskey } from '../../TatchiPasskey';
import { __setWalletIframeHostMode } from '../host-mode';
import type { ProgressPayload } from '../shared/messages';
import { WalletIframeDomEvents } from '../events';
import { assertWalletHostConfigsNoNestedIframeWallet, sanitizeWalletHostConfigs } from './config-guards';
// handlers moved to dedicated module; host no longer imports per-call hook types
import { createWalletIframeHandlers } from './wallet-iframe-handlers';
import { setEmbeddedBase } from '../../sdkPaths';

const PROTOCOL: ReadyPayload['protocolVersion'] = '1.0.0';

// Early bootstrap (transparent surface, env shims, default asset base, telemetry)
bootstrapTransparentHost();

let parentOrigin: string | null = null;
let port: MessagePort | null = null;
let walletConfigs: TatchiConfigsInput | null = null;
let nearClient: MinimalNearClient | null = null;
let tatchiPasskey: TatchiPasskey | null = null;
let themeUnsubscribe: (() => void) | null = null;
let prefsUnsubscribe: (() => void) | null = null;

// Track request-level cancellations
const cancelledRequests = new Set<string>();
function markCancelled(rid?: string) { if (rid) cancelledRequests.add(rid); }
function isCancelled(rid?: string) { return !!rid && cancelledRequests.has(rid); }
function clearCancelled(rid?: string) { if (rid) cancelledRequests.delete(rid); }

function postProgress(requestId: string | undefined, payload: ProgressPayload): void {
  if (!requestId) return;
  post({ type: 'PROGRESS', requestId, payload });
}

function emitCancellationPayload(requestId: string | undefined): void {
  if (!requestId) return;
  postProgress(requestId, { step: 0, phase: 'cancelled', status: 'error', message: 'Cancelled by user' });
  post({ type: 'ERROR', requestId, payload: { code: 'CANCELLED', message: 'Request cancelled' } });
}

function respondIfCancelled(requestId: string | undefined): boolean {
  if (!requestId || !isCancelled(requestId)) return false;
  emitCancellationPayload(requestId);
  clearCancelled(requestId);
  return true;
}

function ensureTatchiPasskey(): void {
  if (!walletConfigs || !walletConfigs.nearRpcUrl) {
    throw new Error('Wallet service not configured. Call PM_SET_CONFIG first.');
  }
  if (!walletConfigs.contractId) {
    throw new Error('Wallet service misconfigured: contractId is required.');
  }
  if (!nearClient) {
    nearClient = new MinimalNearClient(walletConfigs.nearRpcUrl);
  }
  if (!tatchiPasskey) {
    const cfg = sanitizeWalletHostConfigs(walletConfigs);
    assertWalletHostConfigsNoNestedIframeWallet(cfg);
    // Mark runtime as wallet iframe host (internal flag)
    __setWalletIframeHostMode(true);
    tatchiPasskey = new TatchiPasskey(cfg, nearClient);
    // Warm critical resources (Signer/VRF workers, IndexedDB) on the wallet origin.
    // Non-blocking and safe to call without account context.
    const pmAny = tatchiPasskey as unknown as { warmCriticalResources?: () => Promise<void> };
    if (pmAny?.warmCriticalResources) {
      void pmAny.warmCriticalResources().catch(() => {});
    }
    // Bridge theme changes to the host document so embedded UIs can react via CSS
    const up = tatchiPasskey.userPreferences;
    // Set initial theme attribute
    document.documentElement.setAttribute('data-w3a-theme', up.getUserTheme());
    // Deduplicate subscription on reconfigurations
    themeUnsubscribe?.();
    themeUnsubscribe = up.onThemeChange((t) => {
      document.documentElement.setAttribute('data-w3a-theme', t);
    });

    // Bridge wallet-host preferences to the parent app so app UI can mirror wallet host state.
    prefsUnsubscribe?.();
    const emitPreferencesChanged = () => {
      const id = String(up.getCurrentUserAccountId?.() || '').trim();
      const nearAccountId = id ? id : null;
      post({
        type: 'PREFERENCES_CHANGED',
        payload: {
          nearAccountId,
          confirmationConfig: up.getConfirmationConfig(),
          signerMode: up.getSignerMode(),
          updatedAt: Date.now(),
        } satisfies PreferencesChangedPayload,
      });
    };
    const unsubCfg = up.onConfirmationConfigChange?.(() => emitPreferencesChanged()) || null;
    const unsubSignerMode = up.onSignerModeChange?.(() => emitPreferencesChanged()) || null;
    prefsUnsubscribe = () => {
      try { unsubCfg?.(); } catch {}
      try { unsubSignerMode?.(); } catch {}
    };
    // Emit a best-effort snapshot as soon as the host is ready.
    Promise.resolve().then(() => emitPreferencesChanged()).catch(() => {});
  }
}

function getTatchiPasskey(): TatchiPasskey {
  ensureTatchiPasskey();
  return tatchiPasskey!;
}

// Unified handler map wired with minimal deps from this host
const handlers = createWalletIframeHandlers({
  getTatchiPasskey: getTatchiPasskey,
  post,
  postProgress,
  postToParent,
  respondIfCancelled,
});

function post(msg: ChildToParentEnvelope) {
  port?.postMessage(msg);
}

function postToParent(message: unknown): void {
  const parentWindow = window.parent;
  if (!parentWindow) return;
  // If the first CONNECT arrived while this document still had an opaque
  // ('null') origin, MessageEvent.origin can be the literal string 'null'.
  // Do not lock onto that value; target '*' until a concrete origin is known.
  const target = (parentOrigin && parentOrigin !== 'null') ? parentOrigin : '*';
  parentWindow.postMessage(message, target);
}

/**
 * Gate whether we should adopt a transferred MessagePort for CONNECT.
 *
 * - Improves security by preventing a non-parent window from hijacking the MessagePort.
 * - Keeps the handshake robust: it tolerates early ‘null’ origins, supports retries,
 *   and binds adoption to the real parent.
 */
function shouldAcceptConnectEvent(e: MessageEvent, hasAdoptedPort: boolean): boolean {
  // Only accept CONNECT from our direct parent window and only once.
  if (hasAdoptedPort) return false;
  const src = (e as MessageEvent).source as Window | null;
  if (src !== window.parent) return false;
  return true;
}

// Lightweight cross-origin control channel for small embedded UI surfaces (e.g., tx button).
// This channel uses window.postMessage directly (not MessagePort) so that a standalone
// iframe can instruct this host to render a clickable control that performs WebAuthn
// operations within the same browsing context (satisfying user activation requirements).
(() => {
  setupLitElemMounter({
    ensureTatchiPasskey: ensureTatchiPasskey,
    getTatchiPasskey: () => tatchiPasskey,
    updateWalletConfigs: (patch) => {
      walletConfigs = { ...walletConfigs, ...patch } as TatchiConfigsInput;
    },
    postToParent,
  });
})();

/**
 * Main message handler for iframe communication
 * This function receives all messages from the parent application and routes them
 * to the appropriate TatchiPasskey operations.
 */
async function onPortMessage(e: MessageEvent<ParentToChildEnvelope>) {
  const req = e.data as ParentToChildEnvelope;
  if (!req || !isObject(req)) return;
  const requestId = req.requestId;

  // Handle ping/pong for connection health checks
  if (req.type === 'PING') {
    // Initialize TatchiPasskey and prewarm workers on wallet origin (non-blocking)
    if (walletConfigs?.nearRpcUrl && walletConfigs?.contractId) {
      Promise.resolve().then(() => {
        ensureTatchiPasskey();
        const pmAny = tatchiPasskey as unknown as { warmCriticalResources?: () => Promise<void> };
        if (pmAny?.warmCriticalResources) return pmAny.warmCriticalResources();
      }).catch(() => {});
    }
    post({ type: 'PONG', requestId });
    return;
  }

  // Handle configuration updates from parent
  if (req.type === 'PM_SET_CONFIG') {
    const payload = req.payload as PMSetConfigPayload;
    walletConfigs = {
      nearRpcUrl: payload?.nearRpcUrl || walletConfigs?.nearRpcUrl || '',
      nearNetwork: payload?.nearNetwork || walletConfigs?.nearNetwork || 'testnet',
      contractId: payload?.contractId || walletConfigs?.contractId || '',
      nearExplorerUrl: payload?.nearExplorerUrl || walletConfigs?.nearExplorerUrl,
      signerMode: payload?.signerMode || walletConfigs?.signerMode,
      relayer: payload?.relayer || walletConfigs?.relayer,
      authenticatorOptions: payload?.authenticatorOptions || walletConfigs?.authenticatorOptions,
      vrfWorkerConfigs: payload?.vrfWorkerConfigs || walletConfigs?.vrfWorkerConfigs,
      emailRecoveryContracts: payload?.emailRecoveryContracts || walletConfigs?.emailRecoveryContracts,
      walletTheme: payload?.theme || walletConfigs?.walletTheme,
      iframeWallet: sanitizeWalletHostConfigs({
        ...(walletConfigs || ({} as TatchiConfigsInput)),
        iframeWallet: {
          ...(walletConfigs?.iframeWallet || {}),
          rpIdOverride: payload?.rpIdOverride || walletConfigs?.iframeWallet?.rpIdOverride,
        },
      }).iframeWallet,
    } as TatchiConfigsInput;

    // Configure SDK embedded asset base for Lit modal/embedded components
    const assetsBaseUrl = payload?.assetsBaseUrl as string | undefined;
    // Default to serving embedded assets from this wallet origin under /sdk/
    const safeOrigin = window.location.origin || window.location.href;
    const defaultRoot = (() => {
      try {
        const base = new URL('/sdk/', safeOrigin).toString();
        return base.endsWith('/') ? base : base + '/';
      } catch {
        return '/sdk/';
      }
    })();

    let resolvedBase = defaultRoot;
    const assetsBaseUrlCandidate = isString(assetsBaseUrl) ? assetsBaseUrl : undefined;
    if (assetsBaseUrlCandidate !== undefined) {
      try {
        const u = new URL(assetsBaseUrlCandidate, safeOrigin);
        // Only honor provided assetsBaseUrl if it matches this wallet origin to avoid CORS
        if (u.origin === safeOrigin) {
          const norm = u.toString().endsWith('/') ? u.toString() : (u.toString() + '/');
          resolvedBase = norm;
        }
      } catch {}
    }
    setEmbeddedBase(resolvedBase);
    nearClient = null; tatchiPasskey = null;
    // Forward UI registry to iframe-lit-elem-mounter if provided
    const uiRegistry = payload?.uiRegistry;
    if (uiRegistry && isObject(uiRegistry)) {
      window.postMessage({ type: 'WALLET_UI_REGISTER_TYPES', payload: uiRegistry }, '*');
    }
    post({ type: 'PONG', requestId });
    return;
  }

  if (req.type === 'PM_CANCEL') {
    // Best-effort cancel: mark requestId and close any open modal inside the wallet host
    const rid = req.payload?.requestId;
    markCancelled(rid);
    // Cover all possible confirmation hosts used inside the wallet iframe
    const els = (CONFIRM_UI_ELEMENT_SELECTORS as readonly string[])
      .flatMap((sel) => Array.from(document.querySelectorAll(sel)) as HTMLElement[]);
    for (const el of els) {
      try {
        el.dispatchEvent(new CustomEvent(WalletIframeDomEvents.TX_CONFIRMER_CANCEL, { bubbles: true, composed: true }));
      } catch {}
    }
    // Also cancel any device linking flow
    ensureTatchiPasskey();
    await tatchiPasskey!.stopDevice2LinkingFlow();
    if (rid) {
      // Immediately emit a terminal cancellation for the original request.
      // Handlers may also emit their own CANCELLED error; router tolerates duplicates.
      emitCancellationPayload(rid);
    }
    post({ type: 'PONG', requestId });
    return;
  }

  try {
    // Widen handler type for dynamic dispatch. HandlerMap is strongly typed at creation,
    // but when indexing with a runtime key, TS cannot correlate the specific envelope type.
    const handler = handlers[req.type as ParentToChildType] as unknown as (r: ParentToChildEnvelope) => Promise<void>;
    if (handler) {
      await handler(req);
    }
  } catch (err: unknown) {
    post({ type: 'ERROR', requestId, payload: { code: 'HOST_ERROR', message: errorMessage(err) } });
  }
}

function adoptPort(p: MessagePort) {
  port = p;
  port.onmessage = (ev) => onPortMessage(ev as MessageEvent<ParentToChildEnvelope>);
  port.start?.();
  post({ type: 'READY', payload: { protocolVersion: PROTOCOL } });
}

function onWindowMessage(e: MessageEvent) {
  const { data, ports } = e;
  if (!data || !isObject(data)) return;
  if ((data as { type?: unknown }).type === 'CONNECT' && ports && ports[0]) {
    if (!shouldAcceptConnectEvent(e, !!port)) return;
    if (typeof e.origin === 'string' && e.origin.length && e.origin !== 'null') {
      parentOrigin = e.origin;
    }
    adoptPort(ports[0]);
  }
}

window.addEventListener('message', onWindowMessage);

export {};
