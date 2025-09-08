import { IFRAME_MODAL_ID } from "./IframeButtonWithTooltipConfirmer/tags.js";

//#region src/core/WebAuthnManager/LitComponents/modal.ts
async function ensureIframeModalDefined() {
	if (customElements.get(IFRAME_MODAL_ID)) return;
	await new Promise((resolve, reject) => {
		const existing = document.querySelector(`script[data-w3a="${IFRAME_MODAL_ID}"]`);
		if (existing) {
			existing.addEventListener("load", () => resolve(), { once: true });
			existing.addEventListener("error", (e) => reject(e), { once: true });
			return;
		}
		const script = document.createElement("script");
		script.type = "module";
		script.async = true;
		script.dataset.w3a = IFRAME_MODAL_ID;
		script.src = `/sdk/embedded/${IFRAME_MODAL_ID}.js`;
		script.onload = () => resolve();
		script.onerror = (e) => {
			console.error("[LitComponents/modal] Failed to load iframe modal host bundle");
			reject(e);
		};
		document.head.appendChild(script);
	});
}
async function mountIframeModalHostWithHandle({ ctx, summary, txSigningRequests, vrfChallenge, loading, theme }) {
	await ensureIframeModalDefined();
	const el = document.createElement(IFRAME_MODAL_ID);
	el.nearAccountId = ctx.userPreferencesManager.getCurrentUserAccountId() || "";
	el.txSigningRequests = txSigningRequests || [];
	el.intentDigest = summary?.intentDigest;
	if (vrfChallenge) el.vrfChallenge = vrfChallenge;
	el.showLoading = !!loading;
	if (theme) el.theme = theme;
	document.body.appendChild(el);
	const close = (_confirmed) => {
		try {
			el.remove();
		} catch {}
	};
	return {
		element: el,
		close
	};
}
async function awaitIframeModalDecisionWithHandle({ ctx, summary, txSigningRequests, vrfChallenge, theme }) {
	await ensureIframeModalDefined();
	return new Promise((resolve) => {
		const el = document.createElement(IFRAME_MODAL_ID);
		el.nearAccountId = ctx.userPreferencesManager.getCurrentUserAccountId() || "";
		el.txSigningRequests = txSigningRequests || [];
		el.intentDigest = summary?.intentDigest;
		if (vrfChallenge) el.vrfChallenge = vrfChallenge;
		if (theme) el.theme = theme;
		const onConfirm = (e) => {
			const ce = e;
			cleanup();
			const ok = !!ce?.detail?.confirmed;
			resolve({
				confirmed: ok,
				handle: {
					element: el,
					close: (_confirmed) => {
						try {
							el.remove();
						} catch {}
					}
				}
			});
		};
		const onCancel = () => {
			cleanup();
			resolve({
				confirmed: false,
				handle: {
					element: el,
					close: (_confirmed) => {
						try {
							el.remove();
						} catch {}
					}
				}
			});
		};
		const cleanup = () => {
			try {
				el.removeEventListener("w3a:modal-confirm", onConfirm);
			} catch {}
			try {
				el.removeEventListener("w3a:modal-cancel", onCancel);
			} catch {}
		};
		el.addEventListener("w3a:modal-confirm", onConfirm);
		el.addEventListener("w3a:modal-cancel", onCancel);
		document.body.appendChild(el);
	});
}

//#endregion
export { awaitIframeModalDecisionWithHandle, mountIframeModalHostWithHandle };
//# sourceMappingURL=modal.js.map