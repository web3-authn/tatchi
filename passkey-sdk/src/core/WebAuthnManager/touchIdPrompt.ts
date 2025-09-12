import { ClientAuthenticatorData } from '../IndexedDBManager';
import { base64Decode, base64UrlDecode } from '../../utils/encoders';
import { outputAs32Bytes, VRFChallenge } from '../types/vrf-worker';
import { serializeAuthenticationCredentialWithPRF, serializeRegistrationCredential, serializeRegistrationCredentialWithPRF } from './credentialsHelpers';
import type {
  WebAuthnAuthenticationCredential,
  WebAuthnRegistrationCredential
} from '../types/webauthn';

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

  constructor(rpIdOverride?: string) {
    this.rpIdOverride = rpIdOverride;
  }

  private getRpId(): string {
    // Use override only if it's a valid registrable suffix of current host
    try {
      const host = (window?.location?.hostname || '').toLowerCase();
      const override = (this.rpIdOverride || '').toLowerCase();
      if (override && TouchIdPrompt._isRegistrableSuffix(host, override)) return override;
      return host;
    } catch {
      return (this.rpIdOverride || '');
    }
  }

  /**
   * Minimal check: override must equal host or be a dot-suffix of host.
   * e.g. host = wallet.example.localhost → override example.localhost is allowed.
   */
  private static _isRegistrableSuffix(host: string, cand: string): boolean {
    if (!host || !cand) return false;
    if (host === cand) return true;
    return host.endsWith('.' + cand);
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
    const credential = await this.getAuthenticationCredentialsInternal({
      nearAccountId,
      challenge,
      allowCredentials,
    });
    return serializeAuthenticationCredentialWithPRF({
      credential,
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
    allowCredentials
  }: {
    nearAccountId: string,
    challenge: VRFChallenge,
    allowCredentials: AllowCredential[],
  }): Promise<WebAuthnAuthenticationCredential> {
    const credential = await this.getAuthenticationCredentialsInternal({
      nearAccountId,
      challenge,
      allowCredentials
    });
    return serializeAuthenticationCredentialWithPRF({
      credential,
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
    deviceNumber
  }: RegisterCredentialsArgs): Promise<PublicKeyCredential> {
    return await navigator.credentials.create({
      publicKey: {
        challenge: outputAs32Bytes(challenge),
        rp: {
          name: 'WebAuthn VRF Passkey',
          id: this.getRpId()
        },
        user: {
          // CRITICAL: user.id must be device-specific or
          // Chrome passkey sync will overwrite credentials between devices
          id: new TextEncoder().encode(generateDeviceSpecificUserId(nearAccountId, deviceNumber)),
          name: generateDeviceSpecificUserId(nearAccountId, deviceNumber),
          displayName: generateUserFriendlyDisplayName(nearAccountId, deviceNumber)
        },
        pubKeyCredParams: [
          { alg: -7, type: 'public-key' }, // ES256
          { alg: -257, type: 'public-key' } // RS256
        ],
        authenticatorSelection: {
          residentKey: 'required',
          userVerification: 'preferred'
        },
        timeout: 60000,
        attestation: 'none',
        extensions: {
          prf: {
            eval: {
              // Always use NEAR account ID for PRF salts to ensure consistent keypair derivation across devices
              first: generateChaCha20Salt(nearAccountId),  // ChaCha20Poly1305 encryption keys
              second: generateEd25519Salt(nearAccountId)   // Ed25519 signing keys
            }
          }
        }
      } as PublicKeyCredentialCreationOptions
    }) as PublicKeyCredential
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
    return await navigator.credentials.get({
      publicKey: {
        challenge: outputAs32Bytes(challenge),
        rpId: this.getRpId(),
        allowCredentials: allowCredentials.map(credential => ({
          id: base64UrlDecode(credential.id),
          type: credential.type,
          transports: credential.transports
        })),
        userVerification: 'preferred' as UserVerificationRequirement,
        timeout: 60000,
        extensions: {
          prf: {
            eval: {
              first: generateChaCha20Salt(nearAccountId),  // ChaCha20Poly1305 encryption keys
              second: generateEd25519Salt(nearAccountId)   // Ed25519 signing keys
            }
          }
        }
      } as PublicKeyCredentialRequestOptions
    }) as PublicKeyCredential
  }
}

/**
 * Generate device-specific user ID to prevent Chrome sync conflicts
 * Creates technical identifiers with full account context
 *
 * @param nearAccountId - The NEAR account ID (e.g., "serp120.web3-authn-v5.testnet")
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
 * @param nearAccountId - The NEAR account ID (e.g., "serp120.web3-authn-v5.testnet")
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
