import { LitElementWithProps, e, i, n, x } from "./LitElementWithProps-JEO1-s_8.js";
import { toAccountId } from "./accountIds-CHODFDj_.js";
import { ActionType, toActionArgsWasm } from "./actions-VhrvT5cf.js";
import { BUTTON_WITH_TOOLTIP_ID, EMBEDDED_SDK_BASE_PATH, IFRAME_BOOTSTRAP_MODULE, IFRAME_BUTTON_ID } from "./tags-CCvVsAOz.js";

//#region src/core/types/passkeyManager.ts
let ActionPhase = /* @__PURE__ */ function(ActionPhase$1) {
	ActionPhase$1["STEP_1_PREPARATION"] = "preparation";
	ActionPhase$1["STEP_2_USER_CONFIRMATION"] = "user-confirmation";
	ActionPhase$1["STEP_3_CONTRACT_VERIFICATION"] = "contract-verification";
	ActionPhase$1["STEP_4_WEBAUTHN_AUTHENTICATION"] = "webauthn-authentication";
	ActionPhase$1["STEP_5_AUTHENTICATION_COMPLETE"] = "authentication-complete";
	ActionPhase$1["STEP_6_TRANSACTION_SIGNING_PROGRESS"] = "transaction-signing-progress";
	ActionPhase$1["STEP_7_TRANSACTION_SIGNING_COMPLETE"] = "transaction-signing-complete";
	ActionPhase$1["WASM_ERROR"] = "wasm-error";
	ActionPhase$1["STEP_8_BROADCASTING"] = "broadcasting";
	ActionPhase$1["STEP_9_ACTION_COMPLETE"] = "action-complete";
	ActionPhase$1["ACTION_ERROR"] = "action-error";
	return ActionPhase$1;
}({});
let ActionStatus = /* @__PURE__ */ function(ActionStatus$1) {
	ActionStatus$1["PROGRESS"] = "progress";
	ActionStatus$1["SUCCESS"] = "success";
	ActionStatus$1["ERROR"] = "error";
	return ActionStatus$1;
}({});

