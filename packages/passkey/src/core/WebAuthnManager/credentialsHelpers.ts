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
  credential: PublicKeyCredential,
  firstPrfOutput?: boolean | undefined,
  secondPrfOutput?: boolean,
}): DualPrfOutputs {

  const extensionResults = credential.getClientExtensionResults();
  const prfResults = extensionResults?.prf?.results;

  if (!prfResults) {
    throw new Error('Missing PRF results from credential, use a PRF-enabled Authenticator');
  }

  const first = firstPrfOutput
    ? prfResults?.first ? base64UrlEncode(prfResults.first as ArrayBuffer) : undefined
    : undefined;
  const second = secondPrfOutput
    ? prfResults?.second ? base64UrlEncode(prfResults.second as ArrayBuffer) : undefined
    : undefined;

  return {
    chacha20PrfOutput: first!,
    ed25519PrfOutput: second!,
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
export function serializeCredential<C extends SerializableCredential>(
  credential: PublicKeyCredential,
): C {
  // Check if this is a registration credential by looking for attestationObject
  const response = credential.response;
  const isRegistration = 'attestationObject' in response;

  const credentialBase = {
    id: credential.id,
    rawId: base64UrlEncode(credential.rawId),
    type: credential.type,
    authenticatorAttachment: credential.authenticatorAttachment,
    response: {},
    clientExtensionResults: null
  }

  if (isRegistration) {
    const attestationResponse = response as AuthenticatorAttestationResponse;
    return {
      ...credentialBase,
    response: {
      clientDataJSON: base64UrlEncode(attestationResponse.clientDataJSON),
      attestationObject: base64UrlEncode(attestationResponse.attestationObject),
      transports: attestationResponse.getTransports() || [],
    },
    } as C;
  } else {
    const assertionResponse = response as AuthenticatorAssertionResponse;
    return {
      ...credentialBase,
      response: {
        clientDataJSON: base64UrlEncode(assertionResponse.clientDataJSON),
        authenticatorData: base64UrlEncode(assertionResponse.authenticatorData),
        signature: base64UrlEncode(assertionResponse.signature),
        userHandle: assertionResponse.userHandle ? base64UrlEncode(assertionResponse.userHandle as ArrayBuffer) : null,
      },
    } as C;
  }
}

/**
 * Serialize PublicKeyCredential for both authentication and registration for WASM worker
 * @returns SerializableCredential - The serialized credential
 * - INCLUDES PRF outputs
 */
export function serializeCredentialWithPRF<C extends SerializableCredential>({
  credential,
  firstPrfOutput = true,
  secondPrfOutput = false,
}: {
  credential: PublicKeyCredential,
  firstPrfOutput?: boolean,
  secondPrfOutput?: boolean,
}): C {

  const {
    chacha20PrfOutput,
    ed25519PrfOutput
  } = extractPrfFromCredential({
    credential,
    firstPrfOutput,
    secondPrfOutput
  });

  return {
    ...serializeCredential(credential),
    clientExtensionResults: {
      prf: {
        results: {
          first: chacha20PrfOutput,
          second: ed25519PrfOutput
        }
      }
    }
  } as C;
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
          first: null, // ChaCha20 PRF output
          second: null // Ed25519 PRF output
        }
      }
    }
  };
  return credentialWithoutPrf;
}
