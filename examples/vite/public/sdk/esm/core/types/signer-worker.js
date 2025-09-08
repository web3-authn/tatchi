import { WorkerRequestType, WorkerResponseType } from "../../wasm_signer_worker/wasm_signer_worker.js";

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
export { DEFAULT_CONFIRMATION_CONFIG, isCheckCanRegisterUserSuccess, isDecryptPrivateKeyWithPrfSuccess, isDeriveNearKeypairAndEncryptSuccess, isExtractCosePublicKeySuccess, isRecoverKeypairFromPasskeySuccess, isSignNep413MessageSuccess, isSignTransactionsWithActionsSuccess, isSignVerifyAndRegisterUserSuccess, isWorkerError, isWorkerProgress, isWorkerSuccess };
//# sourceMappingURL=signer-worker.js.map