import { TransactionInputWasm, VRFChallenge } from '../../types';
import { WalletIframeDomEvents } from '../../WalletIframe/events';
import { W3A_IFRAME_TX_CONFIRMER_ID, CONFIRM_UI_ELEMENT_SELECTORS, W3A_MODAL_TX_CONFIRMER_ID, W3A_DRAWER_TX_CONFIRMER_ID, W3A_CONFIRM_PORTAL_ID } from './tags';
import type { SignerWorkerManagerContext } from '../SignerWorkerManager';
import type { TransactionSummary } from '../SignerWorkerManager/confirmTxFlow/types';
import { isBoolean } from '../../WalletIframe/validation';
import type IframeModalHost from './IframeTxConfirmer/iframe-host';

// Minimal host element interface for modal/drawer variants used directly in the host document
// These elements mirror the properties set by our mounting helpers
interface HostTxConfirmerElement extends HTMLElement {
  nearAccountId: string;
  txSigningRequests: TransactionInputWasm[];
  intentDigest?: string;
  vrfChallenge?: VRFChallenge;
  theme?: 'dark' | 'light';
  loading?: boolean;      // host elements use `loading` (iframe element uses `showLoading`)
  deferClose?: boolean;   // two‑phase close coordination
  errorMessage?: string;
  requestUpdate?: () => void; // Lit element update hook (optional)
}

// Ensure the modal element is defined when this bundle is loaded in an iframe
// The drawer variant is imported by the iframe bootstrap script.
import './IframeTxConfirmer/viewer-modal';

// ===== Config =====
const HOST_BUNDLE_TIMEOUT_MS = 8000;
const DEFINITION_POLL_MS = 50;

// Small helper to keep a host element's error attribute in sync
function setErrorAttribute(el: HTMLElement, msg: string): void {
  try {
    if (msg) {
      el.setAttribute('data-error-message', msg);
    } else {
      el.removeAttribute('data-error-message');
    }
  } catch {}
}

// ========= Iframe Modal helpers =========
async function ensureIframeModalDefined(): Promise<void> {
  // If already defined, we are good.
  if (isIframeModalDefined()) return;

  const base = embeddedBase();
  const url = `${base}${W3A_IFRAME_TX_CONFIRMER_ID}.js`;

  // Prefer a direct dynamic import (works well across browsers) with a timeout.
  // If it fails for any reason (pathing, CSP, or fetch), fall back to an injected script tag
  // with load/error listeners and a timeout + polling for the customElements definition.
  try {
    // @vite-ignore to avoid Vite pre-bundling the runtime-computed path
    await withTimeout(import(/* @vite-ignore */ url), HOST_BUNDLE_TIMEOUT_MS);
    if (isIframeModalDefined()) return;
  } catch {
    // Fallback to script tag injection if dynamic import fails
  }

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const done = (ok: boolean, err?: unknown) => { if (settled) return; settled = true; ok ? resolve() : reject(err); };

    const existing = document.querySelector(`script[data-w3a="${W3A_IFRAME_TX_CONFIRMER_ID}"]`) as HTMLScriptElement | null;

    const stopWhenDefined = () => {
      try { if (isIframeModalDefined()) done(true); } catch {}
    };

    // Hard timeout to avoid hanging indefinitely if the browser never fires load/error
    const timeoutId = window.setTimeout(() => {
      try { if (isIframeModalDefined()) return done(true); } catch {}
      console.error('[LitComponents/confirm-ui] Iframe modal host bundle load timeout', url);
      done(false, new Error('iframe modal host bundle load timeout'));
    }, HOST_BUNDLE_TIMEOUT_MS);
    const clearTimer = () => { try { clearTimeout(timeoutId); } catch {} };

    // If a tag already exists, attach listeners and also poll for definition (in case it is already cached)
    if (existing) {
      const pollId = window.setInterval(() => {
        if (isIframeModalDefined()) {
          try { clearInterval(pollId); } catch {}
          clearTimer();
          done(true);
        }
      }, DEFINITION_POLL_MS);
      const stopPoll = () => { try { clearInterval(pollId); } catch {} };
      existing.addEventListener('load', () => {
        stopPoll();
        clearTimer();
        stopWhenDefined();
      }, { once: true });
      existing.addEventListener('error', (e) => {
        stopPoll();
        clearTimer();
        done(false, e);
      }, { once: true });
      return;
    }

    // Otherwise, create a fresh module script tag
    const script = document.createElement('script');
    script.type = 'module';
    script.async = true;
    script.dataset.w3a = W3A_IFRAME_TX_CONFIRMER_ID;
    script.src = url;
    script.onload = () => {
      clearTimer();
      stopWhenDefined();
    };
    script.onerror = (e) => {
      console.error('[LitComponents/confirm-ui] Failed to load iframe modal host bundle', script.src);
      clearTimer();
      done(false, e);
    };
    document.head.appendChild(script);
  });
}

