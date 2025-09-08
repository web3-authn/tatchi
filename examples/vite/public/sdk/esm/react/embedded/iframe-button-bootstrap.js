import { BUTTON_WITH_TOOLTIP_ID, SELECTORS } from "./tags-CCvVsAOz.js";

//#region src/core/WebAuthnManager/LitComponents/IframeButtonWithTooltipConfirmer/iframe-button-bootstrap-script.ts
/**
* Iframe Button Bootstrap Script (ESM)
*/
let PARENT_ORIGIN;
let ETX_DEFINED_POSTED = false;
function notifyReady() {
	try {
		const message = { type: "READY" };
		window.parent.postMessage(message, "*");
	} catch {}
}
function postError(kind, message) {
	try {
		console.error("[IframeButtonBootstrap] error", kind, message);
		const errorMessage = {
			type: kind,
			payload: message
		};
		window.parent.postMessage(errorMessage, PARENT_ORIGIN || "*");
	} catch {}
}
function applyInit(el, payload) {
	el.color = payload.backgroundColor;
	el.size = payload.size;
	el.tooltip = payload.tooltip;
	if (typeof payload.targetOrigin === "string") {
		PARENT_ORIGIN = String(payload.targetOrigin);
		window.__ETX_PARENT_ORIGIN = PARENT_ORIGIN;
	}
	if (payload.buttonPosition) {
		const MAX_RETRIES = 60;
		const DELAY_MS = 20;
		const tryApply = (retriesLeft) => {
			const c = el.shadowRoot?.querySelector(SELECTORS.EMBEDDED_CONFIRM_CONTAINER);
			if (c) {
				c.style.position = "absolute";
				c.style.top = String(payload.buttonPosition.y) + "px";
				c.style.left = String(payload.buttonPosition.x) + "px";
				c.style.transform = "none";
				c.offsetHeight;
				const positionedMessage = {
					type: "HS2_POSITIONED",
					payload: payload.buttonPosition
				};
				try {
					window.parent.postMessage(positionedMessage, PARENT_ORIGIN || "*");
				} catch {}
				return;
			}
			if (retriesLeft <= 0) {
				try {
					console.warn("[IframeButtonBootstrap] positioning timeout: container not ready");
				} catch {}
				return;
			}
			setTimeout(() => tryApply(retriesLeft - 1), DELAY_MS);
		};
		tryApply(MAX_RETRIES);
	}
	if (window.customElements && window.customElements.whenDefined) {
		const tag = payload.tagName || BUTTON_WITH_TOOLTIP_ID;
		window.customElements.whenDefined(tag).then(() => {
			if (ETX_DEFINED_POSTED) return;
			ETX_DEFINED_POSTED = true;
			const definedMessage = { type: "ETX_DEFINED" };
			try {
				window.parent.postMessage(definedMessage, PARENT_ORIGIN || "*");
			} catch {}
		});
	}
}
/**
* Type guards for iframe message payloads
*/
function isInitPayload(payload) {
	return typeof payload === "object" && payload !== null;
}
function isSetTxDataPayload(payload) {
	return typeof payload === "object" && payload !== null;
}
function isSetStylePayload(payload) {
	return typeof payload === "object" && payload !== null;
}
function isSetLoadingPayload(payload) {
	return typeof payload === "boolean";
}
function isRequestUiDigestPayload(payload) {
	return payload === void 0;
}
/**
* Handles incoming messages from the parent window.
* Processes various message types including the Initial Geometry Handshake messages.
* @param e The message event from the iframe
*/
function onMessage(e) {
	const data = e.data;
	if (!data || typeof data !== "object" || !("type" in data)) return;
	const { type, payload } = data;
	const el = document.getElementById("etx");
	if (!el) return;
	switch (type) {
		case "HS1_INIT":
			if (isInitPayload(payload)) applyInit(el, payload);
			break;
		case "HS3_GEOMETRY_REQUEST":
			if (el.sendInitialGeometry) el.sendInitialGeometry();
			break;
		case "SET_TX_DATA":
			if (isSetTxDataPayload(payload) && payload) if (el.updateProperties) el.updateProperties({
				nearAccountId: payload.nearAccountId,
				txSigningRequests: payload.txSigningRequests
			});
			else {
				el.nearAccountId = payload.nearAccountId;
				el.txSigningRequests = payload.txSigningRequests;
				if (el.requestUpdate) el.requestUpdate();
			}
			break;
		case "SET_LOADING":
			if (isSetLoadingPayload(payload)) if (el.updateProperties) el.updateProperties({ loadingTouchIdPrompt: payload });
			else {
				el.loadingTouchIdPrompt = payload;
				if (el.requestUpdate) el.requestUpdate();
			}
			break;
		case "SET_STYLE":
			if (isSetStylePayload(payload) && payload) {
				if (el.updateButtonStyles) el.updateButtonStyles(payload.buttonSizing || {}, payload.tooltipPosition, payload.embeddedButtonTheme, payload.theme, payload.activationMode);
				else {
					el.buttonSizing = payload.buttonSizing || {};
					if (payload.tooltipPosition) el.tooltipPosition = payload.tooltipPosition;
					if (payload.activationMode && "activationMode" in el) el.activationMode = payload.activationMode;
				}
				if (payload.theme && el.tooltipTheme !== payload.theme) {
					el.tooltipTheme = payload.theme;
					if (el.requestUpdate) el.requestUpdate();
				}
				if (payload.tooltipTreeStyles && el.styles !== payload.tooltipTreeStyles) {
					el.styles = payload.tooltipTreeStyles;
					if (el.requestUpdate) el.requestUpdate();
				}
			}
			break;
		case "SET_TOOLTIP_VISIBILITY":
			if (typeof payload === "boolean") if (payload) el.showTooltip?.();
			else el.hideTooltip?.();
			break;
		case "REQUEST_UI_DIGEST":
			if (isRequestUiDigestPayload(payload) && typeof el.computeUiIntentDigest === "function") el.computeUiIntentDigest().then((digest) => {
				const successMessage = {
					type: "UI_INTENT_DIGEST",
					payload: {
						ok: true,
						digest
					}
				};
				try {
					window.parent.postMessage(successMessage, PARENT_ORIGIN || "*");
				} catch {}
			}).catch((err) => {
				const errorMessage = {
					type: "UI_INTENT_DIGEST",
					payload: {
						ok: false,
						error: String(err)
					}
				};
				console.warn("[IframeButtonBootstrap] UI_INTENT_DIGEST error", err);
				try {
					window.parent.postMessage(errorMessage, PARENT_ORIGIN || "*");
				} catch {}
			});
			else throw new Error("UI intent digest computation not available in secure iframe");
			break;
	}
}
window.addEventListener("message", onMessage);
window.addEventListener("error", (e) => {
	postError("IFRAME_ERROR", e.message || "Unknown error");
});
window.addEventListener("unhandledrejection", (e) => {
	postError("IFRAME_UNHANDLED_REJECTION", e.reason ? String(e.reason) : "Unhandled promise rejection");
});
notifyReady();

//#endregion