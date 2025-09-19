import { base64UrlEncode } from "../../utils";
import { isObject } from '../WalletIframe/validation';
import {
  type WebAuthnAuthenticationCredential,
  type WebAuthnRegistrationCredential,
} from '../types/webauthn';

/**
 * Dual PRF outputs for separate encryption and signing key derivation
 */
export interface DualPrfOutputs {
  /** Base64-encoded PRF output from prf.results.first for ChaCha20Poly1305 encryption */
  chacha20PrfOutput: string;
  /** Base64-encoded PRF output from prf.results.second for Ed25519 signing */
  ed25519PrfOutput: string;
}

/**
 * Extract PRF outputs from WebAuthn credential extension results
 * ENCODING: Uses base64url for WASM compatibility
 * @param credential - WebAuthn credential with dual PRF extension results
 * @param firstPrfOutput - Whether to include the first PRF output (default: true)
 * @param secondPrfOutput - Whether to include the second PRF output (default: false)
 * @returns PRF outputs
 */
export function extractPrfFromCredential({
  credential,
  firstPrfOutput = true,
  secondPrfOutput = false,
}: {
  credential: PublicKeyCredential | { clientExtensionResults?: unknown; getClientExtensionResults?: () => unknown };
  firstPrfOutput?: boolean | undefined,
  secondPrfOutput?: boolean,
}): DualPrfOutputs {
  // Support both live PublicKeyCredential and already-serialized credential objects
  let extensionResults: unknown | undefined;
  try {
    const fn = (credential as { getClientExtensionResults?: () => unknown })?.getClientExtensionResults;
    if (typeof fn === 'function') {
      extensionResults = fn.call(credential);
    } else {
      extensionResults = (credential as { clientExtensionResults?: unknown })?.clientExtensionResults;
    }
  } catch {
    extensionResults = (credential as { clientExtensionResults?: unknown })?.clientExtensionResults;
  }

  const prfResults = ((): { first?: unknown; second?: unknown } | undefined => {
    try {
      const prf = (extensionResults as { prf?: { results?: { first?: unknown; second?: unknown } } })?.prf;
      return prf?.results;
    } catch { return undefined; }
  })();
  if (!prfResults) {
    throw new Error('Missing PRF results from credential, use a PRF-enabled Authenticator');
  }

  const normalizeToB64u = (val: unknown): string | undefined => {
    if (!val) return undefined;
    if (typeof val === 'string') return val; // already base64url in serialized shape
    if (val instanceof ArrayBuffer) return base64UrlEncode(val);
    if (ArrayBuffer.isView(val)) return base64UrlEncode((val as ArrayBufferView).buffer);
    try {
      // Attempt to treat as ArrayBuffer-like
      return base64UrlEncode(val as ArrayBufferLike);
    } catch {
      try { return base64UrlEncode((new Uint8Array(val as ArrayBufferLike).buffer)); } catch { return undefined; }
    }
  };

  const firstEncoded = firstPrfOutput ? normalizeToB64u(prfResults.first) : undefined;
  const secondEncoded = secondPrfOutput ? normalizeToB64u(prfResults.second) : undefined;

  if (firstPrfOutput && !firstEncoded) {
    throw new Error('Missing PRF result: first');
  }
  if (secondPrfOutput && !secondEncoded) {
    throw new Error('Missing PRF result: second');
  }

  return {
    chacha20PrfOutput: firstEncoded || '',
    ed25519PrfOutput: secondEncoded || '',
  };
}

type SerializableCredential = WebAuthnAuthenticationCredential | WebAuthnRegistrationCredential;

/**
 * Serialize PublicKeyCredential for both authentication and registration for WASM worker
 * - Uses base64url encoding for WASM compatibility
 *
 * @returns SerializableCredential - The serialized credential
 * - DOES NOT return PRF outputs
 */
