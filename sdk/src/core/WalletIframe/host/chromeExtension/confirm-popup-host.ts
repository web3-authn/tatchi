import { WalletIframeDomEvents } from '../../events';
import { W3A_CONFIRM_PORTAL_ID, W3A_TX_CONFIRMER_ID } from '../../../WebAuthnManager/LitComponents/tags';
import { TxConfirmerWrapperElement } from '../../../WebAuthnManager/LitComponents/IframeTxConfirmer/tx-confirmer-wrapper';

declare const chrome: any;

type ConfirmPopupPayload = {
  uiMode?: 'modal' | 'drawer' | 'none';
  theme?: string;
  nearAccountId?: string;
  txSigningRequests?: unknown[];
  transactionSummary?: { title?: string; body?: string; intentDigest?: string } & Record<string, unknown>;
  vrfChallenge?: unknown;
  nearExplorerUrl?: string;
  confirmText?: string;
  cancelText?: string;
};

type BrokerGetResponse =
  | { ok: true; payload: { requestId: string; payload: ConfirmPopupPayload } }
  | { ok: false; error?: string };

function setStatus(text: string): void {
  const el = document.getElementById('status');
  if (el) el.textContent = text;
}

function ensurePortal(): HTMLElement {
  let portal = document.getElementById(W3A_CONFIRM_PORTAL_ID) as HTMLElement | null;
  if (!portal) {
    portal = document.createElement('div');
    portal.id = W3A_CONFIRM_PORTAL_ID;
    portal.classList.add('w3a-portal', 'w3a-portal--visible');
    (document.body ?? document.documentElement)?.appendChild(portal);
  } else {
    portal.classList.add('w3a-portal', 'w3a-portal--visible');
  }
  return portal;
}

async function getRequestFromBroker(requestId: string): Promise<ConfirmPopupPayload> {
  const runtime = chrome?.runtime;
  if (!runtime?.sendMessage) throw new Error('Chrome extension runtime not available');
  const resp: BrokerGetResponse = await new Promise((resolve) => {
    runtime.sendMessage({ type: 'W3A_CONFIRM_GET_REQUEST', requestId }, resolve);
  });
  const err = runtime.lastError;
  if (err) throw new Error(err.message || String(err));
  if (!resp || resp.ok !== true) throw new Error(resp?.error || 'Confirm request not found');
  return resp.payload?.payload || {};
}

async function postResult(requestId: string, payload: { confirmed: boolean; error?: string }): Promise<void> {
  const runtime = chrome?.runtime;
  if (!runtime?.sendMessage) return;
  await new Promise<void>((resolve) => {
    runtime.sendMessage(
      {
        type: 'W3A_CONFIRM_RESULT',
        requestId,
        ok: true,
        payload,
      },
      () => resolve(),
    );
  });
}

function mountConfirmer(payload: ConfirmPopupPayload): HTMLElement {
  try {
    if (typeof customElements !== 'undefined' && !customElements.get(W3A_TX_CONFIRMER_ID)) {
      customElements.define(W3A_TX_CONFIRMER_ID, TxConfirmerWrapperElement);
    }
  } catch {}

  const portal = ensurePortal();
  portal.replaceChildren();

  const el = document.createElement(W3A_TX_CONFIRMER_ID) as any;
  el.variant = payload.uiMode === 'drawer' ? 'drawer' : 'modal';
  el.nearAccountId = payload.nearAccountId || '';
  el.txSigningRequests = payload.txSigningRequests || [];
  if (payload.vrfChallenge) el.vrfChallenge = payload.vrfChallenge;
  if (payload.theme) el.theme = payload.theme;
  if (payload.nearExplorerUrl) el.nearExplorerUrl = payload.nearExplorerUrl;
  // Summary is the source of the title/body shown to the user.
  if (payload.transactionSummary?.title != null) el.title = String(payload.transactionSummary.title);
  if (payload.transactionSummary?.body != null) el.body = String(payload.transactionSummary.body);
  if (payload.confirmText) el.confirmText = payload.confirmText;
  if (payload.cancelText) el.cancelText = payload.cancelText;
  // In the popup we want the confirmer to close immediately on decision.
  el.deferClose = false;

  portal.appendChild(el);
  return el as HTMLElement;
}

async function main(): Promise<void> {
  const requestId = new URLSearchParams(window.location.search).get('rid');
  if (!requestId) {
    setStatus('Missing request id');
    return;
  }

  setStatus('Loading…');

  let completed = false;
  const complete = async (confirmed: boolean, error?: string) => {
    if (completed) return;
    completed = true;
    try {
      await postResult(requestId, { confirmed, ...(error ? { error } : {}) });
    } finally {
      try { window.close(); } catch {}
    }
  };

  globalThis.addEventListener?.('beforeunload', () => {
    if (!completed) {
      // Best-effort cancel if user closes the popup.
      void postResult(requestId, { confirmed: false, error: 'Popup closed' });
    }
  });

  try {
    const payload = await getRequestFromBroker(requestId);
    setStatus('');
    const el = mountConfirmer(payload);

    el.addEventListener(WalletIframeDomEvents.TX_CONFIRMER_CONFIRM, (event: Event) => {
      const detail = (event as CustomEvent<any> | undefined)?.detail;
      const ok = detail?.confirmed !== false;
      const err = typeof detail?.error === 'string' ? detail.error : undefined;
      void complete(ok, err);
    });
    el.addEventListener(WalletIframeDomEvents.TX_CONFIRMER_CANCEL, (event: Event) => {
      const detail = (event as CustomEvent<any> | undefined)?.detail;
      const err = typeof detail?.error === 'string' ? detail.error : undefined;
      void complete(false, err);
    });
  } catch (err: unknown) {
    setStatus((err as any)?.message ? String((err as any).message) : String(err));
    await complete(false, 'Failed to load confirmation request');
  }
}

void main();
