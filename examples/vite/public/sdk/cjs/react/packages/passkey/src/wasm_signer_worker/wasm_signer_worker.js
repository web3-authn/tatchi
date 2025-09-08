
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
const UserVerificationPolicy = Object.freeze({
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
exports.UserVerificationPolicy = UserVerificationPolicy;
exports.WorkerRequestType = WorkerRequestType;
exports.WorkerResponseType = WorkerResponseType;
//# sourceMappingURL=wasm_signer_worker.js.map