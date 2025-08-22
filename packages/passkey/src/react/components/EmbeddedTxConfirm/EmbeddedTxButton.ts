import { LitElement, html, css } from 'lit';
import type { ActionArgs } from '../../../core/types/actions';

export type TooltipPosition =
  | 'top-left' | 'top-center' | 'top-right'
  | 'left' | 'right'
  | 'bottom-left' | 'bottom-center' | 'bottom-right';

export interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
  borderRadius?: number;
}

export interface TooltipGeometry {
  button: Rectangle;
  tooltip: Rectangle;
  position: TooltipPosition;
  gap: number;
  visible: boolean;
}

/**
 * Lit-based embedded transaction confirmation element for iframe usage.
 * Implements the clip-path approach with tooltip measurement and postMessage communication.
 */
export class EmbeddedTxConfirmElement extends LitElement {
  static properties = {
    nearAccountId: { type: String },
    actionArgs: { type: Object },
    color: { type: String },
    buttonText: { type: String },
    loading: { type: Boolean },
    tooltip: { type: Object },
    size: { type: Object },
    buttonStyle: { type: Object },
    buttonHoverStyle: { type: Object },
    tooltipVisible: { state: true },
    hideTimeout: { state: true }
  } as const;

  nearAccountId: string = '';
  actionArgs: ActionArgs | ActionArgs[] | null = null;
  color: string = '#667eea';
  buttonText: string = 'Confirm Transaction';
  loading: boolean = false;
  tooltip: {
    width: string;
    height: string;
    position: TooltipPosition;
    offset: string
  } = {
    width: '280px',
    height: 'auto',
    position: 'top-center',
    offset: '8px'
  };
  buttonStyle: React.CSSProperties = {};
  buttonHoverStyle: React.CSSProperties = {};

  // Internal state
  private tooltipVisible: boolean = false;
  private hideTimeout: number | null = null;
  private initialGeometrySent: boolean = false;

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

