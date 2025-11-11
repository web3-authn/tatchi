/**
 * React Components for Web3Authn Passkey
 *
 * This package provides React components and hooks for integrating Web3Authn Passkey
 * functionality into React applications.
 *
 * **Important:** All React components and hooks must be used inside a TatchiPasskey context.
 * Wrap your app with TatchiPasskeyProvider to provide the required context.
 *
 * @example
 * ```tsx
 * import { TatchiPasskeyProvider, QRCodeScanner, ProfileSettingsButton } from '@tatchi-xyz/sdk/react';
 *
 * function App() {
 *   return (
 *     <TatchiPasskeyProvider configs={passkeyConfigs}>
 *       <div>
 *         <QRCodeScanner onDeviceLinked={(result) => console.log(result)} />
 *         <ProfileSettingsButton username="alice" onLogout={() => console.log('logout')} />
 *       </div>
 *     </TatchiPasskeyProvider>
 *   );
 * }
 * ```
 */

export { TatchiContextProvider, useTatchi } from './context';
export { TatchiPasskeyProvider } from './context/TatchiPasskeyProvider';

// === RE-EXPORT CORE TYPES ===
export { TatchiPasskey } from '../core/TatchiPasskey';
export { PASSKEY_MANAGER_DEFAULT_CONFIGS } from '../core/defaultConfigs';
export type { TatchiPasskeyConfigs } from '../core/types/passkeyManager';
export type { StoreUserDataInput } from '../core/IndexedDBManager/passkeyClientDB';

// === RE-EXPORT ACTION TYPES ===
// Value export for enum
export { ActionType } from '../core/types/actions';
// Type exports for action shapes
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

// === TYPES ===
export type {
  TatchiContextType,
  TatchiContextProviderProps,
  LoginState,
  LoginResult,
  RegistrationResult,
  // SSE Events
  RegistrationSSEEvent,
  LoginSSEvent,
  ActionSSEEvent,
  DeviceLinkingSSEEvent,
  AccountRecoverySSEEvent,
  // Re-exported from TatchiPasskey types
  RegistrationHooksOptions,
  LoginHooksOptions,
  SignNEP413HooksOptions,
  ActionHooksOptions,
  // UI State
  AccountInputState,
  UseAccountInputReturn,
} from './types';

////////////////////////////
// === REACT HOOKS ===
////////////////////////////

export { useNearClient } from './hooks/useNearClient';
export type { NearClient, AccessKeyList } from '../core/NearClient';
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

////////////////////////////
// === REACT COMPONENTS ===
////////////////////////////

export { ProfileSettingsButton } from './components/ProfileSettingsButton';
// QR Scanner (jsQR library lazy-loaded in qrScanner.ts utility)
export { QRCodeScanner } from './components/QRCodeScanner';
// Show QR Code for device linking
export { ShowQRCode } from './components/ShowQRCode';
// Embedded transaction confirmation component (React wrapper hosting Lit component)
export {
  TouchIdWithText,
  SendTxButtonWithTooltip,
  type SendTxButtonWithTooltipProps,
} from './components/SendTxButtonWithTooltip';
export {
  WalletIframeTxButtonHost,
  type WalletIframeTxButtonHostProps,
} from './components/WalletIframeTxButtonHost';
// Sign Up / Sign In menu
export { PasskeyAuthMenu } from './components/PasskeyAuthMenu';
export { AuthMenuMode, AuthMenuModeMap } from './components/PasskeyAuthMenu';
export type { AuthMenuModeLabel, AuthMenuHeadings } from './components/PasskeyAuthMenu';
// Small SVG utility icon used in examples
export { default as TouchIcon } from './components/ProfileSettingsButton/icons/TouchIcon';
export { default as QRCodeIcon } from './components/QRCodeIcon';
export { default as SunIcon } from './components/ProfileSettingsButton/icons/SunIcon';
export { default as MoonIcon } from './components/ProfileSettingsButton/icons/MoonIcon';

// Theme components
export { useTheme, Theme } from './components/theme';
export type { UseThemeReturn, ThemeProps, ThemeMode } from './components/theme';
export { LIGHT_TOKENS, DARK_TOKENS } from './components/theme';

// === ACCOUNT RECOVERY ENUMS ===
export {
  AccountRecoveryPhase,
  AccountRecoveryStatus,
  type ActionResult,
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
export { PROFILE_MENU_ITEM_IDS } from './components/ProfileSettingsButton/types';
export type {
  ProfileDimensions,
  ProfileAnimationConfig,
  MenuItem,
  ProfileSettingsButtonProps,
  UserAccountButtonProps,
  ProfileDropdownProps,
  MenuItemProps,
  LogoutMenuItemProps,
  ProfileRelayerToggleSectionProps,
  ProfileStateRefs,
  DeviceLinkingScannerParams,
  ToggleColorProps,
  ProfileSettingsMenuItemId,
  HighlightedProfileMenuItem,
} from './components/ProfileSettingsButton/types';
