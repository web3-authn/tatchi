import React, { useEffect, useMemo, useState } from 'react';
import { Key, Scan, Link, Sliders } from 'lucide-react';
import { SunIcon } from './icons/SunIcon';
import { MoonIcon } from './icons/MoonIcon';
import { UserAccountButton } from './UserAccountButton';
import { ProfileDropdown } from './ProfileDropdown';
import { useProfileState } from './hooks/useProfileState';
import { usePasskeyContext } from '../../context';
import type { MenuItem, ProfileButtonProps } from './types';
import { QRCodeScanner } from '../QRCodeScanner';
import { LinkedDevicesModal } from './LinkedDevicesModal';
import './Web3AuthProfileButton.css';
import { ThemeProvider, ThemeScope, useTheme } from '../theme';

/**
 * Profile Settings Button Component
 * Provides user settings, account management, and device linking.
 * **Important:** This component must be used inside a PasskeyManager context.
 * Wrap your app with PasskeyProvider or ensure PasskeyManager is available in context.
 *
 * @example
 * ```tsx
 * import { PasskeyProvider } from '@web3authn/passkey/react';
 * import { ProfileSettingsButton } from '@web3authn/passkey/react';
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
const ProfileSettingsButtonInner: React.FC<ProfileButtonProps> = ({
  username: usernameProp,
  nearAccountId: nearAccountIdProp,
  onLogout: onLogout,
  toggleColors,
  nearExplorerBaseUrl = 'https://nearblocks.io',
  deviceLinkingScannerParams,
}) => {
  // Get values from context if not provided as props
  const {
    loginState,
    passkeyManager,
    logout,
  } = usePasskeyContext();

  // Use props if provided, otherwise fall back to context
  const accountName = usernameProp || nearAccountIdProp?.split('.')?.[0] || loginState.nearAccountId?.split('.')?.[0] || 'User';
  const nearAccountId = nearAccountIdProp || loginState.nearAccountId;

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

  // Load and subscribe to confirmation config changes
  useEffect(() => {
    let unsub: (() => void) | undefined;
    // Initialize with current snapshot
    const cfg = passkeyManager.getConfirmationConfig();
    console.log("cfg1: ", cfg)
    setCurrentConfirmConfig(cfg)
    // Subscribe to live updates if available (normal mode exposes the method; iframe shim may not)
    try {
      unsub = passkeyManager.userPreferences.onConfirmationConfigChange(cfg => setCurrentConfirmConfig(cfg));
    } catch {}
    return () => { try { unsub && unsub(); } catch {} };
  }, [passkeyManager, loginState.nearAccountId]);

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
      keepOpenOnClick: false,
    },
    {
      icon: <Scan />,
      label: 'Scan and Link Device',
      description: 'Scan a QR to link a device',
      disabled: !loginState.isLoggedIn,
      onClick: () => {
        console.log('ProfileSettingsButton: Opening QR Scanner');
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
    <div className={`w3a-profile-button-container`}>
      <div
        ref={refs.buttonRef}
        className={`w3a-profile-button-morphable ${isOpen ? 'open' : 'closed'}`}
        data-state={isOpen ? 'open' : 'closed'}
      >
        <UserAccountButton
          username={accountName}
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
      </div>

      {/* QR Scanner Modal */}
      <QRCodeScanner
        key="profile-qr-scanner" // Force stable identity
        isOpen={showQRScanner}
        fundingAmount={deviceLinkingScannerParams?.fundingAmount || '0.05'}
        onDeviceLinked={(result) => {
          console.log('ProfileSettingsButton: QR Scanner device linked');
          deviceLinkingScannerParams?.onDeviceLinked?.(result);
          setShowQRScanner(false);
        }}
        onError={(error) => {
          console.log('ProfileSettingsButton: QR Scanner error');
          deviceLinkingScannerParams?.onError?.(error);
          setShowQRScanner(false);
        }}
        onClose={() => {
          console.log('ProfileSettingsButton: QR Scanner close requested');
          deviceLinkingScannerParams?.onClose?.();
          setShowQRScanner(false);
        }}
        onEvent={(event) => deviceLinkingScannerParams?.onEvent?.(event)}
      />

      {/* Linked Devices Modal */}
      <LinkedDevicesModal
        nearAccountId={nearAccountId!}
        isOpen={showLinkedDevices}
        onClose={() => setShowLinkedDevices(false)}
      />
    </div>
  );
};

export const ProfileSettingsButton: React.FC<ProfileButtonProps> = (props) => {
  return (
    <ThemeProvider>
      <ThemeScope>
        <ProfileSettingsButtonInner {...props} />
      </ThemeScope>
    </ThemeProvider>
  );
};
