import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { KeyIcon } from './icons/KeyIcon';
import { ScanIcon } from './icons/ScanIcon';
import { LinkIcon } from './icons/LinkIcon';
import { SlidersIcon } from './icons/SlidersIcon';
import { SunIcon } from './icons/SunIcon';
import { MoonIcon } from './icons/MoonIcon';
import { UserAccountButton } from './UserAccountButton';
import { ProfileDropdown } from './ProfileDropdown';
import { useProfileState } from './hooks/useProfileState';
import { useTatchi } from '../../context';
import type { AccountMenuButtonProps, MenuItem } from './types';
import { PROFILE_MENU_ITEM_IDS } from './types';
import { QRCodeScanner } from '../QRCodeScanner';
import { LinkedDevicesModal } from './LinkedDevicesModal';
import './Web3AuthProfileButton.css';
import { Theme, useTheme } from '../theme';
import { AccountId, toAccountId } from '../../../core/types/accountIds';
import type { SignerMode } from '../../../core/types/signer-worker';

/**
 * Account Menu Button Component
 * Provides user settings, account management, and device linking.
 * **Important:** This component should be used inside a TatchiPasskey context.
 * Wrap your app with PasskeyProvider or ensure TatchiPasskey is available in context via useTatchi.
 *
 * @example
 * ```tsx
 * import { PasskeyProvider } from '@tatchi-xyz/sdk/react';
 * import { AccountMenuButton } from '@tatchi-xyz/sdk/react';
 *
 * function App() {
 *   return (
 *     <PasskeyProvider configs={passkeyConfigs}>
 *       <AccountMenuButton
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
const AccountMenuButtonInner: React.FC<AccountMenuButtonProps> = ({
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
    themeCapabilities,
  } = useTatchi();

  // Use props if provided, otherwise fall back to context
  const accountName = usernameProp || nearAccountIdProp?.split('.')?.[0] || loginState.nearAccountId?.split('.')?.[0] || 'User';
  const loggedInAccountId = loginState.nearAccountId;
  const nearAccountId = nearAccountIdProp || loggedInAccountId;

  // Local state for modals/expanded sections
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [showLinkedDevices, setShowLinkedDevices] = useState(false);
  const [transactionSettingsOpen, setTransactionSettingsOpen] = useState(false);
  const [currentConfirmConfig, setCurrentConfirmConfig] = useState<any>(null);
  const [currentSignerMode, setCurrentSignerMode] = useState<SignerMode | null>(null);
  const lastThresholdSignerModeRef = useRef<SignerMode | null>(null);

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

  // Keep local view state in sync with SDK preferences (mirrors wallet host in iframe mode)
  useEffect(() => {
    if (!tatchi) return;
    if (!loginState.isLoggedIn || !loggedInAccountId) {
      setCurrentConfirmConfig(null);
      setCurrentSignerMode(null);
      return;
    }

    let cancelled = false;

    if (AccountId.validate(loggedInAccountId).valid) {
      tatchi.userPreferences.setCurrentUser(toAccountId(loggedInAccountId));
    }
    setCurrentConfirmConfig(tatchi.getConfirmationConfig());
    setCurrentSignerMode(tatchi.getSignerMode());

    const unsubConfirmConfig = tatchi.userPreferences.onConfirmationConfigChange?.((cfg: any) => {
      if (cancelled) return;
      setCurrentConfirmConfig(cfg);
    });
    const unsubSignerMode = tatchi.userPreferences.onSignerModeChange?.((mode) => {
      if (cancelled) return;
      setCurrentSignerMode(mode);
    });

    return () => {
      cancelled = true;
      unsubConfirmConfig?.();
      unsubSignerMode?.();
    };
  }, [tatchi, loginState.isLoggedIn, loggedInAccountId]);

  useEffect(() => {
    if (currentSignerMode?.mode === 'threshold-signer') {
      lastThresholdSignerModeRef.current = currentSignerMode;
    }
  }, [currentSignerMode]);

  // Handlers for transaction settings
  const handleSetUiMode = (mode: 'none' | 'modal' | 'drawer') => {
    // Only patch the field we intend to change to avoid overwriting theme or other values
    tatchi.setConfirmationConfig({ uiMode: mode } as any);
  };

  const handleToggleSkipClick = () => {
    if (!currentConfirmConfig) return;
    const newBehavior = currentConfirmConfig.behavior === 'requireClick' ? 'skipClick' : 'requireClick';
    tatchi.setConfirmBehavior(newBehavior);
  };

  const handleSetDelay = (delay: number) => {
    // Only patch delay; avoid passing a stale theme from local state
    tatchi.setConfirmationConfig({ autoProceedDelay: delay } as any);
  };

  const handleToggleTheme = () => {
    if (!themeCapabilities.canSetHostTheme) {
      console.error('theme/setTheme needs to be passed to the SDK');
      return;
    }
    // Determine next theme from current visible theme when possible
    const newTheme = (theme === 'dark' ? 'light' : (theme === 'light' ? 'dark' : (currentConfirmConfig?.theme === 'dark' ? 'light' : 'dark')));
    tatchi.setTheme(newTheme);
    // Always show a quick pulse to acknowledge the press
    if (typeof document !== 'undefined' && document.body) {
      document.body.setAttribute('data-w3a-theme-pulse', '1');
      window.setTimeout(() => {
        document.body?.removeAttribute('data-w3a-theme-pulse');
      }, 220);
    }
  };

  const handleToggleThresholdSigning = (enabled: boolean) => {
    if (enabled) {
      const prev = lastThresholdSignerModeRef.current;
      tatchi.setSignerMode(prev?.mode === 'threshold-signer' ? prev : 'threshold-signer');
      return;
    }
    tatchi.setSignerMode('local-signer');
  };

  // Menu items configuration with context-aware handlers
  const MENU_ITEMS: MenuItem[] = useMemo(() => {
    const items: MenuItem[] = [
      {
      id: PROFILE_MENU_ITEM_IDS.EXPORT_KEYS,
      icon: <KeyIcon />,
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
      icon: <ScanIcon />,
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
      icon: <LinkIcon />,
      label: 'Linked Devices',
      description: 'View linked devices',
      disabled: !loginState.isLoggedIn,
      onClick: () => setShowLinkedDevices(true),
      keepOpenOnClick: true,
    },
    ];

    items.push({
      id: PROFILE_MENU_ITEM_IDS.TOGGLE_THEME,
      icon: theme === 'dark' ? <SunIcon /> : <MoonIcon />,
      label: 'Toggle Theme',
      description: theme === 'dark' ? 'Dark Mode' : 'Light Mode',
      disabled: false,
      onClick: handleToggleTheme,
      keepOpenOnClick: true,
    });

    items.push({
      id: PROFILE_MENU_ITEM_IDS.TRANSACTION_SETTINGS,
      icon: <SlidersIcon />,
      label: 'Transaction Settings',
      description: 'Customize confirmation behavior',
      disabled: !loginState.isLoggedIn,
      onClick: () => setTransactionSettingsOpen((v) => !v),
      keepOpenOnClick: true,
    });
    return items;
  }, [tatchi, nearAccountId, loginState.isLoggedIn, theme, handleToggleTheme]);

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
    const focusItem = () => {
      if (typeof (el as any).focus === 'function') {
        (el as any).focus();
      }
    };
    if (typeof window === 'undefined') {
      focusItem();
      return;
    }
    const frame = window.requestAnimationFrame(focusItem);
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
        signerMode={currentSignerMode ?? undefined}
        onToggleThresholdSigning={handleToggleThresholdSigning}
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
        />, (portalTarget || document.body))}

      {/* Linked Devices Modal (portaled to nearest root for robustness) */}
      {createPortal(
        <LinkedDevicesModal
          nearAccountId={nearAccountId!}
          isOpen={showLinkedDevices}
          onClose={() => setShowLinkedDevices(false)}
        />, (portalTarget || document.body))}
    </div>
  );
};

export const AccountMenuButton: React.FC<AccountMenuButtonProps> = (props) => {
  const { theme } = useTheme();
  return (
    <Theme theme={theme}>
      <AccountMenuButtonInner {...props} />
    </Theme>
  );
};

export const ProfileSettingsButton = AccountMenuButton;
