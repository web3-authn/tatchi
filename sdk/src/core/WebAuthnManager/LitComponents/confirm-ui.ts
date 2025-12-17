import { isActionArgsWasm, toActionArgsWasm, type ActionArgs, type ActionArgsWasm } from '@/core/types/actions';
import type { VrfWorkerManagerContext } from '../VrfWorkerManager';
import type { TransactionSummary } from '../VrfWorkerManager/confirmTxFlow/types';
import { WalletIframeDomEvents } from '../../WalletIframe/events';
import { TransactionInputWasm, VRFChallenge } from '../../types';

import { W3A_TX_CONFIRMER_ID, CONFIRM_UI_ELEMENT_SELECTORS, W3A_CONFIRM_PORTAL_ID } from './tags';
import type { ConfirmUIHandle, ConfirmUIUpdate, ConfirmationUIMode, ThemeName } from './confirm-ui-types';
export type { ConfirmUIHandle, ConfirmUIUpdate, ConfirmationUIMode } from './confirm-ui-types';
import { validateTheme } from './confirm-ui-types';
import { computeUiIntentDigestFromTxs, orderActionForDigest } from '../txDigest';
// Ensure the wrapper element is registered when this module loads.
import './IframeTxConfirmer/tx-confirmer-wrapper';

// Resolve theme preference from explicit param, user preferences, or DOM attribute
function resolveTheme(ctx: VrfWorkerManagerContext, requested?: ThemeName): ThemeName {
  let resolved = validateTheme(requested);
  if (!resolved) {
    try { resolved = validateTheme((ctx as any)?.userPreferencesManager?.getUserTheme?.()); } catch {}
  }
  if (!resolved) {
    const domAttr = (document?.documentElement?.getAttribute('data-w3a-theme') || '').toLowerCase();
    resolved = validateTheme(domAttr);
  }
  return resolved || 'dark';
}

// Minimal host element interface for the inline confirmer wrapper.
interface HostTxConfirmerElement extends HTMLElement {
  variant?: 'modal' | 'drawer';
  nearAccountId: string;
  txSigningRequests: TransactionInputWasm[];
  intentDigest?: string;
  vrfChallenge?: Partial<VRFChallenge>;
  theme?: ThemeName;
  loading?: boolean;      // host elements use `loading` (iframe element uses `showLoading`)
  deferClose?: boolean;   // two-phase close coordination
  errorMessage?: string;
  title: string;
  requestUpdate?: () => void; // Lit element update hook (optional)
  nearExplorerUrl?: string;
}

////////////////////////////
// === Public Functions ===
////////////////////////////

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
  ctx: VrfWorkerManagerContext,
  summary: TransactionSummary,
  txSigningRequests?: TransactionInputWasm[],
  vrfChallenge?: Partial<VRFChallenge>,
  loading?: boolean,
  theme?: ThemeName,
  uiMode: ConfirmationUIMode,
  nearAccountIdOverride?: string,
}): Promise<ConfirmUIHandle> {
  // 'skip' mode should never request a UI mount; callers handle this.
  const variant = uiModeToVariant(uiMode);
  const { handle } = mountHostElement({
    ctx,
    summary,
    txSigningRequests,
    vrfChallenge,
    loading,
    theme,
    variant,
    nearAccountIdOverride,
  });
  return handle;
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
  ctx: VrfWorkerManagerContext,
  summary: TransactionSummary,
  txSigningRequests: TransactionInputWasm[],
  vrfChallenge?: Partial<VRFChallenge>,
  theme: ThemeName,
  uiMode: ConfirmationUIMode,
  nearAccountIdOverride: string,
}): Promise<{ confirmed: boolean; handle: ConfirmUIHandle; error?: string }> {
  const variant = uiModeToVariant(uiMode);
  const v: 'modal' | 'drawer' = variant || 'modal';

  return new Promise((resolve) => {
    const { el, handle } = mountHostElement({
      ctx,
      summary,
      txSigningRequests,
      vrfChallenge,
      theme,
      variant: v,
      nearAccountIdOverride,
    });

    const finalize = (result: { confirmed: boolean; error?: string }) => {
      cleanup();
      resolve({ ...result, handle });
    };

    const onConfirm = async (event: Event) => {
      const detail = (event as CustomEvent<ConfirmEventDetail> | undefined)?.detail;
      let confirmed = detail?.confirmed !== false;
      let error = typeof detail?.error === 'string' ? detail.error : undefined;
      // Defensive UI digest validation in case wrapper capture-phase did not intercept
      if (confirmed) {
        const guardErr = await checkIntentDigestGuard(summary, txSigningRequests);
        if (guardErr) {
          confirmed = false;
          if (!error) error = guardErr;
        }
      }

      if (!confirmed) {
        if (error) {
          handle.update({ errorMessage: error, loading: false });
        } else {
          handle.update({ loading: false, errorMessage: '' });
        }
        finalize({ confirmed: false, error });
        return;
      }
      finalize({ confirmed: true });
    };

    const onCancel = (event?: Event) => {
      const detail = (event as CustomEvent<ConfirmEventDetail> | undefined)?.detail;
      const error = typeof detail?.error === 'string' ? detail.error : undefined;
      if (error) {
        handle.update({ errorMessage: error, loading: false });
      } else {
        handle.update({ loading: false });
      }
      finalize({ confirmed: false, error });
    };

    const cleanup = () => {
      el.removeEventListener(WalletIframeDomEvents.TX_CONFIRMER_CONFIRM, onConfirm as EventListener);
      el.removeEventListener(WalletIframeDomEvents.TX_CONFIRMER_CANCEL, onCancel as EventListener);
    };

    // Listen to canonical events only
    el.addEventListener(WalletIframeDomEvents.TX_CONFIRMER_CONFIRM, onConfirm as EventListener);
    el.addEventListener(WalletIframeDomEvents.TX_CONFIRMER_CANCEL, onCancel as EventListener);
  });
}