// Helper: check custom element definition
function isIframeModalDefined(): boolean {
  return !!customElements.get(W3A_IFRAME_TX_CONFIRMER_ID);
}

// Helper: return embedded base path (set by host script) or default '/sdk/'
function embeddedBase(): string {
  try {
    const base = (window as unknown as { __W3A_EMBEDDED_BASE__?: string }).__W3A_EMBEDDED_BASE__;
    return base || '/sdk/';
  } catch {
    return '/sdk/';
  }
}

// Generic promise timeout
function withTimeout<T>(p: Promise<T>, ms = HOST_BUNDLE_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = setTimeout(() => reject(new Error('timeout')), ms);
    p.then((v) => { clearTimeout(id); resolve(v); }, (e) => { clearTimeout(id); reject(e); });
  });
}

// ========= Host Modal helpers (no nested iframe) =========
async function ensureHostElementDefined(variant: 'modal' | 'drawer' = 'modal'): Promise<void> {
  if (variant === 'drawer') {
    if (customElements.get(W3A_DRAWER_TX_CONFIRMER_ID)) return;
    await import('./IframeTxConfirmer/viewer-drawer');
    return;
  }
  if (customElements.get(W3A_MODAL_TX_CONFIRMER_ID)) return;
  await import('./IframeTxConfirmer/viewer-modal');
}

function cleanupExistingConfirmers(): void {
  try {
    // First, prefer clearing the portal container which guarantees singleton behavior
    const portal = document.getElementById(W3A_CONFIRM_PORTAL_ID);
    if (portal) {
      try {
        const existing = Array.from(portal.querySelectorAll('*')) as HTMLElement[];
        for (const el of existing) {
          try { el.dispatchEvent(new CustomEvent(WalletIframeDomEvents.TX_CONFIRMER_CANCEL, { bubbles: true, composed: true })); } catch {}
          try { el.dispatchEvent(new CustomEvent(WalletIframeDomEvents.MODAL_CANCEL, { bubbles: true, composed: true })); } catch {}
        }
        portal.replaceChildren();
        return;
      } catch {}
    }
    // Fallback: scan the document for any confirmer elements and remove them
    const selectors = (CONFIRM_UI_ELEMENT_SELECTORS as readonly string[]);
    const els = selectors.flatMap((sel) => Array.from(document.querySelectorAll(sel)) as HTMLElement[]);
    for (const el of els) {
      try { el.dispatchEvent(new CustomEvent(WalletIframeDomEvents.TX_CONFIRMER_CANCEL, { bubbles: true, composed: true })); } catch {}
      try { el.dispatchEvent(new CustomEvent(WalletIframeDomEvents.MODAL_CANCEL, { bubbles: true, composed: true })); } catch {}
      try { el.remove(); } catch {}
    }
  } catch {}
}

function ensureConfirmPortal(): HTMLElement {
  let portal = document.getElementById(W3A_CONFIRM_PORTAL_ID) as HTMLElement | null;
  if (!portal) {
    portal = document.createElement('div');
    portal.id = W3A_CONFIRM_PORTAL_ID;
    // Keep the portal inert except for stacking; children handle their own overlay
    try {
      portal.style.position = 'relative';
      portal.style.zIndex = '2147483647';
    } catch {}
    document.body.appendChild(portal);
  }
  return portal;
}

