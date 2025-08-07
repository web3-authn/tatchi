
// === IMPORT AUTO-GENERATED WASM TYPES ===
// These are the source of truth generated from Rust structs via wasm-bindgen

// Import as instance types from the WASM module classes
import * as wasmModule from '../../wasm_signer_worker/wasm_signer_worker.js';
export type WasmRecoverKeypairResult = InstanceType<typeof wasmModule.RecoverKeypairResult>;
export type WasmRegistrationResult = InstanceType<typeof wasmModule.RegistrationResult>;
export type WasmRegistrationCheckResult = InstanceType<typeof wasmModule.RegistrationCheckResult>;
export type WasmRegistrationInfo = InstanceType<typeof wasmModule.RegistrationInfoStruct>;
export type WasmSignedTransaction = InstanceType<typeof wasmModule.WasmSignedTransaction>;
export type WasmTransactionSignResult = InstanceType<typeof wasmModule.TransactionSignResult>;
export type WasmDecryptPrivateKeyResult = InstanceType<typeof wasmModule.DecryptPrivateKeyResult>;
export type WasmEncryptionResult = InstanceType<typeof wasmModule.EncryptionResult>;

// === WASM ENUMS ===
import {
  WorkerRequestType,
  WorkerResponseType,
} from '../../wasm_signer_worker/wasm_signer_worker.js';
// Export the WASM enums directly
export { WorkerRequestType, WorkerResponseType };

import { AccountId } from "./accountIds";
import { ActionType } from "./actions";
import type { onProgressEvents } from "./passkeyManager";

// === WORKER MESSAGE TYPE ENUMS ===

/**
 * Worker error details for better debugging
 */
