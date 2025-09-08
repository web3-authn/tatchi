const require_wasm_signer_worker = require('../../../../wasm_signer_worker/wasm_signer_worker.js');
const require_signer_worker = require('../../../types/signer-worker.js');
const require_config = require('../../../../config.js');
const require_authenticatorOptions = require('../../../types/authenticatorOptions.js');
const require_NearClient = require('../../../NearClient.js');

//#region src/core/WebAuthnManager/SignerWorkerManager/handlers/signVerifyAndRegisterUser.ts
async function signVerifyAndRegisterUser({ ctx, vrfChallenge, contractId, deterministicVrfPublicKey, nearAccountId, nearPublicKeyStr, nearClient, nearRpcUrl, deviceNumber = 1, authenticatorOptions, onEvent }) {
	try {
		console.info("WebAuthnManager: Starting on-chain user registration with transaction");
		if (!nearPublicKeyStr) throw new Error("Client NEAR public key not provided - cannot get access key nonce");
		console.debug("WebAuthnManager: Retrieving encrypted key from IndexedDB for account:", nearAccountId);
		const encryptedKeyData = await ctx.indexedDB.nearKeysDB.getEncryptedKey(nearAccountId);
		if (!encryptedKeyData) throw new Error(`No encrypted key found for account: ${nearAccountId}`);
		const { accessKeyInfo, nextNonce, txBlockHash, txBlockHeight } = await ctx.nonceManager.getNonceBlockHashAndHeight(nearClient);
		const response = await ctx.sendMessage({
			message: {
				type: require_wasm_signer_worker.WorkerRequestType.SignVerifyAndRegisterUser,
				payload: {
					verification: {
						contractId,
						nearRpcUrl,
						vrfChallenge
					},
					decryption: {
						encryptedPrivateKeyData: encryptedKeyData.encryptedData,
						encryptedPrivateKeyIv: encryptedKeyData.iv
					},
					registration: {
						nearAccountId,
						nonce: nextNonce,
						blockHash: txBlockHash,
						deterministicVrfPublicKey,
						deviceNumber,
						authenticatorOptions: authenticatorOptions ? {
							userVerification: require_authenticatorOptions.toEnumUserVerificationPolicy(authenticatorOptions.userVerification),
							originPolicy: authenticatorOptions.originPolicy
						} : void 0
					}
				}
			},
			onEvent,
			timeoutMs: require_config.SIGNER_WORKER_MANAGER_CONFIG.TIMEOUTS.REGISTRATION
		});
		if (require_signer_worker.isSignVerifyAndRegisterUserSuccess(response)) {
			console.debug("WebAuthnManager: On-chain user registration transaction successful");
			const wasmResult = response.payload;
			return {
				verified: wasmResult.verified,
				registrationInfo: wasmResult.registrationInfo,
				logs: wasmResult.logs,
				signedTransaction: new require_NearClient.SignedTransaction({
					transaction: wasmResult.signedTransaction.transaction,
					signature: wasmResult.signedTransaction.signature,
					borsh_bytes: Array.from(wasmResult.signedTransaction.borshBytes || [])
				}),
				preSignedDeleteTransaction: wasmResult.preSignedDeleteTransaction ? new require_NearClient.SignedTransaction({
					transaction: wasmResult.preSignedDeleteTransaction.transaction,
					signature: wasmResult.preSignedDeleteTransaction.signature,
					borsh_bytes: Array.from(wasmResult.preSignedDeleteTransaction.borshBytes || [])
				}) : null
			};
		} else {
			console.error("WebAuthnManager: On-chain user registration transaction failed:", response);
			throw new Error("On-chain user registration transaction failed");
		}
	} catch (error) {
		console.error("WebAuthnManager: On-chain user registration error:", error);
		throw error;
	}
}

//#endregion
exports.signVerifyAndRegisterUser = signVerifyAndRegisterUser;
//# sourceMappingURL=signVerifyAndRegisterUser.js.map