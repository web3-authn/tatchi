import type { IframeInitData } from './iframe-geometry';

/**
 * Iframe Bootstrap Script (ESM)
 *
 * What is it: a script that runs inside the embedded iframe to wire up a
 * deterministic handshake with the parent and forward state to
 * <embedded-tx-button>.
 *
 * When: loaded by the host in the iframe HTML alongside the embedded element
 * bundle (see IframeButtonHost.generateIframeHtml()).
 *
 * How: READY → (parent) SET_INIT → POSITIONING_APPLIED → (parent)
 * REQUEST_GEOMETRY → (embedded) INIT_GEOMETRY. Subsequent SET_* updates adjust
 * data/styles/loading.
 *
 * Security: captures targetOrigin from SET_INIT and reuses it for all posts.
 */

// Parent communication configuration
let PARENT_ORIGIN: string | undefined; // set from SET_INIT.targetOrigin
let ETX_DEFINED_POSTED = false; // ensure we only announce once

// Notify parent that we're ready to receive SET_INIT
function notifyReady(): void {
  try {
    window.parent.postMessage({ type: 'READY' }, '*');
  } catch {}
}

// Forward iframe errors to parent for visibility
function postError(kind: 'IFRAME_ERROR' | 'IFRAME_UNHANDLED_REJECTION', message: string): void {
  try {
    window.parent.postMessage({ type: kind, payload: message }, PARENT_ORIGIN || '*');
  } catch {}
}

/** Apply SET_INIT: element config + absolute positioning (before measure). */
function applyInit(el: any, payload: IframeInitData): void {
  // Apply basic styling and configuration
  el.color = payload.backgroundColor;
  el.size = payload.size;
  el.tooltip = payload.tooltip;

  // Capture target origin from host (optional hardening)
  if ((payload as any).targetOrigin) {
    PARENT_ORIGIN = String((payload as any).targetOrigin);
    (window as any).__ETX_PARENT_ORIGIN = PARENT_ORIGIN;
  }

  // STEP 2: Apply button positioning (critical for geometry handshake)
  if (payload.buttonPosition) {
    const apply = () => {
      const c = el.shadowRoot?.querySelector('.embedded-confirm-container') as HTMLElement | null;
      if (c) {
        // Position the button container absolutely at the specified coordinates
        c.style.position = 'absolute';
        c.style.top = String(payload.buttonPosition!.y) + 'px';
        c.style.left = String(payload.buttonPosition!.x) + 'px';
        c.style.transform = 'none';

        // Force a reflow to ensure positioning is applied before any measurements
        c.offsetHeight;

        // STEP 3: Notify parent that positioning is complete
        // This triggers the parent to request geometry measurement
        try {
          window.parent.postMessage({
            type: 'POSITIONING_APPLIED',
            payload: payload.buttonPosition
          }, PARENT_ORIGIN || '*');
        } catch {}
      } else {
        // Retry if shadow DOM elements aren't ready yet
        setTimeout(apply, 10);
      }
    };

    // Apply positioning once shadow DOM is ready
    if (el.shadowRoot) apply(); else setTimeout(apply, 50);
  }

  // Notify when custom element is fully defined and ready
  if (window.customElements && window.customElements.whenDefined) {
    const tag = (payload as any).tagName || 'embedded-tx-button';
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
function onMessage(e: MessageEvent): void {
  const { type, payload } = (e.data || {}) as { type?: string; payload?: any };
  const el = document.getElementById('etx') as any;
  if (!el) return;

  switch (type) {
    case 'SET_INIT':
      // STEP 1: Receive initialization data from parent
      applyInit(el, payload as IframeInitData);
      break;

    case 'SET_TX_DATA':
      // Update transaction data for display in the tooltip
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
      break;

    case 'SET_LOADING':
      // Update loading state of the button
      if (el.updateProperties) {
        el.updateProperties({ loading: !!payload });
      } else {
        el.loading = !!payload;
      }
      break;

    case 'SET_STYLE':
      // Update button styling and tooltip configuration
      if (el.updateButtonStyles) {
        el.updateButtonStyles(payload.buttonStyle || {}, payload.buttonHoverStyle || {}, payload.tooltipPosition || {});
      } else {
        el.buttonStyle = payload.buttonStyle || {};
        el.buttonHoverStyle = payload.buttonHoverStyle || {};
        if (payload.tooltipPosition) {
          el.tooltipPosition = payload.tooltipPosition;
        }
      }
      // Pass tooltip tree styles if available
      if (payload.tooltipTreeStyles && el.tooltipTreeStyles !== payload.tooltipTreeStyles) {
        el.tooltipTreeStyles = payload.tooltipTreeStyles;
        if (el.requestUpdate) el.requestUpdate();
      }
      break;

    case 'REQUEST_GEOMETRY':
      // STEP 4: Parent is requesting geometry measurement now that positioning is applied
      // This is the final step of the Initial Geometry Handshake
      // Triggers sendInitialGeometry() which measures positioned elements and sends INIT_GEOMETRY
      if (el.sendInitialGeometry) {
        el.sendInitialGeometry();
      }
      break;
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