//#endregion
//#region src/core/PasskeyManager/actions.ts
/**
* 3. Transaction Broadcasting - Broadcasts the signed transaction to NEAR network
* This method broadcasts a previously signed transaction and waits for execution
*
* @param context - PasskeyManager context
* @param signedTransaction - The signed transaction to broadcast
* @param waitUntil - The execution status to wait for (defaults to FINAL)
* @returns Promise resolving to the transaction execution outcome
*
* @example
* ```typescript
* // Sign a transaction first
* const signedTransactions = await signTransactionsWithActions(context, 'alice.near', {
*   transactions: [{
*     nearAccountId: 'alice.near',
*     receiverId: 'bob.near',
*     actions: [{
*       action_type: ActionType.Transfer,
*       deposit: '1000000000000000000000000'
*     }],
*     nonce: '123'
*   }]
* });
*
* // Then broadcast it
* const result = await sendTransaction(
*   context,
*   signedTransactions[0].signedTransaction,
*   TxExecutionStatus.FINAL
* );
* console.log('Transaction ID:', result.transaction_outcome?.id);
* ```
*
* sendTransaction centrally manages nonce lifecycle around broadcast:
* - On success: reconciles nonce with chain via updateNonceFromBlockchain() (async),
*   which also prunes any stale reservations.
* - On failure: releases the reserved nonce immediately to avoid leaks.
* Callers SHOULD NOT release the nonce in their own catch blocks.
*/
async function sendTransaction({ context, signedTransaction, options }) {
	options?.onEvent?.({
		step: 8,
		phase: ActionPhase.STEP_8_BROADCASTING,
		status: ActionStatus.PROGRESS,
		message: `Broadcasting transaction...`
	});
	let transactionResult;
	let txId;
	try {
		transactionResult = await context.nearClient.sendTransaction(signedTransaction, options?.waitUntil);
		txId = transactionResult.transaction?.hash || transactionResult.transaction?.id;
		const nonce = signedTransaction.transaction.nonce;
		context.webAuthnManager.getNonceManager().updateNonceFromBlockchain(context.nearClient, nonce.toString()).catch((error) => {
			console.warn("[sendTransaction] Failed to update nonce from blockchain:", error);
		});
		options?.onEvent?.({
			step: 8,
			phase: ActionPhase.STEP_8_BROADCASTING,
			status: ActionStatus.SUCCESS,
			message: `Transaction ${txId} sent successfully`
		});
		options?.onEvent?.({
			step: 9,
			phase: ActionPhase.STEP_9_ACTION_COMPLETE,
			status: ActionStatus.SUCCESS,
			message: `Transaction ${txId} completed `
		});
	} catch (error) {
		console.error("[sendTransaction] failed:", error);
		try {
			const nonce = signedTransaction.transaction.nonce;
			context.webAuthnManager.getNonceManager().releaseNonce(nonce.toString());
		} catch (nonceError) {
			console.warn("[sendTransaction]: Failed to release nonce after failure:", nonceError);
		}
		throw error;
	}
	const actionResult = {
		success: true,
		transactionId: txId,
		result: transactionResult
	};
	return actionResult;
}
async function signAndSendTransactionsInternal({ context, nearAccountId, transactionInputs, options, confirmationConfigOverride }) {
	try {
		const signedTxs = await signTransactionsWithActionsInternal({
			context,
			nearAccountId,
			transactionInputs,
			options,
			confirmationConfigOverride
		});
		if (options?.executeSequentially) {
			const txResults = [];
			for (const tx of signedTxs) {
				const txResult = await sendTransaction({
					context,
					signedTransaction: tx.signedTransaction,
					options
				});
				txResults.push(txResult);
			}
			return txResults;
		} else return Promise.all(signedTxs.map(async (tx) => sendTransaction({
			context,
			signedTransaction: tx.signedTransaction,
			options
		})));
	} catch (error) {
		context.webAuthnManager.getNonceManager().releaseAllNonces();
		throw error;
	}
}
/**
* Internal API for signing transactions with actions
* @internal - Only used by internal SDK components with confirmationConfigOverride
*
* @param context - PasskeyManager context
* @param nearAccountId - NEAR account ID to sign transactions with
* @param actionArgs - Action arguments to sign transactions with
* @param options - Options for the action
* @returns Promise resolving to the action result
*/
async function signTransactionsWithActionsInternal({ context, nearAccountId, transactionInputs, options, confirmationConfigOverride }) {
	const { onEvent, onError, hooks, waitUntil } = options || {};
	try {
		await options?.hooks?.beforeCall?.();
		onEvent?.({
			step: 1,
			phase: ActionPhase.STEP_1_PREPARATION,
			status: ActionStatus.PROGRESS,
			message: transactionInputs.length > 1 ? `Starting batched transaction with ${transactionInputs.length} actions` : `Starting ${transactionInputs[0].actions[0].type} action`
		});
		await validateInputsOnly(nearAccountId, transactionInputs, {
			onEvent,
			onError,
			hooks,
			waitUntil
		});
		const signedTxs = await wasmAuthenticateAndSignTransactions(context, nearAccountId, transactionInputs, {
			onEvent,
			onError,
			hooks,
			waitUntil,
			confirmationConfigOverride
		});
		return signedTxs;
	} catch (error) {
		console.error("[signTransactionsWithActions] Error during execution:", error);
		onError?.(error);
		onEvent?.({
			step: 0,
			phase: ActionPhase.ACTION_ERROR,
			status: ActionStatus.ERROR,
			message: `Action failed: ${error.message}`,
			error: error.message
		});
		throw error;
	}
}
/**
* 1. Input Validation - Validates inputs without fetching NEAR data
*/
async function validateInputsOnly(nearAccountId, transactionInputs, options) {
	const { onEvent, onError, hooks } = options || {};
	if (!nearAccountId) throw new Error("User not logged in or NEAR account ID not set for direct action.");
	onEvent?.({
		step: 1,
		phase: ActionPhase.STEP_1_PREPARATION,
		status: ActionStatus.PROGRESS,
		message: "Validating inputs..."
	});
	for (const transactionInput of transactionInputs) {
		if (!transactionInput.receiverId) throw new Error("Missing required parameter: receiverId");
		for (const action of transactionInput.actions) {
			if (action.type === ActionType.FunctionCall && (!action.methodName || action.args === void 0)) throw new Error("Missing required parameters for function call: methodName or args");
			if (action.type === ActionType.Transfer && !action.amount) throw new Error("Missing required parameter for transfer: amount");
		}
	}
}
/**
* 2. VRF Authentication - Handles VRF challenge generation and WebAuthn authentication
*  with the webauthn contract
*/
async function wasmAuthenticateAndSignTransactions(context, nearAccountId, transactionInputs, options) {
	const { onEvent, onError, hooks, confirmationConfigOverride } = options || {};
	const { webAuthnManager } = context;
	onEvent?.({
		step: 2,
		phase: ActionPhase.STEP_2_USER_CONFIRMATION,
		status: ActionStatus.PROGRESS,
		message: "Requesting user confirmation..."
	});
	const transactionInputsWasm = transactionInputs.map((tx, i$1) => {
		return {
			receiverId: tx.receiverId,
			actions: tx.actions.map((action) => toActionArgsWasm(action))
		};
	});
	const signedTxs = await webAuthnManager.signTransactionsWithActions({
		transactions: transactionInputsWasm,
		rpcCall: {
			contractId: context.configs.contractId,
			nearRpcUrl: context.configs.nearRpcUrl,
			nearAccountId
		},
		confirmationConfigOverride,
		onEvent: onEvent ? (progressEvent) => {
			if (progressEvent.phase === ActionPhase.STEP_4_WEBAUTHN_AUTHENTICATION) onEvent?.({
				step: 4,
				phase: ActionPhase.STEP_4_WEBAUTHN_AUTHENTICATION,
				status: ActionStatus.PROGRESS,
				message: "Authenticating with WebAuthn contract..."
			});
			if (progressEvent.phase === ActionPhase.STEP_5_AUTHENTICATION_COMPLETE) onEvent?.({
				step: 5,
				phase: ActionPhase.STEP_5_AUTHENTICATION_COMPLETE,
				status: ActionStatus.SUCCESS,
				message: "WebAuthn verification complete"
			});
			if (progressEvent.phase === ActionPhase.STEP_6_TRANSACTION_SIGNING_PROGRESS) onEvent?.({
				step: 6,
				phase: ActionPhase.STEP_6_TRANSACTION_SIGNING_PROGRESS,
				status: ActionStatus.PROGRESS,
				message: "Signing transaction..."
			});
			if (progressEvent.phase === ActionPhase.STEP_7_TRANSACTION_SIGNING_COMPLETE) onEvent?.({
				step: 7,
				phase: ActionPhase.STEP_7_TRANSACTION_SIGNING_COMPLETE,
				status: ActionStatus.SUCCESS,
				message: "Transaction signed successfully"
			});
			onEvent({ ...progressEvent });
		} : void 0
	});
	return signedTxs;
}

