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
 * Origin policy input for WebAuthn registration (user-provided)
 */
export type OriginPolicyInput =
  | 'single'
  | { multiple: string[] }
  | 'allSubdomains';

/**
 * Options for configuring WebAuthn authenticator behavior during registration
 *
 * @example
 * ```typescript
 * // Require user verification with multiple allowed origins
 * {
 *   user_verification: UserVerificationPolicy.Required,
 *   origin_policy: OriginPolicyInput.multiple(['app.example.com', 'admin.example.com'])
 * }
 *
 * // Preferred user verification with all subdomains allowed
 * {
 *   user_verification: UserVerificationPolicy.Preferred,
 *   origin_policy: "allSubdomains"
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
  origin_policy: 'allSubdomains'
};