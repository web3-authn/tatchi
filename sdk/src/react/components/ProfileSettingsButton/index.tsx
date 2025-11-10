import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Key, Scan, Link, Sliders } from 'lucide-react';
import { SunIcon } from './icons/SunIcon';
import { MoonIcon } from './icons/MoonIcon';
import { UserAccountButton } from './UserAccountButton';
import { ProfileDropdown } from './ProfileDropdown';
import { useProfileState } from './hooks/useProfileState';
import { useTatchiContext } from '../../context';
import type { MenuItem, ProfileSettingsButtonProps } from './types';
import { PROFILE_MENU_ITEM_IDS } from './types';
import { QRCodeScanner } from '../QRCodeScanner';
import { LinkedDevicesModal } from './LinkedDevicesModal';
import './Web3AuthProfileButton.css';
import { Theme, useTheme } from '../theme';
import { toAccountId } from '../../../core/types/accountIds';
import { IndexedDBManager } from '../../../core/IndexedDBManager';

/**
 * Profile Settings Button Component
 * Provides user settings, account management, and device linking.
 * **Important:** This component should be used inside a TatchiPasskey context.
 * Wrap your app with PasskeyProvider or ensure TatchiPasskey is available in context via useTatchiContext.
 *
 * @example
 * ```tsx
 * import { PasskeyProvider } from '@tatchi-xyz/sdk/react';
 * import { ProfileSettingsButton } from '@tatchi-xyz/sdk/react';
 *
 * function App() {
 *   return (
 *     <PasskeyProvider configs={passkeyConfigs}>
 *       <ProfileSettingsButton
 *         username="alice"
 *         onLogout={() => console.log('User logged out')}
 *         deviceLinkingScannerParams={{
 *           onDeviceLinked: (result) => console.log('Device linked:', result),
 *           onError: (error) => console.error('Error:', error),
 *           onClose: () => console.log('Scanner closed'),
 *           onEvent: (event) => console.log('Event:', event),
 *           fundingAmount: '0.05'
 *         }}
 *       />
 *     </PasskeyProvider>
 *   );
 * }
 * ```
 */
