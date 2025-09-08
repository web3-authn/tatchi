import { toAccountId, validateNearAccountId } from "./accountIds-CHODFDj_.js";
import { toActionArgsWasm, validateActionArgsWasm } from "./actions-VhrvT5cf.js";
import { IFRAME_BUTTON_ID, IFRAME_MODAL_ID } from "./tags-CCvVsAOz.js";
import { base64Encode, base64UrlDecode, base64UrlEncode } from "./base64-CZBXHuxI.js";
import { openDB } from "idb";

//#region src/wasm_signer_worker/wasm_signer_worker.js
let wasm;
const cachedTextEncoder = typeof TextEncoder !== "undefined" ? new TextEncoder("utf-8") : { encode: () => {
	throw Error("TextEncoder not available");
} };
const encodeString = typeof cachedTextEncoder.encodeInto === "function" ? function(arg, view) {
	return cachedTextEncoder.encodeInto(arg, view);
} : function(arg, view) {
	const buf = cachedTextEncoder.encode(arg);
	view.set(buf);
	return {
		read: arg.length,
		written: buf.length
	};
};
const cachedTextDecoder = typeof TextDecoder !== "undefined" ? new TextDecoder("utf-8", {
	ignoreBOM: true,
	fatal: true
}) : { decode: () => {
	throw Error("TextDecoder not available");
} };
if (typeof TextDecoder !== "undefined") cachedTextDecoder.decode();
const CLOSURE_DTORS = typeof FinalizationRegistry === "undefined" ? {
	register: () => {},
	unregister: () => {}
} : new FinalizationRegistry((state) => {
	wasm.__wbindgen_export_6.get(state.dtor)(state.a, state.b);
});
/**
* Behavior mode for confirmation flow
* @enum {0 | 1}
*/
const ConfirmationBehavior = Object.freeze({
	RequireClick: 0,
	"0": "RequireClick",
	AutoProceed: 1,
	"1": "AutoProceed"
});
/**
* UI mode for confirmation display
* @enum {0 | 1 | 2}
*/
const ConfirmationUIMode = Object.freeze({
	Skip: 0,
	"0": "Skip",
	Modal: 1,
	"1": "Modal",
	Embedded: 2,
	"2": "Embedded"
});
/**
* Progress message types that can be sent during WASM operations
* Values align with TypeScript WorkerResponseType enum for proper mapping
*
* Should match the Progress WorkerResponseTypes in worker_messages.rs:
* - WorkerResponseType::RegistrationProgress
* - WorkerResponseType::RegistrationComplete,
* - WorkerResponseType::WebauthnAuthenticationProgress
* - WorkerResponseType::AuthenticationComplete
* - WorkerResponseType::TransactionSigningProgress
* - WorkerResponseType::TransactionSigningComplete
* @enum {18 | 19 | 20 | 21}
*/
const ProgressMessageType = Object.freeze({
	RegistrationProgress: 18,
	"18": "RegistrationProgress",
	RegistrationComplete: 19,
	"19": "RegistrationComplete",
	ExecuteActionsProgress: 20,
	"20": "ExecuteActionsProgress",
	ExecuteActionsComplete: 21,
	"21": "ExecuteActionsComplete"
});
/**
* Progress step identifiers for different phases of operations
* Values start at 100 to avoid conflicts with WorkerResponseType enum
* @enum {100 | 101 | 102 | 103 | 104 | 105 | 106 | 107}
*/
const ProgressStep = Object.freeze({
	Preparation: 100,
	"100": "Preparation",
	UserConfirmation: 101,
	"101": "UserConfirmation",
	ContractVerification: 102,
	"102": "ContractVerification",
	WebauthnAuthentication: 103,
	"103": "WebauthnAuthentication",
	AuthenticationComplete: 104,
	"104": "AuthenticationComplete",
	TransactionSigningProgress: 105,
	"105": "TransactionSigningProgress",
	TransactionSigningComplete: 106,
	"106": "TransactionSigningComplete",
	Error: 107,
	"107": "Error"
});
/**
* User verification policy for WebAuthn authenticators
* @enum {0 | 1 | 2}
*/
const UserVerificationPolicy$1 = Object.freeze({
	Required: 0,
	"0": "Required",
	Preferred: 1,
	"1": "Preferred",
	Discouraged: 2,
	"2": "Discouraged"
});
/**
* @enum {0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8}
*/
const WorkerRequestType = Object.freeze({
	DeriveNearKeypairAndEncrypt: 0,
	"0": "DeriveNearKeypairAndEncrypt",
	RecoverKeypairFromPasskey: 1,
	"1": "RecoverKeypairFromPasskey",
	CheckCanRegisterUser: 2,
	"2": "CheckCanRegisterUser",
	DecryptPrivateKeyWithPrf: 3,
	"3": "DecryptPrivateKeyWithPrf",
	SignTransactionsWithActions: 4,
	"4": "SignTransactionsWithActions",
	ExtractCosePublicKey: 5,
	"5": "ExtractCosePublicKey",
	SignTransactionWithKeyPair: 6,
	"6": "SignTransactionWithKeyPair",
	SignNep413Message: 7,
	"7": "SignNep413Message",
	SignVerifyAndRegisterUser: 8,
	"8": "SignVerifyAndRegisterUser"
});
/**
* Worker response types enum - corresponds to TypeScript WorkerResponseType
* @enum {0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21}
*/
const WorkerResponseType = Object.freeze({
	DeriveNearKeypairAndEncryptSuccess: 0,
	"0": "DeriveNearKeypairAndEncryptSuccess",
	RecoverKeypairFromPasskeySuccess: 1,
	"1": "RecoverKeypairFromPasskeySuccess",
	CheckCanRegisterUserSuccess: 2,
	"2": "CheckCanRegisterUserSuccess",
	DecryptPrivateKeyWithPrfSuccess: 3,
	"3": "DecryptPrivateKeyWithPrfSuccess",
	SignTransactionsWithActionsSuccess: 4,
	"4": "SignTransactionsWithActionsSuccess",
	ExtractCosePublicKeySuccess: 5,
	"5": "ExtractCosePublicKeySuccess",
	SignTransactionWithKeyPairSuccess: 6,
	"6": "SignTransactionWithKeyPairSuccess",
	SignNep413MessageSuccess: 7,
	"7": "SignNep413MessageSuccess",
	SignVerifyAndRegisterUserSuccess: 8,
	"8": "SignVerifyAndRegisterUserSuccess",
	DeriveNearKeypairAndEncryptFailure: 9,
	"9": "DeriveNearKeypairAndEncryptFailure",
	RecoverKeypairFromPasskeyFailure: 10,
	"10": "RecoverKeypairFromPasskeyFailure",
	CheckCanRegisterUserFailure: 11,
	"11": "CheckCanRegisterUserFailure",
	DecryptPrivateKeyWithPrfFailure: 12,
	"12": "DecryptPrivateKeyWithPrfFailure",
	SignTransactionsWithActionsFailure: 13,
	"13": "SignTransactionsWithActionsFailure",
	ExtractCosePublicKeyFailure: 14,
	"14": "ExtractCosePublicKeyFailure",
	SignTransactionWithKeyPairFailure: 15,
	"15": "SignTransactionWithKeyPairFailure",
	SignNep413MessageFailure: 16,
	"16": "SignNep413MessageFailure",
	SignVerifyAndRegisterUserFailure: 17,
	"17": "SignVerifyAndRegisterUserFailure",
	RegistrationProgress: 18,
	"18": "RegistrationProgress",
	RegistrationComplete: 19,
	"19": "RegistrationComplete",
	ExecuteActionsProgress: 20,
	"20": "ExecuteActionsProgress",
	ExecuteActionsComplete: 21,
	"21": "ExecuteActionsComplete"
});
const AuthenticationResponseFinalization = typeof FinalizationRegistry === "undefined" ? {
	register: () => {},
	unregister: () => {}
} : new FinalizationRegistry((ptr) => wasm.__wbg_authenticationresponse_free(ptr >>> 0, 1));
const AuthenticatorOptionsFinalization = typeof FinalizationRegistry === "undefined" ? {
	register: () => {},
	unregister: () => {}
} : new FinalizationRegistry((ptr) => wasm.__wbg_authenticatoroptions_free(ptr >>> 0, 1));
const CheckCanRegisterUserRequestFinalization = typeof FinalizationRegistry === "undefined" ? {
	register: () => {},
	unregister: () => {}
} : new FinalizationRegistry((ptr) => wasm.__wbg_checkcanregisteruserrequest_free(ptr >>> 0, 1));
const ClientExtensionResultsFinalization = typeof FinalizationRegistry === "undefined" ? {
	register: () => {},
	unregister: () => {}
} : new FinalizationRegistry((ptr) => wasm.__wbg_clientextensionresults_free(ptr >>> 0, 1));
const ConfirmationConfigFinalization = typeof FinalizationRegistry === "undefined" ? {
	register: () => {},
	unregister: () => {}
} : new FinalizationRegistry((ptr) => wasm.__wbg_confirmationconfig_free(ptr >>> 0, 1));
const CoseExtractionResultFinalization = typeof FinalizationRegistry === "undefined" ? {
	register: () => {},
	unregister: () => {}
} : new FinalizationRegistry((ptr) => wasm.__wbg_coseextractionresult_free(ptr >>> 0, 1));
const DecryptPrivateKeyRequestFinalization = typeof FinalizationRegistry === "undefined" ? {
	register: () => {},
	unregister: () => {}
} : new FinalizationRegistry((ptr) => wasm.__wbg_decryptprivatekeyrequest_free(ptr >>> 0, 1));
const DecryptPrivateKeyResultFinalization = typeof FinalizationRegistry === "undefined" ? {
	register: () => {},
	unregister: () => {}
} : new FinalizationRegistry((ptr) => wasm.__wbg_decryptprivatekeyresult_free(ptr >>> 0, 1));
const DecryptionFinalization = typeof FinalizationRegistry === "undefined" ? {
	register: () => {},
	unregister: () => {}
} : new FinalizationRegistry((ptr) => wasm.__wbg_decryption_free(ptr >>> 0, 1));
const DecryptionPayloadFinalization = typeof FinalizationRegistry === "undefined" ? {
	register: () => {},
	unregister: () => {}
} : new FinalizationRegistry((ptr) => wasm.__wbg_decryptionpayload_free(ptr >>> 0, 1));
const DeriveNearKeypairAndEncryptRequestFinalization = typeof FinalizationRegistry === "undefined" ? {
	register: () => {},
	unregister: () => {}
} : new FinalizationRegistry((ptr) => wasm.__wbg_derivenearkeypairandencryptrequest_free(ptr >>> 0, 1));
const DeriveNearKeypairAndEncryptResultFinalization = typeof FinalizationRegistry === "undefined" ? {
	register: () => {},
	unregister: () => {}
} : new FinalizationRegistry((ptr) => wasm.__wbg_derivenearkeypairandencryptresult_free(ptr >>> 0, 1));
const DualPrfOutputsStructFinalization = typeof FinalizationRegistry === "undefined" ? {
	register: () => {},
	unregister: () => {}
} : new FinalizationRegistry((ptr) => wasm.__wbg_dualprfoutputsstruct_free(ptr >>> 0, 1));
const ExtractCoseRequestFinalization = typeof FinalizationRegistry === "undefined" ? {
	register: () => {},
	unregister: () => {}
} : new FinalizationRegistry((ptr) => wasm.__wbg_extractcoserequest_free(ptr >>> 0, 1));
const KeyActionResultFinalization = typeof FinalizationRegistry === "undefined" ? {
	register: () => {},
	unregister: () => {}
} : new FinalizationRegistry((ptr) => wasm.__wbg_keyactionresult_free(ptr >>> 0, 1));
const LinkDeviceRegistrationTransactionFinalization = typeof FinalizationRegistry === "undefined" ? {
	register: () => {},
	unregister: () => {}
} : new FinalizationRegistry((ptr) => wasm.__wbg_linkdeviceregistrationtransaction_free(ptr >>> 0, 1));
const OriginPolicyInputFinalization = typeof FinalizationRegistry === "undefined" ? {
	register: () => {},
	unregister: () => {}
} : new FinalizationRegistry((ptr) => wasm.__wbg_originpolicyinput_free(ptr >>> 0, 1));
const PrfOutputsFinalization = typeof FinalizationRegistry === "undefined" ? {
	register: () => {},
	unregister: () => {}
} : new FinalizationRegistry((ptr) => wasm.__wbg_prfoutputs_free(ptr >>> 0, 1));
const PrfResultsFinalization = typeof FinalizationRegistry === "undefined" ? {
	register: () => {},
	unregister: () => {}
} : new FinalizationRegistry((ptr) => wasm.__wbg_prfresults_free(ptr >>> 0, 1));
const RecoverKeypairRequestFinalization = typeof FinalizationRegistry === "undefined" ? {
	register: () => {},
	unregister: () => {}
} : new FinalizationRegistry((ptr) => wasm.__wbg_recoverkeypairrequest_free(ptr >>> 0, 1));
const RecoverKeypairResultFinalization = typeof FinalizationRegistry === "undefined" ? {
	register: () => {},
	unregister: () => {}
} : new FinalizationRegistry((ptr) => wasm.__wbg_recoverkeypairresult_free(ptr >>> 0, 1));
const RegistrationCheckRequestFinalization = typeof FinalizationRegistry === "undefined" ? {
	register: () => {},
	unregister: () => {}
} : new FinalizationRegistry((ptr) => wasm.__wbg_registrationcheckrequest_free(ptr >>> 0, 1));
const RegistrationCheckResultFinalization = typeof FinalizationRegistry === "undefined" ? {
	register: () => {},
	unregister: () => {}
} : new FinalizationRegistry((ptr) => wasm.__wbg_registrationcheckresult_free(ptr >>> 0, 1));
const RegistrationInfoStructFinalization = typeof FinalizationRegistry === "undefined" ? {
	register: () => {},
	unregister: () => {}
} : new FinalizationRegistry((ptr) => wasm.__wbg_registrationinfostruct_free(ptr >>> 0, 1));
const RegistrationPayloadFinalization = typeof FinalizationRegistry === "undefined" ? {
	register: () => {},
	unregister: () => {}
} : new FinalizationRegistry((ptr) => wasm.__wbg_registrationpayload_free(ptr >>> 0, 1));
const RegistrationResponseFinalization = typeof FinalizationRegistry === "undefined" ? {
	register: () => {},
	unregister: () => {}
} : new FinalizationRegistry((ptr) => wasm.__wbg_registrationresponse_free(ptr >>> 0, 1));
const RegistrationResultFinalization = typeof FinalizationRegistry === "undefined" ? {
	register: () => {},
	unregister: () => {}
} : new FinalizationRegistry((ptr) => wasm.__wbg_registrationresult_free(ptr >>> 0, 1));
const RpcCallPayloadFinalization = typeof FinalizationRegistry === "undefined" ? {
	register: () => {},
	unregister: () => {}
} : new FinalizationRegistry((ptr) => wasm.__wbg_rpccallpayload_free(ptr >>> 0, 1));
const SerializedCredentialFinalization = typeof FinalizationRegistry === "undefined" ? {
	register: () => {},
	unregister: () => {}
} : new FinalizationRegistry((ptr) => wasm.__wbg_serializedcredential_free(ptr >>> 0, 1));
const SerializedRegistrationCredentialFinalization = typeof FinalizationRegistry === "undefined" ? {
	register: () => {},
	unregister: () => {}
} : new FinalizationRegistry((ptr) => wasm.__wbg_serializedregistrationcredential_free(ptr >>> 0, 1));
const SignNep413RequestFinalization = typeof FinalizationRegistry === "undefined" ? {
	register: () => {},
	unregister: () => {}
} : new FinalizationRegistry((ptr) => wasm.__wbg_signnep413request_free(ptr >>> 0, 1));
const SignNep413ResultFinalization = typeof FinalizationRegistry === "undefined" ? {
	register: () => {},
	unregister: () => {}
} : new FinalizationRegistry((ptr) => wasm.__wbg_signnep413result_free(ptr >>> 0, 1));
const SignTransactionWithKeyPairRequestFinalization = typeof FinalizationRegistry === "undefined" ? {
	register: () => {},
	unregister: () => {}
} : new FinalizationRegistry((ptr) => wasm.__wbg_signtransactionwithkeypairrequest_free(ptr >>> 0, 1));
const SignTransactionsWithActionsRequestFinalization = typeof FinalizationRegistry === "undefined" ? {
	register: () => {},
	unregister: () => {}
} : new FinalizationRegistry((ptr) => wasm.__wbg_signtransactionswithactionsrequest_free(ptr >>> 0, 1));
const SignVerifyAndRegisterUserRequestFinalization = typeof FinalizationRegistry === "undefined" ? {
	register: () => {},
	unregister: () => {}
} : new FinalizationRegistry((ptr) => wasm.__wbg_signverifyandregisteruserrequest_free(ptr >>> 0, 1));
const TransactionContextFinalization = typeof FinalizationRegistry === "undefined" ? {
	register: () => {},
	unregister: () => {}
} : new FinalizationRegistry((ptr) => wasm.__wbg_transactioncontext_free(ptr >>> 0, 1));
const TransactionPayloadFinalization = typeof FinalizationRegistry === "undefined" ? {
	register: () => {},
	unregister: () => {}
} : new FinalizationRegistry((ptr) => wasm.__wbg_transactionpayload_free(ptr >>> 0, 1));
const TransactionSignResultFinalization = typeof FinalizationRegistry === "undefined" ? {
	register: () => {},
	unregister: () => {}
} : new FinalizationRegistry((ptr) => wasm.__wbg_transactionsignresult_free(ptr >>> 0, 1));
const VerificationPayloadFinalization = typeof FinalizationRegistry === "undefined" ? {
	register: () => {},
	unregister: () => {}
} : new FinalizationRegistry((ptr) => wasm.__wbg_verificationpayload_free(ptr >>> 0, 1));
const VrfChallengeFinalization = typeof FinalizationRegistry === "undefined" ? {
	register: () => {},
	unregister: () => {}
} : new FinalizationRegistry((ptr) => wasm.__wbg_vrfchallenge_free(ptr >>> 0, 1));
const WasmPublicKeyFinalization = typeof FinalizationRegistry === "undefined" ? {
	register: () => {},
	unregister: () => {}
} : new FinalizationRegistry((ptr) => wasm.__wbg_wasmpublickey_free(ptr >>> 0, 1));
const WasmSignatureFinalization = typeof FinalizationRegistry === "undefined" ? {
	register: () => {},
	unregister: () => {}
} : new FinalizationRegistry((ptr) => wasm.__wbg_wasmsignature_free(ptr >>> 0, 1));
const WasmSignedTransactionFinalization = typeof FinalizationRegistry === "undefined" ? {
	register: () => {},
	unregister: () => {}
} : new FinalizationRegistry((ptr) => wasm.__wbg_wasmsignedtransaction_free(ptr >>> 0, 1));
const WasmTransactionFinalization = typeof FinalizationRegistry === "undefined" ? {
	register: () => {},
	unregister: () => {}
} : new FinalizationRegistry((ptr) => wasm.__wbg_wasmtransaction_free(ptr >>> 0, 1));
const WebAuthnAuthenticationCredentialStructFinalization = typeof FinalizationRegistry === "undefined" ? {
	register: () => {},
	unregister: () => {}
} : new FinalizationRegistry((ptr) => wasm.__wbg_webauthnauthenticationcredentialstruct_free(ptr >>> 0, 1));
const WebAuthnRegistrationCredentialStructFinalization = typeof FinalizationRegistry === "undefined" ? {
	register: () => {},
	unregister: () => {}
} : new FinalizationRegistry((ptr) => wasm.__wbg_webauthnregistrationcredentialstruct_free(ptr >>> 0, 1));
const WorkerProgressMessageFinalization = typeof FinalizationRegistry === "undefined" ? {
	register: () => {},
	unregister: () => {}
} : new FinalizationRegistry((ptr) => wasm.__wbg_workerprogressmessage_free(ptr >>> 0, 1));

