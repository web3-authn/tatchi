const require_rolldown_runtime = require('../../_virtual/rolldown_runtime.js');
const require_validation = require('../../utils/validation.js');
const require_accountIds = require('../types/accountIds.js');
const require_index = require('../IndexedDBManager/index.js');
const require_base64 = require('../../utils/base64.js');
const require_config = require('../../config.js');
const require_rpc = require('../types/rpc.js');
const require_actions = require('../types/actions.js');
const require_passkeyManager = require('../types/passkeyManager.js');
const require_registration = require('./registration.js');
const require_rpcCalls = require('../rpcCalls.js');
const require_index$1 = require('../../node_modules/.pnpm/qrcode@1.5.4/node_modules/qrcode/lib/index.js');
const require_linkDevice = require('../types/linkDevice.js');
let __near_js_crypto = require("@near-js/crypto");
__near_js_crypto = require_rolldown_runtime.__toESM(__near_js_crypto);

//#region src/core/PasskeyManager/linkDevice.ts
var import_lib = /* @__PURE__ */ require_rolldown_runtime.__toESM(require_index$1.require_lib(), 1);
async function generateQRCodeDataURL(data) {
	return import_lib.toDataURL(data, {
		width: 256,
		margin: 2,
		color: {
			dark: "#000000",
			light: "#ffffff"
		},
		errorCorrectionLevel: "M"
	});
}
/**
* Device linking flow class - manages the complete device linking process
*
* Usage:
* ```typescript
* // Device2: Generate QR and start polling
* const flow = new LinkDeviceFlow(context, options);
* const { qrData, qrCodeDataURL } = await flow.generateQR(accountId);
*
* // Device1: Scan and authorize
* const result = await LinkDeviceFlow.scanAndLink(context, options);
*
* // Device2: Flow automatically completes when AddKey is detected
* const state = flow.getState();
* ```
*/
var LinkDeviceFlow = class {
	context;
	options;
	session = null;
	error;
	cancelled = false;
	pollingInterval;
	pollGeneration = 0;
	KEY_POLLING_INTERVAL = require_config.DEVICE_LINKING_CONFIG.TIMEOUTS.POLLING_INTERVAL_MS;
	registrationRetryTimeout;
	registrationRetryCount = 0;
	MAX_REGISTRATION_RETRIES = require_config.DEVICE_LINKING_CONFIG.RETRY.MAX_REGISTRATION_ATTEMPTS;
	RETRY_DELAY_MS = require_config.DEVICE_LINKING_CONFIG.TIMEOUTS.REGISTRATION_RETRY_DELAY_MS;
	tempKeyCleanupTimer;
	TEMP_KEY_CLEANUP_DELAY_MS = require_config.DEVICE_LINKING_CONFIG.TIMEOUTS.TEMP_KEY_CLEANUP_MS;
	constructor(context, options) {
		this.context = context;
		this.options = options;
	}
	ifActive(fn) {
		if (this.cancelled) return;
		return fn();
	}
	safeOnEvent(evt) {
		this.ifActive(() => this.options?.onEvent?.(evt));
	}
	/**
	* Device2 (companion device): Generate QR code and start polling for AddKey transaction
	*
	* Supports two flows:
	* - Option E: If accountId provided, generate proper NEAR keypair immediately (faster)
	* - Option F: If no accountId, generate temp NEAR keypair, replace later (seamless UX)
	*/
	async generateQR(accountId) {
		try {
			if (accountId) {
				console.log(`LinkDeviceFlow: Option E - Using provided account ID: ${accountId}`);
				require_validation.validateNearAccountId(accountId);
				const accountExists = await this.context.nearClient.viewAccount(accountId);
				if (!accountExists) throw new Error(`Account ${accountId} does not exist onchain`);
				const vrfChallenge = await require_registration.generateBootstrapVrfChallenge(this.context, accountId);
				const credential = await this.context.webAuthnManager.generateRegistrationCredentials({
					nearAccountId: accountId,
					challenge: vrfChallenge
				});
				const nearKeyResult = await this.context.webAuthnManager.deriveNearKeypairAndEncrypt({
					credential,
					nearAccountId: require_accountIds.toAccountId(accountId)
				});
				if (!nearKeyResult.success || !nearKeyResult.publicKey) throw new Error("Failed to generate NEAR keypair for provided account");
				this.session = {
					accountId,
					deviceNumber: void 0,
					nearPublicKey: nearKeyResult.publicKey,
					credential,
					vrfChallenge,
					phase: require_passkeyManager.DeviceLinkingPhase.IDLE,
					createdAt: Date.now(),
					expiresAt: Date.now() + require_config.DEVICE_LINKING_CONFIG.TIMEOUTS.SESSION_EXPIRATION_MS
				};
				console.log(`LinkDeviceFlow: Option E - Generated proper NEAR keypair for ${accountId}`);
			} else {
				console.log(`LinkDeviceFlow: Option F - No account provided, using temporary keypair approach`);
				const tempNearKeyResult = await this.generateTemporaryNearKeypair();
				this.session = {
					accountId: null,
					deviceNumber: void 0,
					nearPublicKey: tempNearKeyResult.publicKey,
					credential: null,
					vrfChallenge: null,
					phase: require_passkeyManager.DeviceLinkingPhase.IDLE,
					createdAt: Date.now(),
					expiresAt: Date.now() + require_config.DEVICE_LINKING_CONFIG.TIMEOUTS.SESSION_EXPIRATION_MS,
					tempPrivateKey: tempNearKeyResult.privateKey
				};
				console.log(`LinkDeviceFlow: Option F - Generated temporary NEAR keypair`);
			}
			const qrData = {
				device2PublicKey: this.session.nearPublicKey,
				accountId: this.session.accountId || void 0,
				timestamp: Date.now(),
				version: "1.0"
			};
			const qrDataString = JSON.stringify(qrData);
			const qrCodeDataURL = await generateQRCodeDataURL(qrDataString);
			const flowType = accountId ? "Option E (provided account)" : "Option F (account discovery)";
			this.safeOnEvent({
				step: 1,
				phase: require_passkeyManager.DeviceLinkingPhase.STEP_1_QR_CODE_GENERATED,
				status: require_passkeyManager.DeviceLinkingStatus.PROGRESS,
				message: `QR code generated using ${flowType}, waiting for Device1 to scan and authorize...`
			});
			if (!this.cancelled) this.startPolling();
			this.safeOnEvent({
				step: 4,
				phase: require_passkeyManager.DeviceLinkingPhase.STEP_4_POLLING,
				status: require_passkeyManager.DeviceLinkingStatus.PROGRESS,
				message: `Polling contract for linked account...`
			});
			return {
				qrData,
				qrCodeDataURL
			};
		} catch (error) {
			this.error = error;
			this.safeOnEvent({
				step: 0,
				phase: require_passkeyManager.DeviceLinkingPhase.DEVICE_LINKING_ERROR,
				status: require_passkeyManager.DeviceLinkingStatus.ERROR,
				error: error.message,
				message: error.message
			});
			throw new require_linkDevice.DeviceLinkingError(`Failed to generate device linking QR: ${error.message}`, require_linkDevice.DeviceLinkingErrorCode.REGISTRATION_FAILED, "generation");
		}
	}
	/**
	* Generate temporary NEAR keypair without TouchID/VRF for Option F flow
	* This creates a proper Ed25519 keypair that can be used for the QR code
	* Includes memory cleanup and automatic expiration
	*/
	async generateTemporaryNearKeypair() {
		const keyPair = __near_js_crypto.KeyPair.fromRandom("ed25519");
		const publicKeyNear = keyPair.getPublicKey().toString();
		const privateKeyNear = keyPair.toString();
		console.log(`LinkDeviceFlow: Generated temporary Ed25519 keypair with automatic cleanup`);
		this.scheduleTemporaryKeyCleanup(publicKeyNear);
		return {
			publicKey: publicKeyNear,
			privateKey: privateKeyNear
		};
	}
	/**
	* Schedule automatic cleanup of temporary private key from memory
	* This provides defense-in-depth against memory exposure
	*/
	scheduleTemporaryKeyCleanup(publicKey) {
		if (this.tempKeyCleanupTimer) clearTimeout(this.tempKeyCleanupTimer);
		this.tempKeyCleanupTimer = setTimeout(() => {
			this.cleanupTemporaryKeyFromMemory();
			console.log(`LinkDeviceFlow: Automatic cleanup executed for temporary key: ${publicKey.substring(0, 20)}...`);
		}, this.TEMP_KEY_CLEANUP_DELAY_MS);
		console.log(`LinkDeviceFlow: Scheduled automatic cleanup in ${this.TEMP_KEY_CLEANUP_DELAY_MS / 1e3 / 60} minutes for key: ${publicKey.substring(0, 20)}...`);
	}
	/**
	* Immediately clean up temporary private key from memory
	* Called on successful completion, cancellation, or timeout
	*/
	cleanupTemporaryKeyFromMemory() {
		if (this.session?.tempPrivateKey) {
			const keyLength = this.session.tempPrivateKey.length;
			this.session.tempPrivateKey = "0".repeat(keyLength);
			this.session.tempPrivateKey = "";
			console.log("LinkDeviceFlow: Temporary private key cleaned from memory");
		}
		if (this.tempKeyCleanupTimer) {
			clearTimeout(this.tempKeyCleanupTimer);
			this.tempKeyCleanupTimer = void 0;
		}
	}
	/**
	* Device2: Start polling blockchain for AddKey transaction
	*/
	startPolling() {
		if (!this.session || this.cancelled) return;
		this.stopPolling();
		const myGen = ++this.pollGeneration;
		const tick = async () => {
			if (this.cancelled || this.pollGeneration !== myGen) return;
			if (!this.shouldContinuePolling()) {
				this.stopPolling();
				return;
			}
			try {
				const hasKeyAdded = await this.checkForDeviceKeyAdded();
				if (this.cancelled || this.pollGeneration !== myGen) return;
				if (hasKeyAdded && this.session) {
					this.stopPolling();
					this.safeOnEvent({
						step: 5,
						phase: require_passkeyManager.DeviceLinkingPhase.STEP_5_ADDKEY_DETECTED,
						status: require_passkeyManager.DeviceLinkingStatus.PROGRESS,
						message: "AddKey transaction detected, starting registration..."
					});
					this.session.phase = require_passkeyManager.DeviceLinkingPhase.STEP_5_ADDKEY_DETECTED;
					this.startRegistrationWithRetries();
					return;
				}
			} catch (error) {
				if (this.cancelled || this.pollGeneration !== myGen) return;
				console.error("Polling error:", error);
				if (error.message?.includes("Account not found")) {
					console.warn("Account not found - stopping polling");
					this.stopPolling();
					return;
				}
			}
			if (!this.cancelled && this.pollGeneration === myGen) this.pollingInterval = setTimeout(tick, this.KEY_POLLING_INTERVAL);
		};
		this.pollingInterval = setTimeout(tick, this.KEY_POLLING_INTERVAL);
	}
	shouldContinuePolling() {
		if (!this.session) return false;
		if (this.session.phase === require_passkeyManager.DeviceLinkingPhase.STEP_5_ADDKEY_DETECTED) return false;
		if (this.session.phase === require_passkeyManager.DeviceLinkingPhase.STEP_7_LINKING_COMPLETE) return false;
		if (Date.now() > this.session.expiresAt) {
			this.error = /* @__PURE__ */ new Error("Session expired");
			this.safeOnEvent({
				step: 0,
				phase: require_passkeyManager.DeviceLinkingPhase.DEVICE_LINKING_ERROR,
				status: require_passkeyManager.DeviceLinkingStatus.ERROR,
				error: this.error?.message,
				message: "Device linking session expired"
			});
			return false;
		}
		return true;
	}
	/**
	* Device2: Check if device key has been added by polling contract HashMap
	*/
	async checkForDeviceKeyAdded() {
		if (this.cancelled || !this.pollingInterval) return false;
		if (!this.session?.nearPublicKey) {
			console.error(`LinkDeviceFlow: No session or public key available for polling`);
			return false;
		}
		try {
			const linkingResult = await require_rpcCalls.getDeviceLinkingAccountContractCall(this.context.nearClient, this.context.configs.contractId, this.session.nearPublicKey);
			if (this.cancelled || !this.pollingInterval) return false;
			this.safeOnEvent({
				step: 4,
				phase: require_passkeyManager.DeviceLinkingPhase.STEP_4_POLLING,
				status: require_passkeyManager.DeviceLinkingStatus.PROGRESS,
				message: "Polling contract for linked account..."
			});
			if (linkingResult && linkingResult.linkedAccountId && linkingResult.deviceNumber !== void 0) {
				const nextDeviceNumber = linkingResult.deviceNumber + 1;
				console.log(`LinkDeviceFlow: Success! Discovered linked account:`, {
					linkedAccountId: linkingResult.linkedAccountId,
					currentCounter: linkingResult.deviceNumber,
					nextDeviceNumber
				});
				this.session.accountId = linkingResult.linkedAccountId;
				this.session.deviceNumber = nextDeviceNumber;
				return true;
			} else if (!this.cancelled) console.log(`LinkDeviceFlow: No mapping found yet...`);
			return false;
		} catch (error) {
			console.error(`LinkDeviceFlow: Error checking for device key addition:`, {
				error: error.message,
				stack: error.stack,
				name: error.name,
				code: error.code
			});
			return false;
		}
	}
	/**
	* Device2: Start registration process with retry logic
	*/
	startRegistrationWithRetries() {
		this.registrationRetryCount = 0;
		this.attemptRegistration();
	}
	/**
	* Device2: Attempt registration with retry logic
	*/
	attemptRegistration() {
		this.swapKeysAndRegisterAccount().catch((error) => {
			if (this.isRetryableError(error)) {
				this.registrationRetryCount++;
				if (this.registrationRetryCount > this.MAX_REGISTRATION_RETRIES) {
					console.error("LinkDeviceFlow: Max registration retries exceeded, failing permanently");
					this.session.phase = require_passkeyManager.DeviceLinkingPhase.REGISTRATION_ERROR;
					this.error = error;
					this.options?.onEvent?.({
						step: 0,
						phase: require_passkeyManager.DeviceLinkingPhase.REGISTRATION_ERROR,
						status: require_passkeyManager.DeviceLinkingStatus.ERROR,
						error: error.message,
						message: error.message
					});
				} else {
					console.warn(`LinkDeviceFlow: Registration failed with retryable error (attempt ${this.registrationRetryCount}/${this.MAX_REGISTRATION_RETRIES}), will retry in ${this.RETRY_DELAY_MS}ms:`, error.message);
					this.options?.onEvent?.({
						step: 5,
						phase: require_passkeyManager.DeviceLinkingPhase.STEP_5_ADDKEY_DETECTED,
						status: require_passkeyManager.DeviceLinkingStatus.PROGRESS,
						message: `Registration failed (${error.message}), retrying in ${this.RETRY_DELAY_MS}ms... (${this.registrationRetryCount}/${this.MAX_REGISTRATION_RETRIES})`
					});
					this.registrationRetryTimeout = setTimeout(() => {
						this.attemptRegistration();
					}, this.RETRY_DELAY_MS);
				}
			} else {
				this.session.phase = require_passkeyManager.DeviceLinkingPhase.REGISTRATION_ERROR;
				this.error = error;
				this.options?.onEvent?.({
					step: 0,
					phase: require_passkeyManager.DeviceLinkingPhase.REGISTRATION_ERROR,
					status: require_passkeyManager.DeviceLinkingStatus.ERROR,
					error: error.message,
					message: error.message
				});
			}
		});
	}
	/**
	* Device2: Complete device linking
	* 1. Derives deterministic VRF and NEAR keys using real accountID (instead of temporary keys)
	* 2. Executes Key Replacement transaction to replace temporary key with the real key
	* 3. Signs the registration transaction and broadcasts it.
	*/
	async swapKeysAndRegisterAccount() {
		if (!this.session || !this.session.accountId) throw new Error("AccountID not available for registration");
		try {
			this.safeOnEvent({
				step: 6,
				phase: require_passkeyManager.DeviceLinkingPhase.STEP_6_REGISTRATION,
				status: require_passkeyManager.DeviceLinkingStatus.PROGRESS,
				message: "Storing device authenticator data locally..."
			});
			const deterministicKeysResult = await this.deriveDeterministicKeysAndRegisterAccount();
			await this.storeDeviceAuthenticator(deterministicKeysResult);
			this.session.phase = require_passkeyManager.DeviceLinkingPhase.STEP_7_LINKING_COMPLETE;
			this.registrationRetryCount = 0;
			this.safeOnEvent({
				step: 7,
				phase: require_passkeyManager.DeviceLinkingPhase.STEP_7_LINKING_COMPLETE,
				status: require_passkeyManager.DeviceLinkingStatus.SUCCESS,
				message: "Device linking completed successfully"
			});
			await this.attemptAutoLogin(deterministicKeysResult, this.options);
		} catch (error) {
			throw error;
		}
	}
	/**
	* Check if an error is retryable (temporary issues that can be resolved)
	*/
	isRetryableError(error) {
		const retryableErrorMessages = [
			"page does not have focus",
			"a request is already pending",
			"request is already pending",
			"operationerror",
			"notallowederror",
			"the operation is not allowed at this time",
			"network error",
			"timeout",
			"temporary",
			"transient"
		];
		const errorMessage = error.message?.toLowerCase() || "";
		const errorName = error.name?.toLowerCase() || "";
		return retryableErrorMessages.some((msg) => errorMessage.includes(msg.toLowerCase()) || errorName.includes(msg.toLowerCase()));
	}
	/**
	* Device2: Attempt auto-login after successful device linking
	*/
	async attemptAutoLogin(deterministicKeysResult, options) {
		try {
			options?.onEvent?.({
				step: 8,
				phase: require_passkeyManager.DeviceLinkingPhase.STEP_8_AUTO_LOGIN,
				status: require_passkeyManager.DeviceLinkingStatus.PROGRESS,
				message: "Logging in..."
			});
			if (!this.session || !this.session.accountId || !this.session.credential || !deterministicKeysResult) {
				const missing = [];
				if (!this.session) missing.push("session");
				if (!this.session?.accountId) missing.push("accountId");
				if (!this.session?.credential) missing.push("credential");
				if (!deterministicKeysResult) missing.push("deterministicKeysResult");
				throw new Error(`Missing required data for auto-login: ${missing.join(", ")}`);
			}
			if (deterministicKeysResult.serverEncryptedVrfKeypair && this.context.configs.vrfWorkerConfigs?.shamir3pass?.relayServerUrl) try {
				console.log("LinkDeviceFlow: Attempting Shamir 3-pass unlock for auto-login");
				const unlockResult = await this.context.webAuthnManager.shamir3PassDecryptVrfKeypair({
					nearAccountId: this.session.accountId,
					kek_s_b64u: deterministicKeysResult.serverEncryptedVrfKeypair.kek_s_b64u,
					ciphertextVrfB64u: deterministicKeysResult.serverEncryptedVrfKeypair.ciphertextVrfB64u
				});
				if (unlockResult.success) {
					console.log("LinkDeviceFlow: Shamir 3-pass unlock successful for auto-login");
					this.options?.onEvent?.({
						step: 8,
						phase: require_passkeyManager.DeviceLinkingPhase.STEP_8_AUTO_LOGIN,
						status: require_passkeyManager.DeviceLinkingStatus.SUCCESS,
						message: `Welcome ${this.session.accountId}`
					});
					return;
				} else console.log("LinkDeviceFlow: Shamir 3-pass unlock failed, falling back to TouchID");
			} catch (error) {
				console.log("LinkDeviceFlow: Shamir 3-pass unlock error, falling back to TouchID:", error);
			}
			console.log("LinkDeviceFlow: Using TouchID unlock for auto-login");
			const vrfUnlockResult = await this.context.webAuthnManager.unlockVRFKeypair({
				nearAccountId: this.session.accountId,
				encryptedVrfKeypair: deterministicKeysResult.encryptedVrfKeypair,
				credential: this.session.credential
			});
			if (vrfUnlockResult.success) this.options?.onEvent?.({
				step: 8,
				phase: require_passkeyManager.DeviceLinkingPhase.STEP_8_AUTO_LOGIN,
				status: require_passkeyManager.DeviceLinkingStatus.SUCCESS,
				message: `Welcome ${this.session.accountId}`
			});
			else throw new Error(vrfUnlockResult.error || "VRF unlock failed");
		} catch (loginError) {
			console.warn("Login failed after device linking:", loginError);
			options?.onEvent?.({
				step: 0,
				phase: require_passkeyManager.DeviceLinkingPhase.LOGIN_ERROR,
				status: require_passkeyManager.DeviceLinkingStatus.ERROR,
				error: loginError.message,
				message: loginError.message
			});
		}
	}
	/**
	* Device2: Store authenticator data locally on Device2
	*/
	async storeDeviceAuthenticator(deterministicKeysResult) {
		if (!this.session || !this.session.accountId) throw new Error("Session or account ID not available for storing authenticator");
		try {
			const { webAuthnManager } = this.context;
			const { credential, accountId } = this.session;
			if (!credential) throw new Error("WebAuthn credential not available after VRF migration");
			if (!deterministicKeysResult?.encryptedVrfKeypair) throw new Error("VRF credentials not available after migration");
			if (this.session.deviceNumber === void 0 || this.session.deviceNumber === null) throw new Error("Device number not available - cannot determine device-specific account ID");
			console.log("Storing device authenticator data with device number: ", this.session.deviceNumber);
			await webAuthnManager.storeUserData({
				nearAccountId: accountId,
				deviceNumber: this.session.deviceNumber,
				clientNearPublicKey: deterministicKeysResult.nearPublicKey,
				lastUpdated: Date.now(),
				passkeyCredential: {
					id: credential.id,
					rawId: require_base64.base64UrlEncode(credential.rawId)
				},
				encryptedVrfKeypair: {
					encryptedVrfDataB64u: deterministicKeysResult.encryptedVrfKeypair.encryptedVrfDataB64u,
					chacha20NonceB64u: deterministicKeysResult.encryptedVrfKeypair.chacha20NonceB64u
				},
				serverEncryptedVrfKeypair: deterministicKeysResult.serverEncryptedVrfKeypair || void 0
			});
			await webAuthnManager.storeAuthenticator({
				nearAccountId: accountId,
				deviceNumber: this.session.deviceNumber,
				credentialId: require_base64.base64UrlEncode(credential.rawId),
				credentialPublicKey: new Uint8Array(credential.rawId),
				transports: ["internal"],
				name: `Device ${this.session.deviceNumber || "Unknown"} Passkey for ${accountId.split(".")[0]}`,
				registered: (/* @__PURE__ */ new Date()).toISOString(),
				syncedAt: (/* @__PURE__ */ new Date()).toISOString(),
				vrfPublicKey: deterministicKeysResult.vrfPublicKey
			});
			console.log(`LinkDeviceFlow: Successfully stored authenticator data for account: ${accountId}, device number: ${this.session.deviceNumber}`);
		} catch (error) {
			console.error(`LinkDeviceFlow: Failed to store authenticator data:`, error);
			await this.cleanupFailedLinkingAttempt();
			throw error;
		}
	}
	/**
	* 1. Derives deterministic VRF and NEAR keys using real accountID (instead of temporary keys)
	* 2. Executes Key Replacement transaction to replace temporary key with the real key
	* 3. Signs the registration transaction and broadcasts it.
	*
	* For Option E: VRF credentials already exist, just ensure they're stored
	* For Option F: Generate WebAuthn credential + derive VRF credentials
	*/
	async deriveDeterministicKeysAndRegisterAccount() {
		if (!this.session || !this.session.accountId) throw new Error("Session account ID not available for migration");
		const realAccountId = this.session.accountId;
		try {
			console.log(`LinkDeviceFlow: Processing VRF credentials for real account: ${realAccountId}`);
			if (!this.session.credential) {
				console.log(`LinkDeviceFlow: Option F - Generating WebAuthn credential for ${realAccountId}`);
				const vrfChallenge = await require_registration.generateBootstrapVrfChallenge(this.context, realAccountId);
				const deviceNumber = this.session.deviceNumber;
				console.log(`LinkDeviceFlow: Using device number ${deviceNumber} for credential generation`);
				const credential = await this.context.webAuthnManager.generateRegistrationCredentialsForLinkDevice({
					nearAccountId: realAccountId,
					deviceNumber,
					challenge: vrfChallenge
				});
				this.session.credential = credential;
				this.session.vrfChallenge = vrfChallenge;
				const vrfDerivationResult = await this.context.webAuthnManager.deriveVrfKeypair({
					credential,
					nearAccountId: realAccountId
				});
				if (!vrfDerivationResult.success || !vrfDerivationResult.encryptedVrfKeypair) throw new Error("Failed to derive VRF keypair from PRF for real account");
				console.log(`LinkDeviceFlow: Option F - Generated proper credentials, implementing 3-step flow`);
				const nearKeyResultStep1 = await this.context.webAuthnManager.deriveNearKeypairAndEncrypt({
					nearAccountId: realAccountId,
					credential
				});
				if (!nearKeyResultStep1.success || !nearKeyResultStep1.publicKey) throw new Error("Failed to derive NEAR keypair in step 1");
				console.log(`LinkDeviceFlow: Step 1 - Generated keypair: ${nearKeyResultStep1.publicKey}`);
				const { nextNonce, txBlockHash } = await this.context.webAuthnManager.getNonceManager().getNonceBlockHashAndHeight(this.context.nearClient);
				await this.executeKeySwapTransaction(nearKeyResultStep1.publicKey, nextNonce, txBlockHash);
				const { nextNonce: newKeyNonce, txBlockHash: newTxBlockHash } = await this.context.webAuthnManager.getNonceManager().getNonceBlockHashAndHeight(this.context.nearClient);
				console.log("Key Replacement Transaction Block Hash retrieved.");
				console.log("NewKey's actual nonce >>>> newKeyNonce", newKeyNonce);
				const nearKeyResultStep3 = await this.context.webAuthnManager.deriveNearKeypairAndEncrypt({
					nearAccountId: realAccountId,
					credential,
					options: {
						vrfChallenge,
						contractId: this.context.configs.contractId,
						nonce: newKeyNonce,
						blockHash: newTxBlockHash,
						deterministicVrfPublicKey: vrfDerivationResult.vrfPublicKey
					}
				});
				if (!nearKeyResultStep3.success || !nearKeyResultStep3.signedTransaction) throw new Error("Failed to sign registration transaction");
				console.log(`LinkDeviceFlow: Broadcasting Device2 authenticator registration transaction`);
				const registrationTxResult = await this.context.nearClient.sendTransaction(nearKeyResultStep3.signedTransaction);
				console.log(`LinkDeviceFlow: Device2 authenticator registered on-chain:`, registrationTxResult?.transaction?.hash);
				if (this.session?.tempPrivateKey) {
					try {
						await require_index.IndexedDBManager.nearKeysDB.deleteEncryptedKey("temp-device-linking.testnet");
						console.log(`LinkDeviceFlow: Cleaned up temp VRF credentials`);
					} catch (err) {
						console.warn(`️LinkDeviceFlow: Could not clean up temp VRF credentials:`, err);
					}
					this.cleanupTemporaryKeyFromMemory();
				}
				const result = {
					encryptedVrfKeypair: vrfDerivationResult.encryptedVrfKeypair,
					serverEncryptedVrfKeypair: vrfDerivationResult.serverEncryptedVrfKeypair,
					vrfPublicKey: vrfDerivationResult.vrfPublicKey,
					nearPublicKey: nearKeyResultStep1.publicKey,
					credential,
					vrfChallenge
				};
				return result;
			} else {
				console.log(`LinkDeviceFlow: Option E - Regenerating credentials with device number for ${realAccountId}`);
				const vrfChallenge = await require_registration.generateBootstrapVrfChallenge(this.context, realAccountId);
				const deviceNumber = this.session.deviceNumber;
				console.log(`LinkDeviceFlow: Option E - Using device number ${deviceNumber} for credential regeneration`);
				const credential = await this.context.webAuthnManager.generateRegistrationCredentialsForLinkDevice({
					nearAccountId: realAccountId,
					deviceNumber,
					challenge: vrfChallenge
				});
				this.session.credential = credential;
				this.session.vrfChallenge = vrfChallenge;
				const vrfDerivationResult = await this.context.webAuthnManager.deriveVrfKeypair({
					credential,
					nearAccountId: realAccountId
				});
				if (!vrfDerivationResult.success || !vrfDerivationResult.encryptedVrfKeypair) throw new Error("Failed to derive VRF keypair from PRF for Option E");
				console.log(`LinkDeviceFlow: Option E - VRF credentials derived for ${realAccountId}`);
				const result = {
					encryptedVrfKeypair: vrfDerivationResult.encryptedVrfKeypair,
					serverEncryptedVrfKeypair: vrfDerivationResult.serverEncryptedVrfKeypair,
					vrfPublicKey: vrfDerivationResult.vrfPublicKey,
					nearPublicKey: this.session.nearPublicKey,
					credential,
					vrfChallenge
				};
				return result;
			}
		} catch (error) {
			console.error(`LinkDeviceFlow: Failed to process VRF credentials:`, error);
			throw error;
		}
	}
	/**
	* Execute key replacement transaction for Option F flow
	* Replace temporary key with properly derived key using AddKey + DeleteKey
	*/
	async executeKeySwapTransaction(newPublicKey, nextNonce, txBlockHash) {
		if (!this.session?.tempPrivateKey || !this.session?.accountId) throw new Error("Missing temporary private key or account ID for key replacement");
		const { tempPrivateKey, accountId, nearPublicKey: oldPublicKey } = this.session;
		try {
			console.log(`LinkDeviceFlow: Executing key replacement transaction for ${accountId}`);
			console.log(`   - Old key: ${oldPublicKey}`);
			console.log(`   - New key: ${newPublicKey}`);
			const actions = [{
				action_type: require_actions.ActionType.AddKey,
				public_key: newPublicKey,
				access_key: JSON.stringify({ permission: { FullAccess: {} } })
			}, {
				action_type: require_actions.ActionType.DeleteKey,
				public_key: oldPublicKey
			}];
			const keySwapResult = await this.context.webAuthnManager.signTransactionWithKeyPair({
				nearPrivateKey: tempPrivateKey,
				signerAccountId: accountId,
				receiverId: accountId,
				nonce: nextNonce,
				blockHash: txBlockHash,
				actions
			});
			const txResult = await this.context.nearClient.sendTransaction(keySwapResult.signedTransaction, require_rpc.DEFAULT_WAIT_STATUS.linkDeviceSwapKey);
			console.log(`LinkDeviceFlow: Key replacement transaction successful:`, txResult?.transaction?.hash);
		} catch (error) {
			console.error(`LinkDeviceFlow: Key replacement transaction failed:`, error);
			throw new Error(`Key replacement failed: ${error instanceof Error ? error.message : "Unknown error"}`);
		}
	}
	/**
	* Clean up failed linking attempts - remove any partially stored data
	*/
	async cleanupFailedLinkingAttempt() {
		if (!this.session) return;
		try {
			const { credential, accountId, nearPublicKey } = this.session;
			console.log(`LinkDeviceFlow: Cleaning up failed linking attempt for ${accountId || "unknown account"}`);
			this.cleanupTemporaryKeyFromMemory();
			if (accountId && credential) {
				try {
					await require_index.IndexedDBManager.clientDB.deleteAllAuthenticatorsForUser(accountId);
					console.log(`LinkDeviceFlow: Removed authenticators for ${accountId}`);
				} catch (err) {
					console.warn(`️LinkDeviceFlow: Could not remove authenticators for ${accountId}:`, err);
				}
				try {
					await require_index.IndexedDBManager.clientDB.deleteUser(accountId);
					console.log(`LinkDeviceFlow: Removed user data for ${accountId}`);
				} catch (err) {
					console.warn(`️LinkDeviceFlow: Could not remove user data for ${accountId}:`, err);
				}
				try {
					await require_index.IndexedDBManager.nearKeysDB.deleteEncryptedKey(accountId);
					console.log(`LinkDeviceFlow: Removed VRF credentials for device-specific account ${accountId}`);
				} catch (err) {
					console.warn(`️LinkDeviceFlow: Could not remove VRF credentials for ${accountId}:`, err);
				}
			}
			try {
				await require_index.IndexedDBManager.nearKeysDB.deleteEncryptedKey("temp-device-linking.testnet");
				console.log(`LinkDeviceFlow: Removed temp VRF credentials`);
			} catch (err) {
				console.warn(`️LinkDeviceFlow: Could not remove temp VRF credentials:`, err);
			}
		} catch (error) {
			console.error(`LinkDeviceFlow: Error during cleanup:`, error);
		}
	}
	/**
	* Stop polling - guaranteed to clear any existing interval
	*/
	stopPolling() {
		if (this.pollingInterval) {
			console.log(`LinkDeviceFlow: Stopping polling interval`);
			clearTimeout(this.pollingInterval);
			this.pollingInterval = void 0;
		}
		this.pollGeneration++;
	}
	/**
	* Stop registration retry timeout
	*/
	stopRegistrationRetry() {
		if (this.registrationRetryTimeout) {
			console.log(`LinkDeviceFlow: Stopping registration retry timeout`);
			clearTimeout(this.registrationRetryTimeout);
			this.registrationRetryTimeout = void 0;
		}
	}
	/**
	* Get current flow state
	*/
	getState() {
		return {
			phase: this.session?.phase,
			session: this.session,
			error: this.error
		};
	}
	/**
	* Cancel the flow and cleanup
	*/
	cancel() {
		console.log(`LinkDeviceFlow: Cancel called`);
		this.cancelled = true;
		this.stopPolling();
		this.stopRegistrationRetry();
		this.cleanupTemporaryKeyFromMemory();
		this.session = null;
		this.error = void 0;
		this.registrationRetryCount = 0;
	}
	/**
	* Reset flow to initial state
	*/
	reset() {
		this.cancel();
	}
};

//#endregion
exports.LinkDeviceFlow = LinkDeviceFlow;
//# sourceMappingURL=linkDevice.js.map