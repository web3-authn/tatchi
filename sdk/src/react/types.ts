import type { ReactNode } from 'react';
import type {
  LoginHooksOptions,
  RegistrationHooksOptions,
  BaseHooksOptions,
  ActionHooksOptions,
  PasskeyManager,
  PasskeyManagerConfigs,
  RecoveryResult,
  LinkDeviceResult,
  SignNEP413MessageParams,
  SignNEP413MessageResult,
  PasskeyManagerContext,
} from '../core/PasskeyManager';
import { TransactionInput } from '../core/types/actions';
import type { ConfirmationConfig, ConfirmationBehavior } from '../core/types/signer-worker';
import type { ActionArgs } from '../core/types/actions';
import type {
  StartDeviceLinkingOptionsDevice2,
  ScanAndLinkDeviceOptionsDevice1,
  DeviceLinkingQRData
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
  ActionResult,
  AccountRecoveryHooksOptions,
  SignAndSendTransactionHooksOptions,
} from '../core/types/passkeyManager';
import type { EventCallback, ActionSSEEvent } from '../core/types/passkeyManager';
import type { AccessKeyList } from '../core/NearClient';

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

// // Relayer hook types
// export interface UseRelayerOptions {
//   initialValue?: boolean;
// }

// export interface UseRelayerReturn {
//   useRelayer: boolean;
//   setUseRelayer: (value: boolean) => void;
//   toggleRelayer: () => void;
// }

// === CONTEXT TYPES ===
export interface PasskeyContextType {
  // Core PasskeyManager instance - provides all user-facing functionality
  passkeyManager: PasskeyManager;

  ////////////////////////////
  // PasskeyManager functions
  ////////////////////////////

  // Registration and login functions
  registerPasskey: (nearAccountId: string, options?: RegistrationHooksOptions) => Promise<RegistrationResult>;
  loginPasskey: (nearAccountId: string, options?: LoginHooksOptions) => Promise<LoginResult>;
  logout: () => void;

  // Execute actions
  executeAction: (args: {
    nearAccountId: string;
    receiverId: string;
    actionArgs: ActionArgs;
    options?: ActionHooksOptions;
  }) => Promise<ActionResult>;

  // NEP-413 message signing
  signNEP413Message: (args: {
    nearAccountId: string;
    params: SignNEP413MessageParams;
    options?: BaseHooksOptions;
  }) => Promise<SignNEP413MessageResult>;

  // Account recovery function
  recoverAccount: (args: { accountId?: string; options?: AccountRecoveryHooksOptions }) => Promise<RecoveryResult>;

  // Device linking functions
  startDevice2LinkingFlow: (options?: StartDeviceLinkingOptionsDevice2) => Promise<{ qrData: DeviceLinkingQRData; qrCodeDataURL: string }>;
  stopDevice2LinkingFlow: () => Promise<void>;

  // Login State
  loginState: LoginState;
  // Wallet iframe connectivity (true when service client handshake completes)
  walletIframeConnected: boolean;
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

  // Confirmation configuration functions
  setConfirmBehavior: (behavior: ConfirmationBehavior) => void;
  setConfirmationConfig: (config: ConfirmationConfig) => void;
  getConfirmationConfig: () => ConfirmationConfig;
  setUserTheme: (theme: 'dark' | 'light') => void;

  // Account management functions
  viewAccessKeyList: (accountId: string) => Promise<AccessKeyList>;
}

/** Config options for PasskeyContextProvider
 * @param children - ReactNode to render inside the provider
 * @param config - PasskeyManagerConfigs
 * @example
 * config: {
 *   nearRpcUrl: 'https://rpc.testnet.near.org',
 *   nearNetwork: 'testnet',
 *   contractId: 'w3a-v1.testnet',
 *   relayerAccount: 'w3a-v1.testnet',
 *   relayServerUrl: 'https://faucet.testnet.near.org',
 *   initialUseRelayer: true,
 *   nearExplorerBaseUrl: 'https://testnet.nearblocks.io',
 * }
 */
export interface PasskeyContextProviderProps {
  children: ReactNode;
  // Allow passing only overrides; provider will resolve full config from env + defaults
  config: Partial<PasskeyManagerConfigs>;
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

// === Secure Send Transaction Button type ===
export interface SendTxButtonWithTooltipProps {
  /** NEAR account ID */
  nearAccountId: string;
  /** Transaction payloads to sign */
  txSigningRequests: TransactionInput[];
  /** Optional hook options passed into signAndSendTransactions */
  options?: SignAndSendTransactionHooksOptions;
  /** Callback when user cancels */
  onCancel?: () => void;
  /** Callback for SSE-style action events */
  onEvent?: EventCallback<ActionSSEEvent>;
  /** Callback when transaction is successfully signed */
  onSuccess?: (result: ActionResult[]) => void;
  /** Notifies when Touch ID prompt loads/unloads */
  onLoadTouchIdPrompt?: (loading: boolean) => void;
}
