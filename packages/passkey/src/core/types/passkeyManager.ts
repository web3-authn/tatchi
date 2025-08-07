import { TxExecutionStatus } from "@near-js/types";
import type { EncryptedVRFKeypair } from './vrf-worker';
import { AccountId } from "./accountIds";
import { SignedTransaction } from "../NearClient";
import type { AuthenticatorOptions } from './authenticatorOptions';

//////////////////////////
// Progress Events Enums
//////////////////////////

// Registration Enums
export enum RegistrationPhase {
  STEP_1_WEBAUTHN_VERIFICATION = 'webauthn-verification',
  STEP_2_KEY_GENERATION = 'key-generation',
  STEP_3_ACCESS_KEY_ADDITION = 'access-key-addition',
  STEP_4_ACCOUNT_VERIFICATION = 'account-verification',
  STEP_5_DATABASE_STORAGE = 'database-storage',
  STEP_6_CONTRACT_REGISTRATION = 'contract-registration',
  STEP_7_REGISTRATION_COMPLETE = 'registration-complete',
  REGISTRATION_ERROR = 'error',
}
export enum RegistrationStatus {
  PROGRESS = 'progress',
  SUCCESS = 'success',
  ERROR = 'error',
}

// Login Enums
export enum LoginPhase {
  STEP_1_PREPARATION = 'preparation',
  STEP_2_WEBAUTHN_ASSERTION = 'webauthn-assertion',
  STEP_3_VRF_UNLOCK = 'vrf-unlock',
  STEP_4_LOGIN_COMPLETE = 'login-complete',
  LOGIN_ERROR = 'login-error',
}
export enum LoginStatus {
  PROGRESS = 'progress',
  SUCCESS = 'success',
  ERROR = 'error',
}

// Action Enums
export enum ActionPhase {
  STEP_1_PREPARATION = 'preparation',
  STEP_2_GENERATING_CHALLENGE = 'generating-challenge',
  STEP_3_WEBAUTHN_AUTHENTICATION = 'webauthn-authentication',           // Rust WASM worker phase: WebauthnAuthentication = 31
  STEP_4_AUTHENTICATION_COMPLETE = 'authentication-complete',           // Rust WASM worker phase: AuthenticationComplete = 32
  STEP_5_TRANSACTION_SIGNING_PROGRESS = 'transaction-signing-progress', // Rust WASM worker phase: TransactionSigningProgress = 33
  STEP_6_TRANSACTION_SIGNING_COMPLETE = 'transaction-signing-complete', // Rust WASM worker phase: TransactionSigningComplete = 34
  WASM_ERROR = 'wasm-error',                                            // Rust WASM worker phase: Error = 35
  STEP_7_BROADCASTING = 'broadcasting',
  STEP_8_ACTION_COMPLETE = 'action-complete',
  ACTION_ERROR = 'action-error',
}
export enum ActionStatus {
  PROGRESS = 'progress',
  SUCCESS = 'success',
  ERROR = 'error',
}

// Account Recovery Enums
export enum AccountRecoveryPhase {
  STEP_1_PREPARATION = 'preparation',
  STEP_2_WEBAUTHN_AUTHENTICATION = 'webauthn-authentication',
  STEP_3_SYNC_AUTHENTICATORS_ONCHAIN = 'sync-authenticators-onchain',
  STEP_4_AUTHENTICATOR_SAVED = 'authenticator-saved',
  STEP_5_ACCOUNT_RECOVERY_COMPLETE = 'account-recovery-complete',
  ERROR = 'error',
}
export enum AccountRecoveryStatus {
  PROGRESS = 'progress',
  SUCCESS = 'success',
  ERROR = 'error',
}

