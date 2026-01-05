// External imports
import { html, type PropertyValues } from 'lit';
// SDK imports
import { TransactionInput, TransactionInputWasm, isActionArgsWasm, toActionArgsWasm } from '../../../types/actions';
// Local imports
import { LitElementWithProps, type ComponentStyles } from '../LitElementWithProps';
import TxTree, { type TxTreeStyles } from '../TxTree';
import type { TxTreeTheme } from '../TxTree/tx-tree-themes';
import type { ThemeName } from '../confirm-ui-types';
import { TooltipGeometry, TooltipPositionInternal, utilParsePx } from './iframe-geometry';
import { buildDisplayTreeFromTxPayloads } from '../TxTree/tx-tree-utils';
import { W3A_BUTTON_WITH_TOOLTIP_ID, ElementSelectors } from '../tags';
import { ensureExternalStyles } from '../css/css-loader';
import { computeUiIntentDigestFromTxs, orderActionForDigest } from '../../../digests/intentDigest';

/**
 * Lit-based embedded transaction confirmation element for iframe usage.
 * Implements the clip-path approach with tooltip measurement and postMessage communication.
 */
export class EmbeddedTxButton extends LitElementWithProps {
  static properties = {
    nearAccountId: { type: String },
    txSigningRequests: { type: Array },
    color: { type: String },
    loadingTouchIdPrompt: { type: Boolean },
    tooltip: { type: Object },
    size: { type: Object },
    buttonSizing: { type: Object },
    styles: { type: Object, attribute: false },
    TxTreeTheme: { type: String },
    tooltipVisible: { state: true },
    hideTimeout: { state: true },
    activationMode: { type: String }
  } as const;

  // ==============================
  // Props & Defaults
  // ==============================
  nearAccountId: string = '';
  txSigningRequests: TransactionInput[] = [];
  color: string = '#667eea';
  loadingTouchIdPrompt: boolean = false;
  tooltip: TooltipPositionInternal = {
    width: 'min(330px, calc(var(--w3a-vw, 100vw) - 1rem))',
    height: 'auto',
    position: 'top-center',
    offset: '4px'
  };
  buttonSizing: { width?: string | number; height?: string | number } = {};
  TxTreeTheme: ThemeName = 'dark';
  styles!: TxTreeStyles;
  activationMode: 'tap' | 'press' = 'tap';

  // ==============================
  // Internal State & Observers
  // ==============================
  private tooltipVisible: boolean = false;
  private hideTimeout: number | null = null;
  private initialGeometrySent: boolean = false;
  private initialGeometryRetryCount: number = 0;
  // Hide coordination and scheduled measurement handles
  private isHiding: boolean = false;
  private measureTimeout: number | null = null;
  private treeRaf1: number | null = null;
  private treeRaf2: number | null = null;
  // Ensure TxTree is retained in the bundle, and not tree-shaken out
  private _ensureTreeDefinition = TxTree;
  // Observers and dedupe state
  private tooltipResizeObserver?: ResizeObserver;
  private buttonResizeObserver?: ResizeObserver;
  private lastSentGeometryKey: string | null = null;
  // Hover state latches used to prevent premature hides when moving between button and tooltip
  private buttonHovering: boolean = false;
  private tooltipHovering: boolean = false;
  private pressTimer: number | null = null;
  private pressFired: boolean = false;
  private pressStartX: number = 0;
  private pressStartY: number = 0;
  private suppressClickUntil: number = 0;
  // Mobile/coarse-pointer UX helpers
  private isCoarsePointer: boolean = false;
  private mqlCoarse?: MediaQueryList;
  // Type-safe element selectors bound to shadow root
  private selectors: ElementSelectors;
  // Gate rendering until external CSS is applied to avoid FOUC
  private _cssReady: boolean = false;
  private _cssReadyPromise: Promise<void> | null = null;

  constructor() {
    super();
    this.selectors = new ElementSelectors();
  }

