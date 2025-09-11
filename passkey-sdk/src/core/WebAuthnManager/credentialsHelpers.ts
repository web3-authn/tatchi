import { base64UrlEncode } from "../../utils";
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
  credential: any,
  firstPrfOutput?: boolean | undefined,
  secondPrfOutput?: boolean,
}): DualPrfOutputs {
  // Support both live PublicKeyCredential and already-serialized credential objects
  let extensionResults: any | undefined;
  try {
    const fn = (credential as any)?.getClientExtensionResults;
    if (typeof fn === 'function') {
      extensionResults = fn.call(credential);
    } else {
      extensionResults = (credential as any)?.clientExtensionResults;
    }
  } catch {
    extensionResults = (credential as any)?.clientExtensionResults;
  }

  const prfResults = extensionResults?.prf?.results;
  if (!prfResults) {
    throw new Error('Missing PRF results from credential, use a PRF-enabled Authenticator');
  }

  const normalizeToB64u = (val: any): string | undefined => {
    if (!val) return undefined;
    if (typeof val === 'string') return val; // already base64url in serialized shape
    if (val instanceof ArrayBuffer) return base64UrlEncode(val);
    if (ArrayBuffer.isView(val)) return base64UrlEncode((val as ArrayBufferView).buffer);
    try {
      // Attempt to treat as ArrayBuffer-like
      return base64UrlEncode(val as ArrayBufferLike);
    } catch {
      try { return base64UrlEncode((new Uint8Array(val as any).buffer)); } catch { return undefined; }
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
    const fn: any = (response as any)?.getTransports;
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

function isString(x: any): x is string { return typeof x === 'string'; }
function isArray(x: any): x is any[] { return Array.isArray(x); }

/**
 * Validates and normalizes a serialized WebAuthn registration credential.
 * Ensures required fields exist and have the expected primitive types.
 * Populates missing optional arrays like transports with [].
 */
export function normalizeRegistrationCredential(input: any): WebAuthnRegistrationCredential {
  if (!input || typeof input !== 'object') throw new Error('Invalid credential: not an object');
  const out: any = { ...input };

  if (!isString(out.id)) throw new Error('Invalid credential.id');
  if (!isString(out.type)) throw new Error('Invalid credential.type');
  if (!isString(out.rawId)) out.rawId = '';
  if (out.authenticatorAttachment !== undefined && !isString(out.authenticatorAttachment)) {
    out.authenticatorAttachment = String(out.authenticatorAttachment);
  }
  if (!out.response || typeof out.response !== 'object') out.response = {};
  if (!isString(out.response.clientDataJSON)) out.response.clientDataJSON = '';
  if (!isString(out.response.attestationObject)) out.response.attestationObject = '';
  if (!isArray(out.response.transports)) out.response.transports = [];

  // Ensure PRF results shape exists and normalize to string | undefined
  out.clientExtensionResults = (typeof out.clientExtensionResults === 'object' && out.clientExtensionResults) || { prf: { results: {} } };
  out.clientExtensionResults.prf = (typeof out.clientExtensionResults.prf === 'object' && out.clientExtensionResults.prf) || { results: {} } as any;
  const rReg: any = (typeof out.clientExtensionResults.prf.results === 'object' && out.clientExtensionResults.prf.results) || (out.clientExtensionResults.prf.results = {});
  rReg.first = isString(rReg.first) ? rReg.first : undefined;
  rReg.second = isString(rReg.second) ? rReg.second : undefined;

  return out as WebAuthnRegistrationCredential;
}

/**
 * Validates and normalizes a serialized WebAuthn authentication credential.
 * Ensures required fields exist and have the expected primitive types.
 */
export function normalizeAuthenticationCredential(input: any): WebAuthnAuthenticationCredential {
  if (!input || typeof input !== 'object') throw new Error('Invalid credential: not an object');
  const out: any = { ...input };

  if (!isString(out.id)) throw new Error('Invalid credential.id');
  if (!isString(out.type)) throw new Error('Invalid credential.type');
  if (!isString(out.rawId)) out.rawId = '';
  if (out.authenticatorAttachment !== undefined && !isString(out.authenticatorAttachment)) {
    out.authenticatorAttachment = String(out.authenticatorAttachment);
  }
  if (!out.response || typeof out.response !== 'object') out.response = {};
  if (!isString(out.response.clientDataJSON)) out.response.clientDataJSON = '';
  if (!isString(out.response.authenticatorData)) out.response.authenticatorData = '';
  if (!isString(out.response.signature)) out.response.signature = '';
  if (out.response.userHandle !== undefined && !isString(out.response.userHandle)) out.response.userHandle = undefined;

  // Ensure PRF results shape exists and normalize to string | undefined
  out.clientExtensionResults = (typeof out.clientExtensionResults === 'object' && out.clientExtensionResults) || { prf: { results: {} } };
  out.clientExtensionResults.prf = (typeof out.clientExtensionResults.prf === 'object' && out.clientExtensionResults.prf) || { results: {} } as any;
  const rAuth: any = (typeof out.clientExtensionResults.prf.results === 'object' && out.clientExtensionResults.prf.results) || (out.clientExtensionResults.prf.results = {});
  rAuth.first = isString(rAuth.first) ? rAuth.first : undefined;
  rAuth.second = isString(rAuth.second) ? rAuth.second : undefined;

  return out as WebAuthnAuthenticationCredential;
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
