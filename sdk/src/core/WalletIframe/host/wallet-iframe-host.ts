/**
 * Wallet Iframe Host - Host-Side Execution Layer
 *
 * This is the main service host that runs inside the wallet iframe. It receives
 * messages from the parent application and executes the actual TatchiPasskey
 * operations in a secure, isolated environment.
 */
import { bootstrapTransparentHost } from './bootstrap';

import type {
  ParentToChildEnvelope,
  ChildToParentEnvelope,
  ReadyPayload,
  PMSetConfigPayload,
  PreferencesChangedPayload,
  WalletIframeCapabilities,
} from '../shared/messages';
import { WALLET_PROTOCOL_VERSION } from '../shared/messages';
import { CONFIRM_UI_ELEMENT_SELECTORS } from '../../WebAuthnManager/LitComponents/tags';
import { setupLitElemMounter } from './iframe-lit-elem-mounter';
import type { TatchiConfigsInput } from '../../types/tatchi';
import { isObject } from '@/utils/validation';
import { errorMessage } from '../../../utils/errors';
import type { ProgressPayload } from '../shared/messages';
import { WalletIframeDomEvents } from '../events';
import { createWalletIframeHandlers, type HandledParentToChildType } from './wallet-iframe-handlers';
import { applyWalletConfig, createHostContext, ensurePasskeyManager } from './context';
import { addHostListeners, post as postPort, postToParent as postParent } from './messaging';
import type { TatchiPasskey } from '../../TatchiPasskey';

const PROTOCOL: ReadyPayload['protocolVersion'] = WALLET_PROTOCOL_VERSION;

// Early bootstrap (transparent surface, env shims, default asset base, telemetry)
bootstrapTransparentHost();

const ctx = createHostContext();

// Track request-level cancellations
const cancelledRequests = new Set<string>();
function markCancelled(rid?: string) { if (rid) cancelledRequests.add(rid); }
function isCancelled(rid?: string) { return !!rid && cancelledRequests.has(rid); }
function clearCancelled(rid?: string) { if (rid) cancelledRequests.delete(rid); }

function post(msg: ChildToParentEnvelope) {
  postPort(ctx, msg);
}

function postToParent(message: unknown): void {
  postParent(ctx, message);
}

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

function setupPreferencesBridge(): void {
  const pm = ctx.tatchiPasskey as TatchiPasskey | null;
  if (!pm) return;
  const up = pm.userPreferences as unknown as {
    getCurrentUserAccountId?: () => string | null | undefined;
    getConfirmationConfig: () => PreferencesChangedPayload['confirmationConfig'];
    getSignerMode: () => PreferencesChangedPayload['signerMode'];
    onConfirmationConfigChange?: (cb: () => void) => (() => void) | void;
    onSignerModeChange?: (cb: () => void) => (() => void) | void;
  } | null;
  if (!up) return;

  ctx.prefsUnsubscribe?.();

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
  ctx.prefsUnsubscribe = () => {
    try { unsubCfg?.(); } catch {}
    try { unsubSignerMode?.(); } catch {}
  };

  Promise.resolve().then(() => emitPreferencesChanged()).catch(() => {});
}

function ensureTatchiPasskey(): void {
  const created = ensurePasskeyManager(ctx);
  if (created) setupPreferencesBridge();
}

function getTatchiPasskey(): TatchiPasskey {
  ensureTatchiPasskey();
  return ctx.tatchiPasskey as TatchiPasskey;
}

// Unified handler map wired with minimal deps from this host
const handlers = createWalletIframeHandlers({
  getTatchiPasskey: getTatchiPasskey,
  post,
  postProgress,
  postToParent,
  respondIfCancelled,
});

// Lightweight cross-origin control channel for small embedded UI surfaces (e.g., tx button).
// This channel uses window.postMessage directly (not MessagePort) so that a standalone
// iframe can instruct this host to render a clickable control that performs WebAuthn
// operations within the same browsing context (satisfying user activation requirements).
setupLitElemMounter({
  ensureTatchiPasskey: ensureTatchiPasskey,
  getTatchiPasskey: () => ctx.tatchiPasskey,
  updateWalletConfigs: (patch) => {
    ctx.walletConfigs = { ...ctx.walletConfigs, ...patch } as TatchiConfigsInput;
  },
  getParentOrigin: () => ctx.parentOrigin,
  postToParent,
});

