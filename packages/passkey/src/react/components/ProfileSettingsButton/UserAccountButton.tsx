
import { Settings } from 'lucide-react';
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
}) => {
  return (
    <div className="w3a-user-account-button-root">
      <div
        className={`w3a-user-account-button-trigger ${isOpen ? 'open' : 'closed'}`}
        onClick={onClick}
        {...(onMouseEnter && { onMouseEnter })}
        {...(onMouseLeave && { onMouseLeave })}
      >
        <div className="w3a-user-account--user-content">
          <div className={`w3a-user-account--avatar ${isOpen ? 'expanded' : 'shrunk'}`}>
            <Settings
              className={`w3a-user-account--gear-icon ${isOpen ? 'open' : 'closed'}`}
              strokeWidth={1.4}
            />
          </div>
          <UserAccountId
            username={username}
            fullAccountId={fullAccountId}
            isOpen={isOpen}
            nearExplorerBaseUrl={nearExplorerBaseUrl}
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
  nearExplorerBaseUrl
}: {
  username: string;
  fullAccountId?: string;
  isOpen: boolean;
  nearExplorerBaseUrl?: string;
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