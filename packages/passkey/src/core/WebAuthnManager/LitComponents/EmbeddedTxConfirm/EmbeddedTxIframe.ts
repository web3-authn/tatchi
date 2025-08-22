import { LitElement, html, css } from 'lit';
import { ref, createRef, Ref } from 'lit/directives/ref.js';
import type { ActionArgs } from '../../../types/actions';
import type { ActionHooksOptions } from '../../../types/passkeyManager';
import { executeActionInternal } from '../../../PasskeyManager/actions';
import { toAccountId } from '../../../types/accountIds';

export type TooltipPosition =
  | 'top-left' | 'top-center' | 'top-right'
  | 'left' | 'right'
  | 'bottom-left' | 'bottom-center' | 'bottom-right';

export interface TooltipStyle {
  width: string;
  height: string;
  position: TooltipPosition;
  offset: string;
}

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

export interface IframeInitData {
  size: { width: string; height: string };
  tooltip: { width: string; height: string; position: string; offset: string };
  buttonPosition: { x: number; y: number }; // Precise button position inside iframe
  backgroundColor: string; // Button background color for consistent CSS
}

export interface IframeMessage {
  type: 'READY'
  | 'SET_TX_DATA'
  | 'SET_LOADING'
  | 'SET_STYLE'
  | 'CONFIRM'
  | 'IFRAME_ERROR'
  | 'IFRAME_UNHANDLED_REJECTION'
  | 'ETX_DEFINED'
  | 'INIT_GEOMETRY'
  | 'TOOLTIP_STATE'
  | 'BUTTON_HOVER';
  payload?: any;
}

/**
 * ClipPathGenerator creates precise clip-path polygons for button + tooltip unions.
 * Supports all 8 tooltip positions with optimized shape algorithms.
 */
class ClipPathGenerator {
  /**
   * Generate a clip-path polygon that covers the union of button and tooltip
   */
  static generateUnion(geometry: TooltipGeometry): string {
    const { button, tooltip, position, gap } = geometry;

    // Check for clip-path support
    if (!CSS.supports('clip-path: polygon(0 0)')) {
      console.warn('clip-path not supported, skipping shape generation');
      return '';
    }

    switch (position) {
      case 'top-left':
        return this.generateTopLeftUnion(button, tooltip, gap);
      case 'top-center':
        return this.generateTopCenterUnion(button, tooltip, gap);
      case 'top-right':
        return this.generateTopRightUnion(button, tooltip, gap);
      case 'left':
        return this.generateLeftUnion(button, tooltip, gap);
      case 'right':
        return this.generateRightUnion(button, tooltip, gap);
      case 'bottom-left':
        return this.generateBottomLeftUnion(button, tooltip, gap);
      case 'bottom-center':
        return this.generateBottomCenterUnion(button, tooltip, gap);
      case 'bottom-right':
        return this.generateBottomRightUnion(button, tooltip, gap);
      default:
        console.warn(`Unknown tooltip position: ${position}`);
        return this.generateTopCenterUnion(button, tooltip, gap);
    }
  }

  /**
   * Generate vertical capsule for top-center and bottom-center positions
   */
  private static generateTopCenterUnion(button: Rectangle, tooltip: Rectangle, gap: number): string {
    const minX = Math.min(button.x, tooltip.x);
    const maxX = Math.max(button.x + button.width, tooltip.x + tooltip.width);
    const minY = tooltip.y;
    const maxY = button.y + button.height;

    const borderRadius = 2; // Smaller radius to avoid clipping button corners
    const width = maxX - minX;
    const height = maxY - minY;

    return `polygon(${this.createRoundedRect(minX, minY, width, height, borderRadius)})`;
  }

  private static generateBottomCenterUnion(button: Rectangle, tooltip: Rectangle, gap: number): string {
    const minX = Math.min(button.x, tooltip.x);
    const maxX = Math.max(button.x + button.width, tooltip.x + tooltip.width);
    const minY = button.y;
    const maxY = tooltip.y + tooltip.height;

    const borderRadius = 2; // Smaller radius to avoid clipping button corners
    const width = maxX - minX;
    const height = maxY - minY;

    return `polygon(${this.createRoundedRect(minX, minY, width, height, borderRadius)})`;
  }

