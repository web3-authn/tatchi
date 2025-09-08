import { ActionPhase, ActionStatus } from "../types/passkeyManager.js";

//#region src/core/PasskeyManager/signNEP413.ts
/**
* Sign a NEP-413 message using the user's passkey-derived private key
*
* This function implements the NEP-413 standard for off-chain message signing:
* - Creates a payload with message, recipient, nonce, and state
* - Serializes using Borsh
* - Adds NEP-413 prefix (2^31 + 413)
* - Hashes with SHA-256
* - Signs with Ed25519
* - Returns base64-encoded signature
*
* @param context - PasskeyManager context
* @param nearAccountId - NEAR account ID to sign with
* @param params - NEP-413 signing parameters
* @param options - Action options for event handling
* @returns Promise resolving to signing result
*/
async function signNEP413Message(args) {
	const { context, nearAccountId, params, options } = args;
	const { nearClient, webAuthnManager } = context;
	try {
		options?.onEvent?.({
			step: 1,
			phase: ActionPhase.STEP_1_PREPARATION,
			status: ActionStatus.PROGRESS,
			message: "Preparing NEP-413 message signing"
		});
		const [vrfStatus, userData, authenticators] = await Promise.all([
			webAuthnManager.checkVrfStatus(),
			webAuthnManager.getUser(nearAccountId),
			webAuthnManager.getAuthenticatorsByUser(nearAccountId)
		]);
		if (!vrfStatus.active) throw new Error("User not authenticated. Please login first.");
		if (!userData || !userData.clientNearPublicKey) throw new Error(`User data not found for ${nearAccountId}`);
		const { nextNonce, txBlockHash, txBlockHeight } = await context.webAuthnManager.getNonceManager().getNonceBlockHashAndHeight(nearClient);
		const vrfChallenge = await webAuthnManager.generateVrfChallenge({
			userId: nearAccountId,
			rpId: window.location.hostname,
			blockHash: txBlockHash,
			blockHeight: txBlockHeight
		});
		const credential = await context.webAuthnManager.getCredentials({
			nearAccountId,
			challenge: vrfChallenge,
			authenticators
		});
		options?.onEvent?.({
			step: 6,
			phase: ActionPhase.STEP_6_TRANSACTION_SIGNING_PROGRESS,
			status: ActionStatus.PROGRESS,
			message: "Signing NEP-413 message"
		});
		const result = await context.webAuthnManager.signNEP413Message({
			message: params.message,
			recipient: params.recipient,
			nonce: nextNonce,
			state: params.state || null,
			accountId: nearAccountId,
			credential
		});
		if (result.success) {
			options?.onEvent?.({
				step: 9,
				phase: ActionPhase.STEP_9_ACTION_COMPLETE,
				status: ActionStatus.SUCCESS,
				message: "NEP-413 message signed successfully"
			});
			return {
				success: true,
				accountId: result.accountId,
				publicKey: result.publicKey,
				signature: result.signature,
				state: result.state
			};
		} else throw new Error(`NEP-413 signing failed: ${result.error || "Unknown error"}`);
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : "Unknown error";
		options?.onEvent?.({
			step: 0,
			phase: "action-error",
			status: "error",
			message: `NEP-413 signing failed: ${errorMessage}`,
			error: errorMessage
		});
		options?.onError?.(error instanceof Error ? error : new Error(errorMessage));
		return {
			success: false,
			error: errorMessage
		};
	}
}

//#endregion
export { signNEP413Message };
//# sourceMappingURL=signNEP413.js.map