//#endregion
//#region src/core/types/signer-worker.ts
const DEFAULT_CONFIRMATION_CONFIG = {
	uiMode: "modal",
	behavior: "autoProceed",
	autoProceedDelay: 1e3,
	theme: "dark"
};
function isWorkerProgress(response) {
	return response.type === WorkerResponseType.RegistrationProgress || response.type === WorkerResponseType.RegistrationComplete || response.type === WorkerResponseType.ExecuteActionsProgress || response.type === WorkerResponseType.ExecuteActionsComplete;
}
function isWorkerSuccess(response) {
	return response.type === WorkerResponseType.DeriveNearKeypairAndEncryptSuccess || response.type === WorkerResponseType.RecoverKeypairFromPasskeySuccess || response.type === WorkerResponseType.CheckCanRegisterUserSuccess || response.type === WorkerResponseType.DecryptPrivateKeyWithPrfSuccess || response.type === WorkerResponseType.SignTransactionsWithActionsSuccess || response.type === WorkerResponseType.ExtractCosePublicKeySuccess || response.type === WorkerResponseType.SignTransactionWithKeyPairSuccess || response.type === WorkerResponseType.SignNep413MessageSuccess || response.type === WorkerResponseType.SignVerifyAndRegisterUserSuccess;
}
function isWorkerError(response) {
	return response.type === WorkerResponseType.DeriveNearKeypairAndEncryptFailure || response.type === WorkerResponseType.RecoverKeypairFromPasskeyFailure || response.type === WorkerResponseType.CheckCanRegisterUserFailure || response.type === WorkerResponseType.DecryptPrivateKeyWithPrfFailure || response.type === WorkerResponseType.SignTransactionsWithActionsFailure || response.type === WorkerResponseType.ExtractCosePublicKeyFailure || response.type === WorkerResponseType.SignTransactionWithKeyPairFailure || response.type === WorkerResponseType.SignNep413MessageFailure || response.type === WorkerResponseType.SignVerifyAndRegisterUserFailure;
}
function isDeriveNearKeypairAndEncryptSuccess(response) {
	return response.type === WorkerResponseType.DeriveNearKeypairAndEncryptSuccess;
}
function isRecoverKeypairFromPasskeySuccess(response) {
	return response.type === WorkerResponseType.RecoverKeypairFromPasskeySuccess;
}
function isCheckCanRegisterUserSuccess(response) {
	return response.type === WorkerResponseType.CheckCanRegisterUserSuccess;
}
function isSignVerifyAndRegisterUserSuccess(response) {
	return response.type === WorkerResponseType.SignVerifyAndRegisterUserSuccess;
}
function isSignTransactionsWithActionsSuccess(response) {
	return response.type === WorkerResponseType.SignTransactionsWithActionsSuccess;
}
function isDecryptPrivateKeyWithPrfSuccess(response) {
	return response.type === WorkerResponseType.DecryptPrivateKeyWithPrfSuccess;
}
function isExtractCosePublicKeySuccess(response) {
	return response.type === WorkerResponseType.ExtractCosePublicKeySuccess;
}
function isSignNep413MessageSuccess(response) {
	return response.type === WorkerResponseType.SignNep413MessageSuccess;
}

//#endregion
//#region src/core/IndexedDBManager/passkeyClientDB.ts
const DB_CONFIG$1 = {
	dbName: "PasskeyClientDB",
	dbVersion: 11,
	userStore: "users",
	appStateStore: "appState",
	authenticatorStore: "authenticators"
};
var PasskeyClientDBManager = class {
	config;
	db = null;
	eventListeners = /* @__PURE__ */ new Set();
	constructor(config = DB_CONFIG$1) {
		this.config = config;
	}
	/**
	* Subscribe to IndexedDB change events
	*/
	onChange(listener) {
		this.eventListeners.add(listener);
		return () => {
			this.eventListeners.delete(listener);
		};
	}
	/**
	* Emit an event to all listeners
	*/
	emitEvent(event) {
		this.eventListeners.forEach((listener) => {
			try {
				listener(event);
			} catch (error) {
				console.warn("[IndexedDBManager]: Error in event listener:", error);
			}
		});
	}
	async getDB() {
		if (this.db) return this.db;
		this.db = await openDB(this.config.dbName, this.config.dbVersion, {
			upgrade(db, oldVersion) {
				if (!db.objectStoreNames.contains(DB_CONFIG$1.userStore)) {
					const userStore = db.createObjectStore(DB_CONFIG$1.userStore, { keyPath: ["nearAccountId", "deviceNumber"] });
					userStore.createIndex("nearAccountId", "nearAccountId", { unique: false });
				}
				if (!db.objectStoreNames.contains(DB_CONFIG$1.appStateStore)) db.createObjectStore(DB_CONFIG$1.appStateStore, { keyPath: "key" });
				if (!db.objectStoreNames.contains(DB_CONFIG$1.authenticatorStore)) {
					const authStore = db.createObjectStore(DB_CONFIG$1.authenticatorStore, { keyPath: [
						"nearAccountId",
						"deviceNumber",
						"credentialId"
					] });
					authStore.createIndex("nearAccountId", "nearAccountId", { unique: false });
				}
			},
			blocked() {
				console.warn("PasskeyClientDB connection is blocked.");
			},
			blocking() {
				console.warn("PasskeyClientDB connection is blocking another connection.");
			},
			terminated: () => {
				console.warn("PasskeyClientDB connection has been terminated.");
				this.db = null;
			}
		});
		return this.db;
	}
	async getAppState(key) {
		const db = await this.getDB();
		const result = await db.get(DB_CONFIG$1.appStateStore, key);
		return result?.value;
	}
	async setAppState(key, value) {
		const db = await this.getDB();
		const entry = {
			key,
			value
		};
		await db.put(DB_CONFIG$1.appStateStore, entry);
	}
	/**
	* Validate that a NEAR account ID is in the expected format
	* Supports both <username>.<relayerAccountId> and <username>.testnet formats
	*/
	validateNearAccountId(nearAccountId) {
		return validateNearAccountId(nearAccountId);
	}
	/**
	* Extract username from NEAR account ID
	*/
	extractUsername(nearAccountId) {
		const validation = validateNearAccountId(nearAccountId);
		if (!validation.valid) throw new Error(`Invalid NEAR account ID: ${validation.error}`);
		return nearAccountId.split(".")[0];
	}
	/**
	* Generate a NEAR account ID from a username and domain
	* @param username - The username to use for the account ID
	* @param domain - The domain to use for the account ID
	* @returns The generated NEAR account ID
	*/
	generateNearAccountId(username, domain) {
		const sanitizedName = username.toLowerCase().replace(/[^a-z0-9_\\-]/g, "").substring(0, 32);
		return `${sanitizedName}.${domain}`;
	}
	async getUser(nearAccountId) {
		if (!nearAccountId) return null;
		const validation = this.validateNearAccountId(nearAccountId);
		if (!validation.valid) {
			console.warn(`Invalid account ID format: ${nearAccountId}`);
			return null;
		}
		const db = await this.getDB();
		const accountId = toAccountId(nearAccountId);
		const index = db.transaction(DB_CONFIG$1.userStore).store.index("nearAccountId");
		const results = await index.getAll(accountId);
		return results.length > 0 ? results[0] : null;
	}
	/**
	* Get the current/last user
	* This is maintained via app state and updated whenever a user is stored or updated
	*/
	async getLastUser() {
		const lastUserState = await this.getAppState("lastUserAccountId");
		if (!lastUserState) return null;
		return this.getUser(lastUserState.accountId);
	}
	async hasPasskeyCredential(nearAccountId) {
		try {
			const authenticators = await this.getAuthenticatorsByUser(nearAccountId);
			return !!authenticators[0]?.credentialId;
		} catch (error) {
			console.warn("Error checking passkey credential:", error);
			return false;
		}
	}
	/**
	* Register a new user with the given NEAR account ID
	* @param nearAccountId - Full NEAR account ID (e.g., "username.testnet" or "username.relayer.testnet")
	* @param additionalData - Additional user data to store
	*/
	async registerUser(storeUserData) {
		const validation = this.validateNearAccountId(storeUserData.nearAccountId);
		if (!validation.valid) throw new Error(`Cannot register user with invalid account ID: ${validation.error}`);
		const now = Date.now();
		const userData = {
			nearAccountId: toAccountId(storeUserData.nearAccountId),
			deviceNumber: storeUserData.deviceNumber || 1,
			registeredAt: now,
			lastLogin: now,
			lastUpdated: now,
			clientNearPublicKey: storeUserData.clientNearPublicKey,
			passkeyCredential: storeUserData.passkeyCredential,
			preferences: {
				useRelayer: false,
				useNetwork: "testnet",
				confirmationConfig: {
					uiMode: "modal",
					behavior: "autoProceed",
					autoProceedDelay: 1e3,
					theme: "light"
				}
			},
			encryptedVrfKeypair: storeUserData.encryptedVrfKeypair,
			serverEncryptedVrfKeypair: storeUserData.serverEncryptedVrfKeypair
		};
		await this.storeUser(userData);
		return userData;
	}
	async updateUser(nearAccountId, updates) {
		const user = await this.getUser(nearAccountId);
		if (user) {
			const updatedUser = {
				...user,
				...updates,
				lastUpdated: Date.now()
			};
			await this.storeUser(updatedUser);
			this.emitEvent({
				type: "user-updated",
				accountId: nearAccountId,
				data: {
					updates,
					updatedUser
				}
			});
		}
	}
	async updateLastLogin(nearAccountId) {
		await this.updateUser(nearAccountId, { lastLogin: Date.now() });
	}
	/**
	* Set the last logged-in user
	* @param nearAccountId - The account ID of the user
	* @param deviceNumber - The device number (defaults to 1)
	*/
	async setLastUser(nearAccountId, deviceNumber = 1) {
		const lastUserState = {
			accountId: nearAccountId,
			deviceNumber
		};
		await this.setAppState("lastUserAccountId", lastUserState);
	}
	async updatePreferences(nearAccountId, preferences) {
		const user = await this.getUser(nearAccountId);
		if (user) {
			const updatedPreferences = {
				...user.preferences,
				...preferences
			};
			await this.updateUser(nearAccountId, { preferences: updatedPreferences });
			this.emitEvent({
				type: "preferences-updated",
				accountId: nearAccountId,
				data: { preferences: updatedPreferences }
			});
		}
	}
	async storeUser(userData) {
		const validation = this.validateNearAccountId(userData.nearAccountId);
		if (!validation.valid) throw new Error(`Cannot store user with invalid account ID: ${validation.error}`);
		const db = await this.getDB();
		await db.put(DB_CONFIG$1.userStore, userData);
		const lastUserState = {
			accountId: userData.nearAccountId,
			deviceNumber: userData.deviceNumber
		};
		await this.setAppState("lastUserAccountId", lastUserState);
	}
	/**
	* Store WebAuthn user data (compatibility with WebAuthnManager)
	* @param userData - User data with nearAccountId as primary identifier
	*/
	async storeWebAuthnUserData(userData) {
		if (userData.deviceNumber === void 0) console.warn("WARNING: deviceNumber is undefined in storeWebAuthnUserData, will default to 1");
		const validation = this.validateNearAccountId(userData.nearAccountId);
		if (!validation.valid) throw new Error(`Cannot store WebAuthn data for invalid account ID: ${validation.error}`);
		let existingUser = await this.getUser(userData.nearAccountId);
		if (!existingUser) {
			const deviceNumberToUse = userData.deviceNumber || 1;
			existingUser = await this.registerUser({
				nearAccountId: userData.nearAccountId,
				deviceNumber: deviceNumberToUse,
				clientNearPublicKey: userData.clientNearPublicKey,
				passkeyCredential: userData.passkeyCredential,
				encryptedVrfKeypair: userData.encryptedVrfKeypair,
				serverEncryptedVrfKeypair: userData.serverEncryptedVrfKeypair
			});
		}
		const finalDeviceNumber = userData.deviceNumber || existingUser.deviceNumber;
		await this.updateUser(userData.nearAccountId, {
			clientNearPublicKey: userData.clientNearPublicKey,
			encryptedVrfKeypair: userData.encryptedVrfKeypair,
			serverEncryptedVrfKeypair: userData.serverEncryptedVrfKeypair,
			deviceNumber: finalDeviceNumber,
			lastUpdated: userData.lastUpdated || Date.now()
		});
	}
	async getAllUsers() {
		const db = await this.getDB();
		return db.getAll(DB_CONFIG$1.userStore);
	}
	async deleteUser(nearAccountId) {
		const db = await this.getDB();
		await db.delete(DB_CONFIG$1.userStore, nearAccountId);
		await this.clearAuthenticatorsForUser(nearAccountId);
	}
	async clearAllUsers() {
		const db = await this.getDB();
		await db.clear(DB_CONFIG$1.userStore);
	}
	async clearAllAppState() {
		const db = await this.getDB();
		await db.clear(DB_CONFIG$1.appStateStore);
	}
	/**
	* Store authenticator data for a user
	*/
	async storeAuthenticator(authenticatorData) {
		const db = await this.getDB();
		await db.put(DB_CONFIG$1.authenticatorStore, authenticatorData);
	}
	/**
	* Get all authenticators for a user (optionally for a specific device)
	*/
	async getAuthenticatorsByUser(nearAccountId) {
		const db = await this.getDB();
		const tx = db.transaction(DB_CONFIG$1.authenticatorStore, "readonly");
		const store = tx.objectStore(DB_CONFIG$1.authenticatorStore);
		const accountId = toAccountId(nearAccountId);
		const index = store.index("nearAccountId");
		return await index.getAll(accountId);
	}
	/**
	* Get a specific authenticator by credential ID
	*/
	async getAuthenticatorByCredentialId(nearAccountId, credentialId) {
		const db = await this.getDB();
		const result = await db.get(DB_CONFIG$1.authenticatorStore, [nearAccountId, credentialId]);
		return result || null;
	}
	/**
	* Clear all authenticators for a user
	*/
	async clearAuthenticatorsForUser(nearAccountId) {
		const authenticators = await this.getAuthenticatorsByUser(nearAccountId);
		const db = await this.getDB();
		const tx = db.transaction(DB_CONFIG$1.authenticatorStore, "readwrite");
		const store = tx.objectStore(DB_CONFIG$1.authenticatorStore);
		for (const auth of authenticators) await store.delete([nearAccountId, auth.credentialId]);
	}
	/**
	* Sync authenticators from contract data
	*/
	async syncAuthenticatorsFromContract(nearAccountId, contractAuthenticators) {
		await this.clearAuthenticatorsForUser(nearAccountId);
		const syncedAt = (/* @__PURE__ */ new Date()).toISOString();
		for (const auth of contractAuthenticators) {
			const rawTransports = auth.transports || [];
			const validTransports = rawTransports.filter((transport) => transport !== void 0 && transport !== null && typeof transport === "string");
			const transports = validTransports.length > 0 ? validTransports : ["internal"];
			const clientAuth = {
				credentialId: auth.credentialId,
				credentialPublicKey: auth.credentialPublicKey,
				transports,
				name: auth.name,
				nearAccountId: toAccountId(nearAccountId),
				deviceNumber: auth.deviceNumber || 1,
				registered: auth.registered,
				syncedAt,
				vrfPublicKey: auth.vrfPublicKey
			};
			await this.storeAuthenticator(clientAuth);
		}
	}
	/**
	* Delete all authenticators for a user
	*/
	async deleteAllAuthenticatorsForUser(nearAccountId) {
		const authenticators = await this.getAuthenticatorsByUser(nearAccountId);
		if (authenticators.length === 0) {
			console.warn(`No authenticators found for user ${nearAccountId}`);
			return;
		}
		const db = await this.getDB();
		const tx = db.transaction(DB_CONFIG$1.authenticatorStore, "readwrite");
		const store = tx.objectStore(DB_CONFIG$1.authenticatorStore);
		for (const auth of authenticators) await store.delete([nearAccountId, auth.credentialId]);
		console.debug(`Deleted ${authenticators.length} authenticators for user ${nearAccountId}`);
	}
	/**
	* Get user's confirmation config from IndexedDB
	* @param nearAccountId - The user's account ID
	* @returns ConfirmationConfig or undefined
	*/
	async getConfirmationConfig(nearAccountId) {
		const user = await this.getUser(nearAccountId);
		return user?.preferences?.confirmationConfig || DEFAULT_CONFIRMATION_CONFIG;
	}
	/**
	* Get user's theme preference from IndexedDB
	* @param nearAccountId - The user's account ID
	* @returns 'dark' | 'light' | null
	*/
	async getTheme(nearAccountId) {
		const user = await this.getUser(nearAccountId);
		return user?.preferences?.confirmationConfig.theme || null;
	}
	/**
	* Set user's theme preference in IndexedDB
	* @param nearAccountId - The user's account ID
	* @param theme - The theme to set ('dark' | 'light')
	*/
	async setTheme(nearAccountId, theme) {
		const existingConfig = await this.getConfirmationConfig(nearAccountId);
		const confirmationConfig = {
			...existingConfig,
			theme
		};
		await this.updatePreferences(nearAccountId, { confirmationConfig });
	}
	/**
	* Get user's theme with fallback to 'dark'
	* @param nearAccountId - The user's account ID
	* @returns 'dark' | 'light'
	*/
	async getThemeOrDefault(nearAccountId) {
		const theme = await this.getTheme(nearAccountId);
		return theme || "dark";
	}
	/**
	* Toggle between dark and light theme for a user
	* @param nearAccountId - The user's account ID
	* @returns The new theme that was set
	*/
	async toggleTheme(nearAccountId) {
		const currentTheme = await this.getThemeOrDefault(nearAccountId);
		const newTheme = currentTheme === "dark" ? "light" : "dark";
		await this.setTheme(nearAccountId, newTheme);
		return newTheme;
	}
	/**
	* Atomic operation wrapper for multiple IndexedDB operations
	* Either all operations succeed or all are rolled back
	*/
	async atomicOperation(operation) {
		const db = await this.getDB();
		try {
			const result = await operation(db);
			return result;
		} catch (error) {
			console.error("Atomic operation failed:", error);
			throw error;
		}
	}
	/**
	* Complete rollback of user registration data
	* Deletes user, authenticators, and WebAuthn data atomically
	*/
	async rollbackUserRegistration(nearAccountId) {
		console.debug(`Rolling back registration data for ${nearAccountId}`);
		await this.atomicOperation(async (db) => {
			await this.deleteAllAuthenticatorsForUser(nearAccountId);
			await db.delete(DB_CONFIG$1.userStore, nearAccountId);
			const lastUserAccount = await this.getAppState("lastUserAccountId");
			if (lastUserAccount === nearAccountId) await this.setAppState("lastUserAccountId", null);
			console.debug(`Rolled back all registration data for ${nearAccountId}`);
			return true;
		});
	}
};