  /**
   * Generate horizontal capsule for left and right positions
   */
  private static generateLeftUnion(button: Rectangle, tooltip: Rectangle, gap: number): string {
    const minX = tooltip.x;
    const maxX = button.x + button.width;
    const minY = Math.min(button.y, tooltip.y);
    const maxY = Math.max(button.y + button.height, tooltip.y + tooltip.height);

    const borderRadius = 2; // Smaller radius to avoid clipping button corners
    const width = maxX - minX;
    const height = maxY - minY;

    return `polygon(${this.createRoundedRect(minX, minY, width, height, borderRadius)})`;
  }

  private static generateRightUnion(button: Rectangle, tooltip: Rectangle, gap: number): string {
    const minX = button.x;
    const maxX = tooltip.x + tooltip.width;
    const minY = Math.min(button.y, tooltip.y);
    const maxY = Math.max(button.y + button.height, tooltip.y + tooltip.height);

    const borderRadius = 2; // Smaller radius to avoid clipping button corners
    const width = maxX - minX;
    const height = maxY - minY;

    return `polygon(${this.createRoundedRect(minX, minY, width, height, borderRadius)})`;
  }

  /**
   * Generate L-shaped corridors for corner positions
   */
  private static generateTopLeftUnion(button: Rectangle, tooltip: Rectangle, gap: number): string {
    return this.generateLShapedUnion(button, tooltip, gap, 'top-left');
  }

  private static generateTopRightUnion(button: Rectangle, tooltip: Rectangle, gap: number): string {
    return this.generateLShapedUnion(button, tooltip, gap, 'top-right');
  }

  private static generateBottomLeftUnion(button: Rectangle, tooltip: Rectangle, gap: number): string {
    return this.generateLShapedUnion(button, tooltip, gap, 'bottom-left');
  }

  private static generateBottomRightUnion(button: Rectangle, tooltip: Rectangle, gap: number): string {
    return this.generateLShapedUnion(button, tooltip, gap, 'bottom-right');
  }

  /**
   * Create L-shaped union for corner tooltip positions
   */
  private static generateLShapedUnion(
    button: Rectangle,
    tooltip: Rectangle,
    gap: number,
    corner: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
  ): string {
    // For now, use a simple bounding rectangle approach
    const minX = Math.min(button.x, tooltip.x);
    const maxX = Math.max(button.x + button.width, tooltip.x + tooltip.width);
    const minY = Math.min(button.y, tooltip.y);
    const maxY = Math.max(button.y + button.height, tooltip.y + tooltip.height);

    const borderRadius = 2; // Smaller radius to avoid clipping button corners
    const width = maxX - minX;
    const height = maxY - minY;

    return `polygon(${this.createRoundedRect(minX, minY, width, height, borderRadius)})`;
  }

  /**
   * Generate polygon points for rounded rectangle
   */
  public static createRoundedRect(
    x: number, y: number, width: number, height: number, radius: number
  ): string {
    // Clamp radius to prevent overlapping corners
    const r = Math.min(radius, width / 2, height / 2);

    return [
      `${Math.round(x + r)}px ${Math.round(y)}px`,
      `${Math.round(x + width - r)}px ${Math.round(y)}px`,
      `${Math.round(x + width)}px ${Math.round(y + r)}px`,
      `${Math.round(x + width)}px ${Math.round(y + height - r)}px`,
      `${Math.round(x + width - r)}px ${Math.round(y + height)}px`,
      `${Math.round(x + r)}px ${Math.round(y + height)}px`,
      `${Math.round(x)}px ${Math.round(y + height - r)}px`,
      `${Math.round(x)}px ${Math.round(y + r)}px`
    ].join(', ');
  }
}

/**
 * Lit component that hosts the EmbeddedTxConfirm iframe and manages all iframe communication.
 * This replaces the hacky string injection approach with a proper Lit component.
 */
