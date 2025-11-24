import { ClientAuthenticatorData } from '../IndexedDBManager';
import { base64UrlDecode } from '../../utils/encoders';
import { outputAs32Bytes, VRFChallenge } from '../types/vrf-worker';
import { serializeAuthenticationCredentialWithPRF, generateChaCha20Salt, generateEd25519Salt } from './credentialsHelpers';
import type {
  WebAuthnAuthenticationCredential,
  WebAuthnRegistrationCredential
} from '../types/webauthn';
import { executeWebAuthnWithParentFallbacksSafari } from './WebAuthnFallbacks';
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

/**
 * TouchIdPrompt prompts for touchID,
 * creates credentials,
 * manages WebAuthn touchID prompts,
 * and generates credentials, and PRF Outputs
 */
export class TouchIdPrompt {
  private rpIdOverride?: string;
  private safariGetWebauthnRegistrationFallback: boolean;
  // create() only: internal abort controller + cleanup hooks
  private abortController?: AbortController;
  private removePageAbortHandlers?: () => void;
  private removeExternalAbortListener?: () => void;

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
    // New controller per create() call
    this.abortController = new AbortController();
    this.removePageAbortHandlers = TouchIdPrompt.attachPageAbortHandlers(this.abortController);
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
      pubKeyCredParams: [
        { alg: -7, type: 'public-key' },
        { alg: -257, type: 'public-key' }
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
            first: generateChaCha20Salt(nearAccountId) as BufferSource,  // ChaCha20Poly1305 encryption keys
            second: generateEd25519Salt(nearAccountId) as BufferSource   // Ed25519 signing keys
          }
        }
      },
    };
    try {
      const result = await executeWebAuthnWithParentFallbacksSafari('create', publicKey, {
        rpId,
        inIframe: TouchIdPrompt._inIframe(),
        timeoutMs: publicKey.timeout as number | undefined,
        // Pass AbortSignal through when supported; Safari bridge path may ignore it.
        abortSignal: this.abortController.signal,
      });
      return result as PublicKeyCredential;
    } finally {
      this.removePageAbortHandlers?.();
      this.removePageAbortHandlers = undefined;
      this.removeExternalAbortListener?.();
      this.removeExternalAbortListener = undefined;
      this.abortController = undefined;
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
    // New controller per get() call
    this.abortController = new AbortController();
    this.removePageAbortHandlers = TouchIdPrompt.attachPageAbortHandlers(this.abortController);
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
    try {
      const result = await executeWebAuthnWithParentFallbacksSafari('get', publicKey, {
        rpId,
        inIframe: TouchIdPrompt._inIframe(),
        timeoutMs: publicKey.timeout as number | undefined,
        permitGetBridgeOnAncestorError: this.safariGetWebauthnRegistrationFallback,
        abortSignal: this.abortController.signal,
      });
      return result as PublicKeyCredential;
    } finally {
      this.removePageAbortHandlers?.();
      this.removePageAbortHandlers = undefined;
      this.removeExternalAbortListener?.();
      this.removeExternalAbortListener = undefined;
      this.abortController = undefined;
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

// Abort native WebAuthn when page is being hidden or unloaded
// Centralized here to keep WebAuthn lifecycle concerns alongside native calls.
export namespace TouchIdPrompt {
  export function attachPageAbortHandlers(controller: AbortController): () => void {
    const onVisibility = () => { if (document.hidden) controller.abort(); };
    const onPageHide = () => { controller.abort(); };
    const onBeforeUnload = () => { controller.abort(); };
    document.addEventListener('visibilitychange', onVisibility, { passive: true });
    window.addEventListener('pagehide', onPageHide, { passive: true });
    window.addEventListener('beforeunload', onBeforeUnload, { passive: true });
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }
}
