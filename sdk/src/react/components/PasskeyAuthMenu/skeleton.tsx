import React from 'react';
import { ArrowLeftIcon, MailIcon } from './ui/icons';
import QRCodeIcon from '../QRCodeIcon';
import { PasskeyAuthMenuThemeScope } from './themeScope';
import { useTheme } from '../theme';
import { getModeTitle } from './controller/mode';
import { AuthMenuMode, type AuthMenuHeadings } from './types';

export interface PasskeyAuthMenuSkeletonProps {
  className?: string;
  style?: React.CSSProperties;
  /** Best-effort to match the hydrated UI default tab. */
  defaultMode?: AuthMenuMode;
  /** Best-effort to match the hydrated UI headings. */
  headings?: AuthMenuHeadings;
}

export const PasskeyAuthMenuSkeletonInner = React.forwardRef<
  HTMLDivElement,
  PasskeyAuthMenuSkeletonProps
>(({ className, style, defaultMode, headings }, ref) => {
  const mode = typeof defaultMode === 'number' ? defaultMode : AuthMenuMode.Register;
  const title = getModeTitle(mode, headings ?? null);
  const placeholder =
    mode === AuthMenuMode.Register
      ? 'Pick a username'
      : mode === AuthMenuMode.Sync
        ? 'Leave blank to discover accounts'
        : 'Enter your username';
  const segHelpText =
    mode === AuthMenuMode.Login
      ? 'Sign in with your passkey'
      : mode === AuthMenuMode.Sync
        ? 'Sync account (iCloud/Chrome sync)'
        : 'Create a new account';
  const segActiveWidth = 'calc((100% - 18px) / 3)';
  const segActiveX =
    mode === AuthMenuMode.Login
      ? `calc(5px + ${segActiveWidth} + 4px)`
      : mode === AuthMenuMode.Sync
        ? `calc(5px + ${segActiveWidth} + 4px + ${segActiveWidth} + 4px)`
        : '5px';

  return (
    <div
      ref={ref}
      className={`w3a-signup-menu-root w3a-skeleton${className ? ` ${className}` : ''}`}
      style={style}
      data-mode={mode}
      data-waiting="false"
      data-scan-device="false"
      data-email-recovery="false"
    >
      <div className="w3a-content-switcher">
        <button aria-label="Back" type="button" className="w3a-back-button" disabled>
          <ArrowLeftIcon size={18} strokeWidth={2.25} style={{ display: 'block' }} />
        </button>

        <div className="w3a-content-area">
          <div className="w3a-content-sizer">
            <div className="w3a-signin-menu">
              <div className="w3a-header">
                <div>
                  <div className="w3a-title">{title.title}</div>
                  <div className="w3a-subhead">{title.subtitle}</div>
                </div>
              </div>

              <div className="w3a-passkey-row">
                <div className="w3a-input-pill">
                  <div className="w3a-input-wrap">
                    <input
                      type="text"
                      name="passkey"
                      disabled
                      placeholder={placeholder}
                      className="w3a-input"
                      aria-disabled="true"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      inputMode="text"
                      style={{ pointerEvents: 'none' }}
                    />
                  </div>
                </div>
                <div style={{ position: 'relative', display: 'inline-block' }}>
                  <button aria-label="Continue" type="button" className="w3a-arrow-btn no-transition" disabled />
                </div>
              </div>

              <div className="w3a-seg">
                <div
                  className="w3a-seg-active"
                  style={{
                    width: segActiveWidth,
                    transform: `translateX(${segActiveX})`,
                    opacity: 0.9,
                    background: 'var(--w3a-passkey-auth-menu2-seg-active-bg)',
                  }}
                />
                <div className="w3a-seg-grid">
                  <button
                    type="button"
                    aria-pressed={mode === AuthMenuMode.Register}
                    className={`w3a-seg-btn${mode === AuthMenuMode.Register ? ' is-active' : ''} register`}
                    disabled
                  >
                    Register
                  </button>
                  <button
                    type="button"
                    aria-pressed={mode === AuthMenuMode.Login}
                    className={`w3a-seg-btn${mode === AuthMenuMode.Login ? ' is-active' : ''} login`}
                    disabled
                  >
                    Login
                  </button>
                  <button
                    type="button"
                    aria-pressed={mode === AuthMenuMode.Sync}
                    className={`w3a-seg-btn${mode === AuthMenuMode.Sync ? ' is-active' : ''} sync`}
                    disabled
                  >
                    Sync
                  </button>
                </div>
              </div>

              <div className="w3a-seg-help-row">
                <div className="w3a-seg-help" aria-live="polite">
                  {segHelpText}
                </div>
              </div>

              <div className="w3a-scan-device-row">
                <div className="w3a-section-divider">
                  <span className="w3a-section-divider-text">Already have an account?</span>
                </div>
                <div className="w3a-secondary-actions">
                  <button className="w3a-link-device-btn" disabled>
                    <QRCodeIcon width={18} height={18} strokeWidth={2} />
                    Scan and Link Device
                  </button>
                  <button className="w3a-link-device-btn" disabled>
                    <MailIcon size={18} strokeWidth={2} style={{ display: 'block' }} />
                    Recover Account with Email
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});
PasskeyAuthMenuSkeletonInner.displayName = 'PasskeyAuthMenuSkeletonInner';

export const PasskeyAuthMenuSkeleton: React.FC<PasskeyAuthMenuSkeletonProps> = (props) => {
  const { theme } = useTheme();
  return (
    <PasskeyAuthMenuThemeScope theme={theme}>
      <PasskeyAuthMenuSkeletonInner {...props} />
    </PasskeyAuthMenuThemeScope>
  );
};

export default PasskeyAuthMenuSkeleton;
