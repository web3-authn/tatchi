import { toActionArgsWasm, isActionArgsWasm } from '@/core/types/actions';
import type { ActionArgs } from '@/core/types/actions';
import { TransactionInputWasm, VRFChallenge } from '@/core/types'
import type {
  IframeModalMessage,
  IframeModalMessagePayloads,
  IframeModalMessageType
} from '../common/iframe-messages';
import {
  computeUiIntentDigestFromTxs,
  orderActionForDigest
} from '../common/tx-digest';
import { isObject, isString, isBoolean } from '../../../WalletIframe/validation';


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
  try {
    const message: IframeModalMessage = { type: 'READY' };
    window.parent.postMessage(message, '*');
  } catch {}
}

function postError(kind: 'IFRAME_ERROR' | 'IFRAME_UNHANDLED_REJECTION', message: string): void {
  try {
    console.error('[IframeModalBootstrap] error', kind, message);
    const errorMessage: IframeModalMessage = { type: kind, payload: message };
    window.parent.postMessage(errorMessage, PARENT_ORIGIN || '*');
  } catch {}
}

function whenDefined(tag: string): Promise<void> {
  if (window.customElements?.whenDefined) {
    return window.customElements.whenDefined(tag).then(() => void 0);
  }
  return Promise.resolve();
}

interface ModalElementShape extends HTMLElement {
  nearAccountId?: string;
  txSigningRequests?: TransactionInputWasm[];
  vrfChallenge?: VRFChallenge;
  theme?: string;
  loading?: boolean;
  errorMessage?: string;
  deferClose?: boolean;
  requestUpdate?: () => void;
  close?: (confirmed: boolean) => void;
}

type ModalElementType = HTMLElement & ModalElementShape;

function ensureElement(): ModalElementType {
  let el = document.getElementById('mtx') as ModalElementType | null;
  if (!el) {
    el = document.createElement('passkey-modal-confirm') as ModalElementType;
    el.id = 'mtx';
    document.body.appendChild(el);
  }
  // Ensure two-phase close: do not remove on confirm/cancel; wait for CLOSE_MODAL
  try { el.deferClose = true; } catch {}
  return el;
}

/**
 * Type guards for iframe message payloads
 */
function isSetInitPayload(payload: unknown): payload is IframeModalMessagePayloads['SET_INIT'] {
  return isObject(payload);
}

function isSetTxDataPayload(payload: unknown): payload is IframeModalMessagePayloads['SET_TX_DATA'] {
  if (!isObject(payload)) return false;
  const p = payload as { nearAccountId?: unknown; txSigningRequests?: unknown };
  return isString(p.nearAccountId) && Array.isArray(p.txSigningRequests);
}

function isCloseModalPayload(payload: unknown): payload is IframeModalMessagePayloads['CLOSE_MODAL'] {
  return isObject(payload);
}

function issTransactionInput(x: unknown): x is { receiverId: string; actions: unknown[] } {
  if (!x || !isObject(x)) return false;
  const obj = x as Record<string, unknown>;
  return isString(obj.receiverId) && Array.isArray(obj.actions);
}

function isSetLoadingPayload(payload: unknown): payload is boolean {
  return isBoolean(payload);
}

