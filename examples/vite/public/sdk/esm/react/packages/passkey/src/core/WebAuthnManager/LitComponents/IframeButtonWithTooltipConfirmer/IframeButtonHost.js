import { toAccountId } from "../../../types/accountIds.js";
import { BUTTON_WITH_TOOLTIP_ID, EMBEDDED_SDK_BASE_PATH, IFRAME_BOOTSTRAP_MODULE, IFRAME_BUTTON_ID } from "./tags.js";
import { i } from "../../../../../../../node_modules/.pnpm/@lit_reactive-element@2.1.1/node_modules/@lit/reactive-element/css-tag.js";
import { x } from "../../../../../../../node_modules/.pnpm/lit-html@3.3.1/node_modules/lit-html/lit-html.js";
import "../../../../../../../node_modules/.pnpm/lit@3.3.1/node_modules/lit/index.js";
import { LitElementWithProps } from "../LitElementWithProps.js";
import { TX_TREE_THEMES } from "../TxTree/tx-tree-themes.js";
import { e, n } from "../../../../../../../node_modules/.pnpm/lit-html@3.3.1/node_modules/lit-html/directives/ref.js";
import "../../../../../../../node_modules/.pnpm/lit@3.3.1/node_modules/lit/directives/ref.js";
import { signAndSendTransactionsInternal } from "../../../PasskeyManager/actions.js";
import { EMBEDDED_TX_BUTTON_THEMES } from "./button-with-tooltip-themes.js";
import { IframeClipPathGenerator, computeExpandedIframeSizeFromGeometryPure, computeIframeSizePure, toPx, utilParsePx } from "./iframe-geometry.js";

