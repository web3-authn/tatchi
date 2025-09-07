import React from 'react';
import { SignupMode } from './index';
import { useTheme } from '../theme';

export interface AccountExistsBadgeProps {
  /** Whether the account domain/postfix corresponds to an existing account */
  isUsingExistingAccount?: boolean;
  /** Current signup mode */
  mode: SignupMode;
  /** Whether the current context is secure (HTTPS) */
  secure: boolean;
}

/**
 * AccountExistsBadge component displays status messages for account existence and security requirements
 */
export const AccountExistsBadge: React.FC<AccountExistsBadgeProps> = ({
  isUsingExistingAccount,
  mode,
  secure,
}) => {
  const { tokens } = useTheme();

  const getStatusMessage = () => {
    if (isUsingExistingAccount && mode === 'register') {
      return 'Account taken!';
    }

    if (mode === 'register' && !secure) {
      return 'HTTPS required for registration';
    }

    return '\u00A0'; // Non-breaking space
  };

  const statusMessage = getStatusMessage();

  return (
    <div className="w3a-status-row">
      <div
        className="w3a-status-message"
        style={{ color: statusMessage.trim() ? tokens.colors.textSecondary : 'transparent' }}
      >
        {statusMessage}
      </div>
    </div>
  );
};

export default AccountExistsBadge;
