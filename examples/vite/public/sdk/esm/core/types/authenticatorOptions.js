import { UserVerificationPolicy as UserVerificationPolicy$1 } from "../../wasm_signer_worker/wasm_signer_worker.js";

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
export { DEFAULT_AUTHENTICATOR_OPTIONS, toEnumUserVerificationPolicy };
//# sourceMappingURL=authenticatorOptions.js.map