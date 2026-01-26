import type { ToggleColorProps } from './Toggle';
import type { DeviceLinkingSSEEvent, LinkDeviceResult } from '@/index';
import type { ThemeName } from '@/core/WebAuthnManager/LitComponents/confirm-ui-types';
import type { SignerMode } from '@/core/types/signer-worker';

export interface ProfileDimensions {
  width: number;
  height: number;
}

export interface ProfileAnimationConfig {
  duration: number;
  delay: number;
  ease: string;
}

export const PROFILE_MENU_ITEM_IDS = {
  EXPORT_KEYS: 'export-keys',
  SCAN_LINK_DEVICE: 'scan-link-device',
  LINKED_DEVICES: 'linked-devices',
  TOGGLE_THEME: 'toggle-theme',
  TRANSACTION_SETTINGS: 'transaction-settings',
} as const;

export type ProfileSettingsMenuItemId = typeof PROFILE_MENU_ITEM_IDS[keyof typeof PROFILE_MENU_ITEM_IDS];

export interface MenuItem {
  id?: ProfileSettingsMenuItemId | (string & {});
  icon: React.ReactNode;
  label: string;
  description: string;
  disabled: boolean;
  onClick?: () => void;
  // When true, clicking this item will NOT close the dropdown
  keepOpenOnClick?: boolean;
}

export interface HighlightedProfileMenuItem {
  id: ProfileSettingsMenuItemId | (string & {});
  /**
   * When true (default), focus the highlighted button when the menu opens.
   */
  focus?: boolean;
}

export interface DeviceLinkingScannerParams {
  onDeviceLinked?: (result: LinkDeviceResult) => void;
  onError?: (error: Error) => void;
  onClose?: () => void;
  onEvent?: (event: DeviceLinkingSSEEvent) => void;
  fundingAmount?: string;
}

export interface AccountMenuButtonProps {
  nearAccountId: string;
  nearExplorerBaseUrl?: string;
  username?: string | null;
  hideUsername?: boolean;
  onLogout?: () => void;
  // QR Code Scanner parameters
  deviceLinkingScannerParams?: DeviceLinkingScannerParams;
  // styles
  toggleColors?: ToggleColorProps;
  style?: React.CSSProperties;
  className?: string;
  // Optional: where to portal overlays (modals)
  // Defaults to the component's ShadowRoot when present, otherwise document.body
  portalTarget?: HTMLElement | ShadowRoot | null;
  // Programmatic menu control
  isMenuOpen?: boolean;
  onMenuOpenChange?: (open: boolean) => void;
  highlightedMenuItem?: HighlightedProfileMenuItem | null;
}

export type ProfileSettingsButtonProps = AccountMenuButtonProps;

export interface UserAccountButtonProps {
  username: string;
  hideUsername: boolean;
  fullAccountId?: string;
  nearExplorerBaseUrl?: string;
  isOpen: boolean;
  onClick: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  theme?: ThemeName;
  // Optional ARIA linkage
  menuId?: string;
  triggerId?: string;
}

export interface ProfileDropdownProps {
  isOpen: boolean;
  menuItems: MenuItem[];
  onLogout: () => void;
  onClose: () => void;
  toggleColors?: ToggleColorProps;
  theme?: ThemeName;
  currentConfirmConfig?: any;
  signerMode?: SignerMode;
  onToggleThresholdSigning?: (enabled: boolean) => void;
  onSetUiMode?: (mode: 'none' | 'modal' | 'drawer') => void;
  onToggleShowDetails?: () => void;
  onToggleSkipClick?: () => void;
  onSetDelay?: (delay: number) => void;
  onToggleTheme?: () => void;
  transactionSettingsOpen?: boolean;
  menuItemsRef: React.MutableRefObject<(HTMLElement | null)[]>;
  // Optional ARIA linkage
  menuId?: string;
  triggerId?: string;
  highlightedMenuItemId?: string;
}

export interface MenuItemProps {
  item: MenuItem;
  onClose: () => void;
  className?: string;
  style?: React.CSSProperties;
  isHighlighted?: boolean;
}

export interface LogoutMenuItemProps {
  onLogout: () => void;
  className?: string;
  style?: React.CSSProperties;
}

export interface ProfileRelayerToggleSectionProps {
  toggleColors?: ToggleColorProps;
  className?: string;
  style?: React.CSSProperties;
}

export interface TransactionSettingsSectionProps {
  currentConfirmConfig: any;
  signerMode?: SignerMode;
  onToggleThresholdSigning?: (enabled: boolean) => void;
  onSetUiMode?: (mode: 'none' | 'modal' | 'drawer') => void;
  onToggleShowDetails?: () => void;
  onToggleSkipClick: () => void;
  onSetDelay: (delay: number) => void;
  onToggleTheme?: () => void;
  className?: string;
  style?: React.CSSProperties;
  isOpen?: boolean;
  theme?: ThemeName;
}

export interface ProfileStateRefs {
  buttonRef: React.RefObject<HTMLDivElement | null>;
  dropdownRef: React.RefObject<HTMLDivElement | null>;
  menuItemsRef: React.MutableRefObject<(HTMLElement | null)[]>;
}

export type { ToggleColorProps };