// Device Linking Enums
export enum DeviceLinkingPhase {
  STEP_1_QR_CODE_GENERATED = 'qr-code-generated',   // Device2: QR code created and displayed
  STEP_2_SCANNING = 'scanning',                     // Device1: Scanning QR code
  STEP_3_AUTHORIZATION = 'authorization',           // Device1: TouchID authorization
  STEP_4_POLLING = 'polling',                       // Device2: Polling contract for mapping
  STEP_5_ADDKEY_DETECTED = 'addkey-detected',       // Device2: AddKey transaction detected
  STEP_6_REGISTRATION = 'registration',             // Device2: Registration and credential storage
  STEP_7_LINKING_COMPLETE = 'linking-complete',     // Final completion
  STEP_8_AUTO_LOGIN = 'auto-login',                 // Auto-login after registration
  IDLE = 'idle',                                    // Idle state
  REGISTRATION_ERROR = 'registration-error',        // Error during registration
  LOGIN_ERROR = 'login-error',                      // Error during login
  DEVICE_LINKING_ERROR = 'error',                   // General error state
}
export enum DeviceLinkingStatus {
  PROGRESS = 'progress',
  SUCCESS = 'success',
  ERROR = 'error',
}

// Base event callback type
export type EventCallback<T> = (event: T) => void;

// Operation hooks for before/after call customization
export interface OperationHooks {
  beforeCall?: () => void | Promise<void>;
  afterCall?: (
    success: boolean,
    result?: ActionResult | LoginResult | RegistrationResult | Error
  ) => void | Promise<void>;
}

// Base SSE Event Types (unified for Registration and Actions)
export interface BaseSSEEvent {
  step: number;
  phase: RegistrationPhase | LoginPhase | ActionPhase | DeviceLinkingPhase | AccountRecoveryPhase;
  status: RegistrationStatus | LoginStatus | ActionStatus | DeviceLinkingStatus | AccountRecoveryStatus;
  message: string;
}

// Registration-specific events
export interface BaseRegistrationSSEEvent extends BaseSSEEvent {
  phase: RegistrationPhase;
  status: RegistrationStatus;
}

// Action-specific events
export interface BaseActionSSEEvent extends BaseSSEEvent {
  phase: ActionPhase;
  status: ActionStatus;
}

// Login-specific events
export interface BaseLoginSSEEvent extends BaseSSEEvent {
  phase: LoginPhase;
  status: LoginStatus;
}

export interface BaseDeviceLinkingSSEEvent extends BaseSSEEvent {
  phase: DeviceLinkingPhase;
  status: DeviceLinkingStatus;
}

// Action-specific events
export interface BaseAccountRecoveryEvent extends BaseSSEEvent {
  phase: AccountRecoveryPhase;
  status: AccountRecoveryStatus;
}

// Progress Events
export interface onProgressEvents extends BaseActionSSEEvent {
  step: number;
  status: ActionStatus;
  message: string;
  data?: any;
  logs?: string[];
}

/////////////////////////////////////////////
// SDK-Sent-Events: Registration Event Types
/////////////////////////////////////////////

export interface RegistrationEventStep1 extends BaseRegistrationSSEEvent {
  step: 1;
  phase: RegistrationPhase.STEP_1_WEBAUTHN_VERIFICATION;
}

export interface RegistrationEventStep2 extends BaseRegistrationSSEEvent {
  step: 2;
  phase: RegistrationPhase.STEP_2_KEY_GENERATION;
  status: RegistrationStatus.SUCCESS;
  verified: boolean;
  nearAccountId: string;
  nearPublicKey: string | null | undefined;
  vrfPublicKey: string | null | undefined;
}

export interface RegistrationEventStep3 extends BaseRegistrationSSEEvent {
  step: 3;
  phase: RegistrationPhase.STEP_3_ACCESS_KEY_ADDITION;
  error?: string;
}

export interface RegistrationEventStep4 extends BaseRegistrationSSEEvent {
  step: 4;
  phase: RegistrationPhase.STEP_4_ACCOUNT_VERIFICATION;
  error?: string;
}

export interface RegistrationEventStep5 extends BaseRegistrationSSEEvent {
  step: 5;
  phase: RegistrationPhase.STEP_5_DATABASE_STORAGE;
  error?: string;
}

export interface RegistrationEventStep6 extends BaseRegistrationSSEEvent {
  step: 6;
  phase: RegistrationPhase.STEP_6_CONTRACT_REGISTRATION;
  error?: string;
}

