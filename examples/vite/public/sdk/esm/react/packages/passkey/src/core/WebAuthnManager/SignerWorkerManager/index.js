import { isWorkerError, isWorkerProgress, isWorkerSuccess } from "../../types/signer-worker.js";
import { IndexedDBManager } from "../../IndexedDBManager/index.js";
import { TouchIdPrompt } from "../touchIdPrompt.js";
import { SIGNER_WORKER_MANAGER_CONFIG } from "../../../config.js";
import { checkCanRegisterUser } from "./handlers/checkCanRegisterUser.js";
import { deriveNearKeypairAndEncrypt } from "./handlers/deriveNearKeypairAndEncrypt.js";
import { decryptPrivateKeyWithPrf } from "./handlers/decryptPrivateKeyWithPrf.js";
import { signVerifyAndRegisterUser } from "./handlers/signVerifyAndRegisterUser.js";
import { signTransactionsWithActions } from "./handlers/signTransactionsWithActions.js";
import { recoverKeypairFromPasskey } from "./handlers/recoverKeypairFromPasskey.js";
import { extractCosePublicKey } from "./handlers/extractCosePublicKey.js";
import { signTransactionWithKeyPair } from "./handlers/signTransactionWithKeyPair.js";
import { signNep413Message } from "./handlers/signNep413Message.js";
import { SecureConfirmMessageType } from "./confirmTxFlow/types.js";
import { handlePromptUserConfirmInJsMainThread } from "./confirmTxFlow/handleSecureConfirmRequest.js";

