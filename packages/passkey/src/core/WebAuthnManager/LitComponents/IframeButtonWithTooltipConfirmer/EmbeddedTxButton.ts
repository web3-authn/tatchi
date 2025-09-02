// External imports
import { html, css, type PropertyValues } from 'lit';
// SDK imports
import { TransactionInput, TransactionInputWasm, isActionArgsWasm, toActionArgsWasm } from '../../../types/actions';
// Local imports
import { LitElementWithProps } from '../LitElementWithProps';
import TooltipTxTree, { type TooltipTreeStyles } from '../TooltipTxTree';
import { TOOLTIP_THEMES, type TooltipTheme } from '../TooltipTxTree/tooltip-tree-themes';
import { EMBEDDED_TX_BUTTON_THEMES, type EmbeddedTxButtonTheme, type EmbeddedTxButtonStyles } from './embedded-tx-button-themes';
import { TooltipGeometry, TooltipPositionInternal } from './iframe-geometry';
import { buildDisplayTreeFromTxPayloads } from '../TooltipTxTree/tooltip-tree-utils';
import { EMBEDDED_TX_BUTTON_ID, ElementSelectors } from './tags';
import { computeUiIntentDigestFromTxs, orderActionForDigest } from '../common/tx-digest';

/**
 * Lit-based embedded transaction confirmation element for iframe usage.
 * Implements the clip-path approach with tooltip measurement and postMessage communication.
 */
export class EmbeddedTxButton extends LitElementWithProps {
  static properties = {
    nearAccountId: { type: String },
    txSigningRequests: { type: Array },
    color: { type: String },
    buttonText: { type: String },
    loading: { type: Boolean },
    tooltip: { type: Object },
    size: { type: Object },
    buttonSizing: { type: Object },
    styles: { type: Object, attribute: false },
    embeddedButtonStyles: { type: Object, attribute: false },
    tooltipTheme: { type: String },
    tooltipVisible: { state: true },
    hideTimeout: { state: true }
  } as const;

  // ==============================
  // Props & Defaults
  // ==============================
  nearAccountId: string = '';
  txSigningRequests: TransactionInput[] = [];
  color: string = '#667eea';
  buttonText: string = 'Sign Transaction';
  loading: boolean = false;
  tooltip: TooltipPositionInternal = {
    width: '360px',
    height: 'auto',
    position: 'top-center',
    offset: '4px'
  };
  buttonSizing: { width?: string | number; height?: string | number } = {};
  tooltipTheme: EmbeddedTxButtonTheme = 'dark';
  styles!: TooltipTreeStyles;
  embeddedButtonStyles!: EmbeddedTxButtonStyles;

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
  // Ensure TooltipTxTree is retained in the bundle, and not tree-shaken out
  private _ensureTreeDefinition = TooltipTxTree;
  // Observers and dedupe state
  private tooltipResizeObserver?: ResizeObserver;
  private buttonResizeObserver?: ResizeObserver;
  private lastSentGeometryKey: string | null = null;
  // Hover state latches used to prevent premature hides when moving between button and tooltip
  private buttonHovering: boolean = false;
  private tooltipHovering: boolean = false;

  // Type-safe element selectors bound to shadow root
  private selectors: ElementSelectors;

  constructor() {
    super();
    this.selectors = new ElementSelectors();
  }

