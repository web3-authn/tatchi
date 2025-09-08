const require_actions = require('../types/actions.js');
const require_passkeyManager = require('../types/passkeyManager.js');

//#region src/core/PasskeyManager/actions.ts
/**
* Public API for executing actions - respects user confirmation preferences
* executeAction signs a single transaction (with actions[]) to a single receiver.
* If you want to sign multiple transactions to different receivers,
* use signTransactionsWithActions() instead.
*
* @param context - PasskeyManager context
* @param nearAccountId - NEAR account ID to sign transactions with
* @param actionArgs - Action arguments to sign transactions with
* @param options - Options for the action
* @returns Promise resolving to the action result
*/
async function executeAction(args) {
	try {
		return executeActionInternal({
			context: args.context,
			nearAccountId: args.nearAccountId,
			receiverId: args.receiverId,
			actionArgs: args.actionArgs,
			options: args.options,
			confirmationConfigOverride: void 0
		});
	} catch (error) {
		throw error;
	}
}
/**
* Signs multiple transactions with actions, and broadcasts them
*
* @param context - PasskeyManager context
* @param nearAccountId - NEAR account ID to sign transactions with
* @param transactionInput - Transaction input to sign
* @param options - Options for the action
* @returns Promise resolving to the action result
*/
async function signAndSendTransactions(args) {
	return signAndSendTransactionsInternal({
		context: args.context,
		nearAccountId: args.nearAccountId,
		transactionInputs: args.transactionInputs,
		options: args.options,
		confirmationConfigOverride: void 0
	});
}
/**
* Signs transactions with actions, without broadcasting them
*
* @param context - PasskeyManager context
* @param nearAccountId - NEAR account ID to sign transactions with
* @param actionArgs - Action arguments to sign transactions with
* @param options - Options for the action
* @returns Promise resolving to the action result
*/
async function signTransactionsWithActions(args) {
	try {
		return signTransactionsWithActionsInternal({
			context: args.context,
			nearAccountId: args.nearAccountId,
			transactionInputs: args.transactionInputs,
			options: args.options,
			confirmationConfigOverride: void 0
		});
	} catch (error) {
		throw error;
	}
}
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
		phase: require_passkeyManager.ActionPhase.STEP_8_BROADCASTING,
		status: require_passkeyManager.ActionStatus.PROGRESS,
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
			phase: require_passkeyManager.ActionPhase.STEP_8_BROADCASTING,
			status: require_passkeyManager.ActionStatus.SUCCESS,
			message: `Transaction ${txId} sent successfully`
		});
		options?.onEvent?.({
			step: 9,
			phase: require_passkeyManager.ActionPhase.STEP_9_ACTION_COMPLETE,
			status: require_passkeyManager.ActionStatus.SUCCESS,
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
/**
* Internal API for executing actions with optional confirmation override
* @internal - Only used by internal SDK components like SecureTxConfirmButton
*
* @param context - PasskeyManager context
* @param nearAccountId - NEAR account ID to sign transactions with
* @param actionArgs - Action arguments to sign transactions with
* @param options - Options for the action
* @returns Promise resolving to the action result
*/
async function executeActionInternal({ context, nearAccountId, receiverId, actionArgs, options, confirmationConfigOverride }) {
	const { onEvent, onError, hooks, waitUntil } = options || {};
	const actions = Array.isArray(actionArgs) ? actionArgs : [actionArgs];
	try {
		await options?.hooks?.beforeCall?.();
		try {
			await context.webAuthnManager.getNonceManager().getNonceBlockHashAndHeight(context.nearClient);
		} catch (error) {
			console.warn("[executeAction]: Failed to pre-warm NonceManager:", error);
		}
		const signedTxs = await signTransactionsWithActionsInternal({
			context,
			nearAccountId,
			transactionInputs: [{
				receiverId,
				actions
			}],
			options: {
				onEvent,
				onError,
				hooks,
				waitUntil
			},
			confirmationConfigOverride
		});
		const txResult = await sendTransaction({
			context,
			signedTransaction: signedTxs[0].signedTransaction,
			options: {
				onEvent,
				onError,
				hooks,
				waitUntil
			}
		});
		hooks?.afterCall?.(true, txResult);
		return txResult;
	} catch (error) {
		console.error("[executeAction] Error during execution:", error);
		onError?.(error);
		onEvent?.({
			step: 0,
			phase: require_passkeyManager.ActionPhase.ACTION_ERROR,
			status: require_passkeyManager.ActionStatus.ERROR,
			message: `Action failed: ${error.message}`,
			error: error.message
		});
		const result = {
			success: false,
			error: error.message,
			transactionId: void 0
		};
		hooks?.afterCall?.(false, result);
		return result;
	}
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
			phase: require_passkeyManager.ActionPhase.STEP_1_PREPARATION,
			status: require_passkeyManager.ActionStatus.PROGRESS,
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
			phase: require_passkeyManager.ActionPhase.ACTION_ERROR,
			status: require_passkeyManager.ActionStatus.ERROR,
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
		phase: require_passkeyManager.ActionPhase.STEP_1_PREPARATION,
		status: require_passkeyManager.ActionStatus.PROGRESS,
		message: "Validating inputs..."
	});
	for (const transactionInput of transactionInputs) {
		if (!transactionInput.receiverId) throw new Error("Missing required parameter: receiverId");
		for (const action of transactionInput.actions) {
			if (action.type === require_actions.ActionType.FunctionCall && (!action.methodName || action.args === void 0)) throw new Error("Missing required parameters for function call: methodName or args");
			if (action.type === require_actions.ActionType.Transfer && !action.amount) throw new Error("Missing required parameter for transfer: amount");
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
		phase: require_passkeyManager.ActionPhase.STEP_2_USER_CONFIRMATION,
		status: require_passkeyManager.ActionStatus.PROGRESS,
		message: "Requesting user confirmation..."
	});
	const transactionInputsWasm = transactionInputs.map((tx, i) => {
		return {
			receiverId: tx.receiverId,
			actions: tx.actions.map((action) => require_actions.toActionArgsWasm(action))
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
			if (progressEvent.phase === require_passkeyManager.ActionPhase.STEP_4_WEBAUTHN_AUTHENTICATION) onEvent?.({
				step: 4,
				phase: require_passkeyManager.ActionPhase.STEP_4_WEBAUTHN_AUTHENTICATION,
				status: require_passkeyManager.ActionStatus.PROGRESS,
				message: "Authenticating with WebAuthn contract..."
			});
			if (progressEvent.phase === require_passkeyManager.ActionPhase.STEP_5_AUTHENTICATION_COMPLETE) onEvent?.({
				step: 5,
				phase: require_passkeyManager.ActionPhase.STEP_5_AUTHENTICATION_COMPLETE,
				status: require_passkeyManager.ActionStatus.SUCCESS,
				message: "WebAuthn verification complete"
			});
			if (progressEvent.phase === require_passkeyManager.ActionPhase.STEP_6_TRANSACTION_SIGNING_PROGRESS) onEvent?.({
				step: 6,
				phase: require_passkeyManager.ActionPhase.STEP_6_TRANSACTION_SIGNING_PROGRESS,
				status: require_passkeyManager.ActionStatus.PROGRESS,
				message: "Signing transaction..."
			});
			if (progressEvent.phase === require_passkeyManager.ActionPhase.STEP_7_TRANSACTION_SIGNING_COMPLETE) onEvent?.({
				step: 7,
				phase: require_passkeyManager.ActionPhase.STEP_7_TRANSACTION_SIGNING_COMPLETE,
				status: require_passkeyManager.ActionStatus.SUCCESS,
				message: "Transaction signed successfully"
			});
			onEvent({ ...progressEvent });
		} : void 0
	});
	return signedTxs;
}

//#endregion
exports.executeAction = executeAction;
exports.sendTransaction = sendTransaction;
exports.signAndSendTransactions = signAndSendTransactions;
exports.signAndSendTransactionsInternal = signAndSendTransactionsInternal;
exports.signTransactionsWithActions = signTransactionsWithActions;
//# sourceMappingURL=actions.js.map