export class EmbeddedTxConfirmHost extends LitElement {
  static properties = {
    nearAccountId: {
      type: String,
      attribute: 'near-account-id'
    },
    actionArgs: {
      type: Object,
      hasChanged(newVal: any, oldVal: any) {
        // Deep comparison for actionArgs to trigger proper updates
        return JSON.stringify(newVal) !== JSON.stringify(oldVal);
      }
    },
    color: { type: String },
    buttonStyle: {
      type: Object,
      hasChanged(newVal: any, oldVal: any) {
        return JSON.stringify(newVal) !== JSON.stringify(oldVal);
      }
    },
    buttonHoverStyle: {
      type: Object,
      hasChanged(newVal: any, oldVal: any) {
        return JSON.stringify(newVal) !== JSON.stringify(oldVal);
      }
    },
    tooltipStyle: {
      type: Object,
      hasChanged(newVal: any, oldVal: any) {
        return JSON.stringify(newVal) !== JSON.stringify(oldVal);
      }
    },
    showLoading: {
      type: Boolean,
      attribute: 'show-loading'
    },
    actionOptions: {
      type: Object,
      hasChanged(newVal: any, oldVal: any) {
        return JSON.stringify(newVal) !== JSON.stringify(oldVal);
      }
    },
    passkeyManagerContext: {
      type: Object,
      hasChanged(newVal: any, oldVal: any) {
        return JSON.stringify(newVal) !== JSON.stringify(oldVal);
      }
    },
    // Event handlers
    onSuccess: { type: Object },
    onError: { type: Object },
    onCancel: { type: Object }
  } as const;

  private iframeInitialized = false;
  private currentGeometry: TooltipGeometry | null = null;
  private clipPathSupported = false;
  private initialClipPathApplied = false;

  // Reactive properties are automatically created by Lit from static properties
  // Don't declare them as instance properties - this overrides Lit's setters!
  declare nearAccountId: string;
  declare actionArgs: ActionArgs | ActionArgs[] | null;
  declare color: string;
  declare buttonStyle: Record<string, string | number>;
  declare buttonHoverStyle: Record<string, string | number>;
  declare tooltipStyle: TooltipStyle;
  declare showLoading: boolean;
  declare actionOptions: ActionHooksOptions;
  declare passkeyManagerContext: any;

  // Event handlers (not reactive properties)
  onSuccess?: (result: any) => void;
  onError?: (error: Error) => void;
  onCancel?: () => void;

  private iframeRef: Ref<HTMLIFrameElement> = createRef();

  // Message handler reference for proper cleanup
  private messageHandler?: (event: MessageEvent) => void;

  constructor() {
    super();
    // Initialize default values for reactive properties
    this.nearAccountId = '';
    this.actionArgs = null;
    this.buttonStyle = {};
    this.buttonHoverStyle = {};
    this.tooltipStyle = {
      width: '280px',
      height: '300px',
      position: 'top-center',
      offset: '8px'
    };
    this.showLoading = false;
    this.actionOptions = {};
    this.passkeyManagerContext = null;
  }

  static styles = css`
    :host {
      display: block;
      position: relative;
    }

    .embedded-confirm-button-placeholder {
      position: relative;
      display: inline-block;
      cursor: pointer;
      z-index: 1001;
    }

    .embedded-confirm-button-placeholder {
      padding: 0;
      margin: 0;
      display: block;
    }

    iframe {
      border: none;
      background: transparent;
      position: absolute;
      z-index: 1000;
    }

    /* Flush positioning classes for different tooltip positions */
    iframe.flush-top-left { top: 0; left: 0; }
    iframe.flush-top-center { top: 0; left: 50%; transform: translateX(-50%); }
    iframe.flush-top-right { top: 0; right: 0; }
    iframe.flush-left { top: 50%; left: 0; transform: translateY(-50%); }
    iframe.flush-right { top: 50%; right: 0; transform: translateY(-50%); }
    iframe.flush-bottom-left { bottom: 0; left: 0; }
    iframe.flush-bottom-center { bottom: 0; left: 50%; transform: translateX(-50%); }
    iframe.flush-bottom-right { bottom: 0; right: 0; }
  `;

  connectedCallback() {
    super.connectedCallback();
    this.setupClipPathSupport();
  }

  private setupClipPathSupport() {
    this.clipPathSupported = CSS.supports('clip-path: polygon(0 0)');
    if (!this.clipPathSupported) {
      console.warn('[EmbeddedTxConfirmHost] clip-path not supported, using rectangular iframe');
    }
  }