const ProfileSettingsButtonInner: React.FC<ProfileSettingsButtonProps> = ({
  nearAccountId: nearAccountIdProp,
  nearExplorerBaseUrl = 'https://nearblocks.io',
  username: usernameProp,
  hideUsername = false,
  onLogout: onLogout,
  deviceLinkingScannerParams,
  toggleColors,
  style,
  className,
  portalTarget,
  isMenuOpen,
  onMenuOpenChange,
  highlightedMenuItem,
}) => {
  // Get values from context if not provided as props
  const {
    loginState,
    tatchi,
    logout,
  } = useTatchiContext();

  // Use props if provided, otherwise fall back to context
  const accountName = usernameProp || nearAccountIdProp?.split('.')?.[0] || loginState.nearAccountId?.split('.')?.[0] || 'User';
  const loggedInAccountId = loginState.nearAccountId;
  const nearAccountId = nearAccountIdProp || loggedInAccountId;

  // Local state for modals/expanded sections
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [showLinkedDevices, setShowLinkedDevices] = useState(false);
  const [transactionSettingsOpen, setTransactionSettingsOpen] = useState(false);
  const [currentConfirmConfig, setCurrentConfirmConfig] = useState<any>(null);

  // State management
  const {
    isOpen,
    refs,
    handleToggle,
    handleClose,
  } = useProfileState({
    open: typeof isMenuOpen === 'boolean' ? isMenuOpen : undefined,
    onOpenChange: onMenuOpenChange,
  });

  // Read current theme from Theme context (falls back to system preference)
  const { theme } = useTheme();

  // Load confirmation config on mount
  useEffect(() => {
    let isActive = true;

    const syncConfirmationConfig = async () => {
      if (!tatchi) return;

      if (!loginState.isLoggedIn || !loggedInAccountId) {
        if (isActive) {
          setCurrentConfirmConfig(null);
        }
        return;
      }

      try {
        tatchi.userPreferences.setCurrentUser(toAccountId(loggedInAccountId));
      } catch (_) {}

      // Always try to hydrate from source of truth, then mirror locally
      let fetched: any | null = null;
      // 1) Wallet iframe (wallet origin) if available
      try {
        const client = tatchi.getWalletIframeClient?.() || (tatchi as any).getServiceClient?.();
        if (client && client.isReady()) {
          fetched = await client.getConfirmationConfig();
        }
      } catch (_) {}
      // 2) Local IndexedDB for this user
      if (!fetched) {
        try {
          fetched = await IndexedDBManager.clientDB.getConfirmationConfig(toAccountId(loggedInAccountId));
        } catch (_) {}
      }
      // 3) Fallback: current in-memory cache
      if (!fetched) {
        try { fetched = tatchi.getConfirmationConfig(); } catch (_) {}
      }

      if (fetched) {
        // Mirror into local cache for immediate reads and future sessions
        try { tatchi.userPreferences.setConfirmationConfig(fetched); } catch (_) {}
        if (isActive) setCurrentConfirmConfig(fetched);
      } else {
        if (isActive) setCurrentConfirmConfig(null);
      }
    };

    void syncConfirmationConfig();

    return () => {
      isActive = false;
    };
  }, [tatchi, loginState.isLoggedIn, loggedInAccountId]);

  // Handlers for transaction settings
  const handleSetUiMode = (mode: 'skip' | 'modal' | 'drawer') => {
    // Only patch the field we intend to change to avoid overwriting theme or other values
    tatchi.setConfirmationConfig({ uiMode: mode } as any);
    setCurrentConfirmConfig((prev: any) => prev ? { ...prev, uiMode: mode } : { uiMode: mode });
  };

  const handleToggleSkipClick = () => {
    if (!currentConfirmConfig) return;
    const newBehavior = currentConfirmConfig.behavior === 'requireClick' ? 'autoProceed' : 'requireClick';
    tatchi.setConfirmBehavior(newBehavior);
    setCurrentConfirmConfig((prev: any) => prev ? { ...prev, behavior: newBehavior } : prev);
  };

  const handleSetDelay = (delay: number) => {
    // Only patch delay; avoid passing a stale theme from local state
    tatchi.setConfirmationConfig({ autoProceedDelay: delay } as any);
    setCurrentConfirmConfig((prev: any) => prev ? { ...prev, autoProceedDelay: delay } : { autoProceedDelay: delay });
  };

  const handleToggleTheme = () => {
    // Determine next theme from current visible theme when possible
    const newTheme = (theme === 'dark' ? 'light' : (theme === 'light' ? 'dark' : (currentConfirmConfig?.theme === 'dark' ? 'light' : 'dark')));
    try { tatchi.setUserTheme(newTheme); } catch {}
    setCurrentConfirmConfig((prev: any) => (prev ? { ...prev, theme: newTheme } : prev));
    // Always show a quick pulse to acknowledge the press
    try {
      document.body.setAttribute('data-w3a-theme-pulse', '1');
      window.setTimeout(() => { try { document.body.removeAttribute('data-w3a-theme-pulse'); } catch {} }, 220);
    } catch {}
  };

  // Menu items configuration with context-aware handlers
  const MENU_ITEMS: MenuItem[] = useMemo(() => [
    {
      id: PROFILE_MENU_ITEM_IDS.EXPORT_KEYS,
      icon: <Key />,
      label: 'Export Keys',
      description: 'View your private keys',
      disabled: !loginState.isLoggedIn,
      onClick: async () => {
        try {
          await tatchi.exportNearKeypairWithUI(nearAccountId!);
        } catch (error: any) {
          console.error('Key export failed:', error);
          const msg = String(error?.message || 'Unknown error');
          const friendly = /No user data found|No public key found/i.test(msg)
            ? 'No local key material found for this account on this device. Please complete registration or recovery here first.'
            : msg;
          alert(`Key export failed: ${friendly}`);
        }
      },
      keepOpenOnClick: true,
    },
    {
      id: PROFILE_MENU_ITEM_IDS.SCAN_LINK_DEVICE,
      icon: <Scan />,
      label: 'Scan and Link Device',
      description: 'Scan QR to link a device',
      disabled: !loginState.isLoggedIn,
      onClick: () => {
        setShowQRScanner(true);
      },
      keepOpenOnClick: true,
    },
    {
      id: PROFILE_MENU_ITEM_IDS.LINKED_DEVICES,
      icon: <Link />,
      label: 'Linked Devices',
      description: 'View linked devices',
      disabled: !loginState.isLoggedIn,
      onClick: () => setShowLinkedDevices(true),
      keepOpenOnClick: true,
    },
    {
      id: PROFILE_MENU_ITEM_IDS.TOGGLE_THEME,
      icon: theme === 'dark' ? <SunIcon /> : <MoonIcon />,
      label: 'Toggle Theme',
      description: theme === 'dark' ? 'Dark Mode' : 'Light Mode',
      disabled: false,
      onClick: handleToggleTheme,
      keepOpenOnClick: true,
    },
    {
      id: PROFILE_MENU_ITEM_IDS.TRANSACTION_SETTINGS,
      icon: <Sliders />,
      label: 'Transaction Settings',
      description: 'Customize confirmation behavior',
      disabled: !loginState.isLoggedIn,
      onClick: () => setTransactionSettingsOpen((v) => !v),
      keepOpenOnClick: true,
    },
  ], [tatchi, nearAccountId, loginState.isLoggedIn, theme, handleToggleTheme]);

  const highlightedMenuItemId = highlightedMenuItem?.id;
  const highlightShouldFocus = highlightedMenuItem?.focus ?? true;
  const highlightedIndex = useMemo(() => {
    if (!highlightedMenuItemId) return -1;
    return MENU_ITEMS.findIndex((item) => item.id === highlightedMenuItemId);
  }, [MENU_ITEMS, highlightedMenuItemId]);

  useEffect(() => {
    if (!isOpen || highlightedIndex < 0 || !highlightShouldFocus) return;
    const el = refs.menuItemsRef.current?.[highlightedIndex];
    if (!el) return;
    if (typeof window === 'undefined') {
      try { el.focus(); } catch {}
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      try { el.focus(); } catch {}
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isOpen, highlightedIndex, highlightShouldFocus, refs.menuItemsRef]);

  // Handlers
  const handleLogout = () => {
    logout();
    onLogout?.();
    handleClose();
  };

  return (
    <div
      ref={refs.buttonRef}
      className={`w3a-profile-button-morphable ${isOpen ? 'open' : 'closed'}${className ? ` ${className}` : ''}`}
      style={style}
      data-state={isOpen ? 'open' : 'closed'}
    >
      <UserAccountButton
        username={accountName}
        hideUsername={hideUsername}
        fullAccountId={nearAccountId || undefined}
        isOpen={isOpen}
        onClick={handleToggle}
        nearExplorerBaseUrl={nearExplorerBaseUrl}
        theme={theme}
      />

      {/* Visible menu structure for actual interaction */}
      <ProfileDropdown
        ref={refs.dropdownRef}
        isOpen={isOpen}
        menuItems={MENU_ITEMS}
        onLogout={handleLogout}
        onClose={handleClose}
        menuItemsRef={refs.menuItemsRef}
        toggleColors={toggleColors}
        currentConfirmConfig={currentConfirmConfig}
        onSetUiMode={handleSetUiMode}
        onToggleSkipClick={handleToggleSkipClick}
        onSetDelay={handleSetDelay}
        onToggleTheme={handleToggleTheme}
        transactionSettingsOpen={transactionSettingsOpen}
        theme={theme}
        highlightedMenuItemId={highlightedMenuItemId}
      />

      {/* QR Scanner Modal (portaled to nearest root for robustness) */}
      {createPortal(
        <QRCodeScanner
          key="profile-qr-scanner"
          isOpen={showQRScanner}
          fundingAmount={deviceLinkingScannerParams?.fundingAmount || '0.05'}
          onDeviceLinked={(result) => {
            deviceLinkingScannerParams?.onDeviceLinked?.(result);
            setShowQRScanner(false);
          }}
          onError={(error) => {
            deviceLinkingScannerParams?.onError?.(error);
            setShowQRScanner(false);
          }}
          onClose={() => {
            deviceLinkingScannerParams?.onClose?.();
            setShowQRScanner(false);
          }}
          onEvent={(event) => deviceLinkingScannerParams?.onEvent?.(event)}
        />, (portalTarget
          || ((refs.buttonRef.current?.getRootNode?.() instanceof ShadowRoot)
              ? (refs.buttonRef.current!.getRootNode() as ShadowRoot)
              : document.body)))}

      {/* Linked Devices Modal (portaled to nearest root for robustness) */}
      {createPortal(
        <LinkedDevicesModal
          nearAccountId={nearAccountId!}
          isOpen={showLinkedDevices}
          onClose={() => setShowLinkedDevices(false)}
        />, (portalTarget
          || ((refs.buttonRef.current?.getRootNode?.() instanceof ShadowRoot)
              ? (refs.buttonRef.current!.getRootNode() as ShadowRoot)
              : document.body)))}
    </div>
  );
};

export const ProfileSettingsButton: React.FC<ProfileSettingsButtonProps> = (props) => {
  return (
    <Theme>
      <ProfileSettingsButtonInner {...props} />
    </Theme>
  );
};
