const require_passkeyManager = require('./passkeyManager.js');

//#region src/core/types/linkDevice.ts
var DeviceLinkingError = class extends Error {
	constructor(message, code, phase) {
		super(message);
		this.code = code;
		this.phase = phase;
	}
};
let DeviceLinkingErrorCode = /* @__PURE__ */ function(DeviceLinkingErrorCode$1) {
	DeviceLinkingErrorCode$1["INVALID_QR_DATA"] = "INVALID_QR_DATA";
	DeviceLinkingErrorCode$1["ACCOUNT_NOT_OWNED"] = "ACCOUNT_NOT_OWNED";
	DeviceLinkingErrorCode$1["AUTHORIZATION_TIMEOUT"] = "AUTHORIZATION_TIMEOUT";
	DeviceLinkingErrorCode$1["INSUFFICIENT_BALANCE"] = "INSUFFICIENT_BALANCE";
	DeviceLinkingErrorCode$1["REGISTRATION_FAILED"] = "REGISTRATION_FAILED";
	DeviceLinkingErrorCode$1["SESSION_EXPIRED"] = "SESSION_EXPIRED";
	return DeviceLinkingErrorCode$1;
}({});

//#endregion
exports.DeviceLinkingError = DeviceLinkingError;
exports.DeviceLinkingErrorCode = DeviceLinkingErrorCode;
//# sourceMappingURL=linkDevice.js.map