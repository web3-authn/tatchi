import React from 'react';
import './PasskeyAuthMenu.css';
import { ThemeScope, useTheme } from '../theme';
import { usePasskeyContext } from '../../context';
import { ArrowLeft } from 'lucide-react';

import { AccountExistsBadge } from './AccountExistsBadge';
import { SocialProviders, type SocialProviderName } from './SocialProviders';
import { SegmentedControl } from './SegmentedControl';
import { PasskeyInput } from './PasskeyInput';
import { ContentSwitcher } from './ContentSwitcher';
import { ShowQRCode } from '../ShowQRCode';

export type AuthMenuMode = 'register' | 'login' | 'sync';

export interface SignupMenuProps {
  title?: string;
  defaultMode?: AuthMenuMode;
  onLogin?: () => void;
  onRegister?: () => void;
  style?: React.CSSProperties;
  className?: string;
  /** Optional social login providers to render. Empty array hides the row. */
  socialLogin?: SocialProviderName[];
  // /** Optional controlled input value for the username/email field */
  // userInput?: string;
  // /** Optional change handler to control the input */
  // onUserInputChange?: (value: string) => void;
  /** Text to show inline after the input (e.g., .testnet) */
  postfixText?: string;
  /** Whether the account domain/postfix corresponds to an existing account */
  isUsingExistingAccount?: boolean;
  /** Whether the current account exists (used to enable/disable proceed) */
  accountExists?: boolean;
  /** Optionally pass secure-context flag; defaults to window.isSecureContext */
  isSecureContext?: boolean;
  /** Optional callback to initiate account recovery flow */
  onRecoverAccount?: () => void;
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
  onLogin,
  onRegister,
  style,
  className,
  socialLogin,
  // userInput,
  // onUserInputChange,
  postfixText,
  isUsingExistingAccount,
  accountExists,
  isSecureContext,
  onRecoverAccount,
  showQRCodeSection = false,
}) => {
  const { tokens, isDark } = useTheme();
  // Access Passkey context if available (tolerate absence)
  let ctx: any = null;
  try {
    ctx = usePasskeyContext();
  } catch {
    ctx = null;
  }
  const passkeyManager: any = ctx?.passkeyManager || null;
  const [mode, setMode] = React.useState<AuthMenuMode>(defaultMode);
  const [waiting, setWaiting] = React.useState(false);
  const [internalUserInput, setInternalUserInput] = React.useState('');
  // Track if current input was auto-prefilled from IndexedDB and what value
  const prefilledFromIdbRef = React.useRef(false);
  const prefilledValueRef = React.useRef<string>('');
  // Track last mode to detect transitions into 'login'
  const prevModeRef = React.useRef<AuthMenuMode | null>(null);
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
  const accountExistsResolved = (typeof accountExists === 'boolean')
    ? accountExists
    : (ctx?.accountInputState?.accountExists ?? false);

  const postfixTextResolved = typeof postfixText === 'string'
    ? postfixText
    : (ctx?.accountInputState?.displayPostfix ?? undefined);

  const isUsingExistingAccountResolved = (typeof isUsingExistingAccount === 'boolean')
    ? isUsingExistingAccount
    : (ctx?.accountInputState?.isUsingExistingAccount ?? undefined);

  const canProceed = mode === 'login'
    ? (currentValue.length > 0 && !!accountExistsResolved)
    : mode === 'sync'
    ? (currentValue.length > 0 && secure && !!accountExistsResolved)
    : (currentValue.length > 0 && secure && !accountExistsResolved);

  // Only initialize mode from defaultMode once (on mount).
  // Avoid switching segments when parent recomputes defaultMode
  // due to input clearing or derived state changes.
  const didInitModeRef = React.useRef(false);
  React.useEffect(() => {
    if (!didInitModeRef.current) {
      setMode(defaultMode);
      didInitModeRef.current = true;
    }
  }, [defaultMode]);

  // When switching to the "login" segment, attempt to prefill last used account
  React.useEffect(() => {
    let cancelled = false;
    const enteringLogin = mode === 'login' && prevModeRef.current !== 'login';
    if (enteringLogin && passkeyManager) {
      (async () => {
        try {
          const { lastUsedAccountId } = await passkeyManager.getRecentLogins();
          if (!cancelled && lastUsedAccountId) {
            const username = (lastUsedAccountId.nearAccountId || '').split('.')[0] || '';
            // Only populate if empty on entry to login segment
            if (!currentValue || currentValue.trim().length === 0) {
              setCurrentValue(username);
              prefilledFromIdbRef.current = true;
              prefilledValueRef.current = username;
            }
          }
        } catch {
          // Silently ignore if IndexedDB is unavailable
        }
      })();
    }
    prevModeRef.current = mode;
    return () => { cancelled = true; };
  }, [mode, passkeyManager]);

  // Colors are read from CSS variables in stylesheet

  const onArrowClick = () => {
    if (!canProceed) return;
    setWaiting(true);
    if (mode === 'sync') {
      onRecoverAccount?.();
    } else if (mode === 'login') {
      onLogin?.();
    } else {
      onRegister?.();
    }
  };

  const onResetToStart = () => {
    setWaiting(false);
    setMode(defaultMode);
    setCurrentValue('');
  };

  // Slightly darker than before for clearer contrast
  const segActiveBg = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)';

  // Inline status message handled by AccountExistsBadge component

  return (
    <div
      className={`w3a-signup-menu-root${className ? ` ${className}` : ''}`}
      data-mode={mode}
      data-waiting={waiting ? 'true' : 'false'}
      style={style}
    >
      {/* Back button (only during waiting screen) */}
      <button
        aria-label="Back"
        onClick={onResetToStart}
        className={`w3a-back-button${waiting ? ' is-visible' : ''}`}
      >
        <ArrowLeft size={18} strokeWidth={2.25} style={{ display: 'block' }} />
      </button>

      <div className="w3a-header">
        {!waiting && (
          <div>
            <div className="w3a-title">{title}</div>
            <div className="w3a-subhead">Fast, passwordless sign‑in</div>
          </div>
        )}
      </div>

      {/* Content switcher */}
      <ContentSwitcher waiting={waiting}>

        {/* Social providers row (optional) */}
        <SocialProviders providers={socialLogin} />

        {/* Passkey row */}
        <PasskeyInput
          value={currentValue}
          onChange={(val) => {
            // If user changes away from the prefilled value, it's no longer considered prefilled
            if (val !== prefilledValueRef.current) {
              prefilledFromIdbRef.current = false;
            }
            setCurrentValue(val);
          }}
          placeholder={'Enter your username'}
          postfixText={postfixTextResolved}
          isUsingExistingAccount={isUsingExistingAccountResolved}
          canProceed={canProceed}
          onProceed={onArrowClick}
          variant="both"
          primaryLabel={mode === 'login' ? 'Login' : mode === 'sync' ? 'Recover account' : 'Register'}
          mode={mode}
          secure={secure}
        />


        {/* Segmented control: Register | Login */}
        <SegmentedControl
          mode={mode}
          onChange={(nextMode) => {
            if (mode === 'login' && nextMode !== 'login') {
              // Clear only if the value was auto-prefilled and remains unchanged
              if (prefilledFromIdbRef.current && currentValue === prefilledValueRef.current) {
                setCurrentValue('');
              }
              prefilledFromIdbRef.current = false;
              prefilledValueRef.current = '';
            }
            setMode(nextMode);
          }}
          activeBg={segActiveBg}
        />

        {/* Help copy under segments */}
        <div className="w3a-seg-help-row">
          <div className="w3a-seg-help" aria-live="polite">
            {mode === 'login' && 'Sign in with your passkey on this device.'}
            {mode === 'register' && 'Create a new passkey account.'}
            {mode === 'sync' && 'Recover or link an existing account.'}
          </div>
        </div>

        {/* QR Code section */}
        {showQRCodeSection && (
          <>
            <div className="w3a-section-divider">
              <span className="w3a-section-divider-text">Already have an account?</span>
            </div>
            <ShowQRCode />
          </>
        )}
      </ContentSwitcher>

    </div>
  );
};

export const PasskeyAuthMenu: React.FC<SignupMenuProps> = (props) => (
  <ThemeScope>
    <SignupMenuInner {...props} />
  </ThemeScope>
);

export default PasskeyAuthMenu;
