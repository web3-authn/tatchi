const require_wasm_signer_worker = require('../../wasm_signer_worker/wasm_signer_worker.js');

//#region src/core/types/signer-worker.ts
const DEFAULT_CONFIRMATION_CONFIG = {
	uiMode: "modal",
	behavior: "autoProceed",
	autoProceedDelay: 1e3,
	theme: "dark"
};
function isWorkerProgress(response) {
	return response.type === require_wasm_signer_worker.WorkerResponseType.RegistrationProgress || response.type === require_wasm_signer_worker.WorkerResponseType.RegistrationComplete || response.type === require_wasm_signer_worker.WorkerResponseType.ExecuteActionsProgress || response.type === require_wasm_signer_worker.WorkerResponseType.ExecuteActionsComplete;
}
function isWorkerSuccess(response) {
	return response.type === require_wasm_signer_worker.WorkerResponseType.DeriveNearKeypairAndEncryptSuccess || response.type === require_wasm_signer_worker.WorkerResponseType.RecoverKeypairFromPasskeySuccess || response.type === require_wasm_signer_worker.WorkerResponseType.CheckCanRegisterUserSuccess || response.type === require_wasm_signer_worker.WorkerResponseType.DecryptPrivateKeyWithPrfSuccess || response.type === require_wasm_signer_worker.WorkerResponseType.SignTransactionsWithActionsSuccess || response.type === require_wasm_signer_worker.WorkerResponseType.ExtractCosePublicKeySuccess || response.type === require_wasm_signer_worker.WorkerResponseType.SignTransactionWithKeyPairSuccess || response.type === require_wasm_signer_worker.WorkerResponseType.SignNep413MessageSuccess || response.type === require_wasm_signer_worker.WorkerResponseType.SignVerifyAndRegisterUserSuccess;
}
function isWorkerError(response) {
	return response.type === require_wasm_signer_worker.WorkerResponseType.DeriveNearKeypairAndEncryptFailure || response.type === require_wasm_signer_worker.WorkerResponseType.RecoverKeypairFromPasskeyFailure || response.type === require_wasm_signer_worker.WorkerResponseType.CheckCanRegisterUserFailure || response.type === require_wasm_signer_worker.WorkerResponseType.DecryptPrivateKeyWithPrfFailure || response.type === require_wasm_signer_worker.WorkerResponseType.SignTransactionsWithActionsFailure || response.type === require_wasm_signer_worker.WorkerResponseType.ExtractCosePublicKeyFailure || response.type === require_wasm_signer_worker.WorkerResponseType.SignTransactionWithKeyPairFailure || response.type === require_wasm_signer_worker.WorkerResponseType.SignNep413MessageFailure || response.type === require_wasm_signer_worker.WorkerResponseType.SignVerifyAndRegisterUserFailure;
}
function isDeriveNearKeypairAndEncryptSuccess(response) {
	return response.type === require_wasm_signer_worker.WorkerResponseType.DeriveNearKeypairAndEncryptSuccess;
}
function isRecoverKeypairFromPasskeySuccess(response) {
	return response.type === require_wasm_signer_worker.WorkerResponseType.RecoverKeypairFromPasskeySuccess;
}
function isCheckCanRegisterUserSuccess(response) {
	return response.type === require_wasm_signer_worker.WorkerResponseType.CheckCanRegisterUserSuccess;
}
function isSignVerifyAndRegisterUserSuccess(response) {
	return response.type === require_wasm_signer_worker.WorkerResponseType.SignVerifyAndRegisterUserSuccess;
}
function isSignTransactionsWithActionsSuccess(response) {
	return response.type === require_wasm_signer_worker.WorkerResponseType.SignTransactionsWithActionsSuccess;
}
function isDecryptPrivateKeyWithPrfSuccess(response) {
	return response.type === require_wasm_signer_worker.WorkerResponseType.DecryptPrivateKeyWithPrfSuccess;
}
function isExtractCosePublicKeySuccess(response) {
	return response.type === require_wasm_signer_worker.WorkerResponseType.ExtractCosePublicKeySuccess;
}
function isSignNep413MessageSuccess(response) {
	return response.type === require_wasm_signer_worker.WorkerResponseType.SignNep413MessageSuccess;
}

//#endregion
exports.DEFAULT_CONFIRMATION_CONFIG = DEFAULT_CONFIRMATION_CONFIG;
exports.isCheckCanRegisterUserSuccess = isCheckCanRegisterUserSuccess;
exports.isDecryptPrivateKeyWithPrfSuccess = isDecryptPrivateKeyWithPrfSuccess;
exports.isDeriveNearKeypairAndEncryptSuccess = isDeriveNearKeypairAndEncryptSuccess;
exports.isExtractCosePublicKeySuccess = isExtractCosePublicKeySuccess;
exports.isRecoverKeypairFromPasskeySuccess = isRecoverKeypairFromPasskeySuccess;
exports.isSignNep413MessageSuccess = isSignNep413MessageSuccess;
exports.isSignTransactionsWithActionsSuccess = isSignTransactionsWithActionsSuccess;
exports.isSignVerifyAndRegisterUserSuccess = isSignVerifyAndRegisterUserSuccess;
exports.isWorkerError = isWorkerError;
exports.isWorkerProgress = isWorkerProgress;
exports.isWorkerSuccess = isWorkerSuccess;
//# sourceMappingURL=signer-worker.js.map