//#endregion
//#region src/core/WebAuthnManager/LitComponents/base-styles.ts
/**
* Base color palette for Web3Auth Lit components
*/
const CHROMA_COLORS = {
	yellow50: "oklch(0.97 0.050 95)",
	yellow100: "oklch(0.95 0.070 95)",
	yellow150: "oklch(0.93 0.082 95)",
	yellow200: "oklch(0.90 0.094 95)",
	yellow250: "oklch(0.87 0.108 95)",
	yellow300: "oklch(0.82 0.140 95)",
	yellow350: "oklch(0.78 0.160 95)",
	yellow400: "oklch(0.74 0.176 95)",
	yellow450: "oklch(0.70 0.184 95)",
	yellow500: "oklch(0.66 0.188 95)",
	yellow550: "oklch(0.62 0.182 95)",
	yellow600: "oklch(0.56 0.160 95)",
	yellow650: "oklch(0.52 0.138 95)",
	yellow700: "oklch(0.46 0.106 95)",
	yellow750: "oklch(0.42 0.086 95)",
	yellow800: "oklch(0.36 0.062 95)",
	yellow850: "oklch(0.32 0.052 95)",
	yellow900: "oklch(0.26 0.044 95)",
	yellow950: "oklch(0.22 0.036 95)",
	blue50: "oklch(0.97 0.040 255)",
	blue100: "oklch(0.95 0.062 255)",
	blue150: "oklch(0.93 0.074 255)",
	blue200: "oklch(0.90 0.086 255)",
	blue250: "oklch(0.87 0.100 255)",
	blue300: "oklch(0.82 0.130 255)",
	blue350: "oklch(0.78 0.150 255)",
	blue400: "oklch(0.74 0.166 255)",
	blue450: "oklch(0.70 0.174 255)",
	blue500: "oklch(0.66 0.180 255)",
	blue550: "oklch(0.62 0.176 255)",
	blue600: "oklch(0.56 0.158 255)",
	blue650: "oklch(0.52 0.138 255)",
	blue700: "oklch(0.46 0.108 255)",
	blue750: "oklch(0.42 0.088 255)",
	blue800: "oklch(0.36 0.065 255)",
	blue850: "oklch(0.32 0.056 255)",
	blue900: "oklch(0.26 0.050 255)",
	blue950: "oklch(0.22 0.040 255)",
	red50: "oklch(0.97 0.040 19)",
	red100: "oklch(0.95 0.060 19)",
	red150: "oklch(0.93 0.072 19)",
	red200: "oklch(0.90 0.086 19)",
	red250: "oklch(0.87 0.100 19)",
	red300: "oklch(0.82 0.130 19)",
	red350: "oklch(0.78 0.150 19)",
	red400: "oklch(0.74 0.166 19)",
	red450: "oklch(0.70 0.174 19)",
	red500: "oklch(0.66 0.180 19)",
	red550: "oklch(0.62 0.176 19)",
	red600: "oklch(0.56 0.158 19)",
	red650: "oklch(0.52 0.138 19)",
	red700: "oklch(0.46 0.108 19)",
	red750: "oklch(0.42 0.088 19)",
	red800: "oklch(0.36 0.065 19)",
	red850: "oklch(0.32 0.056 19)",
	red900: "oklch(0.26 0.050 19)",
	red950: "oklch(0.22 0.040 19)",
	violet50: "oklch(0.97 0.042 305)",
	violet100: "oklch(0.95 0.060 305)",
	violet150: "oklch(0.93 0.072 305)",
	violet200: "oklch(0.90 0.086 305)",
	violet250: "oklch(0.87 0.102 305)",
	violet300: "oklch(0.82 0.136 305)",
	violet350: "oklch(0.78 0.156 305)",
	violet400: "oklch(0.74 0.170 305)",
	violet450: "oklch(0.70 0.178 305)",
	violet500: "oklch(0.66 0.184 305)",
	violet550: "oklch(0.62 0.178 305)",
	violet600: "oklch(0.56 0.156 305)",
	violet650: "oklch(0.52 0.132 305)",
	violet700: "oklch(0.46 0.104 305)",
	violet750: "oklch(0.42 0.084 305)",
	violet800: "oklch(0.36 0.062 305)",
	violet850: "oklch(0.32 0.054 305)",
	violet900: "oklch(0.26 0.046 305)",
	violet950: "oklch(0.22 0.038 305)",
	green50: "oklch(0.97 0.040 170)",
	green100: "oklch(0.95 0.062 170)",
	green150: "oklch(0.93 0.074 170)",
	green200: "oklch(0.90 0.086 170)",
	green250: "oklch(0.87 0.100 170)",
	green300: "oklch(0.82 0.130 170)",
	green350: "oklch(0.78 0.150 170)",
	green400: "oklch(0.74 0.166 170)",
	green450: "oklch(0.70 0.174 170)",
	green500: "oklch(0.66 0.180 170)",
	green550: "oklch(0.62 0.176 170)",
	green600: "oklch(0.56 0.158 170)",
	green650: "oklch(0.52 0.138 170)",
	green700: "oklch(0.46 0.108 170)",
	green750: "oklch(0.42 0.088 170)",
	green800: "oklch(0.36 0.065 170)",
	green850: "oklch(0.32 0.056 170)",
	green900: "oklch(0.26 0.050 170)",
	green950: "oklch(0.22 0.040 170)"
};
const GREY_COLORS = {
	grey25: "oklch(0.99 0.001 240)",
	grey50: "oklch(0.98 0 0)",
	grey75: "oklch(0.97 0.002 240)",
	grey100: "oklch(0.95 0.005 240)",
	grey150: "oklch(0.92 0.007 240)",
	grey200: "oklch(0.88 0.01 240)",
	grey250: "oklch(0.85 0.012 240)",
	grey300: "oklch(0.8 0.015 240)",
	grey350: "oklch(0.75 0.017 240)",
	grey400: "oklch(0.65 0.02 240)",
	grey450: "oklch(0.6 0.021 240)",
	grey500: "oklch(0.53 0.02 240)",
	grey550: "oklch(0.48 0.02 240)",
	grey600: "oklch(0.4 0.02 240)",
	grey650: "oklch(0.35 0.018 240)",
	grey700: "oklch(0.3 0.015 240)",
	grey750: "oklch(0.25 0.012 240)",
	grey800: "oklch(0.2 0.01 240)",
	grey850: "oklch(0.15 0.008 240)",
	grey900: "oklch(0.1 0.005 240)",
	grey950: "oklch(0.05 0.002 240)",
	grey975: "oklch(0.025 0.001 240)",
	slate25: "oklch(0.99 0.003 240)",
	slate50: "oklch(0.98 0.005 240)",
	slate100: "oklch(0.95 0.01 240)",
	slate150: "oklch(0.915 0.0125 240)",
	slate200: "oklch(0.88 0.015 240)",
	slate250: "oklch(0.84 0.0175 240)",
	slate300: "oklch(0.8 0.02 240)",
	slate350: "oklch(0.725 0.0225 240)",
	slate400: "oklch(0.65 0.025 240)",
	slate450: "oklch(0.59 0.0275 240)",
	slate500: "oklch(0.53 0.03 240)",
	slate550: "oklch(0.465 0.0275 240)",
	slate600: "oklch(0.4 0.025 240)",
	slate650: "oklch(0.35 0.0225 240)",
	slate700: "oklch(0.3 0.02 240)",
	slate750: "oklch(0.25 0.0175 240)",
	slate800: "oklch(0.2 0.015 240)",
	slate850: "oklch(0.15 0.0125 240)",
	slate900: "oklch(0.1 0.01 240)"
};
const GRADIENTS = {
	blue: `linear-gradient(45deg, ${CHROMA_COLORS.blue300} 0%, ${CHROMA_COLORS.blue500} 50%)`,
	red: `linear-gradient(45deg, ${CHROMA_COLORS.red300} 0%, ${CHROMA_COLORS.red500} 50%)`,
	green: `linear-gradient(45deg, ${CHROMA_COLORS.green300} 0%, ${CHROMA_COLORS.green500} 50%)`,
	yellow: `linear-gradient(45deg, ${CHROMA_COLORS.yellow300} 0%, ${CHROMA_COLORS.yellow500} 50%)`,
	peach: "linear-gradient(90deg, hsla(24, 100%, 83%, 1) 0%, hsla(341, 91%, 68%, 1) 100%)",
	aqua: "linear-gradient(90deg, hsla(145, 83%, 74%, 1) 0%, hsla(204, 77%, 76%, 1) 100%)",
	blueWhite: "linear-gradient(90deg, hsla(213, 62%, 45%, 1) 0%, hsla(203, 89%, 71%, 1) 50%, hsla(0, 0%, 96%, 1) 100%)"
};
const DARK_THEME = {
	...GREY_COLORS,
	textPrimary: GREY_COLORS.grey75,
	textSecondary: GREY_COLORS.grey500,
	textMuted: GREY_COLORS.grey650,
	colorBackground: GREY_COLORS.grey800,
	colorSurface: GREY_COLORS.grey750,
	colorSurface2: GREY_COLORS.slate700,
	colorBorder: GREY_COLORS.grey700,
	grey25: GREY_COLORS.grey25,
	grey50: GREY_COLORS.grey50,
	grey75: GREY_COLORS.grey75,
	grey100: GREY_COLORS.grey100,
	grey200: GREY_COLORS.grey200,
	grey300: GREY_COLORS.grey300,
	grey400: GREY_COLORS.grey400,
	grey500: GREY_COLORS.grey500,
	grey600: GREY_COLORS.grey600,
	grey650: GREY_COLORS.grey650,
	grey700: GREY_COLORS.grey700,
	grey750: GREY_COLORS.grey750,
	red200: CHROMA_COLORS.red200,
	red300: CHROMA_COLORS.red300,
	red400: CHROMA_COLORS.red400,
	red500: CHROMA_COLORS.red500,
	red600: CHROMA_COLORS.red600,
	yellow200: CHROMA_COLORS.yellow200,
	yellow300: CHROMA_COLORS.yellow300,
	yellow400: CHROMA_COLORS.yellow400,
	yellow500: CHROMA_COLORS.yellow500,
	yellow600: CHROMA_COLORS.yellow600,
	blue200: CHROMA_COLORS.blue200,
	blue300: CHROMA_COLORS.blue300,
	blue400: CHROMA_COLORS.blue400,
	blue500: CHROMA_COLORS.blue500,
	blue600: CHROMA_COLORS.blue600,
	green200: CHROMA_COLORS.green200,
	green300: CHROMA_COLORS.green300,
	green400: CHROMA_COLORS.green400,
	green500: CHROMA_COLORS.green500,
	green600: CHROMA_COLORS.green600,
	highlightReceiverId: CHROMA_COLORS.blue400,
	highlightMethodName: CHROMA_COLORS.blue400,
	highlightAmount: CHROMA_COLORS.blue400,
	highlightReceiverIdBackground: GRADIENTS.aqua,
	highlightMethodNameBackground: GRADIENTS.aqua,
	highlightAmountBackground: GRADIENTS.peach,
	colorPrimary: CHROMA_COLORS.blue500,
	gradientPeach: GRADIENTS.peach,
	gradientAqua: GRADIENTS.aqua
};
const LIGHT_THEME = {
	...GREY_COLORS,
	textPrimary: GREY_COLORS.grey975,
	textSecondary: GREY_COLORS.grey500,
	textMuted: GREY_COLORS.grey350,
	colorBackground: GREY_COLORS.grey50,
	colorSurface: GREY_COLORS.grey150,
	colorSurface2: GREY_COLORS.slate150,
	colorBorder: GREY_COLORS.grey200,
	grey25: GREY_COLORS.grey25,
	grey50: GREY_COLORS.grey50,
	grey75: GREY_COLORS.grey75,
	grey100: GREY_COLORS.grey100,
	grey200: GREY_COLORS.grey200,
	grey300: GREY_COLORS.grey300,
	grey400: GREY_COLORS.grey400,
	grey500: GREY_COLORS.grey500,
	grey600: GREY_COLORS.grey600,
	grey650: GREY_COLORS.grey650,
	grey700: GREY_COLORS.grey700,
	grey750: GREY_COLORS.grey750,
	slate25: GREY_COLORS.slate25,
	slate100: GREY_COLORS.slate100,
	slate150: GREY_COLORS.slate150,
	slate200: GREY_COLORS.slate200,
	slate300: GREY_COLORS.slate300,
	red200: CHROMA_COLORS.red200,
	red300: CHROMA_COLORS.red300,
	red400: CHROMA_COLORS.red400,
	red500: CHROMA_COLORS.red500,
	red600: CHROMA_COLORS.red600,
	yellow200: CHROMA_COLORS.yellow200,
	yellow300: CHROMA_COLORS.yellow300,
	yellow400: CHROMA_COLORS.yellow400,
	yellow500: CHROMA_COLORS.yellow500,
	yellow600: CHROMA_COLORS.yellow600,
	blue200: CHROMA_COLORS.blue200,
	blue300: CHROMA_COLORS.blue300,
	blue400: CHROMA_COLORS.blue400,
	blue500: CHROMA_COLORS.blue500,
	blue600: CHROMA_COLORS.blue600,
	green200: CHROMA_COLORS.green200,
	green300: CHROMA_COLORS.green300,
	green400: CHROMA_COLORS.green400,
	green500: CHROMA_COLORS.green500,
	green600: CHROMA_COLORS.green600,
	highlightReceiverId: CHROMA_COLORS.blue500,
	highlightMethodName: CHROMA_COLORS.blue500,
	highlightAmount: CHROMA_COLORS.blue500,
	highlightReceiverIdBackground: GRADIENTS.aqua,
	highlightMethodNameBackground: GRADIENTS.aqua,
	highlightAmountBackground: GRADIENTS.peach,
	colorPrimary: CHROMA_COLORS.blue500,
	gradientPeach: GRADIENTS.peach,
	gradientAqua: GRADIENTS.aqua
};