//#endregion
//#region src/core/IndexedDBManager/passkeyNearKeysDB.ts
const DB_CONFIG = {
	dbName: "PasskeyNearKeys",
	dbVersion: 1,
	storeName: "encryptedKeys",
	keyPath: "nearAccountId"
};
var PasskeyNearKeysDBManager = class {
	config;
	db = null;
	constructor(config = DB_CONFIG) {
		this.config = config;
	}
	/**
	* Get database connection, initializing if necessary
	*/
	async getDB() {
		if (this.db) return this.db;
		this.db = await openDB(this.config.dbName, this.config.dbVersion, {
			upgrade(db, oldVersion) {
				if (!db.objectStoreNames.contains(DB_CONFIG.storeName)) db.createObjectStore(DB_CONFIG.storeName, { keyPath: DB_CONFIG.keyPath });
			},
			blocked() {
				console.warn("PasskeyNearKeysDB connection is blocked.");
			},
			blocking() {
				console.warn("PasskeyNearKeysDB connection is blocking another connection.");
			},
			terminated: () => {
				console.warn("PasskeyNearKeysDB connection has been terminated.");
				this.db = null;
			}
		});
		return this.db;
	}
	/**
	* Store encrypted key data
	*/
	async storeEncryptedKey(data) {
		const db = await this.getDB();
		await db.put(this.config.storeName, data);
	}
	/**
	* Retrieve encrypted key data
	*/
	async getEncryptedKey(nearAccountId) {
		const db = await this.getDB();
		const result = await db.get(this.config.storeName, nearAccountId);
		if (!result?.encryptedData && nearAccountId !== "_init_check") console.warn("PasskeyNearKeysDB: getEncryptedKey - No result found");
		return result || null;
	}
	/**
	* Verify key storage by attempting retrieval
	*/
	async verifyKeyStorage(nearAccountId) {
		try {
			const retrievedKey = await this.getEncryptedKey(nearAccountId);
			return !!retrievedKey;
		} catch (error) {
			console.error("PasskeyNearKeysDB: verifyKeyStorage - Error:", error);
			return false;
		}
	}
	/**
	* Delete encrypted key data for a specific account
	*/
	async deleteEncryptedKey(nearAccountId) {
		const db = await this.getDB();
		await db.delete(this.config.storeName, nearAccountId);
		console.debug("PasskeyNearKeysDB: deleteEncryptedKey - Successfully deleted");
	}
	/**
	* Get all encrypted keys (for migration or debugging purposes)
	*/
	async getAllEncryptedKeys() {
		const db = await this.getDB();
		return await db.getAll(this.config.storeName);
	}
	/**
	* Check if a key exists for the given account
	*/
	async hasEncryptedKey(nearAccountId) {
		try {
			const keyData = await this.getEncryptedKey(nearAccountId);
			return !!keyData;
		} catch (error) {
			console.error("PasskeyNearKeysDB: hasEncryptedKey - Error:", error);
			return false;
		}
	}
};

//#endregion
//#region src/core/IndexedDBManager/index.ts
const passkeyClientDB = new PasskeyClientDBManager();
const passkeyNearKeysDB = new PasskeyNearKeysDBManager();
/**
* Unified IndexedDB interface providing access to both databases
* This allows centralized access while maintaining separation of concerns
*/
var UnifiedIndexedDBManager = class {
	clientDB;
	nearKeysDB;
	_initialized = false;
	constructor() {
		this.clientDB = passkeyClientDB;
		this.nearKeysDB = passkeyNearKeysDB;
	}
	/**
	* Initialize both databases proactively
	* This ensures both databases are created and ready for use
	*/
	async initialize() {
		if (this._initialized) return;
		try {
			await Promise.all([this.clientDB.getAppState("_init_check"), this.nearKeysDB.hasEncryptedKey("_init_check")]);
			this._initialized = true;
		} catch (error) {
			console.warn("Failed to initialize IndexedDB databases:", error);
		}
	}
	/**
	* Check if databases have been initialized
	*/
	get isInitialized() {
		return this._initialized;
	}
	/**
	* Get user data and check if they have encrypted NEAR keys
	*/
	async getUserWithKeys(nearAccountId) {
		const [userData, hasKeys, keyData] = await Promise.all([
			this.clientDB.getUser(nearAccountId),
			this.nearKeysDB.hasEncryptedKey(nearAccountId),
			this.nearKeysDB.getEncryptedKey(nearAccountId)
		]);
		return {
			userData,
			hasKeys,
			keyData: hasKeys ? keyData : void 0
		};
	}
};
const IndexedDBManager = new UnifiedIndexedDBManager();
IndexedDBManager.initialize().catch((error) => {
	console.warn("Failed to proactively initialize IndexedDB on module load:", error);
});

//#endregion
//#region src/core/types/vrf-worker.ts
/**
* Decode VRF output and use first 32 bytes as WebAuthn challenge
* @param vrfChallenge - VRF challenge object
* @returns 32-byte Uint8Array
*/
function outputAs32Bytes(vrfChallenge) {
	let vrfOutputBytes = base64UrlDecode(vrfChallenge.vrfOutput);
	return vrfOutputBytes.slice(0, 32);
}
/**
* Validate and create a VRFChallenge object
* @param vrfChallengeData - The challenge data to validate
* @returns VRFChallenge object
*/
function validateVRFChallenge(vrfChallengeData) {
	if (!vrfChallengeData.vrfInput || typeof vrfChallengeData.vrfInput !== "string") throw new Error("vrfInput must be a non-empty string");
	if (!vrfChallengeData.vrfOutput || typeof vrfChallengeData.vrfOutput !== "string") throw new Error("vrfOutput must be a non-empty string");
	if (!vrfChallengeData.vrfProof || typeof vrfChallengeData.vrfProof !== "string") throw new Error("vrfProof must be a non-empty string");
	if (!vrfChallengeData.vrfPublicKey || typeof vrfChallengeData.vrfPublicKey !== "string") throw new Error("vrfPublicKey must be a non-empty string");
	if (!vrfChallengeData.userId || typeof vrfChallengeData.userId !== "string") throw new Error("userId must be a non-empty string");
	if (!vrfChallengeData.rpId || typeof vrfChallengeData.rpId !== "string") throw new Error("rpId must be a non-empty string");
	if (!vrfChallengeData.blockHeight || typeof vrfChallengeData.blockHeight !== "string") throw new Error("blockHeight must be a non-empty string");
	if (!vrfChallengeData.blockHash || typeof vrfChallengeData.blockHash !== "string") throw new Error("blockHash must be a non-empty string");
	return {
		vrfInput: vrfChallengeData.vrfInput,
		vrfOutput: vrfChallengeData.vrfOutput,
		vrfProof: vrfChallengeData.vrfProof,
		vrfPublicKey: vrfChallengeData.vrfPublicKey,
		userId: vrfChallengeData.userId,
		rpId: vrfChallengeData.rpId,
		blockHeight: vrfChallengeData.blockHeight,
		blockHash: vrfChallengeData.blockHash
	};
}
/**
* Create a random VRF challenge
* @returns Partial<VRFChallenge> with vrfOutput set, but other fields are undefined
* This is used for local operations that don't require a VRF verification
*/
function createRandomVRFChallenge() {
	const challenge = crypto.getRandomValues(new Uint8Array(32));
	const vrfOutput = base64UrlEncode(challenge);
	return {
		vrfOutput,
		vrfInput: void 0,
		vrfProof: void 0,
		vrfPublicKey: void 0,
		userId: void 0,
		rpId: void 0,
		blockHeight: void 0,
		blockHash: void 0
	};
}

//#endregion
//#region src/core/WebAuthnManager/touchIdPrompt.ts
/**
* Generate ChaCha20Poly1305 salt using account-specific HKDF for encryption key derivation
* @param nearAccountId - NEAR account ID to scope the salt to
* @returns 32-byte Uint8Array salt for ChaCha20Poly1305 key derivation
*/
function generateChaCha20Salt(nearAccountId) {
	const saltString = `chacha20-salt:${nearAccountId}`;
	const salt = new Uint8Array(32);
	const saltBytes = new TextEncoder().encode(saltString);
	salt.set(saltBytes.slice(0, 32));
	return salt;
}
/**
* Generate Ed25519 salt using account-specific HKDF for signing key derivation
* @param nearAccountId - NEAR account ID to scope the salt to
* @returns 32-byte Uint8Array salt for Ed25519 key derivation
*/
function generateEd25519Salt(nearAccountId) {
	const saltString = `ed25519-salt:${nearAccountId}`;
	const salt = new Uint8Array(32);
	const saltBytes = new TextEncoder().encode(saltString);
	salt.set(saltBytes.slice(0, 32));
	return salt;
}
/**
* TouchIdPrompt prompts for touchID,
* creates credentials,
* manages WebAuthn touchID prompts,
* and generates credentials, and PRF Outputs
*/
var TouchIdPrompt = class {
	constructor() {}
	/**
	* Prompts for TouchID/biometric authentication and generates WebAuthn credentials with PRF output
	* @param nearAccountId - NEAR account ID to authenticate
	* @param challenge - VRF challenge bytes to use for WebAuthn authentication
	* @param authenticators - List of stored authenticator data for the user
	* @returns WebAuthn credential with PRF output (HKDF derivation done in WASM worker)
	* ```ts
	* const credential = await touchIdPrompt.getCredentials({
	*   nearAccountId,
	*   challenge,
	*   authenticators,
	* });
	* ```
	*/
	async getCredentials({ nearAccountId, challenge, authenticators }) {
		const credential = await navigator.credentials.get({ publicKey: {
			challenge: outputAs32Bytes(challenge),
			rpId: window.location.hostname,
			allowCredentials: authenticators.map((auth) => ({
				id: base64UrlDecode(auth.credentialId),
				type: "public-key",
				transports: auth.transports
			})),
			userVerification: "preferred",
			timeout: 6e4,
			extensions: { prf: { eval: {
				first: generateChaCha20Salt(nearAccountId),
				second: generateEd25519Salt(nearAccountId)
			} } }
		} });
		if (!credential) throw new Error("WebAuthn authentication failed or was cancelled");
		return credential;
	}
	/**
	* Simplified authentication for account recovery
	* Uses credential IDs from contract without needing full authenticator data
	* @param nearAccountId - NEAR account ID to authenticate
	* @param challenge - VRF challenge bytes
	* @param credentialIds - Array of credential IDs from contract lookup
	* @returns WebAuthn credential with PRF output
	*/
	async getCredentialsForRecovery({ nearAccountId, challenge, credentialIds }) {
		const credential = await navigator.credentials.get({ publicKey: {
			challenge: outputAs32Bytes(challenge),
			rpId: window.location.hostname,
			allowCredentials: credentialIds.map((credentialId) => ({
				id: base64UrlDecode(credentialId),
				type: "public-key",
				transports: [
					"internal",
					"hybrid",
					"usb",
					"ble"
				]
			})),
			userVerification: "preferred",
			timeout: 6e4,
			extensions: { prf: { eval: {
				first: generateChaCha20Salt(nearAccountId),
				second: generateEd25519Salt(nearAccountId)
			} } }
		} });
		if (!credential) throw new Error("WebAuthn authentication failed or was cancelled");
		return credential;
	}
	/**
	* Generate WebAuthn registration credentials for normal account registration
	* @param nearAccountId - NEAR account ID (used for both WebAuthn user ID and PRF salts)
	* @param challenge - Random challenge bytes for the registration ceremony
	* @returns Credential with PRF output
	*/
	async generateRegistrationCredentials({ nearAccountId, challenge }) {
		return this.generateRegistrationCredentialsInternal({
			nearAccountId,
			challenge
		});
	}
	/**
	* Generate WebAuthn registration credentials for device linking
	* @param nearAccountId - NEAR account ID for PRF salts (always base account like alice.testnet)
	* @param challenge - Random challenge bytes for the registration ceremony
	* @param deviceNumber - Device number for device-specific user ID
	* @returns Credential with PRF output
	*/
	async generateRegistrationCredentialsForLinkDevice({ nearAccountId, challenge, deviceNumber }) {
		return this.generateRegistrationCredentialsInternal({
			nearAccountId,
			challenge,
			deviceNumber
		});
	}
	/**
	* Internal method for generating WebAuthn registration credentials with PRF output
	* @param nearAccountId - NEAR account ID for PRF salts and keypair derivation (always base account)
	* @param challenge - Random challenge bytes for the registration ceremony
	* @param deviceNumber - Device number for device-specific user ID.
	* @returns Credential with PRF output
	*/
	async generateRegistrationCredentialsInternal({ nearAccountId, challenge, deviceNumber }) {
		const credential = await navigator.credentials.create({ publicKey: {
			challenge: outputAs32Bytes(challenge),
			rp: {
				name: "WebAuthn VRF Passkey",
				id: window.location.hostname
			},
			user: {
				id: new TextEncoder().encode(generateDeviceSpecificUserId(nearAccountId, deviceNumber)),
				name: generateDeviceSpecificUserId(nearAccountId, deviceNumber),
				displayName: generateUserFriendlyDisplayName(nearAccountId, deviceNumber)
			},
			pubKeyCredParams: [{
				alg: -7,
				type: "public-key"
			}, {
				alg: -257,
				type: "public-key"
			}],
			authenticatorSelection: {
				residentKey: "required",
				userVerification: "preferred"
			},
			timeout: 6e4,
			attestation: "none",
			extensions: { prf: { eval: {
				first: generateChaCha20Salt(nearAccountId),
				second: generateEd25519Salt(nearAccountId)
			} } }
		} });
		return credential;
	}
};
/**
* Generate device-specific user ID to prevent Chrome sync conflicts
* Creates technical identifiers with full account context
*
* @param nearAccountId - The NEAR account ID (e.g., "serp120.web3-authn-v5.testnet")
* @param deviceNumber - The device number (optional, undefined for device 1, 2 for device 2, etc.)
* @returns Technical identifier:
*   - Device 1: "serp120.web3-authn.testnet"
*   - Device 2: "serp120.web3-authn.testnet (2)"
*   - Device 3: "serp120.web3-authn.testnet (3)"
*/
function generateDeviceSpecificUserId(nearAccountId, deviceNumber) {
	if (deviceNumber === void 0 || deviceNumber === 1) return nearAccountId;
	return `${nearAccountId} (${deviceNumber})`;
}
/**
* Generate user-friendly display name for passkey manager UI
* Creates clean, intuitive names that users will see
*
* @param nearAccountId - The NEAR account ID (e.g., "serp120.web3-authn-v5.testnet")
* @param deviceNumber - The device number (optional, undefined for device 1, 2 for device 2, etc.)
* @returns User-friendly display name:
*   - Device 1: "serp120"
*   - Device 2: "serp120 (device 2)"
*   - Device 3: "serp120 (device 3)"
*/
function generateUserFriendlyDisplayName(nearAccountId, deviceNumber) {
	const baseUsername = nearAccountId.split(".")[0];
	if (deviceNumber === void 0 || deviceNumber === 1) return baseUsername;
	return `${baseUsername} (device ${deviceNumber})`;
}