//#region src/core/WebAuthnManager/LitComponents/IframeButtonWithTooltipConfirmer/IframeButtonHost.ts
/**
* Lit component that hosts the SecureTxConfirmButton iframe and manages all iframe communication.
*/
var IframeButtonHost = class extends LitElementWithProps {
	static properties = {
		nearAccountId: {
			type: String,
			attribute: "near-account-id"
		},
		txSigningRequests: {
			type: Array,
			hasChanged(_newVal, _oldVal) {
				return true;
			}
		},
		color: { type: String },
		buttonTextElement: { type: String },
		buttonStyle: {
			type: Object,
			hasChanged(newVal, oldVal) {
				return JSON.stringify(newVal) !== JSON.stringify(oldVal);
			}
		},
		buttonHoverStyle: {
			type: Object,
			hasChanged(newVal, oldVal) {
				return JSON.stringify(newVal) !== JSON.stringify(oldVal);
			}
		},
		tooltipPosition: {
			type: Object,
			hasChanged(newVal, oldVal) {
				return JSON.stringify(newVal) !== JSON.stringify(oldVal);
			}
		},
		txTreeTheme: {
			type: String,
			attribute: "tooltip-theme"
		},
		showLoading: {
			type: Boolean,
			attribute: "show-loading"
		},
		options: {
			type: Object,
			hasChanged(newVal, oldVal) {
				return JSON.stringify(newVal) !== JSON.stringify(oldVal);
			}
		},
		passkeyManagerContext: {
			type: Object,
			hasChanged(newVal, oldVal) {
				return JSON.stringify(newVal) !== JSON.stringify(oldVal);
			}
		},
		onSuccess: { type: Object },
		onCancel: { type: Object },
		onLoadTouchIdPrompt: { type: Object }
	};
	static styles = i`
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
      background: var(--btn-background, var(--btn-color, #222));
      border-radius: var(--btn-border-radius, 8px);
      border: var(--btn-border, none);
      box-shadow: var(--btn-box-shadow, none);
      transition: var(--btn-transition, none);
      width: var(--button-width, 200px);
      height: var(--button-height, 48px);
      overflow: visible;
    }

    /* Host-driven hover/focus visuals (mirrored from iframe events) */
    .iframe-button-host[data-hovered="true"] {
      background: var(--btn-hover-background, var(--btn-background, var(--btn-color, #222)));
      border: var(--btn-hover-border, var(--btn-border, none));
      box-shadow: var(--btn-hover-box-shadow, var(--btn-box-shadow, none));
      transform: var(--btn-hover-transform, none);
      transition: var(--btn-transition, none);
    }
    .iframe-button-host[data-hovered="true"] .host-button-visual {
      color: var(--btn-hover-color, var(--btn-color-text, #fff));
    }
    .iframe-button-host[data-focused="true"] {
      /* Optional focus ring; override via custom CSS if desired */
      box-shadow: var(--btn-focus-box-shadow, 0 0 0 2px rgba(0,0,0,0.25));
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
      color: var(--btn-color-text, #fff);
      font-size: var(--btn-font-size, 1rem);
      font-weight: var(--btn-font-weight, 500);
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
	iframeInitialized = false;
	currentGeometry = null;
	clipPathSupported = false;
	initialClipPathApplied = false;
	iframeRef = e();
	hostRef = e();
	tooltipVisible = false;
	onDocPointerDown = (ev) => {
		if (!this.tooltipVisible) return;
		const hostEl = this.hostRef.value;
		if (!hostEl) return;
		const target = ev.target;
		if (target && hostEl.contains(target)) return;
		this.postToIframe("SET_TOOLTIP_VISIBILITY", false);
	};
	onSuccess;
	onCancel;
	onLoadTouchIdPrompt;
	messageHandler;
	pendingUiDigestResolve;
	pendingUiDigestReject;
	constructor() {
		super();
		this.nearAccountId = "";
		this.txSigningRequests = [];
		this.buttonStyle = {};
		this.buttonHoverStyle = {};
		this.buttonTextElement = "Sign Transaction";
		this.tooltipPosition = {
			width: "280px",
			height: "300px",
			position: "top-center",
			offset: "6px",
			boxPadding: "5px"
		};
		this.txTreeTheme = "dark";
		this.showLoading = false;
		this.options = {};
		this.passkeyManagerContext = null;
	}
	connectedCallback() {
		super.connectedCallback();
		this.setupClipPathSupport();
		this.applyButtonStyle();
	}
	updated(changedProperties) {
		super.updated(changedProperties);
		if (changedProperties.has("buttonStyle") || changedProperties.has("buttonHoverStyle")) this.applyButtonStyle();
		if (!this.iframeInitialized) {
			this.initializeIframe();
			this.iframeInitialized = true;
		} else this.updateIframeViaPostMessage(changedProperties);
	}
	disconnectedCallback() {
		super.disconnectedCallback();
		if (this.messageHandler) {
			window.removeEventListener("message", this.messageHandler);
			this.messageHandler = void 0;
		}
		try {
			document.removeEventListener("pointerdown", this.onDocPointerDown, true);
		} catch {}
	}
	applyButtonStyle() {
		if (!this.buttonStyle) return;
		const style = this.style;
		if (this.buttonStyle.background) style.setProperty("--btn-background", String(this.buttonStyle.background));
		if (this.buttonStyle.borderRadius) style.setProperty("--btn-border-radius", String(this.buttonStyle.borderRadius));
		if (this.buttonStyle.border) style.setProperty("--btn-border", String(this.buttonStyle.border));
		if (this.buttonStyle.boxShadow) style.setProperty("--btn-box-shadow", String(this.buttonStyle.boxShadow));
		if (this.buttonStyle.transition) style.setProperty("--btn-transition", String(this.buttonStyle.transition));
		if (this.buttonStyle.color) style.setProperty("--btn-color-text", String(this.buttonStyle.color));
		if (this.buttonStyle.fontSize) style.setProperty("--btn-font-size", String(this.buttonStyle.fontSize));
		if (this.buttonStyle.fontWeight) style.setProperty("--btn-font-weight", String(this.buttonStyle.fontWeight));
		if (this.buttonHoverStyle) {
			const h = this.buttonHoverStyle;
			if (h.background || h.backgroundColor) style.setProperty("--btn-hover-background", String(h.background || h.backgroundColor));
			if (h.color) style.setProperty("--btn-hover-color", String(h.color));
			if (h.border) style.setProperty("--btn-hover-border", String(h.border));
			if (h.boxShadow) style.setProperty("--btn-hover-box-shadow", String(h.boxShadow));
			if (h.transform) style.setProperty("--btn-hover-transform", String(h.transform));
		}
	}
	render() {
		const buttonSize = {
			width: this.buttonStyle?.width || "200px",
			height: this.buttonStyle?.height || "48px"
		};
		const iframeSize = this.calculateIframeSize();
		return x`
      <div class="iframe-button-host" ${n(this.hostRef)}
        style="width: ${toPx(buttonSize.width)}; height: ${toPx(buttonSize.height)};"
      >
        <div class="host-button-visual"><slot>${this.buttonTextElement}</slot></div>
        <iframe
          ${n(this.iframeRef)}
          class="${iframeSize.flushClass}"
          style="width: ${iframeSize.width}px; height: ${iframeSize.height}px;"
          sandbox="allow-scripts allow-same-origin"
          allow="publickey-credentials-get; publickey-credentials-create"
        ></iframe>
      </div>
    `;
	}
	calculateIframeSize() {
		const buttonWidth = utilParsePx(this.buttonStyle?.width || "200px");
		const buttonHeight = utilParsePx(this.buttonStyle?.height || "48px");
		const tooltipWidth = utilParsePx(this.tooltipPosition.width);
		const tooltipHeight = this.tooltipPosition.height === "auto" ? 200 : utilParsePx(this.tooltipPosition.height);
		const offset = utilParsePx(this.tooltipPosition.offset);
		return computeIframeSizePure({
			buttonWidthPx: buttonWidth,
			buttonHeightPx: buttonHeight,
			tooltipWidthPx: tooltipWidth,
			tooltipHeightPx: tooltipHeight,
			offsetPx: offset,
			position: this.tooltipPosition.position,
			paddingPx: 0
		});
	}
	buildInitData() {
		const buttonSize = {
			width: this.buttonStyle?.width || "200px",
			height: this.buttonStyle?.height || "48px"
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
			tagName: BUTTON_WITH_TOOLTIP_ID,
			targetOrigin: window.location.origin
		};
	}
	generateIframeHtml() {
		const embeddedTxButtonTag = BUTTON_WITH_TOOLTIP_ID;
		const iframeBootstrapTag = IFRAME_BOOTSTRAP_MODULE;
		const base = EMBEDDED_SDK_BASE_PATH;
		return `<!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <style>html,body{margin:0;padding:0;background:transparent}</style>
          <script type="module" src="${base}${embeddedTxButtonTag}.js"><\/script>
          <script type="module" src="${base}${iframeBootstrapTag}"><\/script>
        </head>
        <body>
          <${embeddedTxButtonTag} id="etx"></${embeddedTxButtonTag}>
          <!-- bootstrap handled by external ${iframeBootstrapTag} module -->
        </body>
      </html>`;
	}
	initializeIframe() {
		if (!this.iframeRef.value) {
			console.warn("[IframeButtonHost]: ⚠️ No iframe ref available for initialization");
			return;
		}
		const html = this.generateIframeHtml();
		const iframeEl = this.iframeRef.value;
		iframeEl.srcdoc = html;
		this.setupMessageHandling();
		this.setHostContainerToButtonSize();
	}
	setHostContainerToButtonSize() {
		const buttonWidth = this.buttonStyle?.width || "200px";
		const buttonHeight = this.buttonStyle?.height || "48px";
		this.style.setProperty("--button-width", typeof buttonWidth === "number" ? `${buttonWidth}px` : String(buttonWidth));
		this.style.setProperty("--button-height", typeof buttonHeight === "number" ? `${buttonHeight}px` : String(buttonHeight));
	}
	updateIframeViaPostMessage(changedProperties) {
		if (!this.iframeRef.value?.contentWindow) return;
		this.postToIframe("SET_TX_DATA", {
			nearAccountId: this.nearAccountId,
			txSigningRequests: this.txSigningRequests
		});
		if (changedProperties.has("showLoading")) {
			this.postToIframe("SET_LOADING", this.showLoading);
			try {
				this.onLoadTouchIdPrompt?.(!!this.showLoading);
			} catch {}
		}
		if (changedProperties.has("buttonStyle") || changedProperties.has("buttonHoverStyle") || changedProperties.has("tooltipPosition") || changedProperties.has("txTreeTheme") || changedProperties.has("color")) {
			this.postStyleUpdateToIframe();
			if (changedProperties.has("buttonStyle")) this.setHostContainerToButtonSize();
		}
	}
	getIframeWindow() {
		return this.iframeRef.value?.contentWindow || null;
	}
	postToIframe(type, payload) {
		const w = this.getIframeWindow();
		if (!w) {
			console.error(`[IframeButtonHost]: Cannot post message - iframe window not available`);
			return;
		}
		const targetOrigin = window.location.origin;
		w.postMessage({
			type,
			payload
		}, targetOrigin);
	}
	postInitialStateToIframe() {
		this.postToIframe("SET_TX_DATA", {
			nearAccountId: this.nearAccountId,
			txSigningRequests: this.txSigningRequests
		});
		this.postToIframe("SET_LOADING", !!this.showLoading);
		this.postStyleUpdateToIframe();
	}
	postStyleUpdateToIframe() {
		const buttonSize = {
			width: this.buttonStyle?.width || "200px",
			height: this.buttonStyle?.height || "48px"
		};
		const themeStyles = this.getThemeStyles(this.txTreeTheme || "dark");
		const embeddedButtonTheme = EMBEDDED_TX_BUTTON_THEMES[this.txTreeTheme || "dark"];
		this.postToIframe("SET_STYLE", {
			buttonSizing: buttonSize,
			tooltipPosition: this.tooltipPosition,
			tooltipTreeStyles: themeStyles,
			embeddedButtonTheme,
			theme: this.txTreeTheme
		});
		this.postToIframe("HS1_INIT", this.buildInitData());
	}
	getThemeStyles(theme) {
		return TX_TREE_THEMES[theme] || TX_TREE_THEMES.dark;
	}
	setupMessageHandling() {
		if (!this.iframeRef.value) return;
		const onMessage = (e$1) => {
			const w = this.getIframeWindow();
			if (!w || e$1.source !== w) return;
			const { type, payload } = e$1.data || {};
			switch (type) {
				case "IFRAME_ERROR":
				case "IFRAME_UNHANDLED_REJECTION":
					console.error("[IframeButton iframe]", type, payload);
					return;
				case "ETX_DEFINED":
					this.postInitialStateToIframe();
					return;
				case "HS2_POSITIONED":
					this.postToIframe("HS3_GEOMETRY_REQUEST");
					return;
				case "HS5_GEOMETRY_RESULT":
					this.handleInitGeometry(payload);
					return;
				case "TOOLTIP_STATE":
					this.handleTooltipState(payload);
					return;
				case "BUTTON_HOVER":
					this.handleButtonHover(payload);
					try {
						const el = this.hostRef.value;
						if (el) el.dataset.hovered = payload?.hovering ? "true" : "false";
					} catch {}
					return;
				case "BUTTON_FOCUS":
					try {
						const el = this.hostRef.value;
						if (el) el.dataset.focused = payload?.focused ? "true" : "false";
					} catch {}
					return;
				case "UI_INTENT_DIGEST": {
					const p = payload;
					if (p?.ok && p?.digest && this.pendingUiDigestResolve) this.pendingUiDigestResolve(p.digest);
					else if (!p?.ok && this.pendingUiDigestReject) this.pendingUiDigestReject(new Error(p?.error || "UI digest failed"));
					this.pendingUiDigestResolve = void 0;
					this.pendingUiDigestReject = void 0;
					return;
				}
				case "READY":
					this.postToIframe("HS1_INIT", {
						...this.buildInitData(),
						targetOrigin: window.location.origin
					});
					this.applyOptimisticClipPath();
					return;
				case "CONFIRM":
					this.handleConfirm();
					return;
				default: return;
			}
		};
		if (this.messageHandler) window.removeEventListener("message", this.messageHandler);
		this.messageHandler = onMessage;
		window.addEventListener("message", onMessage);
	}
	setupClipPathSupport() {
		this.clipPathSupported = CSS.supports("clip-path: polygon(0 0)");
		if (!this.clipPathSupported) console.warn("[IframeButton] clip-path not supported, using rectangular iframe");
	}
	/**
	* Apply clip-path using calculated button position before geometry is available
	*/
	applyOptimisticClipPath() {
		if (!this.iframeRef.value) return;
		const iframeSize = this.calculateIframeSize();
		const buttonWidth = utilParsePx(this.buttonStyle?.width || "200px");
		const buttonHeight = utilParsePx(this.buttonStyle?.height || "48px");
		const buttonX = iframeSize.buttonPositionX;
		const buttonY = iframeSize.buttonPositionY;
		const pad = 4;
		const optimisticClipPath = `polygon(${buttonX - pad}px ${buttonY - pad}px, ${buttonX + buttonWidth + pad}px ${buttonY - pad}px, ${buttonX + buttonWidth + pad}px ${buttonY + buttonHeight + pad}px, ${buttonX - pad}px ${buttonY + buttonHeight + pad}px)`;
		this.iframeRef.value.style.clipPath = optimisticClipPath;
		this.iframeRef.value.classList.remove("interactive");
	}
	/**
	* Apply clip-path that restricts interaction to button area only
	*/
	applyButtonOnlyClipPath() {
		if (!this.iframeRef.value || !this.currentGeometry) return;
		if (!this.clipPathSupported) return;
		const { button } = this.currentGeometry;
		const buttonClipPath = IframeClipPathGenerator.buildButtonClipPathPure(button, 4);
		this.iframeRef.value.style.clipPath = buttonClipPath;
		this.iframeRef.value.classList.remove("interactive");
	}
	/**
	* Apply clip-path that includes both button and tooltip areas (for hover state)
	*/
	applyButtonTooltipClipPath() {
		if (!this.iframeRef.value || !this.currentGeometry) return;
		if (!this.clipPathSupported) return;
		try {
			const unionClipPath = IframeClipPathGenerator.generateUnion(this.currentGeometry, 4);
			if (unionClipPath) {
				this.iframeRef.value.style.clipPath = unionClipPath;
				this.iframeRef.value.classList.add("interactive");
			}
		} catch (error) {
			console.error("[IframeButton] Error generating button+tooltip clip-path:", error);
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
		this.initialClipPathApplied = false;
		this.initializeIframe();
		this.iframeInitialized = true;
	}
	/**
	* Update tooltip theme dynamically - called by React component when user changes theme preference
	*/
	updateTheme(newTheme) {
		this.txTreeTheme = newTheme;
		if (this.iframeInitialized) this.postStyleUpdateToIframe();
		this.requestUpdate();
	}
	/**
	* Handle initial geometry setup from iframe
	* Applies button-only clip-path to prevent blocking clicks
	*/
	handleInitGeometry(geometry) {
		this.currentGeometry = geometry;
		this.applyButtonOnlyClipPath();
	}
	/**
	* Handle combined tooltip state updates (geometry + visibility) from the iframe
	*/
	handleTooltipState(geometry) {
		this.currentGeometry = geometry;
		const wasVisible = this.tooltipVisible;
		this.tooltipVisible = !!geometry.visible;
		if (!wasVisible && this.tooltipVisible) document.addEventListener("pointerdown", this.onDocPointerDown, true);
		else if (wasVisible && !this.tooltipVisible) document.removeEventListener("pointerdown", this.onDocPointerDown, true);
		if (!geometry.visible) {
			this.applyButtonOnlyClipPath();
			const iframe = this.iframeRef.value;
			if (iframe) {
				const size = this.calculateIframeSize();
				iframe.style.width = `${size.width}px`;
				iframe.style.height = `${size.height}px`;
			}
		} else {
			const iframe = this.iframeRef.value;
			if (iframe) {
				const fallback = this.calculateIframeSize();
				const size = computeExpandedIframeSizeFromGeometryPure({
					geometry,
					fallback,
					paddingPx: 0
				});
				iframe.style.width = `${size.width}px`;
				iframe.style.height = `${size.height}px`;
			}
			this.applyButtonTooltipClipPath();
		}
	}
	/**
	* Handle button hover state for dual clip-path management
	* - Not hovering: Clip-path restricts to button area only
	* - Hovering: Clip-path expands to include button + tooltip area
	*/
	handleButtonHover(payload) {
		if (!this.iframeRef.value || !this.currentGeometry) return;
		if (payload.hovering) this.applyButtonTooltipClipPath();
		else if (!this.currentGeometry.visible) this.applyButtonOnlyClipPath();
	}
	requestUiIntentDigest() {
		return new Promise((resolve, reject) => {
			if (!this.getIframeWindow()) return reject(/* @__PURE__ */ new Error("iframe not ready"));
			if (this.pendingUiDigestReject) this.pendingUiDigestReject(/* @__PURE__ */ new Error("superseded"));
			this.pendingUiDigestResolve = resolve;
			this.pendingUiDigestReject = reject;
			this.postToIframe("REQUEST_UI_DIGEST");
			setTimeout(() => {
				if (this.pendingUiDigestReject) {
					this.pendingUiDigestReject(/* @__PURE__ */ new Error("UI digest timeout"));
					this.pendingUiDigestResolve = void 0;
					this.pendingUiDigestReject = void 0;
				}
			}, 3e3);
		});
	}
	async handleConfirm() {
		if (!this.passkeyManagerContext || !this.nearAccountId || !this.txSigningRequests || this.txSigningRequests.length === 0) {
			const err = /* @__PURE__ */ new Error("Missing required data for transaction");
			this.options?.onError?.(err);
			return;
		}
		this.postToIframe("SET_LOADING", true);
		this.onLoadTouchIdPrompt?.(true);
		try {
			const txResults = await signAndSendTransactionsInternal({
				context: this.passkeyManagerContext,
				nearAccountId: toAccountId(this.nearAccountId),
				transactionInputs: this.txSigningRequests.map((tx) => ({
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
					uiMode: "embedded",
					behavior: "autoProceed",
					autoProceedDelay: 0,
					theme: this.txTreeTheme
				}
			});
			this.onSuccess?.(txResults);
		} catch (err) {
			const error = err instanceof Error ? err : new Error(String(err));
			this.options?.onError?.(error);
		} finally {
			this.postToIframe("SET_LOADING", false);
			try {
				this.onLoadTouchIdPrompt?.(false);
			} catch {}
		}
	}
};
customElements.define(IFRAME_BUTTON_ID, IframeButtonHost);

//#endregion
export { IframeButtonHost };
//# sourceMappingURL=IframeButtonHost.js.map