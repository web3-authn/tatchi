import { LitElementWithProps, e, i, n, x } from "./LitElementWithProps-JEO1-s_8.js";
import { EMBEDDED_SDK_BASE_PATH, IFRAME_MODAL_BOOTSTRAP_MODULE, IFRAME_MODAL_ID, MODAL_TX_CONFIRM_BUNDLE } from "./tags-CCvVsAOz.js";

//#region src/core/WebAuthnManager/LitComponents/IframeModalConfirmer/IframeModalHost.ts
/**
* Lit component that hosts the ModalTxConfirmer in a full‑screen iframe and manages messaging.
*/
var IframeModalHost = class extends LitElementWithProps {
	static properties = {
		nearAccountId: {
			type: String,
			attribute: "near-account-id"
		},
		txSigningRequests: { type: Array },
		vrfChallenge: { type: Object },
		theme: {
			type: String,
			attribute: "theme"
		},
		showLoading: {
			type: Boolean,
			attribute: "show-loading"
		},
		intentDigest: {
			type: String,
			attribute: "intent-digest"
		},
		options: { type: Object },
		passkeyManagerContext: { type: Object },
		onSuccess: { type: Object },
		onError: { type: Object },
		onCancel: { type: Object }
	};
	iframeInitialized = false;
	iframeRef = e();
	messageHandler;
	pendingUiDigestResolve;
	pendingUiDigestReject;
	onSuccess;
	onError;
	onCancel;
	constructor() {
		super();
		this.nearAccountId = "";
		this.txSigningRequests = [];
		this.vrfChallenge = void 0;
		this.theme = "light";
		this.showLoading = false;
		this.intentDigest = void 0;
		this.options = {};
		this.passkeyManagerContext = null;
	}
	static styles = i`
    :host {
      position: fixed;
      inset: 0;
      z-index: 2147483647; /* over everything */
      display: block;
    }
    .iframe-modal-host {
      position: fixed;
      inset: 0;
      width: 100vw;
      height: 100vh;
    }
    iframe {
      border: none;
      background: transparent;
      position: fixed;
      inset: 0;
      width: 100vw;
      height: 100vh;
      z-index: 2147483647;
    }
  `;
	updated(changed) {
		super.updated(changed);
		if (!this.iframeInitialized) {
			this.initializeIframe();
			this.iframeInitialized = true;
		} else this.updateIframeViaPostMessage(changed);
	}
	disconnectedCallback() {
		super.disconnectedCallback();
		if (this.messageHandler) {
			window.removeEventListener("message", this.messageHandler);
			this.messageHandler = void 0;
		}
	}
	generateIframeHtml() {
		const modalBundle = MODAL_TX_CONFIRM_BUNDLE;
		const iframeBootstrap = IFRAME_MODAL_BOOTSTRAP_MODULE;
		const base = EMBEDDED_SDK_BASE_PATH;
		return `<!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <style>html,body{margin:0;padding:0;background:transparent}</style>
          <script>try{ parent && parent.postMessage({ type: 'MODAL_IFRAME_BOOT' }, '*'); } catch(e) {}<\/script>
          <script type="module" src="${base}${modalBundle}"><\/script>
          <script type="module" src="${base}${iframeBootstrap}"><\/script>
        </head>
        <body>
          <passkey-modal-confirm id="mtx"></passkey-modal-confirm>
        </body>
      </html>`;
	}
	initializeIframe() {
		const iframeEl = this.iframeRef.value;
		if (!iframeEl) return;
		this.setupMessageHandling();
		iframeEl.srcdoc = this.generateIframeHtml();
	}
	postToIframe(type, payload) {
		const win = this.iframeRef.value?.contentWindow;
		if (!win) return;
		try {
			win.postMessage({
				type,
				payload
			}, "*");
		} catch {}
	}
	updateIframeViaPostMessage(changed) {
		if (!this.iframeRef.value?.contentWindow) return;
		this.postToIframe("SET_TX_DATA", {
			nearAccountId: this.nearAccountId,
			txSigningRequests: this.txSigningRequests,
			vrfChallenge: this.vrfChallenge,
			theme: this.theme
		});
		if (changed.has("showLoading")) this.postToIframe("SET_LOADING", this.showLoading);
	}
	setupMessageHandling() {
		const onMessage = (event) => {
			const { data } = event || {};
			const type = data?.type;
			const payload = data?.payload;
			switch (type) {
				case "MODAL_IFRAME_BOOT": return;
				case "IFRAME_ERROR":
				case "IFRAME_UNHANDLED_REJECTION":
					console.error("[IframeModal] iframe error:", payload);
					return;
				case "READY":
					console.debug("[IframeModalHost] child READY");
					this.postToIframe("SET_INIT", { targetOrigin: window.location.origin });
					return;
				case "ETX_DEFINED":
					console.debug("[IframeModalHost] child ETX_DEFINED");
					this.postToIframe("SET_TX_DATA", {
						nearAccountId: this.nearAccountId,
						txSigningRequests: this.txSigningRequests,
						vrfChallenge: this.vrfChallenge,
						theme: this.theme
					});
					this.postToIframe("SET_LOADING", this.showLoading);
					return;
				case "CONFIRM":
					this.handleConfirm();
					return;
				case "CANCEL":
					this.onCancel?.();
					try {
						this.dispatchEvent(new CustomEvent("w3a:modal-cancel", {
							bubbles: true,
							composed: true
						}));
					} catch {}
					this.postToIframe("CLOSE_MODAL", { confirmed: false });
					return;
				case "MODAL_TIMEOUT": {
					const msg = typeof payload === "string" && payload ? payload : "Operation timed out";
					try {
						this.showLoading = false;
					} catch {}
					this.postToIframe("SET_LOADING", false);
					this.postToIframe("SET_ERROR", msg);
					return;
				}
				case "UI_INTENT_DIGEST": {
					const p = payload;
					if (p?.ok && p?.digest && this.pendingUiDigestResolve) this.pendingUiDigestResolve(p.digest);
					else if (!p?.ok && this.pendingUiDigestReject) this.pendingUiDigestReject(new Error(p?.error || "UI digest failed"));
					this.pendingUiDigestResolve = void 0;
					this.pendingUiDigestReject = void 0;
					return;
				}
				default: return;
			}
		};
		if (this.messageHandler) window.removeEventListener("message", this.messageHandler);
		this.messageHandler = onMessage;
		window.addEventListener("message", onMessage);
	}
	requestUiIntentDigest() {
		return new Promise((resolve, reject) => {
			if (!this.iframeRef.value?.contentWindow) {
				console.warn("[IframeModalHost] REQUEST_UI_DIGEST aborted: iframe not ready");
				return reject(/* @__PURE__ */ new Error("iframe not ready"));
			}
			if (this.pendingUiDigestReject) this.pendingUiDigestReject(/* @__PURE__ */ new Error("superseded"));
			this.pendingUiDigestResolve = resolve;
			this.pendingUiDigestReject = reject;
			this.postToIframe("REQUEST_UI_DIGEST");
			setTimeout(() => {
				if (this.pendingUiDigestReject) {
					console.warn("[IframeModalHost] UI digest timeout");
					this.pendingUiDigestReject(/* @__PURE__ */ new Error("UI digest timeout"));
					this.pendingUiDigestResolve = void 0;
					this.pendingUiDigestReject = void 0;
				}
			}, 3e3);
		});
	}
	async handleConfirm() {
		let confirmed = true;
		let error;
		if (this.intentDigest) try {
			const uiDigest = await this.requestUiIntentDigest();
			if (uiDigest !== this.intentDigest) {
				confirmed = false;
				error = JSON.stringify({
					code: "ui_digest_mismatch",
					uiDigest,
					intentDigest: this.intentDigest
				});
				this.onError?.(/* @__PURE__ */ new Error("UI digest mismatch"));
			}
		} catch (e$1) {
			confirmed = false;
			error = "ui_digest_validation_failed";
			const err = e$1 instanceof Error ? e$1 : new Error(String(e$1));
			this.onError?.(err);
		}
		if (confirmed) try {
			this.showLoading = true;
		} catch {}
		else {
			this.postToIframe("CLOSE_MODAL", { confirmed: false });
			try {
				this.remove();
			} catch {}
		}
		try {
			this.dispatchEvent(new CustomEvent("w3a:modal-confirm", {
				detail: {
					confirmed,
					error
				},
				bubbles: true,
				composed: true
			}));
		} catch {}
	}
	/**
	* Update theme dynamically - called by React component when user changes theme preference
	*/
	updateTheme(newTheme) {
		this.theme = newTheme;
		if (this.iframeInitialized) {
			const txData = {
				nearAccountId: this.nearAccountId,
				txSigningRequests: this.txSigningRequests,
				theme: this.theme
			};
			this.postToIframe("SET_TX_DATA", txData);
		} else console.warn("[IframeModalHost]: Modal iframe not initialized yet, theme update deferred");
		this.requestUpdate();
	}
	render() {
		return x`
      <div class="iframe-modal-host">
        <iframe
          ${n(this.iframeRef)}
          sandbox="allow-scripts allow-same-origin"
          allow="publickey-credentials-get; publickey-credentials-create"
        ></iframe>
      </div>
    `;
	}
};
customElements.define(IFRAME_MODAL_ID, IframeModalHost);
var IframeModalHost_default = IframeModalHost;

//#endregion
export { IframeModalHost, IframeModalHost_default as default };