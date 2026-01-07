// Platform-agnostic types for server functionality
import {
  AuthenticatorOptions,
  UserVerificationPolicy,
  OriginPolicyInput
} from '../../core/types/authenticatorOptions';
import * as wasmModule from '../../wasm_vrf_worker/pkg/wasm_vrf_worker.js';
import type { InitInput } from '../../wasm_signer_worker/pkg/wasm_signer_worker.js';
import type { ZkEmailProverClientOptions } from '../email-recovery/zkEmail';
import type { Logger } from './logger';

/**
 * WASM Bindgen generates a `free` method and a `[Symbol.dispose]` method on all structs.
 * Strip both so we can pass plain objects to the worker.
 */
export type StripFree<T> = T extends object
  ? { [K in keyof T as K extends 'free' | symbol ? never : K]: StripFree<T[K]> }
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
export type ShamirWasmModuleSupplier =
  | InitInput
  | Promise<InitInput>
  | (() => InitInput | Promise<InitInput>);

export interface ShamirConfig {
  // Shamir 3-pass configuration (base64url BigInts)
  shamir_p_b64u: string;
  shamir_e_s_b64u: string;
  shamir_d_s_b64u: string;
  // Optional grace keys: previously active server keys still accepted for removal
  graceShamirKeys?: Array<{
    e_s_b64u: string;
    d_s_b64u: string;
  }>;
  // Optional path for persisting grace keys (default: ./grace-keys.json)
  graceShamirKeysFile?: string;
  /**
   * Optional override for locating the Shamir VRF WASM module. Useful for serverless
   * runtimes (e.g. Cloudflare Workers) where filesystem-relative URLs are unavailable.
   * Accepts any value supported by `initVrfWasm({ module_or_path })` or a
   * function that resolves to one.
   */
  moduleOrPath?: ShamirWasmModuleSupplier;
}

/**
 * Env-var-shaped Shamir config input, for ergonomic wiring in examples.
 * This is normalized to `ShamirConfig` by `createAuthServiceConfig(...)`.
 */
export interface ShamirConfigEnvInput {
  SHAMIR_P_B64U?: string;
  SHAMIR_E_S_B64U?: string;
  SHAMIR_D_S_B64U?: string;
  SHAMIR_GRACE_KEYS_FILE?: string;
  // Optional extras (non-env): useful for serverless runtimes
  graceShamirKeys?: ShamirConfig['graceShamirKeys'];
  graceShamirKeysFile?: string;
  moduleOrPath?: ShamirWasmModuleSupplier;
}

export type ShamirConfigInput = ShamirConfig | ShamirConfigEnvInput;

export type SignerWasmModuleSupplier =
  | InitInput
  | Promise<InitInput>
  | (() => InitInput | Promise<InitInput>);

export interface SignerWasmConfig {
  /**
   * Optional override for locating the signer WASM module. Useful for serverless
   * runtimes (e.g. Workers) where filesystem-relative URLs are unavailable.
   * Accepts any value supported by `initSignerWasm({ module_or_path })` or a
   * function that resolves to one.
   */
  moduleOrPath?: SignerWasmModuleSupplier;
}

// ================================
// Threshold Ed25519 key persistence
// ================================

export type ThresholdEd25519KeyStoreKind = 'in-memory' | 'upstash-redis-rest' | 'redis-tcp';

export type ThresholdEd25519KeyStoreConfig =
  | { kind: 'in-memory' }
  | { kind: 'upstash-redis-rest'; url: string; token: string; keyPrefix?: string }
  | { kind: 'redis-tcp'; redisUrl: string; keyPrefix?: string };

/**
 * Env-shaped input for threshold key store selection.
 * - Upstash REST (Cloudflare-friendly): UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
 * - Redis TCP (Node-only): REDIS_URL
 */
export type ThresholdEd25519KeyStoreEnvInput = {
  UPSTASH_REDIS_REST_URL?: string;
  UPSTASH_REDIS_REST_TOKEN?: string;
  REDIS_URL?: string;
  THRESHOLD_ED25519_KEYSTORE_PREFIX?: string;
  THRESHOLD_ED25519_SESSION_PREFIX?: string;
  THRESHOLD_ED25519_AUTH_PREFIX?: string;
  /**
   * 32-byte base64url master secret used to deterministically derive relayer signing shares.
   * When set (and enabled via `THRESHOLD_ED25519_SHARE_MODE`), the relayer can be stateless for
   * long-lived threshold key material.
   */
  THRESHOLD_ED25519_MASTER_SECRET_B64U?: string;
  /**
   * Relayer share mode:
   * - "kv": use persisted relayer signing shares (current default behavior)
   * - "derived": derive relayer signing shares from the master secret (stateless relayer)
   * - "auto": prefer derived when master secret is configured, otherwise kv
   */
  THRESHOLD_ED25519_SHARE_MODE?: string;
};

