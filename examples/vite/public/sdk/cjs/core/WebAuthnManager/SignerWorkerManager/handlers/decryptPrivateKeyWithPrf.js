const require_accountIds = require('../../../types/accountIds.js');
const require_wasm_signer_worker = require('../../../../wasm_signer_worker/wasm_signer_worker.js');
const require_signer_worker = require('../../../types/signer-worker.js');
const require_vrf_worker = require('../../../types/vrf-worker.js');
const require_credentialsHelpers = require('../../credentialsHelpers.js');

//#region src/core/WebAuthnManager/SignerWorkerManager/handlers/decryptPrivateKeyWithPrf.ts
async function decryptPrivateKeyWithPrf({ ctx, nearAccountId, authenticators }) {
	try {
		console.info("WebAuthnManager: Starting private key decryption with dual PRF (local operation)");
		const encryptedKeyData = await ctx.indexedDB.nearKeysDB.getEncryptedKey(nearAccountId);
		if (!encryptedKeyData) throw new Error(`No encrypted key found for account: ${nearAccountId}`);
		const challenge = require_vrf_worker.createRandomVRFChallenge();
		const credential = await ctx.touchIdPrompt.getCredentials({
			nearAccountId,
			challenge,
			authenticators
		});
		const dualPrfOutputs = require_credentialsHelpers.extractPrfFromCredential({
			credential,
			firstPrfOutput: true,
			secondPrfOutput: false
		});
		console.debug("WebAuthnManager: Extracted ChaCha20 PRF output for decryption");
		const response = await ctx.sendMessage({ message: {
			type: require_wasm_signer_worker.WorkerRequestType.DecryptPrivateKeyWithPrf,
			payload: {
				nearAccountId,
				chacha20PrfOutput: dualPrfOutputs.chacha20PrfOutput,
				encryptedPrivateKeyData: encryptedKeyData.encryptedData,
				encryptedPrivateKeyIv: encryptedKeyData.iv
			}
		} });
		if (!require_signer_worker.isDecryptPrivateKeyWithPrfSuccess(response)) {
			console.error("WebAuthnManager: Dual PRF private key decryption failed:", response);
			throw new Error("Private key decryption failed");
		}
		return {
			decryptedPrivateKey: response.payload.privateKey,
			nearAccountId: require_accountIds.toAccountId(response.payload.nearAccountId)
		};
	} catch (error) {
		console.error("WebAuthnManager: Dual PRF private key decryption error:", error);
		throw error;
	}
}

//#endregion
exports.decryptPrivateKeyWithPrf = decryptPrivateKeyWithPrf;
//# sourceMappingURL=decryptPrivateKeyWithPrf.js.map