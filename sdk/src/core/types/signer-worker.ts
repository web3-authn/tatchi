
// === IMPORT AUTO-GENERATED WASM TYPES ===
// These are the source of truth generated from Rust structs via wasm-bindgen
// Import as instance types from the WASM module classes
import * as wasmModule from '../../wasm_signer_worker/pkg/wasm_signer_worker.js';
import { WorkerRequestType, WorkerResponseType } from '../../wasm_signer_worker/pkg/wasm_signer_worker.js';
export { WorkerRequestType, WorkerResponseType }; // Export the WASM enums directly

import { StripFree } from "./index.js";
import type { onProgressEvents } from "./sdkSentEvents.js";
import type { TransactionContext } from './rpc.js';
import type { VRFChallenge } from './vrf-worker.js';
import type { ActionArgsWasm } from './actions.js';

export type WasmTransaction = wasmModule.WasmTransaction;
export type WasmSignature = wasmModule.WasmSignature;

export type ThresholdBehavior = 'strict' | 'fallback';
export const DEFAULT_THRESHOLD_BEHAVIOR: ThresholdBehavior = 'strict';

/** High-level policy used by SDK APIs (includes optional threshold fallback behavior). */
export type SignerMode =
  | { mode: 'local-signer' }
  | { mode: 'threshold-signer'; behavior?: ThresholdBehavior };

export const DEFAULT_SIGNER_MODE: SignerMode['mode'] = 'local-signer';
export const DEFAULT_SIGNING_MODE: SignerMode = { mode: DEFAULT_SIGNER_MODE };

export function isSignerMode(input: unknown): input is SignerMode['mode'] {
  return input === 'local-signer' || input === 'threshold-signer';
}

export function isThresholdBehavior(input: unknown): input is ThresholdBehavior {
  return input === 'fallback' || input === 'strict';
}

export function coerceSignerMode(
  input?: SignerMode | SignerMode['mode'] | null,
  fallback: SignerMode = DEFAULT_SIGNING_MODE,
): SignerMode {
  if (input == null) return fallback;

  if (typeof input === 'string') return isSignerMode(input) ? { mode: input } : fallback;

  if (typeof input !== 'object') return fallback;

  if (input.mode === 'local-signer') return { mode: input.mode };
  const behavior = input.behavior;
  return isThresholdBehavior(behavior)
    ? { mode: input.mode, behavior }
    : { mode: input.mode };
}

/** @deprecated use `coerceSignerMode` */
export const normalizeSignerMode = coerceSignerMode;

/**
 * Merge a mode-only override onto a base signer mode.
 *
 * This is intentionally "partial override" semantics:
 * - override sets `mode` when provided
 * - override sets `behavior` only when explicitly provided
 * - if override switches to `threshold-signer` without specifying `behavior`,
 *   preserve `base.behavior` when base is already `threshold-signer`
 */
export function mergeSignerMode(
  base: SignerMode,
  override?: SignerMode | SignerMode['mode'] | null,
): SignerMode {
  const baseNormalized = coerceSignerMode(base, DEFAULT_SIGNING_MODE);
  if (override == null) return baseNormalized;

  // Shorthand: string overrides only switch mode
  if (typeof override === 'string') {
    if (!isSignerMode(override)) return baseNormalized;
    if (override === 'local-signer') return { mode: 'local-signer' };
    // override === 'threshold-signer'
    if (baseNormalized.mode === 'threshold-signer') {
      const behavior = (baseNormalized as { behavior?: unknown }).behavior;
      return isThresholdBehavior(behavior)
        ? { mode: 'threshold-signer', behavior }
        : { mode: 'threshold-signer' };
    }
    return { mode: 'threshold-signer' };
  }

  if (typeof override !== 'object') return baseNormalized;

  const mode = (override as { mode?: unknown }).mode;
  if (mode === 'local-signer') return { mode: 'local-signer' };
  if (mode !== 'threshold-signer') return baseNormalized;

  const behavior = (override as { behavior?: unknown }).behavior;
  if (isThresholdBehavior(behavior)) return { mode: 'threshold-signer', behavior };

  // Preserve base threshold behavior when override didn't specify it
  if (baseNormalized.mode === 'threshold-signer') {
    const baseBehavior = (baseNormalized as { behavior?: unknown }).behavior;
    if (isThresholdBehavior(baseBehavior)) return { mode: 'threshold-signer', behavior: baseBehavior };
  }
  return { mode: 'threshold-signer' };
}

