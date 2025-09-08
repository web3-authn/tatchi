import { WorkerRequestType } from "../../../../wasm_signer_worker/wasm_signer_worker.js";
import { isExtractCosePublicKeySuccess } from "../../../types/signer-worker.js";

//#region src/core/WebAuthnManager/SignerWorkerManager/handlers/extractCosePublicKey.ts
/**
* Extract COSE public key from WebAuthn attestation object
* Simple operation that doesn't require TouchID or progress updates
*/
async function extractCosePublicKey({ ctx, attestationObjectBase64url }) {
	try {
		const response = await ctx.sendMessage({ message: {
			type: WorkerRequestType.ExtractCosePublicKey,
			payload: { attestationObjectBase64url }
		} });
		if (isExtractCosePublicKeySuccess(response)) return response.payload.cosePublicKeyBytes;
		else throw new Error("COSE public key extraction failed in WASM worker");
	} catch (error) {
		throw error;
	}
}

//#endregion
export { extractCosePublicKey };
//# sourceMappingURL=extractCosePublicKey.js.map