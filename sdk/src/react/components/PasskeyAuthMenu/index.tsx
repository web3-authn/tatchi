import React from 'react';
import './PasskeyAuthMenu.css';
import { Theme, useTheme } from '../theme';
import { usePasskeyContext } from '../../context';
import { ArrowLeftIcon } from './icons';
import { SocialProviders } from './SocialProviders';
import { SegmentedControl } from './SegmentedControl';
import { PasskeyInput } from './PasskeyInput';
import { ContentSwitcher } from './ContentSwitcher';
import { ShowQRCode } from '../ShowQRCode';
import QRCodeIcon from '../QRCodeIcon';
import { useAuthMenuMode } from './useAuthMenuMode';
import { useProceedEligibility } from './useProceedEligibility';
import type { DeviceLinkingSSEEvent } from '../../../core/types/passkeyManager';
import {
  AuthMenuMode,
  AuthMenuModeMap,
  type AuthMenuModeLabel,
} from './types';

export { AuthMenuMode, AuthMenuModeMap };
export type { AuthMenuModeLabel };

export interface PasskeyAuthMenuProps {
  onLogin?: () => void;
  onRegister?: () => void;
  onRecoverAccount?: () => void;
  /** Optional callbacks for the link-device QR flow */
  linkDeviceOptions?: {
    onEvent?: (event: DeviceLinkingSSEEvent) => void;
    onError?: (error: Error) => void;
    /** Called when the user manually cancels the link-device flow */
    onCancelled?: () => void;
  };
  /** Optional custom header element rendered when not waiting */
  header?: React.ReactElement;
  defaultMode?: AuthMenuMode;
  style?: React.CSSProperties;
  className?: string;
  /**
   * Optional social login hooks. Provide a function per provider that returns
   * the derived username (e.g., email/handle) after the external auth flow.
   * If omitted or all undefined, the social row is hidden.
   *
   * Note: Social login integration is not yet implemented. The UI will
   * display provider buttons and a disclaimer for now, but no auth flow
   * is wired. This is a placeholder for future work.
   */
  socialLogin?: {
    google?: () => string;
    x?: () => string;
    apple?: () => string;
  };
}

export const PasskeyAuthMenu: React.FC<PasskeyAuthMenuProps> = (props) => (
  <Theme mode="scope-only">
    <PasskeyAuthMenuInner {...props} />
  </Theme>
);