export function serializeRegistrationCredential(
  credential: PublicKeyCredential,
): WebAuthnRegistrationCredential {
  const response = credential.response as AuthenticatorAttestationResponse;
  // Safari and some platforms may not implement getTransports(); guard it.
  let transports: string[] = [];
  try {
    const fn = (response as { getTransports?: () => string[] })?.getTransports;
    if (typeof fn === 'function') {
      transports = fn.call(response) || [];
    }
  } catch {
    transports = [];
  }

  return {
    id: credential.id,
    rawId: base64UrlEncode(credential.rawId),
    type: credential.type,
    authenticatorAttachment: credential.authenticatorAttachment ?? undefined,
    response: {
      clientDataJSON: base64UrlEncode(response.clientDataJSON),
      attestationObject: base64UrlEncode(response.attestationObject),
      transports,
    },
    clientExtensionResults: {
      prf: {
        results: {
          first: undefined,
          second: undefined
        }
      }
    },
  };
}

export function serializeAuthenticationCredential(
  credential: PublicKeyCredential,
): WebAuthnAuthenticationCredential {
  const response = credential.response as AuthenticatorAssertionResponse;

  return {
    id: credential.id,
    rawId: base64UrlEncode(credential.rawId),
    type: credential.type,
    authenticatorAttachment: credential.authenticatorAttachment ?? undefined,
    response: {
      clientDataJSON: base64UrlEncode(response.clientDataJSON),
      authenticatorData: base64UrlEncode(response.authenticatorData),
      signature: base64UrlEncode(response.signature),
      userHandle: response.userHandle ? base64UrlEncode(response.userHandle as ArrayBuffer) : undefined,
    },
    clientExtensionResults: {
      prf: {
        results: {
          first: undefined,
          second: undefined
        }
      }
    },
  };
}

/**
 * Serialize PublicKeyCredential for both authentication and registration for WASM worker
 * @returns SerializableCredential - The serialized credential
 * - INCLUDES PRF outputs
 */
export function serializeRegistrationCredentialWithPRF({
  credential,
  firstPrfOutput = true,
  secondPrfOutput = true,
}: {
  credential: PublicKeyCredential,
  firstPrfOutput?: boolean,
  secondPrfOutput?: boolean,
}): WebAuthnRegistrationCredential {
  const base = serializeRegistrationCredential(credential);
  const { chacha20PrfOutput, ed25519PrfOutput } = extractPrfFromCredential({
    credential,
    firstPrfOutput,
    secondPrfOutput,
  });
  return {
    ...base,
    clientExtensionResults: {
      prf: {
        results: {
          first: chacha20PrfOutput,
          second: ed25519PrfOutput,
        },
      },
    },
  };
}

export function serializeAuthenticationCredentialWithPRF({
  credential,
  firstPrfOutput = true,
  secondPrfOutput = false,
}: {
  credential: PublicKeyCredential,
  firstPrfOutput?: boolean,
  secondPrfOutput?: boolean,
}): WebAuthnAuthenticationCredential {
  const base = serializeAuthenticationCredential(credential);
  const { chacha20PrfOutput, ed25519PrfOutput } = extractPrfFromCredential({
    credential,
    firstPrfOutput,
    secondPrfOutput,
  });
  return {
    ...base,
    clientExtensionResults: {
      prf: {
        results: {
          first: chacha20PrfOutput,
          second: ed25519PrfOutput,
        },
      },
    },
  };
}

/////////////////////////////////////////
// RUNTIME VALIDATION / NORMALIZATION
/////////////////////////////////////////

function isString(x: unknown): x is string { return typeof x === 'string'; }
function isArray<T = unknown>(x: unknown): x is T[] { return Array.isArray(x); }

/**
 * Validates and normalizes a serialized WebAuthn registration credential.
 * Ensures required fields exist and have the expected primitive types.
 * Populates missing optional arrays like transports with [].
 */
