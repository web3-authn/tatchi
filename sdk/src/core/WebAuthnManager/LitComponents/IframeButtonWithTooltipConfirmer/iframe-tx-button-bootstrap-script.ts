import type { TooltipPositionInternal } from './iframe-geometry';
import { resolveEmbeddedBase } from '../asset-base';
import type {
  IframeButtonMessage,
  IframeButtonMessagePayloads,
  IframeButtonMessageType,
  IframeInitData
} from '../common/iframe-messages'
import type { TxTreeStyles } from '../TxTree/tx-tree-themes';
import type { TransactionInput } from '../../../types/actions';
import { W3A_BUTTON_WITH_TOOLTIP_ID, SELECTORS } from '../tags';
import { isObject, isString, isNumber, isBoolean } from '../../../WalletIframe/validation';

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
function isSurfaceStylesApplied(): boolean {
  const de = document.documentElement;
  const b = document.body;
  if (!de || !b) return false;
  const csHtml = getComputedStyle(de);
  const csBody = getComputedStyle(b);
  return csHtml.marginTop === '0px' && csHtml.marginLeft === '0px' && csBody.marginTop === '0px' && csBody.marginLeft === '0px';
}

function whenSurfaceStylesReady(timeoutMs = 1200): Promise<void> {
  return new Promise((resolve) => {
    const start = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const tick = () => {
      if (isSurfaceStylesApplied()) return resolve();
      const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      if (now - start > timeoutMs) return resolve();
      requestAnimationFrame(tick);
    };
    tick();
  });
}

async function notifyReady(): Promise<void> {
  // Wait briefly for wallet-service.css to apply (margin:0 on html/body) to avoid ~8px offset in early geometry
  await whenSurfaceStylesReady();
  const message: IframeButtonMessage = { type: 'READY' };
  window.parent.postMessage(message, '*');
}

function ensureDocStylesheet(assetName: string, markerAttr: string): void {
  const doc = document;
  if (!doc?.head) return;
  if (doc.head.querySelector(`link[${markerAttr}]`)) return;
  const link = doc.createElement('link');
  link.rel = 'stylesheet';
  const base = resolveEmbeddedBase();
  link.href = `${base}${assetName}`;
  link.setAttribute(markerAttr, '');
  doc.head.appendChild(link);
}

// Forward iframe errors to parent for visibility
function postError(kind: 'IFRAME_ERROR' | 'IFRAME_UNHANDLED_REJECTION', message: string): void {
  console.error('[IframeButtonBootstrap] error', kind, message);
  const errorMessage: IframeButtonMessage = { type: kind, payload: message };
  window.parent.postMessage(errorMessage, PARENT_ORIGIN || '*');
}

/** Apply HS1_INIT: element config + absolute positioning (before measure). */
interface EmbeddedTxButtonEl extends HTMLElement {
  color?: string;
  size?: { width: string | number; height: string | number };
  tooltip?: { width: string; height: string | 'auto'; position: string; offset: string };
  tooltipPosition?: TooltipPositionInternal; // fallback path uses this name
  tooltipTheme?: 'dark' | 'light';
  styles?: TxTreeStyles;
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
  applyContainerPosition?: (x: number, y: number) => void;
}

type EmbeddedTxButtonElType = HTMLElement & EmbeddedTxButtonEl;

type InitPayload = IframeInitData & { tagName?: string; targetOrigin?: string };

