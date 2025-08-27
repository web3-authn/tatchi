import { LitElement, html, css } from 'lit';
import IframeClipPathGenerator from './IframeClipPathGenerator';
import { ref, createRef, Ref } from 'lit/directives/ref.js';

import type { ActionArgs, TransactionInput } from '../../../types/actions';
import type { ActionHooksOptions } from '../../../types/passkeyManager';
import { signTransactionsWithActionsInternal, sendTransaction } from '../../../PasskeyManager/actions';
import { toAccountId } from '../../../types/accountIds';
import { EMBEDDED_TX_BUTTON_ID, IFRAME_BUTTON_ID } from './constants';

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
  tagName: string; // Custom element tag name for the embedded button
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
// ClipPathGenerator moved to IframeClipPathGenerator.ts

/**
 * Lit component that hosts the SecureTxConfirmButton iframe and manages all iframe communication.
 */
export class IframeButton extends LitElement {
  static properties = {
    nearAccountId: {
      type: String,
      attribute: 'near-account-id'
    },
    txSigningRequests: {
      type: Array,
      hasChanged(newVal: any, oldVal: any) {
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
    options: {
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
  declare txSigningRequests: TransactionInput[];

  declare color: string;
  declare buttonStyle: Record<string, string | number>;
  declare buttonHoverStyle: Record<string, string | number>;
  declare tooltipStyle: TooltipStyle;
  declare showLoading: boolean;
  declare options: ActionHooksOptions;
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
    this.txSigningRequests = [];

    this.buttonStyle = {};
    this.buttonHoverStyle = {};
    this.tooltipStyle = {
      width: '280px',
      height: '300px',
      position: 'top-center',
      offset: '8px'
    };
    this.showLoading = false;
    this.options = {};
    this.passkeyManagerContext = null;
  }

  static styles = css`
    :host {
      display: block;
      position: relative;
    }

    .iframe-button {
      position: relative;
      padding: 0;
      margin: 0;
      display: inline-block;
      cursor: pointer;
      z-index: 1001;
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
      console.warn('[IframeButton] clip-path not supported, using rectangular iframe');
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
            console.debug('[SecureTxConfirmButton iframe] Applied precise positioning:', data.buttonPosition);
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
            console.debug('[SecureTxConfirmButton iframe] Received SET_TX_DATA:', payload);

            if (el.updateProperties) {
              el.updateProperties({
                nearAccountId: payload.nearAccountId,
                txSigningRequests: payload.txSigningRequests
              });
            } else {
              el.nearAccountId = payload.nearAccountId;
              el.txSigningRequests = payload.txSigningRequests;
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
        const tag = data.tagName || 'embedded-tx-button';
        console.debug(`[IframeButton] Waiting for ${tag} to be defined`);
        window.customElements.whenDefined(tag).then(() => {
          try {
            window.parent.postMessage({ type: 'ETX_DEFINED' }, '*');
          } catch {}
        });
      }
    };

    // Return the function call as a string with typed data
    return `(${initFunction.toString()})(${JSON.stringify(initData)});`;
  }

  private generateIframeButtonAndTooltip() {
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

    const tagName = EMBEDDED_TX_BUTTON_ID;

    return `<!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <style>html,body{margin:0;padding:0;background:transparent}</style>
          <script type="module" src="/sdk/embedded/${tagName}.js"></script>
        </head>
        <body>
          <${tagName} id="etx"></${tagName}>
          <script type="module">
            ${this.createIframeInitScript({ ...initData, tagName })}
          </script>
        </body>
      </html>`;
  }

  private initializeIframe() {
    if (!this.iframeRef.value) return;

    const html = this.generateIframeButtonAndTooltip();
    (this.iframeRef.value as any).srcdoc = html;

    // Set up message handling
    this.setupMessageHandling();
  }

  private updateIframeViaPostMessage(changedProperties: Map<string, any>) {
    if (!this.iframeRef.value?.contentWindow) return;

    if (changedProperties.has('nearAccountId') || changedProperties.has('txSigningRequests')) {
      this.iframeRef.value.contentWindow.postMessage({
        type: 'SET_TX_DATA',
        payload: {
          nearAccountId: this.nearAccountId,
          txSigningRequests: this.txSigningRequests
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
        console.error('[IframeButton iframe]', type, payload);
        return;
      }

      if (type === 'ETX_DEFINED') {
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
            txSigningRequests: this.txSigningRequests
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
    // console.debug('[IframeButton] Applied optimistic clip-path to prevent blocking:', optimisticClipPath);
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
      // Restore to calculated size when tooltip is hidden
      const iframe = this.iframeRef.value;
      if (iframe) {
        const size = this.calculateIframeSize();
        iframe.style.width = `${size.width}px`;
        iframe.style.height = `${size.height}px`;
      }
    } else {
      // When tooltip is visible, expand iframe to fit measured geometry
      const iframe = this.iframeRef.value;
      if (iframe) {
        const padding = 8; // small safety margin
        const maxRight = Math.max(
          geometry.button.x + geometry.button.width,
          geometry.tooltip.x + geometry.tooltip.width
        );
        const maxBottom = Math.max(
          geometry.button.y + geometry.button.height,
          geometry.tooltip.y + geometry.tooltip.height
        );

        // Keep at least the precomputed size to avoid shrinking jitter
        const fallback = this.calculateIframeSize();
        const newWidth = Math.max(fallback.width, Math.ceil(maxRight) + padding);
        const newHeight = Math.max(fallback.height, Math.ceil(maxBottom) + padding);

        iframe.style.width = `${newWidth}px`;
        iframe.style.height = `${newHeight}px`;
      }
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
      const unionClipPath = IframeClipPathGenerator.generateUnion(this.currentGeometry);

      if (unionClipPath) {
        this.iframeRef.value.style.clipPath = unionClipPath;
        this.iframeRef.value.classList.add('interactive');
      }
    } catch (error) {
      console.error('[IframeButton] Error generating button+tooltip clip-path:', error);
      // Fallback to button-only clip-path
      this.applyButtonOnlyClipPath();
    }
  }

  private async handleConfirm() {
    if (!this.passkeyManagerContext || !this.nearAccountId || !this.txSigningRequests || this.txSigningRequests.length === 0) {
      this.onError?.(new Error('Missing required data for transaction'));
      return;
    }

    console.log("txSigningRequests>>>>>>>", this.txSigningRequests);

    // Signal loading
    this.iframeRef.value?.contentWindow?.postMessage({
      type: 'SET_LOADING',
      payload: true
    }, '*');

    try {
      this.options?.hooks?.beforeCall?.();

      const signedTxs = await signTransactionsWithActionsInternal({
        context: this.passkeyManagerContext,
        nearAccountId: toAccountId(this.nearAccountId),
        transactionInputs: this.txSigningRequests.map(tx => ({
          receiverId: tx.receiverId,
          actions: tx.actions
        })),
        options: {
          onEvent: this.options?.onEvent,
          onError: this.options?.onError,
          hooks: this.options?.hooks,
          waitUntil: this.options?.waitUntil,
        },
        confirmationConfigOverride: {
          uiMode: 'embedded',
          behavior: 'autoProceed',
          autoProceedDelay: 0
        }
      });

      const actionResult = await sendTransaction({
        context: this.passkeyManagerContext,
        signedTransaction: signedTxs[0].signedTransaction,
        options: {
          onEvent: this.options?.onEvent,
          hooks: this.options?.hooks,
          waitUntil: this.options?.waitUntil,
        }
      });

      this.options?.hooks?.afterCall?.(true, actionResult);
      this.onSuccess?.(actionResult);

    } catch (err) {
      this.options?.onError?.(err as any);
      this.onError?.(err as any);

    } finally {
      this.iframeRef.value?.contentWindow?.postMessage({
        type: 'SET_LOADING',
        payload: false
      }, '*');
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
      <div class="iframe-button"
        style="width: ${this.toPx(buttonSize.width)}; height: ${this.toPx(buttonSize.height)};"
      >
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
customElements.define(IFRAME_BUTTON_ID, IframeButton);

export default IframeButton;
