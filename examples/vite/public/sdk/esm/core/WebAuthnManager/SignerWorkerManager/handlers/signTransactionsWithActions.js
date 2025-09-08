import { toAccountId } from "../../../types/accountIds.js";
import { WorkerRequestType } from "../../../../wasm_signer_worker/wasm_signer_worker.js";
import { isSignTransactionsWithActionsSuccess } from "../../../types/signer-worker.js";
import { SignedTransaction } from "../../../NearClient.js";
import { validateActionArgsWasm } from "../../../types/actions.js";

//#region src/core/WebAuthnManager/SignerWorkerManager/handlers/signTransactionsWithActions.ts
/**
* Sign multiple transactions with shared VRF challenge and credential
* Efficiently processes multiple transactions with one PRF authentication
*/
async function signTransactionsWithActions({ ctx, transactions, rpcCall, onEvent, confirmationConfigOverride }) {
	try {
		console.info(`WebAuthnManager: Starting batch transaction signing for ${transactions.length} transactions`);
		if (transactions.length === 0) throw new Error("No transactions provided for batch signing");
		const nearAccountId = rpcCall.nearAccountId;
		transactions.forEach((txPayload, txIndex) => {
			txPayload.actions.forEach((action, actionIndex) => {
				try {
					validateActionArgsWasm(action);
				} catch (error) {
					throw new Error(`Transaction ${txIndex}, Action ${actionIndex} validation failed: ${error instanceof Error ? error.message : "Unknown error"}`);
				}
			});
		});
		console.debug("WebAuthnManager: Retrieving encrypted key from IndexedDB for account:", nearAccountId);
		const encryptedKeyData = await ctx.indexedDB.nearKeysDB.getEncryptedKey(nearAccountId);
		if (!encryptedKeyData) throw new Error(`No encrypted key found for account: ${nearAccountId}`);
		const txSigningRequests = transactions.map((tx) => ({
			nearAccountId: rpcCall.nearAccountId,
			receiverId: tx.receiverId,
			actions: JSON.stringify(tx.actions)
		}));
		const confirmationConfig = confirmationConfigOverride || ctx.userPreferencesManager.getConfirmationConfig();
		const response = await ctx.sendMessage({
			message: {
				type: WorkerRequestType.SignTransactionsWithActions,
				payload: {
					rpcCall,
					decryption: {
						encryptedPrivateKeyData: encryptedKeyData.encryptedData,
						encryptedPrivateKeyIv: encryptedKeyData.iv
					},
					txSigningRequests,
					confirmationConfig
				}
			},
			onEvent
		});
		if (!isSignTransactionsWithActionsSuccess(response)) {
			console.error("WebAuthnManager: Batch transaction signing failed:", response);
			throw new Error("Batch transaction signing failed");
		}
		if (!response.payload.success) throw new Error(response.payload.error || "Batch transaction signing failed");
		const signedTransactions = response.payload.signedTransactions || [];
		if (signedTransactions.length !== transactions.length) throw new Error(`Expected ${transactions.length} signed transactions but received ${signedTransactions.length}`);
		const results = signedTransactions.map((signedTx, index) => {
			if (!signedTx || !signedTx.transaction || !signedTx.signature) throw new Error(`Incomplete signed transaction data received for transaction ${index + 1}`);
			return {
				signedTransaction: new SignedTransaction({
					transaction: signedTx.transaction,
					signature: signedTx.signature,
					borsh_bytes: Array.from(signedTx.borshBytes || [])
				}),
				nearAccountId: toAccountId(nearAccountId),
				logs: response.payload.logs
			};
		});
		return results;
	} catch (error) {
		console.error("WebAuthnManager: Batch transaction signing error:", error);
		throw error;
	}
}

//#endregion
export { signTransactionsWithActions };
//# sourceMappingURL=signTransactionsWithActions.js.map