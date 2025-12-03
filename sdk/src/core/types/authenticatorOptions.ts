import * as wasmModule from '../../wasm_signer_worker/pkg/wasm_signer_worker.js';

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
export enum UserVerificationPolicy {
  Required = 'required',
  Preferred = 'preferred',
  Discouraged = 'discouraged'
}

/**
 * Origin policy input for WebAuthn registration (matches WASM OriginPolicyInput struct)
 * Note: choose only one of the fields: single, all_subdomains, multiple
 */
export interface OriginPolicyInput {
  single: boolean | undefined;
  all_subdomains: boolean | undefined;
  multiple: string[] | undefined;
}

export const toEnumUserVerificationPolicy = (userVerification: UserVerificationPolicy | undefined): wasmModule.UserVerificationPolicy => {
  switch (userVerification) {
    case UserVerificationPolicy.Required:
      return wasmModule.UserVerificationPolicy.Required;
    case UserVerificationPolicy.Preferred:
      return wasmModule.UserVerificationPolicy.Preferred;
    case UserVerificationPolicy.Discouraged:
      return wasmModule.UserVerificationPolicy.Discouraged;
    default:
      return wasmModule.UserVerificationPolicy.Preferred;
  }
};

export interface AuthenticatorOptions {
  userVerification: UserVerificationPolicy;
  originPolicy: OriginPolicyInput;
}

/**
 * Default authenticator options (matches contract defaults)
 */
export const DEFAULT_AUTHENTICATOR_OPTIONS: AuthenticatorOptions = {
  userVerification: UserVerificationPolicy.Preferred,
  originPolicy: {
    single: undefined,
    all_subdomains: true,
    multiple: undefined
  }
};