export function getSignerModeString(mode: SignerMode): SignerMode['mode'] {
  return mode.mode;
}

export function getThresholdBehaviorFromSignerMode(mode: SignerMode): ThresholdBehavior {
  if (mode.mode !== 'threshold-signer') return DEFAULT_THRESHOLD_BEHAVIOR;
  return isThresholdBehavior(mode.behavior) ? mode.behavior : DEFAULT_THRESHOLD_BEHAVIOR;
}

/**
 * Internal, single-purpose worker request types.
 *
 * These are intentionally *not* exposed as general-purpose "no prompt" signing APIs.
 * They exist to support tightly-scoped post-registration flows without allowing
 * arbitrary actions/receivers to be signed without VRF/WebAuthn binding.
 */
export const INTERNAL_WORKER_REQUEST_TYPE_SIGN_ADD_KEY_THRESHOLD_PUBLIC_KEY_NO_PROMPT = 10 as const;
export const INTERNAL_WORKER_RESPONSE_TYPE_SIGN_ADD_KEY_THRESHOLD_PUBLIC_KEY_NO_PROMPT_SUCCESS = 24 as const;
export const INTERNAL_WORKER_RESPONSE_TYPE_SIGN_ADD_KEY_THRESHOLD_PUBLIC_KEY_NO_PROMPT_FAILURE = 25 as const;

type InternalSignerWorkerRequestType = typeof INTERNAL_WORKER_REQUEST_TYPE_SIGN_ADD_KEY_THRESHOLD_PUBLIC_KEY_NO_PROMPT;
type InternalSignerWorkerResponseType =
  | typeof INTERNAL_WORKER_RESPONSE_TYPE_SIGN_ADD_KEY_THRESHOLD_PUBLIC_KEY_NO_PROMPT_SUCCESS
  | typeof INTERNAL_WORKER_RESPONSE_TYPE_SIGN_ADD_KEY_THRESHOLD_PUBLIC_KEY_NO_PROMPT_FAILURE;

export type SignerWorkerRequestType = WorkerRequestType | InternalSignerWorkerRequestType;
export type SignerWorkerResponseType = WorkerResponseType | InternalSignerWorkerResponseType;

export interface ThresholdSignerConfig {
  /** Base URL of the relayer server (e.g. https://relay.example.com) */
  relayerUrl: string;
  /** Identifies which relayer-held key share to use */
  relayerKeyId: string;
  /** FROST participant identifier used for the client share (2P only, optional). */
  clientParticipantId?: number;
  /** FROST participant identifier used for the relayer share (2P only, optional). */
  relayerParticipantId?: number;
  /** Optional participant ids (signer set) associated with this threshold key/session. */
  participantIds?: number[];
  /**
   * Optional short-lived authorization token returned by `/threshold-ed25519/authorize`.
   * When omitted, the signer worker will call `/threshold-ed25519/authorize` on-demand per signature.
   */
  mpcSessionId?: string;
  /**
   * Optional session policy JSON (serialized) used to mint a relayer threshold session token.
   * When provided alongside a VRF challenge that includes `sessionPolicyDigest32`,
   * the signer worker may call `/threshold-ed25519/session` to obtain a JWT/cookie for session-style signing.
   */
  thresholdSessionPolicyJson?: string;
  /**
   * Optional bearer token returned by `POST /threshold-ed25519/session`.
   * When present, the signer worker uses it to authenticate `/threshold-ed25519/authorize` requests.
   */
  thresholdSessionJwt?: string;
  /**
   * Preferred session token delivery mechanism for `/threshold-ed25519/session`.
   * - `jwt` (default): return token in JSON and use Authorization: Bearer on subsequent requests.
   * - `cookie`: set HttpOnly cookie (same-site only).
   */
  thresholdSessionKind?: 'jwt' | 'cookie';
}