//////////////////////
// Internal Functions
//////////////////////

async function checkIntentDigestGuard(
  summary: TransactionSummary | undefined,
  txSigningRequests?: TransactionInputWasm[],
): Promise<string | undefined> {
  const hasTxs = (txSigningRequests?.length || 0) > 0;
  const expected = summary?.intentDigest;
  if (!hasTxs || !expected) return undefined;
  try {
    // UI-side check must mirror the canonical intent digest:
    // { receiverId, actions: ActionArgsWasm[] } with actions normalized
    // via orderActionForDigest, and no nonce included.
    const normalized: TransactionInputWasm[] = (txSigningRequests || []).map((tx) => ({
      receiverId: tx.receiverId,
      actions: (tx.actions || [])
        .map((a) => (isActionArgsWasm(a) ? a : toActionArgsWasm(a as unknown as ActionArgs)))
        .map((a) => orderActionForDigest(a as ActionArgsWasm) as ActionArgsWasm),
    }));
    const uiDigest = await computeUiIntentDigestFromTxs(normalized);
    if (uiDigest !== expected) return 'INTENT_DIGEST_MISMATCH';
    return undefined;
  } catch {
    return 'UI_DIGEST_VALIDATION_FAILED';
  }
}

function createHostConfirmHandle(el: HostTxConfirmerElement): ConfirmUIHandle {
  return {
    close: (_confirmed: boolean) => { el.remove(); },
    update: (props: ConfirmUIUpdate) => applyHostElementProps(el, props),
  };
}

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
  if ((props as any).title != null) el.title = (props as any).title;
  if ('errorMessage' in (props as Record<string, unknown>)) {
    const msg = props.errorMessage ?? '';
    el.errorMessage = msg;
    setErrorAttribute(el, msg);
  }
  if ((props as any).nearExplorerUrl != null) {
    el.nearExplorerUrl = (props as any).nearExplorerUrl;
  }
  el.requestUpdate?.();
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
    // Class-based only to comply with strict CSP
    portal.classList.add('w3a-portal');
    const root = document.body ?? document.documentElement;
    if (root) {
      root.appendChild(portal);
    }
  }
  return portal;
}

type ConfirmEventDetail = {
  confirmed?: boolean;
  error?: string;
};

function uiModeToVariant(uiMode: ConfirmationUIMode): 'modal' | 'drawer' {
  return uiMode === 'drawer' ? 'drawer' : 'modal';
}

// Create and mount a fresh host element into the tx-confirmer portal
function mountHostElement({
  ctx,
  summary,
  txSigningRequests,
  vrfChallenge,
  loading,
  theme,
  variant,
  nearAccountIdOverride,
}: {
  ctx: VrfWorkerManagerContext,
  summary: TransactionSummary,
  txSigningRequests?: TransactionInputWasm[],
  vrfChallenge?: Partial<VRFChallenge>,
  loading?: boolean,
  theme?: ThemeName,
  variant?: 'modal' | 'drawer',
  nearAccountIdOverride?: string,
}): { el: HostTxConfirmerElement; handle: ConfirmUIHandle } {
  const v: 'modal' | 'drawer' = variant || 'modal';
  cleanupExistingConfirmers();
  const el = document.createElement(W3A_TX_CONFIRMER_ID) as HostTxConfirmerElement;
  el.variant = v;
  el.nearAccountId = nearAccountIdOverride || ctx.userPreferencesManager.getCurrentUserAccountId() || '';
  el.txSigningRequests = txSigningRequests || [];
  if (ctx.nearExplorerUrl) {
    el.nearExplorerUrl = ctx.nearExplorerUrl;
  }
  // Only enable UI digest validation for transaction-signing flows where txs exist.
  // Registration/link and other non-tx flows should not set intentDigest to avoid
  // spurious INTENT_DIGEST_MISMATCH on confirm.
  if ((txSigningRequests?.length || 0) > 0) {
    el.intentDigest = summary?.intentDigest;
  }
  if (vrfChallenge) el.vrfChallenge = vrfChallenge;
  // Resolve theme with short-circuiting helper
  el.theme = resolveTheme(ctx, theme);
  if (loading != null) el.loading = !!loading;
  el.removeAttribute('data-error-message');
  // Two-phase close: let caller control removal
  el.deferClose = true;
  if (summary?.delegate) {
    el.title = 'Sign Delegate Action';
  }
  const portal = ensureConfirmPortal();
  // Ensure hidden state (idempotent) and mount
  portal.classList.remove('w3a-portal--visible');
  portal.replaceChildren(el);
  // Reveal in the next frame via class toggle
  requestAnimationFrame(() => {
    portal.classList.add('w3a-portal--visible');
  });
  const handle = createHostConfirmHandle(el);
  return { el, handle };
}

// Types and element export for consumers that need the inline confirmer handle
export type { TxConfirmerWrapperElement } from './IframeTxConfirmer/tx-confirmer-wrapper';
export { W3A_TX_CONFIRMER_ID };
