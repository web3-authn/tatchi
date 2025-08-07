// TypeScript interfaces matching Rust WASM input request structs
// These match the direct JSON input format expected by WASM functions
import type { AuthenticatorOptions } from '../types/authenticatorOptions';

/// Input request for key generation functions
export interface WasmDeriveKeypairRequest {
  attestation_object_b64u: string;
  prf_output_base64: string;
}

export interface WasmDecryptPrivateKeyRequest {
  prf_output_base64: string;
  encrypted_private_key_data: string;
  encrypted_private_key_iv: string;
}

/// Input request for COSE operations
export interface WasmExtractCosePublicKeyRequest {
  attestation_object_b64u: string;
}

export interface WasmValidateCoseKeyRequest {
  cose_key_bytes: number[];
}

/// Input request for transaction signing with actions
export interface WasmVerifyAndSignTransactionRequest {
  // Authentication
  prf_output_base64: string;
  encrypted_private_key_data: string;
  encrypted_private_key_iv: string;

  // Transaction details
  signer_account_id: string;
  receiver_account_id: string;
  nonce: number;
  block_hash_bytes: number[];
  actions_json: string;

  // Verification parameters
  contract_id: string;
  vrf_challenge_data_json: string;
  webauthn_credential_json: string;
  near_rpc_url: string;
}

/// Input request for transfer transaction signing
export interface WasmVerifyAndSignTransferRequest {
  // Authentication
  prf_output_base64: string;
  encrypted_private_key_data: string;
  encrypted_private_key_iv: string;

  // Transaction details
  signer_account_id: string;
  receiver_account_id: string;
  deposit_amount: string;
  nonce: number;
  block_hash_bytes: number[];

  // Verification parameters
  contract_id: string;
  vrf_challenge_data_json: string;
  webauthn_credential_json: string;
  near_rpc_url: string;
}

/// Input request for registration checking
export interface WasmCheckCanRegisterUserRequest {
  contract_id: string;
  vrf_challenge_data_json: string;
  webauthn_registration_json: string;
  near_rpc_url: string;
  authenticator_options?: AuthenticatorOptions;
}

/// Input request for user registration
export interface WasmSignVerifyAndRegisterUserRequest {
  contract_id: string;
  vrf_challenge_data_json: string;
  webauthn_registration_json: string;
  signer_account_id: string;
  encrypted_private_key_data: string;
  encrypted_private_key_iv: string;
  prf_output_base64: string;
  nonce: number;
  block_hash_bytes: number[];
  authenticator_options?: AuthenticatorOptions;
}

/// Input request for registration rollback
export interface WasmRollbackFailedRegistrationRequest {
  // Authentication
  prf_output_base64: string;
  encrypted_private_key_data: string;
  encrypted_private_key_iv: string;

  // Transaction details
  signer_account_id: string;
  beneficiary_account_id: string;
  nonce: number;
  block_hash_bytes: number[];

  // Verification parameters
  contract_id: string;
  vrf_challenge_data_json: string;
  webauthn_credential_json: string;
  near_rpc_url: string;

  // Security validation
  caller_function: string;
}

/// Input request for adding keys
export interface WasmAddKeyWithPrfRequest {
  // Authentication
  prf_output_base64: string;
  encrypted_private_key_data: string;
  encrypted_private_key_iv: string;

  // Transaction details
  signer_account_id: string;
  new_public_key: string;
  access_key_json: string;
  nonce: number;
  block_hash_bytes: number[];

  // Verification parameters
  contract_id: string;
  vrf_challenge_data_json: string;
  webauthn_credential_json: string;
  near_rpc_url: string;
}

/// Input request for deleting keys
export interface WasmDeleteKeyWithPrfRequest {
  // Authentication
  prf_output_base64: string;
  encrypted_private_key_data: string;
  encrypted_private_key_iv: string;

  // Transaction details
  signer_account_id: string;
  public_key_to_delete: string;
  nonce: number;
  block_hash_bytes: number[];

  // Verification parameters
  contract_id: string;
  vrf_challenge_data_json: string;
  webauthn_credential_json: string;
  near_rpc_url: string;
}

// Helper type for all WASM request types
export type WasmRequest =
  | WasmDeriveKeypairRequest
  | WasmDecryptPrivateKeyRequest
  | WasmExtractCosePublicKeyRequest
  | WasmValidateCoseKeyRequest
  | WasmVerifyAndSignTransactionRequest
  | WasmVerifyAndSignTransferRequest
  | WasmCheckCanRegisterUserRequest
  | WasmSignVerifyAndRegisterUserRequest
  | WasmRollbackFailedRegistrationRequest
  | WasmAddKeyWithPrfRequest
  | WasmDeleteKeyWithPrfRequest;