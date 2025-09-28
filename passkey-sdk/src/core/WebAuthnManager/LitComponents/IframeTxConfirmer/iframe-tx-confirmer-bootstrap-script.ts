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
import { WalletIframeDomEvents } from '../../../WalletIframe/events';
// Ensure the drawer custom element is available when variant === 'drawer'
// This side-effect import defines the <w3a-drawer-tx-confirmer> element.
import './viewer-drawer';


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

function whenAnyDefined(tags: string[]): Promise<void> {
  if (!window.customElements?.whenDefined) return Promise.resolve();
  return new Promise<void>((resolve) => {
    let resolved = false;
    const done = () => { if (!resolved) { resolved = true; resolve(); } };
    for (const t of tags) {
      window.customElements.whenDefined(t).then(done).catch(() => {});
    }
  });
}

type Variant = 'modal' | 'drawer';

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

let CURRENT_VARIANT: Variant = 'modal';

function ensureElement(): ModalElementType {
  const id = 'mtx';
  let el = document.getElementById(id) as ModalElementType | null;
  // Prefer canonical "-tx-confirmer" suffix, while legacy aliases remain defined
  const desiredTag = (CURRENT_VARIANT === 'drawer') ? 'w3a-drawer-tx-confirmer' : 'w3a-modal-tx-confirmer';

  // If an element exists but the tag does not match the desired variant, replace it
  if (el && el.tagName.toLowerCase() !== desiredTag) {
    try { el.remove(); } catch {}
    el = null;
  }

  if (!el) {
    // Create based on current variant
    el = document.createElement(desiredTag) as ModalElementType;
    el.id = id;
    document.body.appendChild(el);
    // Two-phase close: do not remove on confirm/cancel; wait for CLOSE_MODAL
    try { (el as any).deferClose = true; } catch {}
  }
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
  switch (type) {
    case 'SET_INIT': {
      if (isSetInitPayload(payload) && payload) {
        PARENT_ORIGIN = payload.targetOrigin;
        window.__MTX_PARENT_ORIGIN = PARENT_ORIGIN;
      }
      // Announce when either modal or drawer element is defined (canonical)
      whenAnyDefined([
        'w3a-modal-tx-confirmer',
        'w3a-drawer-tx-confirmer',
      ]).then(() => {
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
        // Switch variant when provided (modal|drawer) BEFORE creating/ensuring the element
        const variant = (payload as any).variant;
        if (variant === 'drawer' || variant === 'modal') {
          CURRENT_VARIANT = variant;
        }
        const el = ensureElement();
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
        const el = ensureElement();
        el.loading = payload;
        el.requestUpdate?.();
      }
      break;
    }
    case 'SET_ERROR': {
      try {
        if (isString(payload)) {
          const el = ensureElement();
          el.errorMessage = payload;
          el.loading = false;
          el.requestUpdate?.();
        }
      } catch {}
      break;
    }
    case 'CLOSE_MODAL': {
      try {
        const el = ensureElement();
        const confirmed = isCloseModalPayload(payload) && payload ? payload.confirmed : false;
        el.close ? el.close(confirmed) : el.remove();
      } catch {}
      break;
    }
    case 'REQUEST_UI_DIGEST': {
      try {
        const el = ensureElement();
        // Normalize actions to wasm shape if needed (supports both UI + wasm inputs)
        const raw = (Array.isArray((el as any)?.txSigningRequests) ? (el as any).txSigningRequests : []) as TransactionInputWasm[];
        const txs: TransactionInputWasm[] = raw
          .filter(issTransactionInput)
          .map((tx: any) => ({
            receiverId: tx.receiverId,
            actions: tx.actions.map((a: any) => isActionArgsWasm(a) ? a : toActionArgsWasm(a as ActionArgs))
          }) as TransactionInputWasm);

        const wasmShapedOrdered: TransactionInputWasm[] = txs.map(tx => ({
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
  // Listen to new canonical event names from containers
  document.addEventListener(WalletIframeDomEvents.TX_CONFIRMER_CONFIRM, () => {
    forward('CONFIRM');
  });
  document.addEventListener(WalletIframeDomEvents.TX_CONFIRMER_CANCEL, () => forward('CANCEL'));
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
