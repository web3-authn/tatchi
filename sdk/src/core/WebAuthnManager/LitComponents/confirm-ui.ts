import { TransactionInputWasm, VRFChallenge } from '../../types';
import { WalletIframeDomEvents } from '../../WalletIframe/events';
import { W3A_TX_CONFIRMER_ID, CONFIRM_UI_ELEMENT_SELECTORS, W3A_CONFIRM_PORTAL_ID } from './tags';
import type { SignerWorkerManagerContext } from '../SignerWorkerManager';
import type { TransactionSummary } from '../SignerWorkerManager/confirmTxFlow/types';

// Minimal host element interface for the inline confirmer wrapper.
interface HostTxConfirmerElement extends HTMLElement {
  variant?: 'modal' | 'drawer';
  nearAccountId: string;
  txSigningRequests: TransactionInputWasm[];
  intentDigest?: string;
  vrfChallenge?: VRFChallenge;
  theme?: 'dark' | 'light';
  loading?: boolean;      // host elements use `loading` (iframe element uses `showLoading`)
  deferClose?: boolean;   // two-phase close coordination
  errorMessage?: string;
  requestUpdate?: () => void; // Lit element update hook (optional)
}

// Ensure the wrapper element is registered when this module loads.
import './IframeTxConfirmer/tx-confirmer-wrapper';

// Small helper to keep a host element's error attribute in sync
function setErrorAttribute(el: HTMLElement, msg: string): void {
  if (msg) {
    el.setAttribute('data-error-message', msg);
  } else {
    el.removeAttribute('data-error-message');
  }
}

function applyHostElementProps(el: HostTxConfirmerElement, props?: ConfirmUIUpdate): void {
  if (!props) return;
  if (props.nearAccountId != null) el.nearAccountId = props.nearAccountId;
  if (props.txSigningRequests != null) el.txSigningRequests = props.txSigningRequests;
  if (props.vrfChallenge != null) el.vrfChallenge = props.vrfChallenge;
  if (props.theme != null) el.theme = props.theme;
  if (props.loading != null) el.loading = !!props.loading;
  if ('errorMessage' in (props as Record<string, unknown>)) {
    const msg = props.errorMessage ?? '';
    el.errorMessage = msg;
    setErrorAttribute(el, msg);
  }
  el.requestUpdate?.();
}

function createHostConfirmHandle(el: HostTxConfirmerElement): ConfirmUIHandle {
  return {
    close: (_confirmed: boolean) => { el.remove(); },
    update: (props: ConfirmUIUpdate) => applyHostElementProps(el, props),
  };
}

// ===== Inline confirmer helpers =====
function cleanupExistingConfirmers(): void {
  const portal = document.getElementById(W3A_CONFIRM_PORTAL_ID);
  if (portal) {
    const existing = Array.from(portal.querySelectorAll('*')) as HTMLElement[];
    for (const el of existing) {
      el.dispatchEvent(new CustomEvent(WalletIframeDomEvents.TX_CONFIRMER_CANCEL, { bubbles: true, composed: true }));
    }
    portal.replaceChildren();
    return;
  }

  const selectors = CONFIRM_UI_ELEMENT_SELECTORS as readonly string[];
  const els = selectors.flatMap((sel) => Array.from(document.querySelectorAll(sel)) as HTMLElement[]);
  for (const el of els) {
    el.dispatchEvent(new CustomEvent(WalletIframeDomEvents.TX_CONFIRMER_CANCEL, { bubbles: true, composed: true }));
    el.remove();
  }
}

