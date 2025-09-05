import type { TooltipPositionInternal } from './iframe-geometry';
import type {
  IframeButtonMessage,
  IframeButtonMessagePayloads,
  IframeButtonMessageType,
  IframeInitData
} from '../common/iframe-messages'
import type { TooltipTreeStyles } from '../TooltipTxTree/tooltip-tree-themes';
import type { TransactionInput } from '../../../types/actions';
import type { EmbeddedTxButtonStyles } from './embedded-tx-button-themes';
import { EMBEDDED_TX_BUTTON_ID, SELECTORS } from './tags';

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
  try {
    const message: IframeButtonMessage = { type: 'READY' };
    window.parent.postMessage(message, '*');
  } catch {}
}

// Forward iframe errors to parent for visibility
function postError(kind: 'IFRAME_ERROR' | 'IFRAME_UNHANDLED_REJECTION', message: string): void {
  try {
    console.error('[IframeButtonBootstrap] error', kind, message);
    const errorMessage: IframeButtonMessage = { type: kind, payload: message };
    window.parent.postMessage(errorMessage, PARENT_ORIGIN || '*');
  } catch {}
}

/** Apply HS1_INIT: element config + absolute positioning (before measure). */
interface EmbeddedTxButtonEl extends HTMLElement {
  color?: string;
  size?: { width: string | number; height: string | number };
  tooltip?: { width: string; height: string | 'auto'; position: string; offset: string };
  tooltipPosition?: TooltipPositionInternal; // fallback path uses this name
  tooltipTheme?: 'dark' | 'light';
  styles?: TooltipTreeStyles;
  updateProperties?: (props: Partial<{
    nearAccountId: string;
    txSigningRequests: TransactionInput[];
    loadingTouchIdPrompt: boolean;
    buttonSizing: { width?: string | number; height?: string | number };
    tooltipPosition: TooltipPositionInternal;
  }>) => void;
  updateButtonStyles?: (
    buttonSizing: { width?: string | number; height?: string | number },
    tooltipPosition?: TooltipPositionInternal,
    embeddedButtonTheme?: EmbeddedTxButtonStyles,
    theme?: 'dark' | 'light',
    activationMode?: 'tap' | 'press'
  ) => void;
  sendInitialGeometry?: () => void;
  computeUiIntentDigest?: () => Promise<string>;
  // Optional methods surfaced by the custom element
  showTooltip?: () => void;
  hideTooltip?: () => void;
  nearAccountId?: string;
  txSigningRequests?: TransactionInput[];
  loadingTouchIdPrompt?: boolean;
  buttonSizing?: { width?: string | number; height?: string | number };
  requestUpdate?: () => void;
}

type EmbeddedTxButtonElType = HTMLElement & EmbeddedTxButtonEl;

type InitPayload = IframeInitData & { tagName?: string; targetOrigin?: string };

