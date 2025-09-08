import { toAccountId } from "../../../types/accountIds.js";
import { WorkerRequestType } from "../../../../wasm_signer_worker/wasm_signer_worker.js";
import { isDeriveNearKeypairAndEncryptSuccess } from "../../../types/signer-worker.js";
import { toEnumUserVerificationPolicy } from "../../../types/authenticatorOptions.js";
import { serializeRegistrationCredentialWithPRF } from "../../credentialsHelpers.js";
import { SignedTransaction } from "../../../NearClient.js";

//#region src/core/WebAuthnManager/SignerWorkerManager/handlers/deriveNearKeypairAndEncrypt.ts
/**
* Secure registration flow with dual PRF: WebAuthn + WASM worker encryption using dual PRF
* Optionally signs a link_device_register_user transaction if VRF data is provided
*/
async function deriveNearKeypairAndEncrypt({ ctx, credential, nearAccountId, options }) {
	try {
		console.info("WebAuthnManager: Starting secure registration with dual PRF using deterministic derivation");
		const registrationCredential = serializeRegistrationCredentialWithPRF({
			credential,
			firstPrfOutput: true,
			secondPrfOutput: true
		});
		if (!registrationCredential.clientExtensionResults?.prf?.results?.first) throw new Error("First PRF output missing from serialized credential");
		if (!registrationCredential.clientExtensionResults?.prf?.results?.second) throw new Error("Second PRF output missing from serialized credential");
		const dualPrfOutputs = {
			chacha20PrfOutput: registrationCredential.clientExtensionResults.prf.results.first,
			ed25519PrfOutput: registrationCredential.clientExtensionResults.prf.results.second
		};
		const response = await ctx.sendMessage({ message: {
			type: WorkerRequestType.DeriveNearKeypairAndEncrypt,
			payload: {
				dualPrfOutputs,
				nearAccountId,
				credential: registrationCredential,
				registrationTransaction: options?.vrfChallenge && options?.contractId && options?.nonce && options?.blockHash ? {
					vrfChallenge: options.vrfChallenge,
					contractId: options.contractId,
					nonce: options.nonce,
					blockHash: options.blockHash,
					deterministicVrfPublicKey: options.deterministicVrfPublicKey
				} : void 0,
				authenticatorOptions: {
					userVerification: toEnumUserVerificationPolicy(options?.authenticatorOptions?.userVerification),
					originPolicy: options?.authenticatorOptions?.originPolicy
				}
			}
		} });
		if (!isDeriveNearKeypairAndEncryptSuccess(response)) throw new Error("Dual PRF registration failed");
		const wasmResult = response.payload;
		const keyData = {
			nearAccountId,
			encryptedData: wasmResult.encryptedData,
			iv: wasmResult.iv,
			timestamp: Date.now()
		};
		await ctx.indexedDB.nearKeysDB.storeEncryptedKey(keyData);
		const verified = await ctx.indexedDB.nearKeysDB.verifyKeyStorage(nearAccountId);
		if (!verified) throw new Error("Key storage verification failed");
		console.info("WebAuthnManager: Encrypted key stored and verified in IndexedDB");
		let signedTransaction = void 0;
		if (wasmResult.signedTransaction) signedTransaction = new SignedTransaction({
			transaction: wasmResult.signedTransaction.transaction,
			signature: wasmResult.signedTransaction.signature,
			borsh_bytes: Array.from(wasmResult.signedTransaction.borshBytes || [])
		});
		return {
			success: true,
			nearAccountId: toAccountId(wasmResult.nearAccountId),
			publicKey: wasmResult.publicKey,
			signedTransaction
		};
	} catch (error) {
		console.error("WebAuthnManager: Dual PRF registration error:", error);
		return {
			success: false,
			nearAccountId,
			publicKey: ""
		};
	}
}

//#endregion
export { deriveNearKeypairAndEncrypt };
//# sourceMappingURL=deriveNearKeypairAndEncrypt.js.map