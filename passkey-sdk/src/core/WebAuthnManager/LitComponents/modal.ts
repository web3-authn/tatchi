// Import types and components needed for mount functions
import { TransactionInputWasm, VRFChallenge } from '../../types';
import { IFRAME_MODAL_ID } from './IframeButtonWithTooltipConfirmer/tags';
import type IframeModalHost from './IframeModalConfirmer/IframeModalHost';
import type { SignerWorkerManagerContext } from '../SignerWorkerManager';
import type { TransactionSummary } from '../SignerWorkerManager/confirmTxFlow/types';

export { ModalTxConfirmElement } from './IframeModalConfirmer/ModalTxConfirmer';
export type {
  ConfirmRenderMode,
  ConfirmVariant,
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
    const base = (window as any).__W3A_EMBEDDED_BASE__ || '/sdk/embedded/';
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

export async function mountIframeModalHostWithHandle({
  ctx,
  summary,
  txSigningRequests,
  vrfChallenge,
  loading,
  theme,
}: {
  ctx: SignerWorkerManagerContext,
  summary: TransactionSummary,
  txSigningRequests?: TransactionInputWasm[],
  vrfChallenge?: VRFChallenge,
  loading?: boolean,
  theme?: 'dark' | 'light',
}): Promise<{ element: IframeModalHost; close: (confirmed: boolean) => void }> {
  await ensureIframeModalDefined();
  const el = document.createElement(IFRAME_MODAL_ID) as IframeModalHost;
  el.nearAccountId = ctx.userPreferencesManager.getCurrentUserAccountId() || '';
  el.txSigningRequests = txSigningRequests || [];
  el.intentDigest = summary?.intentDigest;
  if (vrfChallenge) {
    el.vrfChallenge = vrfChallenge;
  }
  el.showLoading = !!loading;
  if (theme) {
    el.theme = theme;
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
}: {
  ctx: SignerWorkerManagerContext,
  summary: TransactionSummary,
  txSigningRequests?: TransactionInputWasm[],
  vrfChallenge?: VRFChallenge,
  theme?: 'dark' | 'light',
}): Promise<{
  confirmed: boolean;
  handle: { element: IframeModalHost; close: (confirmed: boolean) => void }
}> {
  await ensureIframeModalDefined();
  return new Promise((resolve) => {
    const el = document.createElement(IFRAME_MODAL_ID) as IframeModalHost;
    el.nearAccountId = ctx.userPreferencesManager.getCurrentUserAccountId() || '';
    el.txSigningRequests = txSigningRequests || [];
    el.intentDigest = summary?.intentDigest;
    if (vrfChallenge) {
      el.vrfChallenge = vrfChallenge;
    }
    if (theme) {
      el.theme = theme;
    }

    const onConfirm = (e: Event) => {
      const ce = e as CustomEvent<{ confirmed: boolean; error?: string }>;
      cleanup();
      const ok = !!(ce?.detail?.confirmed);
      resolve({
        confirmed: ok,
        handle: {
          element: el,
          close: (_confirmed: boolean) => { try { el.remove(); } catch {} }
        }
      });
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