export function normalizeRegistrationCredential(input: unknown): WebAuthnRegistrationCredential {
  if (!isObject(input)) throw new Error('Invalid credential: not an object');
  const out: Record<string, unknown> = { ...(input as Record<string, unknown>) };

  if (!isString(out.id)) throw new Error('Invalid credential.id');
  if (!isString(out.type)) throw new Error('Invalid credential.type');
  if (!isString(out.rawId)) (out as { rawId?: string }).rawId = '';
  if (out.authenticatorAttachment !== undefined && !isString(out.authenticatorAttachment)) {
    (out as { authenticatorAttachment?: string }).authenticatorAttachment = String(out.authenticatorAttachment);
  }
  const resp = (isObject(out.response) ? out.response as Record<string, unknown> : (out.response = {} as Record<string, unknown>)) as Record<string, unknown>;
  if (!isString(resp.clientDataJSON)) resp.clientDataJSON = '';
  if (!isString(resp.attestationObject)) resp.attestationObject = '';
  if (!isArray<string>(resp.transports)) resp.transports = [];

  // Ensure PRF results shape exists and normalize to string | undefined
  const cer = (isObject(out.clientExtensionResults) ? out.clientExtensionResults as Record<string, unknown> : (out.clientExtensionResults = { prf: { results: {} } } as Record<string, unknown>)) as Record<string, unknown>;
  const prf = (isObject(cer.prf) ? cer.prf as Record<string, unknown> : (cer.prf = { results: {} } as Record<string, unknown>)) as Record<string, unknown>;
  const results = (isObject(prf.results) ? prf.results as Record<string, unknown> : (prf.results = {} as Record<string, unknown>)) as Record<string, unknown>;
  results.first = isString(results.first) ? results.first : undefined;
  results.second = isString(results.second) ? results.second : undefined;

  return out as unknown as WebAuthnRegistrationCredential;
}

/**
 * Validates and normalizes a serialized WebAuthn authentication credential.
 * Ensures required fields exist and have the expected primitive types.
 */
export function normalizeAuthenticationCredential(input: unknown): WebAuthnAuthenticationCredential {
  if (!isObject(input)) throw new Error('Invalid credential: not an object');
  const out: Record<string, unknown> = { ...(input as Record<string, unknown>) };

  if (!isString(out.id)) throw new Error('Invalid credential.id');
  if (!isString(out.type)) throw new Error('Invalid credential.type');
  if (!isString(out.rawId)) (out as { rawId?: string }).rawId = '';
  if (out.authenticatorAttachment !== undefined && !isString(out.authenticatorAttachment)) {
    (out as { authenticatorAttachment?: string }).authenticatorAttachment = String(out.authenticatorAttachment);
  }
  const resp = (isObject(out.response) ? out.response as Record<string, unknown> : (out.response = {} as Record<string, unknown>)) as Record<string, unknown>;
  if (!isString(resp.clientDataJSON)) resp.clientDataJSON = '';
  if (!isString(resp.authenticatorData)) resp.authenticatorData = '';
  if (!isString(resp.signature)) resp.signature = '';
  if (resp.userHandle !== undefined && !isString(resp.userHandle)) resp.userHandle = undefined;

  // Ensure PRF results shape exists and normalize to string | undefined
  const cer = (isObject(out.clientExtensionResults) ? out.clientExtensionResults as Record<string, unknown> : (out.clientExtensionResults = { prf: { results: {} } } as Record<string, unknown>)) as Record<string, unknown>;
  const prf = (isObject(cer.prf) ? cer.prf as Record<string, unknown> : (cer.prf = { results: {} } as Record<string, unknown>)) as Record<string, unknown>;
  const results = (isObject(prf.results) ? prf.results as Record<string, unknown> : (prf.results = {} as Record<string, unknown>)) as Record<string, unknown>;
  results.first = isString(results.first) ? results.first : undefined;
  results.second = isString(results.second) ? results.second : undefined;

  return out as unknown as WebAuthnAuthenticationCredential;
}

/**
 * Removes PRF outputs from the credential
 * @param credential - The WebAuthn credential containing PRF outputs
 * @returns Object containing credential with PRF removed and the extracted ChaCha20 PRF output
 */
export function removePrfOutputGuard<C extends SerializableCredential>(credential: C): C {
  const credentialWithoutPrf: C = {
    ...credential,
    clientExtensionResults: {
      ...credential.clientExtensionResults,
      prf: {
        results: {
          first: undefined,
          second: undefined
        }
      }
    }
  } as C;
  return credentialWithoutPrf;
}
