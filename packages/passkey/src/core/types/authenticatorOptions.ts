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
 * Origin policy input for WebAuthn registration (matches contract OriginPolicy struct)
 * Note: choose only one of the fields: single, allSubdomains, multiple
 */
export interface OriginPolicyInput {
  single?: string | null;
  allSubdomains?: boolean | null;
  multiple?: string[] | null;
}

/**
 * Options for configuring WebAuthn authenticator behavior during registration
 *
 * @example
 * ```typescript
 * // Require user verification with multiple allowed origins
 * {
 *   user_verification: UserVerificationPolicy.Required,
 *   origin_policy: { multiple: ['app.example.com', 'admin.example.com'] }
 * }
 *
 * // Preferred user verification with all subdomains allowed
 * {
 *   user_verification: UserVerificationPolicy.Preferred,
 *   origin_policy: { allSubdomains: true }
 * }
 *
 * // Default options (both fields null)
 * {
 *   user_verification: null,
 *   origin_policy: null
 * }
 * ```
 */
export interface AuthenticatorOptions {
  user_verification?: UserVerificationPolicy | null;
  origin_policy?: OriginPolicyInput | null;
}

/**
 * Default authenticator options (matches contract defaults)
 */
export const DEFAULT_AUTHENTICATOR_OPTIONS: AuthenticatorOptions = {
  user_verification: UserVerificationPolicy.Preferred,
  origin_policy: { allSubdomains: true }
};