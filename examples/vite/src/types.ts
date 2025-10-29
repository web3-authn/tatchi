
export interface ServerRegistrationOptions {
  challenge: string; // base64url
  rp: { name: string; id?: string };
  user: { id: string; name: string; displayName: string }; // user.id is base64url
  pubKeyCredParams: PublicKeyCredentialParameters[];
  authenticatorSelection?: AuthenticatorSelectionCriteria;
  timeout?: number;
  attestation?: AttestationConveyancePreference;
  excludeCredentials?: { id: string; type: 'public-key'; transports?: AuthenticatorTransport[] }[];
}

export interface ServerAuthenticationOptions {
  challenge: string; // base64url
  rpId?: string;
  allowCredentials?: { id: string; type: 'public-key'; transports?: AuthenticatorTransport[] }[];
  userVerification?: UserVerificationRequirement;
  timeout?: number;
}

export interface LastTxDetails {
  id: string;
  link: string;
  message?: string;
}
