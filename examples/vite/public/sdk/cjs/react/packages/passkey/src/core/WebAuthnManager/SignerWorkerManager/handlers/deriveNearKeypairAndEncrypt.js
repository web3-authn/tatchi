const require_accountIds = require('../../../types/accountIds.js');
const require_wasm_signer_worker = require('../../../../wasm_signer_worker/wasm_signer_worker.js');
const require_signer_worker = require('../../../types/signer-worker.js');
const require_authenticatorOptions = require('../../../types/authenticatorOptions.js');
const require_credentialsHelpers = require('../../credentialsHelpers.js');
const require_NearClient = require('../../../NearClient.js');

//#region src/core/WebAuthnManager/SignerWorkerManager/handlers/deriveNearKeypairAndEncrypt.ts
/**
* Secure registration flow with dual PRF: WebAuthn + WASM worker encryption using dual PRF
* Optionally signs a link_device_register_user transaction if VRF data is provided
*/
async function deriveNearKeypairAndEncrypt({ ctx, credential, nearAccountId, options }) {
	try {
		console.info("WebAuthnManager: Starting secure registration with dual PRF using deterministic derivation");
		const registrationCredential = require_credentialsHelpers.serializeRegistrationCredentialWithPRF({
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
			type: require_wasm_signer_worker.WorkerRequestType.DeriveNearKeypairAndEncrypt,
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
					userVerification: require_authenticatorOptions.toEnumUserVerificationPolicy(options?.authenticatorOptions?.userVerification),
					originPolicy: options?.authenticatorOptions?.originPolicy
				}
			}
		} });
		if (!require_signer_worker.isDeriveNearKeypairAndEncryptSuccess(response)) throw new Error("Dual PRF registration failed");
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
		if (wasmResult.signedTransaction) signedTransaction = new require_NearClient.SignedTransaction({
			transaction: wasmResult.signedTransaction.transaction,
			signature: wasmResult.signedTransaction.signature,
			borsh_bytes: Array.from(wasmResult.signedTransaction.borshBytes || [])
		});
		return {
			success: true,
			nearAccountId: require_accountIds.toAccountId(wasmResult.nearAccountId),
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
exports.deriveNearKeypairAndEncrypt = deriveNearKeypairAndEncrypt;
//# sourceMappingURL=deriveNearKeypairAndEncrypt.js.map