  static styles = css`
    /* Data attribute selectors correspond to HTML data attributes for type-safe element selection */

    :host {
      display: var(--w3a-embedded__host__display, block);
      font-family: var(--w3a-embedded__host__font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
      background: var(--w3a-embedded__host__background, transparent);
      color: var(--w3a-embedded__host__color, #333);
      line-height: var(--w3a-embedded__host__line-height, 1.6);
      margin: var(--w3a-embedded__host__margin, 0);
      padding: var(--w3a-embedded__host__padding, 0);
      position: var(--w3a-embedded__host__position, relative);
      width: var(--w3a-embedded__host__width, 100%);
      height: var(--w3a-embedded__host__height, 100%);
    }

    [data-embedded-tx-button-root] {
      position: var(--w3a-embedded__confirm-container__position, relative);
      display: var(--w3a-embedded__confirm-container__display, inline-block);
      z-index: var(--w3a-embedded__confirm-container__z-index, 1001);
      box-sizing: var(--w3a-embedded__confirm-container__box-sizing, border-box);
      overflow: var(--w3a-embedded__confirm-container__overflow, visible);
      pointer-events: var(--w3a-embedded__confirm-container__pointer-events, auto);
      position: var(--w3a-embedded__confirm-container__position-absolute, absolute);
      top: var(--w3a-embedded__confirm-container__top, 50%);
      left: var(--w3a-embedded__confirm-container__left, 50%);
      transform: var(--w3a-embedded__confirm-container__transform, translate(-50%, -50%));
    }

    [data-embedded-btn] {
      /* Transparent interactive shim; visuals are rendered by the host */
      background: transparent !important;
      color: transparent !important;
      border: none !important;
      border-radius: 0;
      padding: 0;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0;
      width: var(--w3a-embedded__btn__width, var(--btn-width, 200px));
      height: var(--w3a-embedded__btn__height, var(--btn-height, 48px));
      box-sizing: border-box;
      margin: 0;
      outline: none;
      text-decoration: none;
      font-family: inherit;
      opacity: 1;
      will-change: auto;
      animation: none;
    }

    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    [data-embedded-btn]:hover { background: transparent !important; color: transparent !important; }

    [data-embedded-btn]:active { background: transparent !important; color: transparent !important; }

    [data-embedded-btn]:disabled {
      opacity: var(--w3a-embedded__btn-disabled__opacity, 0.6);
      cursor: var(--w3a-embedded__btn-disabled__cursor, not-allowed);
    }

    [data-loading] { display: none !important; }

    [data-loading][data-visible="true"] { display: none !important; }

    [data-spinner] {
      width: var(--w3a-embedded__spinner__width, 16px);
      height: var(--w3a-embedded__spinner__height, 16px);
      border: var(--w3a-embedded__spinner__border, 2px solid rgba(255, 255, 255, 0.3));
      border-top: var(--w3a-embedded__spinner__border-top, 2px solid white);
      border-radius: var(--w3a-embedded__spinner__border-radius, 50%);
      animation: var(--w3a-embedded__spinner__animation, spin 1s linear infinite);
    }

    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }

    /* Use data attributes instead of classes for guaranteed sync */
    [data-tooltip-content] {
      position: var(--w3a-embedded__tooltip-content__position, absolute);
      box-sizing: var(--w3a-embedded__tooltip-content__box-sizing, border-box);
      z-index: var(--w3a-embedded__tooltip-content__z-index, 1000);
      opacity: var(--w3a-embedded__tooltip-content__opacity, 0);
      visibility: var(--w3a-embedded__tooltip-content__visibility, hidden);
      pointer-events: none; /* prevent overlay from stealing hover before interactive */
      height: var(--tooltip-height, auto);
      max-height: var(--tooltip-max-height, none);
      overflow-y: var(--w3a-embedded__tooltip-content__overflow-y, auto);
      transition: var(--w3a-embedded__tooltip-content__transition, all 0.0s ease);
      /* Allow external control via CSS vars; default to no cap so tooltipPosition.width fully applies */
      min-width: var(--w3a-embedded__tooltip-content__min-width, 0px);
      max-width: var(--w3a-embedded__tooltip-content__max-width, none);
      width: var(--w3a-embedded__tooltip-content__width, var(--tooltip-width, 280px));
      /* Directional padding vars forwarded to tree host */
      --w3a-tree__host__padding-top: var(--tooltip-box-padding, 0px);
      --w3a-tree__host__padding-bottom: var(--tooltip-box-padding, 0px);
      --w3a-tree__host__padding-left: 0px;
      --w3a-tree__host__padding-right: 0px;
    }

    /* Top positions: aligned with button corners */
    [data-tooltip-content][data-position="top-left"] {
      bottom: 100%;
      left: 0; /* Aligns tooltip's left edge with button's left edge */
      margin-bottom: calc(var(--tooltip-offset, 4px) - var(--tooltip-box-padding, 0px));
      /* Add shadow room on the outer side only */
      --w3a-tree__host__padding-right: var(--tooltip-box-padding, 0px);
      --w3a-tree__host__padding-left: 0px;
    }

    [data-tooltip-content][data-position="top-center"] {
      bottom: 100%;
      left: 50%;
      transform: translateX(-50%);
      margin-bottom: calc(var(--tooltip-offset, 4px) - var(--tooltip-box-padding, 0px));
      --w3a-tree__host__padding-left: var(--tooltip-box-padding, 0px);
      --w3a-tree__host__padding-right: var(--tooltip-box-padding, 0px);
    }

    [data-tooltip-content][data-position="top-right"] {
      bottom: 100%;
      right: 0; /* Aligns tooltip's right edge with button's right edge */
      margin-bottom: calc(var(--tooltip-offset, 4px) - var(--tooltip-box-padding, 0px));
      --w3a-tree__host__padding-left: var(--tooltip-box-padding, 0px);
      --w3a-tree__host__padding-right: 0px;
    }

    /* Side positions */
    [data-tooltip-content][data-position="left"] {
      right: 100%;
      top: 50%;
      transform: translateY(-50%);
      margin-right: calc(var(--tooltip-offset, 4px) - var(--tooltip-box-padding, 0px));
      --w3a-tree__host__padding-left: var(--tooltip-box-padding, 0px);
      --w3a-tree__host__padding-right: 0px;
    }

    [data-tooltip-content][data-position="right"] {
      left: 100%;
      top: 50%;
      transform: translateY(-50%);
      margin-left: calc(var(--tooltip-offset, 4px) - var(--tooltip-box-padding, 0px));
      --w3a-tree__host__padding-right: var(--tooltip-box-padding, 0px);
      --w3a-tree__host__padding-left: 0px;
    }

    /* Bottom positions: aligned with button corners */
    [data-tooltip-content][data-position="bottom-left"] {
      top: 100%;
      left: 0; /* Aligns tooltip's left edge with button's left edge */
      margin-top: calc(var(--tooltip-offset, 4px) - var(--tooltip-box-padding, 0px));
      --w3a-tree__host__padding-right: var(--tooltip-box-padding, 0px);
      --w3a-tree__host__padding-left: 0px;
    }

    [data-tooltip-content][data-position="bottom-center"] {
      top: 100%;
      left: 50%;
      transform: translateX(-50%);
      margin-top: calc(var(--tooltip-offset, 4px) - var(--tooltip-box-padding, 0px));
      --w3a-tree__host__padding-left: var(--tooltip-box-padding, 0px);
      --w3a-tree__host__padding-right: var(--tooltip-box-padding, 0px);
    }

    [data-tooltip-content][data-position="bottom-right"] {
      top: 100%;
      right: 0; /* Aligns tooltip's right edge with button's right edge */
      margin-top: calc(var(--tooltip-offset, 4px) - var(--tooltip-box-padding, 0px));
      --w3a-tree__host__padding-left: var(--tooltip-box-padding, 0px);
      --w3a-tree__host__padding-right: 0px;
    }

    [data-tooltip-content][data-visible="true"] {
      opacity: var(--w3a-embedded__tooltip-content-visible__opacity, 1);
      visibility: var(--w3a-embedded__tooltip-content-visible__visibility, visible);
      pointer-events: auto; /* interactive only when visible */
    }

    [data-tooltip-content][data-hiding="true"] {
      transition-delay: var(--w3a-embedded__tooltip-content-hiding__transition-delay, 150ms);
    }
  `;

