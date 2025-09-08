//#region src/core/WebAuthnManager/LitComponents/IframeButtonWithTooltipConfirmer/tags.ts
const IFRAME_BUTTON_ID = "iframe-button";
const BUTTON_WITH_TOOLTIP_ID = "button-with-tooltip";
const EMBEDDED_SDK_BASE_PATH = "/sdk/embedded/";
const IFRAME_BOOTSTRAP_MODULE = "iframe-button-bootstrap.js";
const IFRAME_MODAL_ID = "iframe-modal";
const IFRAME_MODAL_BOOTSTRAP_MODULE = "iframe-modal-bootstrap.js";
const MODAL_TX_CONFIRM_BUNDLE = "modal-tx-confirm.js";
const SELECTORS = {
	EMBEDDED_CONFIRM_CONTAINER: `[data-embedded-tx-button-root]`,
	EMBEDDED_BTN: `[data-embedded-btn]`,
	TOOLTIP_CONTENT: `[data-tooltip-content]`,
	LOADING: `[data-loading]`,
	SPINNER: `[data-spinner]`
};

//#endregion
export { BUTTON_WITH_TOOLTIP_ID, EMBEDDED_SDK_BASE_PATH, IFRAME_BOOTSTRAP_MODULE, IFRAME_BUTTON_ID, IFRAME_MODAL_BOOTSTRAP_MODULE, IFRAME_MODAL_ID, MODAL_TX_CONFIRM_BUNDLE, SELECTORS };