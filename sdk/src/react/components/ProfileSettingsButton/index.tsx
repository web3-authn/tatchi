import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Key, Scan, Link, Sliders } from 'lucide-react';
import { SunIcon } from './icons/SunIcon';
import { MoonIcon } from './icons/MoonIcon';
import { UserAccountButton } from './UserAccountButton';
import { ProfileDropdown } from './ProfileDropdown';
import { useProfileState } from './hooks/useProfileState';
import { usePasskeyContext } from '../../context';
import type { MenuItem, ProfileSettingsButtonProps } from './types';
import { QRCodeScanner } from '../QRCodeScanner';
import { LinkedDevicesModal } from './LinkedDevicesModal';
import './Web3AuthProfileButton.css';
import { ThemeProvider, ThemeScope, useTheme } from '../theme';
import { toAccountId } from '../../../core/types/accountIds';
import { IndexedDBManager } from '../../../core/IndexedDBManager';

/**
 * Profile Settings Button Component
 * Provides user settings, account management, and device linking.
 * **Important:** This component must be used inside a PasskeyManager context.
 * Wrap your app with PasskeyProvider or ensure PasskeyManager is available in context.
 *
 * @example
 * ```tsx
 * import { PasskeyProvider } from '@tatchi/sdk/react';
 * import { ProfileSettingsButton } from '@tatchi/sdk/react';
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
  portalTarget,
}) => {
  // Get values from context if not provided as props
  const {
    loginState,
    passkeyManager,
    logout,
  } = usePasskeyContext();

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
  } = useProfileState();

  // Read current theme from ThemeProvider (falls back to system preference)
  const { theme } = useTheme();

  // Load confirmation config on mount
  useEffect(() => {
    let isActive = true;

    const syncConfirmationConfig = async () => {
      if (!passkeyManager) return;

      if (!loginState.isLoggedIn || !loggedInAccountId) {
        if (isActive) {
          setCurrentConfirmConfig(null);
        }
        return;
      }

      try {
        passkeyManager.userPreferences.setCurrentUser(toAccountId(loggedInAccountId));
      } catch (_) {}

      // Always try to hydrate from source of truth, then mirror locally
      let fetched: any | null = null;
      // 1) Wallet iframe (wallet origin) if available
      try {
        const client = passkeyManager.getServiceClient?.();
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
        try { fetched = passkeyManager.getConfirmationConfig(); } catch (_) {}
      }

      if (fetched) {
        // Mirror into local cache for immediate reads and future sessions
        try { passkeyManager.userPreferences.setConfirmationConfig(fetched); } catch (_) {}
        if (isActive) setCurrentConfirmConfig(fetched);
      } else {
        if (isActive) setCurrentConfirmConfig(null);
      }
    };

    void syncConfirmationConfig();

    return () => {
      isActive = false;
    };
  }, [passkeyManager, loginState.isLoggedIn, loggedInAccountId]);

  // Handlers for transaction settings
  const handleSetUiMode = (mode: 'skip' | 'modal' | 'drawer') => {
    if (!currentConfirmConfig) return;
    const patch = { ...currentConfirmConfig, uiMode: mode };
    passkeyManager.setConfirmationConfig(patch);
    setCurrentConfirmConfig((prev: any) => prev ? { ...prev, uiMode: mode } : prev);
  };

  const handleToggleSkipClick = () => {
    if (!currentConfirmConfig) return;
    const newBehavior = currentConfirmConfig.behavior === 'requireClick' ? 'autoProceed' : 'requireClick';
    passkeyManager.setConfirmBehavior(newBehavior);
    setCurrentConfirmConfig((prev: any) => prev ? { ...prev, behavior: newBehavior } : prev);
  };

  const handleSetDelay = (delay: number) => {
    if (!currentConfirmConfig) return;
    passkeyManager.setConfirmationConfig({ ...currentConfirmConfig, autoProceedDelay: delay });
    setCurrentConfirmConfig((prev: any) => prev ? { ...prev, autoProceedDelay: delay } : prev);
  };

  const handleToggleTheme = () => {
    if (!currentConfirmConfig) return;
    const newTheme = currentConfirmConfig.theme === 'dark' ? 'light' : 'dark';
    passkeyManager.setUserTheme(newTheme);
    setCurrentConfirmConfig((prev: any) => prev ? { ...prev, theme: newTheme } : prev);
  };

  // Menu items configuration with context-aware handlers
  const MENU_ITEMS: MenuItem[] = useMemo(() => [
    {
      icon: <Key />,
      label: 'Export Keys',
      description: 'View your private keys',
      disabled: !loginState.isLoggedIn,
      onClick: async () => {
        try {
          await passkeyManager.exportNearKeypairWithUI(nearAccountId!);
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
      icon: <Link />,
      label: 'Linked Devices',
      description: 'View linked devices',
      disabled: !loginState.isLoggedIn,
      onClick: () => setShowLinkedDevices(true),
      keepOpenOnClick: true,
    },
    {
      icon: theme === 'dark' ? <SunIcon /> : <MoonIcon />,
      label: 'Toggle Theme',
      description: theme === 'dark' ? 'Dark Mode' : 'Light Mode',
      disabled: false,
      onClick: handleToggleTheme,
      keepOpenOnClick: true,
    },
    {
      icon: <Sliders />,
      label: 'Transaction Settings',
      description: 'Customize confirmation behavior',
      disabled: !loginState.isLoggedIn,
      onClick: () => setTransactionSettingsOpen((v) => !v),
      keepOpenOnClick: true,
    },
  ], [passkeyManager, nearAccountId, loginState.isLoggedIn, theme, handleToggleTheme]);

  // Handlers
  const handleLogout = () => {
    logout();
    onLogout?.();
    handleClose();
  };

  return (
    <div
      ref={refs.buttonRef}
      className={`w3a-profile-button-morphable ${isOpen ? 'open' : 'closed'}`}
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
    <ThemeProvider>
      <ThemeScope>
        <ProfileSettingsButtonInner {...props} />
      </ThemeScope>
    </ThemeProvider>
  );
};