async function mountHostUiWithHandle({
  ctx,
  summary,
  txSigningRequests,
  vrfChallenge,
  loading,
  theme,
  variant,
  nearAccountIdOverride,
}: {
  ctx: SignerWorkerManagerContext,
  summary: TransactionSummary,
  txSigningRequests?: TransactionInputWasm[],
  vrfChallenge?: VRFChallenge,
  loading?: boolean,
  theme?: 'dark' | 'light',
  variant?: 'modal' | 'drawer',
  nearAccountIdOverride?: string,
}): Promise<ConfirmUIHandle> {
  const v: 'modal' | 'drawer' = variant || 'modal';
  await ensureHostElementDefined(v);
  cleanupExistingConfirmers();
  const tag = v === 'drawer' ? W3A_DRAWER_TX_CONFIRMER_ID : W3A_MODAL_TX_CONFIRMER_ID;
  const el = document.createElement(tag) as HostTxConfirmerElement;
  el.nearAccountId = nearAccountIdOverride || ctx.userPreferencesManager.getCurrentUserAccountId() || '';
  el.txSigningRequests = txSigningRequests || [];
  // Only enable UI digest validation for transaction-signing flows where txs exist.
  // Registration/link and other non-tx flows should not set intentDigest to avoid
  // spurious INTENT_DIGEST_MISMATCH on confirm.
  if ((txSigningRequests?.length || 0) > 0) {
    el.intentDigest = summary?.intentDigest;
  }
  if (vrfChallenge) el.vrfChallenge = vrfChallenge;
  if (theme) el.theme = theme;
  if (loading != null) el.loading = !!loading;
  try { el.removeAttribute('data-error-message'); } catch {}
  // Two-phase close: let caller control removal
  try { el.deferClose = true; } catch {}
  const portal = ensureConfirmPortal();
  portal.replaceChildren(el);
  const close = (_confirmed: boolean) => { try { el.remove(); } catch {} };
  const update = (props: ConfirmUIUpdate) => {
    try {
      if (props.nearAccountId != null) el.nearAccountId = props.nearAccountId;
      if (props.txSigningRequests != null) el.txSigningRequests = props.txSigningRequests;
      if (props.vrfChallenge != null) el.vrfChallenge = props.vrfChallenge;
      if (props.theme != null) el.theme = props.theme;
      if (props.loading != null) el.loading = !!props.loading;
      if ('errorMessage' in props) {
        const msg = props.errorMessage ?? '';
        el.errorMessage = msg;
        setErrorAttribute(el, msg);
      }
      el.requestUpdate?.();
    } catch {}
  };
  return { close, update };
}

