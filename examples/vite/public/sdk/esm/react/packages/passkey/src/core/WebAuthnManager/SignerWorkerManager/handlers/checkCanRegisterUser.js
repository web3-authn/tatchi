import { WorkerRequestType } from "../../../../wasm_signer_worker/wasm_signer_worker.js";
import { isCheckCanRegisterUserSuccess, isWorkerError } from "../../../types/signer-worker.js";
import { SIGNER_WORKER_MANAGER_CONFIG } from "../../../../config.js";
import { toEnumUserVerificationPolicy } from "../../../types/authenticatorOptions.js";
import { serializeRegistrationCredentialWithPRF } from "../../credentialsHelpers.js";

//#region src/core/WebAuthnManager/SignerWorkerManager/handlers/checkCanRegisterUser.ts
async function checkCanRegisterUser({ ctx, vrfChallenge, credential, contractId, nearRpcUrl, authenticatorOptions, onEvent }) {
	try {
		const response = await ctx.sendMessage({
			message: {
				type: WorkerRequestType.CheckCanRegisterUser,
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
					credential: serializeRegistrationCredentialWithPRF({ credential }),
					contractId,
					nearRpcUrl,
					authenticatorOptions: authenticatorOptions ? {
						userVerification: toEnumUserVerificationPolicy(authenticatorOptions.userVerification),
						originPolicy: authenticatorOptions.originPolicy
					} : void 0
				}
			},
			onEvent,
			timeoutMs: SIGNER_WORKER_MANAGER_CONFIG.TIMEOUTS.TRANSACTION
		});
		if (!isCheckCanRegisterUserSuccess(response)) {
			const errorDetails = isWorkerError(response) ? response.payload.error : "Unknown worker error";
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
export { checkCanRegisterUser };
//# sourceMappingURL=checkCanRegisterUser.js.map