export type ThresholdEd25519KeyStoreConfigInput = ThresholdEd25519KeyStoreConfig | ThresholdEd25519KeyStoreEnvInput;

export interface AuthServiceConfig {
  relayerAccountId: string;
  relayerPrivateKey: string;
  webAuthnContractId: string;
  nearRpcUrl: string;
  networkId: string;
  accountInitialBalance: string;
  createAccountAndRegisterGas: string;
  // grouped Shamir settings under `shamir`
  shamir?: ShamirConfig;
  signerWasm?: SignerWasmConfig;
  /**
   * Optional persistence for relayer-held threshold signing shares.
   * Defaults to in-memory unless env-shaped config enables Redis/Upstash.
   */
  thresholdEd25519KeyStore?: ThresholdEd25519KeyStoreConfigInput;
  /**
   * Optional logger. When unset, the server SDK is silent (no `console.*`).
   * Pass `logger: console` to enable default logging.
   */
  logger?: Logger | null;
  /**
   * Optional zk-email prover configuration used by `EmailRecoveryService` when
   * handling zk-email mode (`explicitMode: 'zk-email'` or email body hint).
   */
  zkEmailProver?: ZkEmailProverClientOptions;
}

/**
 * Env-var-shaped zk-email prover input, for ergonomic wiring in examples.
 * This is normalized to `ZkEmailProverClientOptions` by `createAuthServiceConfig(...)`.
 */
export interface ZkEmailProverConfigEnvInput {
  ZK_EMAIL_PROVER_BASE_URL?: string;
  ZK_EMAIL_PROVER_TIMEOUT_MS?: string;
}

export type ZkEmailProverConfigInput = ZkEmailProverClientOptions | ZkEmailProverConfigEnvInput;

/**
 * User-facing input shape for `AuthService`. Fields that have SDK defaults are optional here.
 *
 * Defaults are applied by `createAuthServiceConfig(...)` and by `new AuthService(...)`.
 */
export type AuthServiceConfigInput = Omit<
  AuthServiceConfig,
  'nearRpcUrl'
  | 'networkId'
  | 'accountInitialBalance'
  | 'createAccountAndRegisterGas'
  | 'shamir'
  | 'thresholdEd25519KeyStore'
  | 'zkEmailProver'
> & {
  nearRpcUrl?: string;
  networkId?: string;
  accountInitialBalance?: string;
  createAccountAndRegisterGas?: string;
  shamir?: ShamirConfigInput;
  thresholdEd25519KeyStore?: ThresholdEd25519KeyStoreConfigInput;
  zkEmailProver?: ZkEmailProverConfigInput;
};

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
  /**
   * 32-byte digest bound into VRF input derivation.
   * Required by the on-chain verifier (must be exactly 32 bytes).
   */
  intent_digest_32: number[];
  /**
   * Optional 32-byte digest bound into VRF input derivation for relayer session policies.
   * When present, must be exactly 32 bytes.
   */
  session_policy_digest_32?: number[];
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
  threshold_ed25519?: {
    client_verifying_share_b64u: string;
  };
  vrf_data: ContractVrfData;
  webauthn_registration: WebAuthnRegistrationCredential;
  deterministic_vrf_public_key: Uint8Array;
  authenticator_options?: AuthenticatorOptions;
}

// Result type for atomic account creation and registration
export interface CreateAccountAndRegisterResult {
  success: boolean;
  transactionHash?: string;
  thresholdEd25519?: {
    relayerKeyId: string;
    publicKey: string;
    relayerVerifyingShareB64u?: string;
  };
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
  // Optional: whether to return JWT in JSON or set an HttpOnly cookie
  sessionKind?: 'jwt' | 'cookie';
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
  // Unified error model
  code?: string;
  message?: string;
  contractResponse?: any;
}

// ================================
// Threshold Ed25519 (2-party) APIs
// ================================

export type ThresholdEd25519Purpose = 'near_tx' | 'nep461_delegate' | 'nep413' | string;

export type ThresholdEd25519SessionPolicy = {
  version: 'threshold_session_v1';
  nearAccountId: string;
  rpId: string;
  relayerKeyId: string;
  sessionId: string;
  ttlMs: number;
  remainingUses: number;
};

export interface ThresholdEd25519SessionRequest extends VerifyAuthenticationRequest {
  relayerKeyId: string;
  /** Base64url-encoded 32-byte client verifying share (Ed25519 compressed point) for participant id=1. */
  clientVerifyingShareB64u: string;
  sessionPolicy: ThresholdEd25519SessionPolicy;
}

