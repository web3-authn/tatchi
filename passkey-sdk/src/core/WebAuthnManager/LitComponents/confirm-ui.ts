import { TransactionInputWasm, VRFChallenge } from '../../types';
import { IFRAME_MODAL_ID } from './tags';
import type { SignerWorkerManagerContext } from '../SignerWorkerManager';
import type { TransactionSummary } from '../SignerWorkerManager/confirmTxFlow/types';
import { isBoolean } from '../../WalletIframe/validation';
import type IframeModalHost from './IframeModalConfirmer/iframe-host';

// Ensure the modal element is defined when this bundle is loaded in an iframe
// The drawer variant is imported by the iframe bootstrap script.
import './IframeModalConfirmer/viewer-modal';

// ========= Iframe Modal helpers =========
async function ensureIframeModalDefined(): Promise<void> {
  if (customElements.get(IFRAME_MODAL_ID)) return;
  await new Promise<void>((resolve, reject) => {
    const existing = document.querySelector(`script[data-w3a="${IFRAME_MODAL_ID}"]`) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', (e) => reject(e), { once: true });
      return;
    }
    const base = (window as unknown as { __W3A_EMBEDDED_BASE__?: string }).__W3A_EMBEDDED_BASE__ || '/sdk/embedded/';
    const script = document.createElement('script');
    script.type = 'module';
    script.async = true;
    script.dataset.w3a = IFRAME_MODAL_ID;
    script.src = `${base}${IFRAME_MODAL_ID}.js`;
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
    if (customElements.get('w3a-drawer-tx-confirm')) return;
    await import('./IframeModalConfirmer/viewer-drawer');
    return;
  }
  if (customElements.get('passkey-modal-confirm')) return;
  await import('./IframeModalConfirmer/viewer-modal');
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
  const tag = v === 'drawer' ? 'w3a-drawer-tx-confirm' : 'passkey-modal-confirm';
  const el = document.createElement(tag) as any;
  el.nearAccountId = nearAccountIdOverride || ctx.userPreferencesManager.getCurrentUserAccountId() || '';
  el.txSigningRequests = txSigningRequests || [];
  el.intentDigest = summary?.intentDigest;
  if (vrfChallenge) el.vrfChallenge = vrfChallenge;
  if (theme) el.theme = theme;
  if (loading != null) el.loading = !!loading;
  // Two-phase close: let caller control removal
  try { el.deferClose = true; } catch {}
  document.body.appendChild(el);
  const close = (_confirmed: boolean) => { try { el.remove(); } catch {} };
  const update = (props: ConfirmUIUpdate) => {
    try {
      if (props.nearAccountId != null) (el as any).nearAccountId = props.nearAccountId;
      if (props.txSigningRequests != null) (el as any).txSigningRequests = props.txSigningRequests;
      if (props.vrfChallenge != null) (el as any).vrfChallenge = props.vrfChallenge;
      if (props.theme != null) (el as any).theme = props.theme;
      if (props.loading != null) (el as any).loading = !!props.loading;
      if ('errorMessage' in props) (el as any).errorMessage = props.errorMessage || '';
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
    const tag = v === 'drawer' ? 'w3a-drawer-tx-confirm' : 'passkey-modal-confirm';
    const el = document.createElement(tag) as any;
    el.nearAccountId = nearAccountIdOverride || ctx.userPreferencesManager.getCurrentUserAccountId() || '';
    el.txSigningRequests = txSigningRequests || [];
    el.intentDigest = summary?.intentDigest;
    if (vrfChallenge) el.vrfChallenge = vrfChallenge;
    if (theme) el.theme = theme;
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
          if ('errorMessage' in props) (el as any).errorMessage = props.errorMessage || '';
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
          if ('errorMessage' in props) (el as any).errorMessage = props.errorMessage || '';
          (el as any).requestUpdate?.();
        } catch {}
      };
      resolve({ confirmed: false, handle: { close, update } });
    };
    const cleanup = () => {
      try { el.removeEventListener('w3a:tx-confirmer-confirm', onConfirm as EventListener); } catch {}
      try { el.removeEventListener('w3a:tx-confirmer-cancel', onCancel as EventListener); } catch {}
      try { el.removeEventListener('w3a:modal-confirm', onConfirm as EventListener); } catch {}
      try { el.removeEventListener('w3a:modal-cancel', onCancel as EventListener); } catch {}
    };
    // Listen to new canonical events and legacy aliases for back-compat
    el.addEventListener('w3a:tx-confirmer-confirm', onConfirm as EventListener);
    el.addEventListener('w3a:tx-confirmer-cancel', onCancel as EventListener);
    el.addEventListener('w3a:modal-confirm', onConfirm as EventListener);
    el.addEventListener('w3a:modal-cancel', onCancel as EventListener);

    document.body.appendChild(el);
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
  const el = document.createElement(IFRAME_MODAL_ID) as IframeModalHost;
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
  document.body.appendChild(el);
  const close = (_confirmed: boolean) => { try { el.remove(); } catch {} };
  const update = (props: ConfirmUIUpdate) => {
    try {
      if (props.nearAccountId != null) (el as any).nearAccountId = props.nearAccountId;
      if (props.txSigningRequests != null) (el as any).txSigningRequests = props.txSigningRequests;
      if (props.vrfChallenge != null) (el as any).vrfChallenge = props.vrfChallenge;
      if (props.theme != null) (el as any).theme = props.theme;
      if (props.loading != null) (el as any).showLoading = !!props.loading;
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
    const el = document.createElement(IFRAME_MODAL_ID) as IframeModalHost;
    el.nearAccountId = nearAccountIdOverride || ctx.userPreferencesManager.getCurrentUserAccountId() || '';
    el.txSigningRequests = txSigningRequests || [];
    el.intentDigest = summary?.intentDigest;
    el.vrfChallenge = vrfChallenge;
    if (theme) { el.theme = theme; }
    if (variant) { (el as any).variant = variant; }

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
          (el as any).requestUpdate?.();
        } catch {}
      };
      resolve({ confirmed: false, handle: { close, update } });
    };

    const cleanup = () => {
      try { el.removeEventListener('w3a:tx-confirmer-confirm', onConfirm as EventListener); } catch {}
      try { el.removeEventListener('w3a:tx-confirmer-cancel', onCancel as EventListener); } catch {}
      try { el.removeEventListener('w3a:modal-confirm', onConfirm as EventListener); } catch {}
      try { el.removeEventListener('w3a:modal-cancel', onCancel as EventListener); } catch {}
    };

    // Listen to new canonical events and legacy aliases for back-compat
    el.addEventListener('w3a:tx-confirmer-confirm', onConfirm as EventListener);
    el.addEventListener('w3a:tx-confirmer-cancel', onCancel as EventListener);
    el.addEventListener('w3a:modal-confirm', onConfirm as EventListener);
    el.addEventListener('w3a:modal-cancel', onCancel as EventListener);
    document.body.appendChild(el);
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
export type { default as IframeModalHost } from './IframeModalConfirmer/iframe-host';
export { IFRAME_MODAL_ID };
