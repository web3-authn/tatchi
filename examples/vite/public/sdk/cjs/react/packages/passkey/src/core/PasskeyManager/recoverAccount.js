const require_validation = require('../../utils/validation.js');
const require_accountIds = require('../types/accountIds.js');
const require_index = require('../IndexedDBManager/index.js');
const require_base64 = require('../../utils/base64.js');
const require_vrf_worker = require('../types/vrf-worker.js');
const require_passkeyManager = require('../types/passkeyManager.js');
const require_registration = require('./registration.js');
const require_rpcCalls = require('../rpcCalls.js');

//#region src/core/PasskeyManager/recoverAccount.ts
/**
* Account recovery flow with credential encapsulation
*
* Usage:
* ```typescript
* const flow = new AccountRecoveryFlow(context);
* const options = await flow.discover(); // Get safe display options
* // ... user selects account in UI ...
* const result = await flow.recover({ credentialId, accountId }); // Execute recovery
* ```
*/
var AccountRecoveryFlow = class {
	context;
	options;
	availableAccounts;
	phase = "idle";
	error;
	constructor(context, options) {
		this.context = context;
		this.options = options;
	}
	/**
	* Phase 1: Discover available accounts
	* Returns safe display data without exposing credentials to UI
	*/
	async discover(accountId) {
		const nearAccountId = require_accountIds.toAccountId(accountId);
		try {
			this.phase = "discovering";
			console.debug("AccountRecoveryFlow: Discovering available accounts...");
			this.availableAccounts = await getRecoverableAccounts(this.context, nearAccountId);
			if (this.availableAccounts.length === 0) {
				console.warn("No recoverable accounts found for this passkey");
				console.warn(`Continuing with account recovery for ${accountId}`);
			} else console.debug(`AccountRecoveryFlow: Found ${this.availableAccounts.length} recoverable accounts`);
			this.phase = "ready";
			return this.availableAccounts.map((option) => ({
				credentialId: option.credentialId,
				accountId: option.accountId,
				publicKey: option.publicKey,
				displayName: option.displayName
			}));
		} catch (error) {
			this.phase = "error";
			this.error = error;
			console.error("AccountRecoveryFlow: Discovery failed:", error);
			throw error;
		}
	}
	/**
	* Phase 2: Execute recovery with user selection
	* Securely looks up credential based on selection
	*/
	async recover(selection) {
		if (this.phase !== "ready") throw new Error(`Cannot recover - flow is in ${this.phase} phase. Call discover() first.`);
		if (!this.availableAccounts) throw new Error("No available accounts found. Call discover() first.");
		try {
			this.phase = "recovering";
			console.debug(`AccountRecoveryFlow: Recovering account: ${selection.accountId}`);
			const selectedOption = this.availableAccounts.find((option) => option.credentialId === selection.credentialId && option.accountId === selection.accountId);
			if (!selectedOption) throw new Error("Invalid selection - account not found in available options");
			if (!selectedOption.accountId) throw new Error("Invalid account selection - no account ID provided");
			const recoveryResult = await recoverAccount(this.context, selectedOption.accountId, this.options, selectedOption.credential || void 0);
			this.phase = "complete";
			return recoveryResult;
		} catch (error) {
			this.phase = "error";
			this.error = error;
			console.error("AccountRecoveryFlow: Recovery failed:", error);
			throw error;
		}
	}
	/**
	* Get current flow state (safe display data only)
	*/
	getState() {
		const safeAccounts = this.availableAccounts?.map((option) => ({
			credentialId: option.credentialId,
			accountId: option.accountId,
			publicKey: option.publicKey,
			displayName: option.displayName
		}));
		return {
			phase: this.phase,
			availableAccounts: safeAccounts,
			error: this.error,
			isReady: this.phase === "ready",
			isComplete: this.phase === "complete",
			hasError: this.phase === "error"
		};
	}
	/**
	* Reset flow to initial state
	*/
	reset() {
		this.phase = "idle";
		this.availableAccounts = void 0;
		this.error = void 0;
	}
};
/**
* Get available passkeys for account recovery
*/
async function getRecoverableAccounts(context, accountId) {
	const vrfChallenge = await require_registration.generateBootstrapVrfChallenge(context, accountId);
	const availablePasskeys = await getAvailablePasskeysForDomain(context, vrfChallenge, accountId);
	return availablePasskeys.filter((passkey) => passkey.accountId !== null);
}
/**
* Discover passkeys for domain using contract-based lookup
*/
async function getAvailablePasskeysForDomain(context, vrfChallenge, accountId) {
	const { webAuthnManager, nearClient, configs } = context;
	const credentialIds = await require_rpcCalls.getCredentialIdsContractCall(nearClient, configs.contractId, accountId);
	try {
		const credential = await webAuthnManager.getCredentialsForRecovery({
			nearAccountId: accountId,
			challenge: vrfChallenge,
			credentialIds: credentialIds.length > 0 ? credentialIds : []
		});
		if (credential) return [{
			credentialId: credential.id,
			accountId,
			publicKey: "",
			displayName: `${accountId} (Authenticated with this passkey)`,
			credential
		}];
	} catch (error) {
		console.warn("Failed to authenticate with passkey:", error);
	}
	return [{
		credentialId: "manual-input",
		accountId,
		publicKey: "",
		displayName: `${accountId} (Authentication failed - please try again)`,
		credential: null
	}];
}
/**
* Main account recovery function
*/
async function recoverAccount(context, accountId, options, reuseCredential) {
	const { onEvent, onError, hooks } = options || {};
	const { webAuthnManager, nearClient, configs } = context;
	await hooks?.beforeCall?.();
	onEvent?.({
		step: 1,
		phase: require_passkeyManager.AccountRecoveryPhase.STEP_1_PREPARATION,
		status: require_passkeyManager.AccountRecoveryStatus.PROGRESS,
		message: "Preparing account recovery..."
	});
	try {
		const validation = require_validation.validateNearAccountId(accountId);
		if (!validation.valid) return handleRecoveryError(accountId, `Invalid NEAR account ID: ${validation.error}`, onError, hooks);
		onEvent?.({
			step: 2,
			phase: require_passkeyManager.AccountRecoveryPhase.STEP_2_WEBAUTHN_AUTHENTICATION,
			status: require_passkeyManager.AccountRecoveryStatus.PROGRESS,
			message: "Authenticating with WebAuthn..."
		});
		const credential = await getOrCreateCredential(webAuthnManager, accountId, reuseCredential);
		const recoveredKeypair = await deriveNearKeypairFromCredential(webAuthnManager, credential, accountId);
		const { hasAccess, blockHeight, blockHash } = await Promise.all([nearClient.viewAccessKey(accountId, recoveredKeypair.publicKey), nearClient.viewBlock({ finality: "final" })]).then(([hasAccess$1, blockInfo]) => {
			return {
				hasAccess: hasAccess$1,
				blockHeight: String(blockInfo.header.height),
				blockHash: blockInfo.header.hash
			};
		});
		if (!hasAccess) return handleRecoveryError(accountId, `Account ${accountId} was not created with this passkey`, onError, hooks);
		const vrfInputData = {
			userId: accountId,
			rpId: window.location.hostname,
			blockHeight,
			blockHash
		};
		const deterministicVrfResult = await webAuthnManager.deriveVrfKeypair({
			credential,
			nearAccountId: accountId,
			vrfInputData
		});
		if (!deterministicVrfResult.success) throw new Error("Failed to derive deterministic VRF keypair and generate challenge from PRF");
		const recoveryResult = await performAccountRecovery({
			context,
			accountId,
			publicKey: recoveredKeypair.publicKey,
			encryptedKeypair: {
				encryptedPrivateKey: recoveredKeypair.encryptedPrivateKey,
				iv: recoveredKeypair.iv
			},
			credential,
			encryptedVrfResult: {
				vrfPublicKey: deterministicVrfResult.vrfPublicKey,
				encryptedVrfKeypair: deterministicVrfResult.encryptedVrfKeypair,
				serverEncryptedVrfKeypair: deterministicVrfResult.serverEncryptedVrfKeypair || void 0
			},
			onEvent
		});
		onEvent?.({
			step: 5,
			phase: require_passkeyManager.AccountRecoveryPhase.STEP_5_ACCOUNT_RECOVERY_COMPLETE,
			status: require_passkeyManager.AccountRecoveryStatus.SUCCESS,
			message: "Account recovery completed successfully",
			data: recoveryResult
		});
		hooks?.afterCall?.(true, recoveryResult);
		return recoveryResult;
	} catch (error) {
		onError?.(error);
		return handleRecoveryError(accountId, error.message, onError, hooks);
	}
}
/**
* Get credential (reuse existing or create new)
*/
async function getOrCreateCredential(webAuthnManager, accountId, reuseCredential) {
	if (reuseCredential) {
		const prfResults = reuseCredential.getClientExtensionResults()?.prf?.results;
		if (!prfResults?.first || !prfResults?.second) throw new Error("Reused credential missing PRF outputs - cannot proceed with recovery");
		return reuseCredential;
	}
	const challenge = require_vrf_worker.createRandomVRFChallenge();
	return await webAuthnManager.getCredentialsForRecovery({
		nearAccountId: accountId,
		challenge,
		credentialIds: []
	});
}
/**
* Derive NEAR keypair from credential
*/
async function deriveNearKeypairFromCredential(webAuthnManager, credential, accountId) {
	return await webAuthnManager.recoverKeypairFromPasskey(credential, accountId);
}
/**
* Handle recovery error
*/
function handleRecoveryError(accountId, errorMessage, onError, hooks) {
	console.error("[recoverAccount] Error:", errorMessage);
	onError?.(new Error(errorMessage));
	const errorResult = {
		success: false,
		accountId,
		publicKey: "",
		message: `Recovery failed: ${errorMessage}`,
		error: errorMessage
	};
	const result = {
		success: false,
		accountId,
		error: errorMessage
	};
	hooks?.afterCall?.(false, result);
	return errorResult;
}
/**
* Perform the actual recovery process
* Syncs on-chain data and restores local IndexedDB data
*/
async function performAccountRecovery({ context, accountId, publicKey, encryptedKeypair, credential, encryptedVrfResult, onEvent }) {
	const { webAuthnManager, nearClient, configs } = context;
	try {
		console.debug(`Performing recovery for account: ${accountId}`);
		onEvent?.({
			step: 3,
			phase: require_passkeyManager.AccountRecoveryPhase.STEP_3_SYNC_AUTHENTICATORS_ONCHAIN,
			status: require_passkeyManager.AccountRecoveryStatus.PROGRESS,
			message: "Syncing authenticators from onchain..."
		});
		const contractAuthenticators = await require_rpcCalls.syncAuthenticatorsContractCall(nearClient, configs.contractId, accountId);
		const credentialIdUsed = require_base64.base64UrlEncode(credential.rawId);
		const matchingAuthenticator = contractAuthenticators.find((auth) => auth.credentialId === credentialIdUsed);
		if (!matchingAuthenticator) throw new Error(`Could not find authenticator for credential ${credentialIdUsed}`);
		const deviceNumber = matchingAuthenticator.authenticator.deviceNumber;
		if (deviceNumber === void 0) throw new Error(`Device number not found for authenticator ${credentialIdUsed}`);
		const serverEncryptedVrfKeypairObj = encryptedVrfResult.serverEncryptedVrfKeypair;
		await restoreUserData({
			webAuthnManager,
			accountId,
			deviceNumber,
			publicKey,
			encryptedVrfKeypair: encryptedVrfResult.encryptedVrfKeypair,
			serverEncryptedVrfKeypair: serverEncryptedVrfKeypairObj,
			encryptedNearKeypair: encryptedKeypair,
			credential
		});
		await restoreAuthenticators({
			webAuthnManager,
			accountId,
			contractAuthenticators: [matchingAuthenticator],
			vrfPublicKey: encryptedVrfResult.vrfPublicKey
		});
		onEvent?.({
			step: 4,
			phase: require_passkeyManager.AccountRecoveryPhase.STEP_4_AUTHENTICATOR_SAVED,
			status: require_passkeyManager.AccountRecoveryStatus.SUCCESS,
			message: "Restored Passkey authenticator..."
		});
		console.debug("Unlocking VRF keypair in memory after account recovery");
		const unlockResult = await webAuthnManager.unlockVRFKeypair({
			nearAccountId: accountId,
			encryptedVrfKeypair: encryptedVrfResult.encryptedVrfKeypair,
			credential
		});
		if (!unlockResult.success) console.warn("Failed to unlock VRF keypair after recovery:", unlockResult.error);
		else console.debug("VRF keypair unlocked successfully after account recovery");
		return {
			success: true,
			accountId,
			publicKey,
			message: "Account successfully recovered"
		};
	} catch (error) {
		console.error("[performAccountRecovery] Error:", error);
		throw new Error(`Recovery process failed: ${error.message}`);
	}
}
async function restoreUserData({ webAuthnManager, accountId, deviceNumber, publicKey, encryptedVrfKeypair, serverEncryptedVrfKeypair, encryptedNearKeypair, credential }) {
	const existingUser = await webAuthnManager.getUser(accountId);
	await require_index.IndexedDBManager.nearKeysDB.storeEncryptedKey({
		nearAccountId: accountId,
		encryptedData: encryptedNearKeypair.encryptedPrivateKey,
		iv: encryptedNearKeypair.iv,
		timestamp: Date.now()
	});
	console.log("user data restored: serverEncryptedVrfKeypair", serverEncryptedVrfKeypair);
	if (!existingUser) await webAuthnManager.registerUser({
		nearAccountId: accountId,
		deviceNumber,
		clientNearPublicKey: publicKey,
		lastUpdated: Date.now(),
		passkeyCredential: {
			id: credential.id,
			rawId: require_base64.base64UrlEncode(credential.rawId)
		},
		encryptedVrfKeypair: {
			encryptedVrfDataB64u: encryptedVrfKeypair.encryptedVrfDataB64u,
			chacha20NonceB64u: encryptedVrfKeypair.chacha20NonceB64u
		},
		serverEncryptedVrfKeypair
	});
	else await webAuthnManager.storeUserData({
		nearAccountId: accountId,
		clientNearPublicKey: publicKey,
		lastUpdated: Date.now(),
		passkeyCredential: existingUser.passkeyCredential,
		encryptedVrfKeypair: {
			encryptedVrfDataB64u: encryptedVrfKeypair.encryptedVrfDataB64u,
			chacha20NonceB64u: encryptedVrfKeypair.chacha20NonceB64u
		},
		serverEncryptedVrfKeypair,
		deviceNumber
	});
}
async function restoreAuthenticators({ webAuthnManager, accountId, contractAuthenticators, vrfPublicKey }) {
	for (const { credentialId, authenticator } of contractAuthenticators) {
		const credentialPublicKey = authenticator.credentialPublicKey;
		const validTransports = authenticator.transports.filter((transport) => transport !== void 0 && transport !== null && typeof transport === "string");
		const transports = validTransports?.length > 0 ? validTransports : ["internal"];
		const deviceNumber = authenticator.deviceNumber;
		console.log("Restoring authenticator with device number:", deviceNumber, authenticator);
		await webAuthnManager.storeAuthenticator({
			nearAccountId: accountId,
			credentialId,
			credentialPublicKey,
			transports,
			name: `Recovered Device ${deviceNumber} Passkey`,
			registered: authenticator.registered.toISOString(),
			syncedAt: (/* @__PURE__ */ new Date()).toISOString(),
			vrfPublicKey,
			deviceNumber
		});
	}
}

//#endregion
exports.AccountRecoveryFlow = AccountRecoveryFlow;
//# sourceMappingURL=recoverAccount.js.map