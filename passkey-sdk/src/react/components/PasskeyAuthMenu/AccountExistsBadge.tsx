import React from 'react';
import { AuthMenuMode } from './index';
import { useTheme } from '../theme';

export interface AccountExistsBadgeProps {
  /** Whether the account domain/postfix corresponds to an existing account */
  isUsingExistingAccount?: boolean;
  /** Current signup mode */
  mode: AuthMenuMode;
  /** Whether the current context is secure (HTTPS) */
  secure?: boolean;
  /** Optional extra class name for message styling/location */
  className?: string;
  /** Optional id for aria-describedby */
  id?: string;
}

/**
 * AccountExistsBadge renders a small inline status message with tone classes.
 */
export const AccountExistsBadge: React.FC<AccountExistsBadgeProps> = ({
  isUsingExistingAccount,
  mode,
  secure = true,
  className,
  id,
}) => {
  // Ensure theme variables applied (not directly used)
  useTheme();

  type Tone = 'error' | 'success' | 'neutral';
  const getStatus = (): { message: string; tone: Tone } => {
    if (mode === 'register') {
      if (!secure) return { message: 'HTTPS required', tone: 'error' };
      if (isUsingExistingAccount) return { message: 'name taken', tone: 'error' };
      return { message: '', tone: 'neutral' };
    }
    if (mode === 'login') {
      if (isUsingExistingAccount) return { message: '', tone: 'success' };
      return { message: 'Account not found', tone: 'error' };
    }
    if (mode === 'recover') {
      if (isUsingExistingAccount) return { message: '', tone: 'success' };
      return { message: '', tone: 'neutral' };
    }
    return { message: '', tone: 'neutral' };
  };

  const { message, tone } = getStatus();
  const hasContent = message && message.trim().length > 0;
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    if (!hasContent) {
      setVisible(false);
      return;
    }
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 2000);
    return () => clearTimeout(t);
  }, [hasContent, message]);

  if (!hasContent) {
    return <></>;
  }

  const toneClass = tone === 'error'
    ? 'is-error'
    : tone === 'success'
      ? 'is-success'
      : '';

  const classes = [
    'w3a-tooltip',
    toneClass,
    visible ? 'is-visible' : '', className
  ].filter(Boolean).join(' ');

  return (
    <div id={id} className={classes} role="status" aria-live="polite">
      {message}
    </div>
  );
};

export default AccountExistsBadge;
