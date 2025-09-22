// Import types and components needed for mount functions
import { TransactionInputWasm, VRFChallenge } from '../../types';
import { IFRAME_MODAL_ID } from './tags';
import type IframeModalHost from './IframeModalConfirmer/IframeModalHost';
import type { SignerWorkerManagerContext } from '../SignerWorkerManager';
import type { TransactionSummary } from '../SignerWorkerManager/confirmTxFlow/types';
import { isBoolean } from '../../WalletIframe/validation';

export { ModalTxConfirmElement } from './IframeModalConfirmer/ModalTxConfirmer';
export type {
  SecureTxSummary,
  TxAction,
} from './IframeModalConfirmer/ModalTxConfirmer';

// ========= Iframe Modal helpers =========

export async function ensureIframeModalDefined(): Promise<void> {
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
      console.error('[LitComponents/modal] Failed to load iframe modal host bundle', script.src);
      reject(e);
    };
    document.head.appendChild(script);
  });
}

// ========= Host Modal helpers (no nested iframe) =========

async function ensureHostElementDefined(variant: 'modal' | 'drawer' = 'modal'): Promise<void> {
  if (variant === 'drawer') {
    if (customElements.get('w3a-drawer-tx-confirm')) return;
    await import('./IframeModalConfirmer/DrawerTxConfirmer');
    return;
  }
  if (customElements.get('passkey-modal-confirm')) return;
  await import('./IframeModalConfirmer/ModalTxConfirmer');
}

type PasskeyModalConfirmElement = HTMLElement & {
  nearAccountId?: string;
  txSigningRequests?: TransactionInputWasm[];
  intentDigest?: string;
  vrfChallenge?: VRFChallenge;
  theme?: 'dark' | 'light';
  loading?: boolean;
  deferClose?: boolean;
  close?: (confirmed: boolean) => void;
};

export async function mountHostUiWithHandle({
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
}): Promise<{ element: any; close: (confirmed: boolean) => void }> {
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
  return { element: el, close };
}

export async function awaitHostUiDecisionWithHandle({
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
}): Promise<{ confirmed: boolean; handle: { element: any; close: (confirmed: boolean) => void } }> {
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

    const onConfirm = (e: Event) => {
      cleanup();
      resolve({
        confirmed: true,
        handle: { element: el, close: (_c: boolean) => {el.remove();} }
      });
    };
    const onCancel = () => {
      cleanup();
      resolve({
        confirmed: false,
        handle: { element: el, close: (_c: boolean) => {el.remove();} }
      });
    };
    const cleanup = () => {
      try { el.removeEventListener('w3a:modal-confirm', onConfirm as EventListener); } catch {}
      try { el.removeEventListener('w3a:modal-cancel', onCancel as EventListener); } catch {}
    };
    // Listen for both the new canonical events and legacy aliases
    el.addEventListener('w3a:modal-confirm', onConfirm as EventListener);
    el.addEventListener('w3a:modal-cancel', onCancel as EventListener);

    document.body.appendChild(el);
  });
}

export async function mountIframeModalHostWithHandle({
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
}): Promise<{ element: IframeModalHost; close: (confirmed: boolean) => void }> {
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
  return { element: el, close };
}

export async function awaitIframeModalDecisionWithHandle({
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
}): Promise<{ confirmed: boolean; handle: { element: IframeModalHost; close: (confirmed: boolean) => void } }>{
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
      resolve({ confirmed: ok, handle: { element: el, close: (_c: boolean) => { try { el.remove(); } catch {} } } });
    };

    const onCancel = () => {
      cleanup();
      resolve({
        confirmed: false,
        handle: {
          element: el,
          close: (_confirmed: boolean) => { try { el.remove(); } catch {} }
        }
      });
    };

    const cleanup = () => {
      try { el.removeEventListener('w3a:modal-confirm', onConfirm as EventListener); } catch {}
      try { el.removeEventListener('w3a:modal-cancel', onCancel as EventListener); } catch {}
    };

    el.addEventListener('w3a:modal-confirm', onConfirm as EventListener);
    el.addEventListener('w3a:modal-cancel', onCancel as EventListener);
    document.body.appendChild(el);
  });
}

// ========= Unified helpers (choose host vs iframe) =========

export async function mountModalTxConfirmer({
  ctx,
  summary,
  txSigningRequests,
  vrfChallenge,
  loading,
  theme,
  variant,
  nearAccountIdOverride,
  iframeMode,
}: {
  ctx: SignerWorkerManagerContext,
  summary: TransactionSummary,
  txSigningRequests?: TransactionInputWasm[],
  vrfChallenge?: VRFChallenge,
  loading?: boolean,
  theme?: 'dark' | 'light',
  variant?: 'modal' | 'drawer',
  nearAccountIdOverride?: string,
  iframeMode?: boolean,
}): Promise<{ element: any; close: (confirmed: boolean) => void }> {
  const useIframe = isBoolean(iframeMode) ? iframeMode : !!ctx?.iframeModeDefault;
  if (useIframe) {
    return await mountIframeModalHostWithHandle({
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

export async function awaitModalTxConfirmerDecision({
  ctx,
  summary,
  txSigningRequests,
  vrfChallenge,
  theme,
  variant,
  nearAccountIdOverride,
  useIframe,
}: {
  ctx: SignerWorkerManagerContext,
  summary: TransactionSummary,
  txSigningRequests: TransactionInputWasm[],
  vrfChallenge: VRFChallenge,
  theme: 'dark' | 'light',
  variant?: 'modal' | 'drawer',
  nearAccountIdOverride: string,
  useIframe: boolean,
}): Promise<{
  confirmed: boolean;
  handle: { element: any; close: (confirmed: boolean) => void }
}> {
  if (useIframe) {
    return await awaitIframeModalDecisionWithHandle({
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