const PasskeyAuthMenuInner: React.FC<PasskeyAuthMenuProps> = ({
  onLogin,
  onRegister,
  onRecoverAccount,
  linkDeviceOptions,
  // styles
  header,
  defaultMode,
  style,
  className,
  // login options
  socialLogin,
}) => {

  const { tokens, isDark } = useTheme();
  const ctx = usePasskeyContext();
  const passkeyManager = ctx?.passkeyManager;

  const accountExistsResolved = ctx?.accountInputState?.accountExists;
  const preferredDefaultMode: AuthMenuMode = (defaultMode ?? (accountExistsResolved ? AuthMenuMode.Login : AuthMenuMode.Register)) as AuthMenuMode;

  const [waiting, setWaiting] = React.useState(false);
  const [showScanDevice, setShowScanDevice] = React.useState(false);

  const currentValue = ctx.accountInputState?.inputUsername
  const setCurrentValue = ctx.setInputUsername;

  const secure = typeof window !== 'undefined' ? window.isSecureContext : true;
  const postfixTextResolved = ctx?.accountInputState?.displayPostfix;
  const isUsingExistingAccountResolved = ctx?.accountInputState?.isUsingExistingAccount;

  const {
    mode,
    setMode,
    title,
    onSegmentChange,
    onInputChange,
    resetToDefault
  } = useAuthMenuMode({
    defaultMode: preferredDefaultMode,
    accountExists: accountExistsResolved,
    passkeyManager,
    currentValue,
    setCurrentValue,
  });

  const { canShowContinue, canSubmit } = useProceedEligibility({
    mode,
    currentValue,
    accountExists: accountExistsResolved,
    secure,
  });

  const onArrowClick = async () => {
    if (!canSubmit) return;

    // Immediately show waiting state (no delayed timer)
    setWaiting(true);
    // No transitions; switch immediately

    try {
      if (mode === AuthMenuMode.Recover) {
        await onRecoverAccount?.();
      } else if (mode === AuthMenuMode.Login) {
        await onLogin?.();
        // If login resolves with an explicit failure, return to Login
        setWaiting(false);
        closeLinkDeviceView('flow');
        setMode(AuthMenuMode.Login);
      } else {
        await onRegister?.();
      }
    } catch (error) {
      // If login throws (e.g., Touch ID cancelled), send user back to Login
      if (mode === AuthMenuMode.Login) {
        setWaiting(false);
        closeLinkDeviceView('flow');
        setMode(mode);
        return;
      }
      onResetToStart();
    }
  };


  const fallbackOnEvent = React.useCallback((event: DeviceLinkingSSEEvent) => {
    console.log('ShowQRCode event:', event);
  }, []);

  const fallbackOnError = React.useCallback((error: Error) => {
    console.error('ShowQRCode error:', error);
  }, []);

  const handleLinkDeviceEvent = linkDeviceOptions?.onEvent ?? fallbackOnEvent;
  const handleLinkDeviceError = linkDeviceOptions?.onError ?? fallbackOnError;
  const handleLinkDeviceCancelled = linkDeviceOptions?.onCancelled;

  const stopLinkDeviceFlow = React.useCallback(() => {
    try {
      const stopper = ctx?.stopDevice2LinkingFlow;
      if (stopper) {
        void stopper().catch(() => {});
      }
    } catch {}
  }, [ctx]);

  const closeLinkDeviceView = React.useCallback((reason: 'user' | 'flow') => {
    stopLinkDeviceFlow();
    setShowScanDevice(false);
    if (reason === 'user') {
      try { handleLinkDeviceCancelled?.(); } catch {}
    }
  }, [stopLinkDeviceFlow, handleLinkDeviceCancelled]);

  const onResetToStart = React.useCallback(() => {
    setWaiting(false);
    if (showScanDevice) {
      closeLinkDeviceView('user');
    } else {
      setShowScanDevice(false);
    }
    // Reset mode to appropriate default based on account existence
    resetToDefault();
    setCurrentValue('');
  }, [showScanDevice, closeLinkDeviceView, resetToDefault, setCurrentValue]);

  // active pill background
  const segActiveBg = isDark ? tokens.colors.slate600 : tokens.colors.slate50;

  return (
    <div
      className={`w3a-signup-menu-root${className ? ` ${className}` : ''}`}
      data-mode={mode}
      data-waiting={waiting}
      data-scan-device={showScanDevice}
      style={style}
    >
      <ContentSwitcher
        waiting={waiting}
        waitingText={
          mode === AuthMenuMode.Register
          ? 'Registering passkey…'
          : 'Waiting for Passkey…'
        }
        backButton={
          <button
            aria-label="Back"
            onClick={onResetToStart}
            className={`w3a-back-button${(waiting || showScanDevice) ? ' is-visible' : ''}`}
          >
            <ArrowLeftIcon size={18} strokeWidth={2.25} style={{ display: 'block' }} />
          </button>
        }
        showScanDevice={showScanDevice}
        showQRCodeElement={
          <ShowQRCode
            isOpen={showScanDevice}
            onClose={() => closeLinkDeviceView('flow')}
            onEvent={handleLinkDeviceEvent}
            onError={handleLinkDeviceError}
          />
        }
      >

        {/* Header */}
        <div className="w3a-header">
          {header ?? (
            <div>
              <div className="w3a-title">{title.title}</div>
              <div className="w3a-subhead">{title.subtitle}</div>
            </div>
          )}
        </div>

        {/* Social providers row (optional) */}
        <SocialProviders socialLogin={socialLogin} />

        {/* Passkey row */}
        <PasskeyInput
          value={currentValue}
          onChange={onInputChange}
          placeholder={
            mode === AuthMenuMode.Register
              ? 'Pick a username'
              : mode === AuthMenuMode.Recover
              ? 'Leave blank to discover accounts'
              : 'Enter your username'
          }
          postfixText={postfixTextResolved}
          isUsingExistingAccount={isUsingExistingAccountResolved}
          canProceed={canShowContinue}
          onProceed={onArrowClick}
          mode={mode}
          secure={secure}
          waiting={waiting}
        />

        {/* Segmented control: Register | Login | Recover (generic API) */}
        <SegmentedControl
          items={[
            { value: AuthMenuMode.Register, label: 'Register', className: 'register' },
            { value: AuthMenuMode.Login, label: 'Login', className: 'login' },
            { value: AuthMenuMode.Recover, label: 'Recover', className: 'recover' },
          ]}
          value={mode}
          onValueChange={(v) => onSegmentChange(v as AuthMenuMode)}
          activeBg={segActiveBg}
        />

        {/* Help copy under segments */}
        <div className="w3a-seg-help-row">
          <div className="w3a-seg-help" aria-live="polite">
            {mode === AuthMenuMode.Login && 'Sign in with your passkey'}
            {mode === AuthMenuMode.Register && 'Create a new account'}
            {mode === AuthMenuMode.Recover && 'Recover account (iCloud/Chrome sync)'}
          </div>
        </div>

        {/* Scan and Link Device button */}
        <div className="w3a-scan-device-row">
          <div className="w3a-section-divider">
            <span className="w3a-section-divider-text">Already have an account?</span>
          </div>
          <button
            onClick={() => setShowScanDevice(true)}
            className="w3a-link-device-btn"
          >
            <QRCodeIcon width={18} height={18} strokeWidth={2} />
            Scan and Link Device
          </button>
        </div>

      </ContentSwitcher>
    </div>
  );
};

export default PasskeyAuthMenu;
