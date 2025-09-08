import { toAccountId } from "../../../types/accountIds.js";
import { WorkerRequestType } from "../../../../wasm_signer_worker/wasm_signer_worker.js";
import { isDecryptPrivateKeyWithPrfSuccess } from "../../../types/signer-worker.js";
import { createRandomVRFChallenge } from "../../../types/vrf-worker.js";
import { extractPrfFromCredential } from "../../credentialsHelpers.js";

//#region src/core/WebAuthnManager/SignerWorkerManager/handlers/decryptPrivateKeyWithPrf.ts
async function decryptPrivateKeyWithPrf({ ctx, nearAccountId, authenticators }) {
	try {
		console.info("WebAuthnManager: Starting private key decryption with dual PRF (local operation)");
		const encryptedKeyData = await ctx.indexedDB.nearKeysDB.getEncryptedKey(nearAccountId);
		if (!encryptedKeyData) throw new Error(`No encrypted key found for account: ${nearAccountId}`);
		const challenge = createRandomVRFChallenge();
		const credential = await ctx.touchIdPrompt.getCredentials({
			nearAccountId,
			challenge,
			authenticators
		});
		const dualPrfOutputs = extractPrfFromCredential({
			credential,
			firstPrfOutput: true,
			secondPrfOutput: false
		});
		console.debug("WebAuthnManager: Extracted ChaCha20 PRF output for decryption");
		const response = await ctx.sendMessage({ message: {
			type: WorkerRequestType.DecryptPrivateKeyWithPrf,
			payload: {
				nearAccountId,
				chacha20PrfOutput: dualPrfOutputs.chacha20PrfOutput,
				encryptedPrivateKeyData: encryptedKeyData.encryptedData,
				encryptedPrivateKeyIv: encryptedKeyData.iv
			}
		} });
		if (!isDecryptPrivateKeyWithPrfSuccess(response)) {
			console.error("WebAuthnManager: Dual PRF private key decryption failed:", response);
			throw new Error("Private key decryption failed");
		}
		return {
			decryptedPrivateKey: response.payload.privateKey,
			nearAccountId: toAccountId(response.payload.nearAccountId)
		};
	} catch (error) {
		console.error("WebAuthnManager: Dual PRF private key decryption error:", error);
		throw error;
	}
}

//#endregion
export { decryptPrivateKeyWithPrf };
//# sourceMappingURL=decryptPrivateKeyWithPrf.js.map