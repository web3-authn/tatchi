import { toActionArgsWasm, isActionArgsWasm } from '@/core/types/actions';
import type { ActionArgs } from '@/core/types/actions';
import { TransactionInputWasm } from '@/core/types'
import type { IframeModalMessageType, IframeModalMessagePayloads } from '../common/iframe-messages';
import {
  computeUiIntentDigestFromTxs,
  orderActionForDigest
} from '../common/tx-digest';


// Parent communication configuration
let PARENT_ORIGIN: string | undefined; // set from SET_INIT.targetOrigin
let MTX_DEFINED_POSTED = false; // ensure we only announce once
// No module-level cache; two-phase confirm ensures element remains mounted

declare global {
  interface Window {
    __MTX_PARENT_ORIGIN?: string;
  }
}

function notifyReady(): void {
  try { window.parent.postMessage({ type: 'READY' }, '*'); } catch {}
}

function postError(kind: 'IFRAME_ERROR' | 'IFRAME_UNHANDLED_REJECTION', message: string): void {
  try {
    window.parent.postMessage({ type: kind, payload: message }, PARENT_ORIGIN || '*');
  } catch {}
}

function whenDefined(tag: string): Promise<void> {
  if (window.customElements?.whenDefined) {
    return window.customElements.whenDefined(tag).then(() => void 0);
  }
  return Promise.resolve();
}

type ModalElementShape = HTMLElement & {
  nearAccountId?: string;
  txSigningRequests?: unknown[];
  loading?: boolean;
  deferClose?: boolean;
  requestUpdate?: () => void;
  close?: (confirmed: boolean) => void;
};

function ensureElement(): ModalElementShape {
  let el = document.getElementById('mtx') as ModalElementShape | null;
  if (!el) {
    el = document.createElement('passkey-modal-confirm') as ModalElementShape;
    el.id = 'mtx';
    document.body.appendChild(el);
  }
  // Ensure two-phase close: do not remove on confirm/cancel; wait for CLOSE_MODAL
  try { el.deferClose = true; } catch {}
  return el;
}

function applyTheme(el: HTMLElement, theme?: Record<string, string>) {
  if (!theme) return;
  try {
    Object.entries(theme).forEach(([k, v]) => el.style.setProperty(k, String(v)));
  } catch {}
}

type IncomingMessage = { type?: IframeModalMessageType; payload?: unknown };

function isSetInitPayload(p: unknown): p is IframeModalMessagePayloads['SET_INIT'] {
  if (typeof p !== 'object' || p === null) return false;
  const obj = p as Record<string, unknown>;
  return typeof obj.targetOrigin === 'string';
}

function isSetTxDataPayload(p: unknown): p is IframeModalMessagePayloads['SET_TX_DATA'] {
  if (typeof p !== 'object' || p === null) return false;
  const obj = p as Record<string, unknown>;
  const hasNear = typeof obj.nearAccountId === 'string';
  const hasTxs = Array.isArray(obj.txSigningRequests);
  const themeOk = obj.theme === undefined || typeof obj.theme === 'object';
  return hasNear && hasTxs && themeOk;
}

function isCloseModalPayload(p: unknown): p is IframeModalMessagePayloads['CLOSE_MODAL'] {
  return typeof p === 'object' && p !== null && typeof (p as { confirmed?: unknown }).confirmed === 'boolean';
}

function isTxLike(x: unknown): x is { receiverId: string; actions: unknown[] } {
  if (typeof x !== 'object' || x === null) return false;
  const obj = x as Record<string, unknown>;
  return typeof obj.receiverId === 'string' && Array.isArray(obj.actions);
}

function onMessage(e: MessageEvent): void {
  const { type, payload } = (e.data || {}) as IncomingMessage;
  const el = ensureElement();
  switch (type) {
    case 'SET_INIT': {
      if (isSetInitPayload(payload)) {
        PARENT_ORIGIN = String(payload.targetOrigin);
        window.__MTX_PARENT_ORIGIN = PARENT_ORIGIN;
      }
      // Announce when element is defined
      whenDefined('passkey-modal-confirm').then(() => {
        if (MTX_DEFINED_POSTED) return;
        MTX_DEFINED_POSTED = true;
        try { window.parent.postMessage({ type: 'ETX_DEFINED' }, PARENT_ORIGIN || '*'); } catch {}
      });
      break;
    }
    case 'SET_TX_DATA': {
      // Set data properties on modal for rendering; digest will read from element on demand
      if (isSetTxDataPayload(payload)) {
        el.nearAccountId = payload.nearAccountId;
        el.txSigningRequests = Array.isArray(payload.txSigningRequests) ? payload.txSigningRequests : [];
        applyTheme(el, payload.theme);
        if (el.requestUpdate) el.requestUpdate();
      }
      break;
    }
    case 'SET_LOADING': {
      el.loading = typeof payload === 'boolean' ? payload : !!payload;
      break;
    }
    case 'CLOSE_MODAL': {
      try {
        const confirmed = isCloseModalPayload(payload) ? !!payload.confirmed : !!(payload as { confirmed?: boolean } | undefined)?.confirmed;
        el.close ? el.close(confirmed) : el.remove();
      } catch {}
      break;
    }
    case 'REQUEST_UI_DIGEST': {
      try {
        // Normalize actions to wasm shape if needed (supports both UI + wasm inputs)
        const raw = Array.isArray(el?.txSigningRequests) ? el.txSigningRequests : [];
        const txs = raw
          .filter(isTxLike)
          .map((tx) => ({
            receiverId: tx.receiverId,
            actions: tx.actions.map((a) => isActionArgsWasm(a) ? a : toActionArgsWasm(a as ActionArgs))
          }) as TransactionInputWasm);

        const wasmShapedOrdered = txs.map(tx => ({
          receiverId: tx.receiverId,
          actions: tx.actions.map(orderActionForDigest)
        }) as TransactionInputWasm);

        computeUiIntentDigestFromTxs(wasmShapedOrdered)
          .then((digest) => {
            try { window.parent.postMessage({ type: 'UI_INTENT_DIGEST', payload: { ok: true, digest } }, PARENT_ORIGIN || '*'); } catch {}
          })
          .catch((err) => {
            try { window.parent.postMessage({ type: 'UI_INTENT_DIGEST', payload: { ok: false, error: String(err) } }, PARENT_ORIGIN || '*'); } catch {}
          });
      } catch (err) {
        try { window.parent.postMessage({ type: 'UI_INTENT_DIGEST', payload: { ok: false, error: String(err) } }, PARENT_ORIGIN || '*'); } catch {}
      }
      break;
    }
  }
}

// Proxy modal decision events to parent (composed+bubbling custom events)
function hookDecisionEvents() {
  const forward = (type: 'CONFIRM' | 'CANCEL') => {
    try { window.parent.postMessage({ type }, PARENT_ORIGIN || '*'); } catch {}
  };
  document.addEventListener('w3a:confirm', () => forward('CONFIRM'));
  document.addEventListener('w3a:cancel', () => forward('CANCEL'));
}

window.addEventListener('message', onMessage);
window.addEventListener('error', (e: ErrorEvent) => { postError('IFRAME_ERROR', String(e?.message || e)); });
window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => { postError('IFRAME_UNHANDLED_REJECTION', String(e?.reason || '')); });

hookDecisionEvents();
notifyReady();