  protected createRenderRoot(): HTMLElement | DocumentFragment {
    const root = super.createRenderRoot();
    // Adopt external stylesheets for CSP compatibility and wait for them before first render
    const p1 = ensureExternalStyles(root as ShadowRoot | DocumentFragment | HTMLElement, 'button-with-tooltip.css', 'data-w3a-button-tooltip-css');
    const p2 = ensureExternalStyles(root as ShadowRoot | DocumentFragment | HTMLElement, 'tx-tree.css', 'data-w3a-tx-tree-css');
    const p3 = ensureExternalStyles(root as ShadowRoot | DocumentFragment | HTMLElement, 'w3a-components.css', 'data-w3a-components-css');
    this._cssReadyPromise = Promise.all([p1, p2, p3])
      .then(() => { this._cssReady = true; this.requestUpdate(); })
      .catch(() => { this._cssReady = true; this.requestUpdate(); });
    return root;
  }

  // Avoid first paint until CSS is ready to prevent FOUC in the iframe
  protected shouldUpdate(): boolean {
    return this._cssReady;
  }

  // ==============================
  // Lifecycle & Setup
  // ==============================
  connectedCallback() {
    super.connectedCallback();

    // Bind selectors to shadow root, easier to querySelect elements with data-attributes
    this.selectors = new ElementSelectors(this.shadowRoot);

    // Initialize styles based on theme
    this.updateTxTreeTheme();
    this.setupCSSVariables();
    this.applyEmbeddedButtonStyles();

    // Detect coarse pointer environments (mobile/tablets) to adapt interactions
    this.setupCoarsePointerDetection();

    // Close with Escape for accessibility
    window.addEventListener('keydown', this.handleKeyDown, { passive: true });
  }

  /**
   * Detects coarse-pointer environments and adapts interactions.
   * - Primary: (pointer: coarse)
   * - Secondary: touch capability (maxTouchPoints / ontouchstart)
   * - Tertiary: UA mobile hint for iframe edge cases (e.g., Chrome on iOS)
   * Sets activationMode to 'press' on coarse pointers and listens for changes.
   */
  private setupCoarsePointerDetection(): void {
    try {
      const mql = window.matchMedia('(pointer: coarse)');
      const hasTouch = (typeof navigator !== 'undefined' && typeof (navigator as any).maxTouchPoints === 'number')
        ? (navigator as any).maxTouchPoints > 0
        : ('ontouchstart' in window);
      const ua = (typeof navigator !== 'undefined' && (navigator as any).userAgent) ? String((navigator as any).userAgent) : '';
      const isMobileUA = /Android|iPhone|iPad|iPod/i.test(ua);
      this.isCoarsePointer = ((mql?.matches === true) || isMobileUA) && !!hasTouch;

      this.mqlCoarse = mql;
      this.mqlCoarse.addEventListener?.('change', (e) => {
        const updatedHasTouch = (typeof navigator !== 'undefined' && typeof (navigator as any).maxTouchPoints === 'number')
          ? (navigator as any).maxTouchPoints > 0
          : ('ontouchstart' in window);
        const ua2 = (typeof navigator !== 'undefined' && (navigator as any).userAgent) ? String((navigator as any).userAgent) : '';
        const mobile2 = /Android|iPhone|iPad|iPod/i.test(ua2);
        this.isCoarsePointer = ((e.matches === true) || mobile2) && !!updatedHasTouch;
        this.requestUpdate();
      });

      if (this.isCoarsePointer) {
        this.activationMode = 'press';
      }
    } catch {}
  }

  firstUpdated() {
    // Observe tooltip size changes to keep geometry in sync
    const tooltip = this.selectors.getTooltipContent();
    if (tooltip && 'ResizeObserver' in window) {
      this.tooltipResizeObserver = new ResizeObserver(() => {
        if (this.tooltipVisible && !this.isHiding) {
          this.measureTooltip();
        }
      });
      this.tooltipResizeObserver.observe(tooltip);
    }

    // Observe button size changes too
    const button = this.selectors.getEmbeddedBtn();
    if (button && 'ResizeObserver' in window) {
      this.buttonResizeObserver = new ResizeObserver(() => {
        if (!this.isHiding) {
          this.measureTooltip();
        }
      });
      this.buttonResizeObserver.observe(button);
    }
  }