//#endregion
//#region src/core/WebAuthnManager/LitComponents/TxTree/tx-tree-themes.ts
const TX_TREE_THEMES = {
	dark: {
		...DARK_THEME,
		host: {
			fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif",
			fontSize: "1rem",
			color: DARK_THEME.textPrimary,
			backgroundColor: DARK_THEME.colorBackground
		},
		tooltipBorderOuter: {
			background: "transparent",
			border: `1px solid transparent`,
			borderRadius: "28px",
			padding: "0.5rem"
		},
		tooltipBorderInner: {
			borderRadius: "24px",
			border: `1px solid transparent`,
			boxShadow: "0 1px 3px 0px rgba(5, 5, 5, 0.4)"
		},
		tooltipTreeRoot: {
			padding: "0.5rem",
			background: DARK_THEME.colorBackground,
			border: "none",
			color: DARK_THEME.textPrimary
		},
		tooltipTreeChildren: {},
		details: {
			borderRadius: "0.5rem",
			background: "transparent"
		},
		summary: { padding: "0.5rem 0.75rem" },
		summaryRow: { background: "transparent" },
		summaryRowHover: {
			background: DARK_THEME.colorSurface,
			borderColor: DARK_THEME.textSecondary
		},
		row: {
			color: DARK_THEME.textPrimary,
			borderRadius: "0.375rem",
			transition: "all 160ms cubic-bezier(0.2, 0.6, 0.2, 1)"
		},
		indent: {},
		label: {
			color: DARK_THEME.textPrimary,
			fontSize: "0.875rem",
			gap: "4px",
			lineHeight: "1.5",
			border: "1px solid transparent",
			padding: "4px 16px",
			borderRadius: "1rem"
		},
		labelHover: {
			background: DARK_THEME.colorBorder,
			borderColor: DARK_THEME.textSecondary
		},
		chevron: {
			color: DARK_THEME.textSecondary,
			width: "14px",
			height: "14px"
		},
		fileRow: {
			padding: "0.5rem 0.75rem",
			fontSize: "0.875rem"
		},
		fileContent: {
			background: DARK_THEME.colorSurface,
			border: `1px solid none`,
			color: DARK_THEME.textSecondary,
			fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace",
			borderRadius: "0.5rem 1rem 1rem 0.5rem",
			padding: "0.5rem",
			scrollbarTrackBackground: DARK_THEME.colorSurface,
			scrollbarThumbBackground: DARK_THEME.textSecondary
		},
		connector: {
			color: DARK_THEME.grey600,
			thickness: "2px",
			elbowLength: "10px"
		},
		folderChildren: {
			padding: "0.5rem 0",
			marginLeft: "1rem"
		},
		highlightReceiverId: {
			color: DARK_THEME.highlightReceiverId,
			fontWeight: "600"
		},
		highlightMethodName: {
			color: DARK_THEME.highlightMethodName,
			fontWeight: "600"
		},
		highlightAmount: {
			color: DARK_THEME.highlightAmount,
			fontWeight: "600"
		},
		rootMobile: {
			borderRadius: "0.5rem",
			margin: "0"
		},
		treeChildrenMobile: { padding: "0.75rem" },
		folderChildrenMobile: { marginLeft: "0.75rem" },
		rowMobile: { padding: "0.5rem" },
		fileContentMobile: {
			fontSize: "0.7rem",
			maxHeight: "150px"
		}
	},
	light: {
		...LIGHT_THEME,
		host: {
			fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif",
			fontSize: "1rem",
			color: LIGHT_THEME.textPrimary,
			backgroundColor: LIGHT_THEME.colorBackground
		},
		tooltipBorderOuter: {
			background: "transparent",
			border: `1px solid transparent`,
			borderRadius: "28px",
			padding: "0.5rem"
		},
		tooltipBorderInner: {
			borderRadius: "24px",
			border: `1px solid ${LIGHT_THEME.slate300}`,
			boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)"
		},
		tooltipTreeRoot: {
			padding: "0.5rem",
			background: LIGHT_THEME.colorBackground,
			border: "none",
			color: LIGHT_THEME.textPrimary
		},
		tooltipTreeChildren: {},
		details: {
			borderRadius: "0.5rem",
			background: "transparent"
		},
		summary: { padding: "0.5rem 0.75rem" },
		summaryRow: { background: "transparent" },
		summaryRowHover: {
			background: LIGHT_THEME.slate100,
			borderColor: LIGHT_THEME.colorBorder
		},
		row: {
			color: LIGHT_THEME.textPrimary,
			borderRadius: "0.375rem",
			transition: "all 160ms cubic-bezier(0.2, 0.6, 0.2, 1)"
		},
		indent: {},
		label: {
			color: LIGHT_THEME.textPrimary,
			fontSize: "0.875rem",
			gap: "4px",
			lineHeight: "1.5",
			border: "1px solid transparent",
			padding: "4px 16px",
			borderRadius: "1rem"
		},
		labelHover: {
			background: LIGHT_THEME.grey75,
			borderColor: LIGHT_THEME.colorBorder
		},
		chevron: {
			color: LIGHT_THEME.textSecondary,
			width: "14px",
			height: "14px"
		},
		fileRow: {
			padding: "0.5rem 0.75rem",
			fontSize: "0.875rem"
		},
		fileContent: {
			background: LIGHT_THEME.slate100,
			border: `1px solid ${LIGHT_THEME.colorBorder}`,
			color: LIGHT_THEME.textPrimary,
			fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace",
			borderRadius: "0.5rem 1rem 1rem 0.5rem",
			padding: "0.5rem",
			scrollbarTrackBackground: LIGHT_THEME.colorSurface,
			scrollbarThumbBackground: LIGHT_THEME.colorBorder
		},
		connector: {
			color: LIGHT_THEME.slate200,
			thickness: "2px",
			elbowLength: "10px"
		},
		folderChildren: {
			padding: "0.5rem 0",
			marginLeft: "1rem"
		},
		highlightReceiverId: {
			color: LIGHT_THEME.highlightReceiverId,
			fontWeight: "600"
		},
		highlightMethodName: {
			color: LIGHT_THEME.highlightMethodName,
			fontWeight: "600"
		},
		highlightAmount: {
			color: LIGHT_THEME.highlightAmount,
			fontWeight: "600"
		},
		rootMobile: {
			borderRadius: "0.5rem",
			margin: "0"
		},
		treeChildrenMobile: { padding: "0.75rem" },
		folderChildrenMobile: { marginLeft: "0.75rem" },
		rowMobile: { padding: "0.5rem" },
		fileContentMobile: {
			fontSize: "0.7rem",
			maxHeight: "150px"
		}
	}
};

