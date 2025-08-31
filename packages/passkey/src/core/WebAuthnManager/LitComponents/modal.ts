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

/**
 * Mounts a modal transaction confirmation dialog using Lit and closed Shadow DOM.
 * Returns a promise that resolves to true if confirmed, false if cancelled.
 */
export function mountModalTxConfirm(opts: {
  container?: HTMLElement | null;
  summary: SecureTxSummary;
  txSigningRequests?: TransactionInputWasm[];
  mode?: ConfirmRenderMode;
  variant?: ConfirmVariant;
  title?: string;
  cancelText?: string;
  confirmText?: string;
  theme?: Record<string, string>;
}): Promise<boolean> {
  return new Promise((resolve) => {
    const attachRoot = opts.container ?? document.body;

    // Remove any existing instance
    const existing = attachRoot.querySelector('passkey-modal-confirm');
    if (existing) {
      existing.remove();
    }

    // Create new Lit element
    const element = new ModalTxConfirmElement();

    // Store the resolver in WeakMap
    activeResolvers.set(element, resolve);

    // Set properties (Lit automatically handles reactivity)
    element.mode = opts.mode ?? 'modal';
    element.variant = opts.variant ?? 'default';
    element.totalAmount = opts.summary?.totalAmount ?? '';
    element.method = opts.summary?.method ?? '';
    element.fingerprint = opts.summary?.fingerprint ?? '';
    element.title = opts.title ?? 'Confirm Transaction';
    element.cancelText = opts.cancelText ?? 'Cancel';
    element.confirmText = opts.confirmText ?? 'Confirm & Sign';

    if (opts.txSigningRequests) {
      element.txSigningRequests = opts.txSigningRequests;
    }

    // Apply custom theme if provided
    if (opts.theme) {
      Object.entries(opts.theme).forEach(([k, v]) => {
        element.style.setProperty(k, v);
      });
    }

    // Append to DOM - this triggers Lit's lifecycle
    attachRoot.appendChild(element);
  });
}

/**
 * Mounts a modal confirmation UI and returns a handle to programmatically close it.
 * Does not return a Promise; caller is responsible for calling close(confirmed) when appropriate.
 *
 * Used in signerWorkerManager.ts to programmatically close the confirmation dialog
 * after TouchID prompt succeeds.
 */
export function mountModalTxConfirmWithHandle(opts: {
  container?: HTMLElement | null;
  summary: SecureTxSummary;
  txSigningRequests?: TransactionInputWasm[];
  mode?: ConfirmRenderMode;
  variant?: ConfirmVariant;
  title?: string;
  cancelText?: string;
  confirmText?: string;
  theme?: Record<string, string>;
  loading?: boolean;
}): {
  element: ModalTxConfirmElement;
  close: (confirmed: boolean) => void
} {

  const attachRoot = opts.container ?? document.body;
  const existing = attachRoot.querySelector('passkey-confirm');
  if (existing) {
    existing.remove();
  }

  const element = new ModalTxConfirmElement();
  // Store a no-op resolver by default; will be replaced if consumer also calls mountModalTxConfirm
  activeResolvers.set(element as unknown as HTMLElement, () => {});

  element.mode = opts.mode ?? 'modal';
  element.variant = opts.variant ?? 'default';
  element.totalAmount = opts.summary?.totalAmount ?? '';
  element.method = opts.summary?.method ?? '';
  element.fingerprint = opts.summary?.fingerprint ?? '';
  element.title = opts.title ?? 'Sign Transaction with TouchID';
  element.cancelText = opts.cancelText ?? 'Cancel';
  element.confirmText = opts.confirmText ?? 'Confirm';
  element.loading = opts.loading ?? false;

  // Handle transaction signing requests (preferred) or legacy actions
  if (opts.txSigningRequests) {
    element.txSigningRequests = opts.txSigningRequests;
  }

  if (opts.theme) {
    Object.entries(opts.theme).forEach(([k, v]) => {
      element.style.setProperty(k, v);
    });
  }

  attachRoot.appendChild(element);

  const close = (confirmed: boolean) => {
    const resolve = activeResolvers.get(element as unknown as HTMLElement);
    if (resolve) {
      try { resolve(confirmed); } catch {}
      activeResolvers.delete(element as unknown as HTMLElement);
    }
    element.remove();
  };

  return { element, close };
}

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