export interface ThresholdEd25519SessionResponse {
  ok: boolean;
  code?: string;
  message?: string;
  sessionId?: string;
  expiresAt?: string;
  remainingUses?: number;
  jwt?: string;
}

export interface ThresholdEd25519AuthorizeWithSessionRequest {
  relayerKeyId: string;
  /** Base64url-encoded 32-byte client verifying share (Ed25519 compressed point) for participant id=1. */
  clientVerifyingShareB64u: string;
  purpose: ThresholdEd25519Purpose;
  signing_digest_32: number[];
  signingPayload?: unknown;
}

export interface ThresholdEd25519AuthorizeRequest extends VerifyAuthenticationRequest {
  relayerKeyId: string;
  /** Base64url-encoded 32-byte client verifying share (Ed25519 compressed point) for participant id=1. */
  clientVerifyingShareB64u: string;
  purpose: ThresholdEd25519Purpose;
  /**
   * Exact 32-byte digest that will be co-signed (tx hash / delegate hash / NEP-413 hash).
   * The relayer must bind this digest to the VRF-authorized `intent_digest_32`.
   */
  signing_digest_32: number[];
  /**
   * Purpose-specific payload sufficient to recompute signing_digest_32 and enforce policy.
   * Kept as unknown for now; will be stabilized per-purpose once FROST is implemented.
   */
  signingPayload?: unknown;
}

export interface ThresholdEd25519AuthorizeResponse {
  ok: boolean;
  code?: string;
  message?: string;
  mpcSessionId?: string;
  expiresAt?: string;
}

export type ThresholdEd25519KeygenRequest =
  | ThresholdEd25519KeygenWithAuthenticationRequest
  | ThresholdEd25519KeygenFromRegistrationTxRequest;

export interface ThresholdEd25519KeygenWithAuthenticationRequest {
  /**
   * Base64url-encoded 32-byte verifying share (Ed25519 compressed point) for participant id=1.
   * This is derived deterministically on the client from PRF.first (via WrapKeySeed).
   */
  clientVerifyingShareB64u: string;
  /**
   * Account to bind in the VRF intent.
   * Must match `vrf_data.user_id` (verified on-chain via `verify_authentication_response`).
   */
  nearAccountId: string;
  /**
   * WebAuthn+VRF verification payload.
   * The relayer must verify this on-chain before issuing a relayer-held signing share.
   */
  vrf_data: ContractVrfData;
  webauthn_authentication: WebAuthnAuthenticationCredential;
}

export interface ThresholdEd25519KeygenFromRegistrationTxRequest {
  /**
   * Base64url-encoded 32-byte verifying share (Ed25519 compressed point) for participant id=1.
   * This is derived deterministically on the client from PRF.first (via WrapKeySeed).
   */
  clientVerifyingShareB64u: string;
  /**
   * NEAR account that was registered/linked on-chain via `link_device_register_user`.
   * The relayer will verify the transaction outcome against this account id.
   */
  nearAccountId: string;
  /**
   * Transaction hash for a successful `link_device_register_user` call.
   * The relayer uses this as proof of on-chain WebAuthn+VRF verification (no additional TouchID prompt required).
   */
  registrationTxHash: string;
}

export interface ThresholdEd25519KeygenResponse {
  ok: boolean;
  code?: string;
  message?: string;
  /**
   * Opaque identifier for the relayer-held share record.
   * Default: equals `publicKey` for stateless recovery.
   */
  relayerKeyId?: string;
  /** NEAR ed25519 public key string (`ed25519:<base58>`). */
  publicKey?: string;
  /** Base64url-encoded 32-byte relayer verifying share (Ed25519 compressed point) for participant id=2. */
  relayerVerifyingShareB64u?: string;
}

export interface ThresholdEd25519SignInitRequest {
  mpcSessionId: string;
  relayerKeyId: string;
  nearAccountId?: string;
  /**
   * Base64url-encoded message bytes (the exact digest the co-signers will sign).
   * For NEAR tx/delegate flows this is expected to be 32 bytes.
   */
  signingDigestB64u: string;
  clientCommitments: {
    hiding: string;
    binding: string;
  };
}

export interface ThresholdEd25519SignInitResponse {
  ok: boolean;
  code?: string;
  message?: string;
  signingSessionId?: string;
  relayerCommitments?: {
    hiding: string;
    binding: string;
  };
  relayerVerifyingShareB64u?: string;
}

export interface ThresholdEd25519SignFinalizeRequest {
  signingSessionId: string;
  clientSignatureShareB64u: string;
}

export interface ThresholdEd25519SignFinalizeResponse {
  ok: boolean;
  code?: string;
  message?: string;
  relayerSignatureShareB64u?: string;
  signature?: string;
}

export interface RefreshSessionResult {
  ok: boolean;
  jwt?: string;
  code?: string;
  message?: string;
}
