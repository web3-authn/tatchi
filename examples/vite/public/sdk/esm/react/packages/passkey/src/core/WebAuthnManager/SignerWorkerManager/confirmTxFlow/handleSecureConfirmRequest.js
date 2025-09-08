import { toAccountId } from "../../../types/accountIds.js";
import { extractPrfFromCredential, serializeAuthenticationCredentialWithPRF, serializeRegistrationCredentialWithPRF } from "../../credentialsHelpers.js";
import { SecureConfirmMessageType } from "./types.js";
import { IFRAME_BUTTON_ID } from "../../LitComponents/IframeButtonWithTooltipConfirmer/tags.js";
import { awaitIframeModalDecisionWithHandle, mountIframeModalHostWithHandle } from "../../LitComponents/modal.js";

//#region src/core/WebAuthnManager/SignerWorkerManager/confirmTxFlow/handleSecureConfirmRequest.ts
/**
* Handles secure confirmation requests from the worker with robust error handling
* => SecureConfirmMessageType.PROMPT_USER_CONFIRM_IN_JS_MAIN_THREAD
* and proper data validation. Supports both transaction and registration confirmation flows.
*/
async function handlePromptUserConfirmInJsMainThread(ctx, message, worker) {
	const { data, summary, confirmationConfig, transactionSummary } = validateAndParseRequest({
		ctx,
		message
	});
	const nearRpcResult = await performNearRpcCalls(ctx, data);
	if (nearRpcResult.error || !nearRpcResult.transactionContext) {
		sendWorkerResponse(worker, {
			requestId: data.requestId,
			intentDigest: data.intentDigest,
			confirmed: false,
			error: `Failed to fetch NEAR data: ${nearRpcResult.details}`
		});
		return;
	}
	const transactionContext = nearRpcResult.transactionContext;
	if (!ctx.vrfWorkerManager) throw new Error("VrfWorkerManager not available in context");
	const vrfChallenge = await ctx.vrfWorkerManager.generateVrfChallenge({
		userId: data.rpcCall.nearAccountId,
		rpId: window.location.hostname,
		blockHeight: transactionContext.txBlockHeight,
		blockHash: transactionContext.txBlockHash
	});
	const userConfirmResult = await renderUserConfirmUI({
		ctx,
		confirmationConfig,
		transactionSummary,
		data,
		vrfChallenge
	});
	const { confirmed, confirmHandle, error: uiError } = userConfirmResult;
	if (!confirmed) {
		try {
			nearRpcResult.reservedNonces?.forEach((n) => ctx.nonceManager.releaseNonce(n));
		} catch (e) {
			console.warn("[SignerWorkerManager]: Failed to release reserved nonces on cancel:", e);
		}
		closeModalSafely(confirmHandle, false);
		sendWorkerResponse(worker, {
			requestId: data.requestId,
			intentDigest: data.intentDigest,
			confirmed: false,
			error: uiError
		});
		return;
	}
	const decision = {
		requestId: data.requestId,
		intentDigest: data.intentDigest,
		confirmed: true,
		vrfChallenge,
		transactionContext
	};
	let decisionWithCredentials;
	let touchIdSuccess = false;
	try {
		const result = await collectTouchIdCredentials({
			ctx,
			data,
			decision
		});
		decisionWithCredentials = result.decisionWithCredentials;
		touchIdSuccess = decisionWithCredentials?.confirmed ?? false;
	} catch (touchIdError) {
		console.error("[SignerWorkerManager]: Failed to collect credentials:", touchIdError);
		const isCancelled = touchIdError instanceof DOMException && (touchIdError.name === "NotAllowedError" || touchIdError.name === "AbortError");
		if (isCancelled) console.log("[SignerWorkerManager]: User cancelled secure confirm request");
		decisionWithCredentials = {
			...decision,
			confirmed: false,
			error: isCancelled ? "User cancelled secure confirm request" : "Failed to collect credentials",
			_confirmHandle: void 0
		};
		touchIdSuccess = false;
	} finally {
		closeModalSafely(confirmHandle, touchIdSuccess);
	}
	try {
		if (!decisionWithCredentials?.confirmed) nearRpcResult.reservedNonces?.forEach((n) => ctx.nonceManager.releaseNonce(n));
	} catch (e) {
		console.warn("[SignerWorkerManager]: Failed to release reserved nonces after decision:", e);
	}
	sendWorkerResponse(worker, decisionWithCredentials);
}
/**
* Performs NEAR RPC call to get nonce, block hash and height
* Uses NonceManager if available, otherwise falls back to direct RPC calls
* For batch transactions, reserves nonces for each transaction
*/
async function performNearRpcCalls(ctx, data) {
	try {
		const transactionContext = await ctx.nonceManager.getNonceBlockHashAndHeight(ctx.nearClient);
		console.log("Using NonceManager smart caching");
		const txCount = data.tx_signing_requests?.length || 1;
		let reservedNonces;
		try {
			reservedNonces = ctx.nonceManager.reserveNonces(txCount);
			console.log(`[NonceManager]: Reserved ${txCount} nonce(s):`, reservedNonces);
			transactionContext.nextNonce = reservedNonces[0];
		} catch (error) {
			console.warn(`[NonceManager]: Failed to reserve ${txCount} nonce(s):`, error);
		}
		return {
			transactionContext,
			error: void 0,
			details: void 0,
			reservedNonces
		};
	} catch (error) {
		return {
			transactionContext: null,
			error: "NEAR_RPC_FAILED",
			details: error instanceof Error ? error.message : String(error)
		};
	}
}
/**
* Validates and parses the confirmation request data
*/
function validateAndParseRequest({ ctx, message }) {
	const data = message.data;
	if (!data || !data.requestId) throw new Error("Invalid secure confirm request - missing requestId");
	const summary = parseTransactionSummary(data.summary);
	const confirmationConfig = data.confirmationConfig || ctx.userPreferencesManager.getConfirmationConfig();
	const transactionSummary = {
		totalAmount: summary?.totalAmount,
		method: summary?.method || (data.isRegistration ? "Register Account" : void 0),
		intentDigest: data.intentDigest
	};
	return {
		data,
		summary,
		confirmationConfig,
		transactionSummary
	};
}
/**
* Determines user confirmation based on UI mode and configuration
*/
async function renderUserConfirmUI({ ctx, data, confirmationConfig, transactionSummary, vrfChallenge }) {
	switch (confirmationConfig.uiMode) {
		case "skip": return {
			confirmed: true,
			confirmHandle: void 0
		};
		case "embedded": try {
			const hostEl = document.querySelector(IFRAME_BUTTON_ID);
			if (hostEl && confirmationConfig.theme) hostEl.tooltipTheme = confirmationConfig.theme;
			let uiDigest = null;
			if (hostEl?.requestUiIntentDigest) {
				uiDigest = await hostEl.requestUiIntentDigest();
				console.log("[SecureConfirm] digest check", {
					uiDigest,
					intentDigest: data.intentDigest
				});
			} else console.error("[SecureConfirm]: missing requestUiIntentDigest on secure element");
			if (uiDigest !== data.intentDigest) {
				console.error("[SecureConfirm]: UI digest mismatch");
				const errPayload = JSON.stringify({
					code: "ui_digest_mismatch",
					uiDigest,
					intentDigest: data.intentDigest
				});
				return {
					confirmed: false,
					confirmHandle: void 0,
					error: errPayload
				};
			}
			return {
				confirmed: true,
				confirmHandle: void 0
			};
		} catch (e) {
			console.error("[SecureConfirm]: Failed to validate UI digest", e);
			return {
				confirmed: false,
				confirmHandle: void 0,
				error: "ui_digest_validation_failed"
			};
		}
		case "modal": if (confirmationConfig.behavior === "autoProceed") {
			const handle = await mountIframeModalHostWithHandle({
				ctx,
				summary: transactionSummary,
				txSigningRequests: data.tx_signing_requests,
				vrfChallenge,
				loading: true,
				theme: confirmationConfig.theme
			});
			const delay = confirmationConfig.autoProceedDelay ?? 1e3;
			await new Promise((resolve) => setTimeout(resolve, delay));
			return {
				confirmed: true,
				confirmHandle: handle
			};
		} else {
			const { confirmed, handle } = await awaitIframeModalDecisionWithHandle({
				ctx,
				summary: transactionSummary,
				txSigningRequests: data.tx_signing_requests,
				vrfChallenge,
				theme: confirmationConfig.theme
			});
			return {
				confirmed,
				confirmHandle: handle
			};
		}
		default: {
			const handle = await mountIframeModalHostWithHandle({
				ctx,
				summary: transactionSummary,
				txSigningRequests: data.tx_signing_requests,
				vrfChallenge,
				loading: true,
				theme: confirmationConfig.theme
			});
			return {
				confirmed: true,
				confirmHandle: handle
			};
		}
	}
}
/**
* Collects WebAuthn credentials and PRF output if conditions are met
*/
async function collectTouchIdCredentials({ ctx, data, decision }) {
	const nearAccountId = data.rpcCall?.nearAccountId || data.nearAccountId;
	const vrfChallenge = decision.vrfChallenge;
	if (!nearAccountId) throw new Error("nearAccountId not available for credential collection");
	if (!vrfChallenge) throw new Error("VRF challenge not available for credential collection");
	const authenticators = await ctx.indexedDB.clientDB.getAuthenticatorsByUser(toAccountId(nearAccountId));
	const credential = await ctx.touchIdPrompt.getCredentials({
		nearAccountId,
		challenge: vrfChallenge,
		authenticators
	});
	const dualPrfOutputs = extractPrfFromCredential({
		credential,
		firstPrfOutput: true,
		secondPrfOutput: data.isRegistration
	});
	if (!dualPrfOutputs.chacha20PrfOutput) throw new Error("Failed to extract PRF output from credential");
	const serializedCredential = data.isRegistration ? serializeRegistrationCredentialWithPRF({
		credential,
		firstPrfOutput: true,
		secondPrfOutput: true
	}) : serializeAuthenticationCredentialWithPRF({ credential });
	return { decisionWithCredentials: {
		...decision,
		credential: serializedCredential,
		prfOutput: dualPrfOutputs.chacha20PrfOutput,
		confirmed: true,
		_confirmHandle: void 0
	} };
}
/**
* Safely parses transaction summary data, handling both string and object formats
*/
function parseTransactionSummary(summaryData) {
	if (!summaryData) return {};
	if (typeof summaryData === "string") try {
		return JSON.parse(summaryData);
	} catch (parseError) {
		console.warn("[SignerWorkerManager]: Failed to parse summary string:", parseError);
		return {};
	}
	if (typeof summaryData === "object" && summaryData !== null) return summaryData;
	console.warn("[SignerWorkerManager]: Unexpected summary data type:", typeof summaryData);
	return {};
}
/**
* Safely closes modal with error handling
*/
function closeModalSafely(confirmHandle, confirmed) {
	if (confirmHandle?.close) try {
		confirmHandle.close(confirmed);
		console.log("[SecureConfirm] Modal closed safely");
	} catch (modalError) {
		console.warn("[SecureConfirm] Error closing modal:", modalError);
	}
}
/**
* Sends response to worker with consistent message format
*/
function sendWorkerResponse(worker, responseData) {
	const sanitized = sanitizeForPostMessage(responseData);
	worker.postMessage({
		type: SecureConfirmMessageType.USER_PASSKEY_CONFIRM_RESPONSE,
		data: sanitized
	});
}
function sanitizeForPostMessage(data) {
	if (data == null) return data;
	if (typeof data !== "object") return data;
	const out = Array.isArray(data) ? [] : {};
	for (const key of Object.keys(data)) {
		if (key === "_confirmHandle") continue;
		const value = data[key];
		if (typeof value === "function") continue;
		out[key] = value;
	}
	return out;
}

//#endregion
export { handlePromptUserConfirmInJsMainThread };
//# sourceMappingURL=handleSecureConfirmRequest.js.map