  updated(changedProperties: PropertyValues) {
    super.updated(changedProperties);
    // Update CSS variables when button styles change
    if (changedProperties.has('buttonSizing') || changedProperties.has('color')) {
      this.setupCSSVariables();
    }

    // Update tooltip theme when TxTreeTheme property changes
    if (changedProperties.has('TxTreeTheme')) {
      this.updateTxTreeTheme();
      this.applyEmbeddedButtonStyles();
    }

    if (changedProperties.has('nearAccountId') || changedProperties.has('txSigningRequests')) {
      // Force DOM update and re-measure tooltip when transaction data changes
      // The tooltip content should automatically update since it's part of the render template
      if (this.tooltipVisible) {
        // Use requestAnimationFrame to ensure DOM has fully updated
        requestAnimationFrame(() => {
          this.measureTooltip();
        });
      }
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    try { this.tooltipResizeObserver?.disconnect(); } catch {}
    try { this.buttonResizeObserver?.disconnect(); } catch {}
    try { window.removeEventListener('keydown', this.handleKeyDown as unknown as EventListener); } catch {}
    if (this.pressTimer) {
      try { clearTimeout(this.pressTimer); } catch {}
      this.pressTimer = null;
    }
  }

  private setupCSSVariables() {
    // Only propagate width/height/tooltip vars; visual styling is rendered by host
    const buttonWidth = this.buttonSizing?.width || '200px';
    const buttonHeight = this.buttonSizing?.height || '48px';
    this.setCssVars({
      '--btn-width': typeof buttonWidth === 'number' ? `${buttonWidth}px` : String(buttonWidth),
      '--btn-height': typeof buttonHeight === 'number' ? `${buttonHeight}px` : String(buttonHeight),
      '--tooltip-width': String(this.tooltip.width),
      '--tooltip-height': String(this.tooltip.height),
      '--tooltip-offset': String(this.tooltip.offset),
    });
    // Set box padding for tooltip content and pass to tree via CSS cascade
    const boxPadding = this.tooltip.boxPadding || '0px';
    this.setCssVars({ '--tooltip-box-padding': String(boxPadding) });
  }

  // ==============================
  // Theme & CSS Variables
  // ==============================
  private updateTxTreeTheme() {
    // External CSS handles tree and embedded button themes; no-op here.
  }

  private applyEmbeddedButtonStyles() {
    // External CSS handles embedded button visuals; nothing to apply.
    return;
  }

  // ==============================
  // Geometry & Measurement
  // ==============================
  private measureTooltip() {
    if (this.isHiding) return; // suppress transient measurements during hide
    const tooltipElement = this.selectors.getTooltipContent();
    const buttonElement = this.selectors.getEmbeddedBtn();

    if (!tooltipElement || !buttonElement) return;

    const tooltipRect = tooltipElement.getBoundingClientRect();
    const buttonRect = buttonElement.getBoundingClientRect();
    const gap = utilParsePx(this.tooltip.offset);
    const geometry = this.buildGeometry(buttonRect, tooltipRect, gap, this.tooltipVisible);
    // Rate-limit updates using requestAnimationFrame
    requestAnimationFrame(() => {
      this.postTooltipStateIfChanged(geometry);
    });
  }

  private measureTooltipAndUpdateParentSync() {
    if (this.isHiding) return; // suppress transient measurements during hide
    const tooltipElement = this.selectors.getTooltipContent();
    const buttonElement = this.selectors.getEmbeddedBtn();

    if (!tooltipElement || !buttonElement) return;

    const tooltipRect = tooltipElement.getBoundingClientRect();
    const buttonRect = buttonElement.getBoundingClientRect();
    const gap = utilParsePx(this.tooltip.offset);
    const geometry = this.buildGeometry(buttonRect, tooltipRect, gap, this.tooltipVisible);
    // Send synchronously if changed
    this.postTooltipStateIfChanged(geometry, true);
  }

  private sendTooltipState(visible: boolean) {
    const tooltipElement = this.selectors.getTooltipContent();
    const buttonElement = this.selectors.getEmbeddedBtn();
    if (!tooltipElement || !buttonElement) return;

    const tooltipRect = tooltipElement.getBoundingClientRect();
    const buttonRect = buttonElement.getBoundingClientRect();
    const gap = utilParsePx(this.tooltip.offset);
    const geometry = this.buildGeometry(buttonRect, tooltipRect, gap, visible);
    this.postTooltipStateIfChanged(geometry, true);
  }

  private buildGeometry(
    buttonRect: DOMRect,
    tooltipRect: DOMRect,
    gap: number,
    visible: boolean
  ): TooltipGeometry {
    // Use floor for positions and ceil for sizes to avoid
    // rounding down and creating 1px undersized iframes that scroll.
    const floor = (n: number) => Math.floor(n);
    const ceil = (n: number) => Math.ceil(n);
    return {
      button: {
        x: floor(buttonRect.left),
        y: floor(buttonRect.top),
        width: ceil(buttonRect.width),
        height: ceil(buttonRect.height),
        borderRadius: 8
      },
      tooltip: {
        x: floor(tooltipRect.left),
        y: floor(tooltipRect.top),
        width: ceil(tooltipRect.width),
        height: ceil(tooltipRect.height),
        borderRadius: 24
      },
      position: this.tooltip.position,
      gap,
      visible
    };
  }

  private geometryKey(g: TooltipGeometry): string {
    return [
      g.button.x, g.button.y, g.button.width, g.button.height,
      g.tooltip.x, g.tooltip.y, g.tooltip.width, g.tooltip.height,
      g.position, g.gap, g.visible
    ].join('|');
  }

  private postTooltipStateIfChanged(geometry: TooltipGeometry, sync = false) {
    const key = this.geometryKey(geometry);
    if (key === this.lastSentGeometryKey) return;
    this.lastSentGeometryKey = key;
    const target = this.getTargetOrigin();
    if (window.parent) {
      window.parent.postMessage({ type: 'TOOLTIP_STATE', payload: geometry }, target);
    }
  }

  // ==============================
  // Messaging Helpers
  // ==============================
  // Parent origin for postMessage hardening (set by iframe bootstrap)
  private getTargetOrigin(): string {
    const w = window as Window & { __ETX_PARENT_ORIGIN?: string };
    return w.__ETX_PARENT_ORIGIN || '*';
  }

  /**
   * Send initial geometry data to parent for clip-path setup
   */
  // ==============================
  // Handshake: Initial Geometry
  // ==============================
  sendInitialGeometry() {

    const tooltipElement = this.selectors.getTooltipContent();
    const buttonElement = this.selectors.getEmbeddedBtn();

    if (!tooltipElement || !buttonElement) {
      this.initialGeometryRetryCount++;
      if (this.initialGeometryRetryCount > 10) {
        console.error('[EmbeddedTxButton] Failed to find elements after 10 retries, giving up');
        return;
      }
      console.error(`[EmbeddedTxButton] Missing elements for initial geometry, retry ${this.initialGeometryRetryCount}/10 in 100ms`);
      // Retry after a short delay if elements aren't ready
      setTimeout(() => {
        if (!this.initialGeometrySent) {
          this.sendInitialGeometry();
        }
      }, 100);
      return;
    }

    // Ensure button has correct dimensions before measuring
    const expectedHeight = utilParsePx(this.buttonSizing?.height || '48px');
    const expectedWidth = utilParsePx(this.buttonSizing?.width || '200px');

    // Force a reflow to ensure button dimensions are correct
    buttonElement.offsetHeight;

    const tooltipRect = tooltipElement.getBoundingClientRect();
    const buttonRect = buttonElement.getBoundingClientRect();
    const gap = utilParsePx(this.tooltip.offset);

    // Validate and correct button dimensions if needed
    const buttonHeight = Math.abs(buttonRect.height - expectedHeight) < 5 ? buttonRect.height : expectedHeight;
    const buttonWidth = Math.abs(buttonRect.width - expectedWidth) < 5 ? buttonRect.width : expectedWidth;

    // Use the positioned coordinates from getBoundingClientRect()
    // In iframe context, these should already be relative to iframe viewport
    const buttonX = buttonRect.left;
    const buttonY = buttonRect.top;
    const tooltipX = tooltipRect.left;
    const tooltipY = tooltipRect.top;

    const geometry: TooltipGeometry = {
      button: {
        x: Math.floor(buttonX),
        y: Math.floor(buttonY),
        width: Math.ceil(buttonWidth),
        height: Math.ceil(buttonHeight),
        borderRadius: 8
      },
      tooltip: {
        x: Math.floor(tooltipX),
        y: Math.floor(tooltipY),
        width: Math.ceil(tooltipRect.width),
        height: Math.ceil(tooltipRect.height),
        borderRadius: 24
      },
      position: this.tooltip.position,
      gap,
      visible: false // Always false for initial setup
    };

    // Send initial geometry for clip-path setup
    requestAnimationFrame(() => {
      if (window.parent) {
        window.parent.postMessage({
          type: 'HS5_GEOMETRY_RESULT',
          payload: geometry
        }, this.getTargetOrigin());
        this.initialGeometrySent = true;
      }
    });
  }

  // ==============================
  // Tooltip Visibility & Pointer Handling
  // ==============================
  private async showTooltip() {
    const tooltipElement = ElementSelectors.getTooltipContent(this.shadowRoot);
    if (!tooltipElement || this.tooltipVisible) return;

    // If a hide was in progress, cancel it and reset state before showing again
    this.cancelHide();
    this.isHiding = false;

    this.tooltipVisible = true;
    // Allow content to expand naturally when visible
    this.setCssVars({ '--tooltip-height': 'auto' });
    tooltipElement.classList.add('show');
    tooltipElement.classList.remove('hiding');
    tooltipElement.setAttribute('aria-hidden', 'false');

    // Clear any pending hide
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout);
      this.hideTimeout = null;
    }