//#endregion
//#region build-paths.ts
const BUILD_PATHS = {
	BUILD: {
		ROOT: "dist",
		WORKERS: "dist/workers",
		ESM: "dist/esm",
		CJS: "dist/cjs",
		TYPES: "dist/types"
	},
	SOURCE: {
		ROOT: "src",
		CORE: "src/core",
		WASM_SIGNER: "src/wasm_signer_worker",
		WASM_VRF: "src/wasm_vrf_worker",
		CRITICAL_DIRS: [
			"src/core",
			"src/wasm_signer_worker",
			"src/wasm_vrf_worker"
		]
	},
	FRONTEND: {
		ROOT: "../../frontend/public",
		SDK: "../../frontend/public/sdk",
		WORKERS: "../../frontend/public/sdk/workers"
	},
	RUNTIME: {
		SDK_BASE: "/sdk",
		WORKERS_BASE: "/sdk/workers",
		VRF_WORKER: "/sdk/workers/web3authn-vrf.worker.js",
		SIGNER_WORKER: "/sdk/workers/web3authn-signer.worker.js"
	},
	WORKERS: {
		VRF: "web3authn-vrf.worker.js",
		SIGNER: "web3authn-signer.worker.js",
		WASM_VRF_JS: "wasm_vrf_worker.js",
		WASM_VRF_WASM: "wasm_vrf_worker_bg.wasm",
		WASM_SIGNER_JS: "wasm_signer_worker.js",
		WASM_SIGNER_WASM: "wasm_signer_worker_bg.wasm"
	},
	TEST_WORKERS: {
		VRF: "/sdk/workers/web3authn-vrf.worker.js",
		SIGNER: "/sdk/workers/web3authn-signer.worker.js",
		WASM_VRF_JS: "/sdk/workers/wasm_vrf_worker.js",
		WASM_VRF_WASM: "/sdk/workers/wasm_vrf_worker_bg.wasm",
		WASM_SIGNER_JS: "/sdk/workers/wasm_signer_worker.js",
		WASM_SIGNER_WASM: "/sdk/workers/wasm_signer_worker_bg.wasm"
	}
};

//#endregion
//#region src/config.ts
const SIGNER_WORKER_MANAGER_CONFIG = {
	TIMEOUTS: {
		DEFAULT: 3e4,
		TRANSACTION: 3e4,
		REGISTRATION: 3e4
	},
	WORKER: {
		URL: BUILD_PATHS.RUNTIME.SIGNER_WORKER,
		TYPE: "module",
		NAME: "Web3AuthnSignerWorker"
	},
	RETRY: {
		MAX_ATTEMPTS: 3,
		BACKOFF_MS: 1e3
	}
};
const DEVICE_LINKING_CONFIG = {
	TIMEOUTS: {
		QR_CODE_MAX_AGE_MS: 900 * 1e3,
		SESSION_EXPIRATION_MS: 900 * 1e3,
		TEMP_KEY_CLEANUP_MS: 900 * 1e3,
		POLLING_INTERVAL_MS: 3e3,
		REGISTRATION_RETRY_DELAY_MS: 2e3
	},
	RETRY: { MAX_REGISTRATION_ATTEMPTS: 5 }
};

//#endregion
//#region src/core/types/authenticatorOptions.ts
/**
* User verification policy for WebAuthn authenticators
*
* @example
* ```typescript
* // Require user verification (PIN, fingerprint, etc.)
* UserVerificationPolicy.Required
*
* // Prefer user verification but don't require it
* UserVerificationPolicy.Preferred
*
* // Discourage user verification (for performance)
* UserVerificationPolicy.Discouraged
* ```
*/
let UserVerificationPolicy = /* @__PURE__ */ function(UserVerificationPolicy$2) {
	UserVerificationPolicy$2["Required"] = "required";
	UserVerificationPolicy$2["Preferred"] = "preferred";
	UserVerificationPolicy$2["Discouraged"] = "discouraged";
	return UserVerificationPolicy$2;
}({});
const toEnumUserVerificationPolicy = (userVerification) => {
	switch (userVerification) {
		case UserVerificationPolicy.Required: return UserVerificationPolicy$1.Required;
		case UserVerificationPolicy.Preferred: return UserVerificationPolicy$1.Preferred;
		case UserVerificationPolicy.Discouraged: return UserVerificationPolicy$1.Discouraged;
		default: return UserVerificationPolicy$1.Preferred;
	}
};
/**
* Default authenticator options (matches contract defaults)
*/
const DEFAULT_AUTHENTICATOR_OPTIONS = {
	userVerification: UserVerificationPolicy.Preferred,
	originPolicy: {
		single: void 0,
		all_subdomains: true,
		multiple: void 0
	}
};

//#endregion
//#region src/core/WebAuthnManager/credentialsHelpers.ts
/**
* Extract PRF outputs from WebAuthn credential extension results
* ENCODING: Uses base64url for WASM compatibility
* @param credential - WebAuthn credential with dual PRF extension results
* @param firstPrfOutput - Whether to include the first PRF output (default: true)
* @param secondPrfOutput - Whether to include the second PRF output (default: false)
* @returns PRF outputs
*/
function extractPrfFromCredential({ credential, firstPrfOutput = true, secondPrfOutput = false }) {
	const extensionResults = credential.getClientExtensionResults();
	const prfResults = extensionResults?.prf?.results;
	if (!prfResults) throw new Error("Missing PRF results from credential, use a PRF-enabled Authenticator");
	const first = firstPrfOutput ? prfResults?.first ? base64UrlEncode(prfResults.first) : void 0 : void 0;
	const second = secondPrfOutput ? prfResults?.second ? base64UrlEncode(prfResults.second) : void 0 : void 0;
	return {
		chacha20PrfOutput: first,
		ed25519PrfOutput: second
	};
}
/**
* Serialize PublicKeyCredential for both authentication and registration for WASM worker
* - Uses base64url encoding for WASM compatibility
*
* @returns SerializableCredential - The serialized credential
* - DOES NOT return PRF outputs
*/
function serializeRegistrationCredential(credential) {
	const response = credential.response;
	return {
		id: credential.id,
		rawId: base64UrlEncode(credential.rawId),
		type: credential.type,
		authenticatorAttachment: credential.authenticatorAttachment ?? void 0,
		response: {
			clientDataJSON: base64UrlEncode(response.clientDataJSON),
			attestationObject: base64UrlEncode(response.attestationObject),
			transports: response.getTransports() || []
		},
		clientExtensionResults: { prf: { results: {
			first: void 0,
			second: void 0
		} } }
	};
}
function serializeAuthenticationCredential(credential) {
	const response = credential.response;
	return {
		id: credential.id,
		rawId: base64UrlEncode(credential.rawId),
		type: credential.type,
		authenticatorAttachment: credential.authenticatorAttachment ?? void 0,
		response: {
			clientDataJSON: base64UrlEncode(response.clientDataJSON),
			authenticatorData: base64UrlEncode(response.authenticatorData),
			signature: base64UrlEncode(response.signature),
			userHandle: response.userHandle ? base64UrlEncode(response.userHandle) : void 0
		},
		clientExtensionResults: { prf: { results: {
			first: void 0,
			second: void 0
		} } }
	};
}
/**
* Serialize PublicKeyCredential for both authentication and registration for WASM worker
* @returns SerializableCredential - The serialized credential
* - INCLUDES PRF outputs
*/
function serializeRegistrationCredentialWithPRF({ credential, firstPrfOutput = true, secondPrfOutput = true }) {
	const base = serializeRegistrationCredential(credential);
	const { chacha20PrfOutput, ed25519PrfOutput } = extractPrfFromCredential({
		credential,
		firstPrfOutput,
		secondPrfOutput
	});
	return {
		...base,
		clientExtensionResults: { prf: { results: {
			first: chacha20PrfOutput,
			second: ed25519PrfOutput
		} } }
	};
}
function serializeAuthenticationCredentialWithPRF({ credential, firstPrfOutput = true, secondPrfOutput = false }) {
	const base = serializeAuthenticationCredential(credential);
	const { chacha20PrfOutput, ed25519PrfOutput } = extractPrfFromCredential({
		credential,
		firstPrfOutput,
		secondPrfOutput
	});
	return {
		...base,
		clientExtensionResults: { prf: { results: {
			first: chacha20PrfOutput,
			second: ed25519PrfOutput
		} } }
	};
}

//#endregion
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
//#region src/core/types/rpc.ts
const DEFAULT_WAIT_STATUS = {
	executeAction: "EXECUTED_OPTIMISTIC",
	linkDeviceAddKey: "INCLUDED_FINAL",
	linkDeviceSwapKey: "FINAL",
	linkDeviceAccountMapping: "INCLUDED_FINAL",
	linkDeviceDeleteKey: "INCLUDED_FINAL"
};

//#endregion
//#region src/core/NearClient.ts
let RpcCallType = /* @__PURE__ */ function(RpcCallType$1) {
	RpcCallType$1["Query"] = "query";
	RpcCallType$1["View"] = "view";
	RpcCallType$1["Send"] = "send_tx";
	RpcCallType$1["Block"] = "block";
	RpcCallType$1["Call"] = "call_function";
	return RpcCallType$1;
}({});
var SignedTransaction = class {
	transaction;
	signature;
	borsh_bytes;
	constructor(data) {
		this.transaction = data.transaction;
		this.signature = data.signature;
		this.borsh_bytes = data.borsh_bytes;
	}
	encode() {
		return new Uint8Array(this.borsh_bytes).buffer;
	}
	base64Encode() {
		return base64Encode(this.encode());
	}
	static decode(bytes) {
		throw new Error("SignedTransaction.decode(): borsh deserialization not implemented");
	}
};
var MinimalNearClient = class {
	rpcUrl;
	constructor(rpcUrl) {
		this.rpcUrl = rpcUrl;
	}
	/**
	* Execute RPC call with proper error handling and result extraction
	*/
	async makeRpcCall(method, params, operationName) {
		const body = {
			jsonrpc: "2.0",
			id: crypto.randomUUID(),
			method,
			params
		};
		const response = await fetch(this.rpcUrl, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body)
		}).catch((e) => {
			console.error(e);
			throw new Error(e);
		});
		if (!response.ok) throw new Error(`RPC request failed: ${response.status} ${response.statusText}`);
		const responseText = await response.text();
		if (!responseText?.trim()) throw new Error("Empty response from RPC server");
		const result = JSON.parse(responseText);
		if (result.error) throw result.error;
		if (result.result?.error) throw new Error(`${operationName} Error: ${result.result.error}`);
		return result.result;
	}
	async query(params) {
		return this.makeRpcCall(RpcCallType.Query, params, "Query");
	}
	async viewAccessKey(accountId, publicKey, finalityQuery) {
		const publicKeyStr = typeof publicKey === "string" ? publicKey : publicKey.toString();
		const finality = finalityQuery?.finality || "final";
		const params = {
			request_type: "view_access_key",
			finality,
			account_id: accountId,
			public_key: publicKeyStr
		};
		return this.makeRpcCall(RpcCallType.Query, params, "View Access Key");
	}
	async viewAccessKeyList(accountId, finalityQuery) {
		const finality = finalityQuery?.finality || "final";
		const params = {
			request_type: "view_access_key_list",
			finality,
			account_id: accountId
		};
		return this.makeRpcCall(RpcCallType.Query, params, "View Access Key List");
	}
	async viewAccount(accountId) {
		const params = {
			request_type: "view_account",
			finality: "final",
			account_id: accountId
		};
		return this.makeRpcCall(RpcCallType.Query, params, "View Account");
	}
	async viewBlock(params) {
		return this.makeRpcCall(RpcCallType.Block, params, "View Block");
	}
	async sendTransaction(signedTransaction, waitUntil = DEFAULT_WAIT_STATUS.executeAction) {
		return await this.makeRpcCall(RpcCallType.Send, {
			signed_tx_base64: signedTransaction.base64Encode(),
			wait_until: waitUntil
		}, "Send Transaction");
	}
	async callFunction(contractId, method, args, blockQuery) {
		const rpcParams = {
			request_type: "call_function",
			finality: "final",
			account_id: contractId,
			method_name: method,
			args_base64: base64Encode(new TextEncoder().encode(JSON.stringify(args)).buffer)
		};
		const result = await this.makeRpcCall(RpcCallType.Query, rpcParams, "View Function");
		const resultBytes = result.result;
		if (!Array.isArray(resultBytes)) return result;
		const resultString = String.fromCharCode(...resultBytes);
		if (!resultString.trim()) return null;
		try {
			const parsed = JSON.parse(resultString);
			return parsed;
		} catch (parseError) {
			console.warn("Failed to parse result as JSON, returning as string:", parseError);
			console.warn("Raw result string:", resultString);
			const cleanString = resultString.replace(/^"|"$/g, "");
			return cleanString;
		}
	}
	async view(params) {
		return this.callFunction(params.account, params.method, params.args);
	}
	async getAccessKeys({ account, block_id }) {
		const params = {
			request_type: "view_access_key_list",
			account_id: account,
			finality: "final"
		};
		if (block_id) {
			params.block_id = block_id;
			delete params.finality;
		}
		const accessKeyList = await this.makeRpcCall(RpcCallType.Query, params, "View Access Key List");
		const fullAccessKeys = [];
		const functionCallAccessKeys = [];
		for (const key of accessKeyList.keys) if (key.access_key.permission === "FullAccess") fullAccessKeys.push(key);
		else if (key.access_key.permission && typeof key.access_key.permission === "object" && "FunctionCall" in key.access_key.permission) functionCallAccessKeys.push(key);
		return {
			fullAccessKeys,
			functionCallAccessKeys
		};
	}
};

