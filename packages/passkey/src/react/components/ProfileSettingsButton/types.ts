import type { ToggleColorProps } from './Toggle';
import type { DeviceLinkingSSEEvent, LinkDeviceResult } from '@/index';
import type { EmbeddedTxButtonTheme } from '@/core/WebAuthnManager/LitComponents/IframeButtonWithTooltipConfirmer/embedded-tx-button-themes';

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

export interface ProfileButtonProps {
  nearAccountId: string;
  username?: string | null;
  onLogout?: () => void;
  toggleColors?: ToggleColorProps;
  nearExplorerBaseUrl?: string;
  // QR Code Scanner parameters
  deviceLinkingScannerParams?: DeviceLinkingScannerParams;
  // Theming overrides for SDK widget
  theme?: 'light' | 'dark';
  defaultTheme?: 'light' | 'dark';
  onThemeChange?: (t: 'light' | 'dark') => void;
  tokens?: {
    light?: Partial<DesignTokens>;
    dark?: Partial<DesignTokens>;
  };
  prefix?: string;
}

export interface UserAccountButtonProps {
  username: string;
  fullAccountId?: string;
  isOpen: boolean;
  onClick: () => void;
  isHovered?: boolean;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  nearExplorerBaseUrl?: string;
  theme?: EmbeddedTxButtonTheme;
}

export interface ProfileDropdownProps {
  isOpen: boolean;
  menuItems: MenuItem[];
  useRelayer: boolean;
  onRelayerChange: (value: boolean) => void;
  onLogout: () => void;
  onClose: () => void;
  toggleColors?: ToggleColorProps;
  theme?: EmbeddedTxButtonTheme;
  currentConfirmConfig?: any;
  onToggleShowDetails?: () => void;
  onToggleSkipClick?: () => void;
  onSetDelay?: (delay: number) => void;
  onToggleTheme?: () => void;
  transactionSettingsOpen?: boolean;
  menuItemsRef: React.MutableRefObject<(HTMLElement | null)[]>;
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
  useRelayer: boolean;
  onRelayerChange: (value: boolean) => void;
  toggleColors?: ToggleColorProps;
  className?: string;
  style?: React.CSSProperties;
}

export interface TransactionSettingsSectionProps {
  currentConfirmConfig: any;
  onToggleShowDetails: () => void;
  onToggleSkipClick: () => void;
  onSetDelay: (delay: number) => void;
  onToggleTheme?: () => void;
  className?: string;
  style?: React.CSSProperties;
  isOpen?: boolean;
  theme?: EmbeddedTxButtonTheme;
}

export interface ProfileStateRefs {
  buttonRef: React.RefObject<HTMLDivElement>;
  dropdownRef: React.RefObject<HTMLDivElement>;
  menuItemsRef: React.MutableRefObject<(HTMLElement | null)[]>;
}

export type { ToggleColorProps };

// ============================================================================
// CENTRALIZED THEME SYSTEM - Proposed Refactoring
// ============================================================================

/**
 * Unified Design Token System for Dark/Light Mode
 * This would centralize all colors, spacing, and visual properties
 */
export interface DesignTokens {
  colors: {
    // Semantic colors (context-aware)
    primary: string;
    primaryHover: string;
    secondary: string;
    accent: string;

    // Text colors
    textPrimary: string;
    textSecondary: string;
    textMuted: string;

    // Surface colors (backgrounds)
    surfacePrimary: string;
    surfaceSecondary: string;
    surfaceTertiary: string;

    // Interactive states
    hover: string;
    active: string;
    focus: string;

    // Status colors
    success: string;
    warning: string;
    error: string;
    info: string;

    // Border colors
    borderPrimary: string;
    borderSecondary: string;
    borderHover: string;
  };
  spacing: {
    xs: string;
    sm: string;
    md: string;
    lg: string;
    xl: string;
  };
  borderRadius: {
    sm: string;
    md: string;
    lg: string;
    xl: string;
  };
  shadows: {
    sm: string;
    md: string;
    lg: string;
    xl: string;
  };
}

/**
 * Theme-aware component props that all components would extend
 */
export interface ThemeableProps {
  theme?: 'light' | 'dark';
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Proposed: Universal Theme Hook
 * This would replace the repetitive theme subscription logic in every component
 */
export interface UseThemeReturn {
  theme: 'light' | 'dark';
  tokens: DesignTokens;
  isDark: boolean;
  toggleTheme: () => void;
}