//#region src/core/WebAuthnManager/SignerWorkerManager/index.ts
/**
* WebAuthnWorkers handles PRF, workers, and COSE operations
*
* Note: Challenge store removed as VRF provides cryptographic freshness
* without needing centralized challenge management
*/
var SignerWorkerManager = class {
	indexedDB;
	touchIdPrompt;
	vrfWorkerManager;
	nearClient;
	userPreferencesManager;
	nonceManager;
	constructor(vrfWorkerManager, nearClient, userPreferencesManager, nonceManager) {
		this.indexedDB = IndexedDBManager;
		this.touchIdPrompt = new TouchIdPrompt();
		this.vrfWorkerManager = vrfWorkerManager;
		this.nearClient = nearClient;
		this.userPreferencesManager = userPreferencesManager;
		this.nonceManager = nonceManager;
	}
	getContext() {
		return {
			sendMessage: this.sendMessage.bind(this),
			indexedDB: this.indexedDB,
			touchIdPrompt: this.touchIdPrompt,
			vrfWorkerManager: this.vrfWorkerManager,
			nearClient: this.nearClient,
			userPreferencesManager: this.userPreferencesManager,
			nonceManager: this.nonceManager
		};
	}
	createSecureWorker() {
		const workerUrl = new URL(SIGNER_WORKER_MANAGER_CONFIG.WORKER.URL, window.location.origin);
		console.debug("Creating secure worker from:", workerUrl.href);
		try {
			const worker = new Worker(workerUrl, {
				type: SIGNER_WORKER_MANAGER_CONFIG.WORKER.TYPE,
				name: SIGNER_WORKER_MANAGER_CONFIG.WORKER.NAME
			});
			worker.onerror = (event) => {
				console.error("Worker error:", event);
			};
			return worker;
		} catch (error) {
			console.error("Failed to create worker:", error);
			throw new Error(`Failed to create secure worker: ${error instanceof Error ? error.message : "Unknown error"}`);
		}
	}
	/**
	* Executes a worker operation by sending a message to the secure worker.
	* Handles progress updates via onEvent callback, supports both single and multiple response patterns.
	* Intercepts secure confirmation handshake messages for pluggable UI.
	* Resolves with the final worker response or rejects on error/timeout.
	*
	* @template T - Worker request type.
	* @param params.message - The message to send to the worker.
	* @param params.onEvent - Optional callback for progress events.
	* @param params.timeoutMs - Optional timeout in milliseconds.
	* @returns Promise resolving to the worker response for the request.
	*/
	workerPool = [];
	MAX_WORKER_POOL_SIZE = 3;
	getWorkerFromPool() {
		if (this.workerPool.length > 0) return this.workerPool.pop();
		return this.createSecureWorker();
	}
	terminateAndReplaceWorker(worker) {
		worker.terminate();
		this.createReplacementWorker();
	}
	async createReplacementWorker() {
		try {
			const worker = this.createSecureWorker();
			const healthPromise = new Promise((resolve, reject) => {
				const timeout = setTimeout(() => reject(/* @__PURE__ */ new Error("Health check timeout")), 5e3);
				const onMessage = (event) => {
					if (event.data?.type === "WORKER_READY" || event.data?.ready) {
						worker.removeEventListener("message", onMessage);
						clearTimeout(timeout);
						resolve();
					}
				};
				worker.addEventListener("message", onMessage);
				worker.onerror = () => {
					worker.removeEventListener("message", onMessage);
					clearTimeout(timeout);
					reject(/* @__PURE__ */ new Error("Worker error during health check"));
				};
			});
			await healthPromise;
			if (this.workerPool.length < this.MAX_WORKER_POOL_SIZE) this.workerPool.push(worker);
			else worker.terminate();
		} catch (error) {
			console.warn("SignerWorkerManager: Failed to create replacement worker:", error);
		}
	}
	/**
	* Pre-warm worker pool by creating and initializing workers in advance
	* This reduces latency for the first transaction by having workers ready
	*/
	async preWarmWorkerPool() {
		const promises = [];
		for (let i = 0; i < this.MAX_WORKER_POOL_SIZE; i++) promises.push(new Promise((resolve, reject) => {
			try {
				const worker = this.createSecureWorker();
				const onReady = (event) => {
					if (event.data?.type === "WORKER_READY" || event.data?.ready) {
						worker.removeEventListener("message", onReady);
						this.terminateAndReplaceWorker(worker);
						resolve();
					}
				};
				worker.addEventListener("message", onReady);
				worker.onerror = (error) => {
					worker.removeEventListener("message", onReady);
					console.error(`WebAuthnManager: Worker ${i + 1} pre-warm failed:`, error);
					reject(error);
				};
				setTimeout(() => {
					worker.removeEventListener("message", onReady);
					console.warn(`WebAuthnManager: Worker ${i + 1} pre-warm timeout`);
					reject(/* @__PURE__ */ new Error("Pre-warm timeout"));
				}, 5e3);
			} catch (error) {
				console.error(`WebAuthnManager: Failed to create worker ${i + 1}:`, error);
				reject(error);
			}
		}));
		try {
			await Promise.allSettled(promises);
		} catch (error) {
			console.warn("WebAuthnManager: Some workers failed to pre-warm:", error);
		}
	}
	async sendMessage({ message, onEvent, timeoutMs = SIGNER_WORKER_MANAGER_CONFIG.TIMEOUTS.DEFAULT }) {
		const worker = this.getWorkerFromPool();
		return new Promise((resolve, reject) => {
			const timeoutId = setTimeout(() => {
				try {
					this.terminateAndReplaceWorker(worker);
				} catch {}
				try {
					const seconds = Math.round(timeoutMs / 1e3);
					window.postMessage({
						type: "MODAL_TIMEOUT",
						payload: `Timed out after ${seconds}s, try again`
					}, "*");
				} catch {}
				reject(/* @__PURE__ */ new Error(`Worker operation timed out after ${timeoutMs}ms`));
			}, timeoutMs);
			const responses = [];
			worker.onmessage = async (event) => {
				try {
					if (event?.data?.type === "WORKER_READY" || event?.data?.ready) return;
					const response = event.data;
					responses.push(response);
					if (event.data.type === SecureConfirmMessageType.PROMPT_USER_CONFIRM_IN_JS_MAIN_THREAD) {
						await handlePromptUserConfirmInJsMainThread(this.getContext(), event.data, worker);
						return;
					}
					if (isWorkerProgress(response)) {
						const progressResponse = response;
						onEvent?.(progressResponse.payload);
						return;
					}
					if (isWorkerError(response)) {
						clearTimeout(timeoutId);
						this.terminateAndReplaceWorker(worker);
						const errorResponse = response;
						console.error("Worker error response:", errorResponse);
						reject(new Error(errorResponse.payload.error));
						return;
					}
					if (isWorkerSuccess(response)) {
						clearTimeout(timeoutId);
						this.terminateAndReplaceWorker(worker);
						resolve(response);
						return;
					}
					console.error("Unexpected worker response format:", {
						response,
						responseType: typeof response,
						isObject: typeof response === "object",
						hasType: response && typeof response === "object" && "type" in response,
						type: response?.type
					});
					if (response && typeof response === "object" && "message" in response && "stack" in response) {
						clearTimeout(timeoutId);
						this.terminateAndReplaceWorker(worker);
						console.error("Worker sent generic Error object:", response);
						reject(/* @__PURE__ */ new Error(`Worker sent generic error: ${response.message}`));
						return;
					}
					clearTimeout(timeoutId);
					this.terminateAndReplaceWorker(worker);
					reject(/* @__PURE__ */ new Error(`Unknown worker response format: ${JSON.stringify(response)}`));
				} catch (error) {
					clearTimeout(timeoutId);
					this.terminateAndReplaceWorker(worker);
					console.error("Error processing worker message:", error);
					reject(/* @__PURE__ */ new Error(`Worker message processing error: ${error instanceof Error ? error.message : String(error)}`));
				}
			};
			worker.onerror = (event) => {
				clearTimeout(timeoutId);
				this.terminateAndReplaceWorker(worker);
				const errorMessage = event.error?.message || event.message || "Unknown worker error";
				console.error("Worker error details (progress):", {
					message: errorMessage,
					filename: event.filename,
					lineno: event.lineno,
					colno: event.colno,
					error: event.error
				});
				reject(/* @__PURE__ */ new Error(`Worker error: ${errorMessage}`));
			};
			const formattedMessage = {
				type: message.type,
				payload: message.payload
			};
			worker.postMessage(formattedMessage);
		});
	}
	/**
	* Secure registration flow with dual PRF: WebAuthn + WASM worker encryption using dual PRF
	* Optionally signs a link_device_register_user transaction if VRF data is provided
	*/
	async deriveNearKeypairAndEncrypt(args) {
		return deriveNearKeypairAndEncrypt({
			ctx: this.getContext(),
			...args
		});
	}
	/**
	* Secure private key decryption with dual PRF
	*/
	async decryptPrivateKeyWithPrf(args) {
		return decryptPrivateKeyWithPrf({
			ctx: this.getContext(),
			...args
		});
	}
	async checkCanRegisterUser(args) {
		return checkCanRegisterUser({
			ctx: this.getContext(),
			...args
		});
	}
	/**
	* @deprecated Testnet only, use createAccountAndRegisterWithRelayServer instead for prod
	*/
	async signVerifyAndRegisterUser(args) {
		return signVerifyAndRegisterUser({
			ctx: this.getContext(),
			...args
		});
	}
	/**
	* Sign multiple transactions with shared VRF challenge and credential
	* Efficiently processes multiple transactions with one PRF authentication
	*/
	async signTransactionsWithActions(args) {
		return signTransactionsWithActions({
			ctx: this.getContext(),
			...args
		});
	}
	/**
	* Recover keypair from authentication credential for account recovery
	* Uses dual PRF-based Ed25519 key derivation with account-specific HKDF and AES encryption
	*/
	async recoverKeypairFromPasskey(args) {
		return recoverKeypairFromPasskey({
			ctx: this.getContext(),
			...args
		});
	}
	/**
	* Extract COSE public key from WebAuthn attestation object
	* Simple operation that doesn't require TouchID or progress updates
	*/
	async extractCosePublicKey(attestationObjectBase64url) {
		return extractCosePublicKey({
			ctx: this.getContext(),
			attestationObjectBase64url
		});
	}
	/**
	* Sign transaction with raw private key (for key replacement in Option D device linking)
	* No TouchID/PRF required - uses provided private key directly
	*/
	async signTransactionWithKeyPair(args) {
		return signTransactionWithKeyPair({
			ctx: this.getContext(),
			...args
		});
	}
	/**
	* Sign a NEP-413 message using the user's passkey-derived private key
	*
	* @param payload - NEP-413 signing parameters including message, recipient, nonce, and state
	* @returns Promise resolving to signing result with account ID, public key, and signature
	*/
	async signNep413Message(payload) {
		return signNep413Message({
			ctx: this.getContext(),
			payload
		});
	}
};

//#endregion
export { SignerWorkerManager };
//# sourceMappingURL=index.js.map