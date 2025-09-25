import React from 'react';
import './PasskeyAuthMenu.css';
import { ThemeScope, useTheme } from '../theme';
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

// Enum-based auth modes for clearer usage without naked numbers
export enum AuthMenuMode {
  Register = 0,
  Login = 1,
  Recover = 2,
}

// Numeric → label mapping, kept for UI and classNames
export const AuthMenuModeMap = {
  [AuthMenuMode.Register]: 'register',
  [AuthMenuMode.Login]: 'login',
  [AuthMenuMode.Recover]: 'recover',
} as const;
export type AuthMenuModeLabel = typeof AuthMenuModeMap[keyof typeof AuthMenuModeMap];

export interface SignupMenuProps {
  onLogin?: () => void;
  onRegister?: () => void;
  onRecoverAccount?: () => void;

  /** Optional custom header element rendered when not waiting */
  header?: React.ReactElement;
  defaultMode?: AuthMenuMode;
  style?: React.CSSProperties;
  className?: string;
  /**
   * Optional social login hooks. Provide a function per provider that returns
   * the derived username (e.g., email/handle) after the external auth flow.
   * If omitted or all undefined, the social row is hidden.
   */
  socialLogin?: {
    google?: () => string;
    x?: () => string;
    apple?: () => string;
  };
  /** Text to show inline after the input (e.g., .testnet) */
  postfixText?: string;
  /** Whether the account domain/postfix corresponds to an existing account */
  isUsingExistingAccount?: boolean;
  /** Whether the current account exists (used to enable/disable proceed) */
  accountExists?: boolean;
  /** Optionally pass secure-context flag; defaults to window.isSecureContext */
  isSecureContext?: boolean;
  /** Optional callbacks for the link-device QR flow */
  linkDeviceOptions?: {
    onEvent?: (event: DeviceLinkingSSEEvent) => void;
    onError?: (error: Error) => void;
  };
}

export const PasskeyAuthMenu: React.FC<SignupMenuProps> = (props) => (
  <ThemeScope>
    <PasskeyAuthMenuInner {...props} />
  </ThemeScope>
);

/**
 * - Uses theme tokens from design-tokens.ts via ThemeProvider/useTheme
 * - Segmented Register/Login with animated highlight
 * - Arrow proceeds to a simple "Waiting for Passkey" view with spinner
 */
const PasskeyAuthMenuInner: React.FC<SignupMenuProps> = ({
  defaultMode,
  onLogin,
  onRegister,
  style,
  className,
  header,
  socialLogin,
  // userInput,
  // onUserInputChange,
  postfixText,
  isUsingExistingAccount,
  accountExists,
  isSecureContext,
  onRecoverAccount,
  linkDeviceOptions,
}) => {
  const { tokens, isDark } = useTheme();
  // Access Passkey context if available (tolerate absence)
  let ctx: any = null;
  try { ctx = usePasskeyContext(); } catch {}
  const passkeyManager: any = ctx?.passkeyManager || null;
  // Resolve default mode: prefer prop, otherwise infer from account existence
  const accountExistsResolved = (typeof accountExists === 'boolean')
    ? accountExists
    : (ctx?.accountInputState?.accountExists ?? false);
  const preferredDefaultMode: AuthMenuMode = (defaultMode ?? (accountExistsResolved ? AuthMenuMode.Login : AuthMenuMode.Register)) as AuthMenuMode;

  const [waiting, setWaiting] = React.useState(false);
  const [showScanDevice, setShowScanDevice] = React.useState(false);
  const [internalUserInput, setInternalUserInput] = React.useState('');
  // Hover/press states replaced by CSS :hover/:active

  // const controlled = typeof userInput === 'string' && typeof onUserInputChange === 'function';
  const usingContext = !!ctx;
  const currentValue = usingContext
    ? (ctx.accountInputState?.inputUsername || '')
    : internalUserInput;

  const setCurrentValue = usingContext
    ? (ctx.setInputUsername as (v: string) => void)
    : setInternalUserInput;

  const secure = typeof isSecureContext === 'boolean' ? isSecureContext : (typeof window !== 'undefined' ? window.isSecureContext : true);

  const postfixTextResolved = typeof postfixText === 'string'
    ? postfixText
    : (ctx?.accountInputState?.displayPostfix ?? undefined);

  const isUsingExistingAccountResolved = (typeof isUsingExistingAccount === 'boolean')
    ? isUsingExistingAccount
    : (ctx?.accountInputState?.isUsingExistingAccount ?? undefined);

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
      } else {
        await onRegister?.();
      }
    } catch (error) {
      onResetToStart();
    }
  };

  // Handle Enter key to trigger continue button
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Enter' && !waiting && canShowContinue) {
        event.preventDefault();
        onArrowClick();
      }
    };
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [waiting, canShowContinue, onArrowClick]);

  const onResetToStart = () => {
    setWaiting(false);
    setShowScanDevice(false);
    // Reset mode to appropriate default based on account existence
    resetToDefault();
    setCurrentValue('');
  };

  const segActiveBg = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)';

  const fallbackOnEvent = React.useCallback((event: DeviceLinkingSSEEvent) => {
    console.log('ShowQRCode event:', event);
  }, []);

  const fallbackOnError = React.useCallback((error: Error) => {
    console.error('ShowQRCode error:', error);
  }, []);

  const handleLinkDeviceEvent = linkDeviceOptions?.onEvent ?? fallbackOnEvent;
  const handleLinkDeviceError = linkDeviceOptions?.onError ?? fallbackOnError;

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
            onClose={() => setShowScanDevice(false)}
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
          variant="both"
          primaryLabel={mode === AuthMenuMode.Login ? 'Login' : mode === AuthMenuMode.Recover ? 'Recover account' : 'Register'}
          mode={mode}
          secure={secure}
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
            {mode === AuthMenuMode.Login && 'Sign in with your passkey this device'}
            {mode === AuthMenuMode.Register && 'Create a new account'}
            {mode === AuthMenuMode.Recover && 'Recover an account (iCloud/Chrome passkey sync)'}
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
            onMouseEnter={(e) => {
              e.currentTarget.style.background = tokens.colors.surface2;
              e.currentTarget.style.boxShadow = tokens.shadows.md;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = tokens.colors.surface;
              e.currentTarget.style.boxShadow = tokens.shadows.sm;
            }}
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
