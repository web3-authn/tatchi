
// === IMPORT AUTO-GENERATED WASM TYPES ===
// These are the source of truth generated from Rust structs via wasm-bindgen
// Import as instance types from the WASM module classes
import * as wasmModule from '../../wasm_signer_worker/pkg/wasm_signer_worker.js';
import { WorkerRequestType, WorkerResponseType } from '../../wasm_signer_worker/pkg/wasm_signer_worker.js';
export { WorkerRequestType, WorkerResponseType }; // Export the WASM enums directly

import { StripFree } from "./index.js";
import type { onProgressEvents } from "./passkeyManager.js";

export type WasmTransaction = wasmModule.WasmTransaction;
export type WasmSignature = wasmModule.WasmSignature;
export type TransactionPayload = StripFree<wasmModule.TransactionPayload>;
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
export type WasmCheckCanRegisterUserRequest = StripFree<wasmModule.CheckCanRegisterUserRequest>;
// Override the WASM request type to accept string literals for confirmation config
export type WasmSignTransactionsWithActionsRequest = Omit<StripFree<wasmModule.SignTransactionsWithActionsRequest>, 'confirmationConfig'> & {
  confirmationConfig?: {
    uiMode: ConfirmationUIMode;
    behavior: ConfirmationBehavior;
    autoProceedDelay?: number;
    theme?: 'dark' | 'light';
  };
};
export type WasmDecryptPrivateKeyRequest = StripFree<wasmModule.DecryptPrivateKeyRequest>;
export type WasmExtractCosePublicKeyRequest = StripFree<wasmModule.ExtractCoseRequest>;
export type WasmSignNep413MessageRequest = StripFree<wasmModule.SignNep413Request>;
export type WasmSignTransactionWithKeyPairRequest = StripFree<wasmModule.SignTransactionWithKeyPairRequest>;
export type WasmRegistrationCredentialConfirmationRequest = StripFree<wasmModule.RegistrationCredentialConfirmationRequest>;
export type WasmExportNearKeypairUiRequest = StripFree<wasmModule.ExportNearKeypairUiRequest>;

export type WasmRequestPayload = WasmDeriveNearKeypairAndEncryptRequest
  | WasmRecoverKeypairRequest
  | WasmCheckCanRegisterUserRequest
  | WasmSignTransactionsWithActionsRequest
  | WasmDecryptPrivateKeyRequest
  | WasmExtractCosePublicKeyRequest
  | WasmSignNep413MessageRequest
  | WasmSignTransactionWithKeyPairRequest
  | WasmExportNearKeypairUiRequest;

// WASM Worker Response Types
export type WasmRecoverKeypairResult = InstanceType<typeof wasmModule.RecoverKeypairResult>;
export type WasmRegistrationCheckResult = InstanceType<typeof wasmModule.RegistrationCheckResult>;
export type WasmSignedTransaction = InstanceType<typeof wasmModule.WasmSignedTransaction>;
export type WasmTransactionSignResult = InstanceType<typeof wasmModule.TransactionSignResult>;
export type WasmDecryptPrivateKeyResult = InstanceType<typeof wasmModule.DecryptPrivateKeyResult>;
export type WasmDeriveNearKeypairAndEncryptResult = InstanceType<typeof wasmModule.DeriveNearKeypairAndEncryptResult>;
// wasm-bindgen generates some classes with private constructors, which breaks
// `InstanceType<typeof Class>`. Use the class name directly for the instance type.
export type WasmRegistrationCredentialConfirmationResult = wasmModule.RegistrationCredentialConfirmationResult;
export type WasmExportNearKeypairUiResult = wasmModule.ExportNearKeypairUiResult;