async function awaitHostUiDecisionWithHandle({
  ctx,
  summary,
  txSigningRequests,
  vrfChallenge,
  theme,
  variant,
  nearAccountIdOverride,
}: {
  ctx: SignerWorkerManagerContext,
  summary: TransactionSummary,
  txSigningRequests?: TransactionInputWasm[],
  vrfChallenge?: VRFChallenge,
  theme?: 'dark' | 'light',
  variant?: 'modal' | 'drawer',
  nearAccountIdOverride?: string,
}): Promise<{ confirmed: boolean; handle: ConfirmUIHandle }> {
  const v: 'modal' | 'drawer' = variant || 'modal';
  await ensureHostElementDefined(v);
  return new Promise((resolve) => {
    cleanupExistingConfirmers();
    const tag = v === 'drawer' ? W3A_DRAWER_TX_CONFIRMER_ID : W3A_MODAL_TX_CONFIRMER_ID;
    const el = document.createElement(tag) as HostTxConfirmerElement;
    el.nearAccountId = nearAccountIdOverride || ctx.userPreferencesManager.getCurrentUserAccountId() || '';
    el.txSigningRequests = txSigningRequests || [];
    if ((txSigningRequests?.length || 0) > 0) {
      el.intentDigest = summary?.intentDigest;
    }
    if (vrfChallenge) el.vrfChallenge = vrfChallenge;
    if (theme) el.theme = theme;
    try { el.removeAttribute('data-error-message'); } catch {}
    try { el.deferClose = true; } catch {}

    const onConfirm = (_e: Event) => {
      cleanup();
      const close = (_c: boolean) => { try { el.remove(); } catch {} };
      const update = (props: ConfirmUIUpdate) => {
        try {
          if (props.nearAccountId != null) el.nearAccountId = props.nearAccountId;
          if (props.txSigningRequests != null) el.txSigningRequests = props.txSigningRequests;
          if (props.vrfChallenge != null) el.vrfChallenge = props.vrfChallenge;
          if (props.theme != null) el.theme = props.theme;
          if (props.loading != null) el.loading = !!props.loading;
          if ('errorMessage' in props) {
            const msg = props.errorMessage ?? '';
            el.errorMessage = msg;
            setErrorAttribute(el, msg);
          }
          el.requestUpdate?.();
        } catch {}
      };
      resolve({ confirmed: true, handle: { close, update } });
    };
    const onCancel = () => {
      cleanup();
      const close = (_c: boolean) => { try { el.remove(); } catch {} };
      const update = (props: ConfirmUIUpdate) => {
        try {
          if (props.nearAccountId != null) el.nearAccountId = props.nearAccountId;
          if (props.txSigningRequests != null) el.txSigningRequests = props.txSigningRequests;
          if (props.vrfChallenge != null) el.vrfChallenge = props.vrfChallenge;
          if (props.theme != null) el.theme = props.theme;
          if (props.loading != null) el.loading = !!props.loading;
          if ('errorMessage' in props) {
            const msg = props.errorMessage ?? '';
            el.errorMessage = msg;
            setErrorAttribute(el, msg);
          }
          el.requestUpdate?.();
        } catch {}
      };
      resolve({ confirmed: false, handle: { close, update } });
    };
    const cleanup = () => {
      try { el.removeEventListener(WalletIframeDomEvents.TX_CONFIRMER_CONFIRM, onConfirm as EventListener); } catch {}
      try { el.removeEventListener(WalletIframeDomEvents.TX_CONFIRMER_CANCEL, onCancel as EventListener); } catch {}
      try { el.removeEventListener(WalletIframeDomEvents.MODAL_CONFIRM, onConfirm as EventListener); } catch {}
      try { el.removeEventListener(WalletIframeDomEvents.MODAL_CANCEL, onCancel as EventListener); } catch {}
    };
    // Listen to new canonical events and legacy aliases for back-compat
    el.addEventListener(WalletIframeDomEvents.TX_CONFIRMER_CONFIRM, onConfirm as EventListener);
    el.addEventListener(WalletIframeDomEvents.TX_CONFIRMER_CANCEL, onCancel as EventListener);
    el.addEventListener(WalletIframeDomEvents.MODAL_CONFIRM, onConfirm as EventListener);
    el.addEventListener(WalletIframeDomEvents.MODAL_CANCEL, onCancel as EventListener);

    const portal = ensureConfirmPortal();
    portal.replaceChildren(el);
  });
}

async function mountIframeHostUiWithHandle({
  ctx,
  summary,
  txSigningRequests,
  vrfChallenge,
  loading,
  theme,
  variant,
  nearAccountIdOverride,
}: {
  ctx: SignerWorkerManagerContext,
  summary: TransactionSummary,
  txSigningRequests?: TransactionInputWasm[],
  vrfChallenge?: VRFChallenge,
  loading?: boolean,
  theme?: 'dark' | 'light',
  variant?: 'modal' | 'drawer',
  nearAccountIdOverride?: string,
}): Promise<ConfirmUIHandle> {
  await ensureIframeModalDefined();
  cleanupExistingConfirmers();
  const el = document.createElement(W3A_IFRAME_TX_CONFIRMER_ID) as IframeModalHost;
  el.nearAccountId = nearAccountIdOverride || ctx.userPreferencesManager.getCurrentUserAccountId() || '';
  el.txSigningRequests = txSigningRequests || [];
  if ((txSigningRequests?.length || 0) > 0) {
    el.intentDigest = summary?.intentDigest;
  }
  if (vrfChallenge) {
    el.vrfChallenge = vrfChallenge;
  }
  el.showLoading = !!loading;
  if (theme) {
    el.theme = theme;
  }
  if (variant) {
    el.variant = variant;
  }
  try { el.removeAttribute('data-error-message'); } catch {}
  const portal = ensureConfirmPortal();
  portal.replaceChildren(el);
  const close = (_confirmed: boolean) => { try { el.remove(); } catch {} };
  const update = (props: ConfirmUIUpdate) => {
    try {
      if (props.nearAccountId != null) el.nearAccountId = props.nearAccountId;
      if (props.txSigningRequests != null) el.txSigningRequests = props.txSigningRequests;
      if (props.vrfChallenge != null) el.vrfChallenge = props.vrfChallenge;
      if (props.theme != null) el.theme = props.theme;
      if (props.loading != null) el.showLoading = !!props.loading;
      if ('errorMessage' in props) {
        const msg = props.errorMessage ?? '';
        el.errorMessage = msg;
        try {
          if (msg) {
            el.setAttribute('data-error-message', msg);
          } else {
            el.removeAttribute('data-error-message');
          }
        } catch {}
      }
      el.requestUpdate?.();
    } catch {}
  };
  return { close, update };
}

