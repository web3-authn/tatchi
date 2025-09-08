const require_wasm_signer_worker = require('../../../../wasm_signer_worker/wasm_signer_worker.js');
const require_signer_worker = require('../../../types/signer-worker.js');
const require_config = require('../../../../config.js');
const require_authenticatorOptions = require('../../../types/authenticatorOptions.js');
const require_credentialsHelpers = require('../../credentialsHelpers.js');

//#region src/core/WebAuthnManager/SignerWorkerManager/handlers/checkCanRegisterUser.ts
async function checkCanRegisterUser({ ctx, vrfChallenge, credential, contractId, nearRpcUrl, authenticatorOptions, onEvent }) {
	try {
		const response = await ctx.sendMessage({
			message: {
				type: require_wasm_signer_worker.WorkerRequestType.CheckCanRegisterUser,
				payload: {
					vrfChallenge: {
						vrfInput: vrfChallenge.vrfInput,
						vrfOutput: vrfChallenge.vrfOutput,
						vrfProof: vrfChallenge.vrfProof,
						vrfPublicKey: vrfChallenge.vrfPublicKey,
						userId: vrfChallenge.userId,
						rpId: vrfChallenge.rpId,
						blockHeight: vrfChallenge.blockHeight,
						blockHash: vrfChallenge.blockHash
					},
					credential: require_credentialsHelpers.serializeRegistrationCredentialWithPRF({ credential }),
					contractId,
					nearRpcUrl,
					authenticatorOptions: authenticatorOptions ? {
						userVerification: require_authenticatorOptions.toEnumUserVerificationPolicy(authenticatorOptions.userVerification),
						originPolicy: authenticatorOptions.originPolicy
					} : void 0
				}
			},
			onEvent,
			timeoutMs: require_config.SIGNER_WORKER_MANAGER_CONFIG.TIMEOUTS.TRANSACTION
		});
		if (!require_signer_worker.isCheckCanRegisterUserSuccess(response)) {
			const errorDetails = require_signer_worker.isWorkerError(response) ? response.payload.error : "Unknown worker error";
			throw new Error(`Registration check failed: ${errorDetails}`);
		}
		const wasmResult = response.payload;
		return {
			success: true,
			verified: wasmResult.verified,
			registrationInfo: wasmResult.registrationInfo,
			logs: wasmResult.logs,
			error: wasmResult.error
		};
	} catch (error) {
		console.error("checkCanRegisterUser failed:", error);
		return {
			success: false,
			verified: false,
			error: error.message || "Unknown error occurred",
			logs: []
		};
	}
}

//#endregion
exports.checkCanRegisterUser = checkCanRegisterUser;
//# sourceMappingURL=checkCanRegisterUser.js.map