export interface RegistrationEventStep7 extends BaseRegistrationSSEEvent {
  step: 7;
  phase: RegistrationPhase.STEP_7_REGISTRATION_COMPLETE;
  status: RegistrationStatus.SUCCESS;
}

export interface RegistrationEventStep0 extends BaseRegistrationSSEEvent {
  step: 0;
  phase: RegistrationPhase.REGISTRATION_ERROR;
  status: RegistrationStatus.ERROR;
  error: string;
}

export type RegistrationSSEEvent =
  | RegistrationEventStep1
  | RegistrationEventStep2
  | RegistrationEventStep3
  | RegistrationEventStep4
  | RegistrationEventStep5
  | RegistrationEventStep6
  | RegistrationEventStep7
  | RegistrationEventStep0;

/////////////////////////////////////////////
// SDK-Sent-Events: Login Event Types
/////////////////////////////////////////////

export interface LoginSSEventStep1 extends BaseLoginSSEEvent {
  step: 1;
  phase: LoginPhase.STEP_1_PREPARATION;
}

export interface LoginSSEventStep2 extends BaseLoginSSEEvent {
  step: 2;
  phase: LoginPhase.STEP_2_WEBAUTHN_ASSERTION;
}

export interface LoginSSEventStep3 extends BaseLoginSSEEvent {
  step: 3;
  phase: LoginPhase.STEP_3_VRF_UNLOCK;
}

export interface LoginSSEventStep4 extends BaseLoginSSEEvent {
  step: 4;
  phase: LoginPhase.STEP_4_LOGIN_COMPLETE;
  status: LoginStatus.SUCCESS;
  nearAccountId: string;
  clientNearPublicKey: string;
}

export interface LoginSSEventStep0 extends BaseLoginSSEEvent {
  step: 0;
  phase: LoginPhase.LOGIN_ERROR;
  status: LoginStatus.ERROR;
  error: string;
}

export type LoginSSEvent =
  | LoginSSEventStep1
  | LoginSSEventStep2
  | LoginSSEventStep3
  | LoginSSEventStep4
  | LoginSSEventStep0;

/////////////////////////////////////////////
// SDK-Sent-Events: Action Event Types
/////////////////////////////////////////////

export interface ActionEventStep1 extends BaseActionSSEEvent {
  step: 1;
  phase: ActionPhase.STEP_1_PREPARATION;
}

export interface ActionEventStep2 extends BaseActionSSEEvent {
  step: 2;
  phase: ActionPhase.STEP_2_GENERATING_CHALLENGE;
}

export interface ActionEventStep3 extends BaseActionSSEEvent {
  step: 3;
  phase: ActionPhase.STEP_3_WEBAUTHN_AUTHENTICATION;
  data?: any;
  logs?: string[];
}

export interface ActionEventStep4 extends BaseActionSSEEvent {
  step: 4;
  phase: ActionPhase.STEP_4_AUTHENTICATION_COMPLETE;
  data?: any;
  logs?: string[];
}

export interface ActionEventStep5 extends BaseActionSSEEvent {
  step: 5;
  phase: ActionPhase.STEP_5_TRANSACTION_SIGNING_PROGRESS;
}

export interface ActionEventStep6 extends BaseActionSSEEvent {
  step: 6;
  phase: ActionPhase.STEP_6_TRANSACTION_SIGNING_COMPLETE;
  status: ActionStatus.SUCCESS;
  data?: any;
}

export interface ActionEventStep7 extends BaseActionSSEEvent {
  step: 7;
  phase: ActionPhase.STEP_7_BROADCASTING;
  status: ActionStatus.PROGRESS;
  data?: any;
}

export interface ActionEventStep8 extends BaseActionSSEEvent {
  step: 8;
  phase: ActionPhase.STEP_8_ACTION_COMPLETE;
  status: ActionStatus.SUCCESS;
  data?: any;
}

export interface ActionEventError extends BaseActionSSEEvent {
  step: 0;
  phase: ActionPhase.ACTION_ERROR;
  status: ActionStatus.ERROR;
  error: string;
}

