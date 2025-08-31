import type { TooltipPosition } from './iframe-geometry';
import type { IframeInitData } from '../common/iframe-messages'
import type { TransactionInput } from '../../../types/actions';

/**
 * Iframe Button Bootstrap Script (ESM)
 */

// Parent communication configuration
let PARENT_ORIGIN: string | undefined; // set from HS1_INIT.targetOrigin
let ETX_DEFINED_POSTED = false; // ensure we only announce once

declare global {
  interface Window {
    __ETX_PARENT_ORIGIN?: string;
  }
}

// Notify parent that we're ready to receive HS1_INIT
function notifyReady(): void {
  try { window.parent.postMessage({ type: 'READY' }, '*'); } catch {}
}

// Forward iframe errors to parent for visibility
function postError(kind: 'IFRAME_ERROR' | 'IFRAME_UNHANDLED_REJECTION', message: string): void {
  try {
    console.error('[IframeButtonBootstrap] error', kind, message);
    window.parent.postMessage({ type: kind, payload: message }, PARENT_ORIGIN || '*');
  } catch {}
}

/** Apply HS1_INIT: element config + absolute positioning (before measure). */
type EmbeddedTxButtonEl = HTMLElement & {
  color?: string;
  size?: { width: string | number; height: string | number };
  tooltip?: { width: string; height: string | 'auto'; position: string; offset: string };
  tooltipPosition?: TooltipPosition; // fallback path uses this name
  updateProperties?: (props: Partial<{
    nearAccountId: string;
    txSigningRequests: TransactionInput[];
    loading: boolean;
    buttonStyle: Record<string, string | number>;
    buttonHoverStyle: Record<string, string | number>;
    tooltipPosition: TooltipPosition;
  }>) => void;
  updateButtonStyles?: (
    buttonStyle: Record<string, string | number>,
    buttonHoverStyle: Record<string, string | number>,
    tooltipPosition?: TooltipPosition
  ) => void;
  sendInitialGeometry?: () => void;
  computeUiIntentDigest?: () => Promise<string>;
  nearAccountId?: string;
  txSigningRequests?: TransactionInput[];
  loading?: boolean;
  buttonStyle?: Record<string, string | number>;
  buttonHoverStyle?: Record<string, string | number>;
  requestUpdate?: () => void;
};

type InitPayload = IframeInitData & { tagName?: string; targetOrigin?: string };

function applyInit(el: EmbeddedTxButtonEl, payload: InitPayload): void {
  // Apply basic styling and configuration
  el.color = payload.backgroundColor;
  el.size = payload.size;
  el.tooltip = payload.tooltip;

  // Capture target origin from host (optional hardening)
  if (typeof payload.targetOrigin === 'string') {
    PARENT_ORIGIN = String(payload.targetOrigin);
    window.__ETX_PARENT_ORIGIN = PARENT_ORIGIN;
  }

  // STEP 2: Apply button positioning (critical for geometry handshake)
  if (payload.buttonPosition) {
    const MAX_RETRIES = 60; // ~1.2s at 20ms each
    const DELAY_MS = 20;

    const tryApply = (retriesLeft: number) => {
      const c = el.shadowRoot?.querySelector('[data-embedded-confirm-container]') as HTMLElement | null;
      if (c) {
        // Position the button container absolutely at the specified coordinates
        c.style.position = 'absolute';
        c.style.top = String(payload.buttonPosition.y) + 'px';
        c.style.left = String(payload.buttonPosition.x) + 'px';
        c.style.transform = 'none';
        // Force a reflow to ensure positioning is applied before any measurements
        c.offsetHeight;
        // Notify parent that positioning is complete
        try {
          window.parent.postMessage({ type: 'HS2_POSITIONED', payload: payload.buttonPosition }, PARENT_ORIGIN || '*');
        } catch {}
        return;
      }
      if (retriesLeft <= 0) {
        try { console.warn('[IframeButtonBootstrap] positioning timeout: container not ready'); } catch {}
        return;
      }
      setTimeout(() => tryApply(retriesLeft - 1), DELAY_MS);
    };

    // Start attempts; handles both immediate and delayed shadow DOM readiness
    tryApply(MAX_RETRIES);
  }

  // Notify when custom element is fully defined and ready
  if (window.customElements && window.customElements.whenDefined) {
    const tag = (payload.tagName as string | undefined) || 'embedded-tx-button';
    window.customElements.whenDefined(tag).then(() => {
      if (ETX_DEFINED_POSTED) return;
      ETX_DEFINED_POSTED = true;
      try { window.parent.postMessage({ type: 'ETX_DEFINED' }, PARENT_ORIGIN || '*'); } catch {}
    });
  }
}

/**
 * Handles incoming messages from the parent window.
 * Processes various message types including the Initial Geometry Handshake messages.
 */