//#endregion
//#region src/core/WebAuthnManager/SignerWorkerManager/handlers/deriveNearKeypairAndEncrypt.ts
/**
* Secure registration flow with dual PRF: WebAuthn + WASM worker encryption using dual PRF
* Optionally signs a link_device_register_user transaction if VRF data is provided
*/
async function deriveNearKeypairAndEncrypt({ ctx, credential, nearAccountId, options }) {
	try {
		console.info("WebAuthnManager: Starting secure registration with dual PRF using deterministic derivation");
		const registrationCredential = serializeRegistrationCredentialWithPRF({
			credential,
			firstPrfOutput: true,
			secondPrfOutput: true
		});
		if (!registrationCredential.clientExtensionResults?.prf?.results?.first) throw new Error("First PRF output missing from serialized credential");
		if (!registrationCredential.clientExtensionResults?.prf?.results?.second) throw new Error("Second PRF output missing from serialized credential");
		const dualPrfOutputs = {
			chacha20PrfOutput: registrationCredential.clientExtensionResults.prf.results.first,
			ed25519PrfOutput: registrationCredential.clientExtensionResults.prf.results.second
		};
		const response = await ctx.sendMessage({ message: {
			type: WorkerRequestType.DeriveNearKeypairAndEncrypt,
			payload: {
				dualPrfOutputs,
				nearAccountId,
				credential: registrationCredential,
				registrationTransaction: options?.vrfChallenge && options?.contractId && options?.nonce && options?.blockHash ? {
					vrfChallenge: options.vrfChallenge,
					contractId: options.contractId,
					nonce: options.nonce,
					blockHash: options.blockHash,
					deterministicVrfPublicKey: options.deterministicVrfPublicKey
				} : void 0,
				authenticatorOptions: {
					userVerification: toEnumUserVerificationPolicy(options?.authenticatorOptions?.userVerification),
					originPolicy: options?.authenticatorOptions?.originPolicy
				}
			}
		} });
		if (!isDeriveNearKeypairAndEncryptSuccess(response)) throw new Error("Dual PRF registration failed");
		const wasmResult = response.payload;
		const keyData = {
			nearAccountId,
			encryptedData: wasmResult.encryptedData,
			iv: wasmResult.iv,
			timestamp: Date.now()
		};
		await ctx.indexedDB.nearKeysDB.storeEncryptedKey(keyData);
		const verified = await ctx.indexedDB.nearKeysDB.verifyKeyStorage(nearAccountId);
		if (!verified) throw new Error("Key storage verification failed");
		console.info("WebAuthnManager: Encrypted key stored and verified in IndexedDB");
		let signedTransaction = void 0;
		if (wasmResult.signedTransaction) signedTransaction = new SignedTransaction({
			transaction: wasmResult.signedTransaction.transaction,
			signature: wasmResult.signedTransaction.signature,
			borsh_bytes: Array.from(wasmResult.signedTransaction.borshBytes || [])
		});
		return {
			success: true,
			nearAccountId: toAccountId(wasmResult.nearAccountId),
			publicKey: wasmResult.publicKey,
			signedTransaction
		};
	} catch (error) {
		console.error("WebAuthnManager: Dual PRF registration error:", error);
		return {
			success: false,
			nearAccountId,
			publicKey: ""
		};
	}
}

//#endregion
//#region src/core/WebAuthnManager/SignerWorkerManager/handlers/decryptPrivateKeyWithPrf.ts
async function decryptPrivateKeyWithPrf({ ctx, nearAccountId, authenticators }) {
	try {
		console.info("WebAuthnManager: Starting private key decryption with dual PRF (local operation)");
		const encryptedKeyData = await ctx.indexedDB.nearKeysDB.getEncryptedKey(nearAccountId);
		if (!encryptedKeyData) throw new Error(`No encrypted key found for account: ${nearAccountId}`);
		const challenge = createRandomVRFChallenge();
		const credential = await ctx.touchIdPrompt.getCredentials({
			nearAccountId,
			challenge,
			authenticators
		});
		const dualPrfOutputs = extractPrfFromCredential({
			credential,
			firstPrfOutput: true,
			secondPrfOutput: false
		});
		console.debug("WebAuthnManager: Extracted ChaCha20 PRF output for decryption");
		const response = await ctx.sendMessage({ message: {
			type: WorkerRequestType.DecryptPrivateKeyWithPrf,
			payload: {
				nearAccountId,
				chacha20PrfOutput: dualPrfOutputs.chacha20PrfOutput,
				encryptedPrivateKeyData: encryptedKeyData.encryptedData,
				encryptedPrivateKeyIv: encryptedKeyData.iv
			}
		} });
		if (!isDecryptPrivateKeyWithPrfSuccess(response)) {
			console.error("WebAuthnManager: Dual PRF private key decryption failed:", response);
			throw new Error("Private key decryption failed");
		}
		return {
			decryptedPrivateKey: response.payload.privateKey,
			nearAccountId: toAccountId(response.payload.nearAccountId)
		};
	} catch (error) {
		console.error("WebAuthnManager: Dual PRF private key decryption error:", error);
		throw error;
	}
}

//#endregion
//#region src/core/WebAuthnManager/SignerWorkerManager/handlers/signVerifyAndRegisterUser.ts
async function signVerifyAndRegisterUser({ ctx, vrfChallenge, contractId, deterministicVrfPublicKey, nearAccountId, nearPublicKeyStr, nearClient: nearClient$1, nearRpcUrl, deviceNumber = 1, authenticatorOptions, onEvent }) {
	try {
		console.info("WebAuthnManager: Starting on-chain user registration with transaction");
		if (!nearPublicKeyStr) throw new Error("Client NEAR public key not provided - cannot get access key nonce");
		console.debug("WebAuthnManager: Retrieving encrypted key from IndexedDB for account:", nearAccountId);
		const encryptedKeyData = await ctx.indexedDB.nearKeysDB.getEncryptedKey(nearAccountId);
		if (!encryptedKeyData) throw new Error(`No encrypted key found for account: ${nearAccountId}`);
		const { accessKeyInfo, nextNonce, txBlockHash, txBlockHeight } = await ctx.nonceManager.getNonceBlockHashAndHeight(nearClient$1);
		const response = await ctx.sendMessage({
			message: {
				type: WorkerRequestType.SignVerifyAndRegisterUser,
				payload: {
					verification: {
						contractId,
						nearRpcUrl,
						vrfChallenge
					},
					decryption: {
						encryptedPrivateKeyData: encryptedKeyData.encryptedData,
						encryptedPrivateKeyIv: encryptedKeyData.iv
					},
					registration: {
						nearAccountId,
						nonce: nextNonce,
						blockHash: txBlockHash,
						deterministicVrfPublicKey,
						deviceNumber,
						authenticatorOptions: authenticatorOptions ? {
							userVerification: toEnumUserVerificationPolicy(authenticatorOptions.userVerification),
							originPolicy: authenticatorOptions.originPolicy
						} : void 0
					}
				}
			},
			onEvent,
			timeoutMs: SIGNER_WORKER_MANAGER_CONFIG.TIMEOUTS.REGISTRATION
		});
		if (isSignVerifyAndRegisterUserSuccess(response)) {
			console.debug("WebAuthnManager: On-chain user registration transaction successful");
			const wasmResult = response.payload;
			return {
				verified: wasmResult.verified,
				registrationInfo: wasmResult.registrationInfo,
				logs: wasmResult.logs,
				signedTransaction: new SignedTransaction({
					transaction: wasmResult.signedTransaction.transaction,
					signature: wasmResult.signedTransaction.signature,
					borsh_bytes: Array.from(wasmResult.signedTransaction.borshBytes || [])
				}),
				preSignedDeleteTransaction: wasmResult.preSignedDeleteTransaction ? new SignedTransaction({
					transaction: wasmResult.preSignedDeleteTransaction.transaction,
					signature: wasmResult.preSignedDeleteTransaction.signature,
					borsh_bytes: Array.from(wasmResult.preSignedDeleteTransaction.borshBytes || [])
				}) : null
			};
		} else {
			console.error("WebAuthnManager: On-chain user registration transaction failed:", response);
			throw new Error("On-chain user registration transaction failed");
		}
	} catch (error) {
		console.error("WebAuthnManager: On-chain user registration error:", error);
		throw error;
	}
}

//#endregion
//#region src/core/WebAuthnManager/SignerWorkerManager/handlers/signTransactionsWithActions.ts
/**
* Sign multiple transactions with shared VRF challenge and credential
* Efficiently processes multiple transactions with one PRF authentication
*/
async function signTransactionsWithActions({ ctx, transactions, rpcCall, onEvent, confirmationConfigOverride }) {
	try {
		console.info(`WebAuthnManager: Starting batch transaction signing for ${transactions.length} transactions`);
		if (transactions.length === 0) throw new Error("No transactions provided for batch signing");
		const nearAccountId = rpcCall.nearAccountId;
		transactions.forEach((txPayload, txIndex) => {
			txPayload.actions.forEach((action, actionIndex) => {
				try {
					validateActionArgsWasm(action);
				} catch (error) {
					throw new Error(`Transaction ${txIndex}, Action ${actionIndex} validation failed: ${error instanceof Error ? error.message : "Unknown error"}`);
				}
			});
		});
		console.debug("WebAuthnManager: Retrieving encrypted key from IndexedDB for account:", nearAccountId);
		const encryptedKeyData = await ctx.indexedDB.nearKeysDB.getEncryptedKey(nearAccountId);
		if (!encryptedKeyData) throw new Error(`No encrypted key found for account: ${nearAccountId}`);
		const txSigningRequests = transactions.map((tx) => ({
			nearAccountId: rpcCall.nearAccountId,
			receiverId: tx.receiverId,
			actions: JSON.stringify(tx.actions)
		}));
		const confirmationConfig = confirmationConfigOverride || ctx.userPreferencesManager.getConfirmationConfig();
		const response = await ctx.sendMessage({
			message: {
				type: WorkerRequestType.SignTransactionsWithActions,
				payload: {
					rpcCall,
					decryption: {
						encryptedPrivateKeyData: encryptedKeyData.encryptedData,
						encryptedPrivateKeyIv: encryptedKeyData.iv
					},
					txSigningRequests,
					confirmationConfig
				}
			},
			onEvent
		});
		if (!isSignTransactionsWithActionsSuccess(response)) {
			console.error("WebAuthnManager: Batch transaction signing failed:", response);
			throw new Error("Batch transaction signing failed");
		}
		if (!response.payload.success) throw new Error(response.payload.error || "Batch transaction signing failed");
		const signedTransactions = response.payload.signedTransactions || [];
		if (signedTransactions.length !== transactions.length) throw new Error(`Expected ${transactions.length} signed transactions but received ${signedTransactions.length}`);
		const results = signedTransactions.map((signedTx, index) => {
			if (!signedTx || !signedTx.transaction || !signedTx.signature) throw new Error(`Incomplete signed transaction data received for transaction ${index + 1}`);
			return {
				signedTransaction: new SignedTransaction({
					transaction: signedTx.transaction,
					signature: signedTx.signature,
					borsh_bytes: Array.from(signedTx.borshBytes || [])
				}),
				nearAccountId: toAccountId(nearAccountId),
				logs: response.payload.logs
			};
		});
		return results;
	} catch (error) {
		console.error("WebAuthnManager: Batch transaction signing error:", error);
		throw error;
	}
}

//#endregion
//#region src/core/WebAuthnManager/SignerWorkerManager/handlers/recoverKeypairFromPasskey.ts
/**
* Recover keypair from authentication credential for account recovery
* Uses dual PRF-based Ed25519 key derivation with account-specific HKDF and AES encryption
*/
async function recoverKeypairFromPasskey({ ctx, credential, accountIdHint }) {
	try {
		console.info("SignerWorkerManager: Starting dual PRF-based keypair recovery from authentication credential");
		const authenticationCredential = serializeAuthenticationCredentialWithPRF({
			credential,
			firstPrfOutput: true,
			secondPrfOutput: true
		});
		if (!authenticationCredential.clientExtensionResults?.prf?.results?.first || !authenticationCredential.clientExtensionResults?.prf?.results?.second) throw new Error("Dual PRF outputs required for account recovery - both ChaCha20 and Ed25519 PRF outputs must be available");
		const response = await ctx.sendMessage({ message: {
			type: WorkerRequestType.RecoverKeypairFromPasskey,
			payload: {
				credential: authenticationCredential,
				accountIdHint
			}
		} });
		if (!isRecoverKeypairFromPasskeySuccess(response)) throw new Error("Dual PRF keypair recovery failed in WASM worker");
		return {
			publicKey: response.payload.publicKey,
			encryptedPrivateKey: response.payload.encryptedData,
			iv: response.payload.iv,
			accountIdHint: response.payload.accountIdHint
		};
	} catch (error) {
		console.error("SignerWorkerManager: Dual PRF keypair recovery error:", error);
		throw error;
	}
}

//#endregion
//#region src/core/WebAuthnManager/SignerWorkerManager/handlers/extractCosePublicKey.ts
/**
* Extract COSE public key from WebAuthn attestation object
* Simple operation that doesn't require TouchID or progress updates
*/
async function extractCosePublicKey({ ctx, attestationObjectBase64url }) {
	try {
		const response = await ctx.sendMessage({ message: {
			type: WorkerRequestType.ExtractCosePublicKey,
			payload: { attestationObjectBase64url }
		} });
		if (isExtractCosePublicKeySuccess(response)) return response.payload.cosePublicKeyBytes;
		else throw new Error("COSE public key extraction failed in WASM worker");
	} catch (error) {
		throw error;
	}
}

//#endregion
//#region src/core/WebAuthnManager/SignerWorkerManager/handlers/signTransactionWithKeyPair.ts
/**
* Sign transaction with raw private key (for key replacement in Option D device linking)
* No TouchID/PRF required - uses provided private key directly
*/
async function signTransactionWithKeyPair({ ctx, nearPrivateKey, signerAccountId, receiverId, nonce, blockHash, actions }) {
	try {
		console.info("SignerWorkerManager: Starting transaction signing with provided private key");
		actions.forEach((action, index) => {
			try {
				validateActionArgsWasm(action);
			} catch (error) {
				throw new Error(`Action ${index} validation failed: ${error instanceof Error ? error.message : "Unknown error"}`);
			}
		});
		const response = await ctx.sendMessage({ message: {
			type: WorkerRequestType.SignTransactionWithKeyPair,
			payload: {
				nearPrivateKey,
				signerAccountId,
				receiverId,
				nonce,
				blockHash,
				actions: JSON.stringify(actions)
			}
		} });
		if (response.type !== WorkerResponseType.SignTransactionWithKeyPairSuccess) {
			console.error("SignerWorkerManager: Transaction signing with private key failed:", response);
			throw new Error("Transaction signing with private key failed");
		}
		const wasmResult = response.payload;
		if (!wasmResult.success) throw new Error(wasmResult.error || "Transaction signing failed");
		const signedTransactions = wasmResult.signedTransactions || [];
		if (signedTransactions.length !== 1) throw new Error(`Expected 1 signed transaction but received ${signedTransactions.length}`);
		const signedTx = signedTransactions[0];
		if (!signedTx || !signedTx.transaction || !signedTx.signature) throw new Error("Incomplete signed transaction data received");
		const result = {
			signedTransaction: new SignedTransaction({
				transaction: signedTx.transaction,
				signature: signedTx.signature,
				borsh_bytes: Array.from(signedTx.borshBytes || [])
			}),
			logs: wasmResult.logs
		};
		console.debug("SignerWorkerManager: Transaction signing with private key successful");
		return result;
	} catch (error) {
		console.error("SignerWorkerManager: Transaction signing with private key error:", error);
		throw error;
	}
}

//#endregion
//#region src/core/WebAuthnManager/SignerWorkerManager/handlers/signNep413Message.ts
/**
* Sign a NEP-413 message using the user's passkey-derived private key
*
* @param payload - NEP-413 signing parameters including message, recipient, nonce, and state
* @returns Promise resolving to signing result with account ID, public key, and signature
*/
async function signNep413Message({ ctx, payload }) {
	try {
		const encryptedKeyData = await ctx.indexedDB.nearKeysDB.getEncryptedKey(payload.accountId);
		if (!encryptedKeyData) throw new Error(`No encrypted key found for account: ${payload.accountId}`);
		const { chacha20PrfOutput } = extractPrfFromCredential({
			credential: payload.credential,
			firstPrfOutput: true,
			secondPrfOutput: false
		});
		const response = await ctx.sendMessage({ message: {
			type: WorkerRequestType.SignNep413Message,
			payload: {
				message: payload.message,
				recipient: payload.recipient,
				nonce: payload.nonce,
				state: payload.state || void 0,
				accountId: payload.accountId,
				prfOutput: chacha20PrfOutput,
				encryptedPrivateKeyData: encryptedKeyData.encryptedData,
				encryptedPrivateKeyIv: encryptedKeyData.iv
			}
		} });
		if (!isSignNep413MessageSuccess(response)) {
			console.error("SignerWorkerManager: NEP-413 signing failed:", response);
			throw new Error("NEP-413 signing failed");
		}
		return {
			success: true,
			accountId: response.payload.accountId,
			publicKey: response.payload.publicKey,
			signature: response.payload.signature,
			state: response.payload.state || void 0
		};
	} catch (error) {
		console.error("SignerWorkerManager: NEP-413 signing error:", error);
		return {
			success: false,
			accountId: "",
			publicKey: "",
			signature: "",
			error: error.message || "Unknown error"
		};
	}
}

//#endregion
//#region src/core/WebAuthnManager/SignerWorkerManager/confirmTxFlow/types.ts
let SecureConfirmMessageType = /* @__PURE__ */ function(SecureConfirmMessageType$1) {
	SecureConfirmMessageType$1["PROMPT_USER_CONFIRM_IN_JS_MAIN_THREAD"] = "PROMPT_USER_CONFIRM_IN_JS_MAIN_THREAD";
	SecureConfirmMessageType$1["USER_PASSKEY_CONFIRM_RESPONSE"] = "USER_PASSKEY_CONFIRM_RESPONSE";
	return SecureConfirmMessageType$1;
}({});