async function awaitIframeHostUiDecisionWithHandle({
  ctx,
  summary,
  txSigningRequests,
  vrfChallenge,
  theme,
  variant,
  nearAccountIdOverride,
}: {
  ctx: SignerWorkerManagerContext,
  summary: TransactionSummary,
  txSigningRequests?: TransactionInputWasm[],
  vrfChallenge?: VRFChallenge,
  theme?: 'dark' | 'light',
  variant?: 'modal' | 'drawer',
  nearAccountIdOverride?: string,
}): Promise<{ confirmed: boolean; handle: ConfirmUIHandle }>{
  await ensureIframeModalDefined();
  return new Promise((resolve) => {
    cleanupExistingConfirmers();
    const el = document.createElement(W3A_IFRAME_TX_CONFIRMER_ID) as IframeModalHost;
    el.nearAccountId = nearAccountIdOverride || ctx.userPreferencesManager.getCurrentUserAccountId() || '';
    el.txSigningRequests = txSigningRequests || [];
    if ((txSigningRequests?.length || 0) > 0) {
      el.intentDigest = summary?.intentDigest;
    }
    el.vrfChallenge = vrfChallenge;
    if (theme) { el.theme = theme; }
    if (variant) { el.variant = variant; }
    try { el.removeAttribute('data-error-message'); } catch {}

    const onConfirm = (e: Event) => {
      const ce = e as CustomEvent<{ confirmed: boolean; error?: string }>;
      cleanup();
      const ok = !!(ce?.detail?.confirmed);
      const close = (_c: boolean) => { try { el.remove(); } catch {} };
      const update = (props: ConfirmUIUpdate) => {
        try {
          if (props.nearAccountId != null) el.nearAccountId = props.nearAccountId;
          if (props.txSigningRequests != null) el.txSigningRequests = props.txSigningRequests;
          if (props.vrfChallenge != null) el.vrfChallenge = props.vrfChallenge;
          if (props.theme != null) el.theme = props.theme;
          if (props.loading != null) el.showLoading = !!props.loading;
          if ('errorMessage' in props) {
            const msg = props.errorMessage ?? '';
            el.errorMessage = msg;
            setErrorAttribute(el, msg);
          }
          el.requestUpdate?.();
        } catch {}
      };
      resolve({ confirmed: ok, handle: { close, update } });
    };

    const onCancel = () => {
      cleanup();
      const close = (_confirmed: boolean) => { try { el.remove(); } catch {} };
      const update = (props: ConfirmUIUpdate) => {
        try {
          if (props.nearAccountId != null) el.nearAccountId = props.nearAccountId;
          if (props.txSigningRequests != null) el.txSigningRequests = props.txSigningRequests;
          if (props.vrfChallenge != null) el.vrfChallenge = props.vrfChallenge;
          if (props.theme != null) el.theme = props.theme;
          if (props.loading != null) el.showLoading = !!props.loading;
          if ('errorMessage' in props) {
            const msg = props.errorMessage ?? '';
            el.errorMessage = msg;
            try {
              if (msg) {
                el.setAttribute('data-error-message', msg);
              } else {
                el.removeAttribute('data-error-message');
              }
            } catch {}
          }
          el.requestUpdate?.();
        } catch {}
      };
      resolve({ confirmed: false, handle: { close, update } });
    };

    const cleanup = () => {
      try { el.removeEventListener(WalletIframeDomEvents.TX_CONFIRMER_CONFIRM, onConfirm as EventListener); } catch {}
      try { el.removeEventListener(WalletIframeDomEvents.TX_CONFIRMER_CANCEL, onCancel as EventListener); } catch {}
      try { el.removeEventListener(WalletIframeDomEvents.MODAL_CONFIRM, onConfirm as EventListener); } catch {}
      try { el.removeEventListener(WalletIframeDomEvents.MODAL_CANCEL, onCancel as EventListener); } catch {}
    };

    // Listen to new canonical events and legacy aliases for back-compat
    el.addEventListener(WalletIframeDomEvents.TX_CONFIRMER_CONFIRM, onConfirm as EventListener);
    el.addEventListener(WalletIframeDomEvents.TX_CONFIRMER_CANCEL, onCancel as EventListener);
    el.addEventListener(WalletIframeDomEvents.MODAL_CONFIRM, onConfirm as EventListener);
    el.addEventListener(WalletIframeDomEvents.MODAL_CANCEL, onCancel as EventListener);
    const portal = ensureConfirmPortal();
    portal.replaceChildren(el);
  });
}