function onMessage(e: MessageEvent<IframeModalMessage>): void {
  const data = e.data;
  if (!data || !isObject(data) || !('type' in data)) return;

  const { type, payload } = data as IframeModalMessage;
  const el = ensureElement();
  switch (type) {
    case 'SET_INIT': {
      if (isSetInitPayload(payload) && payload) {
        PARENT_ORIGIN = payload.targetOrigin;
        window.__MTX_PARENT_ORIGIN = PARENT_ORIGIN;
      }
      // Announce when element is defined
      whenDefined('passkey-modal-confirm').then(() => {
        if (MTX_DEFINED_POSTED) return;
        MTX_DEFINED_POSTED = true;
        const definedMessage: IframeModalMessage = { type: 'ETX_DEFINED' };
        try { window.parent.postMessage(definedMessage, PARENT_ORIGIN || '*'); } catch {}
      });
      break;
    }
    case 'SET_TX_DATA': {
      // Set data properties on modal for rendering; digest will read from element on demand
      if (isSetTxDataPayload(payload) && payload) {
        el.nearAccountId = payload.nearAccountId;
        el.txSigningRequests = payload.txSigningRequests;
        if (payload.vrfChallenge) {
          el.vrfChallenge = payload.vrfChallenge;
        }
        if (payload.theme && isString(payload.theme)) {
          el.theme = payload.theme;
        }
        el.requestUpdate?.();
      }
      break;
    }
    case 'SET_LOADING': {
      if (isSetLoadingPayload(payload)) {
        el.loading = payload;
        el.requestUpdate?.();
      }
      break;
    }
    case 'SET_ERROR': {
      try {
        if (isString(payload)) {
          el.errorMessage = payload;
          el.loading = false;
          el.requestUpdate?.();
        }
      } catch {}
      break;
    }
    case 'CLOSE_MODAL': {
      try {
        const confirmed = isCloseModalPayload(payload) && payload ? payload.confirmed : false;
        el.close ? el.close(confirmed) : el.remove();
      } catch {}
      break;
    }
    case 'REQUEST_UI_DIGEST': {
      try {
        // Normalize actions to wasm shape if needed (supports both UI + wasm inputs)
        const raw = Array.isArray(el?.txSigningRequests) ? el.txSigningRequests : [];
        const txs = raw
          .filter(issTransactionInput)
          .map((tx) => ({
            receiverId: tx.receiverId,
            actions: tx.actions.map((a) => isActionArgsWasm(a) ? a : toActionArgsWasm(a as ActionArgs))
          }) as TransactionInputWasm);

        const wasmShapedOrdered = txs.map(tx => ({
          receiverId: tx.receiverId,
          actions: tx.actions.map(orderActionForDigest)
        }) as TransactionInputWasm);

        computeUiIntentDigestFromTxs(wasmShapedOrdered)
          .then((digest: string) => {
            const successMessage: IframeModalMessage = {
              type: 'UI_INTENT_DIGEST',
              payload: { ok: true, digest }
            };
            try { window.parent.postMessage(successMessage, PARENT_ORIGIN || '*'); } catch {}
          })
          .catch((err: unknown) => {
            const errorMessage: IframeModalMessage = {
              type: 'UI_INTENT_DIGEST',
              payload: { ok: false, error: String(err) }
            };
            try {
              console.warn('[IframeModalBootstrap] UI_INTENT_DIGEST error', err);
              window.parent.postMessage(errorMessage, PARENT_ORIGIN || '*');
            } catch {}
          });
      } catch (err: unknown) {
        const errorMessage: IframeModalMessage = {
          type: 'UI_INTENT_DIGEST',
          payload: { ok: false, error: String(err) }
        };
        try {
          console.warn('[IframeModalBootstrap] UI_INTENT_DIGEST error', err);
          window.parent.postMessage(errorMessage, PARENT_ORIGIN || '*');
        } catch {}
      }
      break;
    }
  }
}

// Proxy modal decision events to parent (composed+bubbling custom events)
function hookDecisionEvents(): void {
  const forward = (type: 'CONFIRM' | 'CANCEL'): void => {
    const message: IframeModalMessage = { type } as IframeModalMessage;
    try { window.parent.postMessage(message, PARENT_ORIGIN || '*'); } catch {}
  };
  // On confirm, simply forward to parent (host prompts WebAuthn)
  document.addEventListener('w3a:modal-confirm', () => {
    forward('CONFIRM');
  });
  document.addEventListener('w3a:modal-cancel', () => forward('CANCEL'));
}

window.addEventListener('message', onMessage);
window.addEventListener('error', (e: ErrorEvent) => {
  postError('IFRAME_ERROR', e.message || 'Unknown error');
});
window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
  postError('IFRAME_UNHANDLED_REJECTION', e.reason ? String(e.reason) : 'Unhandled promise rejection');
});

hookDecisionEvents();
notifyReady();
