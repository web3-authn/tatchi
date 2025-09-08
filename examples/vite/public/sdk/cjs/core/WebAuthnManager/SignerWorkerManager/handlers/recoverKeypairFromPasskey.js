const require_wasm_signer_worker = require('../../../../wasm_signer_worker/wasm_signer_worker.js');
const require_signer_worker = require('../../../types/signer-worker.js');
const require_credentialsHelpers = require('../../credentialsHelpers.js');

//#region src/core/WebAuthnManager/SignerWorkerManager/handlers/recoverKeypairFromPasskey.ts
/**
* Recover keypair from authentication credential for account recovery
* Uses dual PRF-based Ed25519 key derivation with account-specific HKDF and AES encryption
*/
async function recoverKeypairFromPasskey({ ctx, credential, accountIdHint }) {
	try {
		console.info("SignerWorkerManager: Starting dual PRF-based keypair recovery from authentication credential");
		const authenticationCredential = require_credentialsHelpers.serializeAuthenticationCredentialWithPRF({
			credential,
			firstPrfOutput: true,
			secondPrfOutput: true
		});
		if (!authenticationCredential.clientExtensionResults?.prf?.results?.first || !authenticationCredential.clientExtensionResults?.prf?.results?.second) throw new Error("Dual PRF outputs required for account recovery - both ChaCha20 and Ed25519 PRF outputs must be available");
		const response = await ctx.sendMessage({ message: {
			type: require_wasm_signer_worker.WorkerRequestType.RecoverKeypairFromPasskey,
			payload: {
				credential: authenticationCredential,
				accountIdHint
			}
		} });
		if (!require_signer_worker.isRecoverKeypairFromPasskeySuccess(response)) throw new Error("Dual PRF keypair recovery failed in WASM worker");
		return {
			publicKey: response.payload.publicKey,
			encryptedPrivateKey: response.payload.encryptedData,
			iv: response.payload.iv,
			accountIdHint: response.payload.accountIdHint
		};
	} catch (error) {
		console.error("SignerWorkerManager: Dual PRF keypair recovery error:", error);
		throw error;
	}
}

//#endregion
exports.recoverKeypairFromPasskey = recoverKeypairFromPasskey;
//# sourceMappingURL=recoverKeypairFromPasskey.js.map