export interface ActionEventWasmError extends BaseActionSSEEvent {
  step: 0;
  phase: ActionPhase.WASM_ERROR;
  status: ActionStatus.ERROR;
  error: string;
}

export type ActionSSEEvent =
  | ActionEventStep1
  | ActionEventStep2
  | ActionEventStep3
  | ActionEventStep4
  | ActionEventStep5
  | ActionEventStep6
  | ActionEventStep7
  | ActionEventStep8
  | ActionEventError
  | ActionEventWasmError;

/////////////////////////////////////////////
// SDK-Sent-Events: Device Linking Event Types
/////////////////////////////////////////////

export interface DeviceLinkingEventStep1 extends BaseDeviceLinkingSSEEvent {
  step: 1;
  phase: DeviceLinkingPhase.STEP_1_QR_CODE_GENERATED;
}

export interface DeviceLinkingEventStep2 extends BaseDeviceLinkingSSEEvent {
  step: 2;
  phase: DeviceLinkingPhase.STEP_2_SCANNING;
}

export interface DeviceLinkingEventStep3 extends BaseDeviceLinkingSSEEvent {
  step: 3;
  phase: DeviceLinkingPhase.STEP_3_AUTHORIZATION;
}

export interface DeviceLinkingEventStep4 extends BaseDeviceLinkingSSEEvent {
  step: 4;
  phase: DeviceLinkingPhase.STEP_4_POLLING;
}

export interface DeviceLinkingEventStep5 extends BaseDeviceLinkingSSEEvent {
  step: 5;
  phase: DeviceLinkingPhase.STEP_5_ADDKEY_DETECTED;
}

export interface DeviceLinkingEventStep6 extends BaseDeviceLinkingSSEEvent {
  step: 6;
  phase: DeviceLinkingPhase.STEP_6_REGISTRATION;
}

export interface DeviceLinkingEventStep7 extends BaseDeviceLinkingSSEEvent {
  step: 7;
  phase: DeviceLinkingPhase.STEP_7_LINKING_COMPLETE;
}

export interface DeviceLinkingEventStep8 extends BaseDeviceLinkingSSEEvent {
  step: 8;
  phase: DeviceLinkingPhase.STEP_8_AUTO_LOGIN;
}

export interface DeviceLinkingErrorEvent extends BaseDeviceLinkingSSEEvent {
  step: 0;
  phase: DeviceLinkingPhase.DEVICE_LINKING_ERROR
  | DeviceLinkingPhase.LOGIN_ERROR
  | DeviceLinkingPhase.REGISTRATION_ERROR;
  status: DeviceLinkingStatus.ERROR;
  error: string;
}

export type DeviceLinkingSSEEvent =
  | DeviceLinkingEventStep1
  | DeviceLinkingEventStep2
  | DeviceLinkingEventStep3
  | DeviceLinkingEventStep4
  | DeviceLinkingEventStep5
  | DeviceLinkingEventStep6
  | DeviceLinkingEventStep7
  | DeviceLinkingEventStep8
  | DeviceLinkingErrorEvent;

/////////////////////////////////////////////
// SDK-Sent-Events: Account Recovery Event Types
/////////////////////////////////////////////

export interface AccountRecoveryEventStep1 extends BaseAccountRecoveryEvent {
  step: 1;
  phase: AccountRecoveryPhase.STEP_1_PREPARATION;
}

export interface AccountRecoveryEventStep2 extends BaseAccountRecoveryEvent {
  step: 2;
  phase: AccountRecoveryPhase.STEP_2_WEBAUTHN_AUTHENTICATION;
}

export interface AccountRecoveryEventStep3 extends BaseAccountRecoveryEvent {
  step: 3;
  phase: AccountRecoveryPhase.STEP_3_SYNC_AUTHENTICATORS_ONCHAIN;
  data?: any;
  logs?: string[];
}

export interface AccountRecoveryEventStep4 extends BaseAccountRecoveryEvent {
  step: 4;
  phase: AccountRecoveryPhase.STEP_4_AUTHENTICATOR_SAVED;
  status: AccountRecoveryStatus.SUCCESS;
  data?: any;
}