    .btn {
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
      opacity: 0;
      animation: fadeIn 0.1s ease forwards;
    }

    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    .btn:hover {
      background: var(--btn-hover-background, var(--btn-color-hover, #5a6fd8));
      color: var(--btn-hover-color, white);
      border: var(--btn-hover-border, var(--btn-border, none));
      border-radius: var(--btn-hover-border-radius, var(--btn-border-radius, 8px));
      padding: var(--btn-hover-padding, var(--btn-padding, 12px 24px));
      font-size: var(--btn-hover-font-size, var(--btn-font-size, 1rem));
      font-weight: var(--btn-hover-font-weight, var(--btn-font-weight, 500));
    }

    .btn:disabled {
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

    .action-list {
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
      height: 100%;
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
      padding: 0 0 0 8px;
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
    console.log('[EmbeddedTxConfirm Lit] Connected to DOM');

    // Browser doesn't know --border-angle is an animatable angle type,
    // so we need to register it globally.
    // Otherwise --border-angle only cycles between 0deg and 360deg,
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
        console.log('[EmbeddedTxConfirm] Registered --border-angle property');
      } catch (e) {
        console.warn('[EmbeddedTxConfirm] Failed to register --border-angle:', e);
      }
    }

    this.setupCSSVariables();
    this.sendReadyMessage();

    // Try sending initial geometry after a short delay to ensure DOM is rendered
    setTimeout(() => {
      if (!this.initialGeometrySent) {
        console.log('[EmbeddedTxConfirm Lit] Attempting to send initial geometry from connectedCallback');
        this.sendInitialGeometry();
        this.initialGeometrySent = true;
      }
    }, 100);
  }

  updated(changedProperties: Map<string, any>) {
    super.updated(changedProperties);
    console.log('[EmbeddedTxConfirm Lit] Updated properties:', Object.fromEntries(changedProperties));

    // Update CSS variables when button styles change
    if (changedProperties.has('buttonStyle') || changedProperties.has('buttonHoverStyle') || changedProperties.has('color')) {
      this.setupCSSVariables();
    }

    if (changedProperties.has('nearAccountId') || changedProperties.has('actionArgs')) {
      console.log('[EmbeddedTxConfirm Lit] Key properties changed, current state:', {
        nearAccountId: this.nearAccountId,
        actionArgs: this.actionArgs,
        loading: this.loading
      });

      // Send initial geometry for clip-path setup on first actionArgs update
      if (!this.initialGeometrySent && this.actionArgs) {
        requestAnimationFrame(() => {
          console.log('[EmbeddedTxConfirm Lit] Sending initial geometry for clip-path setup');
          this.sendInitialGeometry();
          this.initialGeometrySent = true;
        });
      }

      // Force DOM update and re-measure tooltip when transaction data changes
      // The tooltip content should automatically update since it's part of the render template
      if (this.tooltipVisible) {
        // Use requestAnimationFrame to ensure DOM has fully updated
        requestAnimationFrame(() => {
          console.log('[EmbeddedTxConfirm Lit] Re-measuring tooltip after actionArgs change');
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

  private sendReadyMessage() {
    if (window.parent) {
      window.parent.postMessage({ type: 'READY' }, '*');
    }
  }

  private measureTooltip() {
    const tooltipElement = this.shadowRoot?.querySelector('.tooltip-content') as HTMLElement;
    const buttonElement = this.shadowRoot?.querySelector('.btn') as HTMLElement;

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

  /**
   * Send initial geometry data to parent for clip-path setup
   */
  private sendInitialGeometry() {
    const tooltipElement = this.shadowRoot?.querySelector('.tooltip-content') as HTMLElement;
    const buttonElement = this.shadowRoot?.querySelector('.btn') as HTMLElement;

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
    tooltipElement.classList.add('show');
    tooltipElement.classList.remove('hiding');
    tooltipElement.setAttribute('aria-hidden', 'false');

    // Clear any pending hide
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout);
      this.hideTimeout = null;
    }

    // Measure after showing - this will send TOOLTIP_STATE with visible: true
    setTimeout(() => this.measureTooltip(), 50);
  }

  private hideTooltip() {
    if (!this.tooltipVisible) return;

    const tooltipElement = this.shadowRoot?.querySelector('.tooltip-content') as HTMLElement;
    if (!tooltipElement) return;

    tooltipElement.classList.add('hiding');

    this.hideTimeout = window.setTimeout(() => {
      this.tooltipVisible = false;
      tooltipElement.classList.remove('show', 'hiding');
      tooltipElement.setAttribute('aria-hidden', 'true');
      this.hideTimeout = null;

      // Send updated tooltip state with visible: false
      this.measureTooltip();
    }, 100);
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
  }

  // Method to force property update and re-render
  updateProperties(props: Partial<{ nearAccountId: string; actionArgs: any; loading: boolean; buttonStyle: React.CSSProperties; buttonHoverStyle: React.CSSProperties }>) {
    console.log('[EmbeddedTxConfirm Lit] updateProperties called with:', props);

    Object.assign(this, props);

    // Update CSS variables if button styles changed
    if (props.buttonStyle || props.buttonHoverStyle) {
      this.setupCSSVariables();
    }

    // Force a re-render to update tooltip content
    this.requestUpdate();

    // If tooltip is visible and actionArgs changed, re-measure after render
    if (props.actionArgs && this.tooltipVisible) {
      requestAnimationFrame(() => {
        console.log('[EmbeddedTxConfirm Lit] Re-measuring tooltip after updateProperties actionArgs change');
        this.measureTooltip();
      });
    }
  }

  // Method to handle SET_STYLE messages
  updateButtonStyles(
    buttonStyle: React.CSSProperties,
    buttonHoverStyle: React.CSSProperties,
    tooltipStyle?: {
      width: string;
      height: string | 'auto';
      position: TooltipPosition;
      offset: string
    }) {
    this.buttonStyle = buttonStyle;
    this.buttonHoverStyle = buttonHoverStyle;
    if (tooltipStyle) {
      this.tooltip = tooltipStyle;
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

  private renderActionDetails(action: ActionArgs, index: number) {
    return html`
      <div class="action-item">
        <div class="action-type">
          <span class="action-type-badge">${action.type}</span>
          Action ${index + 1}
        </div>
        <div class="action-details">
          ${action.type === 'FunctionCall' ? html`
            <div class="action-detail">
              <strong>Receiver</strong>
              <span>${action.receiverId}</span>
            </div>
            <div class="action-detail">
              <strong>Method</strong>
              <span>${action.methodName}</span>
            </div>
            <div class="action-detail">
              <strong>Gas</strong>
              <span>${action.gas || 'Not specified'}</span>
            </div>
            <div class="action-detail">
              <strong>Deposit</strong>
              <span>${action.deposit || '0'}</span>
            </div>
            <div class="action-detail no-border">
              <strong>Arguments</strong>
              <span>
                <pre class="code-block"><code>${JSON.stringify(action.args, null, 2)}</code></pre>
              </span>
            </div>
          ` : action.type === 'Transfer' ? html`
            <div class="action-detail">
              <strong>Receiver</strong>
              <span>${action.receiverId}</span>
            </div>
            <div class="action-detail">
              <strong>Amount</strong>
              <span>${action.amount}</span>
            </div>
          ` : action.type === 'Stake' ? html`
            <div class="action-detail">
              <strong>Public Key</strong>
              <span>${action.publicKey}</span>
            </div>
            <div class="action-detail">
              <strong>Amount</strong>
              <span>${action.stake}</span>
            </div>
          ` : action.type === 'AddKey' ? html`
            <div class="action-detail">
              <strong>Public Key</strong>
              <span>${action.publicKey}</span>
            </div>
            <div class="action-detail">
              <strong>Access Key</strong>
              <span>${JSON.stringify(action.accessKey, null, 2)}</span>
            </div>
          ` : action.type === 'DeleteKey' ? html`
            <div class="action-detail">
              <strong>Public Key</strong>
              <span>${action.publicKey}</span>
            </div>
          ` : action.type === 'DeleteAccount' ? html`
            <div class="action-detail">
              <strong>Beneficiary</strong>
              <span>${action.beneficiaryId}</span>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  render() {
    console.log('[EmbeddedTxConfirm Lit] Rendering with:', {
      nearAccountId: this.nearAccountId,
      actionArgs: this.actionArgs,
      loading: this.loading
    });

    if (!this.actionArgs) return html`<div>Loading...</div>`;

    const actions = Array.isArray(this.actionArgs) ? this.actionArgs : [this.actionArgs];

    return html`
      <div class="embedded-confirm-container">
        <button
          class="btn"
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
          <div class="action-list">
            ${actions.map((action, index) => this.renderActionDetails(action, index))}
          </div>
        </div>
      </div>
    `;
  }
}

// Define the custom element
customElements.define('embedded-tx-confirm', EmbeddedTxConfirmElement);

// Export default only to avoid name collision with React wrapper export
export default EmbeddedTxConfirmElement;
