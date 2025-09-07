import React from 'react';
import './SignupMenu.css';
import { ThemeScope, useTheme } from '../theme';
import { ArrowLeft } from 'lucide-react';

import { SocialProviders, type SocialProviderName } from './SocialProviders';
import { SegmentedControl } from './SegmentedControl';
import { PasskeyInput } from './PasskeyInput';
import { ContentSwitcher } from './ContentSwitcher';
import { ShowQRCode } from '../ShowQRCode';

export type SignupMode = 'register' | 'login' | 'sync';

export interface SignupMenuProps {
  title?: string;
  defaultMode?: SignupMode;
  onClose?: () => void;
  onBeginPasskeyLogin?: (mode: SignupMode) => void;
  style?: React.CSSProperties;
  className?: string;
  /** Optional social login providers to render. Empty array hides the row. */
  socialLogin?: SocialProviderName[];
  /** Optional controlled input value for the username/email field */
  userInput?: string;
  /** Optional change handler to control the input */
  onUserInputChange?: (value: string) => void;
  /** Text to show inline after the input (e.g., .testnet) */
  postfixText?: string;
  /** Whether the account domain/postfix corresponds to an existing account */
  isUsingExistingAccount?: boolean;
  /** Whether the current account exists (used to enable/disable proceed) */
  accountExists?: boolean;
  /** Optionally pass secure-context flag; defaults to window.isSecureContext */
  isSecureContext?: boolean;
  /** Optional callback to initiate account recovery flow */
  onBeginAccountRecovery?: () => void;
  /** Whether to show the QR code section */
  showQRCodeSection?: boolean;
}

/**
 * SignupMenu (React-only)
 * - Uses theme tokens from design-tokens.ts via ThemeProvider/useTheme
 * - Segmented Register/Login with animated highlight
 * - Arrow proceeds to a simple "Waiting for Passkey" view with spinner
 */
const SignupMenuInner: React.FC<SignupMenuProps> = ({
  title = 'Sign In',
  defaultMode = 'login',
  onClose,
  onBeginPasskeyLogin,
  style,
  className,
  socialLogin,
  userInput,
  onUserInputChange,
  postfixText,
  isUsingExistingAccount,
  accountExists,
  isSecureContext,
  onBeginAccountRecovery,
  showQRCodeSection = false,
}) => {
  const { tokens, isDark } = useTheme();
  const [mode, setMode] = React.useState<SignupMode>(defaultMode);
  const [waiting, setWaiting] = React.useState(false);
  const [internalUserInput, setInternalUserInput] = React.useState('');
  // Hover/press states replaced by CSS :hover/:active

  const controlled = typeof userInput === 'string' && typeof onUserInputChange === 'function';
  const currentValue = controlled ? userInput! : internalUserInput;
  const setCurrentValue = controlled ? onUserInputChange! : setInternalUserInput;

  const secure = typeof isSecureContext === 'boolean' ? isSecureContext : (typeof window !== 'undefined' ? window.isSecureContext : true);
  const canProceed = mode === 'login'
    ? (currentValue.length > 0 && !!accountExists)
    : mode === 'sync'
    ? (currentValue.length > 0 && secure && !!accountExists)
    : (currentValue.length > 0 && secure && !accountExists);

  React.useEffect(() => {
    // Keep local mode aligned with external defaultMode changes
    setMode(defaultMode);
  }, [defaultMode]);

  // Colors are read from CSS variables in stylesheet

  const onArrowClick = () => {
    if (!canProceed) return;
    setWaiting(true);
    if (mode === 'sync') {
      onBeginAccountRecovery?.();
    } else {
      onBeginPasskeyLogin?.(mode);
    }
  };

  const onResetToStart = () => {
    setWaiting(false);
    setMode(defaultMode);
    setCurrentValue('');
  };

  // Slightly darker than before for clearer contrast
  const segActiveBg = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)';

  return (
    <div
      className={`w3a-signup-menu-root${className ? ` ${className}` : ''}`}
      data-mode={mode}
      data-waiting={waiting ? 'true' : 'false'}
      style={style}
    >
      {/* Back button (only during waiting) */}
      {/* Back button (persisted for fade/scale animation) */}
      <button
        aria-label="Back"
        onClick={onResetToStart}
        className={`w3a-back-button${waiting ? ' is-visible' : ''}`}
      >
        <ArrowLeft size={18} strokeWidth={2.25} style={{ display: 'block' }} />
      </button>

      {/* Header */}
      <div className="w3a-header">
        {!waiting && <div className="w3a-title">{title}</div>}
      </div>

      {/* Content switcher */}
      <ContentSwitcher waiting={waiting}>
        {/* Social providers row (optional) */}
        <SocialProviders providers={socialLogin} />

        {/* Passkey row */}
        <PasskeyInput
          value={currentValue}
          onChange={setCurrentValue}
          placeholder={mode === 'login' ? 'Login with Passkey' : mode === 'sync' ? 'Sync account with Passkey' : 'Register with Passkey'}
          postfixText={postfixText}
          isUsingExistingAccount={isUsingExistingAccount}
          canProceed={canProceed}
          onProceed={onArrowClick}
          variant="both"
          primaryLabel={mode === 'login' ? 'Login' : mode === 'sync' ? 'Sync account' : 'Register'}
          mode={mode}
          secure={secure}
        />

        {/* Segmented control: Register | Login */}
        <SegmentedControl mode={mode} onChange={setMode} activeBg={segActiveBg} />

        {/* QR Code section */}
        {showQRCodeSection && (
          <>
            {/* Section divider */}
            <div className="w3a-section-divider">
              <span className="w3a-section-divider-text">or</span>
            </div>

            {/* QR Code Button and Modal */}
            <ShowQRCode />
          </>
        )}
      </ContentSwitcher>
    </div>
  );
};

export const SignupMenu: React.FC<SignupMenuProps> = (props) => (
  <ThemeScope>
    <SignupMenuInner {...props} />
  </ThemeScope>
);

export default SignupMenu;
