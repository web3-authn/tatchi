// Platform-agnostic types for server functionality
import {
  AuthenticatorOptions,
  UserVerificationPolicy,
  OriginPolicyInput
} from '../../core/types/authenticatorOptions';
import * as wasmModule from '../../wasm_vrf_worker/wasm_vrf_worker.js';

/**
 * WASM Bindgen generates a `free` method on all structs.
 * This type removes the `free` method from the struct.
 */
export type StripFree<T> = T extends object
  ? { [K in keyof T as K extends 'free' ? never : K]: StripFree<T[K]> }
  : T;

export type ShamirApplyServerLockRequest = StripFree<wasmModule.Shamir3PassApplyServerLockRequest>;
export type ShamirApplyServerLockResponse = StripFree<wasmModule.ShamirApplyServerLockHTTPResponse>;
export type ShamirRemoveServerLockRequest = StripFree<wasmModule.Shamir3PassRemoveServerLockRequest>;
export type ShamirRemoveServerLockResponse = StripFree<wasmModule.ShamirRemoveServerLockHTTPResponse>;
export type Shamir3PassGenerateServerKeypairRequest = StripFree<wasmModule.Shamir3PassGenerateServerKeypairRequest>;

export interface VRFWorkerMessage<T extends WasmVrfWorkerRequestType> {
  type: 'PING'
      | 'SHAMIR3PASS_GENERATE_SERVER_KEYPAIR' // server only
      | 'SHAMIR3PASS_APPLY_SERVER_LOCK_KEK' // server only
      | 'SHAMIR3PASS_REMOVE_SERVER_LOCK_KEK' // server only
  id?: string;
  payload?: T;
}

export type WasmVrfWorkerRequestType = Shamir3PassGenerateServerKeypairRequest
  | ShamirRemoveServerLockRequest
  | ShamirApplyServerLockRequest;


// Standard request/response interfaces that work across all platforms
export interface ServerRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
}

export interface ServerResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

// Server configuration interface
export interface AuthServiceConfig {
  relayerAccountId: string;
  relayerPrivateKey: string;
  webAuthnContractId: string;
  nearRpcUrl: string;
  networkId: string;
  accountInitialBalance: string;
  createAccountAndRegisterGas: string;
  // Shamir 3-pass configuration (base64url BigInts)
  shamir_p_b64u: string;
  shamir_e_s_b64u: string;
  shamir_d_s_b64u: string;
}

// Account creation and registration types (imported from relay-server types)
export interface AccountCreationRequest {
  accountId: string;
  publicKey: string;
}

export interface AccountCreationResult {
  success: boolean;
  transactionHash?: string;
  accountId?: string;
  error?: string;
  message?: string;
}

// VRF data structure for contract verification calls
export interface ContractVrfData {
  vrf_input_data: number[];
  vrf_output: number[];
  vrf_proof: number[];
  public_key: number[];
  user_id: string;
  rp_id: string;
  block_height: number;
  block_hash: number[];
}

// WebAuthn registration credential structure
export interface WebAuthnRegistrationCredential {
  id: string;
  rawId: string; // base64-encoded
  type: string;
  authenticatorAttachment: string | null;
  response: {
    clientDataJSON: string;
    attestationObject: string;
    transports: string[];
  };
  // PRF outputs are not sent to the relay server
  clientExtensionResults: null;
}

// Interface for atomic account creation and registration
export interface CreateAccountAndRegisterRequest {
  new_account_id: string;
  new_public_key: string;
  vrf_data: ContractVrfData;
  webauthn_registration: WebAuthnRegistrationCredential;
  deterministic_vrf_public_key: Uint8Array;
  authenticator_options?: AuthenticatorOptions;
}

// Result type for atomic account creation and registration
export interface CreateAccountAndRegisterResult {
  success: boolean;
  transactionHash?: string;
  error?: string;
  message?: string;
  contractResult?: any; // FinalExecutionOutcome
}

// Runtime-tested NEAR error types
export interface NearActionErrorKind {
  AccountAlreadyExists?: {
    accountId: string;
  };
  AccountDoesNotExist?: {
    account_id: string;
  };
  InsufficientStake?: {
    account_id: string;
    stake: string;
    minimum_stake: string;
  };
  LackBalanceForState?: {
    account_id: string;
    balance: string;
  };
  [key: string]: any;
}

export interface NearActionError {
  kind: NearActionErrorKind;
  index: string;
}

export interface NearExecutionFailure {
  ActionError?: NearActionError;
  [key: string]: any;
}

export interface NearReceiptStatus {
  SuccessValue?: string;
  SuccessReceiptId?: string;
  Failure?: NearExecutionFailure;
}

export interface NearReceiptOutcomeWithId {
  id: string;
  outcome: {
    logs: string[];
    receipt_ids: string[];
    gas_burnt: number;
    tokens_burnt: string;
    executor_id: string;
    status: NearReceiptStatus;
  };
}

// Re-export authenticator types from core
export type { AuthenticatorOptions, UserVerificationPolicy, OriginPolicyInput };

// Authentication verification types
export interface VerifyAuthenticationRequest {
  vrf_data: ContractVrfData;
  webauthn_authentication: WebAuthnAuthenticationCredential;
}

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
  clientExtensionResults: any | null;
}

export interface VerifyAuthenticationResponse {
  success: boolean;
  verified?: boolean;
  jwt?: string;
  sessionCredential?: any;
  error?: string;
  contractResponse?: any;
}
