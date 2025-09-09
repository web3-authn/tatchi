import React, { useEffect, useMemo, useState } from 'react';
import { Key, Scan, Shield, Sliders } from 'lucide-react';
import { UserAccountButton } from './UserAccountButton';
import { ProfileDropdown } from './ProfileDropdown';
import { useProfileState } from './hooks/useProfileState';
import { usePasskeyContext } from '../../context';
import type { MenuItem, ProfileButtonProps } from './types';
import { QRCodeScanner } from '../QRCodeScanner';
import { AccessKeysModal } from './AccessKeysModal';
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
    useRelayer,
    setUseRelayer,
  } = usePasskeyContext();

  // Use props if provided, otherwise fall back to context
  const accountName = usernameProp || nearAccountIdProp?.split('.')?.[0] || loginState.nearAccountId?.split('.')?.[0] || 'User';
  const nearAccountId = nearAccountIdProp || loginState.nearAccountId;

  // Local state for modals/expanded sections
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [showAccessKeys, setShowAccessKeys] = useState(false);
  const [isLoadingKeys, setIsLoadingKeys] = useState(false);
  const [transactionSettingsOpen, setTransactionSettingsOpen] = useState(false);
  const [currentConfirmConfig, setCurrentConfirmConfig] = useState<any>(null);

  // Load confirmation config on mount
  useEffect(() => {
    try {
      const cfg = passkeyManager.getConfirmationConfig();
      setCurrentConfirmConfig(cfg);
    } catch (_) {}
  }, [passkeyManager]);

  // Handlers for transaction settings
  const handleToggleShowDetails = () => {
    if (!currentConfirmConfig) return;
    const newUIMode = currentConfirmConfig.uiMode === 'modal' ? 'skip' : 'modal';
    passkeyManager.setConfirmationConfig({ ...currentConfirmConfig, uiMode: newUIMode });
    setCurrentConfirmConfig((prev: any) => prev ? { ...prev, uiMode: newUIMode } : prev);
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
      description: 'Export your NEAR keys',
      disabled: false,
      onClick: async () => {
        try {
          const {
            accountId,
            privateKey,
            publicKey
          } = await passkeyManager.exportNearKeypairWithTouchId(nearAccountId!);

          // Small delay to allow document to regain focus after WebAuthn
          await new Promise(resolve => setTimeout(resolve, 150));

          const keypair_msg = `Account ID:\n${accountId}\n\nPublic key:\n${publicKey}\n\nPrivate key:\n${privateKey}`;

          // Simple clipboard approach with single fallback
          if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(keypair_msg);
            alert(`NEAR keys copied to clipboard!\n${keypair_msg}`);
          } else {
            // Simple fallback: show keys for manual copy
            alert(`Your NEAR Keys (copy manually):\n${keypair_msg}`);
          }
        } catch (error: any) {
          console.error('Key export failed:', error);
          alert(`Key export failed: ${error.message}`);
        }
      }
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
      icon: <Shield />,
      label: 'Access Keys',
      description: 'View your account access keys',
      disabled: !loginState.isLoggedIn,
      onClick: () => setShowAccessKeys(true),
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
  ], [passkeyManager, nearAccountId, loginState.isLoggedIn]);

  // State management
  const {
    isOpen,
    refs,
    handleToggle,
    handleClose,
  } = useProfileState();

  // Read current theme from ThemeProvider (falls back to system preference)
  const { theme } = useTheme();

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
          useRelayer={useRelayer}
          onRelayerChange={setUseRelayer}
          onLogout={handleLogout}
          onClose={handleClose}
          menuItemsRef={refs.menuItemsRef}
          toggleColors={toggleColors}
          currentConfirmConfig={currentConfirmConfig}
          onToggleShowDetails={handleToggleShowDetails}
          onToggleSkipClick={handleToggleSkipClick}
          onSetDelay={handleSetDelay}
          onToggleTheme={handleToggleTheme}
          transactionSettingsOpen={transactionSettingsOpen}
          theme={theme}
        />
      </div>

      {/* QR Scanner Modal - Always rendered to prevent unmount/remount, controlled by isOpen */}
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

      {/* Access Keys Modal - Rendered outside of ProfileDropdown */}
      <AccessKeysModal
        nearAccountId={nearAccountId!}
        isOpen={showAccessKeys}
        onClose={() => setShowAccessKeys(false)}
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
