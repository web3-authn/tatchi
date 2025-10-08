import React from 'react';

export interface ContentSwitcherProps {
  waiting: boolean;
  waitingText?: string;
  showScanDevice?: boolean;
  showQRCodeElement?: React.ReactNode;
  children: React.ReactNode;
  backButton?: React.ReactNode;
}

export const ContentSwitcher: React.FC<ContentSwitcherProps> = ({
  waiting,
  waitingText = 'Waiting for Passkey…',
  showScanDevice = false,
  showQRCodeElement,
  children,
  backButton,
}) => {
  return (
    <div className="w3a-content-switcher">
      {/* Back button - absolutely positioned overlay */}
      {backButton}

      {/* Content areas - conditionally rendered with smooth transitions */}
      <div className="w3a-content-area">
        {waiting && (
          <div className="w3a-waiting">
            <div className="w3a-waiting-text">{waitingText}</div>
            <div aria-label="Loading" className="w3a-spinner" />
          </div>
        )}

        {showScanDevice && (
          <div className="w3a-scan-device-content">
            {showQRCodeElement}
          </div>
        )}

        {!waiting && !showScanDevice && (
          <div className="w3a-signin-menu">
            {children}
          </div>
        )}
      </div>
    </div>
  );
};

export default ContentSwitcher;
