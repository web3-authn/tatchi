const require_wasm_signer_worker = require('../../../../wasm_signer_worker/wasm_signer_worker.js');
const require_signer_worker = require('../../../types/signer-worker.js');

//#region src/core/WebAuthnManager/SignerWorkerManager/handlers/extractCosePublicKey.ts
/**
* Extract COSE public key from WebAuthn attestation object
* Simple operation that doesn't require TouchID or progress updates
*/
async function extractCosePublicKey({ ctx, attestationObjectBase64url }) {
	try {
		const response = await ctx.sendMessage({ message: {
			type: require_wasm_signer_worker.WorkerRequestType.ExtractCosePublicKey,
			payload: { attestationObjectBase64url }
		} });
		if (require_signer_worker.isExtractCosePublicKeySuccess(response)) return response.payload.cosePublicKeyBytes;
		else throw new Error("COSE public key extraction failed in WASM worker");
	} catch (error) {
		throw error;
	}
}

//#endregion
exports.extractCosePublicKey = extractCosePublicKey;
//# sourceMappingURL=extractCosePublicKey.js.map