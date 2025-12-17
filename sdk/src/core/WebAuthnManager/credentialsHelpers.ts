import { base64UrlEncode } from "../../utils";
import { isObject, isString, isArray } from '../WalletIframe/validation';
import {
  type WebAuthnAuthenticationCredential,
  type WebAuthnRegistrationCredential,
  type AuthenticationExtensionsClientOutputs,
  type CredentialPropertiesOutput,
} from '../types/webauthn';

type SerializableCredential = WebAuthnAuthenticationCredential | WebAuthnRegistrationCredential;

/**
 * Serialize PublicKeyCredential for both authentication and registration for WASM worker
 * - Uses base64url encoding for WASM compatibility
 *
 * @returns SerializableCredential - The serialized credential
 * - Does not return PRF outputs
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

// Use shared type guards (isString/isArray) from WalletIframe/validation

/**
 * Validates and normalizes a serialized WebAuthn registration credential.
 * Ensures required fields exist and have the expected primitive types.
 * Populates missing optional arrays like transports with [].
 */
export function normalizeRegistrationCredential(input: unknown): WebAuthnRegistrationCredential {
  if (!isObject(input)) throw new Error('Invalid credential: not an object');

  const candidate = input as Record<string, unknown>;
  const normalized: Record<string, unknown> = { ...candidate };

  if (!isString(normalized.id)) throw new Error('Invalid credential.id');
  if (!isString(normalized.type)) throw new Error('Invalid credential.type');

  if (!isString(normalized.rawId)) normalized.rawId = '';
  if (normalized.authenticatorAttachment !== undefined && !isString(normalized.authenticatorAttachment)) {
    normalized.authenticatorAttachment = String(normalized.authenticatorAttachment);
  }

  const response: Record<string, unknown> = isObject(normalized.response)
    ? { ...(normalized.response as Record<string, unknown>) }
    : {};

  if (!isString(response.clientDataJSON)) response.clientDataJSON = '';
  if (!isString(response.attestationObject)) response.attestationObject = '';
  if (!isArray<string>(response.transports)) response.transports = [];

  normalized.response = response;
  normalized.clientExtensionResults = normalizeClientExtensionOutputs(normalized.clientExtensionResults);

  return normalized as unknown as WebAuthnRegistrationCredential;
}

/**
 * Validates and normalizes a serialized WebAuthn authentication credential.
 * Ensures required fields exist and have the expected primitive types.
 */
export function normalizeAuthenticationCredential(input: unknown): WebAuthnAuthenticationCredential {
  if (!isObject(input)) throw new Error('Invalid credential: not an object');

  const candidate = input as Record<string, unknown>;
  const normalized: Record<string, unknown> = { ...candidate };

  if (!isString(normalized.id)) throw new Error('Invalid credential.id');
  if (!isString(normalized.type)) throw new Error('Invalid credential.type');

  if (!isString(normalized.rawId)) normalized.rawId = '';
  if (normalized.authenticatorAttachment !== undefined && !isString(normalized.authenticatorAttachment)) {
    normalized.authenticatorAttachment = String(normalized.authenticatorAttachment);
  }

  const response: Record<string, unknown> = isObject(normalized.response)
    ? { ...(normalized.response as Record<string, unknown>) }
    : {};

  if (!isString(response.clientDataJSON)) response.clientDataJSON = '';
  if (!isString(response.authenticatorData)) response.authenticatorData = '';
  if (!isString(response.signature)) response.signature = '';
  if (response.userHandle !== undefined && !isString(response.userHandle)) response.userHandle = undefined;

  normalized.response = response;
  normalized.clientExtensionResults = normalizeClientExtensionOutputs(normalized.clientExtensionResults);

  return normalized as unknown as WebAuthnAuthenticationCredential;
}