export interface TransactionPayload {
  nearAccountId: string;
  receiverId: string;
  actions: ActionArgsWasm[];
}
export type RpcCallPayload = StripFree<wasmModule.RpcCallPayload>;
/**
 * RPC call parameters for NEAR operations and VRF generation
 * Used to pass essential parameters for background operations
 * export interface RpcCallPayload {
 *    contractId: string;    // Web3Authn contract ID for verification
 *    nearRpcUrl: string;    // NEAR RPC endpoint URL
 *    nearAccountId: string; // Account ID for VRF challenge generation
 * }
 */

export type WasmDeriveNearKeypairAndEncryptRequest = StripFree<wasmModule.DeriveNearKeypairAndEncryptRequest>;
export type WasmRecoverKeypairRequest = StripFree<wasmModule.RecoverKeypairRequest>;
export type WasmDeriveThresholdEd25519ClientVerifyingShareRequest =
  StripFree<wasmModule.DeriveThresholdEd25519ClientVerifyingShareRequest>;
export interface WasmSignTransactionsWithActionsRequest {
  signerMode: SignerMode['mode'];
  rpcCall: RpcCallPayload;
  sessionId: string;
  createdAt?: number;
  decryption: StripFree<wasmModule.DecryptionPayload>;
  threshold?: ThresholdSignerConfig;
  txSigningRequests: TransactionPayload[];
  intentDigest?: string;
  transactionContext?: TransactionContext;
  vrfChallenge?: VRFChallenge;
  credential?: string;
}

export interface WasmSignAddKeyThresholdPublicKeyNoPromptRequest {
  sessionId: string;
  createdAt?: number;
  decryption: StripFree<wasmModule.DecryptionPayload>;
  nearAccountId: string;
  thresholdPublicKey: string;
  relayerVerifyingShareB64u: string;
  clientParticipantId?: number;
  relayerParticipantId?: number;
  transactionContext: TransactionContext;
}

export interface WasmSignDelegateActionRequest {
  signerMode: SignerMode['mode'];
  rpcCall: RpcCallPayload;
  sessionId: string;
  createdAt?: number;
  decryption: StripFree<wasmModule.DecryptionPayload>;
  threshold?: ThresholdSignerConfig;
  delegate: DelegatePayload;
  intentDigest?: string;
  transactionContext?: TransactionContext;
  vrfChallenge?: VRFChallenge;
  credential?: string;
}
export interface DelegatePayload {
  senderId: string;
  receiverId: string;
  actions: ActionArgsWasm[];
  nonce: string;
  maxBlockHeight: string;
  publicKey: string;
}
export type WasmDecryptPrivateKeyRequest = StripFree<wasmModule.DecryptPrivateKeyRequest>;
export type WasmExtractCosePublicKeyRequest = StripFree<wasmModule.ExtractCoseRequest>;
export interface WasmSignNep413MessageRequest {
  signerMode: SignerMode['mode'];
  sessionId: string;
  accountId: string;
  nearPublicKey: string;
  decryption: StripFree<wasmModule.DecryptionPayload>;
  threshold?: ThresholdSignerConfig;
  message: string;
  recipient: string;
  nonce: string;
  state?: string;
  vrfChallenge?: VRFChallenge;
  credential?: string;
}
export interface WasmSignTransactionWithKeyPairRequest {
  nearPrivateKey: string;
  signerAccountId: string;
  receiverId: string;
  nonce: string;
  blockHash: string;
  actions: ActionArgsWasm[];
}
// Combined Device2 registration handler (derive + sign in one step)
export type WasmRegisterDevice2WithDerivedKeyRequest = StripFree<wasmModule.RegisterDevice2WithDerivedKeyRequest>;

export type WasmRequestPayload = WasmDeriveNearKeypairAndEncryptRequest
  | WasmRecoverKeypairRequest
  | WasmDeriveThresholdEd25519ClientVerifyingShareRequest
  | WasmSignTransactionsWithActionsRequest
  | WasmSignAddKeyThresholdPublicKeyNoPromptRequest
  | WasmSignDelegateActionRequest
  | WasmDecryptPrivateKeyRequest
  | WasmExtractCosePublicKeyRequest
  | WasmSignNep413MessageRequest
  | WasmSignTransactionWithKeyPairRequest
  | WasmRegisterDevice2WithDerivedKeyRequest;

