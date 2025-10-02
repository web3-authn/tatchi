import { TransactionInputWasm, VRFChallenge } from '../../types';
import { WalletIframeDomEvents } from '../../WalletIframe/events';
import { W3A_IFRAME_TX_CONFIRMER_ID, CONFIRM_UI_ELEMENT_SELECTORS, W3A_MODAL_TX_CONFIRMER_ID, W3A_DRAWER_TX_CONFIRMER_ID, W3A_CONFIRM_PORTAL_ID } from './tags';
import type { SignerWorkerManagerContext } from '../SignerWorkerManager';
import type { TransactionSummary } from '../SignerWorkerManager/confirmTxFlow/types';
import { isBoolean } from '../../WalletIframe/validation';
import type IframeModalHost from './IframeTxConfirmer/iframe-host';

// Ensure the modal element is defined when this bundle is loaded in an iframe
// The drawer variant is imported by the iframe bootstrap script.
import './IframeTxConfirmer/viewer-modal';

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
if (customElements.get(W3A_IFRAME_TX_CONFIRMER_ID)) return;
  await new Promise<void>((resolve, reject) => {
  const existing = document.querySelector(`script[data-w3a="${W3A_IFRAME_TX_CONFIRMER_ID}"]`) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', (e) => reject(e), { once: true });
      return;
    }
    const base = (window as unknown as { __W3A_EMBEDDED_BASE__?: string }).__W3A_EMBEDDED_BASE__ || '/sdk/';
    const script = document.createElement('script');
    script.type = 'module';
    script.async = true;
  script.dataset.w3a = W3A_IFRAME_TX_CONFIRMER_ID;
  script.src = `${base}${W3A_IFRAME_TX_CONFIRMER_ID}.js`;
    script.onload = () => resolve();
    script.onerror = (e) => {
      console.error('[LitComponents/confirm-ui] Failed to load iframe modal host bundle', script.src);
      reject(e);
    };
    document.head.appendChild(script);
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
  const el = document.createElement(tag) as any;
  el.nearAccountId = nearAccountIdOverride || ctx.userPreferencesManager.getCurrentUserAccountId() || '';
  el.txSigningRequests = txSigningRequests || [];
  el.intentDigest = summary?.intentDigest;
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
      if (props.nearAccountId != null) (el as any).nearAccountId = props.nearAccountId;
      if (props.txSigningRequests != null) (el as any).txSigningRequests = props.txSigningRequests;
      if (props.vrfChallenge != null) (el as any).vrfChallenge = props.vrfChallenge;
      if (props.theme != null) (el as any).theme = props.theme;
      if (props.loading != null) (el as any).loading = !!props.loading;
      if ('errorMessage' in props) {
        const msg = props.errorMessage ?? '';
        (el as any).errorMessage = msg;
        setErrorAttribute(el, msg);
      }
      (el as any).requestUpdate?.();
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
    const el = document.createElement(tag) as any;
    el.nearAccountId = nearAccountIdOverride || ctx.userPreferencesManager.getCurrentUserAccountId() || '';
    el.txSigningRequests = txSigningRequests || [];
    el.intentDigest = summary?.intentDigest;
    if (vrfChallenge) el.vrfChallenge = vrfChallenge;
    if (theme) el.theme = theme;
    try { el.removeAttribute('data-error-message'); } catch {}
    try { el.deferClose = true; } catch {}

    const onConfirm = (_e: Event) => {
      cleanup();
      const close = (_c: boolean) => { try { el.remove(); } catch {} };
      const update = (props: ConfirmUIUpdate) => {
        try {
          if (props.nearAccountId != null) (el as any).nearAccountId = props.nearAccountId;
          if (props.txSigningRequests != null) (el as any).txSigningRequests = props.txSigningRequests;
          if (props.vrfChallenge != null) (el as any).vrfChallenge = props.vrfChallenge;
          if (props.theme != null) (el as any).theme = props.theme;
          if (props.loading != null) (el as any).loading = !!props.loading;
          if ('errorMessage' in props) {
            const msg = props.errorMessage ?? '';
            (el as any).errorMessage = msg;
            setErrorAttribute(el, msg);
          }
          (el as any).requestUpdate?.();
        } catch {}
      };
      resolve({ confirmed: true, handle: { close, update } });
    };
    const onCancel = () => {
      cleanup();
      const close = (_c: boolean) => { try { el.remove(); } catch {} };
      const update = (props: ConfirmUIUpdate) => {
        try {
          if (props.nearAccountId != null) (el as any).nearAccountId = props.nearAccountId;
          if (props.txSigningRequests != null) (el as any).txSigningRequests = props.txSigningRequests;
          if (props.vrfChallenge != null) (el as any).vrfChallenge = props.vrfChallenge;
          if (props.theme != null) (el as any).theme = props.theme;
          if (props.loading != null) (el as any).loading = !!props.loading;
          if ('errorMessage' in props) {
            const msg = props.errorMessage ?? '';
            (el as any).errorMessage = msg;
            setErrorAttribute(el, msg);
          }
          (el as any).requestUpdate?.();
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
  el.intentDigest = summary?.intentDigest;
  if (vrfChallenge) {
    el.vrfChallenge = vrfChallenge;
  }
  el.showLoading = !!loading;
  if (theme) {
    el.theme = theme;
  }
  if (variant) {
    (el as any).variant = variant;
  }
  try { el.removeAttribute('data-error-message'); } catch {}
  const portal = ensureConfirmPortal();
  portal.replaceChildren(el);
  const close = (_confirmed: boolean) => { try { el.remove(); } catch {} };
  const update = (props: ConfirmUIUpdate) => {
    try {
      if (props.nearAccountId != null) (el as any).nearAccountId = props.nearAccountId;
      if (props.txSigningRequests != null) (el as any).txSigningRequests = props.txSigningRequests;
      if (props.vrfChallenge != null) (el as any).vrfChallenge = props.vrfChallenge;
      if (props.theme != null) (el as any).theme = props.theme;
      if (props.loading != null) (el as any).showLoading = !!props.loading;
      if ('errorMessage' in props) {
        const msg = props.errorMessage ?? '';
        (el as any).errorMessage = msg;
        try {
          if (msg) {
            el.setAttribute('data-error-message', msg);
          } else {
            el.removeAttribute('data-error-message');
          }
        } catch {}
      }
      (el as any).requestUpdate?.();
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
    el.intentDigest = summary?.intentDigest;
    el.vrfChallenge = vrfChallenge;
    if (theme) { el.theme = theme; }
    if (variant) { (el as any).variant = variant; }
    try { el.removeAttribute('data-error-message'); } catch {}

    const onConfirm = (e: Event) => {
      const ce = e as CustomEvent<{ confirmed: boolean; error?: string }>;
      cleanup();
      const ok = !!(ce?.detail?.confirmed);
      const close = (_c: boolean) => { try { el.remove(); } catch {} };
      const update = (props: ConfirmUIUpdate) => {
        try {
          if (props.nearAccountId != null) (el as any).nearAccountId = props.nearAccountId;
          if (props.txSigningRequests != null) (el as any).txSigningRequests = props.txSigningRequests;
          if (props.vrfChallenge != null) (el as any).vrfChallenge = props.vrfChallenge;
          if (props.theme != null) (el as any).theme = props.theme;
          if (props.loading != null) (el as any).showLoading = !!props.loading;
          if ('errorMessage' in props) {
            const msg = props.errorMessage ?? '';
            (el as any).errorMessage = msg;
            setErrorAttribute(el, msg);
          }
          (el as any).requestUpdate?.();
        } catch {}
      };
      resolve({ confirmed: ok, handle: { close, update } });
    };

    const onCancel = () => {
      cleanup();
      const close = (_confirmed: boolean) => { try { el.remove(); } catch {} };
      const update = (props: ConfirmUIUpdate) => {
        try {
          if (props.nearAccountId != null) (el as any).nearAccountId = props.nearAccountId;
          if (props.txSigningRequests != null) (el as any).txSigningRequests = props.txSigningRequests;
          if (props.vrfChallenge != null) (el as any).vrfChallenge = props.vrfChallenge;
          if (props.theme != null) (el as any).theme = props.theme;
          if (props.loading != null) (el as any).showLoading = !!props.loading;
          if ('errorMessage' in props) {
            const msg = props.errorMessage ?? '';
            (el as any).errorMessage = msg;
            try {
              if (msg) {
                el.setAttribute('data-error-message', msg);
              } else {
                el.removeAttribute('data-error-message');
              }
            } catch {}
          }
          (el as any).requestUpdate?.();
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
    return await awaitIframeHostUiDecisionWithHandle({
      ctx,
      summary,
      txSigningRequests,
      vrfChallenge,
      theme,
      variant,
      nearAccountIdOverride,
    });
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
