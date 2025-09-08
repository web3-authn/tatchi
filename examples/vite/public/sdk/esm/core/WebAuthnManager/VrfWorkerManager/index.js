import { toAccountId } from "../../types/accountIds.js";
import { validateVRFChallenge } from "../../types/vrf-worker.js";
import { BUILD_PATHS } from "../../../packages/passkey/build-paths.js";
import { extractPrfFromCredential } from "../credentialsHelpers.js";

//#region src/core/WebAuthnManager/VrfWorkerManager/index.ts
/**
* VRF Worker Manager
*
* This class manages VRF operations using Web Workers for:
* - VRF keypair unlocking (login)
* - VRF challenge generation (authentication)
* - Session management (browser session only)
* - Client-hosted worker files
*/
var VrfWorkerManager = class {
	vrfWorker = null;
	initializationPromise = null;
	messageId = 0;
	config;
	currentVrfAccountId = null;
	constructor(config = {}) {
		this.config = {
			vrfWorkerUrl: BUILD_PATHS.RUNTIME.VRF_WORKER,
			workerTimeout: 1e4,
			debug: false,
			...config
		};
	}
	/**
	* Ensure VRF worker is initialized and ready
	*/
	/**
	* Ensure VRF worker is ready for operations
	* @param requireHealthCheck - Whether to perform health check after initialization
	*/
	async ensureWorkerReady(requireHealthCheck = false) {
		if (this.initializationPromise) await this.initializationPromise;
		else if (!this.vrfWorker) await this.initialize();
		if (!this.vrfWorker) throw new Error("VRF Worker failed to initialize");
		if (requireHealthCheck) try {
			const healthResponse = await this.sendMessage({
				type: "PING",
				id: this.generateMessageId(),
				payload: {}
			}, 3e3);
			if (!healthResponse.success) throw new Error("VRF Worker failed health check");
		} catch (error) {
			console.error("VRF Manager: Health check failed:", error);
			throw new Error("VRF Worker failed health check");
		}
	}
	/**
	* Initialize VRF functionality using Web Workers
	*/
	async initialize() {
		if (this.initializationPromise) return this.initializationPromise;
		this.initializationPromise = this.createVrfWorker().catch((error) => {
			console.error("VRF Manager: Initialization failed:", error);
			console.error("VRF Manager: Error details:", {
				message: error.message,
				stack: error.stack,
				name: error.name
			});
			this.initializationPromise = null;
			throw error;
		});
		const result = await this.initializationPromise;
		return result;
	}
	/**
	* Initialize Web Worker with client-hosted VRF worker
	*/
	async createVrfWorker() {
		try {
			console.debug("VRF Manager: Worker URL:", this.config.vrfWorkerUrl);
			this.vrfWorker = new Worker(this.config.vrfWorkerUrl, {
				type: "module",
				name: "Web3AuthnVRFWorker"
			});
			this.vrfWorker.onerror = (error) => {
				console.error("VRF Manager: Web Worker error:", error);
			};
			await this.testWebWorkerCommunication();
			if (this.config.shamirPB64u) {
				const resp = await this.sendMessage({
					type: "SHAMIR3PASS_CONFIG_P",
					id: this.generateMessageId(),
					payload: { p_b64u: this.config.shamirPB64u }
				});
				if (!resp.success) throw new Error(`Failed to configure Shamir P: ${resp.error}`);
			}
			if (this.config.relayServerUrl && this.config.applyServerLockRoute && this.config.removeServerLockRoute) {
				const resp2 = await this.sendMessage({
					type: "SHAMIR3PASS_CONFIG_SERVER_URLS",
					id: this.generateMessageId(),
					payload: {
						relayServerUrl: this.config.relayServerUrl,
						applyLockRoute: this.config.applyServerLockRoute,
						removeLockRoute: this.config.removeServerLockRoute
					}
				});
				if (!resp2.success) throw new Error(`Failed to configure Shamir server URLs: ${resp2.error}`);
			}
		} catch (error) {
			throw new Error(`VRF Web Worker initialization failed: ${error.message}`);
		}
	}
	/**
	* Send message to Web Worker and wait for response
	*/
	async sendMessage(message, customTimeout) {
		return new Promise((resolve, reject) => {
			if (!this.vrfWorker) {
				reject(/* @__PURE__ */ new Error("VRF Web Worker not available"));
				return;
			}
			const timeoutMs = customTimeout || 3e4;
			const timeout = setTimeout(() => {
				reject(/* @__PURE__ */ new Error(`VRF Web Worker communication timeout (${timeoutMs}ms) for message type: ${message.type}`));
			}, timeoutMs);
			const handleMessage = (event) => {
				const response = event.data;
				if (response.id === message.id) {
					clearTimeout(timeout);
					this.vrfWorker.removeEventListener("message", handleMessage);
					resolve(response);
				}
			};
			this.vrfWorker.addEventListener("message", handleMessage);
			this.vrfWorker.postMessage(message);
		});
	}
	/**
	* Generate unique message ID
	*/
	generateMessageId() {
		return `vrf_${Date.now()}_${++this.messageId}`;
	}
	/**
	* Unlock VRF keypair in Web Worker memory using PRF output
	* This is called during login to decrypt and load the VRF keypair in-memory
	*/
	async unlockVrfKeypair({ credential, nearAccountId, encryptedVrfKeypair, onEvent }) {
		await this.ensureWorkerReady(true);
		const { chacha20PrfOutput } = extractPrfFromCredential({
			credential,
			firstPrfOutput: true,
			secondPrfOutput: false
		});
		if (!chacha20PrfOutput) throw new Error("ChaCha20 PRF output not found in WebAuthn credentials");
		onEvent?.({
			type: "loginProgress",
			data: {
				step: "verifying-server",
				message: "TouchId success! Unlocking VRF keypair..."
			}
		});
		const message = {
			type: "UNLOCK_VRF_KEYPAIR",
			id: this.generateMessageId(),
			payload: {
				nearAccountId,
				encryptedVrfKeypair,
				prfKey: chacha20PrfOutput
			}
		};
		const response = await this.sendMessage(message);
		if (response.success) {
			this.currentVrfAccountId = nearAccountId;
			console.debug(`VRF Manager: VRF keypair unlocked for ${nearAccountId}`);
		} else {
			console.error("VRF Manager: Failed to unlock VRF keypair:", response.error);
			console.error("VRF Manager: Full response:", JSON.stringify(response, null, 2));
			console.error("VRF Manager: Message that was sent:", JSON.stringify(message, null, 2));
		}
		return response;
	}
	/**
	* Generate VRF challenge using in-memory VRF keypair
	* This is called during authentication to create WebAuthn challenges
	*/
	async generateVrfChallenge(inputData) {
		await this.ensureWorkerReady(true);
		const message = {
			type: "GENERATE_VRF_CHALLENGE",
			id: this.generateMessageId(),
			payload: { vrfInputData: {
				userId: inputData.userId,
				rpId: inputData.rpId,
				blockHeight: String(inputData.blockHeight),
				blockHash: inputData.blockHash
			} }
		};
		const response = await this.sendMessage(message);
		if (!response.success || !response.data) throw new Error(`VRF challenge generation failed: ${response.error}`);
		console.debug("VRF Manager: VRF challenge generated successfully");
		return validateVRFChallenge(response.data);
	}
	/**
	* Get current VRF session status
	*/
	async checkVrfStatus() {
		try {
			await this.ensureWorkerReady();
		} catch (error) {
			return {
				active: false,
				nearAccountId: null
			};
		}
		try {
			const message = {
				type: "CHECK_VRF_STATUS",
				id: this.generateMessageId(),
				payload: {}
			};
			const response = await this.sendMessage(message);
			if (response.success && response.data) return {
				active: response.data.active,
				nearAccountId: this.currentVrfAccountId ? toAccountId(this.currentVrfAccountId) : null,
				sessionDuration: response.data.sessionDuration
			};
			return {
				active: false,
				nearAccountId: null
			};
		} catch (error) {
			console.warn("VRF Manager: Failed to get VRF status:", error);
			return {
				active: false,
				nearAccountId: null
			};
		}
	}
	/**
	* Logout and clear VRF session
	*/
	async clearVrfSession() {
		console.debug("VRF Manager: Logging out...");
		await this.ensureWorkerReady();
		try {
			const message = {
				type: "LOGOUT",
				id: this.generateMessageId(),
				payload: {}
			};
			const response = await this.sendMessage(message);
			if (response.success) {
				this.currentVrfAccountId = null;
				console.debug("VRF Manager: Logged out: VRF keypair securely zeroized");
			} else console.warn("️VRF Manager: Logout failed:", response.error);
		} catch (error) {
			console.warn("VRF Manager: Logout error:", error);
		}
	}
	/**
	* Generate VRF keypair for bootstrapping - stores in memory unencrypted temporarily
	* This is used during registration to generate a VRF keypair that will be used for
	* WebAuthn ceremony and later encrypted with the real PRF output
	*
	* @param saveInMemory - Always true for bootstrap (VRF keypair stored in memory)
	* @param vrfInputParams - Optional parameters to generate VRF challenge/proof in same call
	* @returns VRF public key and optionally VRF challenge data
	*/
	async generateVrfKeypairBootstrap(vrfInputData, saveInMemory) {
		await this.ensureWorkerReady();
		try {
			const message = {
				type: "GENERATE_VRF_KEYPAIR_BOOTSTRAP",
				id: this.generateMessageId(),
				payload: { vrfInputData: vrfInputData ? {
					userId: vrfInputData.userId,
					rpId: vrfInputData.rpId,
					blockHeight: String(vrfInputData.blockHeight),
					blockHash: vrfInputData.blockHash
				} : void 0 }
			};
			const response = await this.sendMessage(message);
			if (!response.success || !response.data) throw new Error(`VRF bootstrap keypair generation failed: ${response.error}`);
			if (!response?.data?.vrf_challenge_data) throw new Error("VRF challenge data failed to be generated");
			if (vrfInputData && saveInMemory) this.currentVrfAccountId = vrfInputData.userId;
			return {
				vrfPublicKey: response.data.vrfPublicKey,
				vrfChallenge: validateVRFChallenge({
					vrfInput: response.data.vrf_challenge_data.vrfInput,
					vrfOutput: response.data.vrf_challenge_data.vrfOutput,
					vrfProof: response.data.vrf_challenge_data.vrfProof,
					vrfPublicKey: response.data.vrf_challenge_data.vrfPublicKey,
					userId: response.data.vrf_challenge_data.userId,
					rpId: response.data.vrf_challenge_data.rpId,
					blockHeight: response.data.vrf_challenge_data.blockHeight,
					blockHash: response.data.vrf_challenge_data.blockHash
				})
			};
		} catch (error) {
			console.error("VRF Manager: Bootstrap VRF keypair generation failed:", error);
			throw new Error(`Failed to generate bootstrap VRF keypair: ${error.message}`);
		}
	}
	/**
	* Derive deterministic VRF keypair from PRF output for account recovery
	* Optionally generates VRF challenge if input parameters are provided
	* This enables deterministic VRF key derivation without needing stored VRF keypairs
	*
	* @param prfOutput - Base64url-encoded PRF output from WebAuthn credential (PRF Output 1)
	* @param nearAccountId - NEAR account ID for key derivation salt
	* @param vrfInputParams - Optional VRF input parameters for challenge generation
	* @returns Deterministic VRF public key, optional VRF challenge, and encrypted VRF keypair for storage
	*/
	async deriveVrfKeypairFromPrf({ credential, nearAccountId, vrfInputData, saveInMemory = true }) {
		console.debug("VRF Manager: Deriving deterministic VRF keypair from PRF output");
		try {
			await this.ensureWorkerReady();
			const { chacha20PrfOutput } = extractPrfFromCredential({
				credential,
				firstPrfOutput: true,
				secondPrfOutput: false
			});
			const hasVrfInputData = vrfInputData?.blockHash && vrfInputData?.blockHeight && vrfInputData?.userId && vrfInputData?.rpId;
			const message = {
				type: "DERIVE_VRF_KEYPAIR_FROM_PRF",
				id: this.generateMessageId(),
				payload: {
					prfOutput: chacha20PrfOutput,
					nearAccountId,
					saveInMemory,
					vrfInputData: hasVrfInputData ? {
						userId: vrfInputData.userId,
						rpId: vrfInputData.rpId,
						blockHeight: String(vrfInputData.blockHeight),
						blockHash: vrfInputData.blockHash
					} : void 0
				}
			};
			const response = await this.sendMessage(message);
			if (!response.success || !response.data) throw new Error(`VRF keypair derivation failed: ${response.error}`);
			if (!response.data.vrfPublicKey) throw new Error("VRF public key not found in response");
			if (!response.data.encryptedVrfKeypair) throw new Error("Encrypted VRF keypair not found in response - this is required for registration");
			console.debug("VRF Manager: Deterministic VRF keypair derivation successful");
			const vrfChallenge = response.data.vrfChallengeData ? validateVRFChallenge({
				vrfInput: response.data.vrfChallengeData.vrfInput,
				vrfOutput: response.data.vrfChallengeData.vrfOutput,
				vrfProof: response.data.vrfChallengeData.vrfProof,
				vrfPublicKey: response.data.vrfChallengeData.vrfPublicKey,
				userId: response.data.vrfChallengeData.userId,
				rpId: response.data.vrfChallengeData.rpId,
				blockHeight: response.data.vrfChallengeData.blockHeight,
				blockHash: response.data.vrfChallengeData.blockHash
			}) : null;
			const result = {
				vrfPublicKey: response.data.vrfPublicKey,
				vrfChallenge,
				encryptedVrfKeypair: response.data.encryptedVrfKeypair,
				serverEncryptedVrfKeypair: response.data.serverEncryptedVrfKeypair
			};
			return result;
		} catch (error) {
			console.error("VRF Manager: VRF keypair derivation failed:", error);
			throw new Error(`VRF keypair derivation failed: ${error.message}`);
		}
	}
	/**
	* This securely decrypts the shamir3Pass encrypted VRF keypair and loads it into memory
	* It performs Shamir-3-Pass commutative decryption within WASM worker with the relay-server
	*/
	async shamir3PassDecryptVrfKeypair({ nearAccountId, kek_s_b64u, ciphertextVrfB64u }) {
		await this.ensureWorkerReady(true);
		const message = {
			type: "SHAMIR3PASS_CLIENT_DECRYPT_VRF_KEYPAIR",
			id: this.generateMessageId(),
			payload: {
				nearAccountId,
				kek_s_b64u,
				ciphertextVrfB64u
			}
		};
		const response = await this.sendMessage(message);
		if (response.success) this.currentVrfAccountId = nearAccountId;
		return response;
	}
	/**
	* Test Web Worker communication
	*/
	async testWebWorkerCommunication() {
		try {
			const timeoutMs = 2e3;
			const pingResponse = await this.sendMessage({
				type: "PING",
				id: this.generateMessageId(),
				payload: {}
			}, timeoutMs);
			if (!pingResponse.success) throw new Error(`VRF Web Worker PING failed: ${pingResponse.error}`);
			return;
		} catch (error) {
			console.warn(`️VRF Manager: testWebWorkerCommunication failed:`, error.message);
		}
	}
};

//#endregion
export { VrfWorkerManager };
//# sourceMappingURL=index.js.map