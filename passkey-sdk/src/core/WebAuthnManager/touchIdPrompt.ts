import { ClientAuthenticatorData } from '../IndexedDBManager';
import { base64UrlDecode } from '../../utils/encoders';
import { outputAs32Bytes, VRFChallenge } from '../types/vrf-worker';
import { serializeAuthenticationCredentialWithPRF } from './credentialsHelpers';
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
  private safariGetWebauthnRegistrationFallback: boolean;

  constructor(rpIdOverride?: string, safariGetWebauthnRegistrationFallback = false) {
    this.rpIdOverride = rpIdOverride;
    this.safariGetWebauthnRegistrationFallback = safariGetWebauthnRegistrationFallback === true;
  }

  getRpId(): string {
    // Use override only if it's a valid registrable suffix of current host
    try {
      const host = (window?.location?.hostname || '').toLowerCase();
      const override = (this.rpIdOverride || '').toLowerCase();
      const ok = override && TouchIdPrompt._isRegistrableSuffix(host, override);
      const rp = ok ? override : host;
      return rp;
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

  // Utility helpers for cross‑origin fallback
  private static _inIframe(): boolean {
    try { return window.self !== window.top; } catch { return true; }
  }

  private static _isAncestorOriginError(err: unknown): boolean {
    const msg = String((err as { message?: unknown })?.message || '');
    return /origin of the document is not the same as its ancestors/i.test(msg);
  }

  // PostMessage bridge to parent window for WebAuthn operations
  private async requestParentWebAuthn(
    kind: 'WALLET_WEBAUTHN_GET',
    publicKey: PublicKeyCredentialRequestOptions,
    timeoutMs?: number,
  ): Promise<WebAuthnAuthenticationCredential | null>;
  private async requestParentWebAuthn(
    kind: 'WALLET_WEBAUTHN_CREATE',
    publicKey: PublicKeyCredentialCreationOptions,
    timeoutMs?: number,
  ): Promise<WebAuthnRegistrationCredential | null>;
  private async requestParentWebAuthn(
    kind: 'WALLET_WEBAUTHN_GET' | 'WALLET_WEBAUTHN_CREATE',
    publicKey: PublicKeyCredentialRequestOptions | PublicKeyCredentialCreationOptions,
    timeoutMs = 60000,
  ): Promise<WebAuthnAuthenticationCredential | WebAuthnRegistrationCredential | null> {
    const requestId = `${kind}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    const resultType = kind === 'WALLET_WEBAUTHN_GET' ? 'WALLET_WEBAUTHN_GET_RESULT' : 'WALLET_WEBAUTHN_CREATE_RESULT';

    type GetResult = { type: 'WALLET_WEBAUTHN_GET_RESULT'; requestId: string; ok: boolean; credential?: WebAuthnAuthenticationCredential; error?: string };
    type CreateResult = { type: 'WALLET_WEBAUTHN_CREATE_RESULT'; requestId: string; ok: boolean; credential?: WebAuthnRegistrationCredential; error?: string };

    return new Promise((resolve) => {
      let settled = false;
      const finish = (val: WebAuthnAuthenticationCredential | WebAuthnRegistrationCredential | null) => {
        if (settled) return; settled = true; resolve(val);
      };

      const onMessage = (ev: MessageEvent) => {
        const payload = ev?.data as unknown;
        if (!payload || typeof (payload as { type?: unknown }).type !== 'string') return;
        const t = (payload as { type: string }).type;
        if (t !== resultType) return;
        const rid = (payload as { requestId?: unknown }).requestId;
        if (rid !== requestId) return;
        try { window.removeEventListener('message', onMessage); } catch {}
        const ok = !!(payload as { ok?: unknown }).ok;
        const cred = (payload as GetResult | CreateResult).credential as WebAuthnAuthenticationCredential | WebAuthnRegistrationCredential | undefined;
        finish(ok && cred ? cred : null);
      };
      window.addEventListener('message', onMessage);
      try { window.parent?.postMessage({ type: kind, requestId, publicKey }, '*'); } catch {}
      setTimeout(() => { try { window.removeEventListener('message', onMessage); } catch {}; finish(null); }, timeoutMs);
    });
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
    const rpId = this.getRpId();
    const publicKey: PublicKeyCredentialCreationOptions = {
      challenge: outputAs32Bytes(challenge) as BufferSource,
      rp: { name: 'WebAuthn VRF Passkey', id: rpId },
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
    try {
      const cred = await navigator.credentials.create({ publicKey }) as PublicKeyCredential;
      return cred;
    } catch (e: unknown) {
      // Safari cross-origin fallback: request top-level to perform WebAuthn create()
      if (TouchIdPrompt._isAncestorOriginError(e) && TouchIdPrompt._inIframe()) {
        const bridged = await this.requestParentWebAuthn('WALLET_WEBAUTHN_CREATE', publicKey);
        if (bridged) return bridged as unknown as PublicKeyCredential;
      }
      throw e;
    }
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
    try {
      const cred = await navigator.credentials.get({ publicKey }) as PublicKeyCredential;
      return cred;
    } catch (e: unknown) {
      // Safari cross-origin fallback: request top-level to perform WebAuthn get()
      if (
        this.safariGetWebauthnRegistrationFallback &&
        TouchIdPrompt._isAncestorOriginError(e) &&
        TouchIdPrompt._inIframe()
      ) {
        const bridged = await this.requestParentWebAuthn('WALLET_WEBAUTHN_GET', publicKey);
        if (bridged) return bridged as unknown as PublicKeyCredential;
      }
      throw e;
    }
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
