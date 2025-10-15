import type { ToggleColorProps } from './Toggle';
import type { DeviceLinkingSSEEvent, LinkDeviceResult } from '@/index';
import type { EmbeddedTxButtonTheme } from '@/core/WebAuthnManager/LitComponents/IframeButtonWithTooltipConfirmer/button-with-tooltip-themes';

export interface ProfileDimensions {
  width: number;
  height: number;
}

export interface ProfileAnimationConfig {
  duration: number;
  delay: number;
  ease: string;
}

export interface MenuItem {
  icon: React.ReactNode;
  label: string;
  description: string;
  disabled: boolean;
  onClick?: () => void;
  // When true, clicking this item will NOT close the dropdown
  keepOpenOnClick?: boolean;
}

export interface DeviceLinkingScannerParams {
  onDeviceLinked?: (result: LinkDeviceResult) => void;
  onError?: (error: Error) => void;
  onClose?: () => void;
  onEvent?: (event: DeviceLinkingSSEEvent) => void;
  fundingAmount?: string;
}

export interface ProfileSettingsButtonProps {
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
  // Optional: where to portal overlays (modals)
  // Defaults to the component's ShadowRoot when present, otherwise document.body
  portalTarget?: HTMLElement | ShadowRoot | null;
}

export interface UserAccountButtonProps {
  username: string;
  hideUsername: boolean;
  fullAccountId?: string;
  nearExplorerBaseUrl?: string;
  isOpen: boolean;
  onClick: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  theme?: EmbeddedTxButtonTheme;
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
  theme?: EmbeddedTxButtonTheme;
  currentConfirmConfig?: any;
  onSetUiMode?: (mode: 'skip' | 'modal' | 'drawer') => void;
  onToggleShowDetails?: () => void;
  onToggleSkipClick?: () => void;
  onSetDelay?: (delay: number) => void;
  onToggleTheme?: () => void;
  transactionSettingsOpen?: boolean;
  menuItemsRef: React.MutableRefObject<(HTMLElement | null)[]>;
  // Optional ARIA linkage
  menuId?: string;
  triggerId?: string;
}

export interface MenuItemProps {
  item: MenuItem;
  index: number;
  onClose: () => void;
  className?: string;
  style?: React.CSSProperties;
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
  onSetUiMode?: (mode: 'skip' | 'modal' | 'drawer') => void;
  onToggleShowDetails?: () => void;
  onToggleSkipClick: () => void;
  onSetDelay: (delay: number) => void;
  onToggleTheme?: () => void;
  className?: string;
  style?: React.CSSProperties;
  isOpen?: boolean;
  theme?: EmbeddedTxButtonTheme;
}

export interface ProfileStateRefs {
  buttonRef: React.RefObject<HTMLDivElement | null>;
  dropdownRef: React.RefObject<HTMLDivElement | null>;
  menuItemsRef: React.MutableRefObject<(HTMLElement | null)[]>;
}

export type { ToggleColorProps };
