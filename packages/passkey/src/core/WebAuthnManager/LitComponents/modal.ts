// Import types and components needed for mount functions
import { TransactionInputWasm } from '../../types';
import {
  ModalTxConfirmElement,
  activeResolvers,
  type ConfirmRenderMode,
  type ConfirmVariant,
  type SecureTxSummary,
} from './ModalTxConfirmElement';
import { IFRAME_MODAL_ID } from './IframeButtonWithTooltipConfirmer/tags';
import type { SignerWorkerManagerContext } from '../SignerWorkerManager';
import type { TransactionSummary } from '../SignerWorkerManager/confirmTxFlow/types';

// Granular exports for ModalTxConfirmElement
export {
  ModalTxConfirmElement,
  activeResolvers
} from './ModalTxConfirmElement';

export type {
  ConfirmRenderMode,
  ConfirmVariant,
  SecureTxSummary,
  TxAction,
} from './ModalTxConfirmElement';

// (Deprecated) Legacy direct modal mounts removed in favor of iframe-hosted modal

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
    const script = document.createElement('script');
    script.type = 'module';
    script.async = true;
    script.dataset.w3a = IFRAME_MODAL_ID;
    script.src = `/sdk/embedded/${IFRAME_MODAL_ID}.js`;
    script.onload = () => resolve();
    script.onerror = (e) => {
      console.error('[LitComponents/modal] Failed to load iframe modal host bundle');
      reject(e);
    };
    document.head.appendChild(script);
  });
}

export async function mountIframeModalHostWithHandle({
  ctx,
  summary,
  txSigningRequests,
  loading,
}: {
  ctx: SignerWorkerManagerContext,
  summary: TransactionSummary,
  txSigningRequests?: TransactionInputWasm[],
  loading?: boolean,
}): Promise<{ element: any; close: (confirmed: boolean) => void }> {
  await ensureIframeModalDefined();
  const el = document.createElement(IFRAME_MODAL_ID) as any;
  el.nearAccountId = ctx.currentUserAccountId || '';
  el.txSigningRequests = txSigningRequests || [];
  el.intentDigest = summary?.fingerprint;
  el.showLoading = !!loading;
  document.body.appendChild(el);
  const close = (_confirmed: boolean) => { try { el.remove(); } catch {} };
  return { element: el, close };
}

export async function awaitIframeModalDecision({
  ctx,
  summary,
  txSigningRequests,
}: {
  ctx: SignerWorkerManagerContext,
  summary: TransactionSummary,
  txSigningRequests?: TransactionInputWasm[],
}): Promise<boolean> {
  await ensureIframeModalDefined();
  return new Promise((resolve) => {
    const el = document.createElement(IFRAME_MODAL_ID) as any;
    el.nearAccountId = ctx.currentUserAccountId || '';
    el.txSigningRequests = txSigningRequests || [];
    el.intentDigest = summary?.fingerprint;

    const onConfirm = (e: any) => {
      cleanup();
      const ok = !!(e?.detail?.confirmed);
      resolve(ok);
    };
    const onCancel = () => { cleanup(); resolve(false); };

    const cleanup = () => {
      try { el.removeEventListener('w3a:modal-confirm', onConfirm as any); } catch {}
      try { el.removeEventListener('w3a:modal-cancel', onCancel as any); } catch {}
      try { el.remove(); } catch {}
    };

    el.addEventListener('w3a:modal-confirm', onConfirm as any);
    el.addEventListener('w3a:modal-cancel', onCancel as any);
    document.body.appendChild(el);
  });
}
