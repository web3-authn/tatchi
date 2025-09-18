
export const bufferEncode = (value: ArrayBuffer): string => {
  return btoa(String.fromCharCode(...new Uint8Array(value)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

export const bufferDecode = (value: string): ArrayBuffer => {
  // 1. Sanitize the input string to remove any characters not part of Base64URL alphabet
  // This will keep A-Z, a-z, 0-9, -, _ and discard anything else.
  const sanitizedValue = value.replace(/[^A-Za-z0-9\-_]/g, '');

  // 2. Convert Base64URL to Base64
  let base64 = sanitizedValue.replace(/-/g, "+").replace(/_/g, "/");

  // 3. Add padding
  while (base64.length % 4) {
    base64 += "=";
  }

  // 4. Decode
  try {
    const decodedString = atob(base64);
    const buffer = new Uint8Array(decodedString.length);
    for (let i = 0; i < decodedString.length; i++) {
      buffer[i] = decodedString.charCodeAt(i);
  }
  return buffer.buffer;
  } catch (e) {
    // Enhanced logging
    console.error(
      "bufferDecode: atob decoding failed.",
      {
        originalValue: value,
        sanitizedValue: sanitizedValue,
        stringPassedToAtob: base64,
        error: e
      }
    );
    throw e; // Re-throw the error after logging
  }
}

// Helper to convert PublicKeyCredential to JSON for the server
// Matches RegistrationResponseJSON / AuthenticationResponseJSON structure from @simplewebauthn/server
export const publicKeyCredentialToJSON = (pubKeyCred: PublicKeyCredential): any => {
  if (pubKeyCred.response instanceof AuthenticatorAttestationResponse) {
    const attestationResponse = pubKeyCred.response;
    return {
      id: pubKeyCred.id,
      rawId: bufferEncode(pubKeyCred.rawId),
      type: pubKeyCred.type,
      clientExtensionResults: pubKeyCred.getClientExtensionResults(),
      response: {
        clientDataJSON: bufferEncode(attestationResponse.clientDataJSON),
        attestationObject: bufferEncode(attestationResponse.attestationObject),
        transports: (attestationResponse as any).getTransports ? (attestationResponse as any).getTransports() : undefined,
      },
    };
  } else if (pubKeyCred.response instanceof AuthenticatorAssertionResponse) {
    const assertionResponse = pubKeyCred.response;
    return {
      id: pubKeyCred.id,
      rawId: bufferEncode(pubKeyCred.rawId),
      type: pubKeyCred.type,
      clientExtensionResults: pubKeyCred.getClientExtensionResults(),
      response: {
        clientDataJSON: bufferEncode(assertionResponse.clientDataJSON),
        authenticatorData: bufferEncode(assertionResponse.authenticatorData),
        signature: bufferEncode(assertionResponse.signature),
        userHandle: assertionResponse.userHandle ? bufferEncode(assertionResponse.userHandle) : undefined,
      },
    };
  }
  throw new Error('Unsupported PublicKeyCredential response type');
}