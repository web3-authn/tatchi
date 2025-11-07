
import React from 'react';
import TouchIcon from './icons/TouchIcon';
import type { UserAccountButtonProps } from './types';

export const UserAccountButton: React.FC<UserAccountButtonProps> = ({
  username,
  hideUsername,
  fullAccountId,
  nearExplorerBaseUrl,
  isOpen,
  onClick,
  onMouseEnter,
  onMouseLeave,
  theme = 'dark',
  menuId,
  triggerId,
}) => {
  const onKeyDown: React.KeyboardEventHandler<HTMLDivElement> = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick();
    }
  };
  const hideWhenClosed = (hideUsername && !isOpen);
  return (
    <div className={`w3a-user-account-button-root ${theme}`}>
      <div
        id={triggerId}
        className={`w3a-user-account-button-trigger ${hideWhenClosed ? 'hide-username' : ''} ${isOpen ? 'open' : 'closed'}`}
        onClick={onClick}
        role="button"
        tabIndex={0}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        {...(menuId ? { 'aria-controls': menuId } as any : {})}
        onKeyDown={onKeyDown}
        {...(onMouseEnter && { onMouseEnter })}
        {...(onMouseLeave && { onMouseLeave })}
      >
        <div className="w3a-user-account--user-content">
          <div className={`w3a-user-account--avatar ${hideWhenClosed ? 'hide-username' : ''} ${isOpen ? 'expanded' : 'shrunk'}`}>
            <TouchIcon
              className={`w3a-fingerprint-icon ${isOpen ? 'open' : 'closed'}`}
              strokeWidth={1.4}
            />
          </div>
          {
            !hideWhenClosed &&
            <UserAccountId
              username={username}
              fullAccountId={fullAccountId}
              isOpen={isOpen}
              nearExplorerBaseUrl={nearExplorerBaseUrl}
              theme={theme}
            />
          }
        </div>
      </div>
    </div>
  );
};

export const UserAccountId = ({
  username,
  fullAccountId,
  isOpen,
  nearExplorerBaseUrl,
  theme = 'dark'
}: {
  username: string;
  fullAccountId?: string;
  isOpen: boolean;
  nearExplorerBaseUrl?: string;
  theme?: 'dark' | 'light';
}) => {
  // Use the full account ID if provided, otherwise fall back to constructed version
  const displayAccountId = fullAccountId || `${username}`;

  return (
    <div className="w3a-user-account--user-details">
      <p className="w3a-user-account--username">
        {username || 'User'}
      </p>
      <a
        href={username ? `${nearExplorerBaseUrl}/address/${displayAccountId}` : '#'}
        target="_blank"
        rel="noopener noreferrer"
        className={`w3a-user-account--account-id ${isOpen ? 'visible' : 'hidden'}`}
        onClick={(e) => e.stopPropagation()}
      >
        {displayAccountId || 'user@example.com'}
      </a>
    </div>
  );
};