function ensureConfirmPortal(): HTMLElement {
  let portal = document.getElementById(W3A_CONFIRM_PORTAL_ID) as HTMLElement | null;
  if (!portal) {
    portal = document.createElement('div');
    portal.id = W3A_CONFIRM_PORTAL_ID;
    // Keep the portal inert except for stacking; children handle their own overlay
    portal.style.position = 'relative';
    portal.style.zIndex = '2147483647';
    const root = document.body ?? document.documentElement;
    if (root) {
      root.appendChild(portal);
    }
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
  cleanupExistingConfirmers();
  const el = document.createElement(W3A_TX_CONFIRMER_ID) as HostTxConfirmerElement;
  el.variant = v;
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
  el.removeAttribute('data-error-message');
  // Two-phase close: let caller control removal
  el.deferClose = true;
  const portal = ensureConfirmPortal();
  portal.replaceChildren(el);
  return createHostConfirmHandle(el);
}

type ConfirmEventDetail = {
  confirmed?: boolean;
  error?: string;
};

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
}): Promise<{ confirmed: boolean; handle: ConfirmUIHandle; error?: string }> {
  const v: 'modal' | 'drawer' = variant || 'modal';
  return new Promise((resolve) => {
    cleanupExistingConfirmers();
    const el = document.createElement(W3A_TX_CONFIRMER_ID) as HostTxConfirmerElement;
    el.variant = v;
    el.nearAccountId = nearAccountIdOverride || ctx.userPreferencesManager.getCurrentUserAccountId() || '';
    el.txSigningRequests = txSigningRequests || [];
    if ((txSigningRequests?.length || 0) > 0) {
      el.intentDigest = summary?.intentDigest;
    }
    if (vrfChallenge) el.vrfChallenge = vrfChallenge;
    if (theme) el.theme = theme;
    el.removeAttribute('data-error-message');
    el.deferClose = true;

    const handle = createHostConfirmHandle(el);

    const finalize = (result: { confirmed: boolean; error?: string }) => {
      cleanup();
      resolve({ ...result, handle });
    };

    const onConfirm = (event: Event) => {
      const detail = (event as CustomEvent<ConfirmEventDetail> | undefined)?.detail;
      const confirmed = detail?.confirmed !== false;
      const error = typeof detail?.error === 'string' ? detail.error : undefined;
      if (!confirmed) {
        if (error) handle.update({ errorMessage: error, loading: false });
        else handle.update({ loading: false, errorMessage: '' });
        finalize({ confirmed: false, error });
        return;
      }
      finalize({ confirmed: true });
    };
    const onCancel = (event?: Event) => {
      const detail = (event as CustomEvent<ConfirmEventDetail> | undefined)?.detail;
      const error = typeof detail?.error === 'string' ? detail.error : undefined;
      if (error) handle.update({ errorMessage: error, loading: false });
      else handle.update({ loading: false });
      finalize({ confirmed: false, error });
    };
    const cleanup = () => {
      el.removeEventListener(WalletIframeDomEvents.TX_CONFIRMER_CONFIRM, onConfirm as EventListener);
      el.removeEventListener(WalletIframeDomEvents.TX_CONFIRMER_CANCEL, onCancel as EventListener);
    };
    // Listen to canonical events only
    el.addEventListener(WalletIframeDomEvents.TX_CONFIRMER_CONFIRM, onConfirm as EventListener);
    el.addEventListener(WalletIframeDomEvents.TX_CONFIRMER_CANCEL, onCancel as EventListener);

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
}: {
  ctx: SignerWorkerManagerContext,
  summary: TransactionSummary,
  txSigningRequests?: TransactionInputWasm[],
  vrfChallenge?: VRFChallenge,
  loading?: boolean,
  theme?: 'dark' | 'light',
  uiMode: ConfirmationUIMode,
  nearAccountIdOverride?: string,
}): Promise<ConfirmUIHandle> {
  // 'skip' mode should never request a UI mount; callers handle this.
  const variant: 'modal' | 'drawer' = (uiMode === 'drawer') ? 'drawer' : 'modal';
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
}: {
  ctx: SignerWorkerManagerContext,
  summary: TransactionSummary,
  txSigningRequests: TransactionInputWasm[],
  vrfChallenge: VRFChallenge,
  theme: 'dark' | 'light',
  uiMode: ConfirmationUIMode,
  nearAccountIdOverride: string,
}): Promise<{ confirmed: boolean; handle: ConfirmUIHandle; error?: string }> {
  const variant: 'modal' | 'drawer' = (uiMode === 'drawer') ? 'drawer' : 'modal';
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

// Types and element export for consumers that need the inline confirmer handle
export type { TxConfirmerWrapperElement } from './IframeTxConfirmer/tx-confirmer-wrapper';
export { W3A_TX_CONFIRMER_ID };