type IncomingMessage = { type?: string; payload?: unknown };

function isInitPayload(p: unknown): p is InitPayload {
  if (typeof p !== 'object' || p === null) return false;
  const obj = p as Record<string, unknown>;
  return typeof obj.size === 'object' && typeof obj.tooltip === 'object' && typeof obj.buttonPosition === 'object';
}

function isSetTxDataPayload(p: unknown): p is { nearAccountId: string; txSigningRequests: TransactionInput[] } {
  if (typeof p !== 'object' || p === null) return false;
  const obj = p as Record<string, unknown>;
  return typeof obj.nearAccountId === 'string' && Array.isArray(obj.txSigningRequests);
}

function isSetStylePayload(p: unknown): p is {
  buttonStyle?: Record<string, string | number>;
  buttonHoverStyle?: Record<string, string | number>;
  tooltipPosition?: TooltipPosition;
  tooltipTreeStyles?: unknown;
} {
  return typeof p === 'object' && p !== null;
}

/**
 * Handles incoming messages from the parent window.
 * Processes various message types including the Initial Geometry Handshake messages.
 * @param e The message event from the iframe
 */
function onMessage(e: MessageEvent): void {
  const { type, payload } = (e.data || {}) as IncomingMessage;
  const el = document.getElementById('etx') as EmbeddedTxButtonEl | null;
  if (!el) return;

  switch (type) {
    case 'HS1_INIT':
      // STEP 1: Receive initialization data from parent
      if (isInitPayload(payload)) {
        applyInit(el, payload);
      }
      break;

    case 'HS3_GEOMETRY_REQUEST':
      // STEP 3: Parent is requesting geometry measurement now that positioning is applied
      if (el.sendInitialGeometry) {
        el.sendInitialGeometry();
      }
      break;

    case 'SET_TX_DATA':
      // Update transaction data for display in the tooltip
      if (isSetTxDataPayload(payload)) {
        if (el.updateProperties) {
          el.updateProperties({
            nearAccountId: payload.nearAccountId,
            txSigningRequests: payload.txSigningRequests
          });
        } else {
          el.nearAccountId = payload.nearAccountId;
          el.txSigningRequests = payload.txSigningRequests;
          if (el.requestUpdate) el.requestUpdate();
        }
      }
      break;

    case 'SET_LOADING':
      // Update loading state of the button
      if (el.updateProperties) {
        el.updateProperties({ loading: typeof payload === 'boolean' ? payload : !!payload });
      } else {
        el.loading = typeof payload === 'boolean' ? payload : !!payload;
      }
      break;

    case 'SET_STYLE':
      // Update button styling and tooltip configuration
      if (isSetStylePayload(payload)) {
        if (el.updateButtonStyles) {
          el.updateButtonStyles(payload.buttonStyle || {}, payload.buttonHoverStyle || {}, payload.tooltipPosition || undefined);
        } else {
          el.buttonStyle = payload.buttonStyle || {};
          el.buttonHoverStyle = payload.buttonHoverStyle || {};
          if (payload.tooltipPosition) {
            el.tooltipPosition = payload.tooltipPosition;
          }
        }
        // Pass tooltip tree styles if available
        const treeStyles = (payload as { tooltipTreeStyles?: unknown }).tooltipTreeStyles;
        if (treeStyles && (el as unknown as { tooltipTreeStyles?: unknown }).tooltipTreeStyles !== treeStyles) {
          (el as unknown as { tooltipTreeStyles?: unknown }).tooltipTreeStyles = treeStyles;
          if (el.requestUpdate) el.requestUpdate();
        }
      }
      break;

    case 'REQUEST_UI_DIGEST': {
      if (typeof el.computeUiIntentDigest === 'function') {
        el.computeUiIntentDigest()
          .then((digest: string) => {
            try {
              window.parent.postMessage({ type: 'UI_INTENT_DIGEST', payload: { ok: true, digest } }, PARENT_ORIGIN || '*');
            } catch {}
          })
          .catch((err: unknown) => {
            try {
              console.warn('[IframeButtonBootstrap] UI_INTENT_DIGEST error', err);
              window.parent.postMessage({ type: 'UI_INTENT_DIGEST', payload: { ok: false, error: String(err) } }, PARENT_ORIGIN || '*');
            } catch {}
          });
      } else {
        throw new Error('UI intent digest computation not available in secure iframe');
      }
      break;
    }
  }
}

// Wire up event listeners for the Initial Geometry Handshake and updates
window.addEventListener('message', onMessage);

// Error handling for debugging geometry and positioning issues
window.addEventListener('error', (e: ErrorEvent) => {
  postError('IFRAME_ERROR', String(e?.message || e));
});
window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
  postError('IFRAME_UNHANDLED_REJECTION', String(e?.reason || ''));
});

// STEP 0: announce readiness to the parent
notifyReady();