export type WasmSignerWorkerRequest = {
  type: WorkerRequestType;
  request: WasmRequestPayload;
  result: WasmRequestResult;
}

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
  [WorkerRequestType.CheckCanRegisterUser]: {
    type: WorkerRequestType.CheckCanRegisterUser;
    request: WasmCheckCanRegisterUserRequest;
    result: WasmRegistrationCheckResult;
  };
  [WorkerRequestType.SignTransactionsWithActions]: {
    type: WorkerRequestType.SignTransactionsWithActions;
    request: WasmSignTransactionsWithActionsRequest;
    result: WasmTransactionSignResult;
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
  [WorkerRequestType.RegistrationCredentialConfirmation]: {
    type: WorkerRequestType.RegistrationCredentialConfirmation;
    request: WasmRegistrationCredentialConfirmationRequest;
    result: wasmModule.RegistrationCredentialConfirmationResult;
  };
  [WorkerRequestType.ExportNearKeypairUI]: {
    type: WorkerRequestType.ExportNearKeypairUI;
    request: WasmExportNearKeypairUiRequest;
    result: WasmExportNearKeypairUiResult;
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
  /** Theme for the confirmation UI: 'dark' | 'light' */
  theme: 'dark' | 'light';
  /** Visual container variant for modal UIs: 'modal' | 'drawer' (optional; host-only) */
  variant?: 'modal' | 'drawer';
}

export const DEFAULT_CONFIRMATION_CONFIG: ConfirmationConfig = {
  uiMode: 'modal',
  behavior: 'autoProceed',
  autoProceedDelay: 1000,
  theme: 'dark',
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
  | WasmRegistrationCheckResult
  | WasmSignedTransaction
  | WasmTransactionSignResult
  | WasmDecryptPrivateKeyResult
  | WasmExportNearKeypairUiResult

export interface SignerWorkerMessage<T extends WorkerRequestType, R extends WasmRequestPayload> {
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
export interface BaseWorkerResponse {
  type: WorkerResponseType;
  payload: unknown;
}

// Map request types to their expected success response payloads (WASM types)
export interface RequestResponseMap {
  [WorkerRequestType.DeriveNearKeypairAndEncrypt]: WasmDeriveNearKeypairAndEncryptResult;
  [WorkerRequestType.RecoverKeypairFromPasskey]: WasmRecoverKeypairResult;
  [WorkerRequestType.CheckCanRegisterUser]: WasmRegistrationCheckResult;
  [WorkerRequestType.DecryptPrivateKeyWithPrf]: WasmDecryptPrivateKeyResult;
  [WorkerRequestType.SignTransactionsWithActions]: WasmTransactionSignResult;
  [WorkerRequestType.ExtractCosePublicKey]: wasmModule.CoseExtractionResult;
  [WorkerRequestType.SignTransactionWithKeyPair]: WasmTransactionSignResult;
  [WorkerRequestType.SignNep413Message]: wasmModule.SignNep413Result;
  [WorkerRequestType.RegistrationCredentialConfirmation]: wasmModule.RegistrationCredentialConfirmationResult;
  [WorkerRequestType.ExportNearKeypairUI]: WasmExportNearKeypairUiResult;
}

// Generic success response type that uses WASM types
export interface WorkerSuccessResponse<T extends WorkerRequestType> extends BaseWorkerResponse {
  type: WorkerResponseType;
  payload: RequestResponseMap[T];
}

// Generic error response type
export interface WorkerErrorResponse extends BaseWorkerResponse {
  type: WorkerResponseType;
  payload: {
    error: string;
    errorCode?: WorkerErrorCode;
    context?: Record<string, unknown>;
  };
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

export interface WorkerProgressResponse extends BaseWorkerResponse {
  type: WorkerResponseType;
  payload: onProgressEvents
}

// === MAIN RESPONSE TYPE ===

type RequestTypeKey = keyof RequestResponseMap;

export type WorkerResponseForRequest<T extends RequestTypeKey> =
  | WorkerSuccessResponse<T>
  | WorkerErrorResponse
  | WorkerProgressResponse;

// === CONVENIENCE TYPE ALIASES ===

export type EncryptionResponse = WorkerResponseForRequest<typeof WorkerRequestType.DeriveNearKeypairAndEncrypt>;
export type RecoveryResponse = WorkerResponseForRequest<typeof WorkerRequestType.RecoverKeypairFromPasskey>;
export type CheckRegistrationResponse = WorkerResponseForRequest<typeof WorkerRequestType.CheckCanRegisterUser>;
export type TransactionResponse = WorkerResponseForRequest<typeof WorkerRequestType.SignTransactionsWithActions>;
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
    response.type === WorkerResponseType.CheckCanRegisterUserSuccess ||
    response.type === WorkerResponseType.DecryptPrivateKeyWithPrfSuccess ||
    response.type === WorkerResponseType.SignTransactionsWithActionsSuccess ||
    response.type === WorkerResponseType.ExtractCosePublicKeySuccess ||
    response.type === WorkerResponseType.SignTransactionWithKeyPairSuccess ||
    response.type === WorkerResponseType.SignNep413MessageSuccess ||
    response.type === WorkerResponseType.RegistrationCredentialConfirmationSuccess ||
    response.type === WorkerResponseType.ExportNearKeypairUiSuccess
  );
}

export function isWorkerError<T extends RequestTypeKey>(
  response: WorkerResponseForRequest<T>
): response is WorkerErrorResponse {
  return (
    response.type === WorkerResponseType.DeriveNearKeypairAndEncryptFailure ||
    response.type === WorkerResponseType.RecoverKeypairFromPasskeyFailure ||
    response.type === WorkerResponseType.CheckCanRegisterUserFailure ||
    response.type === WorkerResponseType.DecryptPrivateKeyWithPrfFailure ||
    response.type === WorkerResponseType.SignTransactionsWithActionsFailure ||
    response.type === WorkerResponseType.ExtractCosePublicKeyFailure ||
    response.type === WorkerResponseType.SignTransactionWithKeyPairFailure ||
    response.type === WorkerResponseType.SignNep413MessageFailure ||
    response.type === WorkerResponseType.RegistrationCredentialConfirmationFailure ||
    response.type === WorkerResponseType.ExportNearKeypairUiFailure
  );
}

// === SPECIFIC TYPE GUARDS FOR COMMON OPERATIONS ===

export function isDeriveNearKeypairAndEncryptSuccess(response: EncryptionResponse): response is WorkerSuccessResponse<typeof WorkerRequestType.DeriveNearKeypairAndEncrypt> {
  return response.type === WorkerResponseType.DeriveNearKeypairAndEncryptSuccess;
}

export function isRecoverKeypairFromPasskeySuccess(response: RecoveryResponse): response is WorkerSuccessResponse<typeof WorkerRequestType.RecoverKeypairFromPasskey> {
  return response.type === WorkerResponseType.RecoverKeypairFromPasskeySuccess;
}

export function isCheckCanRegisterUserSuccess(response: CheckRegistrationResponse): response is WorkerSuccessResponse<typeof WorkerRequestType.CheckCanRegisterUser> {
  return response.type === WorkerResponseType.CheckCanRegisterUserSuccess;
}

export function isSignTransactionsWithActionsSuccess(response: TransactionResponse): response is WorkerSuccessResponse<typeof WorkerRequestType.SignTransactionsWithActions> {
  return response.type === WorkerResponseType.SignTransactionsWithActionsSuccess;
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