    // Move focus to close button for accessibility on mobile
    try {
      if (this.isCoarsePointer) {
        const closeBtn = tooltipElement.querySelector('[data-close-btn]') as HTMLButtonElement | null;
        closeBtn?.focus?.();
      }
    } catch {}

    // Measure after showing, wait for render and one frame
    await this.updateComplete;
    await new Promise(requestAnimationFrame);
    if (!this.tooltipVisible || this.isHiding) return;
    this.measureTooltip();
  }

  private hideTooltip() {
    if (!this.tooltipVisible) return;

    const tooltipElement = this.selectors.getTooltipContent();
    if (!tooltipElement) return;

    // If still hovering button or tooltip, do not hide
    if (this.buttonHovering || this.tooltipHovering) return;

    // Enter hiding state and cancel any scheduled measurements/RAFs
    this.isHiding = true;
    if (this.measureTimeout) {
      clearTimeout(this.measureTimeout);
      this.measureTimeout = null;
    }
    if (this.treeRaf1) {
      cancelAnimationFrame(this.treeRaf1);
      this.treeRaf1 = null;
    }
    if (this.treeRaf2) {
      cancelAnimationFrame(this.treeRaf2);
      this.treeRaf2 = null;
    }

    tooltipElement.classList.add('hiding');

    this.hideTimeout = window.setTimeout(() => {
      // Abort hide if hover returned during grace
      if (this.buttonHovering || this.tooltipHovering) {
        this.isHiding = false;
        this.hideTimeout = null;
        return;
      }
      this.tooltipVisible = false;
      tooltipElement.classList.remove('show', 'hiding');
      tooltipElement.setAttribute('aria-hidden', 'true');
      // Restore configured height when hidden
      // Collapse hidden tooltips to avoid geometry impact
      this.setCssVars({ '--tooltip-height': '0px' });
      this.hideTimeout = null;

      // Send updated tooltip state with visible: false (no extra measure scheduling)
      this.sendTooltipState(false);
      this.isHiding = false;
    }, 100);
  }

  private async handleTreeToggled() {
    if (this.isHiding) {
      return; // skip measuring during hide
    }
    this.requestUpdate();
    await this.updateComplete;
    await new Promise(requestAnimationFrame);
    this.measureTooltipAndUpdateParentSync();
  }

  private cancelHide() {
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout);
      this.hideTimeout = null;

      const tooltipElement = this.selectors.getTooltipContent();
      if (tooltipElement) {
        tooltipElement.classList.remove('hiding');
      }
    }

    // CRITICAL: Reset isHiding flag when hide is cancelled
    // This allows tree expansion measurements to proceed normally
    this.isHiding = false;
  }

  // Method to force property update and re-render
  updateProperties(props: Partial<{
    nearAccountId: string;
    txSigningRequests: TransactionInput[];
    loadingTouchIdPrompt: boolean;
    buttonSizing: { width?: string | number; height?: string | number };
    tooltipPosition: TooltipPositionInternal;
    theme: TxTreeTheme;
  }>) {

    Object.assign(this, props);
    // Update CSS variables if button styles changed
    if (props.buttonSizing) {
      this.setupCSSVariables();
    }
    // Update tooltip theme if theme changed
    if (props.theme) {
      this.updateTxTreeTheme();
    }
    // Force a re-render to update tooltip content
    this.requestUpdate();
    // If tooltip is visible and actionArgs changed, re-measure after render
    if (props.txSigningRequests && this.tooltipVisible) {
      requestAnimationFrame(() => {
        this.measureTooltip();
      });
    }
  }

  // Method to handle SET_STYLE messages
  updateButtonStyles(
    buttonSizing: { width?: string | number; height?: string | number },
    tooltipPosition?: TooltipPositionInternal,
    theme?: 'dark' | 'light',
    activationMode?: 'tap' | 'press'
  ) {
    this.buttonSizing = buttonSizing || {};
    if (tooltipPosition) {
      this.tooltip = tooltipPosition;
    }
    // Handle tooltip theme updates
    if (theme && theme !== this.TxTreeTheme) {
      this.TxTreeTheme = theme as ThemeName;
      this.updateTxTreeTheme();
    }
    if (activationMode) {
      this.activationMode = activationMode;
    }
    this.setupCSSVariables();
    this.requestUpdate();
  }

  private handleConfirm() {
    if (window.parent) {
      window.parent.postMessage({ type: 'CONFIRM' }, this.getTargetOrigin());
    }
  }

  // Click handler that adapts for mobile: first tap shows tooltip, second tap confirms
  private handleClick(ev: Event) {
    if (this.isCoarsePointer) {
      if (this.activationMode === 'press') {
        // If a long-press just opened the tooltip, suppress the click
        if (Date.now() < this.suppressClickUntil) {
          ev.preventDefault();
          ev.stopPropagation();
          return;
        }
        // In press mode, simple tap confirms directly
        this.handleConfirm();
        return;
      } else {
        if (!this.tooltipVisible) {
          // Tap-to-toggle mode: first tap shows details
          ev.preventDefault();
          ev.stopPropagation();
          this.showTooltip();
          return;
        }
        // Tooltip visible: confirm
        this.handleConfirm();
        return;
      }
    }
    // Desktop/precise pointer: default behavior -> confirm
    this.handleConfirm();
  }

  // Long press detection for mobile "deep press" to show tooltip
  private handlePointerDown = (ev: PointerEvent) => {
    if (!this.isCoarsePointer || this.activationMode !== 'press') return;
    if (ev.pointerType !== 'touch') return;
    try { (ev.target as HTMLElement)?.setPointerCapture?.(ev.pointerId); } catch {}
    this.pressFired = false;
    this.pressStartX = ev.clientX;
    this.pressStartY = ev.clientY;
    if (this.pressTimer) window.clearTimeout(this.pressTimer);
    this.pressTimer = window.setTimeout(() => {
      this.pressFired = true;
      this.suppressClickUntil = Date.now() + 600; // ignore click synthesized after long-press
      this.showTooltip();
    }, 350);
  }

  private handlePointerMove = (ev: PointerEvent) => {
    if (!this.isCoarsePointer || this.activationMode !== 'press') return;
    if (this.pressTimer == null) return;
    const dx = Math.abs(ev.clientX - this.pressStartX);
    const dy = Math.abs(ev.clientY - this.pressStartY);
    if (dx > 10 || dy > 10) {
      window.clearTimeout(this.pressTimer);
      this.pressTimer = null;
    }
  }

  private handlePointerUp = (_ev: PointerEvent) => {
    if (!this.isCoarsePointer || this.activationMode !== 'press') return;
    if (this.pressTimer) {
      window.clearTimeout(this.pressTimer);
      this.pressTimer = null;
    }
  }

  private handlePointerCancel = (_ev: PointerEvent) => {
    if (this.pressTimer) {
      window.clearTimeout(this.pressTimer);
      this.pressTimer = null;
    }
  }

  private handlePointerEnter() {
    this.buttonHovering = true;
    // Notify parent immediately about button hover for pointer-events activation
    if (window.parent) {
      window.parent.postMessage({
        type: 'BUTTON_HOVER',
        payload: { hovering: true }
      }, this.getTargetOrigin());
    }
    // Only show tooltip on hover for precise pointers; on coarse pointers rely on long-press
    if (!this.isCoarsePointer) {
      this.showTooltip();
    }
  }

  private handlePointerLeave() {
    this.buttonHovering = false;
    // Notify parent about button hover end
    if (window.parent) {
      window.parent.postMessage({
        type: 'BUTTON_HOVER',
        payload: { hovering: false }
      }, this.getTargetOrigin());
    }
    if (!this.tooltipHovering) {
      this.hideTooltip();
    }
  }

  private handleFocus() {
    if (window.parent) {
      window.parent.postMessage({
        type: 'BUTTON_FOCUS',
        payload: { focused: true }
      }, this.getTargetOrigin());
    }
    // Do not auto-open tooltip on focus for coarse pointers; preserve tap-to-confirm UX
    if (!this.isCoarsePointer) {
      this.handlePointerEnter();
    }
  }

  private handleBlur() {
    if (window.parent) {
      window.parent.postMessage({
        type: 'BUTTON_FOCUS',
        payload: { focused: false }
      }, this.getTargetOrigin());
    }
    this.handlePointerLeave();
  }

  private handleTooltipEnter() {
    this.tooltipHovering = true;
    this.cancelHide();
  }

  private handleTooltipLeave() {
    this.tooltipHovering = false;
    if (!this.buttonHovering) {
      this.hideTooltip();
    }
  }

  private handleKeyDown = (ev: KeyboardEvent) => {
    if (ev.key === 'Escape' && this.tooltipVisible) {
      this.hideTooltip();
    }
  }

  // (UI digest is computed by the iframe bootstrap directly from txSigningRequests)
  // Compute digest from UI txs converted to wasm-shape (receiverId + snake_case actions)
  // This matches the worker/main-thread tx_signing_requests structure used for digest checks.
  // ==============================
  // Digest
  // ==============================
  async computeUiIntentDigest(): Promise<string> {
    const uiTxs = this.txSigningRequests || [];
    const txs = uiTxs.map(tx => {
      const rawActions = tx?.actions || [];
      const wasmActions = rawActions.map((a => isActionArgsWasm(a) ? a : toActionArgsWasm(a)));
      const orderedActions = wasmActions.map(orderActionForDigest);
      return {
        receiverId: tx?.receiverId,
        actions: orderedActions
      } as TransactionInputWasm;
    });
    return computeUiIntentDigestFromTxs(txs);
  }

  // ==============================
  // Render
  // ==============================
  render() {

    const tree = buildDisplayTreeFromTxPayloads(this.txSigningRequests, this.styles);

    return html`
      <!--
        Data attributes correspond to CSS selectors for type-safe element selection.
        Each data attribute maps to a CSS selector in the static styles property.
        This ensures perfect synchronization between CSS and JavaScript selectors.
      -->
      <!-- Container element - corresponds to [data-embedded-tx-button-root] CSS selector -->
      <div data-embedded-tx-button-root>
        <!-- Button element - corresponds to [data-embedded-btn] CSS selector -->
        <button
          data-embedded-btn
          ?disabled=${this.loadingTouchIdPrompt}
          @click=${this.handleClick}
          @pointerdown=${this.handlePointerDown}
          @pointermove=${this.handlePointerMove}
          @pointerup=${this.handlePointerUp}
          @pointercancel=${this.handlePointerCancel}
          @pointerenter=${this.handlePointerEnter}
          @pointerleave=${this.handlePointerLeave}
          @focus=${this.handleFocus}
          @blur=${this.handleBlur}
          aria-describedby="tooltipContent"
          aria-haspopup=${this.isCoarsePointer ? 'dialog' : 'true'}
          aria-expanded=${this.tooltipVisible}
          tabindex="0"
        >
          <!-- Invisible shim: visuals are rendered by host; no inner content needed -->
        </button>

        <!-- Tooltip content element - corresponds to [data-tooltip-content] CSS selector -->
        <div
          data-tooltip-content
          data-position=${this.tooltip.position}
          data-visible=${this.tooltipVisible}
          data-hiding=${this.isHiding}
          data-mobile-sheet=${this.isCoarsePointer}
          id="tooltipContent"
          role=${this.isCoarsePointer ? 'dialog' : 'tooltip'}
          aria-modal=${this.isCoarsePointer ? 'true' : 'false'}
          aria-hidden="true"
          @pointerenter=${this.handleTooltipEnter}
          @pointerleave=${this.handleTooltipLeave}
        >
          <w3a-tx-tree
            .node=${tree}
            .depth=${0}
            .styles=${this.styles}
            .theme=${this.TxTreeTheme}
            .showShadow=${true}
            @lit-tree-toggled=${this.handleTreeToggled}
          ></w3a-tx-tree>
        </div>
      </div>
    `;
  }

  // ==============================
  // Parent Class Overrides
  // ==============================

  protected getComponentPrefix(): string {
    return 'embedded';
  }

  protected applyStyles(styles: ComponentStyles): void {
    super.applyStyles(styles, this.getComponentPrefix());
  }

  // ==============================
  // Container Position API (CSP-safe)
  // ==============================
  /**
   * Applies absolute positioning to the confirm container via CSS variables,
   * avoiding any inline style attribute writes (CSP friendly).
   */
  public applyContainerPosition(x: number, y: number): void {
    // These CSS variables are consumed by the [data-embedded-tx-button-root] rule
    this.setCssVars({
      '--w3a-embedded__confirm-container__position-absolute': 'absolute',
      '--w3a-embedded__confirm-container__top': `${Math.floor(y)}px`,
      '--w3a-embedded__confirm-container__left': `${Math.floor(x)}px`,
      '--w3a-embedded__confirm-container__transform': 'none',
    });
  }
}

// Define the custom element and legacy alias for backwards compatibility
if (!customElements.get(W3A_BUTTON_WITH_TOOLTIP_ID)) {
  customElements.define(W3A_BUTTON_WITH_TOOLTIP_ID, EmbeddedTxButton);
}
// Legacy alias: define a lightweight subclass to avoid reusing the same constructor
if (!customElements.get('button-with-tooltip')) {
  class EmbeddedTxButtonAlias extends EmbeddedTxButton {}
  customElements.define('button-with-tooltip', EmbeddedTxButtonAlias as unknown as CustomElementConstructor);
}

// Export default only to avoid name collision with React wrapper export
export default EmbeddedTxButton;