//#endregion
//#region src/core/WebAuthnManager/LitComponents/modal.ts
async function ensureIframeModalDefined() {
	if (customElements.get(IFRAME_MODAL_ID)) return;
	await new Promise((resolve, reject) => {
		const existing = document.querySelector(`script[data-w3a="${IFRAME_MODAL_ID}"]`);
		if (existing) {
			existing.addEventListener("load", () => resolve(), { once: true });
			existing.addEventListener("error", (e) => reject(e), { once: true });
			return;
		}
		const script = document.createElement("script");
		script.type = "module";
		script.async = true;
		script.dataset.w3a = IFRAME_MODAL_ID;
		script.src = `/sdk/embedded/${IFRAME_MODAL_ID}.js`;
		script.onload = () => resolve();
		script.onerror = (e) => {
			console.error("[LitComponents/modal] Failed to load iframe modal host bundle");
			reject(e);
		};
		document.head.appendChild(script);
	});
}
async function mountIframeModalHostWithHandle({ ctx, summary, txSigningRequests, vrfChallenge, loading, theme }) {
	await ensureIframeModalDefined();
	const el = document.createElement(IFRAME_MODAL_ID);
	el.nearAccountId = ctx.userPreferencesManager.getCurrentUserAccountId() || "";
	el.txSigningRequests = txSigningRequests || [];
	el.intentDigest = summary?.intentDigest;
	if (vrfChallenge) el.vrfChallenge = vrfChallenge;
	el.showLoading = !!loading;
	if (theme) el.theme = theme;
	document.body.appendChild(el);
	const close = (_confirmed) => {
		try {
			el.remove();
		} catch {}
	};
	return {
		element: el,
		close
	};
}
async function awaitIframeModalDecisionWithHandle({ ctx, summary, txSigningRequests, vrfChallenge, theme }) {
	await ensureIframeModalDefined();
	return new Promise((resolve) => {
		const el = document.createElement(IFRAME_MODAL_ID);
		el.nearAccountId = ctx.userPreferencesManager.getCurrentUserAccountId() || "";
		el.txSigningRequests = txSigningRequests || [];
		el.intentDigest = summary?.intentDigest;
		if (vrfChallenge) el.vrfChallenge = vrfChallenge;
		if (theme) el.theme = theme;
		const onConfirm = (e) => {
			const ce = e;
			cleanup();
			const ok = !!ce?.detail?.confirmed;
			resolve({
				confirmed: ok,
				handle: {
					element: el,
					close: (_confirmed) => {
						try {
							el.remove();
						} catch {}
					}
				}
			});
		};
		const onCancel = () => {
			cleanup();
			resolve({
				confirmed: false,
				handle: {
					element: el,
					close: (_confirmed) => {
						try {
							el.remove();
						} catch {}
					}
				}
			});
		};
		const cleanup = () => {
			try {
				el.removeEventListener("w3a:modal-confirm", onConfirm);
			} catch {}
			try {
				el.removeEventListener("w3a:modal-cancel", onCancel);
			} catch {}
		};
		el.addEventListener("w3a:modal-confirm", onConfirm);
		el.addEventListener("w3a:modal-cancel", onCancel);
		document.body.appendChild(el);
	});
}

//#endregion
//#region src/core/WebAuthnManager/SignerWorkerManager/confirmTxFlow/handleSecureConfirmRequest.ts
/**
* Handles secure confirmation requests from the worker with robust error handling
* => SecureConfirmMessageType.PROMPT_USER_CONFIRM_IN_JS_MAIN_THREAD
* and proper data validation. Supports both transaction and registration confirmation flows.
*/
async function handlePromptUserConfirmInJsMainThread(ctx, message, worker) {
	const { data, summary, confirmationConfig, transactionSummary } = validateAndParseRequest({
		ctx,
		message
	});
	const nearRpcResult = await performNearRpcCalls(ctx, data);
	if (nearRpcResult.error || !nearRpcResult.transactionContext) {
		sendWorkerResponse(worker, {
			requestId: data.requestId,
			intentDigest: data.intentDigest,
			confirmed: false,
			error: `Failed to fetch NEAR data: ${nearRpcResult.details}`
		});
		return;
	}
	const transactionContext = nearRpcResult.transactionContext;
	if (!ctx.vrfWorkerManager) throw new Error("VrfWorkerManager not available in context");
	const vrfChallenge = await ctx.vrfWorkerManager.generateVrfChallenge({
		userId: data.rpcCall.nearAccountId,
		rpId: window.location.hostname,
		blockHeight: transactionContext.txBlockHeight,
		blockHash: transactionContext.txBlockHash
	});
	const userConfirmResult = await renderUserConfirmUI({
		ctx,
		confirmationConfig,
		transactionSummary,
		data,
		vrfChallenge
	});
	const { confirmed, confirmHandle, error: uiError } = userConfirmResult;
	if (!confirmed) {
		try {
			nearRpcResult.reservedNonces?.forEach((n) => ctx.nonceManager.releaseNonce(n));
		} catch (e) {
			console.warn("[SignerWorkerManager]: Failed to release reserved nonces on cancel:", e);
		}
		closeModalSafely(confirmHandle, false);
		sendWorkerResponse(worker, {
			requestId: data.requestId,
			intentDigest: data.intentDigest,
			confirmed: false,
			error: uiError
		});
		return;
	}
	const decision = {
		requestId: data.requestId,
		intentDigest: data.intentDigest,
		confirmed: true,
		vrfChallenge,
		transactionContext
	};
	let decisionWithCredentials;
	let touchIdSuccess = false;
	try {
		const result = await collectTouchIdCredentials({
			ctx,
			data,
			decision
		});
		decisionWithCredentials = result.decisionWithCredentials;
		touchIdSuccess = decisionWithCredentials?.confirmed ?? false;
	} catch (touchIdError) {
		console.error("[SignerWorkerManager]: Failed to collect credentials:", touchIdError);
		const isCancelled = touchIdError instanceof DOMException && (touchIdError.name === "NotAllowedError" || touchIdError.name === "AbortError");
		if (isCancelled) console.log("[SignerWorkerManager]: User cancelled secure confirm request");
		decisionWithCredentials = {
			...decision,
			confirmed: false,
			error: isCancelled ? "User cancelled secure confirm request" : "Failed to collect credentials",
			_confirmHandle: void 0
		};
		touchIdSuccess = false;
	} finally {
		closeModalSafely(confirmHandle, touchIdSuccess);
	}
	try {
		if (!decisionWithCredentials?.confirmed) nearRpcResult.reservedNonces?.forEach((n) => ctx.nonceManager.releaseNonce(n));
	} catch (e) {
		console.warn("[SignerWorkerManager]: Failed to release reserved nonces after decision:", e);
	}
	sendWorkerResponse(worker, decisionWithCredentials);
}
/**
* Performs NEAR RPC call to get nonce, block hash and height
* Uses NonceManager if available, otherwise falls back to direct RPC calls
* For batch transactions, reserves nonces for each transaction
*/
async function performNearRpcCalls(ctx, data) {
	try {
		const transactionContext = await ctx.nonceManager.getNonceBlockHashAndHeight(ctx.nearClient);
		console.log("Using NonceManager smart caching");
		const txCount = data.tx_signing_requests?.length || 1;
		let reservedNonces;
		try {
			reservedNonces = ctx.nonceManager.reserveNonces(txCount);
			console.log(`[NonceManager]: Reserved ${txCount} nonce(s):`, reservedNonces);
			transactionContext.nextNonce = reservedNonces[0];
		} catch (error) {
			console.warn(`[NonceManager]: Failed to reserve ${txCount} nonce(s):`, error);
		}
		return {
			transactionContext,
			error: void 0,
			details: void 0,
			reservedNonces
		};
	} catch (error) {
		return {
			transactionContext: null,
			error: "NEAR_RPC_FAILED",
			details: error instanceof Error ? error.message : String(error)
		};
	}
}
/**
* Validates and parses the confirmation request data
*/
function validateAndParseRequest({ ctx, message }) {
	const data = message.data;
	if (!data || !data.requestId) throw new Error("Invalid secure confirm request - missing requestId");
	const summary = parseTransactionSummary(data.summary);
	const confirmationConfig = data.confirmationConfig || ctx.userPreferencesManager.getConfirmationConfig();
	const transactionSummary = {
		totalAmount: summary?.totalAmount,
		method: summary?.method || (data.isRegistration ? "Register Account" : void 0),
		intentDigest: data.intentDigest
	};
	return {
		data,
		summary,
		confirmationConfig,
		transactionSummary
	};
}
/**
* Determines user confirmation based on UI mode and configuration
*/
async function renderUserConfirmUI({ ctx, data, confirmationConfig, transactionSummary, vrfChallenge }) {
	switch (confirmationConfig.uiMode) {
		case "skip": return {
			confirmed: true,
			confirmHandle: void 0
		};
		case "embedded": try {
			const hostEl = document.querySelector(IFRAME_BUTTON_ID);
			if (hostEl && confirmationConfig.theme) hostEl.tooltipTheme = confirmationConfig.theme;
			let uiDigest = null;
			if (hostEl?.requestUiIntentDigest) {
				uiDigest = await hostEl.requestUiIntentDigest();
				console.log("[SecureConfirm] digest check", {
					uiDigest,
					intentDigest: data.intentDigest
				});
			} else console.error("[SecureConfirm]: missing requestUiIntentDigest on secure element");
			if (uiDigest !== data.intentDigest) {
				console.error("[SecureConfirm]: UI digest mismatch");
				const errPayload = JSON.stringify({
					code: "ui_digest_mismatch",
					uiDigest,
					intentDigest: data.intentDigest
				});
				return {
					confirmed: false,
					confirmHandle: void 0,
					error: errPayload
				};
			}
			return {
				confirmed: true,
				confirmHandle: void 0
			};
		} catch (e) {
			console.error("[SecureConfirm]: Failed to validate UI digest", e);
			return {
				confirmed: false,
				confirmHandle: void 0,
				error: "ui_digest_validation_failed"
			};
		}
		case "modal": if (confirmationConfig.behavior === "autoProceed") {
			const handle = await mountIframeModalHostWithHandle({
				ctx,
				summary: transactionSummary,
				txSigningRequests: data.tx_signing_requests,
				vrfChallenge,
				loading: true,
				theme: confirmationConfig.theme
			});
			const delay = confirmationConfig.autoProceedDelay ?? 1e3;
			await new Promise((resolve) => setTimeout(resolve, delay));
			return {
				confirmed: true,
				confirmHandle: handle
			};
		} else {
			const { confirmed, handle } = await awaitIframeModalDecisionWithHandle({
				ctx,
				summary: transactionSummary,
				txSigningRequests: data.tx_signing_requests,
				vrfChallenge,
				theme: confirmationConfig.theme
			});
			return {
				confirmed,
				confirmHandle: handle
			};
		}
		default: {
			const handle = await mountIframeModalHostWithHandle({
				ctx,
				summary: transactionSummary,
				txSigningRequests: data.tx_signing_requests,
				vrfChallenge,
				loading: true,
				theme: confirmationConfig.theme
			});
			return {
				confirmed: true,
				confirmHandle: handle
			};
		}
	}
}
/**
* Collects WebAuthn credentials and PRF output if conditions are met
*/
async function collectTouchIdCredentials({ ctx, data, decision }) {
	const nearAccountId = data.rpcCall?.nearAccountId || data.nearAccountId;
	const vrfChallenge = decision.vrfChallenge;
	if (!nearAccountId) throw new Error("nearAccountId not available for credential collection");
	if (!vrfChallenge) throw new Error("VRF challenge not available for credential collection");
	const authenticators = await ctx.indexedDB.clientDB.getAuthenticatorsByUser(toAccountId(nearAccountId));
	const credential = await ctx.touchIdPrompt.getCredentials({
		nearAccountId,
		challenge: vrfChallenge,
		authenticators
	});
	const dualPrfOutputs = extractPrfFromCredential({
		credential,
		firstPrfOutput: true,
		secondPrfOutput: data.isRegistration
	});
	if (!dualPrfOutputs.chacha20PrfOutput) throw new Error("Failed to extract PRF output from credential");
	const serializedCredential = data.isRegistration ? serializeRegistrationCredentialWithPRF({
		credential,
		firstPrfOutput: true,
		secondPrfOutput: true
	}) : serializeAuthenticationCredentialWithPRF({ credential });
	return { decisionWithCredentials: {
		...decision,
		credential: serializedCredential,
		prfOutput: dualPrfOutputs.chacha20PrfOutput,
		confirmed: true,
		_confirmHandle: void 0
	} };
}
/**
* Safely parses transaction summary data, handling both string and object formats
*/
function parseTransactionSummary(summaryData) {
	if (!summaryData) return {};
	if (typeof summaryData === "string") try {
		return JSON.parse(summaryData);
	} catch (parseError) {
		console.warn("[SignerWorkerManager]: Failed to parse summary string:", parseError);
		return {};
	}
	if (typeof summaryData === "object" && summaryData !== null) return summaryData;
	console.warn("[SignerWorkerManager]: Unexpected summary data type:", typeof summaryData);
	return {};
}
/**
* Safely closes modal with error handling
*/
function closeModalSafely(confirmHandle, confirmed) {
	if (confirmHandle?.close) try {
		confirmHandle.close(confirmed);
		console.log("[SecureConfirm] Modal closed safely");
	} catch (modalError) {
		console.warn("[SecureConfirm] Error closing modal:", modalError);
	}
}
/**
* Sends response to worker with consistent message format
*/
function sendWorkerResponse(worker, responseData) {
	const sanitized = sanitizeForPostMessage(responseData);
	worker.postMessage({
		type: SecureConfirmMessageType.USER_PASSKEY_CONFIRM_RESPONSE,
		data: sanitized
	});
}
function sanitizeForPostMessage(data) {
	if (data == null) return data;
	if (typeof data !== "object") return data;
	const out = Array.isArray(data) ? [] : {};
	for (const key of Object.keys(data)) {
		if (key === "_confirmHandle") continue;
		const value = data[key];
		if (typeof value === "function") continue;
		out[key] = value;
	}
	return out;
}