// WASM Worker Response Types
export type WasmRecoverKeypairResult = InstanceType<typeof wasmModule.RecoverKeypairResult>;
export type WasmSignedTransaction = InstanceType<typeof wasmModule.WasmSignedTransaction>;
export type WasmSignedDelegate = wasmModule.WasmSignedDelegate;
export type WasmDelegateAction = wasmModule.WasmDelegateAction;
export type WasmTransactionSignResult = InstanceType<typeof wasmModule.TransactionSignResult>;
export type WasmDelegateSignResult = wasmModule.DelegateSignResult;
export type WasmDecryptPrivateKeyResult = InstanceType<typeof wasmModule.DecryptPrivateKeyResult>;
export type WasmDeriveNearKeypairAndEncryptResult = InstanceType<typeof wasmModule.DeriveNearKeypairAndEncryptResult>;
// wasm-bindgen generates some classes with private constructors, which breaks
// `InstanceType<typeof Class>`. Use the class name directly for the instance type.
export type WasmRegisterDevice2WithDerivedKeyResult = InstanceType<typeof wasmModule.RegisterDevice2WithDerivedKeyResult>;
// wasm-bindgen may generate classes with private constructors, which breaks
// `InstanceType<typeof Class>`. Use the class name directly for the instance type.
export type WasmDeriveThresholdEd25519ClientVerifyingShareResult =
  wasmModule.DeriveThresholdEd25519ClientVerifyingShareResult;

// === WORKER REQUEST TYPE MAPPING ===
// Define the complete type mapping for each worker request
export interface WorkerRequestTypeMap {
  [WorkerRequestType.DeriveNearKeypairAndEncrypt]: {
    type: WorkerRequestType.DeriveNearKeypairAndEncrypt;
    request: WasmDeriveNearKeypairAndEncryptRequest;
    result: WasmDeriveNearKeypairAndEncryptResult;
  };
  [WorkerRequestType.RecoverKeypairFromPasskey]: {
    type: WorkerRequestType.RecoverKeypairFromPasskey;
    request: WasmRecoverKeypairRequest;
    result: WasmRecoverKeypairResult;
  };
  [WorkerRequestType.DeriveThresholdEd25519ClientVerifyingShare]: {
    type: WorkerRequestType.DeriveThresholdEd25519ClientVerifyingShare;
    request: WasmDeriveThresholdEd25519ClientVerifyingShareRequest;
    result: WasmDeriveThresholdEd25519ClientVerifyingShareResult;
  };
  [WorkerRequestType.SignTransactionsWithActions]: {
    type: WorkerRequestType.SignTransactionsWithActions;
    request: WasmSignTransactionsWithActionsRequest;
    result: WasmTransactionSignResult;
  };
  [INTERNAL_WORKER_REQUEST_TYPE_SIGN_ADD_KEY_THRESHOLD_PUBLIC_KEY_NO_PROMPT]: {
    type: typeof INTERNAL_WORKER_REQUEST_TYPE_SIGN_ADD_KEY_THRESHOLD_PUBLIC_KEY_NO_PROMPT;
    request: WasmSignAddKeyThresholdPublicKeyNoPromptRequest;
    result: WasmTransactionSignResult;
  };
  [WorkerRequestType.SignDelegateAction]: {
    type: WorkerRequestType.SignDelegateAction;
    request: WasmSignDelegateActionRequest;
    result: WasmDelegateSignResult;
  };
  [WorkerRequestType.DecryptPrivateKeyWithPrf]: {
    type: WorkerRequestType.DecryptPrivateKeyWithPrf;
    request: WasmDecryptPrivateKeyRequest;
    result: WasmDecryptPrivateKeyResult;
  };
  [WorkerRequestType.ExtractCosePublicKey]: {
    type: WorkerRequestType.ExtractCosePublicKey;
    request: WasmExtractCosePublicKeyRequest;
    result: wasmModule.CoseExtractionResult;
  };
  [WorkerRequestType.SignTransactionWithKeyPair]: {
    type: WorkerRequestType.SignTransactionWithKeyPair;
    request: WasmSignTransactionWithKeyPairRequest;
    result: WasmTransactionSignResult;
  };
  [WorkerRequestType.SignNep413Message]: {
    type: WorkerRequestType.SignNep413Message;
    request: WasmSignNep413MessageRequest;
    result: wasmModule.SignNep413Result;
  };
  [WorkerRequestType.RegisterDevice2WithDerivedKey]: {
    type: WorkerRequestType.RegisterDevice2WithDerivedKey;
    request: WasmRegisterDevice2WithDerivedKeyRequest;
    result: WasmRegisterDevice2WithDerivedKeyResult;
  };
}