export type ConfirmationUIMode = 'skip' | 'modal' | 'drawer';

// Public handle returned by mount/await helpers
export type ConfirmUIUpdate = {
  nearAccountId?: string;
  txSigningRequests?: TransactionInputWasm[];
  vrfChallenge?: VRFChallenge;
  theme?: 'dark' | 'light';
  loading?: boolean;
  errorMessage?: string;
};
export interface ConfirmUIHandle {
  close(confirmed: boolean): void;
  update(props: ConfirmUIUpdate): void;
}

export async function mountConfirmUI({
  ctx,
  summary,
  txSigningRequests,
  vrfChallenge,
  loading,
  theme,
  uiMode,
  nearAccountIdOverride,
  iframeMode,
}: {
  ctx: SignerWorkerManagerContext,
  summary: TransactionSummary,
  txSigningRequests?: TransactionInputWasm[],
  vrfChallenge?: VRFChallenge,
  loading?: boolean,
  theme?: 'dark' | 'light',
  uiMode: ConfirmationUIMode,
  nearAccountIdOverride?: string,
  iframeMode?: boolean,
}): Promise<ConfirmUIHandle> {
  // 'skip' mode should never request a UI mount; callers handle this.
  const variant: 'modal' | 'drawer' = (uiMode === 'drawer') ? 'drawer' : 'modal';
  const useIframe = isBoolean(iframeMode) ? iframeMode : !!ctx?.iframeModeDefault;
  if (useIframe) {
    try {
      return await mountIframeHostUiWithHandle({
        ctx,
        summary,
        txSigningRequests,
        vrfChallenge,
        loading,
        theme,
        variant,
        nearAccountIdOverride,
      });
    } catch (e) {
      // Safari/edge-case fallback: if iframe hydration fails, degrade to host-rendered UI
      try { console.warn('[LitComponents/confirm-ui] iframe mount failed, falling back to host UI', e); } catch {}
    }
  }
  return await mountHostUiWithHandle({
    ctx,
    summary,
    txSigningRequests,
    vrfChallenge,
    loading,
    theme,
    variant,
    nearAccountIdOverride,
  });
}

export async function awaitConfirmUIDecision({
  ctx,
  summary,
  txSigningRequests,
  vrfChallenge,
  theme,
  uiMode,
  nearAccountIdOverride,
  useIframe,
}: {
  ctx: SignerWorkerManagerContext,
  summary: TransactionSummary,
  txSigningRequests: TransactionInputWasm[],
  vrfChallenge: VRFChallenge,
  theme: 'dark' | 'light',
  uiMode: ConfirmationUIMode,
  nearAccountIdOverride: string,
  useIframe: boolean,
}): Promise<{ confirmed: boolean; handle: ConfirmUIHandle }> {
  const variant: 'modal' | 'drawer' = (uiMode === 'drawer') ? 'drawer' : 'modal';
  if (useIframe) {
    try {
      return await awaitIframeHostUiDecisionWithHandle({
        ctx,
        summary,
        txSigningRequests,
        vrfChallenge,
        theme,
        variant,
        nearAccountIdOverride,
      });
    } catch (e) {
      // Safari/edge-case fallback: if iframe hydration fails, degrade to host-rendered UI
      try { console.warn('[LitComponents/confirm-ui] iframe await failed, falling back to host UI', e); } catch {}
    }
  }
  return await awaitHostUiDecisionWithHandle({
    ctx,
    summary,
    txSigningRequests,
    vrfChallenge,
    theme,
    variant,
    nearAccountIdOverride,
  });
}

// Types and element export for consumers that need the iframe element handle
export type { default as IframeModalHost } from './IframeTxConfirmer/iframe-host';
export { W3A_IFRAME_TX_CONFIRMER_ID };
