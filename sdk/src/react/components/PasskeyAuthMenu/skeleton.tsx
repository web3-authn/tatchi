import React from 'react';
import './PasskeyAuthMenu.css';
import { PasskeyAuthMenuThemeScope } from './themeScope';
import { useTheme } from '../theme';

export interface PasskeyAuthMenuSkeletonProps {
  className?: string;
  style?: React.CSSProperties;
}

export const PasskeyAuthMenuSkeletonInner = React.forwardRef<
  HTMLDivElement,
  PasskeyAuthMenuSkeletonProps
>(({ className, style }, ref) => {
  return (
    <div
      ref={ref}
      className={`w3a-signup-menu-root w3a-skeleton${className ? ` ${className}` : ''}`}
      style={style}
    >
      <div className="w3a-header">
        <div
          className="w3a-skeleton-block w3a-title-skeleton"
          style={{ width: '60%', height: '24px', marginBottom: '8px' }}
        />
        <div
          className="w3a-skeleton-block w3a-subtitle-skeleton"
          style={{ width: '80%', height: '16px' }}
        />
      </div>

      <div className="w3a-passkey-row">
        <div className="w3a-input-pill w3a-skeleton-input">
          <div
            className="w3a-skeleton-block"
            style={{ width: '40%', height: '18px', marginLeft: '12px' }}
          />
        </div>
      </div>

      <div className="w3a-segmented-root">
        <div className="w3a-seg-track">
          <div className="w3a-seg-button">Register</div>
          <div className="w3a-seg-button">Login</div>
          <div className="w3a-seg-button">Sync</div>
        </div>
      </div>

      <div className="w3a-seg-help-row">
        <div
          className="w3a-skeleton-block"
          style={{ width: '50%', height: '14px', margin: '0 auto' }}
        />
      </div>

      <div className="w3a-scan-device-row">
        <div className="w3a-section-divider">
          <div className="w3a-section-divider-text">Already have an account?</div>
        </div>
        <div className="w3a-secondary-actions">
          <button className="w3a-link-device-btn" disabled>
            <div
              className="w3a-skeleton-block"
              style={{
                width: '18px',
                height: '18px',
                marginRight: '8px',
                borderRadius: '4px',
              }}
            />
            Scan and Link Device
          </button>
          <button className="w3a-link-device-btn" disabled>
            <div
              className="w3a-skeleton-block"
              style={{
                width: '18px',
                height: '18px',
                marginRight: '8px',
                borderRadius: '9999px',
              }}
            />
            Recover Account with Email
          </button>
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
