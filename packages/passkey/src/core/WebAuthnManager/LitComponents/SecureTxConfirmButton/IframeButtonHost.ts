// External imports
import { html, css } from 'lit';
import { ref, createRef, Ref } from 'lit/directives/ref.js';
// SDK imports
import type { TransactionInput } from '../../../types/actions';
import { toAccountId } from '../../../types/accountIds';
import type { SignAndSendTransactionHooksOptions } from '../../../types/passkeyManager';
import { signAndSendTransactionsInternal } from '../../../PasskeyManager/actions';
// Local imports
import { LitElementWithProps } from '../LitElementWithProps';
import type { TooltipTreeStyles } from '../TooltipTxTree';
import { TOOLTIP_THEMES, type TooltipTheme } from '../TooltipTxTree/tooltip-tree-themes';
import {
  EMBEDDED_SDK_BASE_PATH,
  EMBEDDED_TX_BUTTON_ID,
  IFRAME_BOOTSTRAP_MODULE,
  IFRAME_BUTTON_ID
} from './tags';
import {
  computeExpandedIframeSizeFromGeometryPure,
  computeIframeSizePure,
  IframeClipPathGenerator,
  IframeInitData,
  IframeMessage,
  toPx,
  TooltipGeometry,
  TooltipPosition,
  utilParsePx
} from './iframe-geometry';
import { S } from 'node_modules/@near-js/transactions/lib/esm/actions-D9yOaLEz';


type MessageType = IframeMessage['type'];

type MessagePayloads = {
  READY: undefined;
  SET_INIT: IframeInitData;
  SET_TX_DATA: { nearAccountId: string; txSigningRequests: TransactionInput[] };
  SET_LOADING: boolean;
  SET_STYLE: {
    buttonStyle: Record<string, string | number>;
    buttonHoverStyle: Record<string, string | number>;
    tooltipPosition: TooltipPosition;
    tooltipTreeStyles?: TooltipTreeStyles;
  };
  CONFIRM: undefined;
  IFRAME_ERROR: string;
  IFRAME_UNHANDLED_REJECTION: string;
  ETX_DEFINED: undefined;
  POSITIONING_APPLIED: { x: number; y: number };
  REQUEST_GEOMETRY: undefined;
  INIT_GEOMETRY: TooltipGeometry;
  TOOLTIP_STATE: TooltipGeometry;
  BUTTON_HOVER: { hovering: boolean };
};

/**
 * Lit component that hosts the SecureTxConfirmButton iframe and manages all iframe communication.
 */