  updated(changedProperties: Map<string, any>) {
    super.updated(changedProperties);

    // Only initialize iframe once, then use postMessage for updates
    if (!this.iframeInitialized) {
      this.initializeIframe();
      this.iframeInitialized = true;
    } else {
      // Use postMessage to update iframe properties instead of recreating HTML
      this.updateIframeViaPostMessage(changedProperties);
    }
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

  private calculateIframeSize() {
    const buttonWidth = this.parsePixelValue(this.buttonStyle?.width || '200px');
    const buttonHeight = this.parsePixelValue(this.buttonStyle?.height || '48px');
    const tooltipWidth = this.parsePixelValue(this.tooltipStyle.width);
    // Special case: tooltip height can be 'auto', so we provide a fallback value for iframe calculations
    const tooltipHeight = this.tooltipStyle.height === 'auto' ? 200 : this.parsePixelValue(this.tooltipStyle.height);
    const offset = this.parsePixelValue(this.tooltipStyle.offset);

    const padding = 8; // Minimal padding for safety

    let iframeWidth: number;
    let iframeHeight: number;
    let flushClass: string;
    let buttonPositionX: number; // Button position inside iframe
    let buttonPositionY: number;

    switch (this.tooltipStyle.position) {
      case 'top-left':
        // Iframe sits flush with bottom-left of placeholder, extends up and right
        iframeWidth = Math.max(buttonWidth, tooltipWidth) + padding;
        iframeHeight = buttonHeight + offset + tooltipHeight + padding;
        flushClass = 'flush-bottom-left';
        buttonPositionX = 0; // Button at left edge
        buttonPositionY = tooltipHeight + offset; // Button below tooltip
        break;

      case 'top-center':
        // Iframe sits flush with bottom-center of placeholder, extends up
        iframeWidth = Math.max(buttonWidth, tooltipWidth) + padding;
        iframeHeight = buttonHeight + offset + tooltipHeight + padding;
        flushClass = 'flush-bottom-center';
        buttonPositionX = (iframeWidth - buttonWidth) / 2; // Center button
        buttonPositionY = tooltipHeight + offset; // Button below tooltip
        break;

      case 'top-right':
        // Iframe sits flush with bottom-right of placeholder, extends up and left
        iframeWidth = Math.max(buttonWidth, tooltipWidth) + padding;
        iframeHeight = buttonHeight + offset + tooltipHeight + padding;
        flushClass = 'flush-bottom-right';
        buttonPositionX = iframeWidth - buttonWidth; // Button at right edge
        buttonPositionY = tooltipHeight + offset; // Button below tooltip
        break;

      case 'left':
        // Iframe sits flush with right-center of placeholder, extends left
        iframeWidth = tooltipWidth + offset + buttonWidth + padding;
        iframeHeight = Math.max(buttonHeight, tooltipHeight) + padding;
        flushClass = 'flush-right';
        buttonPositionX = tooltipWidth + offset; // Button to right of tooltip
        buttonPositionY = (iframeHeight - buttonHeight) / 2; // Center button vertically
        break;

      case 'right':
        // Iframe sits flush with left-center of placeholder, extends right
        iframeWidth = buttonWidth + offset + tooltipWidth + padding;
        iframeHeight = Math.max(buttonHeight, tooltipHeight) + padding;
        flushClass = 'flush-left';
        buttonPositionX = 0; // Button to left of tooltip
        buttonPositionY = (iframeHeight - buttonHeight) / 2; // Center button vertically
        break;

      case 'bottom-left':
        // Iframe sits flush with top-left of placeholder, extends down and right
        iframeWidth = Math.max(buttonWidth, tooltipWidth) + padding;
        iframeHeight = buttonHeight + offset + tooltipHeight + padding;
        flushClass = 'flush-top-left';
        buttonPositionX = 0; // Button at left edge
        buttonPositionY = 0; // Button above tooltip
        break;

      case 'bottom-center':
        // Iframe sits flush with top-center of placeholder, extends down
        iframeWidth = Math.max(buttonWidth, tooltipWidth) + padding;
        iframeHeight = buttonHeight + offset + tooltipHeight + padding;
        flushClass = 'flush-top-center';
        buttonPositionX = (iframeWidth - buttonWidth) / 2; // Center button
        buttonPositionY = 0; // Button above tooltip
        break;

      case 'bottom-right':
        // Iframe sits flush with top-right of placeholder, extends down and left
        iframeWidth = Math.max(buttonWidth, tooltipWidth) + padding;
        iframeHeight = buttonHeight + offset + tooltipHeight + padding;
        flushClass = 'flush-top-right';
        buttonPositionX = iframeWidth - buttonWidth; // Button at right edge
        buttonPositionY = 0; // Button above tooltip
        break;

      default:
        // Fallback for unknown positions
        console.warn(`Unknown tooltip position: ${this.tooltipStyle.position}`);
        iframeWidth = Math.max(buttonWidth, tooltipWidth) + padding;
        iframeHeight = buttonHeight + offset + tooltipHeight + padding;
        flushClass = 'flush-top-center';
        buttonPositionX = (iframeWidth - buttonWidth) / 2;
        buttonPositionY = 0;
        break;
    }

    return {
      width: iframeWidth,
      height: iframeHeight,
      flushClass,
      buttonPositionX,
      buttonPositionY
    };
  }

  private toPx(v: string | number) {
    return typeof v === 'number' ? `${v}px` : v;
  }

  /**
   * Typed function that handles iframe initialization and communication.
   * This replaces the inline script for better type safety.
   */
  private createIframeInitScript(initData: IframeInitData) {
    // Convert function to string with proper typing
    const initFunction = (data: IframeInitData) => {
      const el = document.getElementById('etx') as any;
      if (!el) throw new Error('embedded-tx-confirm element not found');

      // Initialize component properties
      el.color = data.backgroundColor; // Use backgroundColor for consistency
      el.size = data.size;
      el.tooltip = data.tooltip;

      // Apply precise button positioning after the component is ready
      if (data.buttonPosition) {
        const applyPositioning = () => {
          const container = el.shadowRoot?.querySelector('.embedded-confirm-container');
          if (container) {
            // Remove default centering and apply precise positioning
            container.style.position = 'absolute';
            container.style.top = `${data.buttonPosition.y}px`;
            container.style.left = `${data.buttonPosition.x}px`;
            container.style.transform = 'none'; // Remove centering transform
            console.debug('[EmbeddedTxConfirm iframe] Applied precise positioning:', data.buttonPosition);
          } else {
            // Retry after a short delay if container not ready
            setTimeout(applyPositioning, 10);
          }
        };

        // Apply immediately if possible, or wait for component to be ready
        if (el.shadowRoot) {
          applyPositioning();
        } else {
          setTimeout(applyPositioning, 50);
        }
      }

      // Send ready message to parent
      window.parent.postMessage({ type: 'READY' }, '*');

      // Set up message listener for parent communication
      window.addEventListener('message', (e: MessageEvent) => {
        const { type, payload } = e.data || {};

        switch (type) {
          case 'SET_TX_DATA':
            console.debug('[EmbeddedTxConfirm iframe] Received SET_TX_DATA:', payload);

            if (el.updateProperties) {
              el.updateProperties({
                nearAccountId: payload.nearAccountId,
                actionArgs: payload.actionArgs
              });
            } else {
              el.nearAccountId = payload.nearAccountId;
              el.actionArgs = payload.actionArgs;

              // Force update since we're not using updateProperties
              if (el.requestUpdate) {
                el.requestUpdate();
              }
            }
            break;

          case 'SET_LOADING':
            if (el.updateProperties) {
              el.updateProperties({ loading: !!payload });
            } else {
              el.loading = !!payload;
            }
            break;

          case 'SET_STYLE':
            if (el.updateButtonStyles) {
              el.updateButtonStyles(
                payload.buttonStyle || {},
                payload.buttonHoverStyle || {},
                payload.tooltipStyle || {}
              );
            } else {
              el.buttonStyle = payload.buttonStyle || {};
              el.buttonHoverStyle = payload.buttonHoverStyle || {};
              if (payload.tooltipStyle) {
                el.tooltip = payload.tooltipStyle;
              }
            }
            console.debug('[EmbeddedTxConfirm iframe] Set button styles:', payload);
            break;
        }
      });

      // Forward runtime errors to parent for debugging
      window.addEventListener('error', (e: ErrorEvent) => {
        try {
          window.parent.postMessage({
            type: 'IFRAME_ERROR',
            payload: String(e?.message || e)
          }, '*');
        } catch {}
      });

      window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
        try {
          window.parent.postMessage({
            type: 'IFRAME_UNHANDLED_REJECTION',
            payload: String(e?.reason || '')
          }, '*');
        } catch {}
      });

      // Notify when custom element is defined
      if (window.customElements && window.customElements.whenDefined) {
        window.customElements.whenDefined('embedded-tx-confirm').then(() => {
          try {
            window.parent.postMessage({ type: 'ETX_DEFINED' }, '*');
          } catch {}
        });
      }
    };