/**
 * Validation rules for ConfirmationConfig to ensure behavior conforms to UI mode:
 *
 * - uiMode: 'skip' → behavior is ignored, autoProceedDelay is ignored
 * - uiMode: 'modal' | 'drawer' → behavior: 'requireClick' | 'autoProceed', autoProceedDelay only used with 'autoProceed'
 *
 * The WASM worker automatically validates and overrides these settings:
 * - For 'skip' mode: behavior is set to 'autoProceed' with autoProceedDelay: 0
 * - For 'modal' and 'drawer' modes: behavior and autoProceedDelay are used as specified
 *
 * The actual type would be the following, but we use the flat interface for simplicity:
 * export interface ConfirmationConfig {
 *   uiMode: 'skip' | 'modal' | 'drawer'
 *
 * }
 */
export type ConfirmationUIMode = 'skip' | 'modal' | 'drawer';
export type ConfirmationBehavior = 'requireClick' | 'autoProceed';
export interface ConfirmationConfig {
  /** Type of UI to display for confirmation: 'skip' | 'modal' | 'drawer' */
  uiMode: ConfirmationUIMode;
  /** How the confirmation UI behaves: 'requireClick' | 'autoProceed' */
  behavior: ConfirmationBehavior;
  /** Delay in milliseconds before auto-proceeding (only used with autoProceed) */
  autoProceedDelay?: number;
}

export const DEFAULT_CONFIRMATION_CONFIG: ConfirmationConfig = {
  uiMode: 'modal',
  behavior: 'requireClick',
  autoProceedDelay: 0,
};

// WASM enum types for confirmation configuration
export type WasmConfirmationUIMode = wasmModule.ConfirmationUIMode;
export type WasmConfirmationBehavior = wasmModule.ConfirmationBehavior;

// Mapping functions to convert string literals to numeric enum values
export const mapUIModeToWasm = (uiMode: ConfirmationUIMode): number => {
  switch (uiMode) {
    case 'skip': return wasmModule.ConfirmationUIMode.Skip;
    case 'modal': return wasmModule.ConfirmationUIMode.Modal;
    // Drawer now has a dedicated WASM enum variant
    case 'drawer': return (wasmModule as any).ConfirmationUIMode.Drawer ?? wasmModule.ConfirmationUIMode.Modal;
    default: return wasmModule.ConfirmationUIMode.Modal;
  }
};

export const mapBehaviorToWasm = (behavior: ConfirmationBehavior): number => {
  switch (behavior) {
    case 'requireClick': return wasmModule.ConfirmationBehavior.RequireClick;
    case 'autoProceed': return wasmModule.ConfirmationBehavior.AutoProceed;
    default: return wasmModule.ConfirmationBehavior.RequireClick;
  }
};
export type WasmRequestResult = WasmRecoverKeypairResult
  | WasmSignedTransaction
  | WasmSignedDelegate
  | WasmTransactionSignResult
  | WasmDelegateSignResult
  | WasmDecryptPrivateKeyResult

export interface SignerWorkerMessage<T extends SignerWorkerRequestType, R extends WasmRequestPayload> {
  type: T;
  payload: R;
}

/**
 * =============================
 * Worker Progress Message Types
 * =============================
 *
 * 1. PROGRESS MESSAGES (During Operation):
 *    Rust WASM → send_typed_progress_message() → TypeScript sendProgressMessage() → postMessage() → Main Thread
 *    - Used for real-time updates during long operations
 *    - Multiple progress messages can be sent per operation
 *    - Does not affect the final result
 *    - Types: ProgressMessageType, ProgressStep, ProgressStatus (auto-generated from Rust)
 *
 * 2. FINAL RESULTS (Operation Complete):
 *    Rust WASM → return value from handle_signer_message() → TypeScript worker → postMessage() → Main Thread
 *    - Contains the actual operation result (success/error)
 *    - Only one result message per operation
 *    - This is what the main thread awaits for completion
 */