/**
 * Removes PRF outputs from the credential
 * @param credential - The WebAuthn credential containing PRF outputs
 * @returns Credential with PRF results cleared
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

/////////////////////////////////////////
// TYPE GUARDS
/////////////////////////////////////////

/**
 * Returns true when the input looks like a serialized registration credential
 * (i.e., plain object with base64url string fields), not a live PublicKeyCredential.
 */
export function isSerializedRegistrationCredential(x: unknown): x is WebAuthnRegistrationCredential {
  if (!isObject(x)) return false;
  const candidate = x as {
    id?: unknown;
    rawId?: unknown;
    type?: unknown;
    response?: unknown;
  };

  if (!isString(candidate.id) || !isString(candidate.rawId) || !isString(candidate.type)) {
    return false;
  }

  if (!isObject(candidate.response)) return false;
  const response = candidate.response as {
    clientDataJSON?: unknown;
    attestationObject?: unknown;
    transports?: unknown;
  };

  if (!isString(response.clientDataJSON) || !isString(response.attestationObject)) {
    return false;
  }

  return response.transports == null || isArray(response.transports);
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

/** Credential that may have extension results (live or serialized) */
type CredentialWithExtensions =
  | PublicKeyCredential
  | {
      clientExtensionResults?: unknown;
      getClientExtensionResults?: () => unknown;
    };

/** Extension results structure - flexible to handle both live and serialized forms */
type ExtensionResults = {
  prf?: {
    enabled?: boolean;
    results?: {
      first?: unknown;
      second?: unknown;
    };
  };
  [key: string]: unknown;
};

/** PRF output values after extraction */
type PrfOutputs = {
  first?: unknown;
  second?: unknown;
};

/**
 * Dual PRF outputs for separate encryption and signing key derivation
 */
interface DualPrfOutputs {
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
function extractPrfFromCredential({
  credential,
  firstPrfOutput = true,
  secondPrfOutput = false,
}: {
  credential: CredentialWithExtensions;
  firstPrfOutput?: boolean | undefined;
  secondPrfOutput?: boolean;
}): DualPrfOutputs {
  // Step 1: Get extension results (support both live and serialized credentials)
  const extensionResults = getExtensionResults(credential);

  // Step 2: Extract PRF results object
  const prfResults = extractPrfResultsObject(extensionResults);

  // Step 3: Validate PRF results exist and are not empty
  validatePrfResults(prfResults, firstPrfOutput, secondPrfOutput);

  // Step 4: Normalize and encode PRF outputs
  const firstEncoded = firstPrfOutput ? normalizePrfValueToBase64Url(prfResults.first) : undefined;
  const secondEncoded = secondPrfOutput ? normalizePrfValueToBase64Url(prfResults.second) : undefined;

  // Step 5: Validate required outputs are present
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

/** Get extension results from credential (live or serialized) */
function getExtensionResults(credential: CredentialWithExtensions): ExtensionResults | undefined {
  try {
    const fn = (credential as { getClientExtensionResults?: () => unknown }).getClientExtensionResults;
    if (typeof fn === 'function') {
      return fn.call(credential) as ExtensionResults;
    }
  } catch {
    // Fall through to direct property access
  }
  return (credential as { clientExtensionResults?: unknown }).clientExtensionResults as ExtensionResults | undefined;
}

/** Extract PRF results object from extension results */
function extractPrfResultsObject(extensionResults: ExtensionResults | undefined): PrfOutputs | undefined {
  try {
    return extensionResults?.prf?.results;
  } catch {
    return undefined;
  }
}

/** Validate PRF results are present and not empty */
function validatePrfResults(
  prfResults: PrfOutputs | undefined,
  firstRequired: boolean,
  secondRequired: boolean
): asserts prfResults is PrfOutputs {
  if (!prfResults) {
    throw new Error('Missing PRF results from credential, use a PRF-enabled Authenticator');
  }

  // Check if PRF results object exists but is completely empty
  // This indicates a hard failure (not a platform limitation that should trigger GET fallback)
  const hasAnyPrfData = prfResults.first !== undefined || prfResults.second !== undefined;
  if (!hasAnyPrfData && (firstRequired || secondRequired)) {
    throw new Error('Missing PRF result - PRF evaluation failed: results object is empty');
  }
}

/** Normalize a PRF value to base64url string */
function normalizePrfValueToBase64Url(value: unknown): string | undefined {
  if (!value) return undefined;

  // Already base64url encoded
  if (typeof value === 'string') return value;

  // ArrayBuffer
  if (value instanceof ArrayBuffer) return base64UrlEncode(value);

  // ArrayBufferView (TypedArray, DataView)
  if (ArrayBuffer.isView(value)) {
    return base64UrlEncode(value.buffer);
  }

  // Try to treat as ArrayBuffer-like
  try {
    return base64UrlEncode(value as ArrayBufferLike);
  } catch {
    // Last resort: wrap in Uint8Array
    try {
      return base64UrlEncode(new Uint8Array(value as ArrayBufferLike).buffer);
    } catch {
      return undefined;
    }
  }
}

/////////////////////////////////////////
// EXTENSION OUTPUTS NORMALIZATION
/////////////////////////////////////////

/**
 * Normalize WebAuthn client extension outputs into an SDK‑local, clone‑safe shape.
 *
 * Purpose:
 * - Browsers return extension results on PublicKeyCredential in a variety of
 *   shapes and with optional presence. This helper takes an unknown value
 *   (either a live `credential.getClientExtensionResults()` object or a
 *   serialized snapshot) and produces a strictly typed
 *   `AuthenticationExtensionsClientOutputs` compatible with our WASM workers
 *   and cross‑window message passing (structured‑clone safe).
 */
function normalizeClientExtensionOutputs(input: unknown): AuthenticationExtensionsClientOutputs {
  const out: AuthenticationExtensionsClientOutputs = {
    prf: { results: { first: undefined, second: undefined } },
  } as AuthenticationExtensionsClientOutputs;

  const src = isObject(input) ? (input as Record<string, unknown>) : {};
  // appid
  if (typeof src.appid === 'boolean') out.appid = src.appid as boolean;
  // appidExclude
  if (typeof src.appidExclude === 'boolean') out.appidExclude = src.appidExclude as boolean;
  // hmacCreateSecret
  if (typeof src.hmacCreateSecret === 'boolean') out.hmacCreateSecret = src.hmacCreateSecret as boolean;
  // credProps
  if (isObject(src.credProps)) {
    const cp = src.credProps as Record<string, unknown>;
    const outCp: CredentialPropertiesOutput = {};
    if (typeof cp.rk === 'boolean') outCp.rk = cp.rk as boolean;
    out.credProps = outCp;
  }
  // uvm: expect array of 3-number tuples; tolerate nested arrays loosely
  if (isArray(src.uvm)) {
    const uvmArr = (src.uvm as unknown[]).filter(isArray).map((t) => {
      const a = t as unknown[];
      const n0 = typeof a[0] === 'number' ? (a[0] as number) : undefined;
      const n1 = typeof a[1] === 'number' ? (a[1] as number) : undefined;
      const n2 = typeof a[2] === 'number' ? (a[2] as number) : undefined;
      return (typeof n0 === 'number' && typeof n1 === 'number' && typeof n2 === 'number')
        ? [n0, n1, n2] as [number, number, number]
        : undefined;
    }).filter((x): x is [number, number, number] => Array.isArray(x));
    if (uvmArr.length > 0) out.uvm = uvmArr;
  }
  // prf
  if (isObject(src.prf)) {
    const prf = src.prf as Record<string, unknown>;
    const results = isObject(prf.results) ? (prf.results as Record<string, unknown>) : {};
    const first = results.first;
    const second = results.second;
    out.prf = {
      results: {
        first: isString(first) ? first : undefined,
        second: isString(second) ? second : undefined,
      },
    };
  }
  return out;
}
