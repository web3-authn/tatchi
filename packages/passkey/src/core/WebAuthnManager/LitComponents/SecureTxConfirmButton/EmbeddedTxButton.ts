// External imports
import { html, css } from 'lit';
// SDK imports
import { TransactionInput, toActionArgsWasm } from '../../../types/actions';
// Local imports
import { LitElementWithProps } from '../LitElementWithProps';
import TooltipTxTree, { type TooltipTreeStyles } from '../TooltipTxTree';
import { TOOLTIP_THEMES, type TooltipTheme } from '../TooltipTxTree/tooltip-tree-themes';
import { TooltipGeometry, TooltipPosition } from './iframe-geometry';
import { buildDisplayTreeFromTxPayloads } from '../TooltipTxTree/tooltip-tree-utils';
import { EMBEDDED_TX_BUTTON_ID, ElementSelectors } from './tags';
import { computeUiIntentDigestFromTxs } from './tx-digest';
import { T } from 'node_modules/@near-js/transactions/lib/esm/actions-D9yOaLEz';

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
    buttonStyle: { type: Object },
    buttonHoverStyle: { type: Object },
    tooltipTreeStyles: { type: Object, attribute: false },
    theme: { type: String },
    tooltipVisible: { state: true },
    hideTimeout: { state: true }
  } as const;

  nearAccountId: string = '';
  txSigningRequests: TransactionInput[] = [];
  color: string = '#667eea';
  buttonText: string = 'Sign Transaction';
  loading: boolean = false;
  tooltip: TooltipPosition = {
    width: '360px',
    height: 'auto',
    position: 'top-center',
    offset: '8px'
  };
  buttonStyle: React.CSSProperties = {};
  buttonHoverStyle: React.CSSProperties = {};
  theme: TooltipTheme = 'dark';
  tooltipTreeStyles!: TooltipTreeStyles;

  // Internal state
  private tooltipVisible: boolean = false;
  private hideTimeout: number | null = null;
  private initialGeometrySent: boolean = false;
  private initialGeometryRetryCount: number = 0;
  private buttonPosition: { x: number; y: number } | null = null;
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

  // Type-safe element selectors bound to shadow root
  private selectors: ElementSelectors;

  constructor() {
    super();
    this.selectors = new ElementSelectors();
  }

  static styles = css`
    /* Data attribute selectors correspond to HTML data attributes for type-safe element selection */

    :host {
      display: block;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: transparent;
      color: #333;
      line-height: 1.6;
      margin: 0;
      padding: 0;
      position: relative;
      width: 100%;
      height: 100%;
    }

    .embedded-confirm-container {
      position: relative;
      display: inline-block;
      z-index: 1001;
      box-sizing: border-box;
      overflow: visible;
      pointer-events: auto;
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
    }

    [data-embedded-btn] {
      background: var(--btn-background, var(--btn-color, #222));
      color: var(--btn-color-text, white);
      border: var(--btn-border, none);
      border-radius: var(--btn-border-radius, 8px);
      padding: var(--btn-padding, 12px 24px);
      font-size: var(--btn-font-size, 1rem);
      font-weight: var(--btn-font-weight, 500);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      width: var(--btn-width, 200px);
      height: var(--btn-height, 48px);
      box-sizing: border-box;
      transition: all 0.2s ease;
      margin: 0;
      outline: none;
      text-decoration: none;
      font-family: inherit;
     /* fadeIn as iframe pops in after page loads */
      opacity: 0;
      animation: fadeIn 0.1s ease forwards;
    }

    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    [data-embedded-btn]:hover {
      background: var(--btn-hover-background, var(--btn-color-hover, #5a6fd8));
      color: var(--btn-hover-color, white);
      border: var(--btn-hover-border, var(--btn-border, none));
      border-radius: var(--btn-hover-border-radius, var(--btn-border-radius, 8px));
      padding: var(--btn-hover-padding, var(--btn-padding, 12px 24px));
      font-size: var(--btn-hover-font-size, var(--btn-font-size, 1rem));
      font-weight: var(--btn-hover-font-weight, var(--btn-font-weight, 500));
    }

    [data-embedded-btn]:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    [data-loading] {
      display: none;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }

    [data-loading][data-visible="true"] {
      display: flex;
    }

    [data-spinner] {
      width: 16px;
      height: 16px;
      border: 2px solid rgba(255, 255, 255, 0.3);
      border-top: 2px solid white;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }

    /* Use data attributes instead of classes for guaranteed sync */
    [data-tooltip-content] {
      position: absolute;
      box-sizing: border-box;
      background: rgba(255, 255, 255, 0.95);
      backdrop-filter: blur(4px);
      -webkit-backdrop-filter: blur(4px);
      border: 1px solid #e2e8f0;
      border-radius: 24px;
      z-index: 1000;
      opacity: 0;
      visibility: hidden;
      height: var(--tooltip-height, auto);
      max-height: var(--tooltip-max-height, none);
      overflow-y: auto;
      transition: all 0.1s ease;
      min-width: 280px;
      max-width: 320px;
      width: var(--tooltip-width, 280px);
    }

    /* Top positions: aligned with button corners */
    [data-tooltip-content][data-position="top-left"] {
      bottom: 100%;
      left: 0; /* Aligns tooltip's left edge with button's left edge */
      margin-bottom: var(--tooltip-offset, 8px);
    }

    [data-tooltip-content][data-position="top-center"] {
      bottom: 100%;
      left: 50%;
      transform: translateX(-50%);
      margin-bottom: var(--tooltip-offset, 8px);
    }

    [data-tooltip-content][data-position="top-right"] {
      bottom: 100%;
      right: 0; /* Aligns tooltip's right edge with button's right edge */
      margin-bottom: var(--tooltip-offset, 8px);
    }

    /* Side positions */
    [data-tooltip-content][data-position="left"] {
      right: 100%;
      top: 50%;
      transform: translateY(-50%);
      margin-right: var(--tooltip-offset, 8px);
    }

    [data-tooltip-content][data-position="right"] {
      left: 100%;
      top: 50%;
      transform: translateY(-50%);
      margin-left: var(--tooltip-offset, 8px);
    }

    /* Bottom positions: aligned with button corners */
    [data-tooltip-content][data-position="bottom-left"] {
      top: 100%;
      left: 0; /* Aligns tooltip's left edge with button's left edge */
      margin-top: var(--tooltip-offset, 8px);
    }

    [data-tooltip-content][data-position="bottom-center"] {
      top: 100%;
      left: 50%;
      transform: translateX(-50%);
      margin-top: var(--tooltip-offset, 8px);
    }

    [data-tooltip-content][data-position="bottom-right"] {
      top: 100%;
      right: 0; /* Aligns tooltip's right edge with button's right edge */
      margin-top: var(--tooltip-offset, 8px);
    }

    [data-tooltip-content][data-visible="true"] {
      opacity: 1;
      visibility: visible;
    }

    [data-tooltip-content][data-hiding="true"] {
      transition-delay: 150ms;
    }

    .gradient-border {
      /* Thicker, subtle monochrome animated border */
      --border-angle: 0deg;
      background: linear-gradient(#ffffff, #ffffff) padding-box,
        conic-gradient(
          from var(--border-angle),
          rgba(0, 0, 0, 0.1) 0%,
          rgba(0, 0, 0, 0.5) 25%,
          rgba(0, 0, 0, 0.1) 50%,
          rgba(0, 0, 0, 0.5) 75%,
          rgba(0, 0, 0, 0.1) 100%
        ) border-box;
      border: 1px solid transparent;
      border-radius: 16px;
      margin: 8px;
      height: calc(100% - 2px); /* 2px for border: top and bottom */
      overflow: hidden;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
      position: relative;
      animation: border-angle-rotate 4s infinite linear;
    }

    @property --border-angle {
      syntax: "<angle>";
      initial-value: 0deg;
      inherits: false;
    }

    @keyframes border-angle-rotate {
      from { --border-angle: 0deg; }
      to { --border-angle: 360deg; }
    }
  `;

  connectedCallback() {
    super.connectedCallback();

    // Bind selectors to shadow root, easier to querySelect elements with data-attributes
    this.selectors = new ElementSelectors(this.shadowRoot);

    // Initialize tooltipTreeStyles based on theme
    this.updateTooltipTheme();

    // Browser doesn't know --border-angle is an animatable angle type,
    // so we need to register it globally.
    // Otherwise --border-angle only cyclesbetween 0deg and 360deg,
    // not smoothly animating through the values in between.
    if (!(window as any).borderAngleRegistered && CSS.registerProperty) {
      try {
        CSS.registerProperty({
          name: '--border-angle',
          syntax: '<angle>',
          initialValue: '0deg',
          inherits: false
        });
        (window as any).borderAngleRegistered = true;
      } catch (e) {
        console.warn('[EmbeddedTxConfirm] Failed to register --border-angle:', e);
      }
    }

    this.setupCSSVariables();
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

  disconnectedCallback() {
    super.disconnectedCallback();
    try { this.tooltipResizeObserver?.disconnect(); } catch {}
    try { this.buttonResizeObserver?.disconnect(); } catch {}
  }

  // Parent origin for postMessage hardening (set by iframe bootstrap)
  private getTargetOrigin(): string {
    return (window as any).__ETX_PARENT_ORIGIN || '*';
  }

  updated(changedProperties: Map<string, any>) {
    super.updated(changedProperties);
    // Update CSS variables when button styles change
    if (changedProperties.has('buttonStyle') || changedProperties.has('buttonHoverStyle') || changedProperties.has('color')) {
      this.setupCSSVariables();
    }

    // Update tooltip theme when theme property changes
    if (changedProperties.has('theme')) {
      this.updateTooltipTheme();
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

  private setupCSSVariables() {
    // Use buttonStyle.background or buttonStyle.backgroundColor if available, otherwise fall back to this.color
    const buttonBackground = this.buttonStyle?.background || this.buttonStyle?.backgroundColor || this.color;
    this.style.setProperty('--btn-color', String(buttonBackground));

    // Use buttonHoverStyle.background or buttonHoverStyle.backgroundColor if available, otherwise fall back to button background + transparency
    const hoverColor = this.buttonHoverStyle?.background || this.buttonHoverStyle?.backgroundColor || String(buttonBackground) + 'dd';
    this.style.setProperty('--btn-color-hover', String(hoverColor));

    // Use buttonStyle properties for width and height, with fallbacks
    const buttonWidth = this.buttonStyle?.width || '200px';
    const buttonHeight = this.buttonStyle?.height || '48px';
    this.style.setProperty('--btn-width', typeof buttonWidth === 'number' ? `${buttonWidth}px` : String(buttonWidth));
    this.style.setProperty('--btn-height', typeof buttonHeight === 'number' ? `${buttonHeight}px` : String(buttonHeight));

    this.style.setProperty('--tooltip-width', this.tooltip.width);
    this.style.setProperty('--tooltip-height', this.tooltip.height);
    this.style.setProperty('--tooltip-offset', this.tooltip.offset);

    // Apply button styles as CSS custom properties
    if (this.buttonStyle) {
      Object.entries(this.buttonStyle).forEach(([key, value]) => {
        const cssKey = key.replace(/([A-Z])/g, '-$1').toLowerCase();
        this.style.setProperty(`--btn-${cssKey}`, String(value));
      });
    }

    if (this.buttonHoverStyle) {
      Object.entries(this.buttonHoverStyle).forEach(([key, value]) => {
        const cssKey = key.replace(/([A-Z])/g, '-$1').toLowerCase();
        this.style.setProperty(`--btn-hover-${cssKey}`, String(value));
      });
    }
  }

  private updateTooltipTheme() {
    // Update tooltipTreeStyles based on the current theme
    const selectedTheme = TOOLTIP_THEMES[this.theme] || TOOLTIP_THEMES.dark;
    this.tooltipTreeStyles = { ...selectedTheme };
  }

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

  /**
   * Send initial geometry data to parent for clip-path setup
   */
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
    const expectedHeight = this.parsePixelValue(this.buttonStyle?.height || '48px');
    const expectedWidth = this.parsePixelValue(this.buttonStyle?.width || '200px');

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
          type: 'INIT_GEOMETRY',
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

  private async showTooltip() {
    const tooltipElement = ElementSelectors.getTooltipContent(this.shadowRoot);
    if (!tooltipElement || this.tooltipVisible) return;

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
    buttonStyle: React.CSSProperties;
    buttonHoverStyle: React.CSSProperties;
    tooltipPosition: TooltipPosition;
    theme: TooltipTheme;
  }>) {

    Object.assign(this, props);
    // Update CSS variables if button styles changed
    if (props.buttonStyle || props.buttonHoverStyle) {
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
    buttonStyle: React.CSSProperties,
    buttonHoverStyle: React.CSSProperties,
    tooltipPosition?: TooltipPosition
  ) {
    this.buttonStyle = buttonStyle;
    this.buttonHoverStyle = buttonHoverStyle;
    if (tooltipPosition) {
      this.tooltip = tooltipPosition;
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
    // Notify parent about button hover end
    if (window.parent) {
      window.parent.postMessage({
        type: 'BUTTON_HOVER',
        payload: { hovering: false }
      }, this.getTargetOrigin());
    }

    this.hideTooltip();
  }

  private handleTooltipEnter() {
    this.cancelHide();
  }

  private handleTooltipLeave() {
    this.hideTooltip();
  }

  // (UI digest is computed by the iframe bootstrap directly from txSigningRequests)
  // Compute digest from UI txs converted to wasm-shape (receiverId + snake_case actions)
  // This matches the worker/main-thread tx_signing_requests structure used for digest checks.
  async computeUiIntentDigest(): Promise<string> {
    const uiTxs = this.txSigningRequests || [];
    const orderActionForDigest = (aw: any) => {
      const type = aw?.action_type;
      switch (type) {
        case 'FunctionCall':
          return { action_type: aw.action_type, args: aw.args, deposit: aw.deposit, gas: aw.gas, method_name: aw.method_name };
        case 'Transfer':
          return { action_type: aw.action_type, deposit: aw.deposit };
        case 'Stake':
          return { action_type: aw.action_type, stake: aw.stake, public_key: aw.public_key };
        case 'AddKey':
          return { action_type: aw.action_type, public_key: aw.public_key, access_key: aw.access_key };
        case 'DeleteKey':
          return { action_type: aw.action_type, public_key: aw.public_key };
        case 'DeleteAccount':
          return { action_type: aw.action_type, beneficiary_id: aw.beneficiary_id };
        case 'DeployContract':
          return { action_type: aw.action_type, code: aw.code };
        case 'CreateAccount':
        default:
          return { action_type: aw.action_type };
      }
    };
    const wasmShapedOrdered = uiTxs.map(tx => {
      const actions = (tx.actions ?? []).map(action => orderActionForDigest(toActionArgsWasm(action)));
      return { actions, receiverId: tx?.receiverId };
    });
    console.log('[EmbeddedTxButton] ui txSigningRequests (raw)', uiTxs);
    console.log('[EmbeddedTxButton] uiDigest input (wasm-shaped, ordered)', wasmShapedOrdered);
    console.log('[JS] uiDigest (string tx_signing_requests):', JSON.stringify(wasmShapedOrdered));
    return computeUiIntentDigestFromTxs(wasmShapedOrdered);
  }

  render() {

    const tree = buildDisplayTreeFromTxPayloads(this.txSigningRequests, this.tooltipTreeStyles);

    return html`
      <!--
        Data attributes correspond to CSS selectors for type-safe element selection.
        Each data attribute maps to a CSS selector in the static styles property.
        This ensures perfect synchronization between CSS and JavaScript selectors.
      -->
      <!-- Container element - corresponds to [data-embedded-confirm-container] CSS selector -->
      <div data-embedded-confirm-container>
        <!-- Button element - corresponds to [data-embedded-btn] CSS selector -->
        <button
          data-embedded-btn
          ?disabled=${this.loading}
          @click=${this.handleConfirm}
          @pointerenter=${this.handlePointerEnter}
          @pointerleave=${this.handlePointerLeave}
          @focus=${this.handlePointerEnter}
          @blur=${this.handlePointerLeave}
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
          <div class="gradient-border">
            <tooltip-tx-tree
              .node=${tree}
              .depth=${0}
              .tooltipTreeStyles=${this.tooltipTreeStyles}
              @tree-toggled=${this.handleTreeToggled}
            ></tooltip-tx-tree>
          </div>
        </div>
      </div>
    `;
  }
}

// Define the custom element
customElements.define(EMBEDDED_TX_BUTTON_ID, EmbeddedTxButton);

// Export default only to avoid name collision with React wrapper export
export default EmbeddedTxButton;