  // ==============================
  // Lifecycle & Setup
  // ==============================
  connectedCallback() {
    super.connectedCallback();

    // Bind selectors to shadow root, easier to querySelect elements with data-attributes
    this.selectors = new ElementSelectors(this.shadowRoot);

    // Initialize styles based on theme
    this.updateTooltipTheme();
    this.setupCSSVariables();
    this.applyEmbeddedButtonStyles();
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

    // Update tooltip theme when tooltipTheme property changes
    if (changedProperties.has('tooltipTheme')) {
      this.updateTooltipTheme();
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
  }

  private setupCSSVariables() {
    // Only propagate width/height/tooltip vars; visual styling is rendered by host
    const buttonWidth = this.buttonSizing?.width || '200px';
    const buttonHeight = this.buttonSizing?.height || '48px';
    this.style.setProperty('--btn-width', typeof buttonWidth === 'number' ? `${buttonWidth}px` : String(buttonWidth));
    this.style.setProperty('--btn-height', typeof buttonHeight === 'number' ? `${buttonHeight}px` : String(buttonHeight));

    this.style.setProperty('--tooltip-width', this.tooltip.width);
    this.style.setProperty('--tooltip-height', this.tooltip.height);
    this.style.setProperty('--tooltip-offset', this.tooltip.offset);
    // Set box padding for tooltip content and pass to tree via CSS cascade
    const boxPadding = this.tooltip.boxPadding || '0px';
    this.style.setProperty('--tooltip-box-padding', String(boxPadding));
  }

  // ==============================
  // Theme & CSS Variables
  // ==============================
  private updateTooltipTheme() {
    // Update tooltip tree styles based on the current theme
    const selectedTheme = TOOLTIP_THEMES[this.tooltipTheme] || TOOLTIP_THEMES.dark;
    this.styles = { ...selectedTheme };

    // Update embedded button styles based on the current theme
    const selectedButtonTheme = EMBEDDED_TX_BUTTON_THEMES[this.tooltipTheme] || EMBEDDED_TX_BUTTON_THEMES.dark;
    this.embeddedButtonStyles = { ...selectedButtonTheme };
  }

  private applyEmbeddedButtonStyles() {
    if (!this.embeddedButtonStyles) {
      return;
    }
    // Use parent class applyStyles method for consistent naming and behavior
    this.applyStyles(this.embeddedButtonStyles);
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
    const gap = this.parsePixelValue(this.tooltip.offset);
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
    const gap = this.parsePixelValue(this.tooltip.offset);
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
    const gap = this.parsePixelValue(this.tooltip.offset);
    const geometry = this.buildGeometry(buttonRect, tooltipRect, gap, visible);
    this.postTooltipStateIfChanged(geometry, true);
  }

  private buildGeometry(
    buttonRect: DOMRect,
    tooltipRect: DOMRect,
    gap: number,
    visible: boolean
  ): TooltipGeometry {
    const round = (n: number) => Math.round(n);
    return {
      button: {
        x: round(buttonRect.left),
        y: round(buttonRect.top),
        width: round(buttonRect.width),
        height: round(buttonRect.height),
        borderRadius: 8
      },
      tooltip: {
        x: round(tooltipRect.left),
        y: round(tooltipRect.top),
        width: round(tooltipRect.width),
        height: round(tooltipRect.height),
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
    const expectedHeight = this.parsePixelValue(this.buttonSizing?.height || '48px');
    const expectedWidth = this.parsePixelValue(this.buttonSizing?.width || '200px');

    // Force a reflow to ensure button dimensions are correct
    buttonElement.offsetHeight;

    const tooltipRect = tooltipElement.getBoundingClientRect();
    const buttonRect = buttonElement.getBoundingClientRect();
    const gap = this.parsePixelValue(this.tooltip.offset);

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
        x: buttonX,
        y: buttonY,
        width: buttonWidth,
        height: buttonHeight,
        borderRadius: 8
      },
      tooltip: {
        x: tooltipX,
        y: tooltipY,
        width: tooltipRect.width,
        height: tooltipRect.height,
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

  private parsePixelValue(value: string | number): number {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      if (value === 'auto') {
        throw new Error('Cannot parse "auto" value for pixel calculations. Please provide a specific pixel value.');
      }
      const match = value.match(/^(\d+(?:\.\d+)?)px$/);
      if (match) {
        return parseFloat(match[1]);
      }
      throw new Error(`Invalid pixel value: "${value}". Expected format: "123px" or numeric value.`);
    }
    return 0;
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
    try {
      tooltipElement.style.setProperty('--tooltip-height', 'auto');
    } catch {
    }
    tooltipElement.style.height = 'auto';
    tooltipElement.classList.add('show');
    tooltipElement.classList.remove('hiding');
    tooltipElement.setAttribute('aria-hidden', 'false');

    // Clear any pending hide
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout);
      this.hideTimeout = null;
    }

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
      try {
        tooltipElement.style.setProperty('--tooltip-height', this.tooltip.height);
      } catch {

      }
      tooltipElement.style.height = typeof this.tooltip.height === 'string' ? this.tooltip.height : `${this.tooltip.height}`;
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
    loading: boolean;
    buttonSizing: { width?: string | number; height?: string | number };
    tooltipPosition: TooltipPositionInternal;
    theme: TooltipTheme;
  }>) {

    Object.assign(this, props);
    // Update CSS variables if button styles changed
    if (props.buttonSizing) {
      this.setupCSSVariables();
    }
    // Update tooltip theme if theme changed
    if (props.theme) {
      this.updateTooltipTheme();
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
    embeddedButtonTheme?: EmbeddedTxButtonStyles,
    theme?: 'dark' | 'light'
  ) {
    this.buttonSizing = buttonSizing || {};
    if (tooltipPosition) {
      this.tooltip = tooltipPosition;
    }
    // Ignore embeddedButtonTheme for embedded visuals
    // Handle tooltip theme updates
    if (theme && theme !== this.tooltipTheme) {
      this.tooltipTheme = theme as EmbeddedTxButtonTheme;
      this.updateTooltipTheme();
    }
    this.setupCSSVariables();
    this.requestUpdate();
  }

  private handleConfirm() {
    if (window.parent) {
      window.parent.postMessage({ type: 'CONFIRM' }, this.getTargetOrigin());
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

    this.showTooltip();
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
    this.handlePointerEnter();
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
          ?disabled=${this.loading}
          @click=${this.handleConfirm}
          @pointerenter=${this.handlePointerEnter}
          @pointerleave=${this.handlePointerLeave}
          @focus=${this.handleFocus}
          @blur=${this.handleBlur}
          aria-describedby="tooltipContent"
          tabindex="0"
        >
          <!-- Loading state element - corresponds to [data-loading] CSS selector -->
          <span data-loading data-visible=${this.loading}>
            <!-- Spinner element - corresponds to [data-spinner] CSS selector -->
            <div data-spinner></div>
            Processing...
          </span>
          <span style="display: ${this.loading ? 'none' : 'inline'}">
            ${this.buttonText}
          </span>
        </button>

        <!-- Tooltip content element - corresponds to [data-tooltip-content] CSS selector -->
        <div
          data-tooltip-content
          data-position=${this.tooltip.position}
          data-visible=${this.tooltipVisible}
          data-hiding=${this.isHiding}
          id="tooltipContent"
          role="tooltip"
          aria-hidden="true"
          @pointerenter=${this.handleTooltipEnter}
          @pointerleave=${this.handleTooltipLeave}
        >
          <tooltip-tx-tree
            .node=${tree}
            .depth=${0}
            .styles=${this.styles}
            .theme=${this.tooltipTheme}
            @tree-toggled=${this.handleTreeToggled}
          ></tooltip-tx-tree>
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

  protected applyStyles(styles: EmbeddedTxButtonStyles): void {
    super.applyStyles(styles, this.getComponentPrefix());
  }
}

// Define the custom element
customElements.define(EMBEDDED_TX_BUTTON_ID, EmbeddedTxButton);

// Export default only to avoid name collision with React wrapper export
export default EmbeddedTxButton;
