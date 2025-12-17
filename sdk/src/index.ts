
export { TatchiPasskey } from './core/TatchiPasskey';
export { WebAuthnManager } from './core/WebAuthnManager';
export { AccountRecoveryFlow } from './core/TatchiPasskey';
export {
  type NearClient,
  MinimalNearClient,
  encodeSignedTransactionBase64
} from './core/NearClient';
export { verifyAuthenticationResponse } from './core/rpcCalls';

export * from './config';
export { base64UrlEncode, base64UrlDecode } from './utils/encoders';
export { PASSKEY_MANAGER_DEFAULT_CONFIGS } from './core/defaultConfigs';
export { buildConfigsFromEnv } from './core/defaultConfigs';

///////////////////////////////////////////////////////////////
// === Types re-exported from various type definition files ===
///////////////////////////////////////////////////////////////

export type {
  TatchiConfigs,
  TatchiConfigsInput,
  // Registration
  RegistrationResult,
  // Login
  LoginResult,
  LoginAndCreateSessionResult,
  LoginSession,
  SigningSessionStatus,
  // Actions
  ActionResult,
} from './core/types/tatchi';

export type {
  RegistrationSSEEvent,
  LoginSSEvent,
  // Account Recovery
  AccountRecoveryPhase,
  AccountRecoveryStatus,
  AccountRecoverySSEEvent,
  // Device Linking
  DeviceLinkingSSEEvent,
  // Hooks Options
  LoginHooksOptions,
  RegistrationHooksOptions,
  ActionHooksOptions,
  SignNEP413HooksOptions,
  AfterCall,
  EventCallback,
} from './core/types/sdkSentEvents';

export { DEFAULT_WAIT_STATUS } from './core/types/rpc';

// === Device Linking Types ===
export {
  DeviceLinkingPhase,
  DeviceLinkingStatus
} from './core/types/sdkSentEvents';
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
} from './core/TatchiPasskey/signNEP413';

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

// === CONFIRMATION TYPES ===
export type {
  ConfirmationConfig,
  ConfirmationUIMode,
  ConfirmationBehavior,
} from './core/types/signer-worker';