//#endregion
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
	constructor(vrfWorkerManager, nearClient$1, userPreferencesManager, nonceManager) {
		this.indexedDB = IndexedDBManager;
		this.touchIdPrompt = new TouchIdPrompt();
		this.vrfWorkerManager = vrfWorkerManager;
		this.nearClient = nearClient$1;
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
//#region src/core/WebAuthnManager/userPreferences.ts
var UserPreferencesManager = class {
	themeChangeListeners = /* @__PURE__ */ new Set();
	currentUserAccountId;
	confirmationConfig = DEFAULT_CONFIRMATION_CONFIG;
	constructor() {
		this.initializeUserSettings();
		this.subscribeToIndexedDBChanges();
	}
	/**
	* Register a callback for theme change events
	*/
	onThemeChange(callback) {
		this.themeChangeListeners.add(callback);
		return () => {
			this.themeChangeListeners.delete(callback);
		};
	}
	/**
	* Notify all registered listeners of theme changes
	*/
	notifyThemeChange(theme) {
		if (this.themeChangeListeners.size === 0) {
			console.warn(`[UserPreferencesManager]: No listeners registered, theme change will not propagate.`);
			return;
		}
		let index = 0;
		this.themeChangeListeners.forEach((listener) => {
			index++;
			try {
				listener(theme);
			} catch (error) {}
		});
	}
	async initializeUserSettings() {
		try {
			await this.loadUserSettings();
		} catch (error) {
			console.warn("[WebAuthnManager]: Failed to initialize user settings:", error);
		}
	}
	/**
	* Subscribe to IndexedDB change events for automatic synchronization
	*/
	subscribeToIndexedDBChanges() {
		this.unsubscribeFromIndexedDB = IndexedDBManager.clientDB.onChange((event) => {
			this.handleIndexedDBEvent(event);
		});
	}
	/**
	* Handle IndexedDB change events.
	* @param event - The IndexedDBEvent: `user-updated`, `preferences-updated`, `user-deleted` to handle.
	*/
	async handleIndexedDBEvent(event) {
		try {
			switch (event.type) {
				case "preferences-updated":
					if (event.accountId === this.currentUserAccountId) await this.reloadUserSettings();
					break;
				case "user-updated":
					if (event.accountId === this.currentUserAccountId) await this.reloadUserSettings();
					break;
				case "user-deleted":
					if (event.accountId === this.currentUserAccountId) {
						this.currentUserAccountId = void 0;
						this.confirmationConfig = DEFAULT_CONFIRMATION_CONFIG;
					}
					break;
			}
		} catch (error) {
			console.warn("[WebAuthnManager]: Error handling IndexedDB event:", error);
		}
	}
	/**
	* Unsubscribe function for IndexedDB events
	*/
	unsubscribeFromIndexedDB;
	/**
	* Clean up resources and unsubscribe from events
	*/
	destroy() {
		if (this.unsubscribeFromIndexedDB) {
			this.unsubscribeFromIndexedDB();
			this.unsubscribeFromIndexedDB = void 0;
		}
		this.themeChangeListeners.clear();
	}
	getCurrentUserAccountId() {
		if (!this.currentUserAccountId) throw new Error("No current user set");
		return this.currentUserAccountId;
	}
	getConfirmationConfig() {
		return this.confirmationConfig;
	}
	setCurrentUser(nearAccountId) {
		this.currentUserAccountId = nearAccountId;
		this.loadSettingsForUser(nearAccountId);
	}
	/**
	* Load settings for a specific user
	*/
	async loadSettingsForUser(nearAccountId) {
		const user = await IndexedDBManager.clientDB.getUser(nearAccountId);
		if (user?.preferences?.confirmationConfig) this.confirmationConfig = {
			...DEFAULT_CONFIRMATION_CONFIG,
			...user.preferences.confirmationConfig
		};
		else this.confirmationConfig = DEFAULT_CONFIRMATION_CONFIG;
	}
	/**
	* Reload current user settings from IndexedDB
	*/
	async reloadUserSettings() {
		await this.loadSettingsForUser(this.getCurrentUserAccountId());
	}
	/**
	* Set confirmation behavior
	*/
	setConfirmBehavior(behavior) {
		this.confirmationConfig = {
			...this.confirmationConfig,
			behavior
		};
		this.saveUserSettings();
	}
	/**
	* Set confirmation configuration
	*/
	setConfirmationConfig(config) {
		this.confirmationConfig = {
			...DEFAULT_CONFIRMATION_CONFIG,
			...config
		};
		this.saveUserSettings();
	}
	/**
	* Load user confirmation settings from IndexedDB
	*/
	async loadUserSettings() {
		const user = await IndexedDBManager.clientDB.getLastUser();
		if (user) {
			this.currentUserAccountId = user.nearAccountId;
			if (user.preferences?.confirmationConfig) this.confirmationConfig = {
				...DEFAULT_CONFIRMATION_CONFIG,
				...user.preferences.confirmationConfig
			};
			else console.debug("[WebAuthnManager]: No user preferences found, using defaults");
		} else console.debug("[WebAuthnManager]: No last user found, using default settings");
	}
	/**
	* Save current confirmation settings to IndexedDB
	*/
	async saveUserSettings() {
		const currentUserAccountId = this.getCurrentUserAccountId();
		try {
			await IndexedDBManager.clientDB.updatePreferences(currentUserAccountId, { confirmationConfig: this.confirmationConfig });
		} catch (error) {
			console.warn("[WebAuthnManager]: Failed to save user settings:", error);
		}
	}
	/**
	* Get user theme preference from IndexedDB
	*/
	async getCurrentUserAccountIdTheme() {
		const currentUserAccountId = this.getCurrentUserAccountId();
		try {
			return await IndexedDBManager.clientDB.getTheme(currentUserAccountId);
		} catch (error) {
			console.warn("[WebAuthnManager]: Failed to get user theme:", error);
			return null;
		}
	}
	getUserTheme() {
		return this.confirmationConfig.theme;
	}
	/**
	* Set user theme preference in IndexedDB
	*/
	async setUserTheme(theme) {
		const currentUserAccountId = this.getCurrentUserAccountId();
		try {
			await IndexedDBManager.clientDB.setTheme(currentUserAccountId, theme);
			this.confirmationConfig = {
				...this.confirmationConfig,
				theme
			};
			this.notifyThemeChange(theme);
		} catch (error) {
			console.error("[UserPreferencesManager]: Failed to save user theme:", error);
		}
	}
};
const UserPreferencesInstance = new UserPreferencesManager();
var userPreferences_default = UserPreferencesInstance;

//#endregion
//#region src/core/nonceManager.ts
/**
* NonceManager - Singleton for managing NEAR transaction context
*
* This class pre-fetches nonce and block height asynchronously at the start
* of executeAction calls to avoid blocking renderUserConfirmUI().
*
* The manager is cleared on logout and instantiated with new user on login.
*/
var NonceManager = class NonceManager {
	static instance = null;
	lastNonceUpdate = null;
	lastBlockHeightUpdate = null;
	nearAccountId = null;
	nearPublicKeyStr = null;
	transactionContext = null;
	inflightFetch = null;
	refreshTimer = null;
	prefetchTimer = null;
	reservedNonces = /* @__PURE__ */ new Set();
	lastReservedNonce = null;
	NONCE_FRESHNESS_THRESHOLD = 20 * 1e3;
	BLOCK_FRESHNESS_THRESHOLD = 10 * 1e3;
	PREFETCH_DEBOUNCE_MS = 150;
	constructor() {}
	/**
	* Get singleton instance
	*/
	static getInstance() {
		if (!NonceManager.instance) NonceManager.instance = new NonceManager();
		return NonceManager.instance;
	}
	/**
	* Prefetch block height/hash (and nonce if missing) in the background.
	* - If block info is stale or context missing, triggers a non-blocking refresh.
	* - Safe to call frequently (coalesces concurrent fetches).
	*/
	async prefetchBlockheight(nearClient$1) {
		if (!this.nearAccountId || !this.nearPublicKeyStr) return;
		this.clearPrefetchTimer();
		this.prefetchTimer = setTimeout(async () => {
			this.prefetchTimer = null;
			if (this.inflightFetch) return;
			const now = Date.now();
			const isBlockStale = !this.lastBlockHeightUpdate || now - this.lastBlockHeightUpdate >= this.BLOCK_FRESHNESS_THRESHOLD;
			const missingContext = !this.transactionContext;
			if (!isBlockStale && !missingContext) return;
			try {
				await this.fetchFreshData(nearClient$1);
			} catch (e) {
				console.debug("[NonceManager]: prefetchBlockheight ignored error:", e);
			}
		}, this.PREFETCH_DEBOUNCE_MS);
	}
	/**
	* Initialize or update the manager with user information
	*/
	initializeUser(nearAccountId, nearPublicKeyStr) {
		this.nearAccountId = nearAccountId;
		this.nearPublicKeyStr = nearPublicKeyStr;
		this.clearTransactionContext();
	}
	/**
	* Clear all data when user logs out
	*/
	clear() {
		this.lastNonceUpdate = null;
		this.lastBlockHeightUpdate = null;
		this.nearAccountId = null;
		this.nearPublicKeyStr = null;
		this.transactionContext = null;
		this.clearRefreshTimer();
		this.clearPrefetchTimer();
		this.inflightFetch = null;
		this.reservedNonces.clear();
		this.lastReservedNonce = null;
	}
	/**
	* Smart caching method for nonce and block height data
	* Returns cached data if fresh, otherwise fetches synchronously
	*/
	async getNonceBlockHashAndHeight(nearClient$1) {
		if (!this.nearAccountId || !this.nearPublicKeyStr) throw new Error("NonceManager not initialized with user data");
		const now = Date.now();
		const isNonceFresh = !!this.lastNonceUpdate && now - this.lastNonceUpdate < this.NONCE_FRESHNESS_THRESHOLD;
		const isBlockHeightFresh = !!this.lastBlockHeightUpdate && now - this.lastBlockHeightUpdate < this.BLOCK_FRESHNESS_THRESHOLD;
		if (isNonceFresh && isBlockHeightFresh && this.transactionContext) {
			this.maybeScheduleBackgroundRefresh(nearClient$1);
			return this.transactionContext;
		}
		console.debug("[NonceManager]: Data is stale, fetching synchronously");
		return await this.fetchFreshData(nearClient$1);
	}
	/**
	* Schedule an asynchronous refresh of the transaction context
	*/
	maybeScheduleBackgroundRefresh(nearClient$1) {
		if (!this.lastNonceUpdate || !this.lastBlockHeightUpdate) return;
		if (this.inflightFetch) return;
		const now = Date.now();
		const nonceAge = now - this.lastNonceUpdate;
		const blockAge = now - this.lastBlockHeightUpdate;
		const halfNonceTtl = this.NONCE_FRESHNESS_THRESHOLD / 2;
		const halfBlockTtl = this.BLOCK_FRESHNESS_THRESHOLD / 2;
		if (nonceAge >= halfNonceTtl || blockAge >= halfBlockTtl) {
			this.clearRefreshTimer();
			this.fetchFreshData(nearClient$1).then(() => console.debug("[NonceManager]: Background refresh completed")).catch((error) => console.warn("[NonceManager]: Background refresh failed:", error));
			return;
		}
		const delayToHalfNonce = Math.max(0, halfNonceTtl - nonceAge);
		const delayToHalfBlock = Math.max(0, halfBlockTtl - blockAge);
		const delay = Math.min(delayToHalfNonce, delayToHalfBlock);
		this.clearRefreshTimer();
		this.refreshTimer = setTimeout(() => {
			this.refreshTimer = null;
			if (this.inflightFetch) return;
			this.fetchFreshData(nearClient$1).then(() => console.debug("[NonceManager]: Background refresh completed")).catch((error) => console.warn("[NonceManager]: Background refresh failed:", error));
		}, delay);
	}
	/**
	* Fetch fresh transaction context data from NEAR RPC
	*/
	async fetchFreshData(nearClient$1) {
		if (this.inflightFetch) return this.inflightFetch;
		const capturedAccountId = this.nearAccountId;
		const capturedPublicKey = this.nearPublicKeyStr;
		this.inflightFetch = (async () => {
			try {
				const now = Date.now();
				const isNonceStale = !this.lastNonceUpdate || now - this.lastNonceUpdate >= this.NONCE_FRESHNESS_THRESHOLD;
				const isBlockStale = !this.lastBlockHeightUpdate || now - this.lastBlockHeightUpdate >= this.BLOCK_FRESHNESS_THRESHOLD;
				let accessKeyInfo = this.transactionContext?.accessKeyInfo;
				let txBlockHeight = this.transactionContext?.txBlockHeight;
				let txBlockHash = this.transactionContext?.txBlockHash;
				const fetchAccessKey = isNonceStale || !accessKeyInfo;
				const fetchBlock = isBlockStale || !txBlockHeight || !txBlockHash;
				const [maybeAccessKey, maybeBlock] = await Promise.all([fetchAccessKey ? nearClient$1.viewAccessKey(capturedAccountId, capturedPublicKey) : Promise.resolve(null), fetchBlock ? nearClient$1.viewBlock({ finality: "final" }) : Promise.resolve(null)]);
				if (fetchAccessKey) {
					if (!maybeAccessKey || maybeAccessKey.nonce === void 0) throw new Error(`Access key not found or invalid for account ${capturedAccountId} with public key ${capturedPublicKey}.`);
					accessKeyInfo = maybeAccessKey;
				}
				if (fetchBlock) {
					const blockInfo = maybeBlock;
					if (!blockInfo?.header?.hash || blockInfo?.header?.height === void 0) throw new Error("Failed to fetch Block Info");
					txBlockHeight = String(blockInfo.header.height);
					txBlockHash = blockInfo.header.hash;
				}
				const nextNonce = this.maxBigInt(BigInt(accessKeyInfo.nonce) + 1n, this.transactionContext?.nextNonce ? BigInt(this.transactionContext.nextNonce) : 0n, this.lastReservedNonce ? BigInt(this.lastReservedNonce) + 1n : 0n).toString();
				const transactionContext = {
					nearPublicKeyStr: capturedPublicKey,
					accessKeyInfo,
					nextNonce,
					txBlockHeight,
					txBlockHash
				};
				if (capturedAccountId === this.nearAccountId && capturedPublicKey === this.nearPublicKeyStr) {
					this.transactionContext = transactionContext;
					const now$1 = Date.now();
					if (fetchAccessKey) this.lastNonceUpdate = now$1;
					if (fetchBlock) this.lastBlockHeightUpdate = now$1;
				} else console.debug("[NonceManager]: Discarded fetch result due to identity change");
				return transactionContext;
			} catch (error) {
				console.error("[NonceManager]: Failed to fetch fresh transaction context:", error);
				throw error;
			} finally {
				this.inflightFetch = null;
			}
		})();
		return this.inflightFetch;
	}
	/**
	* Get the current transaction context
	* Throws if data is not available or stale
	*/
	getTransactionContext() {
		if (!this.transactionContext) throw new Error("Transaction context not available - call getNonceBlockHashAndHeight() first");
		const now = Date.now();
		const maxAge = 30 * 1e3;
		if (this.lastNonceUpdate && now - this.lastNonceUpdate > maxAge) console.warn("[NonceManager]: Transaction context is stale, consider refreshing");
		return this.transactionContext;
	}
	/**
	* Check if transaction context is available and not stale
	*/
	isTransactionContextAvailable(maxAgeMs = 3e4) {
		if (!this.transactionContext || !this.lastNonceUpdate) return false;
		const now = Date.now();
		return now - this.lastNonceUpdate <= maxAgeMs;
	}
	/**
	* Clear transaction context (useful when nonce might be invalidated)
	*/
	clearTransactionContext() {
		this.transactionContext = null;
		this.lastNonceUpdate = null;
		this.lastBlockHeightUpdate = null;
		this.clearRefreshTimer();
		this.clearPrefetchTimer();
		this.inflightFetch = null;
		this.reservedNonces.clear();
		this.lastReservedNonce = null;
	}
	/**
	* Reserve a nonce for batch transactions
	* This increments the nonce locally to prevent conflicts in batch operations
	* @param count - Number of nonces to reserve (default: 1)
	* @returns Array of reserved nonces
	*/
	reserveNonces(count = 1) {
		if (!this.transactionContext) throw new Error("Transaction context not available - call getNonceBlockHashAndHeight() first");
		if (count <= 0) return [];
		const start = this.lastReservedNonce ? BigInt(this.lastReservedNonce) + 1n : BigInt(this.transactionContext.nextNonce);
		const planned = [];
		for (let i = 0; i < count; i++) {
			const candidate = (start + BigInt(i)).toString();
			if (this.reservedNonces.has(candidate)) throw new Error(`Nonce ${candidate} is already reserved`);
			planned.push(candidate);
		}
		const newSet = new Set(this.reservedNonces);
		for (const n of planned) newSet.add(n);
		this.reservedNonces = newSet;
		this.lastReservedNonce = planned[planned.length - 1];
		console.debug(`[NonceManager]: Reserved ${count} nonces:`, planned);
		return planned;
	}
	/**
	* Release a reserved nonce (call when transaction is completed or failed)
	* @param nonce - The nonce to release
	*/
	releaseNonce(nonce) {
		if (this.reservedNonces.has(nonce)) {
			this.reservedNonces.delete(nonce);
			console.debug(`[NonceManager]: Released nonce ${nonce}`);
		}
	}
	/**
	* Release all reserved nonces
	*/
	releaseAllNonces() {
		const count = this.reservedNonces.size;
		this.reservedNonces.clear();
		this.lastReservedNonce = null;
		console.debug(`[NonceManager]: Released all ${count} reserved nonces`);
	}
	/**
	* Update nonce from blockchain after transaction completion
	* This should be called after a transaction is successfully broadcasted
	* @param nearClient - NEAR client for RPC calls
	* @param actualNonce - The actual nonce used in the completed transaction
	*/
	async updateNonceFromBlockchain(nearClient$1, actualNonce) {
		if (!this.nearAccountId || !this.nearPublicKeyStr) throw new Error("NonceManager not initialized with user data");
		try {
			const accessKeyInfo = await nearClient$1.viewAccessKey(this.nearAccountId, this.nearPublicKeyStr);
			if (!accessKeyInfo || accessKeyInfo.nonce === void 0) throw new Error(`Access key not found or invalid for account ${this.nearAccountId}`);
			const chainNonceBigInt = BigInt(accessKeyInfo.nonce);
			const actualNonceBigInt = BigInt(actualNonce);
			if (chainNonceBigInt < actualNonceBigInt - BigInt(1)) console.warn(`[NonceManager]: Chain nonce (${chainNonceBigInt}) behind expected (${actualNonceBigInt - BigInt(1)}). Proceeding with tolerant update.`);
			const candidateNext = this.maxBigInt(chainNonceBigInt + 1n, this.transactionContext?.nextNonce ? BigInt(this.transactionContext.nextNonce) : 0n, this.lastReservedNonce ? BigInt(this.lastReservedNonce) + 1n : 0n);
			if (this.transactionContext) {
				this.transactionContext.accessKeyInfo = accessKeyInfo;
				this.transactionContext.nextNonce = candidateNext.toString();
			} else this.transactionContext = {
				nearPublicKeyStr: this.nearPublicKeyStr,
				accessKeyInfo,
				nextNonce: candidateNext.toString(),
				txBlockHeight: "0",
				txBlockHash: ""
			};
			this.lastNonceUpdate = Date.now();
			this.releaseNonce(actualNonce);
			if (this.reservedNonces.size > 0) {
				const { set: prunedSet, lastReserved } = this.pruneReserved(chainNonceBigInt, this.reservedNonces);
				this.reservedNonces = prunedSet;
				this.lastReservedNonce = lastReserved;
			}
			console.debug(`[NonceManager]: Updated from chain nonce=${chainNonceBigInt} actual=${actualNonceBigInt} next=${this.transactionContext.nextNonce}`);
		} catch (error) {
			console.error("[NonceManager]: Failed to update nonce from blockchain:", error);
		}
	}
	/**
	* Get the next available nonce for a single transaction
	* This is a convenience method that reserves exactly one nonce
	* @returns The next nonce to use
	*/
	getNextNonce() {
		const nonces = this.reserveNonces(1);
		return nonces[0];
	}
	clearRefreshTimer() {
		if (this.refreshTimer) {
			clearTimeout(this.refreshTimer);
			this.refreshTimer = null;
		}
	}
	clearPrefetchTimer() {
		if (this.prefetchTimer) {
			clearTimeout(this.prefetchTimer);
			this.prefetchTimer = null;
		}
	}
	maxBigInt(...values) {
		if (values.length === 0) return 0n;
		return values.reduce((a, b) => a > b ? a : b);
	}
	pruneReserved(chainNonceBigInt, reserved) {
		const newSet = /* @__PURE__ */ new Set();
		let newLast = null;
		for (const r of reserved) try {
			const rb = BigInt(r);
			if (rb > chainNonceBigInt) {
				newSet.add(r);
				if (newLast === null || rb > newLast) newLast = rb;
			}
		} catch {}
		return {
			set: newSet,
			lastReserved: newLast ? newLast.toString() : null
		};
	}
};
const NonceManagerInstance = NonceManager.getInstance();
var nonceManager_default = NonceManagerInstance;

//#endregion
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
	constructor(passkeyManagerConfigs, nearClient$1) {
		const { vrfWorkerConfigs } = passkeyManagerConfigs;
		this.vrfWorkerManager = new VrfWorkerManager({
			shamirPB64u: vrfWorkerConfigs?.shamir3pass?.p,
			relayServerUrl: vrfWorkerConfigs?.shamir3pass?.relayServerUrl,
			applyServerLockRoute: vrfWorkerConfigs?.shamir3pass?.applyServerLockRoute,
			removeServerLockRoute: vrfWorkerConfigs?.shamir3pass?.removeServerLockRoute
		});
		this.touchIdPrompt = new TouchIdPrompt();
		this.userPreferencesManager = userPreferences_default;
		this.nonceManager = nonceManager_default;
		this.signerWorkerManager = new SignerWorkerManager(this.vrfWorkerManager, nearClient$1, userPreferences_default, nonceManager_default);
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
		await IndexedDBManager.clientDB.storeWebAuthnUserData(userData);
	}
	async getUser(nearAccountId) {
		return await IndexedDBManager.clientDB.getUser(nearAccountId);
	}
	async getAllUserData() {
		return await IndexedDBManager.clientDB.getAllUsers();
	}
	async getAllUsers() {
		return await IndexedDBManager.clientDB.getAllUsers();
	}
	async getAuthenticatorsByUser(nearAccountId) {
		return await IndexedDBManager.clientDB.getAuthenticatorsByUser(nearAccountId);
	}
	async updateLastLogin(nearAccountId) {
		return await IndexedDBManager.clientDB.updateLastLogin(nearAccountId);
	}
	/**
	* Set the last logged-in user
	* @param nearAccountId - The account ID of the user
	* @param deviceNumber - The device number (defaults to 1)
	*/
	async setLastUser(nearAccountId, deviceNumber = 1) {
		return await IndexedDBManager.clientDB.setLastUser(nearAccountId, deviceNumber);
	}
	async setCurrentUser(nearAccountId) {
		this.userPreferencesManager.setCurrentUser(nearAccountId);
		const userData = await IndexedDBManager.clientDB.getLastUser();
		if (userData && userData.clientNearPublicKey) this.nonceManager.initializeUser(nearAccountId, userData.clientNearPublicKey);
	}
	async registerUser(storeUserData) {
		return await IndexedDBManager.clientDB.registerUser(storeUserData);
	}
	async storeAuthenticator(authenticatorData) {
		const authData = {
			...authenticatorData,
			nearAccountId: toAccountId(authenticatorData.nearAccountId),
			deviceNumber: authenticatorData.deviceNumber || 1
		};
		return await IndexedDBManager.clientDB.storeAuthenticator(authData);
	}
	extractUsername(nearAccountId) {
		return IndexedDBManager.clientDB.extractUsername(nearAccountId);
	}
	async atomicOperation(callback) {
		return await IndexedDBManager.clientDB.atomicOperation(callback);
	}
	async rollbackUserRegistration(nearAccountId) {
		return await IndexedDBManager.clientDB.rollbackUserRegistration(nearAccountId);
	}
	async hasPasskeyCredential(nearAccountId) {
		return await IndexedDBManager.clientDB.hasPasskeyCredential(nearAccountId);
	}
	async getLastUsedNearAccountId() {
		const lastUser = await IndexedDBManager.clientDB.getLastUser();
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
			const credentialId = base64UrlEncode(credential.rawId);
			const response = credential.response;
			await this.storeAuthenticator({
				nearAccountId,
				credentialId,
				credentialPublicKey: await this.extractCosePublicKey(base64UrlEncode(response.attestationObject)),
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
	async signVerifyAndRegisterUser({ contractId, credential, vrfChallenge, deterministicVrfPublicKey, nearAccountId, nearPublicKeyStr, nearClient: nearClient$1, deviceNumber = 1, authenticatorOptions, onEvent }) {
		try {
			const registrationResult = await this.signerWorkerManager.signVerifyAndRegisterUser({
				vrfChallenge,
				credential,
				contractId,
				deterministicVrfPublicKey,
				nearAccountId,
				nearPublicKeyStr,
				nearClient: nearClient$1,
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
//#region src/core/ServiceIframe/service-host.ts
const PROTOCOL = "1.0.0";
let port = null;
const clientDB = new PasskeyClientDBManager();
let walletConfigs = null;
let nearClient = null;
let webAuthnManager = null;
function ensureManagers() {
	if (!walletConfigs || !walletConfigs.nearRpcUrl) throw new Error("Wallet service not configured. Call SET_CONFIG with nearRpcUrl/contractId first.");
	if (!nearClient) nearClient = new MinimalNearClient(walletConfigs.nearRpcUrl);
	if (!webAuthnManager) webAuthnManager = new WebAuthnManager(walletConfigs, nearClient);
}
function post(msg) {
	try {
		port?.postMessage(msg);
	} catch {}
}
function onPortMessage(e) {
	const req = e.data;
	if (!req || typeof req !== "object") return;
	const requestId = req.requestId;
	if (req.type === "PING") {
		post({
			type: "PONG",
			requestId
		});
		return;
	}
	if (req.type === "SET_CONFIG") {
		walletConfigs = {
			nearRpcUrl: req.payload?.nearRpcUrl || walletConfigs?.nearRpcUrl || "",
			nearNetwork: req.payload?.nearNetwork || walletConfigs?.nearNetwork || "testnet",
			contractId: req.payload?.contractId || walletConfigs?.contractId || "",
			nearExplorerUrl: walletConfigs?.nearExplorerUrl,
			relayer: req.payload?.relayer || walletConfigs?.relayer || {
				initialUseRelayer: true,
				accountId: "",
				url: ""
			},
			authenticatorOptions: walletConfigs?.authenticatorOptions,
			vrfWorkerConfigs: req.payload?.vrfWorkerConfigs || walletConfigs?.vrfWorkerConfigs,
			walletOrigin: void 0,
			walletServicePath: void 0,
			walletTheme: req.payload?.theme || walletConfigs?.walletTheme
		};
		nearClient = null;
		webAuthnManager = null;
		post({
			type: "PONG",
			requestId
		});
		return;
	}
	(async () => {
		try {
			switch (req.type) {
				case "REQUEST_signTransactionsWithActions":
				case "REQUEST_SIGN": {
					ensureManagers();
					const p = req.payload || {};
					const nearAccountId = p.nearAccountId;
					const txs = Array.isArray(p.txSigningRequests) ? p.txSigningRequests : [];
					const wasmTxs = txs.map((t) => ({
						receiverId: t.receiverId,
						actions: (t.actions || []).map((a) => toActionArgsWasm(a))
					}));
					const rpcCall = {
						contractId: walletConfigs.contractId,
						nearRpcUrl: walletConfigs.nearRpcUrl,
						nearAccountId
					};
					const confirmationConfig = p.confirmationConfig;
					const results = await webAuthnManager.signTransactionsWithActions({
						transactions: wasmTxs,
						rpcCall,
						confirmationConfigOverride: confirmationConfig,
						onEvent: (ev) => {
							post({
								type: "PROGRESS",
								payload: {
									step: ev.step,
									phase: ev.phase,
									status: ev.status,
									message: ev.message,
									data: ev.data
								}
							});
						}
					});
					post({
						type: "SIGN_RESULT",
						requestId,
						payload: {
							success: true,
							signedTransactions: results
						}
					});
					return;
				}
				case "REQUEST_signVerifyAndRegisterUser":
					post({
						type: "ERROR",
						requestId,
						payload: {
							code: "NOT_IMPLEMENTED",
							message: "Registration handler not yet wired"
						}
					});
					return;
				case "REQUEST_decryptPrivateKeyWithPrf":
				case "REQUEST_deriveNearKeypairAndEncrypt":
				case "REQUEST_recoverKeypairFromPasskey":
				case "REQUEST_signTransactionWithKeyPair":
				case "REQUEST_signNep413Message":
					post({
						type: "ERROR",
						requestId,
						payload: {
							code: "NOT_IMPLEMENTED",
							message: `Handler not yet wired (${req.type})`
						}
					});
					return;
				case "DB_GET_USER": {
					const { nearAccountId } = req.payload || {};
					const result = await clientDB.getUser(nearAccountId);
					post({
						type: "DB_RESULT",
						requestId,
						payload: {
							ok: true,
							result
						}
					});
					return;
				}
				case "DB_GET_LAST_USER": {
					const result = await clientDB.getLastUser();
					post({
						type: "DB_RESULT",
						requestId,
						payload: {
							ok: true,
							result
						}
					});
					return;
				}
				case "DB_SET_LAST_USER": {
					const { nearAccountId, deviceNumber } = req.payload || {};
					await clientDB.setLastUser(nearAccountId, deviceNumber ?? 1);
					post({
						type: "DB_RESULT",
						requestId,
						payload: { ok: true }
					});
					return;
				}
				case "DB_GET_PREFERENCES": {
					const { nearAccountId } = req.payload || {};
					const user = await clientDB.getUser(nearAccountId);
					post({
						type: "DB_RESULT",
						requestId,
						payload: {
							ok: true,
							result: user?.preferences || null
						}
					});
					return;
				}
				case "DB_UPDATE_PREFERENCES": {
					const { nearAccountId, patch } = req.payload || {};
					await clientDB.updatePreferences(nearAccountId, patch || {});
					const user = await clientDB.getUser(nearAccountId);
					post({
						type: "DB_RESULT",
						requestId,
						payload: {
							ok: true,
							result: user?.preferences || null
						}
					});
					return;
				}
				case "DB_GET_CONFIRMATION_CONFIG": {
					const { nearAccountId } = req.payload || {};
					const result = await clientDB.getConfirmationConfig(nearAccountId);
					post({
						type: "DB_RESULT",
						requestId,
						payload: {
							ok: true,
							result
						}
					});
					return;
				}
				case "DB_GET_THEME": {
					const { nearAccountId } = req.payload || {};
					const result = await clientDB.getTheme(nearAccountId);
					post({
						type: "DB_RESULT",
						requestId,
						payload: {
							ok: true,
							result
						}
					});
					return;
				}
				case "DB_SET_THEME": {
					const { nearAccountId, theme } = req.payload || {};
					await clientDB.setTheme(nearAccountId, theme);
					post({
						type: "DB_RESULT",
						requestId,
						payload: {
							ok: true,
							result: theme
						}
					});
					return;
				}
				case "DB_TOGGLE_THEME": {
					const { nearAccountId } = req.payload || {};
					const result = await clientDB.toggleTheme(nearAccountId);
					post({
						type: "DB_RESULT",
						requestId,
						payload: {
							ok: true,
							result
						}
					});
					return;
				}
				case "DB_GET_AUTHENTICATORS": {
					const { nearAccountId } = req.payload || {};
					const result = await clientDB.getAuthenticatorsByUser(nearAccountId);
					post({
						type: "DB_RESULT",
						requestId,
						payload: {
							ok: true,
							result
						}
					});
					return;
				}
				case "DB_STORE_AUTHENTICATOR": {
					const { record } = req.payload || {};
					await clientDB.storeAuthenticator(record);
					post({
						type: "DB_RESULT",
						requestId,
						payload: { ok: true }
					});
					return;
				}
				case "REQUEST_decryptPrivateKeyWithPrf": {
					ensureManagers();
					const { nearAccountId } = req.payload || {};
					const result = await webAuthnManager.exportNearKeypairWithTouchId(nearAccountId);
					post({
						type: "DB_RESULT",
						requestId,
						payload: {
							ok: true,
							result: {
								decryptedPrivateKey: result.privateKey,
								nearAccountId: result.accountId
							}
						}
					});
					return;
				}
				case "REQUEST_signTransactionWithKeyPair": {
					ensureManagers();
					const { nearPrivateKey, signerAccountId, receiverId, nonce, blockHash, actions } = req.payload || {};
					const wasmActions = (actions || []).map((a) => toActionArgsWasm(a));
					const result = await webAuthnManager.signTransactionWithKeyPair({
						nearPrivateKey,
						signerAccountId,
						receiverId,
						nonce,
						blockHash,
						actions: wasmActions
					});
					post({
						type: "SIGN_RESULT",
						requestId,
						payload: {
							success: true,
							signedTransactions: [result]
						}
					});
					return;
				}
				case "REQUEST_signNep413Message": {
					ensureManagers();
					const { nearAccountId, message, recipient, state } = req.payload || {};
					const { nextNonce, txBlockHash, txBlockHeight } = await webAuthnManager.getNonceManager().getNonceBlockHashAndHeight(nearClient);
					const vrfChallenge = await webAuthnManager.generateVrfChallenge({
						userId: nearAccountId,
						rpId: window.location.hostname,
						blockHash: txBlockHash,
						blockHeight: txBlockHeight
					});
					const authenticators = await webAuthnManager.getAuthenticatorsByUser(nearAccountId);
					const credential = await webAuthnManager.getCredentials({
						nearAccountId,
						challenge: vrfChallenge,
						authenticators
					});
					const result = await webAuthnManager.signNEP413Message({
						message,
						recipient,
						nonce: nextNonce,
						state: state ?? null,
						accountId: nearAccountId,
						credential
					});
					post({
						type: "NEP413_RESULT",
						requestId,
						payload: result
					});
					return;
				}
				case "REQUEST_deriveNearKeypairAndEncrypt": {
					ensureManagers();
					const { nearAccountId, credential, options } = req.payload || {};
					const result = await webAuthnManager.deriveNearKeypairAndEncrypt({
						nearAccountId,
						credential,
						options
					});
					post({
						type: "DB_RESULT",
						requestId,
						payload: {
							ok: true,
							result
						}
					});
					return;
				}
				case "REQUEST_recoverKeypairFromPasskey": {
					ensureManagers();
					const { authenticationCredential, accountIdHint } = req.payload || {};
					const result = await webAuthnManager.recoverKeypairFromPasskey(authenticationCredential, accountIdHint);
					post({
						type: "DB_RESULT",
						requestId,
						payload: {
							ok: true,
							result
						}
					});
					return;
				}
				case "REQUEST_signVerifyAndRegisterUser": {
					ensureManagers();
					const { contractId, credential, vrfChallenge, deterministicVrfPublicKey, nearAccountId, nearPublicKeyStr, deviceNumber, authenticatorOptions } = req.payload || {};
					const regResult = await webAuthnManager.signVerifyAndRegisterUser({
						contractId: contractId || walletConfigs.contractId,
						credential,
						vrfChallenge,
						deterministicVrfPublicKey,
						nearAccountId,
						nearPublicKeyStr,
						nearClient,
						deviceNumber: deviceNumber ?? 1,
						authenticatorOptions
					});
					post({
						type: "REGISTER_RESULT",
						requestId,
						payload: regResult
					});
					return;
				}
			}
			post({
				type: "ERROR",
				requestId,
				payload: {
					code: "NOT_IMPLEMENTED",
					message: `Handler not implemented for ${req.type}`
				}
			});
		} catch (err) {
			post({
				type: "ERROR",
				requestId,
				payload: {
					code: "DB_ERROR",
					message: err?.message || String(err)
				}
			});
		}
	})();
}
function adoptPort(p) {
	port = p;
	port.onmessage = onPortMessage;
	port.start?.();
	post({
		type: "READY",
		payload: { protocolVersion: PROTOCOL }
	});
}
function onWindowMessage(e) {
	const { data, ports } = e;
	if (!data || typeof data !== "object") return;
	if (data.type === "CONNECT" && ports && ports[0]) adoptPort(ports[0]);
}
try {
	window.addEventListener("message", onWindowMessage);
} catch {}

//#endregion