/**
 * Main message handler for iframe communication
 * This function receives all messages from the parent application and routes them
 * to the appropriate TatchiPasskey operations.
 */
async function onPortMessage(e: MessageEvent<ParentToChildEnvelope>) {
  const req = e.data as ParentToChildEnvelope;
  if (!req || !isObject(req)) return;
  const requestId = req.requestId;

  // Lightweight, side-effect free runtime capability probe for the embedding app.
  if (req.type === 'PM_GET_CAPABILITIES') {
    const isChromeExtension = (() => {
      try {
        if (window.location.protocol === 'chrome-extension:') return true;
      } catch {}
      try {
        return typeof (globalThis as any)?.chrome?.runtime?.id === 'string';
      } catch {
        return false;
      }
    })();
    const chromeExtensionId = (() => {
      try {
        const id = (globalThis as any)?.chrome?.runtime?.id;
        return typeof id === 'string' && id.length > 0 ? id : undefined;
      } catch {
        return undefined;
      }
    })();
    const webauthnClientCapabilities = await (async (): Promise<Record<string, boolean> | undefined> => {
      try {
        const pkc = (globalThis as any)?.PublicKeyCredential;
        const fn = pkc?.getClientCapabilities;
        if (typeof fn !== 'function') return undefined;
        const res = await fn.call(pkc);
        if (!res || typeof res !== 'object') return undefined;

        const out: Record<string, boolean> = {};
        for (const [key, value] of Object.entries(res as Record<string, unknown>)) {
          if (typeof value === 'boolean') out[key] = value;
        }
        return Object.keys(out).length > 0 ? out : undefined;
      } catch {
        return undefined;
      }
    })();
    const hasPrfExtension = (() => {
      try {
        const v = (webauthnClientCapabilities as Record<string, unknown> | undefined)?.['prf'];
        return typeof v === 'boolean' ? v : undefined;
      } catch {
        return undefined;
      }
    })();
    const capabilities: WalletIframeCapabilities = {
      protocolVersion: PROTOCOL,
      origin: (() => {
        try { return window.location.origin || ''; } catch { return ''; }
      })(),
      href: (() => {
        try { return window.location.href || ''; } catch { return ''; }
      })(),
      isSecureContext: (() => {
        try { return !!window.isSecureContext; } catch { return false; }
      })(),
      userAgent: (() => {
        try { return navigator.userAgent || ''; } catch { return ''; }
      })(),
      hasWebAuthn: (() => {
        try { return !!navigator.credentials?.create && !!navigator.credentials?.get; } catch { return false; }
      })(),
      webauthnClientCapabilities,
      hasPrfExtension,
      isChromeExtension,
      chromeExtensionId,
    };
    post({ type: 'PM_RESULT', requestId, payload: { ok: true, result: capabilities } });
    return;
  }

  // Handle ping/pong for connection health checks
  if (req.type === 'PING') {
    // Initialize TatchiPasskey and prewarm workers on wallet origin (non-blocking)
    if (ctx.walletConfigs?.nearRpcUrl && ctx.walletConfigs?.contractId) {
      Promise.resolve().then(() => {
        ensureTatchiPasskey();
        const pmAny = ctx.tatchiPasskey as unknown as { warmCriticalResources?: () => Promise<void> };
        if (pmAny?.warmCriticalResources) return pmAny.warmCriticalResources();
      }).catch(() => {});
    }
    post({ type: 'PONG', requestId });
    return;
  }

  // Handle configuration updates from parent
  if (req.type === 'PM_SET_CONFIG') {
    const payload = req.payload as PMSetConfigPayload;
    applyWalletConfig(ctx, payload);
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
    await (ctx.tatchiPasskey as TatchiPasskey).stopDevice2LinkingFlow();
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
    const handler = handlers[req.type as HandledParentToChildType] as unknown as (r: ParentToChildEnvelope) => Promise<void>;
    if (handler) {
      await handler(req);
    }
  } catch (err: unknown) {
    post({ type: 'ERROR', requestId, payload: { code: 'HOST_ERROR', message: errorMessage(err) } });
  }
}

addHostListeners(ctx, onPortMessage, PROTOCOL);

export {};
