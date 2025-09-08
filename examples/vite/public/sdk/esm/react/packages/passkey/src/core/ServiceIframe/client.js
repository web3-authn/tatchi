import { escapeHtmlAttribute, sanitizeSdkBasePath } from "./sanitization.js";

//#region src/core/ServiceIframe/client.ts
var ServiceIframeClient = class {
	opts;
	iframeEl = null;
	port = null;
	ready = false;
	pending = /* @__PURE__ */ new Map();
	reqCounter = 0;
	constructor(options) {
		this.opts = {
			connectTimeoutMs: 8e3,
			requestTimeoutMs: 2e4,
			servicePath: "/service",
			sdkBasePath: "/sdk",
			walletOrigin: "",
			...options
		};
	}
	async init() {
		if (this.ready) return;
		this.mountHiddenIframe();
		await this.handshake();
		await this.post({
			type: "SET_CONFIG",
			payload: {
				theme: this.opts.theme,
				nearRpcUrl: this.opts.nearRpcUrl,
				nearNetwork: this.opts.nearNetwork,
				contractId: this.opts.contractId,
				relayer: this.opts.relayer,
				vrfWorkerConfigs: this.opts.vrfWorkerConfigs
			}
		});
	}
	isReady() {
		return this.ready;
	}
	async requestSign(payload) {
		return this.post({
			type: "REQUEST_SIGN",
			payload
		});
	}
	async signTransactionsWithActions(payload) {
		return this.post({
			type: "REQUEST_signTransactionsWithActions",
			payload
		});
	}
	async requestRegister(payload) {
		return this.post({
			type: "REQUEST_REGISTER",
			payload
		});
	}
	async getUser(nearAccountId) {
		return this.post({
			type: "DB_GET_USER",
			payload: { nearAccountId }
		});
	}
	async getPreferences(nearAccountId) {
		return this.post({
			type: "DB_GET_PREFERENCES",
			payload: { nearAccountId }
		});
	}
	async updatePreferences(nearAccountId, patch) {
		return this.post({
			type: "DB_UPDATE_PREFERENCES",
			payload: {
				nearAccountId,
				patch
			}
		});
	}
	async getConfirmationConfig(nearAccountId) {
		return this.post({
			type: "DB_GET_CONFIRMATION_CONFIG",
			payload: { nearAccountId }
		});
	}
	async getTheme(nearAccountId) {
		return this.post({
			type: "DB_GET_THEME",
			payload: { nearAccountId }
		});
	}
	async setTheme(nearAccountId, theme) {
		return this.post({
			type: "DB_SET_THEME",
			payload: {
				nearAccountId,
				theme
			}
		});
	}
	async signNep413Message(payload) {
		return this.post({
			type: "REQUEST_signNep413Message",
			payload
		});
	}
	async signVerifyAndRegisterUser(payload) {
		return this.post({
			type: "REQUEST_signVerifyAndRegisterUser",
			payload
		});
	}
	async decryptPrivateKeyWithPrf(nearAccountId) {
		return this.post({
			type: "REQUEST_decryptPrivateKeyWithPrf",
			payload: { nearAccountId }
		});
	}
	async deriveNearKeypairAndEncrypt(payload) {
		return this.post({
			type: "REQUEST_deriveNearKeypairAndEncrypt",
			payload
		});
	}
	async recoverKeypairFromPasskey(payload) {
		return this.post({
			type: "REQUEST_recoverKeypairFromPasskey",
			payload
		});
	}
	async signTransactionWithKeyPair(payload) {
		return this.post({
			type: "REQUEST_signTransactionWithKeyPair",
			payload
		});
	}
	mountHiddenIframe() {
		if (this.iframeEl) return;
		const iframe = document.createElement("iframe");
		iframe.style.position = "fixed";
		iframe.style.width = "0px";
		iframe.style.height = "0px";
		iframe.style.opacity = "0";
		iframe.style.pointerEvents = "none";
		iframe.setAttribute("aria-hidden", "true");
		iframe.setAttribute("tabindex", "-1");
		iframe.setAttribute("sandbox", "allow-scripts allow-same-origin");
		if (this.opts.walletOrigin) {
			const src = new URL(this.opts.servicePath, this.opts.walletOrigin).toString();
			iframe.src = src;
		} else {
			let serviceHostUrl = "";
			try {
				serviceHostUrl = new URL("../../../embedded/service-host.js", import.meta.url).toString();
			} catch {
				const sanitizedBasePath = sanitizeSdkBasePath(this.opts.sdkBasePath);
				serviceHostUrl = `${sanitizedBasePath}/embedded/service-host.js`;
			}
			const escapedUrl = escapeHtmlAttribute(serviceHostUrl);
			const html = `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/></head><body><script type="module" src="${escapedUrl}"><\/script></body></html>`;
			iframe.srcdoc = html;
		}
		document.body.appendChild(iframe);
		this.iframeEl = iframe;
	}
	async handshake() {
		const { iframeEl } = this;
		if (!iframeEl || !iframeEl.contentWindow) throw new Error("Service iframe not mounted");
		const channel = new MessageChannel();
		const port = channel.port1;
		const childPort = channel.port2;
		const cleanup = () => {
			try {
				port.onmessage = null;
			} catch {}
		};
		const readyPromise = new Promise((resolve, reject) => {
			const timer = window.setTimeout(() => {
				cleanup();
				reject(/* @__PURE__ */ new Error("Service iframe READY timeout"));
			}, this.opts.connectTimeoutMs);
			port.onmessage = (e) => {
				const data = e.data;
				if (!data || typeof data !== "object") return;
				if (data.type === "READY") {
					window.clearTimeout(timer);
					cleanup();
					this.ready = true;
					resolve();
				}
			};
		});
		const targetOrigin = this.opts.walletOrigin || "*";
		iframeEl.contentWindow.postMessage({ type: "CONNECT" }, targetOrigin, [childPort]);
		this.port = port;
		this.port.onmessage = (e) => this.onPortMessage(e);
		this.port.start?.();
		await readyPromise;
	}
	onPortMessage(e) {
		const msg = e.data;
		if (!msg || typeof msg !== "object") return;
		if (msg.type === "PROGRESS") return;
		const requestId = msg.requestId;
		if (!requestId) return;
		const pending = this.pending.get(requestId);
		if (!pending) return;
		this.pending.delete(requestId);
		if (pending.timer) window.clearTimeout(pending.timer);
		if (msg.type === "ERROR") {
			const err = new Error(msg.payload?.message || "Service error");
			err.code = msg.payload?.code;
			err.details = msg.payload?.details;
			pending.reject(err);
			return;
		}
		pending.resolve(msg.payload);
	}
	post(envelope) {
		if (!this.ready || !this.port) return Promise.reject(/* @__PURE__ */ new Error("Service iframe not ready"));
		const requestId = `${Date.now()}-${++this.reqCounter}`;
		const full = {
			...envelope,
			requestId
		};
		return new Promise((resolve, reject) => {
			const timer = window.setTimeout(() => {
				this.pending.delete(requestId);
				reject(/* @__PURE__ */ new Error(`Service request timeout for ${envelope.type}`));
			}, this.opts.requestTimeoutMs);
			this.pending.set(requestId, {
				resolve,
				reject,
				timer
			});
			try {
				this.port.postMessage(full);
			} catch (err) {
				this.pending.delete(requestId);
				window.clearTimeout(timer);
				reject(err);
			}
		});
	}
};

//#endregion
export { ServiceIframeClient };
//# sourceMappingURL=client.js.map