//#endregion
//#region src/core/WebAuthnManager/LitComponents/IframeButtonWithTooltipConfirmer/button-with-tooltip-themes.ts
const EMBEDDED_TX_BUTTON_THEMES = {
	dark: {},
	light: {}
};

//#endregion
//#region src/core/WebAuthnManager/LitComponents/IframeButtonWithTooltipConfirmer/iframe-geometry.ts
/**
* Rounding & pixel-snapping strategy
*
* DOM measurements from getBoundingClientRect() often contain fractional values
* (e.g., width: 200.4px). If these are rounded the wrong way, the iframe that
* hosts the embedded UI can end up undersized by up to 1px, which manifests as
* a faint scrollbar or a clipped tooltip.
*
* To avoid this, we follow these rules across the embedded tooltip flow:
* - Positions (x, y): Math.floor — never extend negative space; align to pixels.
* - Sizes (width, height): Math.ceil — never shrink rectangles; ensure fit.
*
* The embedded element applies this when constructing TooltipGeometry from
* DOMRects. See EmbeddedTxButton.ts (buildGeometry).
* On the host side, computeExpandedIframeSizeFromGeometryPure()
* already uses Math.ceil on the right/bottom edges as a second line of defense.
*/
/**
* IframeClipPathGenerator creates precise clip-path polygons for button + tooltip unions.
* Supports all 8 tooltip positions with optimized shape algorithms.
*/
var IframeClipPathGenerator = class {
	static generateUnion(geometry, paddingPx = 0) {
		const pad = (r) => ({
			x: r.x - paddingPx,
			y: r.y - paddingPx,
			width: r.width + 2 * paddingPx,
			height: r.height + 2 * paddingPx,
			borderRadius: r.borderRadius
		});
		const button = paddingPx ? pad(geometry.button) : geometry.button;
		const tooltip = paddingPx ? pad(geometry.tooltip) : geometry.tooltip;
		const { position, gap } = geometry;
		if (!CSS.supports("clip-path: polygon(0 0)")) {
			console.warn("clip-path not supported, skipping shape generation");
			return "";
		}
		switch (position) {
			case "top-left": {
				const upper = button.y <= tooltip.y ? button : tooltip;
				const lower = upper === button ? tooltip : button;
				return this.generateVerticalLUnion(upper, lower, "left");
			}
			case "top-center": return this.generateTopCenterUnion(button, tooltip, gap);
			case "top-right": {
				const upper = button.y <= tooltip.y ? button : tooltip;
				const lower = upper === button ? tooltip : button;
				return this.generateVerticalLUnion(upper, lower, "right");
			}
			case "left": return this.generateLeftUnion(button, tooltip, gap);
			case "right": return this.generateRightUnion(button, tooltip, gap);
			case "bottom-left": {
				const upper = button.y <= tooltip.y ? button : tooltip;
				const lower = upper === button ? tooltip : button;
				return this.generateVerticalLUnion(upper, lower, "left");
			}
			case "bottom-center": return this.generateBottomCenterUnion(button, tooltip, gap);
			case "bottom-right": {
				const upper = button.y <= tooltip.y ? button : tooltip;
				const lower = upper === button ? tooltip : button;
				return this.generateVerticalLUnion(upper, lower, "right");
			}
			default:
				console.warn(`Unknown tooltip position: ${position}`);
				return this.generateTopCenterUnion(button, tooltip, gap);
		}
	}
	/**
	* Build an L-shaped rectilinear polygon for two vertically stacked rectangles (upper over lower).
	* The hingeSide selects which side (left|right) the connecting corridor should hug to avoid
	* capturing the opposite empty corner.
	*/
	static generateVerticalLUnion(upper, lower, hingeSide) {
		if (upper.y > lower.y) {
			const tmp = upper;
			upper = lower;
			lower = tmp;
		}
		const uL = upper.x;
		const uR = upper.x + upper.width;
		const uT = upper.y;
		const uB = upper.y + upper.height;
		const lL = lower.x;
		const lR = lower.x + lower.width;
		const lT = lower.y;
		const lB = lower.y + lower.height;
		const overlapY = Math.max(0, Math.min(uB, lB) - Math.max(uT, lT));
		if (overlapY > 0) {
			const minX = Math.min(uL, lL);
			const maxX = Math.max(uR, lR);
			const minY = Math.min(uT, lT);
			const maxY = Math.max(uB, lB);
			return `polygon(${minX}px ${minY}px, ${maxX}px ${minY}px, ${maxX}px ${maxY}px, ${minX}px ${maxY}px)`;
		}
		let points = [];
		if (hingeSide === "left") points = [
			{
				x: uL,
				y: uT
			},
			{
				x: uR,
				y: uT
			},
			{
				x: uR,
				y: uB
			},
			{
				x: uL,
				y: uB
			},
			{
				x: lL,
				y: uB
			},
			{
				x: lL,
				y: lB
			},
			{
				x: lR,
				y: lB
			},
			{
				x: lR,
				y: lT
			},
			{
				x: uL,
				y: lT
			},
			{
				x: uL,
				y: uT
			}
		];
		else points = [
			{
				x: uL,
				y: uT
			},
			{
				x: uR,
				y: uT
			},
			{
				x: uR,
				y: uB
			},
			{
				x: lR,
				y: uB
			},
			{
				x: lR,
				y: lB
			},
			{
				x: lL,
				y: lB
			},
			{
				x: lL,
				y: lT
			},
			{
				x: uR,
				y: lT
			},
			{
				x: uR,
				y: uT
			},
			{
				x: uL,
				y: uT
			}
		];
		const deduped = points.filter((p, i$1, arr) => i$1 === 0 || !(p.x === arr[i$1 - 1].x && p.y === arr[i$1 - 1].y));
		const coords = deduped.map((p) => `${p.x}px ${p.y}px`).join(", ");
		return `polygon(${coords})`;
	}
	static generateTopCenterUnion(button, tooltip, gap) {
		const minX = Math.min(button.x, tooltip.x);
		const maxX = Math.max(button.x + button.width, tooltip.x + tooltip.width);
		const minY = tooltip.y;
		const maxY = button.y + button.height;
		const borderRadius = 2;
		const width = maxX - minX;
		const height = maxY - minY;
		return `polygon(${this.createRoundedRect(minX, minY, width, height, borderRadius)})`;
	}
	static generateBottomCenterUnion(button, tooltip, gap) {
		const minX = Math.min(button.x, tooltip.x);
		const maxX = Math.max(button.x + button.width, tooltip.x + tooltip.width);
		const minY = button.y;
		const maxY = tooltip.y + tooltip.height;
		const borderRadius = 2;
		const width = maxX - minX;
		const height = maxY - minY;
		return `polygon(${this.createRoundedRect(minX, minY, width, height, borderRadius)})`;
	}
	static generateLeftUnion(button, tooltip, gap) {
		const minX = tooltip.x;
		const maxX = button.x + button.width;
		const minY = Math.min(button.y, tooltip.y);
		const maxY = Math.max(button.y + button.height, tooltip.y + tooltip.height);
		const borderRadius = 2;
		const width = maxX - minX;
		const height = maxY - minY;
		return `polygon(${this.createRoundedRect(minX, minY, width, height, borderRadius)})`;
	}
	static generateRightUnion(button, tooltip, gap) {
		const minX = button.x;
		const maxX = tooltip.x + tooltip.width;
		const minY = Math.min(button.y, tooltip.y);
		const maxY = Math.max(button.y + button.height, tooltip.y + tooltip.height);
		const borderRadius = 2;
		const width = maxX - minX;
		const height = maxY - minY;
		return `polygon(${this.createRoundedRect(minX, minY, width, height, borderRadius)})`;
	}
	static createRoundedRect(x$1, y, width, height, radius) {
		const r = Math.min(radius, width / 2, height / 2);
		return [
			`${x$1 + r}px ${y}px`,
			`${x$1 + width - r}px ${y}px`,
			`${x$1 + width}px ${y + r}px`,
			`${x$1 + width}px ${y + height - r}px`,
			`${x$1 + width - r}px ${y + height}px`,
			`${x$1 + r}px ${y + height}px`,
			`${x$1}px ${y + height - r}px`,
			`${x$1}px ${y + r}px`
		].join(", ");
	}
	static buildButtonClipPathPure(rect, paddingPx = 0) {
		const x$1 = rect.x - paddingPx;
		const y = rect.y - paddingPx;
		const width = rect.width + 2 * paddingPx;
		const height = rect.height + 2 * paddingPx;
		const clipPath = `polygon(${x$1}px ${y}px, ${x$1 + width}px ${y}px, ${x$1 + width}px ${y + height}px, ${x$1}px ${y + height}px)`;
		return clipPath;
	}
};
function toPx(v) {
	return typeof v === "number" ? `${v}px` : v;
}
function utilParsePx(value) {
	if (typeof value === "number") return value;
	if (typeof value === "string") {
		if (value === "auto") throw new Error("Cannot parse \"auto\" value for pixel calculations. Please provide a specific pixel value.");
		const match = value.match(/^(\d+(?:\.\d+)?)px$/);
		if (match) return parseFloat(match[1]);
		throw new Error(`Invalid pixel value: "${value}". Expected format: "123px" or numeric value.`);
	}
	return 0;
}
function computeIframeSizePure(input) {
	const p = input.paddingPx ?? 8;
	const { buttonWidthPx: bw, buttonHeightPx: bh, tooltipWidthPx: tw, tooltipHeightPx: th, offsetPx: o, position } = input;
	let width = 0, height = 0, buttonPositionX = 0, buttonPositionY = 0;
	let flushClass = "flush-top-center";
	switch (position) {
		case "top-left":
			flushClass = "flush-bottom-left";
			width = Math.max(bw, tw) + p;
			height = bh + o + th + p;
			buttonPositionX = 0;
			buttonPositionY = th + o;
			break;
		case "top-center":
			flushClass = "flush-bottom-center";
			width = Math.max(bw, tw) + p;
			height = bh + o + th + p;
			buttonPositionX = (width - bw) / 2;
			buttonPositionY = th + o;
			break;
		case "top-right":
			flushClass = "flush-bottom-right";
			width = Math.max(bw, tw) + p;
			height = bh + o + th + p;
			buttonPositionX = width - bw;
			buttonPositionY = th + o;
			break;
		case "left":
			flushClass = "flush-right";
			width = tw + o + bw + p;
			height = Math.max(bh, th) + p;
			buttonPositionX = tw + o;
			buttonPositionY = (height - bh) / 2;
			break;
		case "right":
			flushClass = "flush-left";
			width = bw + o + tw + p;
			height = Math.max(bh, th) + p;
			buttonPositionX = 0;
			buttonPositionY = (height - bh) / 2;
			break;
		case "bottom-left":
			flushClass = "flush-top-left";
			width = Math.max(bw, tw) + p;
			height = bh + o + th + p;
			buttonPositionX = 0;
			buttonPositionY = 0;
			break;
		case "bottom-center":
			flushClass = "flush-top-center";
			width = Math.max(bw, tw) + p;
			height = bh + o + th + p;
			buttonPositionX = (width - bw) / 2;
			buttonPositionY = 0;
			break;
		case "bottom-right":
			flushClass = "flush-top-right";
			width = Math.max(bw, tw) + p;
			height = bh + o + th + p;
			buttonPositionX = width - bw;
			buttonPositionY = 0;
			break;
	}
	return {
		width,
		height,
		flushClass,
		buttonPositionX,
		buttonPositionY
	};
}
function computeExpandedIframeSizeFromGeometryPure(input) {
	const p = input.paddingPx ?? 8;
	const g = input.geometry;
	const right = Math.max(g.button.x + g.button.width, g.tooltip.x + g.tooltip.width);
	const bottom = Math.max(g.button.y + g.button.height, g.tooltip.y + g.tooltip.height);
	return {
		width: Math.max(input.fallback.width, Math.ceil(right) + p),
		height: Math.max(input.fallback.height, Math.ceil(bottom) + p)
	};
}

//#endregion
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
var IframeButtonHost_default = IframeButtonHost;

//#endregion
export { IframeButtonHost, IframeButtonHost_default as default };