function applyInit(el: EmbeddedTxButtonElType, payload: InitPayload): void {
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

    const tryApply = (retriesLeft: number): void => {
      const c = el.shadowRoot?.querySelector(SELECTORS.EMBEDDED_CONFIRM_CONTAINER) as HTMLElement | null;
      if (c) {
        // Position the button container absolutely at the specified coordinates
        c.style.position = 'absolute';
        c.style.top = String(payload.buttonPosition.y) + 'px';
        c.style.left = String(payload.buttonPosition.x) + 'px';
        c.style.transform = 'none';
        // Force a reflow to ensure positioning is applied before any measurements
        c.offsetHeight;
        // Notify parent that positioning is complete
        const positionedMessage: IframeButtonMessage = {
          type: 'HS2_POSITIONED',
          payload: payload.buttonPosition
        };
        try { window.parent.postMessage(positionedMessage, PARENT_ORIGIN || '*'); } catch {}
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
    const tag = payload.tagName || EMBEDDED_TX_BUTTON_ID;
    window.customElements.whenDefined(tag).then(() => {
      if (ETX_DEFINED_POSTED) return;
      ETX_DEFINED_POSTED = true;
      const definedMessage: IframeButtonMessage = { type: 'ETX_DEFINED' };
      try { window.parent.postMessage(definedMessage, PARENT_ORIGIN || '*'); } catch {}
    });
  }
}

/**
 * Type guards for iframe message payloads
 */
function isInitPayload(payload: unknown): payload is IframeInitData {
  return typeof payload === 'object' && payload !== null;
}

function isSetTxDataPayload(payload: unknown): payload is IframeButtonMessagePayloads['SET_TX_DATA'] {
  return typeof payload === 'object' && payload !== null;
}

function isSetStylePayload(payload: unknown): payload is IframeButtonMessagePayloads['SET_STYLE'] {
  return typeof payload === 'object' && payload !== null;
}

function isSetLoadingPayload(payload: unknown): payload is boolean {
  return typeof payload === 'boolean';
}

function isRequestUiDigestPayload(payload: unknown): payload is undefined {
  return payload === undefined;
}

/**
 * Handles incoming messages from the parent window.
 * Processes various message types including the Initial Geometry Handshake messages.
 * @param e The message event from the iframe
 */
function onMessage(e: MessageEvent<IframeButtonMessage>): void {
  const data = e.data;
  if (!data || typeof data !== 'object' || !('type' in data)) return;

  const { type, payload } = data as IframeButtonMessage;
  const el = document.getElementById('etx') as EmbeddedTxButtonElType | null;
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
      if (isSetTxDataPayload(payload) && payload) {
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
      if (isSetLoadingPayload(payload)) {
        if (el.updateProperties) {
          el.updateProperties({ loadingTouchIdPrompt: payload });
        } else {
          el.loadingTouchIdPrompt = payload;
          if (el.requestUpdate) el.requestUpdate();
        }
      }
      break;

    case 'SET_STYLE':
      // Update button styling and tooltip configuration
      if (isSetStylePayload(payload) && payload) {
        if (el.updateButtonStyles) {
          el.updateButtonStyles(
            payload.buttonSizing || ({} as any),
            payload.tooltipPosition,
            payload.embeddedButtonTheme,
            payload.theme,
            payload.activationMode
          );
        } else {
          el.buttonSizing = payload.buttonSizing || ({} as any);
          if (payload.tooltipPosition) {
            el.tooltipPosition = payload.tooltipPosition;
          }
          if (payload.activationMode && 'activationMode' in el) {
            (el as any).activationMode = payload.activationMode;
          }
        }

        // Handle direct tooltip theme updates
        if (payload.theme && el.tooltipTheme !== payload.theme) {
          el.tooltipTheme = payload.theme;
          if (el.requestUpdate) el.requestUpdate();
        }

        // Pass tooltip tree styles if available (maps to EmbeddedTxButton.styles)
        if (payload.tooltipTreeStyles && el.styles !== payload.tooltipTreeStyles) {
          el.styles = payload.tooltipTreeStyles;
          if (el.requestUpdate) el.requestUpdate();
        }
      }
      break;

    case 'SET_TOOLTIP_VISIBILITY': {
      if (typeof payload === 'boolean') {
        if (payload) {
          el.showTooltip?.();
        } else {
          el.hideTooltip?.();
        }
      }
      break;
    }

    case 'REQUEST_UI_DIGEST': {
      if (isRequestUiDigestPayload(payload) && typeof el.computeUiIntentDigest === 'function') {
        el.computeUiIntentDigest()
          .then((digest: string) => {
            const successMessage: IframeButtonMessage = {
              type: 'UI_INTENT_DIGEST',
              payload: { ok: true, digest }
            };
            try { window.parent.postMessage(successMessage, PARENT_ORIGIN || '*'); } catch {}
          })
          .catch((err: unknown) => {
            const errorMessage: IframeButtonMessage = {
              type: 'UI_INTENT_DIGEST',
              payload: { ok: false, error: String(err) }
            };
            console.warn('[IframeButtonBootstrap] UI_INTENT_DIGEST error', err);
            try { window.parent.postMessage(errorMessage, PARENT_ORIGIN || '*'); } catch {}
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
  postError('IFRAME_ERROR', e.message || 'Unknown error');
});

window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
  postError('IFRAME_UNHANDLED_REJECTION', e.reason ? String(e.reason) : 'Unhandled promise rejection');
});

// STEP 0: announce readiness to the parent
notifyReady();