export class IframeButtonHost extends LitElementWithProps {
  static properties = {
    nearAccountId: {
      type: String,
      attribute: 'near-account-id'
    },
    txSigningRequests: {
      type: Array,
      // Always treat as changed so in-place mutations propagate to the iframe
      hasChanged(_newVal: any, _oldVal: any) {
        return true;
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
    tooltipPosition: {
      type: Object,
      hasChanged(newVal: any, oldVal: any) {
        return JSON.stringify(newVal) !== JSON.stringify(oldVal);
      }
    },
    tooltipTheme: {
      type: String,
      attribute: 'tooltip-theme'
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
  // Don't declare them as instance properties, this overrides Lit's setters
  declare nearAccountId: string;
  declare txSigningRequests: TransactionInput[];

  declare color: string;
  declare buttonStyle: Record<string, string | number>;
  declare buttonHoverStyle: Record<string, string | number>;
  declare tooltipPosition: TooltipPosition;
  declare tooltipTheme: TooltipTheme;
  declare showLoading: boolean;
  declare options: SignAndSendTransactionHooksOptions;
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
    this.tooltipPosition = {
      width: '280px',
      height: '300px',
      position: 'top-center',
      offset: '8px'
    };
    this.tooltipTheme = 'dark';
    this.showLoading = false;
    this.options = {};
    this.passkeyManagerContext = null;
  }

  static styles = css`
    :host {
      display: inline-block;
      position: relative;
      overflow: visible;
      /* Let host size naturally to fit content */
      width: fit-content;
      height: fit-content;
      /* Reset all spacing that could interfere */
      line-height: 0; /* ensure no extra spacing around the button */
      margin: 0;
      padding: 0;
      border: none;
      box-sizing: border-box;
    }

    .iframe-button-host {
      position: relative;
      padding: 0;
      margin: 0;
      display: inline-block;
      cursor: pointer;
      z-index: 1001;
      /* This container should size to button dimensions and provide layout footprint */
      width: var(--button-width, 200px);
      height: var(--button-height, 48px);
      overflow: visible;
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

  private calculateIframeSize() {
    const buttonWidth = utilParsePx(this.buttonStyle?.width || '200px');
    const buttonHeight = utilParsePx(this.buttonStyle?.height || '48px');
    const tooltipWidth = utilParsePx(this.tooltipPosition.width);
    // Special case: tooltip height can be 'auto', so we provide a fallback value for iframe calculations
    const tooltipHeight = this.tooltipPosition.height === 'auto' ? 200 : utilParsePx(this.tooltipPosition.height);
    const offset = utilParsePx(this.tooltipPosition.offset);

    return computeIframeSizePure({
      buttonWidthPx: buttonWidth,
      buttonHeightPx: buttonHeight,
      tooltipWidthPx: tooltipWidth,
      tooltipHeightPx: tooltipHeight,
      offsetPx: offset,
      position: this.tooltipPosition.position,
      paddingPx: 8,
    });
  }

  private buildInitData(): IframeInitData {
    const buttonSize = {
      width: this.buttonStyle?.width || '200px',
      height: this.buttonStyle?.height || '48px'
    };

    const iframeSize = this.calculateIframeSize();

    return {
      size: {
        width: toPx(buttonSize.width),
        height: toPx(buttonSize.height)
      },
      tooltip: {
        width: toPx(this.tooltipPosition.width),
        height: this.tooltipPosition.height,
        position: this.tooltipPosition.position,
        offset: toPx(this.tooltipPosition.offset)
      },
      buttonPosition: {
        x: iframeSize.buttonPositionX,
        y: iframeSize.buttonPositionY
      },
      backgroundColor: String(this.buttonStyle?.background || this.buttonStyle?.backgroundColor || this.color),
      tagName: EMBEDDED_TX_BUTTON_ID,
      targetOrigin: window.location.origin,
    };
  }

  private generateIframeHtml() {
    const embeddedTxButtonTag = EMBEDDED_TX_BUTTON_ID;
    const iframeBootstrapTag = IFRAME_BOOTSTRAP_MODULE;
    const base = EMBEDDED_SDK_BASE_PATH;
    return `<!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <style>html,body{margin:0;padding:0;background:transparent}</style>
          <script type="module" src="${base}${embeddedTxButtonTag}.js"></script>
          <script type="module" src="${base}${iframeBootstrapTag}"></script>
        </head>
        <body>
          <${embeddedTxButtonTag} id="etx"></${embeddedTxButtonTag}>
          <!-- bootstrap handled by external ${iframeBootstrapTag} module -->
        </body>
      </html>`;
  }

  private initializeIframe() {
    if (!this.iframeRef.value) return;

    const html = this.generateIframeHtml();
    const iframeEl = this.iframeRef.value as any;
    iframeEl.srcdoc = html;

    // Set up message handling
    this.setupMessageHandling();

    // Set host container to button size to prevent layout shifts
    this.setHostContainerToButtonSize();
  }

  private setHostContainerToButtonSize() {
    // Set CSS custom properties for the .iframe-button-host container
    const buttonWidth = this.buttonStyle?.width || '200px';
    const buttonHeight = this.buttonStyle?.height || '48px';

    // Set CSS custom properties that the .iframe-button-host CSS will use
    this.style.setProperty('--button-width', typeof buttonWidth === 'number' ? `${buttonWidth}px` : String(buttonWidth));
    this.style.setProperty('--button-height', typeof buttonHeight === 'number' ? `${buttonHeight}px` : String(buttonHeight));
  }

  private updateIframeViaPostMessage(changedProperties: Map<string, any>) {
    if (!this.iframeRef.value?.contentWindow) return;

    // Always push latest tx data; external apps may mutate arrays/objects in place
    // which can bypass Lit's change detection.
    this.postToIframe('SET_TX_DATA', {
      nearAccountId: this.nearAccountId,
      txSigningRequests: this.txSigningRequests
    });

    if (changedProperties.has('showLoading')) {
      this.postToIframe('SET_LOADING', this.showLoading);
    }

    if (
      changedProperties.has('buttonStyle') ||
      changedProperties.has('buttonHoverStyle') ||
      changedProperties.has('tooltipPosition') ||
      changedProperties.has('tooltipTheme') ||
      changedProperties.has('color')
    ) {
      this.postStyleUpdateToIframe();

      // Update host container size when button style changes
      if (changedProperties.has('buttonStyle')) {
        this.setHostContainerToButtonSize();
      }
    }
  }

  // === Unified message sending ===
  private getIframeWindow(): Window | null {
    return this.iframeRef.value?.contentWindow || null;
  }

  private postToIframe<T extends keyof MessagePayloads>(type: T, payload?: MessagePayloads[T]) {
    const w = this.getIframeWindow();
    if (!w) return;
    // Post to iframe; for srcdoc + allow-same-origin, this matches parent origin
    const targetOrigin = window.location.origin;
    (w as any).postMessage({ type, payload }, targetOrigin);
  }

  private postInitialStateToIframe() {
    this.postToIframe('SET_TX_DATA', {
      nearAccountId: this.nearAccountId,
      txSigningRequests: this.txSigningRequests
    });
    this.postToIframe('SET_LOADING', !!this.showLoading);
    this.postStyleUpdateToIframe();
  }

  private postStyleUpdateToIframe() {
    const buttonSize = {
      width: this.buttonStyle?.width || '200px',
      height: this.buttonStyle?.height || '48px'
    };

    const mergedButtonStyle = {
      ...this.buttonStyle,
      ...buttonSize
    };

    // Get theme styles for tooltip tree
    const themeStyles = this.getThemeStyles(this.tooltipTheme || 'dark');

    this.postToIframe('SET_STYLE', {
      buttonStyle: mergedButtonStyle,
      buttonHoverStyle: this.buttonHoverStyle,
      tooltipPosition: this.tooltipPosition,
      tooltipTreeStyles: themeStyles
    });

    // Also re-send SET_INIT to reapply precise positioning whenever the
    // button's size or tooltip position changes, keeping embedded aligned.
    this.postToIframe('SET_INIT', this.buildInitData());
  }

  private getThemeStyles(theme: TooltipTheme): TooltipTreeStyles {
    return TOOLTIP_THEMES[theme] || TOOLTIP_THEMES.dark;
  }

  private setupMessageHandling() {
    if (!this.iframeRef.value) return;

    const onMessage = (e: MessageEvent) => {
      const w = this.getIframeWindow();
      if (!w || e.source !== w) return;

      const { type, payload } = (e.data || {}) as IframeMessage;
      switch (type as MessageType) {
        case 'IFRAME_ERROR':
        case 'IFRAME_UNHANDLED_REJECTION':
          console.error('[IframeButton iframe]', type, payload);
          return;
        case 'ETX_DEFINED':
          // The embedded element is fully upgraded; send initial state now
          this.postInitialStateToIframe();
          return;
        case 'POSITIONING_APPLIED':
          // The button positioning has been applied; now we can measure geometry
          this.handlePositioningApplied(payload as { x: number; y: number });
          return;
        case 'INIT_GEOMETRY':
          this.handleInitGeometry(payload as MessagePayloads['INIT_GEOMETRY']);
          return;
        case 'TOOLTIP_STATE':
          this.handleTooltipState(payload as MessagePayloads['TOOLTIP_STATE']);
          return;
        case 'BUTTON_HOVER':
          this.handleButtonHover(payload as MessagePayloads['BUTTON_HOVER']);
          return;
        case 'READY':
          // Send only SET_INIT on READY so the iframe can position accurately.
          // Defer data/style until ETX_DEFINED to avoid upgrade races.
          this.postToIframe('SET_INIT', {
            ...this.buildInitData(),
            // Provide parent origin for tighter child->parent messaging
            targetOrigin: window.location.origin
          } as any);
          // Apply optimistic clip-path immediately to prevent blocking clicks
          // This will be replaced once INIT_GEOMETRY is received
          this.applyOptimisticClipPath();
          return;
        case 'CONFIRM':
          this.handleConfirm();
          return;
        default:
          return;
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
    const buttonWidth = utilParsePx(this.buttonStyle?.width || '200px');
    const buttonHeight = utilParsePx(this.buttonStyle?.height || '48px');

    // Use the calculated button position from iframe sizing
    const buttonX = iframeSize.buttonPositionX;
    const buttonY = iframeSize.buttonPositionY;

    const optimisticClipPath = `polygon(${buttonX}px ${buttonY}px, ${buttonX + buttonWidth}px ${buttonY}px, ${buttonX + buttonWidth}px ${buttonY + buttonHeight}px, ${buttonX}px ${buttonY + buttonHeight}px)`;

    this.iframeRef.value.style.clipPath = optimisticClipPath;
    this.iframeRef.value.classList.remove('interactive');
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
   * Handle positioning applied notification from iframe, triggers geometry measurement
   */
  private handlePositioningApplied(buttonPosition?: { x: number; y: number }) {
    // Now that positioning is applied, request geometry measurement from iframe
    this.postToIframe('REQUEST_GEOMETRY');
  }

  /**
   * Handle initial geometry setup from iframe
   * Applies button-only clip-path to prevent blocking clicks
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
        const fallback = this.calculateIframeSize();
        const size = computeExpandedIframeSizeFromGeometryPure({ geometry, fallback, paddingPx: 8 });
        iframe.style.width = `${size.width}px`;
        iframe.style.height = `${size.height}px`;
      }

      // CRITICAL: Update clip-path when tooltip dimensions change
      // This handles tooltip expansion/contraction while visible
      this.applyButtonTooltipClipPath();
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
    if (!this.clipPathSupported) return;

    const { button } = this.currentGeometry;
    // Use simple rectangle to avoid clipping button corners
    const buttonClipPath = IframeClipPathGenerator.buildButtonClipPathPure(button);

    this.iframeRef.value.style.clipPath = buttonClipPath;
    // Remove pointer events to allow click-through outside button area
    this.iframeRef.value.classList.remove('interactive');
  }

  /**
   * Apply clip-path that includes both button and tooltip areas (for hover state)
   */
  private applyButtonTooltipClipPath() {
    if (!this.iframeRef.value || !this.currentGeometry) return;
    if (!this.clipPathSupported) return;

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

    // Signal loading
    this.postToIframe('SET_LOADING', true);

    try {
      this.options?.hooks?.beforeCall?.();

      const txResults = await signAndSendTransactionsInternal({
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
          executeSequentially: this.options?.executeSequentially
        },
        confirmationConfigOverride: {
          uiMode: 'embedded',
          behavior: 'autoProceed',
          autoProceedDelay: 0
        }
      });

      this.options?.hooks?.afterCall?.(true, txResults);
      this.onSuccess?.(txResults);

    } catch (err) {
      this.options?.onError?.(err as any);
      this.onError?.(err as any);

    } finally {
      this.postToIframe('SET_LOADING', false);
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
      <div class="iframe-button-host"
        style="width: ${toPx(buttonSize.width)}; height: ${toPx(buttonSize.height)};"
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
customElements.define(IFRAME_BUTTON_ID, IframeButtonHost);

export default IframeButtonHost;
