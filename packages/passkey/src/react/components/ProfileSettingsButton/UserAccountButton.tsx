
import { Settings } from 'lucide-react';
import TouchIcon from './TouchIcon';
import type { UserAccountButtonProps } from './types';

export const UserAccountButton: React.FC<UserAccountButtonProps> = ({
  username,
  fullAccountId,
  isOpen,
  onClick,
  isHovered,
  onMouseEnter,
  onMouseLeave,
  nearExplorerBaseUrl,
  theme = 'dark',
}) => {
  return (
    <div className={`w3a-user-account-button-root ${theme}`}>
      <div
        className={`w3a-user-account-button-trigger ${isOpen ? 'open' : 'closed'}`}
        onClick={onClick}
        {...(onMouseEnter && { onMouseEnter })}
        {...(onMouseLeave && { onMouseLeave })}
      >
        <div className="w3a-user-account--user-content">
          <div className={`w3a-user-account--avatar ${isOpen ? 'expanded' : 'shrunk'}`}>
            <TouchIcon
              className={`w3a-user-account--gear-icon ${isOpen ? 'open' : 'closed'}`}
              strokeWidth={1.4}
            />
            {/* <Settings
              className={`w3a-user-account--gear-icon ${isOpen ? 'open' : 'closed'}`}
              strokeWidth={1.4}
            /> */}
          </div>
          <UserAccountId
            username={username}
            fullAccountId={fullAccountId}
            isOpen={isOpen}
            nearExplorerBaseUrl={nearExplorerBaseUrl}
            theme={theme}
          />
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