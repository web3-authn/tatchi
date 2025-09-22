/**
 * React Components for Web3Authn Passkey
 *
 * This package provides React components and hooks for integrating Web3Authn Passkey
 * functionality into React applications.
 *
 * **Important:** All React components and hooks must be used inside a PasskeyManager context.
 * Wrap your app with PasskeyProvider to provide the required context.
 *
 * @example
 * ```tsx
 * import { PasskeyProvider, QRCodeScanner, ProfileSettingsButton } from '@web3authn/passkey/react';
 *
 * function App() {
 *   return (
 *     <PasskeyProvider configs={passkeyConfigs}>
 *       <div>
 *         <QRCodeScanner onDeviceLinked={(result) => console.log(result)} />
 *         <ProfileSettingsButton username="alice" onLogout={() => console.log('logout')} />
 *       </div>
 *     </PasskeyProvider>
 *   );
 * }
 * ```
 */

// Context
export { PasskeyProvider, usePasskeyContext } from './context';
export { PASSKEY_MANAGER_DEFAULT_CONFIGS } from '../core/defaultConfigs';

// === REACT HOOKS ===

export { useNearClient } from './hooks/useNearClient';
export type {
  NearClient,
  AccessKeyList
} from '../core/NearClient';
export { useAccountInput } from './hooks/useAccountInput';
export { useQRCamera, QRScanMode } from './hooks/useQRCamera';
export type { UseQRCameraOptions, UseQRCameraReturn } from './hooks/useQRCamera';
export { useDeviceLinking } from './hooks/useDeviceLinking';
export type { UseDeviceLinkingOptions, UseDeviceLinkingReturn } from './hooks/useDeviceLinking';
export { useQRFileUpload } from './hooks/useQRFileUpload';
export type { UseQRFileUploadOptions, UseQRFileUploadReturn } from './hooks/useQRFileUpload';
export { usePostfixPosition } from './components/PasskeyAuthMenu/usePostfixPosition';
export type { UsePostfixPositionOptions, UsePostfixPositionReturn } from './components/PasskeyAuthMenu/usePostfixPosition';
export { TxExecutionStatus } from '../core/types/actions';

// === REACT COMPONENTS ===
export { ProfileSettingsButton } from './components/ProfileSettingsButton';
// QR Scanner (jsQR library lazy-loaded in qrScanner.ts utility)
export { QRCodeScanner } from './components/QRCodeScanner';
// Show QR Code for device linking
export { ShowQRCode } from './components/ShowQRCode';
// Embedded transaction confirmation component (React wrapper hosting Lit component)
export { SecureSendTxButton, TouchIdWithText } from './components/SecureSendTxButton';
export {
  WalletIframeTxButtonHost,
  type WalletIframeTxButtonHostProps,
} from './components/WalletIframeTxButtonHost';
// Sign Up / Sign In menu
export { PasskeyAuthMenu } from './components/PasskeyAuthMenu';
export { AuthMenuMode, AuthMenuModeMap } from './components/PasskeyAuthMenu';
export type { AuthMenuModeLabel } from './components/PasskeyAuthMenu';
// Small SVG utility icon used in examples
export { default as TouchIcon } from './components/ProfileSettingsButton/TouchIcon';
export { default as QRCodeIcon } from './components/QRCodeIcon';
// Lit component wrappers
export {
  LitHaloBorder,
  type LitHaloBorderProps
} from './components/LitHaloBorder';
export {
  LitPasskeyHaloLoading,
  type LitPasskeyHaloLoadingProps
} from './components/LitPasskeyHaloLoading';
export {
  LitDrawer,
  type LitDrawerProps
} from './components/LitDrawer';

// Theme components
export { ThemeProvider, ThemeScope, useTheme } from './components/theme';
export type { UseThemeReturn } from './components/theme';
export { LIGHT_TOKENS, DARK_TOKENS } from './components/theme';

// === TYPES ===
export type {
  PasskeyContextType,
  PasskeyContextProviderProps,
  LoginState,
  LoginResult,
  RegistrationResult,
  ActionExecutionResult,
  ExecuteActionCallbacks,
  // SSE Events
  RegistrationSSEEvent,
  LoginSSEvent,
  ActionSSEEvent,
  DeviceLinkingSSEEvent,
  AccountRecoverySSEEvent,
  // Re-exported from PasskeyManager types
  RegistrationHooksOptions,
  LoginHooksOptions,
  BaseHooksOptions,
  ActionHooksOptions,

  // Toasts
  ToastOptions,
  ToastStyleOptions,
  ManagedToast,
  // UI State
  AccountInputState,
  UseAccountInputReturn,
  // Embedded transaction confirmation
  SecureSendTxButtonProps as SecureTxConfirmButtonProps,
} from './types';

// === ACCOUNT RECOVERY ENUMS ===
export {
  AccountRecoveryPhase,
  AccountRecoveryStatus,
} from '../core/types/passkeyManager';

// === DEVICE LINKING ENUMS ===
export {
  DeviceLinkingPhase,
  DeviceLinkingStatus,
  RegistrationPhase,
  RegistrationStatus,
  LoginPhase,
  LoginStatus,
  ActionPhase,
  ActionStatus
} from '../core/types/passkeyManager';

// === PROFILE BUTTON TYPES ===
export type {
  ProfileDimensions,
  ProfileAnimationConfig,
  MenuItem,
  ProfileButtonProps,
  UserAccountButtonProps,
  ProfileDropdownProps,
  MenuItemProps,
  LogoutMenuItemProps,
  ProfileRelayerToggleSectionProps,
  ProfileStateRefs,
  DeviceLinkingScannerParams,
  ToggleColorProps,
} from './components/ProfileSettingsButton/types';

// === RE-EXPORT CORE ===
export type { PasskeyManagerConfigs as PasskeyConfigs } from '../core/types/passkeyManager';
export type { StoreUserDataInput } from '../core/IndexedDBManager/passkeyClientDB';
export { PasskeyManager } from '../core/PasskeyManager';

// === RE-EXPORT ACTION TYPES ===
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
} from '../core/types/actions';

export { ActionType } from '../core/types/actions';
