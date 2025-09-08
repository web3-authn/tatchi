const require_base64 = require('../../../utils/base64.js');
const require_credentialsHelpers = require('../../WebAuthnManager/credentialsHelpers.js');
const require_passkeyManager = require('../../types/passkeyManager.js');

//#region src/core/PasskeyManager/faucets/createAccountRelayServer.ts
/**
* Create account and register user using relay-server atomic endpoint
* Makes a single call to the relay-server's /create_account_and_register_user endpoint
* which calls the contract's atomic create_account_and_register_user function
*/
async function createAccountAndRegisterWithRelayServer(context, nearAccountId, publicKey, credential, vrfChallenge, deterministicVrfPublicKey, authenticatorOptions, onEvent) {
	const { configs } = context;
	if (!configs.relayer.url) throw new Error("Relay server URL is required for atomic registration");
	try {
		onEvent?.({
			step: 3,
			phase: require_passkeyManager.RegistrationPhase.STEP_3_ACCESS_KEY_ADDITION,
			status: require_passkeyManager.RegistrationStatus.PROGRESS,
			message: "Adding access key to account..."
		});
		const serializedCredential = require_credentialsHelpers.removePrfOutputGuard(require_credentialsHelpers.serializeRegistrationCredential(credential));
		const requestData = {
			new_account_id: nearAccountId,
			new_public_key: publicKey,
			device_number: 1,
			vrf_data: {
				vrf_input_data: Array.from(require_base64.base64UrlDecode(vrfChallenge.vrfInput)),
				vrf_output: Array.from(require_base64.base64UrlDecode(vrfChallenge.vrfOutput)),
				vrf_proof: Array.from(require_base64.base64UrlDecode(vrfChallenge.vrfProof)),
				public_key: Array.from(require_base64.base64UrlDecode(vrfChallenge.vrfPublicKey)),
				user_id: vrfChallenge.userId,
				rp_id: vrfChallenge.rpId,
				block_height: Number(vrfChallenge.blockHeight),
				block_hash: Array.from(require_base64.base64UrlDecode(vrfChallenge.blockHash))
			},
			webauthn_registration: serializedCredential,
			deterministic_vrf_public_key: Array.from(require_base64.base64UrlDecode(deterministicVrfPublicKey)),
			authenticator_options: authenticatorOptions || context.configs.authenticatorOptions
		};
		onEvent?.({
			step: 6,
			phase: require_passkeyManager.RegistrationPhase.STEP_6_CONTRACT_REGISTRATION,
			status: require_passkeyManager.RegistrationStatus.PROGRESS,
			message: "Registering user with Web3Authn contract..."
		});
		const response = await fetch(`${configs.relayer.url}/create_account_and_register_user`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(requestData)
		});
		const result = await response.json();
		if (!response.ok) {
			const errorMessage = result.error || result.message || `HTTP ${response.status}: ${response.statusText}`;
			throw new Error(errorMessage);
		}
		if (!result.success) throw new Error(result.error || "Atomic registration failed");
		onEvent?.({
			step: 6,
			phase: require_passkeyManager.RegistrationPhase.STEP_6_CONTRACT_REGISTRATION,
			status: require_passkeyManager.RegistrationStatus.SUCCESS,
			message: "User registered with Web3Authn contract successfully"
		});
		return {
			success: true,
			transactionId: result.transactionHash,
			preSignedDeleteTransaction: null
		};
	} catch (error) {
		console.error("Atomic registration failed:", error);
		onEvent?.({
			step: 0,
			phase: require_passkeyManager.RegistrationPhase.REGISTRATION_ERROR,
			status: require_passkeyManager.RegistrationStatus.ERROR,
			message: "Registration failed",
			error: error.message
		});
		return {
			success: false,
			error: error.message,
			preSignedDeleteTransaction: null
		};
	}
}

//#endregion
exports.createAccountAndRegisterWithRelayServer = createAccountAndRegisterWithRelayServer;
//# sourceMappingURL=createAccountRelayServer.js.map