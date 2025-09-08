const require_wasm_signer_worker = require('../../../../wasm_signer_worker/wasm_signer_worker.js');
const require_signer_worker = require('../../../types/signer-worker.js');
const require_credentialsHelpers = require('../../credentialsHelpers.js');

//#region src/core/WebAuthnManager/SignerWorkerManager/handlers/signNep413Message.ts
/**
* Sign a NEP-413 message using the user's passkey-derived private key
*
* @param payload - NEP-413 signing parameters including message, recipient, nonce, and state
* @returns Promise resolving to signing result with account ID, public key, and signature
*/
async function signNep413Message({ ctx, payload }) {
	try {
		const encryptedKeyData = await ctx.indexedDB.nearKeysDB.getEncryptedKey(payload.accountId);
		if (!encryptedKeyData) throw new Error(`No encrypted key found for account: ${payload.accountId}`);
		const { chacha20PrfOutput } = require_credentialsHelpers.extractPrfFromCredential({
			credential: payload.credential,
			firstPrfOutput: true,
			secondPrfOutput: false
		});
		const response = await ctx.sendMessage({ message: {
			type: require_wasm_signer_worker.WorkerRequestType.SignNep413Message,
			payload: {
				message: payload.message,
				recipient: payload.recipient,
				nonce: payload.nonce,
				state: payload.state || void 0,
				accountId: payload.accountId,
				prfOutput: chacha20PrfOutput,
				encryptedPrivateKeyData: encryptedKeyData.encryptedData,
				encryptedPrivateKeyIv: encryptedKeyData.iv
			}
		} });
		if (!require_signer_worker.isSignNep413MessageSuccess(response)) {
			console.error("SignerWorkerManager: NEP-413 signing failed:", response);
			throw new Error("NEP-413 signing failed");
		}
		return {
			success: true,
			accountId: response.payload.accountId,
			publicKey: response.payload.publicKey,
			signature: response.payload.signature,
			state: response.payload.state || void 0
		};
	} catch (error) {
		console.error("SignerWorkerManager: NEP-413 signing error:", error);
		return {
			success: false,
			accountId: "",
			publicKey: "",
			signature: "",
			error: error.message || "Unknown error"
		};
	}
}

//#endregion
exports.signNep413Message = signNep413Message;
//# sourceMappingURL=signNep413Message.js.map