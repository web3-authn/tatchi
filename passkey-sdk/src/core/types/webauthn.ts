
// === WEBAUTHN CREDENTIAL TYPES ===

/** Stored authenticator information, normalized for client-side use */
export interface StoredAuthenticator {
  credentialId: string;
  credentialPublicKey: Uint8Array;
  transports: AuthenticatorTransport[];
  userId: string;
  name?: string;
  registered: Date;
  vrfPublicKeys?: string[];
  deviceNumber?: number;
}

/** WebAuthn authentication data structure for contract calls */
export interface WebAuthnAuthenticationCredential {
  id: string;
  rawId: string; // base64-encoded
  type: string;
  authenticatorAttachment: string | undefined;
  response: {
    clientDataJSON: string; // base64url-encoded
    authenticatorData: string; // base64url-encoded
    signature: string; // base64url-encoded
    userHandle: string | undefined; // base64url-encoded or undefined
  };
  // Dual PRF outputs extracted in main thread just before transferring to worker
  clientExtensionResults: AuthenticationExtensionsClientOutputs;
  // clientExtensionResults: {
  //   prf: {
  //     results: {
  //       // base64url-encoded PRF output for ChaChat20
  //       first: string | undefined;
  //       // base64url-encoded PRF output for Ed25519
  //       second: string | undefined;
  //     }
  //   }
  // }
}

/** WebAuthn registration data structure for contract calls */
export interface WebAuthnRegistrationCredential {
  id: string;
  rawId: string; // base64-encoded
  type: string;
  authenticatorAttachment: string | undefined;
  response: {
    clientDataJSON: string,
    attestationObject: string,
    transports: string[],
  };
  // Dual PRF outputs extracted in main thread just before transferring to worker
  clientExtensionResults: AuthenticationExtensionsClientOutputs;
  // clientExtensionResults: {
  //   prf: {
  //     results: {
  //       // base64url-encoded PRF output for ChaChat20
  //       first: string | undefined;
  //       // base64url-encoded PRF output for Ed25519
  //       second: string | undefined;
  //     }
  //   }
  // }
}

// === WEBAUTHN EXTENSION TYPES (Based on WebAuthn Level 2 Specification) ===

/**
 * WebAuthn Client Extension Outputs
 * Equivalent to ClientExtensionResults in Rust
 */
export interface AuthenticationExtensionsClientOutputs {
  /** Application Identifier Extension output */
  appid?: boolean;

  /** Credential Properties Extension output */
  credProps?: CredentialPropertiesOutput;

  /** HMAC Secret Extension output */
  hmacCreateSecret?: boolean;

  /** PRF (Pseudo-Random Function) Extension output */
  prf: AuthenticationExtensionsPRFOutputs;
}

/**
 * PRF Extension Outputs
 * Equivalent to PrfResults in Rust
 */
export interface AuthenticationExtensionsPRFOutputs {
  /** PRF evaluation results (the actual PRF outputs) */
  results: AuthenticationExtensionsPRFValues;
}

/**
 * PRF Extension Values
 * Equivalent to PrfOutputs in Rust
 */
export interface AuthenticationExtensionsPRFValues {
  /** First PRF output (Base64URL encoded) */
  first: string | undefined;

  /** Second PRF output (Base64URL encoded) */
  second: string | undefined;
}

/**
 * Credential Properties Extension Output
 * Equivalent to CredentialPropertiesOutput in Rust
 */
export interface CredentialPropertiesOutput {
  /** Resident key property */
  rk?: boolean;
}