function applyInit(el: EmbeddedTxButtonElType, payload: InitPayload): void {
  // Apply basic styling and configuration
  el.color = payload.backgroundColor;
  el.size = payload.size;
  el.tooltip = payload.tooltip;
  // Ensure shared token sheet and base styles are present for visual parity
  // These links are CSP-safe and idempotent via marker attributes.
  ensureDocStylesheet('w3a-components.css', 'data-w3a-components-css');
  ensureDocStylesheet('button-with-tooltip.css', 'data-w3a-button-tooltip-css');

  // Capture target origin from host (optional hardening)
  if (typeof payload.targetOrigin === 'string') {
    PARENT_ORIGIN = String(payload.targetOrigin);
    window.__ETX_PARENT_ORIGIN = PARENT_ORIGIN;
  }

  // STEP 2: Apply button positioning (CSP-safe via element API + CSS variables)
  if (payload.buttonPosition) {
    const MAX_RETRIES = 60; // ~1.2s at 20ms each
    const DELAY_MS = 20;

    const tryApply = (retriesLeft: number): void => {
      const el2 = document.getElementById('etx') as EmbeddedTxButtonElType | null;
      if (el2 && typeof el2.applyContainerPosition === 'function') {
        el2.applyContainerPosition(payload.buttonPosition.x, payload.buttonPosition.y);
        // Ensure surface CSS is applied before telling parent we're positioned
        whenSurfaceStylesReady().then(() => {
          requestAnimationFrame(() => {
            const positionedMessage: IframeButtonMessage = { type: 'HS2_POSITIONED', payload: payload.buttonPosition };
            window.parent.postMessage(positionedMessage, PARENT_ORIGIN || '*');
          });
        });
        return;
      }
      if (retriesLeft <= 0) {
        console.warn('[IframeButtonBootstrap] positioning timeout: element API not ready');
        return;
      }
      setTimeout(() => tryApply(retriesLeft - 1), DELAY_MS);
    };

    tryApply(MAX_RETRIES);
  }

  // Notify when custom element is fully defined and ready
  if (window.customElements && window.customElements.whenDefined) {
    const tag = payload.tagName || W3A_BUTTON_WITH_TOOLTIP_ID;
    window.customElements.whenDefined(tag).then(() => {
      if (ETX_DEFINED_POSTED) return;
      ETX_DEFINED_POSTED = true;
      const definedMessage: IframeButtonMessage = { type: 'ETX_DEFINED' };
      window.parent.postMessage(definedMessage, PARENT_ORIGIN || '*');
    });
  }
}

/**
 * Type guards for iframe message payloads
 */
function isInitPayload(payload: unknown): payload is IframeInitData {
  return isObject(payload);
}

function isSetTxDataPayload(payload: unknown): payload is IframeButtonMessagePayloads['SET_TX_DATA'] {
  if (!isObject(payload)) return false;
  const p = payload as { nearAccountId?: unknown; txSigningRequests?: unknown };
  return isString(p.nearAccountId) && Array.isArray(p.txSigningRequests);
}

function isSetStylePayload(payload: unknown): payload is IframeButtonMessagePayloads['SET_STYLE'] {
  if (!isObject(payload)) return false;
  const p = payload as {
    buttonSizing?: { width?: unknown; height?: unknown };
    tooltipPosition?: unknown;
    tooltipTreeStyles?: unknown;
    theme?: unknown;
    activationMode?: unknown;
  };
  const sizeOk = !p.buttonSizing
    || (isObject(p.buttonSizing)
      && (p.buttonSizing.width == null || isString(p.buttonSizing.width) || isNumber(p.buttonSizing.width))
      && (p.buttonSizing.height == null || isString(p.buttonSizing.height) || isNumber(p.buttonSizing.height)));
  const themeOk = p.theme == null || p.theme === 'dark' || p.theme === 'light';
  const modeOk = p.activationMode == null || p.activationMode === 'tap' || p.activationMode === 'press';
  return sizeOk && themeOk && modeOk;
}

function isSetLoadingPayload(payload: unknown): payload is boolean { return isBoolean(payload); }

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
  if (!data || !isObject(data) || !('type' in data)) return;

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
            (payload.buttonSizing || {}),
            payload.tooltipPosition,
            payload.theme,
            payload.activationMode
          );
        } else {
          if (payload.buttonSizing) el.buttonSizing = payload.buttonSizing;
          if (payload.tooltipPosition) {
            el.tooltipPosition = payload.tooltipPosition;
          }
          // activationMode is optional on element; set only if present on element
          if (payload.activationMode && (el as unknown as { activationMode?: 'tap' | 'press' }).activationMode !== undefined) {
            (el as unknown as { activationMode?: 'tap' | 'press' }).activationMode = payload.activationMode;
          }
        }

        // Handle direct tooltip theme updates (robust across element versions)
        // Newer builds expose updateButtonStyles() which already handled theme above.
        // For safety and for older builds, also set the canonical property that the element reacts to.
        if (payload.theme) {
          (el as any).TxTreeTheme = payload.theme;
          if ((el as any).requestUpdate) (el as any).requestUpdate();
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
            window.parent.postMessage(successMessage, PARENT_ORIGIN || '*');
          })
          .catch((err: unknown) => {
            const errorMessage: IframeButtonMessage = {
              type: 'UI_INTENT_DIGEST',
              payload: { ok: false, error: String(err) }
            };
            console.warn('[IframeButtonBootstrap] UI_INTENT_DIGEST error', err);
            window.parent.postMessage(errorMessage, PARENT_ORIGIN || '*');
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
// Ensure fallback stylesheet is linked into the iframe document so UA margins
// are reset even on engines that use constructable stylesheets for shadow DOM.
ensureDocStylesheet('button-with-tooltip.css', 'data-w3a-button-tooltip-css');
notifyReady();