// === PROGRESS MESSAGE TYPES ===

// Basic interface for development - actual types are auto-generated from Rust
export type ProgressMessage = wasmModule.WorkerProgressMessage;

// Type guard for basic progress message validation during development
export function isProgressMessage(obj: unknown): obj is ProgressMessage {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof (obj as { message_type?: unknown }).message_type === 'string' &&
    typeof (obj as { step?: unknown }).step === 'string' &&
    typeof (obj as { message?: unknown }).message === 'string' &&
    typeof (obj as { status?: unknown }).status === 'string'
  );
}

export enum ProgressMessageType {
  REGISTRATION_PROGRESS = 'REGISTRATION_PROGRESS',
  REGISTRATION_COMPLETE = 'REGISTRATION_COMPLETE',
  EXECUTE_ACTIONS_PROGRESS = 'EXECUTE_ACTIONS_PROGRESS',
  EXECUTE_ACTIONS_COMPLETE = 'EXECUTE_ACTIONS_COMPLETE',
}

// Step identifiers for progress tracking
// This enum exactly matches the Rust WASM ProgressStep enum from:
// packages/passkey/src/wasm_signer_worker/src/types/progress.rs
// The string values come from the progress_step_name() function in that file
export enum ProgressStep {
  PREPARATION = 'preparation',                           // Rust: Preparation
  WEBAUTHN_AUTHENTICATION = 'webauthn-authentication',   // Rust: WebauthnAuthentication
  AUTHENTICATION_COMPLETE = 'authentication-complete',   // Rust: AuthenticationComplete
  TRANSACTION_SIGNING_PROGRESS = 'transaction-signing-progress', // Rust: TransactionSigningProgress
  TRANSACTION_SIGNING_COMPLETE = 'transaction-signing-complete', // Rust: TransactionSigningComplete
  ERROR = 'error',                                       // Rust: Error
}

export interface ProgressStepMap {
  [wasmModule.ProgressStep.Preparation]: ProgressStep.PREPARATION;
  [wasmModule.ProgressStep.WebauthnAuthentication]: ProgressStep.WEBAUTHN_AUTHENTICATION;
  [wasmModule.ProgressStep.AuthenticationComplete]: ProgressStep.AUTHENTICATION_COMPLETE;
  [wasmModule.ProgressStep.TransactionSigningProgress]: ProgressStep.TRANSACTION_SIGNING_PROGRESS;
  [wasmModule.ProgressStep.TransactionSigningComplete]: ProgressStep.TRANSACTION_SIGNING_COMPLETE;
  [wasmModule.ProgressStep.Error]: ProgressStep.ERROR;
}

// === RESPONSE MESSAGE INTERFACES ===

// Base interface for all worker responses
export interface BaseWorkerResponse<TPayload = unknown> {
  type: SignerWorkerResponseType;
  payload: TPayload;
}

// Map request types to their expected success response payloads (WASM types)
export interface RequestResponseMap {
  [WorkerRequestType.DeriveNearKeypairAndEncrypt]: WasmDeriveNearKeypairAndEncryptResult;
  [WorkerRequestType.RecoverKeypairFromPasskey]: WasmRecoverKeypairResult;
  [WorkerRequestType.DecryptPrivateKeyWithPrf]: WasmDecryptPrivateKeyResult;
  [WorkerRequestType.DeriveThresholdEd25519ClientVerifyingShare]: WasmDeriveThresholdEd25519ClientVerifyingShareResult;
  [WorkerRequestType.SignTransactionsWithActions]: WasmTransactionSignResult;
  [INTERNAL_WORKER_REQUEST_TYPE_SIGN_ADD_KEY_THRESHOLD_PUBLIC_KEY_NO_PROMPT]: WasmTransactionSignResult;
  [WorkerRequestType.SignDelegateAction]: WasmDelegateSignResult;
  [WorkerRequestType.ExtractCosePublicKey]: wasmModule.CoseExtractionResult;
  [WorkerRequestType.SignTransactionWithKeyPair]: WasmTransactionSignResult;
  [WorkerRequestType.SignNep413Message]: wasmModule.SignNep413Result;
  [WorkerRequestType.RegisterDevice2WithDerivedKey]: WasmRegisterDevice2WithDerivedKeyResult;
}

