const require_wasm_signer_worker = require('../../../../wasm_signer_worker/wasm_signer_worker.js');
const require_NearClient = require('../../../NearClient.js');
const require_actions = require('../../../types/actions.js');

//#region src/core/WebAuthnManager/SignerWorkerManager/handlers/signTransactionWithKeyPair.ts
/**
* Sign transaction with raw private key (for key replacement in Option D device linking)
* No TouchID/PRF required - uses provided private key directly
*/
async function signTransactionWithKeyPair({ ctx, nearPrivateKey, signerAccountId, receiverId, nonce, blockHash, actions }) {
	try {
		console.info("SignerWorkerManager: Starting transaction signing with provided private key");
		actions.forEach((action, index) => {
			try {
				require_actions.validateActionArgsWasm(action);
			} catch (error) {
				throw new Error(`Action ${index} validation failed: ${error instanceof Error ? error.message : "Unknown error"}`);
			}
		});
		const response = await ctx.sendMessage({ message: {
			type: require_wasm_signer_worker.WorkerRequestType.SignTransactionWithKeyPair,
			payload: {
				nearPrivateKey,
				signerAccountId,
				receiverId,
				nonce,
				blockHash,
				actions: JSON.stringify(actions)
			}
		} });
		if (response.type !== require_wasm_signer_worker.WorkerResponseType.SignTransactionWithKeyPairSuccess) {
			console.error("SignerWorkerManager: Transaction signing with private key failed:", response);
			throw new Error("Transaction signing with private key failed");
		}
		const wasmResult = response.payload;
		if (!wasmResult.success) throw new Error(wasmResult.error || "Transaction signing failed");
		const signedTransactions = wasmResult.signedTransactions || [];
		if (signedTransactions.length !== 1) throw new Error(`Expected 1 signed transaction but received ${signedTransactions.length}`);
		const signedTx = signedTransactions[0];
		if (!signedTx || !signedTx.transaction || !signedTx.signature) throw new Error("Incomplete signed transaction data received");
		const result = {
			signedTransaction: new require_NearClient.SignedTransaction({
				transaction: signedTx.transaction,
				signature: signedTx.signature,
				borsh_bytes: Array.from(signedTx.borshBytes || [])
			}),
			logs: wasmResult.logs
		};
		console.debug("SignerWorkerManager: Transaction signing with private key successful");
		return result;
	} catch (error) {
		console.error("SignerWorkerManager: Transaction signing with private key error:", error);
		throw error;
	}
}

//#endregion
exports.signTransactionWithKeyPair = signTransactionWithKeyPair;
//# sourceMappingURL=signTransactionWithKeyPair.js.map