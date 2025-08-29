import { LitElementWithProps } from '../LitElementWithProps';
import { html, css } from 'lit';
import { when } from 'lit/directives/when.js';
import { ActionArgs, TransactionInput } from '../../../types/actions';
import TooltipTxTree, { type TreeNode } from './TooltipTxTree';
import { buildActionTree } from './tooltipTxTreeUtils';
import { formatArgs, formatDeposit, formatGas } from '../renderUtils';
import {
  TooltipGeometry,
  TooltipPosition,
  TooltipPositionEnum,
  Rectangle
} from './iframeGeometry';
import { TOOLTIP_THEMES, type TooltipTheme } from './tooltipTxTreeThemes';
import type { TooltipTreeStyles } from './TooltipTxTree';

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

  static styles = css`
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

    .embedded-btn {
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

    .embedded-btn:hover {
      background: var(--btn-hover-background, var(--btn-color-hover, #5a6fd8));
      color: var(--btn-hover-color, white);
      border: var(--btn-hover-border, var(--btn-border, none));
      border-radius: var(--btn-hover-border-radius, var(--btn-border-radius, 8px));
      padding: var(--btn-hover-padding, var(--btn-padding, 12px 24px));
      font-size: var(--btn-hover-font-size, var(--btn-font-size, 1rem));
      font-weight: var(--btn-hover-font-weight, var(--btn-font-weight, 500));
    }

    .embedded-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .loading {
      display: none;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }

    .loading.show {
      display: flex;
    }

    .spinner {
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

    .tooltip-content {
      position: absolute;
      box-sizing: border-box;
      background: rgba(255, 255, 255, 0.95);
      backdrop-filter: blur(4px);
      -webkit-backdrop-filter: blur(4px);
      border: 1px solid #e2e8f0;
      border-radius: 24px;
      padding: 8px;
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

    /* Top positions - aligned with button corners */
    .tooltip-content.top-left {
      bottom: 100%;
      left: 0; /* Aligns tooltip's left edge with button's left edge */
      margin-bottom: var(--tooltip-offset, 8px);
    }

    .tooltip-content.top-center {
      bottom: 100%;
      left: 50%;
      transform: translateX(-50%);
      margin-bottom: var(--tooltip-offset, 8px);
    }

    .tooltip-content.top-right {
      bottom: 100%;
      right: 0; /* Aligns tooltip's right edge with button's right edge */
      margin-bottom: var(--tooltip-offset, 8px);
    }

    /* Side positions */
    .tooltip-content.left {
      right: 100%;
      top: 50%;
      transform: translateY(-50%);
      margin-right: var(--tooltip-offset, 8px);
    }

    .tooltip-content.right {
      left: 100%;
      top: 50%;
      transform: translateY(-50%);
      margin-left: var(--tooltip-offset, 8px);
    }

    /* Bottom positions - aligned with button corners */
    .tooltip-content.bottom-left {
      top: 100%;
      left: 0; /* Aligns tooltip's left edge with button's left edge */
      margin-top: var(--tooltip-offset, 8px);
    }

    .tooltip-content.bottom-center {
      top: 100%;
      left: 50%;
      transform: translateX(-50%);
      margin-top: var(--tooltip-offset, 8px);
    }

    .tooltip-content.bottom-right {
      top: 100%;
      right: 0; /* Aligns tooltip's right edge with button's right edge */
      margin-top: var(--tooltip-offset, 8px);
    }

    .tooltip-content.show {
      opacity: 1;
      visibility: visible;
    }

    .tooltip-content.hiding {
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
      height: calc(100% - 2px);
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

    .action-item {
      padding: 0;
      /* border-bottom: 1px solid #e2e8f0; */
    }

    .action-item:last-child {
      border-bottom: none;
    }

    .action-type {
      font-weight: 600;
      color: #2d3748;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 8px 4px 8px;
    }

    .action-details {
      font-size: 0.8rem;
      color: #4a5568;
      width: 100%;
      overflow: hidden;
    }

    .action-type-badge {
      background: var(--btn-color, #667eea);
      color: white;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 0.75rem;
      font-weight: 500;
    }

    .action-detail {
      padding: 0;
      margin: 0;
      border-bottom: 1px solid #f1f1f1;
      display: table;
      width: 100%;
      table-layout: fixed;
    }

    .action-detail:last-child,
    .action-detail.no-border {
      border-bottom: none;
    }

    .action-detail strong {
      color: #2d3748;
      padding: 4px 8px 4px 8px;
      font-weight: 600;
      white-space: nowrap;
      vertical-align: top;
      width: 25%;
      font-size: 0.75rem;
      display: table-cell;
    }

    .action-detail span {
      padding: 4px 8px 4px 8px;
      vertical-align: top;
      word-break: break-word;
      display: table-cell;
    }

    .code-block {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
      background: #f8fafc;
      border-radius: 8px;
      padding: 6px;
      margin-top: 2px;
      white-space: pre-wrap;
      word-break: break-word;
      overflow-wrap: anywhere;
      overflow: auto;
      line-height: 1.35;
      font-size: 0.78rem;
      color: #1f2937;
      max-height: calc(1.35em * 8);
      margin-left: 0;
      width: 100%;
      box-sizing: border-box;
    }
  `;

  connectedCallback() {
    super.connectedCallback();

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
    this.sendReadyMessage();
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

  private sendReadyMessage() {
    if (window.parent) {
      window.parent.postMessage({ type: 'READY' }, '*');
    }
  }

  private measureTooltip() {
    if (this.isHiding) return; // suppress transient measurements during hide
    const tooltipElement = this.shadowRoot?.querySelector('.tooltip-content') as HTMLElement;
    const buttonElement = this.shadowRoot?.querySelector('.embedded-btn') as HTMLElement;

    if (!tooltipElement || !buttonElement) return;

    const tooltipRect = tooltipElement.getBoundingClientRect();
    const buttonRect = buttonElement.getBoundingClientRect();
    const gap = this.parsePixelValue(this.tooltip.offset);

    const geometry: TooltipGeometry = {
      button: {
        x: buttonRect.left,
        y: buttonRect.top,
        width: buttonRect.width,
        height: buttonRect.height,
        borderRadius: 8
      },
      tooltip: {
        x: tooltipRect.left,
        y: tooltipRect.top,
        width: tooltipRect.width,
        height: tooltipRect.height,
        borderRadius: 24
      },
      position: this.tooltip.position,
      gap,
      visible: this.tooltipVisible
    };

    // Rate-limit updates using requestAnimationFrame
    requestAnimationFrame(() => {
      if (window.parent) {
        window.parent.postMessage({
          type: 'TOOLTIP_STATE',
          payload: geometry
        }, '*');
      }
    });
  }

  private measureTooltipAndUpdateParentSync() {
    if (this.isHiding) return; // suppress transient measurements during hide
    const tooltipElement = this.shadowRoot?.querySelector('.tooltip-content') as HTMLElement;
    const buttonElement = this.shadowRoot?.querySelector('.embedded-btn') as HTMLElement;

    if (!tooltipElement || !buttonElement) return;

    const tooltipRect = tooltipElement.getBoundingClientRect();
    const buttonRect = buttonElement.getBoundingClientRect();
    const gap = this.parsePixelValue(this.tooltip.offset);

    const geometry: TooltipGeometry = {
      button: {
        x: buttonRect.left,
        y: buttonRect.top,
        width: buttonRect.width,
        height: buttonRect.height,
        borderRadius: 8
      },
      tooltip: {
        x: tooltipRect.left,
        y: tooltipRect.top,
        width: tooltipRect.width,
        height: tooltipRect.height,
        borderRadius: 24
      },
      position: this.tooltip.position,
      gap,
      visible: this.tooltipVisible
    };

    // Send message SYNCHRONOUSLY (no requestAnimationFrame delay)
    // This ensures parent updates happen in the same frame as tooltip expansion
    if (window.parent) {
      window.parent.postMessage({
        type: 'TOOLTIP_STATE',
        payload: geometry
      }, '*');
    }
  }

  private sendTooltipState(visible: boolean) {
    const tooltipElement = this.shadowRoot?.querySelector('.tooltip-content') as HTMLElement;
    const buttonElement = this.shadowRoot?.querySelector('.embedded-btn') as HTMLElement;
    if (!tooltipElement || !buttonElement) return;

    const tooltipRect = tooltipElement.getBoundingClientRect();
    const buttonRect = buttonElement.getBoundingClientRect();
    const gap = this.parsePixelValue(this.tooltip.offset);

    const geometry: TooltipGeometry = {
      button: { x: buttonRect.left, y: buttonRect.top, width: buttonRect.width, height: buttonRect.height, borderRadius: 8 },
      tooltip: { x: tooltipRect.left, y: tooltipRect.top, width: tooltipRect.width, height: tooltipRect.height, borderRadius: 24 },
      position: this.tooltip.position,
      gap,
      visible
    };
    if (window.parent) {
      window.parent.postMessage({ type: 'TOOLTIP_STATE', payload: geometry }, '*');
    }
  }

  /**
   * Send initial geometry data to parent for clip-path setup
   */
  sendInitialGeometry() {

    const tooltipElement = this.shadowRoot?.querySelector('.tooltip-content') as HTMLElement;
    const buttonElement = this.shadowRoot?.querySelector('.embedded-btn') as HTMLElement;

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
        }, '*');
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

  private showTooltip() {
    const tooltipElement = this.shadowRoot?.querySelector('.tooltip-content') as HTMLElement;
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

    // Measure after showing - this will send TOOLTIP_STATE with visible: true
    this.measureTimeout = window.setTimeout(() => {
      this.measureTimeout = null;
      if (!this.tooltipVisible || this.isHiding) return;
      this.measureTooltip();
    }, 16);
  }

  private hideTooltip() {
    if (!this.tooltipVisible) return;

    const tooltipElement = this.shadowRoot?.querySelector('.tooltip-content') as HTMLElement;
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

  private handleTreeToggled() {
    if (this.isHiding) {
      return; // skip measuring during hide
    }
    // Pure measurement approach: Calculate expected dimensions without DOM manipulation

    // Cancel any pending animation frames
    if (this.treeRaf1) {
      cancelAnimationFrame(this.treeRaf1);
      this.treeRaf1 = null;
    }
    if (this.treeRaf2) {
      cancelAnimationFrame(this.treeRaf2);
      this.treeRaf2 = null;
    }

    // Single frame: Calculate expected dimensions and update everything atomically
    this.treeRaf1 = requestAnimationFrame(() => {
      // Step 1: Force re-render to update the tree structure first
      this.requestUpdate();

      // Step 2: Immediately measure the expanded tooltip (after re-render)
      this.measureTooltipAndUpdateParentSync();
    });
  }

  private cancelHide() {
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout);
      this.hideTimeout = null;

      const tooltipElement = this.shadowRoot?.querySelector('.tooltip-content') as HTMLElement;
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
      window.parent.postMessage({ type: 'CONFIRM' }, '*');
    }
  }

  private handlePointerEnter() {
    // Notify parent immediately about button hover for pointer-events activation
    if (window.parent) {
      window.parent.postMessage({
        type: 'BUTTON_HOVER',
        payload: { hovering: true }
      }, '*');
    }

    this.showTooltip();
  }

  private handlePointerLeave() {
    // Notify parent about button hover end
    if (window.parent) {
      window.parent.postMessage({
        type: 'BUTTON_HOVER',
        payload: { hovering: false }
      }, '*');
    }

    this.hideTooltip();
  }

  private handleTooltipEnter() {
    this.cancelHide();
  }

  private handleTooltipLeave() {
    this.hideTooltip();
  }

  private renderActions(action: ActionArgs, index: number) {
    return html`
      <div class="action-item">
        <div class="action-type">
          <span class="action-type-badge">${action.type}</span>
          <span class="action-index">Action ${index + 1}</span>
        </div>
        <div class="action-details">
          ${this._renderActionDetails(action)}
        </div>
      </div>
    `;
  }

  // Note action is ActionsArgs type (typescript camelCase) becuase this information
  // is being passed from typescript, before sending it to the wasm-worker
  // The wasm-worker merely checks back in the main thread and validates that
  // the transaction data in the iframe sandbox is valid.
  private _renderActionDetails(action: ActionArgs) {
    if (action.type === 'CreateAccount') {
      return html`
        <div class="action-row">
          <div class="action-label">Action</div>
          <div class="action-value">Create Account</div>
        </div>
      `;
    }
    if (action.type === 'DeployContract') {
      const code = action.code;
      const sizeLabel = (() => {
        if (!code) return '0 bytes';
        if (code instanceof Uint8Array) return `${code.byteLength} bytes`;
        if (Array.isArray(code)) return `${code.length} bytes`;
        if (typeof code === 'string') return `${code.length} bytes`;
        return 'unknown';
      })();
      return html`
        <div class="action-row">
          <div class="action-label">Action</div>
          <div class="action-value">Deploy Contract</div>
        </div>
        <div class="action-row">
          <div class="action-label">Code Size</div>
          <div class="action-value">${sizeLabel}</div>
        </div>
      `;
    }
    if (action.type === 'FunctionCall') {
      return html`
        <div class="action-detail">
          <strong>Deposit</strong>
          <span>${action.deposit || '0'}</span>
        </div>
        <div class="action-detail">
          <strong>Gas</strong>
          <span>${formatGas(action.gas)}</span>
        </div>
        <div class="action-detail no-border">
          <strong>Method</strong>
          <span>${action.methodName}</span>
        </div>
        ${when(action.args, () => {
          return html`
            <div class="action-detail no-border" style="margin-top: -4px">
              <span>
                <pre class="code-block"><code>${formatArgs(action.args)}</code></pre>
              </span>
            </div>
          `;
        })}
      `;
    }
    if (action.type === 'Transfer') {
      return html`
        <div class="action-row">
          <div class="action-label">Action</div>
          <div class="action-value">Transfer</div>
        </div>
        <div class="action-row">
          <div class="action-label">Amount</div>
          <div class="action-value">${formatDeposit(action.amount)}</div>
        </div>
      `;
    }
    if (action.type === 'Stake') {
      return html`
        <div class="action-row">
          <div class="action-label">Action</div>
          <div class="action-value">Stake</div>
        </div>
        <div class="action-row">
          <div class="action-label">Public Key</div>
          <div class="action-value">${(action as any).public_key || ''}</div>
        </div>
        <div class="action-row">
          <div class="action-label">Amount</div>
          <div class="action-value">${(action as any).stake || ''}</div>
        </div>
      `;
    }
    if (action.type === 'AddKey') {
      const ak = action.accessKey;
      let akPretty = '';
      try {
        akPretty = JSON.stringify(typeof ak === 'string' ? JSON.parse(ak) : ak, null, 2);
      } catch {
        akPretty = String(ak);
      }
      return html`
        <div class="action-row">
          <div class="action-label">Action</div>
          <div class="action-value">Add Key</div>
        </div>
        <div class="action-row">
          <div class="action-label">Public Key</div>
          <div class="action-value">${action.publicKey || ''}</div>
        </div>
        <div class="action-row">
          <div class="action-label">Access Key</div>
          <div class="action-value"><pre class="code-block"><code>${akPretty}</code></pre></div>
        </div>
      `;
    }
    if (action.type === 'DeleteKey') {
      return html`
        <div class="action-row">
          <div class="action-label">Action</div>
          <div class="action-value">Delete Key</div>
        </div>
        <div class="action-row">
          <div class="action-label">Public Key</div>
          <div class="action-value">${action.publicKey || ''}</div>
        </div>
      `;
    }
    if (action.type === 'DeleteAccount') {
      return html`
        <div class="action-row">
          <div class="action-label">Action</div>
          <div class="action-value">Delete Account</div>
        </div>
        <div class="action-row">
          <div class="action-label">Beneficiary</div>
          <div class="action-value">${action.beneficiaryId || ''}</div>
        </div>
      `;
    }
    // Fallback: show raw JSON for unknown/extended actions
    let raw = '';
    try {
      raw = JSON.stringify(action, null, 2);
    } catch {
      raw = String(action);
    }
    return html`
      <div class="action-row">
        <div class="action-label">Action</div>
        <div class="action-value">Unknown</div>
      </div>
      <div class="action-row">
        <div class="action-label">Data</div>
        <div class="action-value"><pre class="code-block"><code>${raw}</code></pre></div>
      </div>
    `;
  }

  private buildDisplayTreeFromTxPayloads(txSigningRequests: TransactionInput[]): TreeNode {

    const txFolders: TreeNode[] = txSigningRequests.map((tx: TransactionInput, tIdx: number) => {
      // Build a two-level tree: Transaction -> Action N -> subfields
      const highlightMethodColor = this.tooltipTreeStyles?.highlightMethodName?.color;
      const children = buildActionTree(tx, highlightMethodColor).children || [];
      return {
        id: `tx-${tIdx}`,
        label: `Transaction ${tIdx + 1} to ${tx.receiverId}`,
        type: 'folder',
        open: tIdx === 0,
        ...(this.tooltipTreeStyles?.highlightReceiverId?.color && {
          highlight: {
            type: 'receiverId' as const,
            color: this.tooltipTreeStyles.highlightReceiverId.color
          }
        }),
        children: [...children]
      };
    });

    return {
      id: 'txs-root',
      label: txFolders.length > 1 ? 'Transactions' : 'Transaction',
      type: 'folder',
      open: true,
      children: txFolders
    };
  }

  render() {

    if (!this.txSigningRequests || this.txSigningRequests.length === 0) {
      return html`<div>Loading...</div>`;
    }

    const tree = this.buildDisplayTreeFromTxPayloads(this.txSigningRequests);

    return html`
      <div class="embedded-confirm-container">
        <button
          class="embedded-btn"
          ?disabled=${this.loading}
          @click=${this.handleConfirm}
          @pointerenter=${this.handlePointerEnter}
          @pointerleave=${this.handlePointerLeave}
          @focus=${this.handlePointerEnter}
          @blur=${this.handlePointerLeave}
          aria-describedby="tooltipContent"
          tabindex="0"
        >
          <span class="loading ${this.loading ? 'show' : ''}">
            <div class="spinner"></div>
            Processing...
          </span>
          <span style="display: ${this.loading ? 'none' : 'inline'}">
            ${this.buttonText}
          </span>
        </button>

        <div
          class="tooltip-content ${this.tooltip.position}"
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
customElements.define('embedded-tx-button', EmbeddedTxButton);

// Export default only to avoid name collision with React wrapper export
export default EmbeddedTxButton;