export type RequestTypeKey = keyof RequestResponseMap;

// Generic success response type that uses WASM types
export interface WorkerSuccessResponse<T extends RequestTypeKey>
  extends BaseWorkerResponse<RequestResponseMap[T]> {
  type: SignerWorkerResponseType;
}

// Generic error response type
export interface WorkerErrorResponse extends BaseWorkerResponse<{
  error: string;
  errorCode?: WorkerErrorCode;
  context?: Record<string, unknown>;
}> {
  type: SignerWorkerResponseType;
}

export enum WorkerErrorCode {
  WASM_INIT_FAILED = 'WASM_INIT_FAILED',
  INVALID_REQUEST = 'INVALID_REQUEST',
  TIMEOUT = 'TIMEOUT',
  ENCRYPTION_FAILED = 'ENCRYPTION_FAILED',
  DECRYPTION_FAILED = 'DECRYPTION_FAILED',
  SIGNING_FAILED = 'SIGNING_FAILED',
  STORAGE_FAILED = 'STORAGE_FAILED',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

export interface WorkerProgressResponse extends BaseWorkerResponse<onProgressEvents> {
  type: SignerWorkerResponseType;
}

// === MAIN RESPONSE TYPE ===

export type WorkerResponseForRequest<T extends RequestTypeKey> =
  | WorkerSuccessResponse<T>
  | WorkerErrorResponse
  | WorkerProgressResponse;

// === CONVENIENCE TYPE ALIASES ===

export type EncryptionResponse = WorkerResponseForRequest<typeof WorkerRequestType.DeriveNearKeypairAndEncrypt>;
export type RecoveryResponse = WorkerResponseForRequest<typeof WorkerRequestType.RecoverKeypairFromPasskey>;
export type TransactionResponse = WorkerResponseForRequest<typeof WorkerRequestType.SignTransactionsWithActions>;
export type DelegateSignResponse = WorkerResponseForRequest<typeof WorkerRequestType.SignDelegateAction>;
export type DecryptionResponse = WorkerResponseForRequest<typeof WorkerRequestType.DecryptPrivateKeyWithPrf>;
export type CoseExtractionResponse = WorkerResponseForRequest<typeof WorkerRequestType.ExtractCosePublicKey>;
export type Nep413SigningResponse = WorkerResponseForRequest<typeof WorkerRequestType.SignNep413Message>;

// === TYPE GUARDS FOR GENERIC RESPONSES ===

export function isWorkerProgress<T extends RequestTypeKey>(
  response: WorkerResponseForRequest<T>
): response is WorkerProgressResponse {
  return (
    response.type === WorkerResponseType.RegistrationProgress ||
    response.type === WorkerResponseType.RegistrationComplete ||
    response.type === WorkerResponseType.ExecuteActionsProgress ||
    response.type === WorkerResponseType.ExecuteActionsComplete
  );
}

export function isWorkerSuccess<T extends RequestTypeKey>(
  response: WorkerResponseForRequest<T>
): response is WorkerSuccessResponse<T> {
  return (
    response.type === WorkerResponseType.DeriveNearKeypairAndEncryptSuccess ||
    response.type === WorkerResponseType.RecoverKeypairFromPasskeySuccess ||
    response.type === WorkerResponseType.DecryptPrivateKeyWithPrfSuccess ||
    response.type === WorkerResponseType.SignTransactionsWithActionsSuccess ||
    response.type === WorkerResponseType.SignDelegateActionSuccess ||
    response.type === WorkerResponseType.ExtractCosePublicKeySuccess ||
    response.type === WorkerResponseType.SignTransactionWithKeyPairSuccess ||
    response.type === WorkerResponseType.SignNep413MessageSuccess ||
    response.type === WorkerResponseType.RegisterDevice2WithDerivedKeySuccess ||
    response.type === WorkerResponseType.DeriveThresholdEd25519ClientVerifyingShareSuccess ||
    response.type === INTERNAL_WORKER_RESPONSE_TYPE_SIGN_ADD_KEY_THRESHOLD_PUBLIC_KEY_NO_PROMPT_SUCCESS
  );
}

export function isWorkerError<T extends RequestTypeKey>(
  response: WorkerResponseForRequest<T>
): response is WorkerErrorResponse {
  return (
    response.type === WorkerResponseType.DeriveNearKeypairAndEncryptFailure ||
    response.type === WorkerResponseType.RecoverKeypairFromPasskeyFailure ||
    response.type === WorkerResponseType.DecryptPrivateKeyWithPrfFailure ||
    response.type === WorkerResponseType.SignTransactionsWithActionsFailure ||
    response.type === WorkerResponseType.SignDelegateActionFailure ||
    response.type === WorkerResponseType.ExtractCosePublicKeyFailure ||
    response.type === WorkerResponseType.SignTransactionWithKeyPairFailure ||
    response.type === WorkerResponseType.SignNep413MessageFailure ||
    response.type === WorkerResponseType.RegisterDevice2WithDerivedKeyFailure ||
    response.type === WorkerResponseType.DeriveThresholdEd25519ClientVerifyingShareFailure ||
    response.type === INTERNAL_WORKER_RESPONSE_TYPE_SIGN_ADD_KEY_THRESHOLD_PUBLIC_KEY_NO_PROMPT_FAILURE
  );
}

// === SPECIFIC TYPE GUARDS FOR COMMON OPERATIONS ===

export function isDeriveNearKeypairAndEncryptSuccess(response: EncryptionResponse): response is WorkerSuccessResponse<typeof WorkerRequestType.DeriveNearKeypairAndEncrypt> {
  return response.type === WorkerResponseType.DeriveNearKeypairAndEncryptSuccess;
}

export function isRecoverKeypairFromPasskeySuccess(response: RecoveryResponse): response is WorkerSuccessResponse<typeof WorkerRequestType.RecoverKeypairFromPasskey> {
  return response.type === WorkerResponseType.RecoverKeypairFromPasskeySuccess;
}

export function isSignTransactionsWithActionsSuccess(response: TransactionResponse): response is WorkerSuccessResponse<typeof WorkerRequestType.SignTransactionsWithActions> {
  return response.type === WorkerResponseType.SignTransactionsWithActionsSuccess;
}

export function isSignAddKeyThresholdPublicKeyNoPromptSuccess(
  response: WorkerResponseForRequest<typeof INTERNAL_WORKER_REQUEST_TYPE_SIGN_ADD_KEY_THRESHOLD_PUBLIC_KEY_NO_PROMPT>
): response is WorkerSuccessResponse<typeof INTERNAL_WORKER_REQUEST_TYPE_SIGN_ADD_KEY_THRESHOLD_PUBLIC_KEY_NO_PROMPT> {
  return response.type === INTERNAL_WORKER_RESPONSE_TYPE_SIGN_ADD_KEY_THRESHOLD_PUBLIC_KEY_NO_PROMPT_SUCCESS;
}

export function isSignDelegateActionSuccess(response: DelegateSignResponse): response is WorkerSuccessResponse<typeof WorkerRequestType.SignDelegateAction> {
  return response.type === WorkerResponseType.SignDelegateActionSuccess;
}

export function isDecryptPrivateKeyWithPrfSuccess(response: DecryptionResponse): response is WorkerSuccessResponse<typeof WorkerRequestType.DecryptPrivateKeyWithPrf> {
  return response.type === WorkerResponseType.DecryptPrivateKeyWithPrfSuccess;
}

export function isExtractCosePublicKeySuccess(response: CoseExtractionResponse): response is WorkerSuccessResponse<typeof WorkerRequestType.ExtractCosePublicKey> {
  return response.type === WorkerResponseType.ExtractCosePublicKeySuccess;
}

export function isSignNep413MessageSuccess(response: Nep413SigningResponse): response is WorkerSuccessResponse<typeof WorkerRequestType.SignNep413Message> {
  return response.type === WorkerResponseType.SignNep413MessageSuccess;
}

export function isRegisterDevice2WithDerivedKeySuccess(
  response: WorkerResponseForRequest<typeof WorkerRequestType.RegisterDevice2WithDerivedKey>
): response is WorkerSuccessResponse<typeof WorkerRequestType.RegisterDevice2WithDerivedKey> {
  return response.type === WorkerResponseType.RegisterDevice2WithDerivedKeySuccess;
}
