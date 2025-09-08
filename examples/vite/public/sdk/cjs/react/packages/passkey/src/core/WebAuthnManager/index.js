const require_accountIds = require('../types/accountIds.js');
const require_index = require('../IndexedDBManager/index.js');
const require_base64 = require('../../utils/base64.js');
const require_touchIdPrompt = require('./touchIdPrompt.js');
const require_index$1 = require('./SignerWorkerManager/index.js');
const require_index$2 = require('./VrfWorkerManager/index.js');
const require_userPreferences = require('./userPreferences.js');
const require_nonceManager = require('../nonceManager.js');

//#region src/core/WebAuthnManager/index.ts
/**
* WebAuthnManager - Main orchestrator for WebAuthn operations
*
* Architecture:
* - index.ts (this file): Main class orchestrating everything
* - signerWorkerManager: NEAR transaction signing, and VRF Web3Authn verification RPC calls
* - vrfWorkerManager: VRF keypair generation, challenge generation
* - touchIdPrompt: TouchID prompt for biometric authentication
*/
var WebAuthnManager = class {
	vrfWorkerManager;
	signerWorkerManager;
	touchIdPrompt;
	userPreferencesManager;
	nonceManager;
	passkeyManagerConfigs;
	/**
	* Public getter for NonceManager instance
	*/
	getNonceManager() {
		return this.nonceManager;
	}
	constructor(passkeyManagerConfigs, nearClient) {
		const { vrfWorkerConfigs } = passkeyManagerConfigs;
		this.vrfWorkerManager = new require_index$2.VrfWorkerManager({
			shamirPB64u: vrfWorkerConfigs?.shamir3pass?.p,
			relayServerUrl: vrfWorkerConfigs?.shamir3pass?.relayServerUrl,
			applyServerLockRoute: vrfWorkerConfigs?.shamir3pass?.applyServerLockRoute,
			removeServerLockRoute: vrfWorkerConfigs?.shamir3pass?.removeServerLockRoute
		});
		this.touchIdPrompt = new require_touchIdPrompt.TouchIdPrompt();
		this.userPreferencesManager = require_userPreferences.default;
		this.nonceManager = require_nonceManager.default;
		this.signerWorkerManager = new require_index$1.SignerWorkerManager(this.vrfWorkerManager, nearClient, require_userPreferences.default, require_nonceManager.default);
		this.passkeyManagerConfigs = passkeyManagerConfigs;
	}
	/**
	* Public pre-warm hook to initialize signer workers ahead of time.
	* Safe to call multiple times; errors are non-fatal.
	*/
	prewarmSignerWorkers() {
		try {
			if (typeof window !== "undefined" && typeof window.Worker !== "undefined") this.signerWorkerManager.preWarmWorkerPool().catch(() => {});
		} catch {}
	}
	getCredentials({ nearAccountId, challenge, authenticators }) {
		return this.touchIdPrompt.getCredentials({
			nearAccountId,
			challenge,
			authenticators
		});
	}
	async generateVrfChallenge(vrfInputData) {
		return this.vrfWorkerManager.generateVrfChallenge(vrfInputData);
	}
	/**
	* Generate VRF keypair for bootstrapping - stores in memory unencrypted temporarily
	* This is used during registration to generate a VRF keypair that will be used for
	* WebAuthn ceremony and later encrypted with the real PRF output
	*
	* @param saveInMemory - Whether to persist the generated VRF keypair in WASM worker memory
	* @param vrfInputParams - Optional parameters to generate VRF challenge/proof in same call
	* @returns VRF public key and optionally VRF challenge data
	*/
	async generateVrfKeypairBootstrap(saveInMemory, vrfInputData) {
		return this.vrfWorkerManager.generateVrfKeypairBootstrap(vrfInputData, saveInMemory);
	}
	/**
	* Derive deterministic VRF keypair from PRF output for recovery
	* Optionally generates VRF challenge if input parameters are provided
	* This enables deterministic VRF key derivation from WebAuthn credentials
	*
	* @param credential - WebAuthn credential containing PRF outputs
	* @param nearAccountId - NEAR account ID for key derivation salt
	* @param vrfInputParams - Optional VRF inputs, if provided will generate a challenge
	* @param saveInMemory - Whether to save the derived VRF keypair in worker memory for immediate use
	* @returns Deterministic VRF public key, optional VRF challenge, and encrypted VRF keypair for storage
	*/
	async deriveVrfKeypair({ credential, nearAccountId, vrfInputData, saveInMemory = true }) {
		try {
			console.debug("WebAuthnManager: Deriving deterministic VRF keypair from PRF output");
			const vrfResult = await this.vrfWorkerManager.deriveVrfKeypairFromPrf({
				credential,
				nearAccountId,
				vrfInputData,
				saveInMemory
			});
			console.debug(`Derived VRF public key: ${vrfResult.vrfPublicKey}`);
			if (vrfResult.vrfChallenge) console.debug(`Generated VRF challenge with output: ${vrfResult.vrfChallenge.vrfOutput.substring(0, 20)}...`);
			else console.debug("No VRF challenge generated (vrfInputData not provided)");
			if (vrfResult.encryptedVrfKeypair) console.debug(`Generated encrypted VRF keypair for storage`);
			console.debug("WebAuthnManager: Deterministic VRF keypair derived successfully");
			const result = {
				success: true,
				vrfPublicKey: vrfResult.vrfPublicKey,
				encryptedVrfKeypair: vrfResult.encryptedVrfKeypair,
				vrfChallenge: vrfResult.vrfChallenge,
				serverEncryptedVrfKeypair: vrfResult.serverEncryptedVrfKeypair
			};
			return result;
		} catch (error) {
			console.error("WebAuthnManager: VRF keypair derivation error:", error);
			throw new Error(`VRF keypair derivation failed ${error.message}`);
		}
	}
	/**
	* Unlock VRF keypair in memory using PRF output
	* This is called during login to decrypt and load the VRF keypair in-memory
	*/
	async unlockVRFKeypair({ nearAccountId, encryptedVrfKeypair, credential }) {
		try {
			console.debug("WebAuthnManager: Unlocking VRF keypair");
			const unlockResult = await this.vrfWorkerManager.unlockVrfKeypair({
				credential,
				nearAccountId,
				encryptedVrfKeypair
			});
			if (!unlockResult.success) {
				console.error("WebAuthnManager: VRF keypair unlock failed");
				return {
					success: false,
					error: "VRF keypair unlock failed"
				};
			}
			try {
				this.signerWorkerManager.preWarmWorkerPool().catch(() => {});
			} catch {}
			return { success: true };
		} catch (error) {
			console.error("WebAuthnManager: VRF keypair unlock failed:", error.message);
			return {
				success: false,
				error: error.message
			};
		}
	}
	/**
	* Perform Shamir 3-pass commutative decryption within WASM worker
	* This securely decrypts a server-encrypted KEK (key encryption key)
	* which the wasm worker uses to unlock a key to decrypt the VRF keypair and loads it into memory
	* The server never knows the real value of the KEK, nor the VRF keypair
	*/
	async shamir3PassDecryptVrfKeypair({ nearAccountId, kek_s_b64u, ciphertextVrfB64u }) {
		const result = await this.vrfWorkerManager.shamir3PassDecryptVrfKeypair({
			nearAccountId,
			kek_s_b64u,
			ciphertextVrfB64u
		});
		return {
			success: result.success,
			error: result.error
		};
	}
	async clearVrfSession() {
		return await this.vrfWorkerManager.clearVrfSession();
	}
	/**
	* Check VRF worker status
	*/
	async checkVrfStatus() {
		return this.vrfWorkerManager.checkVrfStatus();
	}
	async storeUserData(userData) {
		await require_index.IndexedDBManager.clientDB.storeWebAuthnUserData(userData);
	}
	async getUser(nearAccountId) {
		return await require_index.IndexedDBManager.clientDB.getUser(nearAccountId);
	}
	async getAllUserData() {
		return await require_index.IndexedDBManager.clientDB.getAllUsers();
	}
	async getAllUsers() {
		return await require_index.IndexedDBManager.clientDB.getAllUsers();
	}
	async getAuthenticatorsByUser(nearAccountId) {
		return await require_index.IndexedDBManager.clientDB.getAuthenticatorsByUser(nearAccountId);
	}
	async updateLastLogin(nearAccountId) {
		return await require_index.IndexedDBManager.clientDB.updateLastLogin(nearAccountId);
	}
	/**
	* Set the last logged-in user
	* @param nearAccountId - The account ID of the user
	* @param deviceNumber - The device number (defaults to 1)
	*/
	async setLastUser(nearAccountId, deviceNumber = 1) {
		return await require_index.IndexedDBManager.clientDB.setLastUser(nearAccountId, deviceNumber);
	}
	async setCurrentUser(nearAccountId) {
		this.userPreferencesManager.setCurrentUser(nearAccountId);
		const userData = await require_index.IndexedDBManager.clientDB.getLastUser();
		if (userData && userData.clientNearPublicKey) this.nonceManager.initializeUser(nearAccountId, userData.clientNearPublicKey);
	}
	async registerUser(storeUserData) {
		return await require_index.IndexedDBManager.clientDB.registerUser(storeUserData);
	}
	async storeAuthenticator(authenticatorData) {
		const authData = {
			...authenticatorData,
			nearAccountId: require_accountIds.toAccountId(authenticatorData.nearAccountId),
			deviceNumber: authenticatorData.deviceNumber || 1
		};
		return await require_index.IndexedDBManager.clientDB.storeAuthenticator(authData);
	}
	extractUsername(nearAccountId) {
		return require_index.IndexedDBManager.clientDB.extractUsername(nearAccountId);
	}
	async atomicOperation(callback) {
		return await require_index.IndexedDBManager.clientDB.atomicOperation(callback);
	}
	async rollbackUserRegistration(nearAccountId) {
		return await require_index.IndexedDBManager.clientDB.rollbackUserRegistration(nearAccountId);
	}
	async hasPasskeyCredential(nearAccountId) {
		return await require_index.IndexedDBManager.clientDB.hasPasskeyCredential(nearAccountId);
	}
	async getLastUsedNearAccountId() {
		const lastUser = await require_index.IndexedDBManager.clientDB.getLastUser();
		if (!lastUser) return null;
		return {
			nearAccountId: lastUser.nearAccountId,
			deviceNumber: lastUser.deviceNumber
		};
	}
	/**
	* Atomically store all registration data (user, authenticator, VRF credentials)
	*/
	async atomicStoreRegistrationData({ nearAccountId, credential, publicKey, encryptedVrfKeypair, vrfPublicKey, serverEncryptedVrfKeypair, onEvent }) {
		await this.atomicOperation(async (db) => {
			const credentialId = require_base64.base64UrlEncode(credential.rawId);
			const response = credential.response;
			await this.storeAuthenticator({
				nearAccountId,
				credentialId,
				credentialPublicKey: await this.extractCosePublicKey(require_base64.base64UrlEncode(response.attestationObject)),
				transports: response.getTransports?.() || [],
				name: `VRF Passkey for ${this.extractUsername(nearAccountId)}`,
				registered: (/* @__PURE__ */ new Date()).toISOString(),
				syncedAt: (/* @__PURE__ */ new Date()).toISOString(),
				vrfPublicKey
			});
			await this.storeUserData({
				nearAccountId,
				clientNearPublicKey: publicKey,
				lastUpdated: Date.now(),
				passkeyCredential: {
					id: credential.id,
					rawId: credentialId
				},
				encryptedVrfKeypair: {
					encryptedVrfDataB64u: encryptedVrfKeypair.encryptedVrfDataB64u,
					chacha20NonceB64u: encryptedVrfKeypair.chacha20NonceB64u
				},
				serverEncryptedVrfKeypair: serverEncryptedVrfKeypair ? {
					ciphertextVrfB64u: serverEncryptedVrfKeypair?.ciphertextVrfB64u,
					kek_s_b64u: serverEncryptedVrfKeypair?.kek_s_b64u
				} : void 0
			});
			console.debug("Registration data stored atomically");
			return true;
		});
		onEvent?.({
			step: 5,
			phase: "database-storage",
			status: "success",
			message: "VRF registration data stored successfully"
		});
	}
	/**
	* Secure registration flow with PRF: WebAuthn + WASM worker encryption using PRF
	* Optionally signs a link_device_register_user transaction if VRF data is provided
	*/
	async deriveNearKeypairAndEncrypt({ nearAccountId, credential, options }) {
		return await this.signerWorkerManager.deriveNearKeypairAndEncrypt({
			credential,
			nearAccountId,
			options
		});
	}
	/**
	* Export private key using PRF-based decryption. Requires TouchId
	*/
	async exportNearKeypairWithTouchId(nearAccountId) {
		console.debug(`🔐 Exporting private key for account: ${nearAccountId}`);
		const userData = await this.getUser(nearAccountId);
		if (!userData) throw new Error(`No user data found for ${nearAccountId}`);
		if (!userData.clientNearPublicKey) throw new Error(`No public key found for ${nearAccountId}`);
		const authenticators = await this.getAuthenticatorsByUser(nearAccountId);
		if (authenticators.length === 0) throw new Error(`No authenticators found for account ${nearAccountId}. Please register first.`);
		const decryptionResult = await this.signerWorkerManager.decryptPrivateKeyWithPrf({
			nearAccountId,
			authenticators
		});
		return {
			accountId: userData.nearAccountId,
			publicKey: userData.clientNearPublicKey,
			privateKey: decryptionResult.decryptedPrivateKey
		};
	}
	/**
	* Transaction signing with contract verification and progress updates.
	* Demonstrates the "streaming" worker pattern similar to SSE.
	*
	* Requires a successful TouchID/biometric prompt before transaction signing in wasm worker
	* Automatically verifies the authentication with the web3authn contract.
	*
	* @param transactions - Transaction payload containing:
	*   - receiverId: NEAR account ID receiving the transaction
	*   - actions: Array of NEAR actions to execute
	* @param rpcCall: RpcCallPayload containing:
	*   - contractId: Web3Authn contract ID for verification
	*   - nearRpcUrl: NEAR RPC endpoint URL
	*   - nearAccountId: NEAR account ID performing the transaction
	* @param confirmationConfigOverride: Optional confirmation configuration override
	* @param onEvent: Optional callback for progress updates during signing
	* @param onEvent - Optional callback for progress updates during signing
	*/
	async signTransactionsWithActions({ transactions, rpcCall, confirmationConfigOverride, onEvent }) {
		if (transactions.length === 0) throw new Error("No payloads provided for signing");
		return await this.signerWorkerManager.signTransactionsWithActions({
			transactions,
			rpcCall,
			confirmationConfigOverride,
			onEvent
		});
	}
	async signNEP413Message(payload) {
		try {
			const result = await this.signerWorkerManager.signNep413Message(payload);
			if (result.success) {
				console.debug("WebAuthnManager: NEP-413 message signed successfully");
				return result;
			} else throw new Error(`NEP-413 signing failed: ${result.error || "Unknown error"}`);
		} catch (error) {
			console.error("WebAuthnManager: NEP-413 signing error:", error);
			return {
				success: false,
				accountId: "",
				publicKey: "",
				signature: "",
				error: error.message || "Unknown error"
			};
		}
	}
	/**
	* Extract COSE public key from WebAuthn attestation object using WASM worker
	*/
	async extractCosePublicKey(attestationObjectBase64url) {
		return await this.signerWorkerManager.extractCosePublicKey(attestationObjectBase64url);
	}
	async checkCanRegisterUser({ contractId, credential, vrfChallenge, authenticatorOptions, onEvent }) {
		return await this.signerWorkerManager.checkCanRegisterUser({
			contractId,
			credential,
			vrfChallenge,
			authenticatorOptions,
			onEvent,
			nearRpcUrl: this.passkeyManagerConfigs.nearRpcUrl
		});
	}
	/**
	* Register user on-chain with transaction (STATE-CHANGING)
	* This performs the actual on-chain registration transaction
	* @deprecated Testnet only, use createAccountAndRegisterWithRelayServer instead for prod
	*/
	async signVerifyAndRegisterUser({ contractId, credential, vrfChallenge, deterministicVrfPublicKey, nearAccountId, nearPublicKeyStr, nearClient, deviceNumber = 1, authenticatorOptions, onEvent }) {
		try {
			const registrationResult = await this.signerWorkerManager.signVerifyAndRegisterUser({
				vrfChallenge,
				credential,
				contractId,
				deterministicVrfPublicKey,
				nearAccountId,
				nearPublicKeyStr,
				nearClient,
				deviceNumber,
				authenticatorOptions,
				onEvent,
				nearRpcUrl: this.passkeyManagerConfigs.nearRpcUrl
			});
			console.debug("On-chain registration completed:", registrationResult);
			if (registrationResult.verified) {
				console.debug("On-chain user registration successful");
				return {
					success: true,
					verified: registrationResult.verified,
					registrationInfo: registrationResult.registrationInfo,
					logs: registrationResult.logs,
					signedTransaction: registrationResult.signedTransaction,
					preSignedDeleteTransaction: registrationResult.preSignedDeleteTransaction
				};
			} else {
				console.warn("On-chain user registration failed - WASM worker returned unverified result");
				throw new Error("On-chain registration transaction failed");
			}
		} catch (error) {
			console.error("WebAuthnManager: On-chain registration error:", error);
			throw error;
		}
	}
	/**
	* Recover keypair from authentication credential for account recovery
	* Uses dual PRF outputs to re-derive the same NEAR keypair and re-encrypt it
	* @param challenge - Random challenge for WebAuthn authentication ceremony
	* @param authenticationCredential - The authentication credential with dual PRF outputs
	* @param accountIdHint - Optional account ID hint for recovery
	* @returns Public key and encrypted private key for secure storage
	*/
	async recoverKeypairFromPasskey(authenticationCredential, accountIdHint) {
		try {
			console.debug("WebAuthnManager: recovering keypair from authentication credential with dual PRF outputs");
			if (!authenticationCredential) throw new Error("Authentication credential required for account recovery. Use an existing credential with dual PRF outputs to re-derive the same NEAR keypair.");
			const prfResults = authenticationCredential.getClientExtensionResults()?.prf?.results;
			if (!prfResults?.first || !prfResults?.second) throw new Error("Dual PRF outputs required for account recovery - both AES and Ed25519 PRF outputs must be available");
			const result = await this.signerWorkerManager.recoverKeypairFromPasskey({
				credential: authenticationCredential,
				accountIdHint
			});
			console.debug("WebAuthnManager: Deterministic keypair derivation successful");
			return result;
		} catch (error) {
			console.error("WebAuthnManager: Deterministic keypair derivation error:", error);
			throw new Error(`Deterministic keypair derivation failed: ${error.message}`);
		}
	}
	async generateRegistrationCredentials({ nearAccountId, challenge }) {
		return this.touchIdPrompt.generateRegistrationCredentials({
			nearAccountId,
			challenge
		});
	}
	async generateRegistrationCredentialsForLinkDevice({ nearAccountId, challenge, deviceNumber }) {
		return this.touchIdPrompt.generateRegistrationCredentialsForLinkDevice({
			nearAccountId,
			challenge,
			deviceNumber
		});
	}
	async getCredentialsForRecovery({ nearAccountId, challenge, credentialIds }) {
		return this.touchIdPrompt.getCredentialsForRecovery({
			nearAccountId,
			challenge,
			credentialIds
		});
	}
	/**
	* Sign transaction with raw private key
	* for key replacement in device linking
	* No TouchID/PRF required - uses provided private key directly
	*/
	async signTransactionWithKeyPair({ nearPrivateKey, signerAccountId, receiverId, nonce, blockHash, actions }) {
		return await this.signerWorkerManager.signTransactionWithKeyPair({
			nearPrivateKey,
			signerAccountId,
			receiverId,
			nonce,
			blockHash,
			actions
		});
	}
	/**
	* Get user preferences manager
	*/
	getUserPreferences() {
		return this.userPreferencesManager;
	}
	/**
	* Clean up resources
	*/
	destroy() {
		if (this.userPreferencesManager) this.userPreferencesManager.destroy();
		if (this.nonceManager) this.nonceManager.clear();
	}
};

//#endregion
exports.WebAuthnManager = WebAuthnManager;
//# sourceMappingURL=index.js.map