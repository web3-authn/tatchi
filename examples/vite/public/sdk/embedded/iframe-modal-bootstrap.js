import { isActionArgsWasm, toActionArgsWasm } from "./actions-VhrvT5cf.js";
import { base64UrlEncode } from "./base64-CZBXHuxI.js";

//#region src/core/WebAuthnManager/LitComponents/common/tx-digest.ts
function alphabetizeStringify(input) {
	const normalizeValue = (value) => {
		if (Array.isArray(value)) return value.map(normalizeValue);
		if (value !== null && typeof value === "object") {
			const obj = value;
			const sortedKeys = Object.keys(obj).sort();
			const result = {};
			for (const key of sortedKeys) result[key] = normalizeValue(obj[key]);
			return result;
		}
		return value;
	};
	return JSON.stringify(normalizeValue(input));
}
async function sha256Base64UrlUtf8(input) {
	const enc = new TextEncoder();
	const data = enc.encode(input);
	const digest = await crypto.subtle.digest("SHA-256", data);
	return base64UrlEncode(digest);
}
async function computeUiIntentDigestFromTxs(txInputs) {
	const json = alphabetizeStringify(txInputs);
	return sha256Base64UrlUtf8(json);
}
function orderActionForDigest(a) {
	switch (a.action_type) {
		case "FunctionCall": return {
			action_type: a.action_type,
			args: a.args,
			deposit: a.deposit,
			gas: a.gas,
			method_name: a.method_name
		};
		case "Transfer": return {
			action_type: a.action_type,
			deposit: a.deposit
		};
		case "Stake": return {
			action_type: a.action_type,
			stake: a.stake,
			public_key: a.public_key
		};
		case "AddKey": return {
			action_type: a.action_type,
			public_key: a.public_key,
			access_key: a.access_key
		};
		case "DeleteKey": return {
			action_type: a.action_type,
			public_key: a.public_key
		};
		case "DeleteAccount": return {
			action_type: a.action_type,
			beneficiary_id: a.beneficiary_id
		};
		case "DeployContract": return {
			action_type: a.action_type,
			code: a.code
		};
		case "CreateAccount":
		default: return { action_type: a.action_type };
	}
}

//#endregion
//#region src/core/WebAuthnManager/LitComponents/IframeModalConfirmer/iframe-modal-bootstrap-script.ts
let PARENT_ORIGIN;
let MTX_DEFINED_POSTED = false;
function notifyReady() {
	try {
		const message = { type: "READY" };
		window.parent.postMessage(message, "*");
	} catch {}
}
function postError(kind, message) {
	try {
		console.error("[IframeModalBootstrap] error", kind, message);
		const errorMessage = {
			type: kind,
			payload: message
		};
		window.parent.postMessage(errorMessage, PARENT_ORIGIN || "*");
	} catch {}
}
function whenDefined(tag) {
	if (window.customElements?.whenDefined) return window.customElements.whenDefined(tag).then(() => void 0);
	return Promise.resolve();
}
function ensureElement() {
	let el = document.getElementById("mtx");
	if (!el) {
		el = document.createElement("passkey-modal-confirm");
		el.id = "mtx";
		document.body.appendChild(el);
	}
	try {
		el.deferClose = true;
	} catch {}
	return el;
}
/**
* Type guards for iframe message payloads
*/
function isSetInitPayload(payload) {
	return typeof payload === "object" && payload !== null;
}
function isSetTxDataPayload(payload) {
	return typeof payload === "object" && payload !== null && typeof payload.nearAccountId === "string" && Array.isArray(payload.txSigningRequests);
}
function isCloseModalPayload(payload) {
	return typeof payload === "object" && payload !== null;
}
function issTransactionInput(x) {
	if (!x || typeof x !== "object") return false;
	const obj = x;
	return typeof obj.receiverId === "string" && Array.isArray(obj.actions);
}
function isSetLoadingPayload(payload) {
	return typeof payload === "boolean";
}
function onMessage(e) {
	const data = e.data;
	if (!data || typeof data !== "object" || !("type" in data)) return;
	const { type, payload } = data;
	const el = ensureElement();
	switch (type) {
		case "SET_INIT":
			if (isSetInitPayload(payload) && payload) {
				PARENT_ORIGIN = payload.targetOrigin;
				window.__MTX_PARENT_ORIGIN = PARENT_ORIGIN;
			}
			whenDefined("passkey-modal-confirm").then(() => {
				if (MTX_DEFINED_POSTED) return;
				MTX_DEFINED_POSTED = true;
				const definedMessage = { type: "ETX_DEFINED" };
				try {
					window.parent.postMessage(definedMessage, PARENT_ORIGIN || "*");
				} catch {}
			});
			break;
		case "SET_TX_DATA":
			if (isSetTxDataPayload(payload) && payload) {
				el.nearAccountId = payload.nearAccountId;
				el.txSigningRequests = payload.txSigningRequests;
				if (payload.vrfChallenge) el.vrfChallenge = payload.vrfChallenge;
				if (payload.theme && typeof payload.theme === "string") el.theme = payload.theme;
				el.requestUpdate?.();
			}
			break;
		case "SET_LOADING":
			if (isSetLoadingPayload(payload)) {
				el.loading = payload;
				el.requestUpdate?.();
			}
			break;
		case "SET_ERROR":
			try {
				if (typeof payload === "string") {
					el.errorMessage = payload;
					el.loading = false;
					el.requestUpdate?.();
				}
			} catch {}
			break;
		case "CLOSE_MODAL":
			try {
				const confirmed = isCloseModalPayload(payload) && payload ? payload.confirmed : false;
				el.close ? el.close(confirmed) : el.remove();
			} catch {}
			break;
		case "REQUEST_UI_DIGEST":
			try {
				const raw = Array.isArray(el?.txSigningRequests) ? el.txSigningRequests : [];
				const txs = raw.filter(issTransactionInput).map((tx) => ({
					receiverId: tx.receiverId,
					actions: tx.actions.map((a) => isActionArgsWasm(a) ? a : toActionArgsWasm(a))
				}));
				const wasmShapedOrdered = txs.map((tx) => ({
					receiverId: tx.receiverId,
					actions: tx.actions.map(orderActionForDigest)
				}));
				computeUiIntentDigestFromTxs(wasmShapedOrdered).then((digest) => {
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
					try {
						console.warn("[IframeModalBootstrap] UI_INTENT_DIGEST error", err);
						window.parent.postMessage(errorMessage, PARENT_ORIGIN || "*");
					} catch {}
				});
			} catch (err) {
				const errorMessage = {
					type: "UI_INTENT_DIGEST",
					payload: {
						ok: false,
						error: String(err)
					}
				};
				try {
					console.warn("[IframeModalBootstrap] UI_INTENT_DIGEST error", err);
					window.parent.postMessage(errorMessage, PARENT_ORIGIN || "*");
				} catch {}
			}
			break;
	}
}
function hookDecisionEvents() {
	const forward = (type) => {
		const message = { type };
		try {
			window.parent.postMessage(message, PARENT_ORIGIN || "*");
		} catch {}
	};
	document.addEventListener("w3a:confirm", () => forward("CONFIRM"));
	document.addEventListener("w3a:cancel", () => forward("CANCEL"));
}
window.addEventListener("message", onMessage);
window.addEventListener("error", (e) => {
	postError("IFRAME_ERROR", e.message || "Unknown error");
});
window.addEventListener("unhandledrejection", (e) => {
	postError("IFRAME_UNHANDLED_REJECTION", e.reason ? String(e.reason) : "Unhandled promise rejection");
});
hookDecisionEvents();
notifyReady();

//#endregion