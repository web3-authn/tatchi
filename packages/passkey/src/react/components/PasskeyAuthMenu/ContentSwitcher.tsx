import React from 'react';

export interface ContentSwitcherProps {
  waiting: boolean;
  waitingText?: string;
  children: React.ReactNode;
}

export const ContentSwitcher: React.FC<ContentSwitcherProps> = ({ waiting, waitingText = 'Waiting for Passkey…', children }) => {
  return (
    <>
      <div className="w3a-content" aria-hidden={waiting}>
        {children}
      </div>
      <div className="w3a-waiting">
        <div className="w3a-waiting-text">{waitingText}</div>
        <div aria-label="Loading" className="w3a-spinner" />
      </div>
    </>
  );
};

export default ContentSwitcher;

