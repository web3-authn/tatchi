//#region src/core/types/passkeyManager.ts
let RegistrationPhase = /* @__PURE__ */ function(RegistrationPhase$1) {
	RegistrationPhase$1["STEP_1_WEBAUTHN_VERIFICATION"] = "webauthn-verification";
	RegistrationPhase$1["STEP_2_KEY_GENERATION"] = "key-generation";
	RegistrationPhase$1["STEP_3_ACCESS_KEY_ADDITION"] = "access-key-addition";
	RegistrationPhase$1["STEP_4_ACCOUNT_VERIFICATION"] = "account-verification";
	RegistrationPhase$1["STEP_5_DATABASE_STORAGE"] = "database-storage";
	RegistrationPhase$1["STEP_6_CONTRACT_REGISTRATION"] = "contract-registration";
	RegistrationPhase$1["STEP_7_REGISTRATION_COMPLETE"] = "registration-complete";
	RegistrationPhase$1["REGISTRATION_ERROR"] = "error";
	return RegistrationPhase$1;
}({});
let RegistrationStatus = /* @__PURE__ */ function(RegistrationStatus$1) {
	RegistrationStatus$1["PROGRESS"] = "progress";
	RegistrationStatus$1["SUCCESS"] = "success";
	RegistrationStatus$1["ERROR"] = "error";
	return RegistrationStatus$1;
}({});
let LoginPhase = /* @__PURE__ */ function(LoginPhase$1) {
	LoginPhase$1["STEP_1_PREPARATION"] = "preparation";
	LoginPhase$1["STEP_2_WEBAUTHN_ASSERTION"] = "webauthn-assertion";
	LoginPhase$1["STEP_3_VRF_UNLOCK"] = "vrf-unlock";
	LoginPhase$1["STEP_4_LOGIN_COMPLETE"] = "login-complete";
	LoginPhase$1["LOGIN_ERROR"] = "login-error";
	return LoginPhase$1;
}({});
let LoginStatus = /* @__PURE__ */ function(LoginStatus$1) {
	LoginStatus$1["PROGRESS"] = "progress";
	LoginStatus$1["SUCCESS"] = "success";
	LoginStatus$1["ERROR"] = "error";
	return LoginStatus$1;
}({});
let ActionPhase = /* @__PURE__ */ function(ActionPhase$1) {
	ActionPhase$1["STEP_1_PREPARATION"] = "preparation";
	ActionPhase$1["STEP_2_USER_CONFIRMATION"] = "user-confirmation";
	ActionPhase$1["STEP_3_CONTRACT_VERIFICATION"] = "contract-verification";
	ActionPhase$1["STEP_4_WEBAUTHN_AUTHENTICATION"] = "webauthn-authentication";
	ActionPhase$1["STEP_5_AUTHENTICATION_COMPLETE"] = "authentication-complete";
	ActionPhase$1["STEP_6_TRANSACTION_SIGNING_PROGRESS"] = "transaction-signing-progress";
	ActionPhase$1["STEP_7_TRANSACTION_SIGNING_COMPLETE"] = "transaction-signing-complete";
	ActionPhase$1["WASM_ERROR"] = "wasm-error";
	ActionPhase$1["STEP_8_BROADCASTING"] = "broadcasting";
	ActionPhase$1["STEP_9_ACTION_COMPLETE"] = "action-complete";
	ActionPhase$1["ACTION_ERROR"] = "action-error";
	return ActionPhase$1;
}({});
let ActionStatus = /* @__PURE__ */ function(ActionStatus$1) {
	ActionStatus$1["PROGRESS"] = "progress";
	ActionStatus$1["SUCCESS"] = "success";
	ActionStatus$1["ERROR"] = "error";
	return ActionStatus$1;
}({});
let AccountRecoveryPhase = /* @__PURE__ */ function(AccountRecoveryPhase$1) {
	AccountRecoveryPhase$1["STEP_1_PREPARATION"] = "preparation";
	AccountRecoveryPhase$1["STEP_2_WEBAUTHN_AUTHENTICATION"] = "webauthn-authentication";
	AccountRecoveryPhase$1["STEP_3_SYNC_AUTHENTICATORS_ONCHAIN"] = "sync-authenticators-onchain";
	AccountRecoveryPhase$1["STEP_4_AUTHENTICATOR_SAVED"] = "authenticator-saved";
	AccountRecoveryPhase$1["STEP_5_ACCOUNT_RECOVERY_COMPLETE"] = "account-recovery-complete";
	AccountRecoveryPhase$1["ERROR"] = "error";
	return AccountRecoveryPhase$1;
}({});
let AccountRecoveryStatus = /* @__PURE__ */ function(AccountRecoveryStatus$1) {
	AccountRecoveryStatus$1["PROGRESS"] = "progress";
	AccountRecoveryStatus$1["SUCCESS"] = "success";
	AccountRecoveryStatus$1["ERROR"] = "error";
	return AccountRecoveryStatus$1;
}({});
let DeviceLinkingPhase = /* @__PURE__ */ function(DeviceLinkingPhase$1) {
	DeviceLinkingPhase$1["STEP_1_QR_CODE_GENERATED"] = "qr-code-generated";
	DeviceLinkingPhase$1["STEP_2_SCANNING"] = "scanning";
	DeviceLinkingPhase$1["STEP_3_AUTHORIZATION"] = "authorization";
	DeviceLinkingPhase$1["STEP_4_POLLING"] = "polling";
	DeviceLinkingPhase$1["STEP_5_ADDKEY_DETECTED"] = "addkey-detected";
	DeviceLinkingPhase$1["STEP_6_REGISTRATION"] = "registration";
	DeviceLinkingPhase$1["STEP_7_LINKING_COMPLETE"] = "linking-complete";
	DeviceLinkingPhase$1["STEP_8_AUTO_LOGIN"] = "auto-login";
	DeviceLinkingPhase$1["IDLE"] = "idle";
	DeviceLinkingPhase$1["REGISTRATION_ERROR"] = "registration-error";
	DeviceLinkingPhase$1["LOGIN_ERROR"] = "login-error";
	DeviceLinkingPhase$1["DEVICE_LINKING_ERROR"] = "error";
	return DeviceLinkingPhase$1;
}({});
let DeviceLinkingStatus = /* @__PURE__ */ function(DeviceLinkingStatus$1) {
	DeviceLinkingStatus$1["PROGRESS"] = "progress";
	DeviceLinkingStatus$1["SUCCESS"] = "success";
	DeviceLinkingStatus$1["ERROR"] = "error";
	return DeviceLinkingStatus$1;
}({});

//#endregion
export { AccountRecoveryPhase, AccountRecoveryStatus, ActionPhase, ActionStatus, DeviceLinkingPhase, DeviceLinkingStatus, LoginPhase, LoginStatus, RegistrationPhase, RegistrationStatus };
//# sourceMappingURL=passkeyManager.js.map