export interface AccountRecoveryEventStep5 extends BaseAccountRecoveryEvent {
  step: 5;
  phase: AccountRecoveryPhase.STEP_5_ACCOUNT_RECOVERY_COMPLETE;
  status: AccountRecoveryStatus.SUCCESS;
  data?: any;
}

export interface AccountRecoveryError extends BaseAccountRecoveryEvent {
  step: 0;
  phase: AccountRecoveryPhase.ERROR;
  status: AccountRecoveryStatus.ERROR;
  error: string;
}

export type AccountRecoverySSEEvent =
  | AccountRecoveryEventStep1
  | AccountRecoveryEventStep2
  | AccountRecoveryEventStep3
  | AccountRecoveryEventStep4
  | AccountRecoveryEventStep5
  | AccountRecoveryError;

//////////////////////////////////
/// Hooks Options
//////////////////////////////////

export interface BaseHooksOptions {
  onEvent?: EventCallback<RegistrationSSEEvent | LoginSSEvent | ActionSSEEvent | DeviceLinkingSSEEvent | AccountRecoverySSEEvent>;
  onError?: (error: Error) => void;
  hooks?: OperationHooks;
}

// Function Options
export interface RegistrationHooksOptions {
  onEvent?: EventCallback<RegistrationSSEEvent>;
  onError?: (error: Error) => void;
  hooks?: OperationHooks;
  useRelayer?: boolean;
}

export interface LoginHooksOptions {
  onEvent?: EventCallback<LoginSSEvent>;
  onError?: (error: Error) => void;
  hooks?: OperationHooks;
}

export interface ActionHooksOptions {
  onEvent?: EventCallback<ActionSSEEvent>;
  onError?: (error: Error) => void;
  hooks?: OperationHooks;
  waitUntil?: TxExecutionStatus;
}

export interface AccountRecoveryHooksOptions {
  onEvent?: EventCallback<AccountRecoverySSEEvent>;
  onError?: (error: Error) => void;
  hooks?: OperationHooks;
  waitUntil?: TxExecutionStatus;
}

//////////////////////////////////
/// State Types
//////////////////////////////////

export interface LoginState {
  isLoggedIn: boolean;
  nearAccountId: AccountId | null;
  publicKey: string | null;
  userData: any | null;
  vrfActive: boolean;
  vrfSessionDuration?: number;
}


// Result Types
export interface RegistrationResult {
  success: boolean;
  error?: string;
  clientNearPublicKey?: string | null;
  nearAccountId?: AccountId;
  transactionId?: string | null;
  vrfRegistration?: {
    success: boolean;
    vrfPublicKey?: string;
    encryptedVrfKeypair?: EncryptedVRFKeypair;
    contractVerified?: boolean;
    error?: string;
  };
}

export interface LoginResult {
  success: boolean;
  error?: string;
  loggedInNearAccountId?: string;
  clientNearPublicKey?: string | null;
  nearAccountId?: AccountId;
}

export interface ActionResult {
  success: boolean;
  error?: string;
  transactionId?: string;
  result?: any;
}

export interface VerifyAndSignTransactionResult {
  signedTransaction: SignedTransaction;
  nearAccountId: string;
  logs?: string[];
}

// PasskeyManager Configuration
export interface PasskeyManagerConfigs {
  nearRpcUrl: string;
  nearNetwork: 'testnet' | 'mainnet';
  contractId: 'web3-authn-v4.testnet' | 'web3-authn.near' | string;
  nearExplorerUrl?: string; // NEAR Explorer URL for transaction links
  // Relay Server is used to create new NEAR accounts
  relayer: {
    // Whether to use the relayer by default on initial load
    initialUseRelayer: boolean;
    accountId: string;
    url: string
  }
  // authenticator options for registrations
  authenticatorOptions?: AuthenticatorOptions;
}

// === TRANSACTION TYPES ===
export interface TransactionParams {
  receiverId: string;
  methodName: string;
  args: Record<string, any>;
  gas?: string;
  deposit?: string;
}
