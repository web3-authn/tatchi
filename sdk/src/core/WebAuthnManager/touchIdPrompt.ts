import { ClientAuthenticatorData } from '../IndexedDBManager';
import { base64UrlDecode } from '../../utils/encoders';
import { outputAs32Bytes, VRFChallenge } from '../types/vrf-worker';
import { serializeAuthenticationCredentialWithPRF } from './credentialsHelpers';
import type {
  WebAuthnAuthenticationCredential,
  WebAuthnRegistrationCredential
} from '../types/webauthn';
import { executeWithFallbacks } from './WebAuthnFallbacks';
// Local rpId policy helpers (moved back from WebAuthnFallbacks)
function isRegistrableSuffix(host: string, cand: string): boolean {
  if (!host || !cand) return false;
  if (host === cand) return true;
  return host.endsWith('.' + cand);
}

function resolveRpId(override: string | undefined, host: string | undefined): string {
  const h = (host || '').toLowerCase();
  const ov = (override || '').toLowerCase();
  if (ov && h && isRegistrableSuffix(h, ov)) return ov;
  return h || ov || '';
}

export interface RegisterCredentialsArgs {
  nearAccountId: string,    // NEAR account ID for PRF salts and keypair derivation (always base account)
  challenge: VRFChallenge,
  deviceNumber?: number, // Optional device number for device-specific user ID (0, 1, 2, etc.)
}

export interface AuthenticateCredentialsArgs {
  nearAccountId: string,
  challenge: VRFChallenge,
  allowCredentials: AllowCredential[],
}

export interface AllowCredential {
  id: string,
  type: string,
  transports: AuthenticatorTransport[]
}

export function authenticatorsToAllowCredentials(
  authenticators: ClientAuthenticatorData[]
): AllowCredential[] {
  return authenticators.map(auth => ({
    id: auth.credentialId,
    type: 'public-key',
    transports: auth.transports as AuthenticatorTransport[]
  }));
}

// Utility: inspect a serialized registration credential for dual PRF results and log helpful context.
// Throws a specific Error when either PRF output is missing so callers can surface a precise message.
export function assertCredentialHasDualPrf(
  credential: WebAuthnRegistrationCredential,
  label: string = 'Registration',
): void {
  try {
    const prf: any = (credential as any)?.clientExtensionResults?.prf?.results;
    const hasFirst = typeof prf?.first === 'string' && prf.first.length > 0;
    const hasSecond = typeof prf?.second === 'string' && prf.second.length > 0;
    const ua = (typeof navigator !== 'undefined' ? navigator.userAgent : 'server');
    console.warn(`[${label}] PRF presence in credential`, { hasFirst, hasSecond, ua });
    if (!hasFirst || !hasSecond) {
      // Non-authoritative hint to aid debugging across devices
      const hint = [
        '[PRF] Some mobile browsers do not return PRF results on create().',
        'We detect this at runtime; see docs/mobile-registration-errors.md for mitigations.'
      ].join(' ');
      console.warn(hint);
      throw new Error('PRF outputs missing from serialized credential');
    }
  } catch (e) {
    // If inspection itself fails, do not mask the original failure path; just rethrow
    if (e instanceof Error) throw e;
    throw new Error('PRF outputs missing from serialized credential');
  }
}

/**
 * Generate ChaCha20Poly1305 salt using account-specific HKDF for encryption key derivation
 * @param nearAccountId - NEAR account ID to scope the salt to
 * @returns 32-byte Uint8Array salt for ChaCha20Poly1305 key derivation
 */
