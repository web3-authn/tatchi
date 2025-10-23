// External imports
import { html, css, type PropertyValues } from 'lit';
import { ref, createRef, Ref } from 'lit/directives/ref.js';
// SDK imports
import type { TransactionInput } from '../../../types/actions';
import type { SignAndSendTransactionHooksOptions, ActionResult } from '../../../types/passkeyManager';
import { onEmbeddedBaseChange } from '../../../sdkPaths';
// Local imports
import { LitElementWithProps, CSSProperties } from '../LitElementWithProps';
import type { TxTreeStyles } from '../TxTree';
import { TX_TREE_THEMES, type TxTreeTheme } from '../TxTree/tx-tree-themes';
import { EMBEDDED_TX_BUTTON_THEMES, type EmbeddedTxButtonTheme } from './button-with-tooltip-themes';
import { W3A_BUTTON_WITH_TOOLTIP_ID, IFRAME_TX_BUTTON_BOOTSTRAP_MODULE, defineTag } from '../tags';
import { resolveEmbeddedBase } from '../asset-base';
import {
  computeExpandedIframeSizeFromGeometryPure,
  computeIframeSizePure,
  IframeClipPathGenerator,
  toPx,
  TooltipGeometry,
  TooltipPositionInternal,
  utilParsePx
} from './iframe-geometry';
import {
  IframeInitData,
  IframeButtonMessageType,
  IframeButtonMessagePayloads,
  IframeButtonMessage,
} from '../common/iframe-messages'

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
      hasChanged(_newVal: TransactionInput[], _oldVal: TransactionInput[]) {
        return true;
      }
    },
    color: { type: String },
    // Optional fallback text when no slotted content is provided
    buttonTextElement: { type: String },
    buttonStyle: {
      type: Object,
      hasChanged(newVal: CSSProperties, oldVal: CSSProperties) {
        return JSON.stringify(newVal) !== JSON.stringify(oldVal);
      }
    },
    buttonHoverStyle: {
      type: Object,
      hasChanged(newVal: CSSProperties, oldVal: CSSProperties) {
        return JSON.stringify(newVal) !== JSON.stringify(oldVal);
      }
    },
    tooltipPosition: {
      type: Object,
      hasChanged(newVal: TooltipPositionInternal, oldVal: TooltipPositionInternal) {
        return JSON.stringify(newVal) !== JSON.stringify(oldVal);
      }
    },
    txTreeTheme: {
      type: String,
      attribute: 'tooltip-theme'
    },
    showLoading: {
      type: Boolean,
      attribute: 'show-loading'
    },
    options: {
      type: Object,
      hasChanged(newVal: SignAndSendTransactionHooksOptions, oldVal: SignAndSendTransactionHooksOptions) {
        return JSON.stringify(newVal) !== JSON.stringify(oldVal);
      }
    },
    // Event handlers
    onSuccess: { type: Object },
    onCancel: { type: Object },
    onLoadTouchIdPrompt: { type: Object },
    externalConfirm: { type: Object },
  } as const;

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
      /* Background defaults to transparent to avoid any dark overlay on mobile */
      background: transparent;
      border-radius: 1rem;
      border: none;
      box-shadow: none;
      transition: none;
      transform: none;
      width: var(--button-width, 200px);
      height: var(--button-height, 48px);
      overflow: visible;
    }

    /* Host-driven hover/focus visuals are injected per-instance via a scoped stylesheet. */
    .iframe-button-host[data-focused="true"] {
      /* default minimal focus outline; can be overridden by scoped styles */
      outline: none;
    }

    /* Visual label rendered by host beneath the iframe */
    .host-button-visual {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      display: grid;
      place-items: center;
      pointer-events: none; /* allow iframe to capture events */
      color: inherit;
      font-size: inherit;
      font-weight: inherit;
      user-select: none;
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

  private iframeInitialized = false;
  private currentGeometry: TooltipGeometry | null = null;
  private clipPathSupported = false;
  private iframeRef: Ref<HTMLIFrameElement> = createRef();
  private hostRef: Ref<HTMLDivElement> = createRef();
  private tooltipVisible: boolean = false;
  // Track applied dynamic styles so we can update/remove cleanly
  private styleScopeClass = `w3a-host-${Math.random().toString(36).slice(2)}`;
  private scopedSheet: CSSStyleSheet | null = null;
  private scopedStyleEl?: HTMLStyleElement;
  // (optional) event hook; not used for gating init anymore
  private onAssetsBaseSet = () => {
    // Reinitialize to pick up the new embedded base path set by the wallet host
    try {
      this.iframeInitialized = false;
      this.initializeIframe();
      this.iframeInitialized = true;
    } catch {}
  };
  private onDocPointerDown = (ev: PointerEvent) => {
    // Click-away to close tooltip when visible
    if (!this.tooltipVisible) return;
    const hostEl = this.hostRef.value;
    if (!hostEl) return;
    const target = ev.target as Node | null;
    if (target && hostEl.contains(target)) {
      // Click occurred inside the host/iframe area; ignore
      return;
    }
    // Hide tooltip in iframe
    this.postToIframe('SET_TOOLTIP_VISIBILITY', false);
  };

  // Reactive properties are automatically created by Lit from static properties
  // Don't declare them as instance properties, this overrides Lit's setters
  declare nearAccountId: string;
  declare txSigningRequests: TransactionInput[];

  declare color: string;
  declare buttonTextElement: string;
  declare buttonStyle: Record<string, string | number>;
  declare buttonHoverStyle: Record<string, string | number>;
  declare tooltipPosition: TooltipPositionInternal;
  declare txTreeTheme: EmbeddedTxButtonTheme;
  declare showLoading: boolean;
  declare options: SignAndSendTransactionHooksOptions;
  // Optional external confirm handler (e.g., to route via wallet iframe)
  declare externalConfirm?: (args: {
    nearAccountId: string;
    txSigningRequests: TransactionInput[];
    options?: SignAndSendTransactionHooksOptions;
    theme?: 'dark' | 'light';
  }) => Promise<ActionResult[]>;


  // Event handlers (not reactive properties)
  onSuccess?: (result: ActionResult[]) => void;
  onCancel?: () => void;
  onLoadTouchIdPrompt?: (loading: boolean) => void;

  // Message handler reference for proper cleanup
  private messageHandler?: (event: MessageEvent) => void;
  private pendingUiDigestResolve?: (v: string) => void;
  private pendingUiDigestReject?: (e: Error) => void;
  private offEmbeddedBaseChange?: () => void;

  constructor() {
    super();
    // Initialize default values for reactive properties
    this.nearAccountId = '';
    this.txSigningRequests = [];

    this.buttonStyle = {};
    this.buttonHoverStyle = {};
    this.buttonTextElement = 'Sign Transaction';
    this.tooltipPosition = {
      width: '280px',
      height: '300px',
      position: 'top-center',
      offset: '6px',
      boxPadding: '5px',
    };
    this.txTreeTheme = 'dark';
    this.showLoading = false;
    this.options = {};
    this.externalConfirm = undefined;
  }

  connectedCallback() {
    super.connectedCallback();
    this.setupClipPathSupport();
    // Apply button style CSS variables on initial connection
    this.applyButtonStyle();
    // Subscribe to wallet host base-change event (best-effort)
    try { this.offEmbeddedBaseChange = onEmbeddedBaseChange(() => this.onAssetsBaseSet()); } catch {}
  }

  updated(changedProperties: PropertyValues) {
    super.updated(changedProperties);
    // Apply button style CSS variables when buttonStyle changes
    if (changedProperties.has('buttonStyle') || changedProperties.has('buttonHoverStyle')) {
      this.applyButtonStyle();
    }

    // Initialize once; base is resolved via resolveEmbeddedBase() with a stable default
    if (!this.iframeInitialized) {
      this.initializeIframe();
      this.iframeInitialized = true;
    } else {
      // Use postMessage to update iframe properties instead of recreating HTML
      this.updateIframeViaPostMessage(changedProperties);
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.messageHandler) {
      window.removeEventListener('message', this.messageHandler);
      this.messageHandler = undefined;
    }
    document.removeEventListener('pointerdown', this.onDocPointerDown, true);
    try { this.offEmbeddedBaseChange?.(); this.offEmbeddedBaseChange = undefined; } catch {}
  }

  private applyButtonStyle() {
    if (!this.buttonStyle) return;

    // Build scoped CSS rules for base and hover states using a per-instance class.
    const toDecls = (obj?: Record<string, unknown>) => {
      if (!obj) return '';
      const skip = new Set(['width','height']);
      return Object.entries(obj)
        .filter(([k, v]) => v != null && !skip.has(k))
        .map(([k, v]) => `${this.camelToKebab(k)}: ${String(v)};`)
        .join(' ');
    };

    const baseDecls = toDecls(this.buttonStyle as Record<string, unknown>);
    const hoverDecls = toDecls(this.buttonHoverStyle as Record<string, unknown>);

    const cssText = `.${this.styleScopeClass} { ${baseDecls} }
.${this.styleScopeClass}[data-hovered="true"] { ${hoverDecls} }`;

    if (this.renderRoot instanceof ShadowRoot && 'adoptedStyleSheets' in this.renderRoot && 'replaceSync' in CSSStyleSheet.prototype) {
      if (!this.scopedSheet) this.scopedSheet = new CSSStyleSheet();
      try { this.scopedSheet.replaceSync(cssText); } catch {}
      const sheets = (this.renderRoot.adoptedStyleSheets || []) as any[];
      if (!sheets.includes(this.scopedSheet)) {
        this.renderRoot.adoptedStyleSheets = [...sheets, this.scopedSheet];
      }
    } else if (this.renderRoot instanceof ShadowRoot) {
      if (!this.scopedStyleEl) {
        this.scopedStyleEl = document.createElement('style');
        this.renderRoot.appendChild(this.scopedStyleEl);
      }
      this.scopedStyleEl.textContent = cssText;
    }
  }

  render() {
    const buttonSize = {
      width: this.buttonStyle?.width || '200px',
      height: this.buttonStyle?.height || '48px'
    };

    const iframeSize = this.calculateIframeSize();

    return html`
      <div class="iframe-button-host ${this.styleScopeClass}" ${ref(this.hostRef)}
        style="width: ${toPx(buttonSize.width)}; height: ${toPx(buttonSize.height)};"
      >
        <div class="host-button-visual"><slot>${this.buttonTextElement}</slot></div>
        <iframe
          ${ref(this.iframeRef)}
          class="${iframeSize.flushClass}"
          style="width: ${iframeSize.width}px; height: ${iframeSize.height}px;"
          sandbox="allow-scripts"
          allow="clipboard-read; clipboard-write"
        ></iframe>
      </div>
    `;
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
      paddingPx: 0,
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
      tagName: W3A_BUTTON_WITH_TOOLTIP_ID,
      targetOrigin: window.location.origin,
    };
  }

  // ==============================
  // Iframe Init
  // ==============================
  private generateIframeHtml() {
    const embeddedTxButtonTag = W3A_BUTTON_WITH_TOOLTIP_ID;
    const iframeBootstrapTag = IFRAME_TX_BUTTON_BOOTSTRAP_MODULE;
    const base = resolveEmbeddedBase();
    return `<!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <style>
            /* Transparent first paint and neutral UA color-scheme */
            html,body{margin:0;padding:0;background:transparent !important;color-scheme:normal}
          </style>
          <script type="module" crossorigin="anonymous" src="${base}${embeddedTxButtonTag}.js"></script>
          <script type="module" crossorigin="anonymous" src="${base}${iframeBootstrapTag}"></script>
        </head>
        <body>
          <${embeddedTxButtonTag} id="etx"></${embeddedTxButtonTag}>
          <!-- bootstrap handled by external ${iframeBootstrapTag} module -->
        </body>
      </html>`;
  }

  private initializeIframe() {
    if (!this.iframeRef.value) {
      console.warn('[IframeButtonHost]: ⚠️ No iframe ref available for initialization');
      return;
    }

    const html = this.generateIframeHtml();
    const iframeEl = this.iframeRef.value;
    try {
      // Ensure the element itself never contributes an opaque layer
      iframeEl.style.background = 'transparent';
      // Prevent UA color-scheme from forcing opaque canvas during initial paint
      (iframeEl.style as any).colorScheme = 'normal';
    } catch {}
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

  // ==============================
  // Sizing & Builders (continued)
  // ==============================
  private updateIframeViaPostMessage(changedProperties: PropertyValues) {
    if (!this.iframeRef.value?.contentWindow) return;

    // Always push latest tx data; external apps may mutate arrays/objects in place
    // which can bypass Lit's change detection.
    this.postToIframe('SET_TX_DATA', {
      nearAccountId: this.nearAccountId,
      txSigningRequests: this.txSigningRequests
    });

    if (changedProperties.has('showLoading')) {
      this.postToIframe('SET_LOADING', this.showLoading);
      this.onLoadTouchIdPrompt?.(!!this.showLoading);
    }

    if (
      changedProperties.has('buttonStyle') ||
      changedProperties.has('buttonHoverStyle') ||
      changedProperties.has('tooltipPosition') ||
      changedProperties.has('txTreeTheme') ||
      changedProperties.has('color')
    ) {
      this.postStyleUpdateToIframe();

      // Update host container size when button style changes
      if (changedProperties.has('buttonStyle')) {
        this.setHostContainerToButtonSize();
      }
    }
  }

  // ==============================
  // Messaging Helpers
  // ==============================
  private getIframeWindow(): Window | null {
    return this.iframeRef.value?.contentWindow || null;
  }

  private postToIframe<T extends keyof IframeButtonMessagePayloads>(type: T, payload?: IframeButtonMessagePayloads[T]) {
    const w = this.getIframeWindow();
    if (!w) return;
    // Srcdoc without allow-same-origin has a 'null' origin; use wildcard target.
    w.postMessage({ type, payload }, '*');
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
    // Get theme styles for tooltip tree
    const themeStyles = this.getThemeStyles(this.txTreeTheme || 'dark');

    // Get embedded button theme styles
    const embeddedButtonTheme = EMBEDDED_TX_BUTTON_THEMES[this.txTreeTheme || 'dark'];

    this.postToIframe('SET_STYLE', {
      buttonSizing: buttonSize,
      tooltipPosition: this.tooltipPosition,
      tooltipTreeStyles: themeStyles,
      embeddedButtonTheme: embeddedButtonTheme,
      theme: this.txTreeTheme,
      // Force consistent mobile behavior across browsers: tap confirms, long‑press shows tooltip
      activationMode: 'press',
    });

    // Also re-send HS1_INIT to reapply precise positioning whenever the
    // button's size or tooltip position changes, keeping embedded aligned.
    this.postToIframe('HS1_INIT', this.buildInitData());
  }

  private getThemeStyles(theme: TxTreeTheme): TxTreeStyles {
    return TX_TREE_THEMES[theme] || TX_TREE_THEMES.dark;
  }

  // ==============================
  // Clip-path Helpers
  // ==============================

  private setupMessageHandling() {
    if (!this.iframeRef.value) return;

    const onMessage = (e: MessageEvent) => {
      const w = this.getIframeWindow();
      if (!w || e.source !== w) return;

      const { type, payload } = (e.data || {}) as IframeButtonMessage;
      switch (type as IframeButtonMessageType) {
        case 'IFRAME_ERROR':
        case 'IFRAME_UNHANDLED_REJECTION':
          console.error('[IframeButton iframe]', type, payload);
          return;
        case 'ETX_DEFINED':
          // The embedded element is fully upgraded; send initial state now
          this.postInitialStateToIframe();
          return;
        case 'HS2_POSITIONED':
          // The button positioning has been applied; now we can measure geometry
          this.postToIframe('HS3_GEOMETRY_REQUEST');
          return;
        case 'HS5_GEOMETRY_RESULT':
          this.handleInitGeometry(payload as IframeButtonMessagePayloads['HS5_GEOMETRY_RESULT']);
          return;
        case 'TOOLTIP_STATE':
          this.handleTooltipState(payload as IframeButtonMessagePayloads['TOOLTIP_STATE']);
          return;
        case 'BUTTON_HOVER': {
          const p = payload as IframeButtonMessagePayloads['BUTTON_HOVER'];
          this.handleButtonHover(p);
          try { const el = this.hostRef.value; if (el) el.dataset.hovered = p?.hovering ? 'true' : 'false'; } catch {}
          return;
        }
        case 'BUTTON_FOCUS': {
          const p = payload as IframeButtonMessagePayloads['BUTTON_FOCUS'];
          try { const el = this.hostRef.value; if (el) el.dataset.focused = p?.focused ? 'true' : 'false'; } catch {}
          return;
        }
        case 'UI_INTENT_DIGEST': {
          const p = payload as IframeButtonMessagePayloads['UI_INTENT_DIGEST'];
          if (p?.ok && p?.digest && this.pendingUiDigestResolve) {
            this.pendingUiDigestResolve(p.digest);
          } else if (!p?.ok && this.pendingUiDigestReject) {
            this.pendingUiDigestReject(new Error(p?.error || 'UI digest failed'));
          }
          this.pendingUiDigestResolve = undefined;
          this.pendingUiDigestReject = undefined;
          return;
        }
        case 'READY':
          // Send only HS1_INIT on READY so the iframe can position accurately.
          // Defer data/style until ETX_DEFINED to avoid upgrade races.
          this.postToIframe('HS1_INIT', {
            ...this.buildInitData(),
            // Provide parent origin for tighter child->parent messaging
            targetOrigin: window.location.origin
          });
          // Apply optimistic clip-path immediately to prevent blocking clicks
          // This will be replaced once HS5_GEOMETRY_RESULT is received
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

  private setupClipPathSupport() {
    this.clipPathSupported = CSS.supports('clip-path: polygon(0 0)');
    if (!this.clipPathSupported) {
      console.warn('[IframeButton] clip-path not supported, using rectangular iframe');
    }
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
    const pad = 4;
    const optimisticClipPath = `polygon(${buttonX - pad}px ${buttonY - pad}px, ${buttonX + buttonWidth + pad}px ${buttonY - pad}px, ${buttonX + buttonWidth + pad}px ${buttonY + buttonHeight + pad}px, ${buttonX - pad}px ${buttonY + buttonHeight + pad}px)`;

    this.iframeRef.value.style.clipPath = optimisticClipPath;
    this.iframeRef.value.classList.remove('interactive');
  }

  /**
   * Apply clip-path that restricts interaction to button area only
   */
  private applyButtonOnlyClipPath() {
    if (!this.iframeRef.value || !this.currentGeometry) return;
    if (!this.clipPathSupported) return;

    const { button } = this.currentGeometry;
    // Use simple rectangle to avoid clipping button corners
    const buttonClipPath = IframeClipPathGenerator.buildButtonClipPathPure(button, 4);
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
      const unionClipPath = IframeClipPathGenerator.generateUnion(this.currentGeometry, 8);
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

  /**
   * Force iframe re-initialization when tooltip style changes
   * This recalculates iframe size and positioning based on new tooltip dimensions
   */
  forceIframeReinitialize() {
    this.iframeInitialized = false;
    this.currentGeometry = null;

    // Re-initialize the iframe with new tooltip style
    this.initializeIframe();
    this.iframeInitialized = true;
  }

  /**
   * Update tooltip theme dynamically - called by React component when user changes theme preference
   */
  updateTheme(newTheme: 'dark' | 'light'): void {
    // Update the txTreeTheme property
    this.txTreeTheme = newTheme as EmbeddedTxButtonTheme;
    // If iframe is already initialized, send theme update via postMessage
    if (this.iframeInitialized) {
      this.postStyleUpdateToIframe();
    }
    // Request Lit update
    this.requestUpdate();
  }

  // ==============================
  // Handshake Handlers
  // ==============================

  /**
   * Handle initial geometry setup from iframe
   * Applies button-only clip-path to prevent blocking clicks
   */
  private handleInitGeometry(geometry: TooltipGeometry) {
    // Replace optimistic clip-path with precise button-only clip-path
    this.currentGeometry = geometry;
    this.applyButtonOnlyClipPath();
  }

  /**
   * Handle combined tooltip state updates (geometry + visibility) from the iframe
   */
  private handleTooltipState(geometry: TooltipGeometry) {
    this.currentGeometry = geometry;
    const wasVisible = this.tooltipVisible;
    this.tooltipVisible = !!geometry.visible;
    // Manage global click-away listener when visibility changes
    if (!wasVisible && this.tooltipVisible) {
      document.addEventListener('pointerdown', this.onDocPointerDown, true);
    } else if (wasVisible && !this.tooltipVisible) {
      document.removeEventListener('pointerdown', this.onDocPointerDown, true);
    }
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
        // Add small padding to absorb sub-pixel rounding at zoom levels
        const size = computeExpandedIframeSizeFromGeometryPure({ geometry, fallback, paddingPx: 2 });
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

  // ==============================
  // Digest & Confirm
  // ==============================

  // Request a digest of the UI data from the iframe (computed inside embedded element)
  requestUiIntentDigest(): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      if (!this.getIframeWindow()) return reject(new Error('iframe not ready'));
      if (this.pendingUiDigestReject) {
        this.pendingUiDigestReject(new Error('superseded'));
      }
      this.pendingUiDigestResolve = resolve;
      this.pendingUiDigestReject = reject;
      this.postToIframe('REQUEST_UI_DIGEST');
      setTimeout(() => {
        if (this.pendingUiDigestReject) {
          this.pendingUiDigestReject(new Error('UI digest timeout'));
          this.pendingUiDigestResolve = undefined;
          this.pendingUiDigestReject = undefined;
        }
      }, 3000);
    });
  }

  private async handleConfirm() {
    if (!this.nearAccountId || !this.txSigningRequests || this.txSigningRequests.length === 0) {
      const err = new Error('Missing required data for transaction');
      this.options?.onError?.(err);
      return;
    }

    // Signal loading
    this.postToIframe('SET_LOADING', true);
    this.onLoadTouchIdPrompt?.(true)

    try {
      let txResults: ActionResult[] | undefined;

      // Prefer an external confirm handler when provided (e.g., wallet iframe route)
      if (typeof this.externalConfirm === 'function') {
        txResults = await this.externalConfirm({
          nearAccountId: this.nearAccountId,
          txSigningRequests: this.txSigningRequests,
          options: {
            onEvent: this.options?.onEvent,
            onError: this.options?.onError,
            waitUntil: this.options?.waitUntil,
            executionWait: this.options?.executionWait
          },
          theme: this.txTreeTheme
        });
      } else {
        throw new Error('No external confirm handler provided');
      }
      this.onSuccess?.(txResults);

    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.options?.onError?.(error);

    } finally {
      this.postToIframe('SET_LOADING', false);
      try { this.onLoadTouchIdPrompt?.(false); } catch {}
    }
  }
}

// Define the custom element
try {
try { defineTag('txButton', IframeButtonHost as unknown as CustomElementConstructor); } catch {}
} catch {}

export default IframeButtonHost;
