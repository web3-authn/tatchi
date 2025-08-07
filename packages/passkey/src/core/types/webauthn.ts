
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
  authenticatorAttachment: string | null;
  response: {
    clientDataJSON: string; // base64url-encoded
    authenticatorData: string; // base64url-encoded
    signature: string; // base64url-encoded
    userHandle: string | null; // base64url-encoded or null
  };
  // Dual PRF outputs extracted in main thread just before transferring to worker
  clientExtensionResults: AuthenticationExtensionsClientOutputs | null;
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
  authenticatorAttachment: string | null;
  response: {
    clientDataJSON: string,
    attestationObject: string,
    transports: string[],
  };
  // Dual PRF outputs extracted in main thread just before transferring to worker
  clientExtensionResults: AuthenticationExtensionsClientOutputs | null;
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
 * Equivalent to AuthenticationExtensionsClientOutputs in Rust
 */
export interface AuthenticationExtensionsClientOutputs {
  /** Application Identifier Extension output */
  appid?: boolean;

  /** Credential Properties Extension output */
  credProps?: CredentialPropertiesOutput;

  /** HMAC Secret Extension output */
  hmacCreateSecret?: boolean;

  /** PRF (Pseudo-Random Function) Extension output */
  prf?: AuthenticationExtensionsPRFOutputs;
}

/**
 * PRF Extension Outputs
 * Equivalent to AuthenticationExtensionsPRFOutputs in Rust
 */
export interface AuthenticationExtensionsPRFOutputs {
  /** Whether PRF extension was enabled/supported */
  enabled?: boolean;

  /** PRF evaluation results (the actual PRF outputs) */
  results?: AuthenticationExtensionsPRFValues;
}

/**
 * PRF Extension Values
 * Equivalent to AuthenticationExtensionsPRFValues in Rust
 */
export interface AuthenticationExtensionsPRFValues {
  /** First PRF output (Base64URL encoded) */
  first: string | null;

  /** Optional second PRF output (Base64URL encoded) */
  second?: string | null;
}

/**
 * Credential Properties Extension Output
 * Equivalent to CredentialPropertiesOutput in Rust
 */
export interface CredentialPropertiesOutput {
  /** Resident key property */
  rk?: boolean;
}
