const require_validation = require('../../utils/validation.js');
const require_base64 = require('../../utils/base64.js');
const require_errors = require('../../utils/errors.js');
const require_NearClient = require('../NearClient.js');
const require_passkeyManager = require('../types/passkeyManager.js');
const require_createAccountRelayServer = require('./faucets/createAccountRelayServer.js');
const require_createAccountTestnetFaucet = require('./faucets/createAccountTestnetFaucet.js');

//#region src/core/PasskeyManager/registration.ts
/**
* Core registration function that handles passkey registration
*
* VRF Registration Flow (Single VRF Keypair):
* 1. Generate VRF keypair (ed25519) using crypto.randomUUID() + persist in worker memory
* 2. Generate VRF proof + output using the VRF keypair
*    - VRF input with domain separator + NEAR block height + hash
* 3. Use VRF output as WebAuthn challenge in registration ceremony
* 4. Derive AES key from WebAuthn PRF output and encrypt the SAME VRF keypair
* 5. Store encrypted VRF keypair in IndexedDB
* 6. Call contract verify_registration_response with VRF proof + WebAuthn registration payload
* 7. Contract verifies VRF proof and WebAuthn registration (challenges match!)
* 8. Contract stores VRF pubkey + authenticator credentials on-chain for
*    future stateless authentication
*/
async function registerPasskey(context, nearAccountId, options, authenticatorOptions) {
	const { onEvent, onError, hooks, useRelayer } = options;
	const { webAuthnManager, configs } = context;
	const registrationState = {
		accountCreated: false,
		contractRegistered: false,
		databaseStored: false,
		contractTransactionId: null,
		preSignedDeleteTransaction: null
	};
	console.log("⚡ Registration: Passkey registration with VRF WebAuthn ceremony");
	onEvent?.({
		step: 1,
		phase: require_passkeyManager.RegistrationPhase.STEP_1_WEBAUTHN_VERIFICATION,
		status: require_passkeyManager.RegistrationStatus.PROGRESS,
		message: `Starting registration for ${nearAccountId}`
	});
	try {
		await hooks?.beforeCall?.();
		await validateRegistrationInputs(context, nearAccountId, onEvent, onError);
		onEvent?.({
			step: 1,
			phase: require_passkeyManager.RegistrationPhase.STEP_1_WEBAUTHN_VERIFICATION,
			status: require_passkeyManager.RegistrationStatus.PROGRESS,
			message: "Account available - generating VRF credentials..."
		});
		const { vrfChallenge } = await Promise.all([validateRegistrationInputs(context, nearAccountId, onEvent, onError), generateBootstrapVrfChallenge(context, nearAccountId)]).then(([_, vrfChallenge$1]) => ({ vrfChallenge: vrfChallenge$1 }));
		onEvent?.({
			step: 1,
			phase: require_passkeyManager.RegistrationPhase.STEP_1_WEBAUTHN_VERIFICATION,
			status: require_passkeyManager.RegistrationStatus.PROGRESS,
			message: "Performing WebAuthn registration with VRF challenge..."
		});
		const credential = await webAuthnManager.generateRegistrationCredentials({
			nearAccountId,
			challenge: vrfChallenge
		});
		onEvent?.({
			step: 1,
			phase: require_passkeyManager.RegistrationPhase.STEP_1_WEBAUTHN_VERIFICATION,
			status: require_passkeyManager.RegistrationStatus.SUCCESS,
			message: "WebAuthn ceremony successful, PRF output obtained"
		});
		const { deterministicVrfKeyResult, nearKeyResult, canRegisterUserResult } = await Promise.all([
			webAuthnManager.deriveVrfKeypair({
				credential,
				nearAccountId,
				saveInMemory: true
			}),
			webAuthnManager.deriveNearKeypairAndEncrypt({
				credential,
				nearAccountId
			}),
			webAuthnManager.checkCanRegisterUser({
				contractId: context.configs.contractId,
				credential,
				vrfChallenge,
				onEvent: (progress) => {
					console.debug(`Registration progress: ${progress.step} - ${progress.message}`);
					onEvent?.({
						step: 4,
						phase: require_passkeyManager.RegistrationPhase.STEP_4_ACCOUNT_VERIFICATION,
						status: require_passkeyManager.RegistrationStatus.PROGRESS,
						message: `Checking registration: ${progress.message}`
					});
				}
			})
		]).then(([deterministicVrfKeyResult$1, nearKeyResult$1, canRegisterUserResult$1]) => {
			if (!deterministicVrfKeyResult$1.success || !deterministicVrfKeyResult$1.vrfPublicKey) throw new Error("Failed to derive deterministic VRF keypair from PRF");
			if (!nearKeyResult$1.success || !nearKeyResult$1.publicKey) throw new Error("Failed to generate NEAR keypair with PRF");
			if (!canRegisterUserResult$1.verified) {
				console.error(canRegisterUserResult$1);
				const errorMessage = canRegisterUserResult$1.error || "User verification failed - account may already exist or contract is unreachable";
				throw new Error(`Web3Authn contract registration check failed: ${errorMessage}`);
			}
			return {
				deterministicVrfKeyResult: deterministicVrfKeyResult$1,
				nearKeyResult: nearKeyResult$1,
				canRegisterUserResult: canRegisterUserResult$1
			};
		});
		onEvent?.({
			step: 2,
			phase: require_passkeyManager.RegistrationPhase.STEP_2_KEY_GENERATION,
			status: require_passkeyManager.RegistrationStatus.SUCCESS,
			message: "Wallet keys derived successfully from TouchId",
			verified: true,
			nearAccountId,
			nearPublicKey: nearKeyResult.publicKey,
			vrfPublicKey: vrfChallenge.vrfPublicKey
		});
		let accountAndRegistrationResult;
		if (useRelayer) {
			console.debug("Using relay-server registration flow");
			accountAndRegistrationResult = await require_createAccountRelayServer.createAccountAndRegisterWithRelayServer(context, nearAccountId, nearKeyResult.publicKey, credential, vrfChallenge, deterministicVrfKeyResult.vrfPublicKey, authenticatorOptions, onEvent);
		} else {
			console.debug("Using testnet faucet registration flow");
			accountAndRegistrationResult = await require_createAccountTestnetFaucet.createAccountAndRegisterWithTestnetFaucet(context, nearAccountId, nearKeyResult.publicKey, credential, vrfChallenge, deterministicVrfKeyResult.vrfPublicKey, authenticatorOptions, onEvent);
		}
		if (!accountAndRegistrationResult.success) throw new Error(accountAndRegistrationResult.error || "Account creation and registration failed");
		registrationState.accountCreated = true;
		registrationState.contractRegistered = true;
		registrationState.contractTransactionId = accountAndRegistrationResult.transactionId || null;
		registrationState.preSignedDeleteTransaction = null;
		if (!useRelayer) {
			registrationState.preSignedDeleteTransaction = accountAndRegistrationResult.preSignedDeleteTransaction;
			console.debug("Pre-signed delete transaction captured for rollback");
			if (registrationState.preSignedDeleteTransaction) {
				const preSignedDeleteTransactionHash = generateTransactionHash(registrationState.preSignedDeleteTransaction);
				onEvent?.({
					step: 6,
					phase: require_passkeyManager.RegistrationPhase.STEP_6_CONTRACT_REGISTRATION,
					status: require_passkeyManager.RegistrationStatus.PROGRESS,
					message: `Presigned delete transaction created for rollback (hash: ${preSignedDeleteTransactionHash})`
				});
			}
		}
		onEvent?.({
			step: 5,
			phase: require_passkeyManager.RegistrationPhase.STEP_5_DATABASE_STORAGE,
			status: require_passkeyManager.RegistrationStatus.PROGRESS,
			message: "Storing VRF registration data"
		});
		await webAuthnManager.atomicStoreRegistrationData({
			nearAccountId,
			credential,
			publicKey: nearKeyResult.publicKey,
			encryptedVrfKeypair: deterministicVrfKeyResult.encryptedVrfKeypair,
			vrfPublicKey: deterministicVrfKeyResult.vrfPublicKey,
			serverEncryptedVrfKeypair: deterministicVrfKeyResult.serverEncryptedVrfKeypair,
			onEvent
		});
		registrationState.databaseStored = true;
		onEvent?.({
			step: 5,
			phase: require_passkeyManager.RegistrationPhase.STEP_5_DATABASE_STORAGE,
			status: require_passkeyManager.RegistrationStatus.SUCCESS,
			message: "VRF registration data stored successfully"
		});
		const unlockResult = await webAuthnManager.unlockVRFKeypair({
			nearAccountId,
			encryptedVrfKeypair: deterministicVrfKeyResult.encryptedVrfKeypair,
			credential
		}).catch((unlockError) => {
			console.warn("VRF keypair unlock failed:", unlockError);
			return {
				success: false,
				error: unlockError.message
			};
		});
		if (!unlockResult.success) {
			console.warn("VRF keypair unlock failed:", unlockResult.error);
			throw new Error(unlockResult.error);
		}
		onEvent?.({
			step: 7,
			phase: require_passkeyManager.RegistrationPhase.STEP_7_REGISTRATION_COMPLETE,
			status: require_passkeyManager.RegistrationStatus.SUCCESS,
			message: "Registration completed successfully"
		});
		const successResult = {
			success: true,
			nearAccountId,
			clientNearPublicKey: nearKeyResult.publicKey,
			transactionId: registrationState.contractTransactionId,
			vrfRegistration: {
				success: true,
				vrfPublicKey: vrfChallenge.vrfPublicKey,
				encryptedVrfKeypair: deterministicVrfKeyResult.encryptedVrfKeypair,
				contractVerified: accountAndRegistrationResult.success
			}
		};
		hooks?.afterCall?.(true, successResult);
		return successResult;
	} catch (error) {
		console.error("Registration failed:", error.message, error.stack);
		await performRegistrationRollback(registrationState, nearAccountId, webAuthnManager, configs.nearRpcUrl, onEvent);
		const errorMessage = require_errors.getUserFriendlyErrorMessage(error, "registration", nearAccountId);
		const errorObject = new Error(errorMessage);
		onError?.(errorObject);
		onEvent?.({
			step: 0,
			phase: require_passkeyManager.RegistrationPhase.REGISTRATION_ERROR,
			status: require_passkeyManager.RegistrationStatus.ERROR,
			message: errorMessage,
			error: errorMessage
		});
		const result = {
			success: false,
			error: errorMessage
		};
		hooks?.afterCall?.(false, result);
		return result;
	}
}
/**
* Generate a VRF keypair + challenge in VRF wasm worker for WebAuthn registration ceremony bootstrapping
*
* ARCHITECTURE: This function solves the chicken-and-egg problem with a single VRF keypair:
* 1. Generate VRF keypair + challenge (no PRF needed)
* 2. Persist VRF keypair in worker memory (NOT encrypted yet)
* 3. Use VRF challenge for WebAuthn ceremony → get PRF output
* 4. Encrypt the SAME VRF keypair (still in memory) with PRF
*
* @param webAuthnManager - WebAuthn manager instance
* @param nearAccountId - NEAR account ID for VRF input
* @param blockHeight - Current NEAR block height for freshness
* @param blockHashBytes - Current NEAR block hash bytes for entropy
* @returns VRF challenge data (VRF keypair persisted in worker memory)
*/
async function generateBootstrapVrfChallenge(context, nearAccountId) {
	const { webAuthnManager, nearClient } = context;
	const blockInfo = await nearClient.viewBlock({ finality: "final" });
	console.log("Generating VRF keypair for registration");
	const vrfResult = await webAuthnManager.generateVrfKeypairBootstrap(true, {
		userId: nearAccountId,
		rpId: window.location.hostname,
		blockHeight: String(blockInfo.header.height),
		blockHash: blockInfo.header.hash
	});
	if (!vrfResult.vrfChallenge) throw new Error("Registration VRF keypair generation failed");
	console.log("bootstrap VRF keypair generated and persisted in worker memory");
	return vrfResult.vrfChallenge;
}
/**
* Validates registration inputs and throws errors if invalid
* @param nearAccountId - NEAR account ID to validate
* @param onEvent - Optional callback for registration progress events
* @param onError - Optional callback for error handling
*/
const validateRegistrationInputs = async (context, nearAccountId, onEvent, onError) => {
	onEvent?.({
		step: 1,
		phase: require_passkeyManager.RegistrationPhase.STEP_1_WEBAUTHN_VERIFICATION,
		status: require_passkeyManager.RegistrationStatus.PROGRESS,
		message: "Validating registration inputs..."
	});
	if (!nearAccountId) {
		const error = /* @__PURE__ */ new Error("NEAR account ID is required for registration.");
		onError?.(error);
		throw error;
	}
	const validation = require_validation.validateNearAccountId(nearAccountId);
	if (!validation.valid) {
		const error = /* @__PURE__ */ new Error(`Invalid NEAR account ID: ${validation.error}`);
		onError?.(error);
		throw error;
	}
	if (!window.isSecureContext) {
		const error = /* @__PURE__ */ new Error("Passkey operations require a secure context (HTTPS or localhost).");
		onError?.(error);
		throw error;
	}
	onEvent?.({
		step: 1,
		phase: require_passkeyManager.RegistrationPhase.STEP_1_WEBAUTHN_VERIFICATION,
		status: require_passkeyManager.RegistrationStatus.PROGRESS,
		message: `Checking if account ${nearAccountId} is available...`
	});
	try {
		await context.nearClient.viewAccount(nearAccountId);
		const error = /* @__PURE__ */ new Error(`Account ${nearAccountId} already exists. Please choose a different account ID.`);
		onError?.(error);
		throw error;
	} catch (viewError) {
		console.log(`Account ${nearAccountId} is available for registration (viewAccount failed: ${viewError.message})`);
		onEvent?.({
			step: 1,
			phase: require_passkeyManager.RegistrationPhase.STEP_1_WEBAUTHN_VERIFICATION,
			status: require_passkeyManager.RegistrationStatus.PROGRESS,
			message: `Account ${nearAccountId} is available for registration`
		});
		return;
	}
};
/**
* Rollback registration data in case of errors
*/
async function performRegistrationRollback(registrationState, nearAccountId, webAuthnManager, rpcNodeUrl, onEvent) {
	console.debug("Starting registration rollback...", registrationState);
	try {
		if (registrationState.databaseStored) {
			console.debug("Rolling back database storage...");
			onEvent?.({
				step: 0,
				phase: require_passkeyManager.RegistrationPhase.REGISTRATION_ERROR,
				status: require_passkeyManager.RegistrationStatus.ERROR,
				message: "Rolling back database storage...",
				error: "Registration failed - rolling back database storage"
			});
			await webAuthnManager.rollbackUserRegistration(nearAccountId);
			console.debug("Database rollback completed");
		}
		if (registrationState.accountCreated) {
			console.debug("Rolling back NEAR account...");
			onEvent?.({
				step: 0,
				phase: require_passkeyManager.RegistrationPhase.REGISTRATION_ERROR,
				status: require_passkeyManager.RegistrationStatus.ERROR,
				message: `Rolling back NEAR account ${nearAccountId}...`,
				error: "Registration failed - attempting account deletion"
			});
			if (registrationState.preSignedDeleteTransaction) {
				console.debug("Broadcasting pre-signed delete transaction for account rollback...");
				try {
					const tempNearClient = new require_NearClient.MinimalNearClient(rpcNodeUrl);
					const deletionResult = await tempNearClient.sendTransaction(registrationState.preSignedDeleteTransaction);
					const deleteTransactionId = deletionResult?.transaction_outcome?.id;
					console.debug(`NEAR account ${nearAccountId} deleted successfully via pre-signed transaction`);
					console.debug(`   Delete transaction ID: ${deleteTransactionId}`);
					onEvent?.({
						step: 0,
						phase: require_passkeyManager.RegistrationPhase.REGISTRATION_ERROR,
						status: require_passkeyManager.RegistrationStatus.ERROR,
						message: `NEAR account ${nearAccountId} deleted successfully (rollback completed)`,
						error: "Registration failed but account rollback completed"
					});
				} catch (deleteError) {
					console.error(`NEAR account deletion failed:`, deleteError);
					onEvent?.({
						step: 0,
						phase: require_passkeyManager.RegistrationPhase.REGISTRATION_ERROR,
						status: require_passkeyManager.RegistrationStatus.ERROR,
						message: `️NEAR account ${nearAccountId} could not be deleted: ${deleteError.message}. Account will remain on testnet.`,
						error: "Registration failed - account deletion failed"
					});
				}
			} else {
				console.debug(`No pre-signed delete transaction available for ${nearAccountId}. Account will remain on testnet.`);
				onEvent?.({
					step: 0,
					phase: require_passkeyManager.RegistrationPhase.REGISTRATION_ERROR,
					status: require_passkeyManager.RegistrationStatus.ERROR,
					message: `️NEAR account ${nearAccountId} could not be deleted: No pre-signed transaction available. Account will remain on testnet.`,
					error: "Registration failed - no rollback transaction available"
				});
			}
		}
		if (registrationState.contractRegistered) {
			console.debug("Contract registration cannot be rolled back (immutable blockchain state)");
			onEvent?.({
				step: 0,
				phase: require_passkeyManager.RegistrationPhase.REGISTRATION_ERROR,
				status: require_passkeyManager.RegistrationStatus.ERROR,
				message: `Contract registration (tx: ${registrationState.contractTransactionId}) cannot be rolled back`,
				error: "Registration failed - contract state is immutable"
			});
		}
		console.debug("Registration rollback completed");
	} catch (rollbackError) {
		console.error("Rollback failed:", rollbackError);
		onEvent?.({
			step: 0,
			phase: require_passkeyManager.RegistrationPhase.REGISTRATION_ERROR,
			status: require_passkeyManager.RegistrationStatus.ERROR,
			message: `Rollback failed: ${rollbackError.message}`,
			error: "Both registration and rollback failed"
		});
	}
}
/**
* Generate a hash of a signed transaction for verification purposes
* Uses the borsh bytes of the transaction to create a consistent hash
*/
function generateTransactionHash(signedTransaction) {
	try {
		const transactionBytes = new Uint8Array(signedTransaction.borsh_bytes);
		const hashInput = Array.from(transactionBytes).join(",");
		const hash = require_base64.base64UrlEncode(new TextEncoder().encode(hashInput).buffer).substring(0, 16);
		return hash;
	} catch (error) {
		console.warn("Failed to generate transaction hash:", error);
		return "hash-generation-failed";
	}
}

//#endregion
exports.generateBootstrapVrfChallenge = generateBootstrapVrfChallenge;
exports.registerPasskey = registerPasskey;
//# sourceMappingURL=registration.js.map