export function generateChaCha20Salt(nearAccountId: string): Uint8Array {
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
export function generateEd25519Salt(nearAccountId: string): Uint8Array {
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
export class TouchIdPrompt {
  private rpIdOverride?: string;
  private safariGetWebauthnRegistrationFallback: boolean;

  constructor(rpIdOverride?: string, safariGetWebauthnRegistrationFallback = false) {
    this.rpIdOverride = rpIdOverride;
    this.safariGetWebauthnRegistrationFallback = safariGetWebauthnRegistrationFallback === true;
  }

  getRpId(): string {
    try {
      return resolveRpId(this.rpIdOverride, window?.location?.hostname);
    } catch {
      return this.rpIdOverride || '';
    }
  }

  // Utility helpers for cross‑origin fallback
  private static _inIframe(): boolean {
    try { return window.self !== window.top; } catch { return true; }
  }

  /**
   * Get authentication credentials
   * @param nearAccountId - NEAR account ID to authenticate
   * @param challenge - VRF challenge bytes
   * @param allowCredentials - Array of allowed credentials for authentication
   * @returns WebAuthn credential with only the first PRF output
   */
  async getAuthenticationCredentialsSerialized({
    nearAccountId,
    challenge,
    allowCredentials,
  }: {
    nearAccountId: string
    challenge: VRFChallenge
    allowCredentials: AllowCredential[]
  }): Promise<WebAuthnAuthenticationCredential> {
    const credentialMaybe = (await this.getAuthenticationCredentialsInternal({
      nearAccountId,
      challenge,
      allowCredentials,
    })) as unknown;
    // Support parent-bridge fallback returning an already-serialized credential
    if (isSerializedAuthenticationCredential(credentialMaybe)) {
      return credentialMaybe;
    }
    return serializeAuthenticationCredentialWithPRF({
      credential: credentialMaybe as PublicKeyCredential,
      firstPrfOutput: true,
      secondPrfOutput: false,
    })
  }

  /**
   *  Same as getAuthenticationCredentialsSerialized but returns both PRF outputs
   *  Used for account recovery where both PRF outputs are needed
   * @param nearAccountId - NEAR account ID to authenticate
   * @param challenge - VRF challenge bytes
   * @param allowCredentials - Array of allowed credentials for authentication
   * @returns
   */
  async getAuthenticationCredentialsForRecovery({
    nearAccountId,
    challenge,
    allowCredentials,
  }: {
    nearAccountId: string,
    challenge: VRFChallenge,
    allowCredentials: AllowCredential[],
  }): Promise<WebAuthnAuthenticationCredential> {
    const credentialMaybe = (await this.getAuthenticationCredentialsInternal({
      nearAccountId,
      challenge,
      allowCredentials,
    })) as unknown;
    // Support parent-bridge fallback returning an already-serialized credential
    if (isSerializedAuthenticationCredential(credentialMaybe)) {
      return credentialMaybe;
    }
    return serializeAuthenticationCredentialWithPRF({
      credential: credentialMaybe as PublicKeyCredential,
      firstPrfOutput: true,
      secondPrfOutput: true,
    });
  }

  /**
   * Internal method for generating WebAuthn registration credentials with PRF output
   * @param nearAccountId - NEAR account ID for PRF salts and keypair derivation (always base account)
   * @param challenge - Random challenge bytes for the registration ceremony
   * @param deviceNumber - Device number for device-specific user ID.
   * @returns Credential with PRF output
   */
  async generateRegistrationCredentialsInternal({
    nearAccountId,
    challenge,
    deviceNumber,
  }: RegisterCredentialsArgs): Promise<PublicKeyCredential> {
    // Single source of truth for rpId: use getRpId().
    const rpId = this.getRpId();
    const publicKey: PublicKeyCredentialCreationOptions = {
      challenge: outputAs32Bytes(challenge) as BufferSource,
      rp: {
        name: 'WebAuthn VRF Passkey',
        id: rpId
      },
      user: {
        id: new TextEncoder().encode(generateDeviceSpecificUserId(nearAccountId, deviceNumber)),
        name: generateDeviceSpecificUserId(nearAccountId, deviceNumber),
        displayName: generateUserFriendlyDisplayName(nearAccountId, deviceNumber)
      },
      pubKeyCredParams: [ { alg: -7, type: 'public-key' }, { alg: -257, type: 'public-key' } ],
      authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
      timeout: 60000,
      attestation: 'none',
      extensions: {
        prf: {
          eval: {
            // Always use NEAR account ID for PRF salts to ensure consistent keypair derivation across devices
            first: generateChaCha20Salt(nearAccountId) as BufferSource,  // ChaCha20Poly1305 encryption keys
            second: generateEd25519Salt(nearAccountId) as BufferSource   // Ed25519 signing keys
          }
        }
      },
    };
    const result = await executeWithFallbacks('create', publicKey, {
      rpId,
      inIframe: TouchIdPrompt._inIframe(),
      timeoutMs: publicKey.timeout as number | undefined,
    });
    return result as PublicKeyCredential;
  }

  /**
   * Internal method for getting WebAuthn authentication credentials with PRF output
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
  async getAuthenticationCredentialsInternal({
    nearAccountId,
    challenge,
    allowCredentials,
  }: AuthenticateCredentialsArgs): Promise<PublicKeyCredential> {
    // Single source of truth for rpId: use getRpId().
    const rpId = this.getRpId();
    const publicKey: PublicKeyCredentialRequestOptions = {
      challenge: outputAs32Bytes(challenge) as BufferSource,
      rpId,
      allowCredentials: allowCredentials.map((credential) => ({
        id: base64UrlDecode(credential.id) as BufferSource,
        type: 'public-key' as PublicKeyCredentialType,
        transports: credential.transports,
      })),
      userVerification: 'preferred' as UserVerificationRequirement,
      timeout: 60000,
      extensions: {
        prf: {
          eval: {
            // Always use NEAR account ID for PRF salts to ensure consistent keypair derivation across devices
            first: generateChaCha20Salt(nearAccountId) as BufferSource,  // ChaCha20Poly1305 encryption keys
            second: generateEd25519Salt(nearAccountId) as BufferSource   // Ed25519 signing keys
          }
        }
      }
    };
    const result = await executeWithFallbacks('get', publicKey, {
      rpId,
      inIframe: TouchIdPrompt._inIframe(),
      timeoutMs: publicKey.timeout as number | undefined,
      permitGetBridgeOnAncestorError: this.safariGetWebauthnRegistrationFallback,
    });
    return result as PublicKeyCredential;
  }
}

// Type guard for already-serialized authentication credential
function isSerializedAuthenticationCredential(x: unknown): x is WebAuthnAuthenticationCredential {
  if (!x || typeof x !== 'object') return false;
  const obj = x as { response?: unknown };
  const resp = obj.response as { authenticatorData?: unknown } | undefined;
  return typeof resp?.authenticatorData === 'string';
}

/**
 * Generate device-specific user ID to prevent Chrome sync conflicts
 * Creates technical identifiers with full account context
 *
 * @param nearAccountId - The NEAR account ID (e.g., "serp120.w3a-v1.testnet")
 * @param deviceNumber - The device number (optional, undefined for device 1, 2 for device 2, etc.)
 * @returns Technical identifier:
 *   - Device 1: "serp120.web3-authn.testnet"
 *   - Device 2: "serp120.web3-authn.testnet (2)"
 *   - Device 3: "serp120.web3-authn.testnet (3)"
 */
export function generateDeviceSpecificUserId(nearAccountId: string, deviceNumber?: number): string {
  // If no device number provided or device number is 1, this is the first device
  if (deviceNumber === undefined || deviceNumber === 1) {
    return nearAccountId;
  }
  // For additional devices, add device number in parentheses
  return `${nearAccountId} (${deviceNumber})`;
}

/**
 * Generate user-friendly display name for passkey manager UI
 * Creates clean, intuitive names that users will see
 *
 * @param nearAccountId - The NEAR account ID (e.g., "serp120.w3a-v1.testnet")
 * @param deviceNumber - The device number (optional, undefined for device 1, 2 for device 2, etc.)
 * @returns User-friendly display name:
 *   - Device 1: "serp120"
 *   - Device 2: "serp120 (device 2)"
 *   - Device 3: "serp120 (device 3)"
 */
function generateUserFriendlyDisplayName(nearAccountId: string, deviceNumber?: number): string {
  // Extract the base username (everything before the first dot)
  const baseUsername = nearAccountId.split('.')[0];
  // If no device number provided or device number is 1, this is the first device
  if (deviceNumber === undefined || deviceNumber === 1) {
    return baseUsername;
  }
  // For additional devices, add device number with friendly label
  return `${baseUsername} (device ${deviceNumber})`;
}