export interface WorkerErrorDetails {
  code: WorkerErrorCode;
  message: string;
  operation: WorkerRequestType;
  timestamp: number;
  context?: Record<string, any>;
  stack?: string;
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

// === REQUEST MESSAGE INTERFACES ===

// Base interface for all worker requests
export interface BaseWorkerRequest {
  type: WorkerRequestType;
  operationId?: string;
  timestamp?: number;
}

// === GENERIC REQUEST TYPE ===
// Generic message interface that uses WASM types
export interface WorkerMessage<T extends WorkerRequestType> {
  type: T;
  payload: any; // properly typed based on the specific request interface above
}

/**
 * Worker Communication Documentation
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
export function isProgressMessage(obj: any): obj is ProgressMessage {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof obj.message_type === 'string' &&
    typeof obj.step === 'string' &&
    typeof obj.message === 'string' &&
    typeof obj.status === 'string'
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
  payload: Record<string, any>;
}

// === GENERIC WORKER RESPONSE TYPES ===

// Map request types to their expected success response payloads (WASM types)
export interface RequestResponseMap {
  [WorkerRequestType.DeriveNearKeypairAndEncrypt]: WasmEncryptionResult;
  [WorkerRequestType.RecoverKeypairFromPasskey]: WasmRecoverKeypairResult;
  [WorkerRequestType.CheckCanRegisterUser]: WasmRegistrationCheckResult;
  [WorkerRequestType.SignVerifyAndRegisterUser]: WasmRegistrationResult;
  [WorkerRequestType.DecryptPrivateKeyWithPrf]: WasmDecryptPrivateKeyResult;
  [WorkerRequestType.SignTransactionsWithActions]: WasmTransactionSignResult;
  [WorkerRequestType.ExtractCosePublicKey]: wasmModule.CoseExtractionResult;
  [WorkerRequestType.SignTransactionWithKeyPair]: WasmTransactionSignResult;
  [WorkerRequestType.SignNep413Message]: wasmModule.SignNep413Result;
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
    context?: Record<string, any>;
  };
}

export interface WorkerProgressResponse extends BaseWorkerResponse {
  type: WorkerResponseType;
  payload: onProgressEvents
}

// === MAIN RESPONSE TYPE ===
// This is the only response type you need - it's generic and uses WASM types
export type WorkerResponseForRequest<T extends WorkerRequestType> =
  | WorkerSuccessResponse<T>
  | WorkerErrorResponse
  | WorkerProgressResponse;

// === CONVENIENCE TYPE ALIASES ===

export type EncryptionResponse = WorkerResponseForRequest<typeof WorkerRequestType.DeriveNearKeypairAndEncrypt>;
export type RecoveryResponse = WorkerResponseForRequest<typeof WorkerRequestType.RecoverKeypairFromPasskey>;
export type CheckRegistrationResponse = WorkerResponseForRequest<typeof WorkerRequestType.CheckCanRegisterUser>;
export type RegistrationResponse = WorkerResponseForRequest<typeof WorkerRequestType.SignVerifyAndRegisterUser>;
export type TransactionResponse = WorkerResponseForRequest<typeof WorkerRequestType.SignTransactionsWithActions>;
export type DecryptionResponse = WorkerResponseForRequest<typeof WorkerRequestType.DecryptPrivateKeyWithPrf>;
export type CoseExtractionResponse = WorkerResponseForRequest<typeof WorkerRequestType.ExtractCosePublicKey>;
export type Nep413SigningResponse = WorkerResponseForRequest<typeof WorkerRequestType.SignNep413Message>;

// === TYPE GUARDS FOR GENERIC RESPONSES ===

export function isWorkerProgress<T extends WorkerRequestType>(
  response: WorkerResponseForRequest<T>
): response is WorkerProgressResponse {
  return (
    response.type === WorkerResponseType.RegistrationProgress ||
    response.type === WorkerResponseType.RegistrationComplete ||
    response.type === WorkerResponseType.ExecuteActionsProgress ||
    response.type === WorkerResponseType.ExecuteActionsComplete
  );
}

export function isWorkerSuccess<T extends WorkerRequestType>(
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
    response.type === WorkerResponseType.SignVerifyAndRegisterUserSuccess
  );
}

export function isWorkerError<T extends WorkerRequestType>(
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
    response.type === WorkerResponseType.SignVerifyAndRegisterUserFailure
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

export function isSignVerifyAndRegisterUserSuccess(response: RegistrationResponse): response is WorkerSuccessResponse<typeof WorkerRequestType.SignVerifyAndRegisterUser> {
  return response.type === WorkerResponseType.SignVerifyAndRegisterUserSuccess;
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

// === ACTION TYPES ===

// ActionParams matches the Rust enum structure exactly
export type ActionParams =
  | { actionType: ActionType.CreateAccount }
  | { actionType: ActionType.DeployContract; code: number[] }
  | {
      actionType: ActionType.FunctionCall;
      method_name: string;
      args: string; // JSON string, not object
      gas: string;
      deposit: string;
    }
  | { actionType: ActionType.Transfer; deposit: string }
  | { actionType: ActionType.Stake; stake: string; public_key: string }
  | { actionType: ActionType.AddKey; public_key: string; access_key: string }
  | { actionType: ActionType.DeleteKey; public_key: string }
  | { actionType: ActionType.DeleteAccount; beneficiary_id: string }

// === ACTION TYPE VALIDATION ===

/**
 * Validate action parameters before sending to worker
 */
export function validateActionParams(actionParams: ActionParams): void {
  switch (actionParams.actionType) {
    case ActionType.FunctionCall:
      if (!actionParams.method_name) {
        throw new Error('method_name required for FunctionCall');
      }
      if (!actionParams.args) {
        throw new Error('args required for FunctionCall');
      }
      if (!actionParams.gas) {
        throw new Error('gas required for FunctionCall');
      }
      if (!actionParams.deposit) {
        throw new Error('deposit required for FunctionCall');
      }
      // Validate args is valid JSON string
      try {
        JSON.parse(actionParams.args);
      } catch {
        throw new Error('FunctionCall action args must be valid JSON string');
      }
      break;
    case ActionType.Transfer:
      if (!actionParams.deposit) {
        throw new Error('deposit required for Transfer');
      }
      break;
    case ActionType.CreateAccount:
      // No additional validation needed
      break;
    case ActionType.DeployContract:
      if (!actionParams.code || actionParams.code.length === 0) {
        throw new Error('code required for DeployContract');
      }
      break;
    case ActionType.Stake:
      if (!actionParams.stake) {
        throw new Error('stake amount required for Stake');
      }
      if (!actionParams.public_key) {
        throw new Error('public_key required for Stake');
      }
      break;
    case ActionType.AddKey:
      if (!actionParams.public_key) {
        throw new Error('public_key required for AddKey');
      }
      if (!actionParams.access_key) {
        throw new Error('access_key required for AddKey');
      }
      break;
    case ActionType.DeleteKey:
      if (!actionParams.public_key) {
        throw new Error('public_key required for DeleteKey');
      }
      break;
    case ActionType.DeleteAccount:
      if (!actionParams.beneficiary_id) {
        throw new Error('beneficiary_id required for DeleteAccount');
      }
      break;
    default:
      throw new Error(`Unsupported action type: ${(actionParams as any).actionType}`);
  }
}