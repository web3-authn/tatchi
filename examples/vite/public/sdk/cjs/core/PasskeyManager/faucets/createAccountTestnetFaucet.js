const require_passkeyManager = require('../../types/passkeyManager.js');

//#region src/core/PasskeyManager/faucets/createAccountTestnetFaucet.ts
/**
* Create NEAR account using testnet faucet service
* This only works on testnet, for production use the relayer server
* @deprecated Testnet only, use createAccountAndRegisterWithRelayServer instead for prod
*/
async function createAccountTestnetFaucet(nearAccountId, publicKey, onEvent) {
	try {
		console.debug("Creating NEAR account via testnet faucet service");
		onEvent?.({
			step: 3,
			phase: require_passkeyManager.RegistrationPhase.STEP_3_ACCESS_KEY_ADDITION,
			status: require_passkeyManager.RegistrationStatus.PROGRESS,
			message: "Creating NEAR account via faucet service..."
		});
		const faucetResponse = await fetch("https://helper.nearprotocol.com/account", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				newAccountId: nearAccountId,
				newAccountPublicKey: publicKey
			})
		});
		if (!faucetResponse.ok) {
			const errorData = await faucetResponse.json().catch(() => ({}));
			throw new Error(`Faucet service error: ${faucetResponse.status} - ${errorData.message || "Unknown error"}`);
		}
		const faucetResult = await faucetResponse.json();
		console.debug("Faucet service response:", faucetResult);
		console.debug("Faucet response status:", faucetResult.status);
		console.debug("Faucet final_execution_status:", faucetResult.final_execution_status);
		if (faucetResult.status?.Failure) {
			const failure = faucetResult.status.Failure;
			console.error("Faucet transaction failed on-chain:", failure);
			let errorMessage = "Transaction failed on-chain";
			if (failure.ActionError?.kind) {
				const errorKind = failure.ActionError.kind;
				const contractId = nearAccountId.split(".").slice(1).join(".");
				if (errorKind.CreateAccountNotAllowed) errorMessage = `
            Account creation for ${errorKind.CreateAccountNotAllowed.account_id} not allowed.
            Must be done through the ${contractId} account (via the relay server, not the testnet faucet).
          `;
				else if (errorKind.AccountAlreadyExists) errorMessage = `Account ${errorKind.AccountAlreadyExists.account_id} already exists`;
				else errorMessage = `${Object.keys(errorKind)[0]}`;
			}
			throw new Error(errorMessage);
		}
		onEvent?.({
			step: 3,
			phase: require_passkeyManager.RegistrationPhase.STEP_3_ACCESS_KEY_ADDITION,
			status: require_passkeyManager.RegistrationStatus.SUCCESS,
			message: `NEAR account ${nearAccountId} created successfully via faucet`
		});
		return {
			success: true,
			message: `Account ${nearAccountId} created successfully via faucet`
		};
	} catch (faucetError) {
		console.error("Faucet service error:", faucetError);
		onEvent?.({
			step: 0,
			phase: require_passkeyManager.RegistrationPhase.REGISTRATION_ERROR,
			status: require_passkeyManager.RegistrationStatus.ERROR,
			message: "Account creation via faucet failed",
			error: faucetError.message
		});
		return {
			success: false,
			message: "Faucet service failed, continuing with local registration",
			error: faucetError.message
		};
	}
}
/**
* Create account and register user using testnet faucet (sequential flow)
* This is the traditional flow: create account -> verify access key -> register with contract
* @deprecated Testnet only, use createAccountAndRegisterWithRelayServer instead for prod
*/
async function createAccountAndRegisterWithTestnetFaucet(context, nearAccountId, publicKey, credential, vrfChallenge, deterministicVrfPublicKey, authenticatorOptions, onEvent) {
	const { webAuthnManager, nearClient } = context;
	try {
		const accountCreationResult = await createAccountTestnetFaucet(nearAccountId, publicKey, onEvent);
		if (!accountCreationResult.success) throw new Error(accountCreationResult.error || "Account creation failed");
		await waitForAccessKey(nearClient, nearAccountId, publicKey, 10, 1e3);
		onEvent?.({
			step: 4,
			phase: require_passkeyManager.RegistrationPhase.STEP_4_ACCOUNT_VERIFICATION,
			status: require_passkeyManager.RegistrationStatus.SUCCESS,
			message: "Account creation verified successfully"
		});
		const contractRegistrationResult = await webAuthnManager.signVerifyAndRegisterUser({
			contractId: context.configs.contractId,
			credential,
			vrfChallenge,
			deterministicVrfPublicKey,
			nearAccountId,
			nearPublicKeyStr: publicKey,
			nearClient,
			deviceNumber: 1,
			onEvent: (progress) => {
				onEvent?.({
					step: 6,
					phase: require_passkeyManager.RegistrationPhase.STEP_6_CONTRACT_REGISTRATION,
					status: require_passkeyManager.RegistrationStatus.PROGRESS,
					message: `VRF registration: ${progress.message}`
				});
			}
		});
		if (!contractRegistrationResult.verified || !contractRegistrationResult.signedTransaction) throw new Error("Contract verification failed");
		onEvent?.({
			step: 6,
			phase: require_passkeyManager.RegistrationPhase.STEP_6_CONTRACT_REGISTRATION,
			status: require_passkeyManager.RegistrationStatus.PROGRESS,
			message: "Broadcasting registration transaction..."
		});
		const transactionResult = await nearClient.sendTransaction(contractRegistrationResult.signedTransaction);
		const transactionId = transactionResult?.transaction_outcome?.id;
		onEvent?.({
			step: 6,
			phase: require_passkeyManager.RegistrationPhase.STEP_6_CONTRACT_REGISTRATION,
			status: require_passkeyManager.RegistrationStatus.SUCCESS,
			message: `VRF registration successful, transaction ID: ${transactionId}`
		});
		return {
			success: true,
			transactionId,
			preSignedDeleteTransaction: contractRegistrationResult.preSignedDeleteTransaction
		};
	} catch (error) {
		console.error("Sequential registration failed:", error);
		onEvent?.({
			step: 0,
			phase: require_passkeyManager.RegistrationPhase.REGISTRATION_ERROR,
			status: require_passkeyManager.RegistrationStatus.ERROR,
			message: `Registration failed: ${error.message}`,
			error: error.message
		});
		return {
			success: false,
			error: error.message,
			preSignedDeleteTransaction: null
		};
	}
}
/**
* Wait for access key to be available with retry logic
* Account creation via faucet may have propagation delays
*/
async function waitForAccessKey(nearClient, nearAccountId, nearPublicKey, maxRetries = 10, delayMs = 1e3) {
	console.debug(`Waiting for access key to be available for ${nearAccountId}...`);
	for (let attempt = 1; attempt <= maxRetries; attempt++) try {
		const accessKeyInfo = await nearClient.viewAccessKey(nearAccountId, nearPublicKey);
		console.debug(`Access key found on attempt ${attempt}`);
		return accessKeyInfo;
	} catch (error) {
		console.debug(`Access key not available yet (attempt ${attempt}/${maxRetries}):`, error.message);
		if (attempt === maxRetries) {
			console.error(`Access key still not available after ${maxRetries} attempts`);
			throw new Error(`Access key not available after ${maxRetries * delayMs}ms. Account creation may have failed.`);
		}
		const delay = delayMs * Math.pow(1.5, attempt - 1);
		console.debug(`   Waiting ${delay}ms before retry...`);
		await new Promise((resolve) => setTimeout(resolve, delay));
	}
	throw new Error("Unexpected error in waitForAccessKey");
}

//#endregion
exports.createAccountAndRegisterWithTestnetFaucet = createAccountAndRegisterWithTestnetFaucet;
//# sourceMappingURL=createAccountTestnetFaucet.js.map