    // Return the function call as a string with typed data
    return `(${initFunction.toString()})(${JSON.stringify(initData)});`;
  }

  private generateIframeHTML() {
    const buttonSize = {
      width: this.buttonStyle?.width || '200px',
      height: this.buttonStyle?.height || '48px'
    };

    const iframeSize = this.calculateIframeSize();

    const initData = {
      size: {
        width: this.toPx(buttonSize.width),
        height: this.toPx(buttonSize.height)
      },
      tooltip: {
        width: this.toPx(this.tooltipStyle.width),
        height: this.tooltipStyle.height,
        position: this.tooltipStyle.position,
        offset: this.toPx(this.tooltipStyle.offset)
      },
      buttonPosition: {
        x: iframeSize.buttonPositionX,
        y: iframeSize.buttonPositionY
      },
      backgroundColor: String(this.buttonStyle?.background || this.buttonStyle?.backgroundColor || this.color)
    };

    return `<!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <style>html,body{margin:0;padding:0;background:transparent}</style>
          <script type="module" src="/sdk/embedded/embedded-tx-confirm.js"></script>
        </head>
        <body>
          <embedded-tx-confirm id="etx"></embedded-tx-confirm>
          <script type="module">
            ${this.createIframeInitScript(initData)}
          </script>
        </body>
      </html>`;
  }

  private initializeIframe() {
    if (!this.iframeRef.value) return;

    const html = this.generateIframeHTML();
    (this.iframeRef.value as any).srcdoc = html;

    // Set up message handling
    this.setupMessageHandling();
  }

  private updateIframeViaPostMessage(changedProperties: Map<string, any>) {
    if (!this.iframeRef.value?.contentWindow) return;

    if (changedProperties.has('nearAccountId') || changedProperties.has('actionArgs')) {
      this.iframeRef.value.contentWindow.postMessage({
        type: 'SET_TX_DATA',
        payload: {
          nearAccountId: this.nearAccountId,
          actionArgs: this.actionArgs
        }
      }, '*');
    }

    if (changedProperties.has('showLoading')) {
      this.iframeRef.value.contentWindow.postMessage({
        type: 'SET_LOADING',
        payload: this.showLoading
      }, '*');
    }

    if (changedProperties.has('buttonStyle') ||
        changedProperties.has('buttonHoverStyle') ||
        changedProperties.has('tooltipStyle') ||
        changedProperties.has('color')) {
      const buttonSize = {
        width: this.buttonStyle?.width || '200px',
        height: this.buttonStyle?.height || '48px'
      };

      const mergedButtonStyle = {
        ...this.buttonStyle,
        ...buttonSize
      };

      this.iframeRef.value.contentWindow.postMessage({
        type: 'SET_STYLE',
        payload: {
          buttonStyle: mergedButtonStyle,
          buttonHoverStyle: this.buttonHoverStyle,
          tooltipStyle: this.tooltipStyle
        }
      }, '*');
    }
  }

  private setupMessageHandling() {
    if (!this.iframeRef.value) return;

    const onMessage = (e: MessageEvent) => {
      if (e.source !== this.iframeRef.value!.contentWindow) return;

      const { type, payload } = (e.data || {}) as IframeMessage;

      if (type === 'IFRAME_ERROR' || type === 'IFRAME_UNHANDLED_REJECTION') {
        console.error('[EmbeddedTxConfirmHost iframe]', type, payload);
        return;
      }

      if (type === 'ETX_DEFINED') {
        console.debug('[EmbeddedTxConfirmHost iframe] custom element defined');
        return;
      }

      if (type === 'INIT_GEOMETRY') {
        this.handleInitGeometry(payload as TooltipGeometry);
        return;
      }

      if (type === 'TOOLTIP_STATE') {
        this.handleTooltipState(payload as TooltipGeometry);
        return;
      }

      if (type === 'BUTTON_HOVER') {
        this.handleButtonHover(payload as { hovering: boolean });
        return;
      }

      if (type === 'READY') {
        this.iframeRef.value!.contentWindow?.postMessage({
          type: 'SET_TX_DATA',
          payload: {
            nearAccountId: this.nearAccountId,
            actionArgs: this.actionArgs
          }
        }, '*');

        if (typeof this.showLoading === 'boolean') {
          this.iframeRef.value!.contentWindow?.postMessage({
            type: 'SET_LOADING',
            payload: this.showLoading
          }, '*');
        }

        // Send button styles
        if (this.buttonStyle || this.buttonHoverStyle || this.tooltipStyle) {
          const buttonSize = {
            width: this.buttonStyle?.width || '200px',
            height: this.buttonStyle?.height || '48px'
          };

          const mergedButtonStyle = {
            ...this.buttonStyle,
            ...buttonSize
          };

          this.iframeRef.value!.contentWindow?.postMessage({
            type: 'SET_STYLE',
            payload: {
              buttonStyle: mergedButtonStyle,
              buttonHoverStyle: this.buttonHoverStyle,
              tooltipStyle: this.tooltipStyle
            }
          }, '*');
        }

        // Apply optimistic clip-path immediately to prevent blocking clicks
        // This will be replaced once INIT_GEOMETRY is received
        this.applyOptimisticClipPath();
      } else if (type === 'CONFIRM') {
        this.handleConfirm();
      }
    };

    // Remove previous listener if it exists
    if (this.messageHandler) {
      window.removeEventListener('message', this.messageHandler);
    }

    // Add new listener and store reference
    this.messageHandler = onMessage;
    window.addEventListener('message', onMessage);
  }

    /**
   * Apply clip-path using calculated button position before geometry is available
   */
  private applyOptimisticClipPath() {
    if (!this.iframeRef.value) return;

    const iframeSize = this.calculateIframeSize();
    const buttonWidth = this.parsePixelValue(this.buttonStyle?.width || '200px');
    const buttonHeight = this.parsePixelValue(this.buttonStyle?.height || '48px');

    // Use the calculated button position from iframe sizing
    const buttonX = iframeSize.buttonPositionX;
    const buttonY = iframeSize.buttonPositionY;

    const optimisticClipPath = `polygon(${buttonX}px ${buttonY}px, ${buttonX + buttonWidth}px ${buttonY}px, ${buttonX + buttonWidth}px ${buttonY + buttonHeight}px, ${buttonX}px ${buttonY + buttonHeight}px)`;

    this.iframeRef.value.style.clipPath = optimisticClipPath;
    this.iframeRef.value.classList.remove('interactive');
    // console.debug('[EmbeddedTxConfirmHost] Applied optimistic clip-path to prevent blocking:', optimisticClipPath);
  }

  /**
   * Force iframe re-initialization when tooltip style changes
   * This recalculates iframe size and positioning based on new tooltip dimensions
   */
  forceIframeReinitialize() {
    this.iframeInitialized = false;
    this.currentGeometry = null;
    this.initialClipPathApplied = false;

    // Re-initialize the iframe with new tooltip style
    this.initializeIframe();
    this.iframeInitialized = true;
  }

  /**
   * Handle initial geometry setup from iframe - applies button-only clip-path to prevent blocking clicks
   */
  private handleInitGeometry(geometry: TooltipGeometry) {
    this.currentGeometry = geometry;
    // Replace optimistic clip-path with precise button-only clip-path
    this.applyButtonOnlyClipPath();
  }

  /**
   * Handle combined tooltip state updates (geometry + visibility) from the iframe
   */
  private handleTooltipState(geometry: TooltipGeometry) {
    this.currentGeometry = geometry;
    // Apply appropriate clip-path based on visibility state
    if (!geometry.visible) {
      this.applyButtonOnlyClipPath();
    } else {
      // Don't override button+tooltip clip-path when tooltip is visible (during hover)
    }
  }

  /**
   * Handle button hover state for dual clip-path management
   * - Not hovering: Clip-path restricts to button area only
   * - Hovering: Clip-path expands to include button + tooltip area
   */
  private handleButtonHover(payload: { hovering: boolean }) {
    if (!this.iframeRef.value || !this.currentGeometry) return;

    if (payload.hovering) {
      // Apply button + tooltip clip-path when hovering and enable pointer events
      this.applyButtonTooltipClipPath();
    } else {
      // Only apply button-only clip-path if tooltip is not visible
      // This allows mouse movement from button to tooltip without closing
      if (!this.currentGeometry.visible) {
        this.applyButtonOnlyClipPath();
      } else {
        // Keep the expanded clip-path and pointer events so user can reach the tooltip
      }
    }
  }

  /**
   * Apply clip-path that restricts interaction to button area only
   */
  private applyButtonOnlyClipPath() {
    if (!this.iframeRef.value || !this.currentGeometry) return;

    const { button } = this.currentGeometry;
    // Use simple rectangle to avoid clipping button corners
    const buttonClipPath = `polygon(${button.x}px ${button.y}px, ${button.x + button.width}px ${button.y}px, ${button.x + button.width}px ${button.y + button.height}px, ${button.x}px ${button.y + button.height}px)`;

    this.iframeRef.value.style.clipPath = buttonClipPath;
    // Remove pointer events to allow click-through outside button area
    this.iframeRef.value.classList.remove('interactive');
  }

  /**
   * Apply clip-path that includes both button and tooltip areas (for hover state)
   */
  private applyButtonTooltipClipPath() {
    if (!this.iframeRef.value || !this.currentGeometry) return;

    try {
      const unionClipPath = ClipPathGenerator.generateUnion(this.currentGeometry);

      if (unionClipPath) {
        this.iframeRef.value.style.clipPath = unionClipPath;
        this.iframeRef.value.classList.add('interactive');
      }
    } catch (error) {
      console.error('[EmbeddedTxConfirmHost] Error generating button+tooltip clip-path:', error);
      // Fallback to button-only clip-path
      this.applyButtonOnlyClipPath();
    }
  }

  private async handleConfirm() {
    if (!this.passkeyManagerContext || !this.nearAccountId || !this.actionArgs) {
      this.onError?.(new Error('Missing required data for transaction'));
      return;
    }

    try {
      await executeActionInternal(
        this.passkeyManagerContext,
        toAccountId(this.nearAccountId),
        this.actionArgs,
        {
          ...this.actionOptions,
                    hooks: {
            beforeCall: () => {
              this.iframeRef.value?.contentWindow?.postMessage({
                type: 'SET_LOADING',
                payload: true
              }, '*');
              this.actionOptions?.hooks?.beforeCall?.();
            },
            afterCall: (success: boolean, actionResult: any) => {
              this.iframeRef.value?.contentWindow?.postMessage({
                type: 'SET_LOADING',
                payload: false
              }, '*');
              this.actionOptions?.hooks?.afterCall?.(success, actionResult);
              if (success) {
                this.onSuccess?.(actionResult);
              }
            }
          },
          onError: (err: any) => {
            this.iframeRef.value?.contentWindow?.postMessage({
              type: 'SET_LOADING',
              payload: false
            }, '*');
            this.actionOptions?.onError?.(err);
            this.onError?.(err);
          }
        },
        {
          uiMode: 'embedded',
          behavior: 'autoProceed',
          autoProceedDelay: 0
        }
      );
    } catch (err) {
      this.iframeRef.value?.contentWindow?.postMessage({ type: 'SET_LOADING', payload: false }, '*');
      this.onError?.(err as any);
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();

    // Clean up message listener
    if (this.messageHandler) {
      window.removeEventListener('message', this.messageHandler);
      this.messageHandler = undefined;
    }
  }

  render() {
    const buttonSize = {
      width: this.buttonStyle?.width || '200px',
      height: this.buttonStyle?.height || '48px'
    };

    const iframeSize = this.calculateIframeSize();

    return html`
      <div class="embedded-confirm-button-placeholder"
        style="width: ${this.toPx(buttonSize.width)}; height: ${this.toPx(buttonSize.height)};">
        <iframe
          ${ref(this.iframeRef)}
          class="${iframeSize.flushClass}"
          style="width: ${iframeSize.width}px; height: ${iframeSize.height}px;"
          sandbox="allow-scripts allow-same-origin allow-forms allow-presentation"
        ></iframe>
      </div>
    `;
  }
}

// Define the custom element
customElements.define('embedded-tx-confirm-host', EmbeddedTxConfirmHost);

export default EmbeddedTxConfirmHost;
