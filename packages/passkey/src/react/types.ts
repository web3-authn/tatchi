import type { ReactNode } from 'react';
import type {
  LoginHooksOptions,
  RegistrationHooksOptions,
  BaseHooksOptions,
  ActionHooksOptions,
  PasskeyManager,
  PasskeyManagerConfigs,
  RecoveryResult,
  AccountRecoveryFlow,
  LinkDeviceFlow,
  LinkDeviceResult,
  SignNEP413MessageParams,
  SignNEP413MessageResult
} from '../core/PasskeyManager';
import type {
  StartDeviceLinkingOptionsDevice2,
  ScanAndLinkDeviceOptionsDevice1
} from '../core/types/linkDevice';
import type {
  DeviceLinkingSSEEvent,
  DeviceLinkingPhase,
  DeviceLinkingStatus,
  RegistrationPhase,
  RegistrationStatus,
  LoginPhase,
  LoginStatus,
  ActionPhase,
  ActionStatus,
  AccountRecoveryHooksOptions,
  ActionResult
} from '../core/types/passkeyManager';
import { ActionArgs } from '@/core/types/actions';

// Type-safe event handler for device linking events
export type DeviceLinkingSSEEventHandler = (event: DeviceLinkingSSEEvent) => void;

// Re-export enums for convenience
export {
  DeviceLinkingPhase,
  DeviceLinkingStatus,
  RegistrationPhase,
  RegistrationStatus,
  LoginPhase,
  LoginStatus,
  ActionPhase,
  ActionStatus
};

// === CORE STATE TYPES ===

// Actual authentication state - represents what's currently authenticated/registered
export interface LoginState {
  // Whether a user is currently authenticated
  isLoggedIn: boolean;
  // The public key of the currently authenticated user (if available)
  nearPublicKey: string | null;
  // The NEAR account ID of the currently authenticated user (e.g., "alice.testnet")
  nearAccountId: string | null;
}

// UI input state - tracks user input and form state
export interface AccountInputState {
  // The username portion being typed by the user (e.g., "alice")
  inputUsername: string;
  // The username from the last logged-in account
  lastLoggedInUsername: string;
  // The domain from the last logged-in account (e.g., ".testnet")
  lastLoggedInDomain: string;
  // The complete account ID for input operations (e.g., "alice.testnet")
  targetAccountId: string;
  // The domain postfix to display in the UI (e.g., ".testnet")
  displayPostfix: string;
  // Whether the current input matches an existing account in IndexDB
  isUsingExistingAccount: boolean;
  // Whether the target account has passkey credentials
  accountExists: boolean;
  // All account IDs stored in IndexDB
  indexDBAccounts: string[];
}

// === RESULT TYPES ===
export interface BaseResult {
  success: boolean;
  error?: string;
}

export interface RegistrationResult extends BaseResult {
  clientNearPublicKey?: string | null;
  nearAccountId?: string | null;
  transactionId?: string | null;
}

export interface LoginResult extends BaseResult {
  loggedInUsername?: string;
  clientNearPublicKey?: string | null;
  nearAccountId?: string;
}

// === ACTION EXECUTION TYPES ===
export interface ExecuteActionCallbacks {
  beforeDispatch?: () => void;
  afterDispatch?: (success: boolean, data?: any) => void;
}

export interface ActionExecutionResult {
  transaction_outcome?: {
    id: string;
  };
  error?: string;
}

// === TOAST TYPES ===
export interface ToastStyleOptions {
  background?: string;
  color?: string;
}

export interface ToastOptions {
  id?: string;
  duration?: number;
  style?: ToastStyleOptions;
}

export interface ManagedToast {
  loading: (message: string, options?: ToastOptions) => string;
  success: (message: string, options?: ToastOptions) => string;
  error: (message: string, options?: ToastOptions) => string;
  dismiss: (id: string) => void;
}

// Account input hook types
export interface UseAccountInputReturn extends AccountInputState {
  setInputUsername: (username: string) => void;
  refreshAccountData: () => Promise<void>;
}

// Relayer hook types
export interface UseRelayerOptions {
  initialValue?: boolean;
}

export interface UseRelayerReturn {
  useRelayer: boolean;
  setUseRelayer: (value: boolean) => void;
  toggleRelayer: () => void;
}

// === CONTEXT TYPES ===
export interface PasskeyContextType {
  // Core PasskeyManager instance - provides all user-facing functionality
  passkeyManager: PasskeyManager;

  ////////////////////////////
  // PasskeyManager functions
  ////////////////////////////

  // Registration and login functions
  registerPasskey: (nearAccountId: string, options: RegistrationHooksOptions) => Promise<RegistrationResult>;
  loginPasskey: (nearAccountId: string, options: LoginHooksOptions) => Promise<LoginResult>;
  logout: () => void;

  // Execute actions
  executeAction: (
    nearAccountId: string,
    actionArgs: ActionArgs,
    options?: ActionHooksOptions
  ) => Promise<ActionResult>;

  // NEP-413 message signing
  signNEP413Message: (nearAccountId: string, params: SignNEP413MessageParams, options?: BaseHooksOptions) => Promise<SignNEP413MessageResult>;

  // Account recovery functions
  startAccountRecoveryFlow: (options: AccountRecoveryHooksOptions) => AccountRecoveryFlow;

  // Device linking functions
  startDeviceLinkingFlow: (options: StartDeviceLinkingOptionsDevice2) => LinkDeviceFlow;

  // Login State
  loginState: LoginState;
  getLoginState: (nearAccountId?: string) => Promise<{
    isLoggedIn: boolean;
    nearAccountId: string | null;
    publicKey: string | null;
    vrfActive: boolean;
    userData: any | null;
    vrfSessionDuration?: number;
  }>;
  refreshLoginState: (nearAccountId?: string) => Promise<void>;

  // Account input management
  // UI account name input state (form/input tracking)
  accountInputState: AccountInputState;
  setInputUsername: (username: string) => void;
  refreshAccountData: () => Promise<void>;
  useRelayer: boolean;
  setUseRelayer: (value: boolean) => void;
  toggleRelayer: () => void;
}

/** Config options for PasskeyContextProvider
 * @param children - ReactNode to render inside the provider
 * @param config - PasskeyManagerConfigs
 * @example
 * config: {
 *   nearRpcUrl: 'https://rpc.testnet.near.org',
 *   nearNetwork: 'testnet',
 *   contractId: 'web3-authn-v4.testnet',
 *   relayerAccount: 'web3-authn-v4.testnet',
 *   relayServerUrl: 'https://faucet.testnet.near.org',
 *   initialUseRelayer: true,
 *   nearExplorerBaseUrl: 'https://testnet.nearblocks.io',
 * }
 */
export interface PasskeyContextProviderProps {
  children: ReactNode;
  config: PasskeyManagerConfigs;
}

// === CONVENIENCE RE-EXPORTS ===
export type {
  // Core manager types
  RegistrationHooksOptions,
  LoginHooksOptions,
  BaseHooksOptions,
  ActionHooksOptions,
  // SSE Events
  RegistrationSSEEvent,
  LoginSSEvent,
  ActionSSEEvent,
  DeviceLinkingSSEEvent,
  AccountRecoverySSEEvent,
} from '../core/types/passkeyManager';

export type {
  StartDeviceLinkingOptionsDevice2,
  ScanAndLinkDeviceOptionsDevice1,
} from '../core/types/linkDevice';