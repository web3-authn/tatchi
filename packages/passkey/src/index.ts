
export { PasskeyManager } from './core/PasskeyManager';
export { WebAuthnManager } from './core/WebAuthnManager';
export { LinkDeviceFlow, AccountRecoveryFlow } from './core/PasskeyManager';
export { type NearClient, MinimalNearClient } from './core/NearClient';
export { verifyAuthenticationResponse } from './core/PasskeyManager/login';

export * from './config';
export { base64UrlEncode, base64UrlDecode } from './utils/encoders';

///////////////////////////////////////////////////////////////
// === Types re-exported from various type definition files ===
///////////////////////////////////////////////////////////////

export type {
  PasskeyManagerConfigs,
  // Registration
  RegistrationResult,
  RegistrationSSEEvent,
  // Login
  LoginResult,
  LoginSSEvent,
  // Actions
  ActionResult,
  // Account Recovery
  AccountRecoveryPhase,
  AccountRecoveryStatus,
  AccountRecoverySSEEvent,
  // Device Linking
  DeviceLinkingSSEEvent,
  // Hooks Options
  BaseHooksOptions,
  LoginHooksOptions,
  RegistrationHooksOptions,
  ActionHooksOptions,
  OperationHooks,
  EventCallback,
} from './core/types/passkeyManager';

export { DEFAULT_WAIT_STATUS } from './core/types/rpc';

// === Device Linking Types ===
export {
  DeviceLinkingPhase,
  DeviceLinkingStatus
} from './core/types/passkeyManager';
export type {
  DeviceLinkingQRData,
  DeviceLinkingSession,
  LinkDeviceResult,
  DeviceLinkingError,
  DeviceLinkingErrorCode
} from './core/types/linkDevice';

// === AccountID Types ===
export type { AccountId } from './core/types/accountIds';
export { toAccountId } from './core/types/accountIds';

export type {
  SignNEP413MessageParams,
  SignNEP413MessageResult
} from './core/PasskeyManager/signNEP413';

// === Action Types ===
export { ActionType } from './core/types/actions';
export type {
  ActionArgs,
  FunctionCallAction,
  TransferAction,
  CreateAccountAction,
  DeployContractAction,
  StakeAction,
  AddKeyAction,
  DeleteKeyAction,
  DeleteAccountAction
} from './core/types/actions';

// === ERROR TYPES ===
export type { PasskeyErrorDetails } from './core/types/errors';

// === SERVER PACKAGE ===
// Core NEAR Account Service for server-side operations
export {
  AuthService,
  validateConfigs,
} from './server';

export type {
  AuthServiceConfig,
  AccountCreationRequest,
  AccountCreationResult,
  CreateAccountAndRegisterRequest,
  CreateAccountAndRegisterResult,
  ContractVrfData,
  WebAuthnRegistrationCredential
} from './server';