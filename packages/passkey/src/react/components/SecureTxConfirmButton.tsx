import React, { useState, useEffect, useMemo } from 'react';
import type { SecureTxConfirmButtonProps } from '../types';
import { usePasskeyContext } from '../context';
import { TooltipPosition } from '@/core/WebAuthnManager/LitComponents/IframeButtonWithTooltipConfirmer/iframe-geometry';
import type { EmbeddedTxButtonTheme } from '@/core/WebAuthnManager/LitComponents/IframeButtonWithTooltipConfirmer/embedded-tx-button-themes';
import { IframeButtonWithTooltip } from '../lit-wrappers/IframeButtonWithTooltip';

/**
 * React wrapper around the Lit `iframe-button` component.
 * Much cleaner implementation that delegates iframe management to Lit.
 */
export const SecureTxConfirmButton: React.FC<SecureTxConfirmButtonProps & {
  color?: string;
  buttonStyle?: React.CSSProperties;
  buttonHoverStyle?: React.CSSProperties;
  tooltipPosition?: TooltipPosition;
  theme?: EmbeddedTxButtonTheme;
  lockTheme?: boolean;
}> = ({
  nearAccountId,
  txSigningRequests,
  options,
  // Optional customizations
  color = '#667eea',
  buttonStyle,
  buttonHoverStyle,
  tooltipPosition = {
    width: '360px',
    height: 'auto',
    position: 'top-center',
    offset: '8px'
  },
  theme = 'dark',
  lockTheme = false,
  // Behavioral props
  onCancel,
  onSuccess,
  onError,
  showLoading,
}) => {

  const { passkeyManager } = usePasskeyContext();
  // Memoize passkey context for stable prop identity
  const passkeyManagerContext = useMemo(() => passkeyManager.getContext(), [passkeyManager]);
  const [currentTheme, setCurrentTheme] = useState<EmbeddedTxButtonTheme>(theme);

  // Uncontrolled mode: listen to user preference changes
  useEffect(() => {
    if (lockTheme) return;
    const handleThemeChange = (newTheme: 'dark' | 'light') => {
      setCurrentTheme(newTheme as EmbeddedTxButtonTheme);
    };
    // Subscribe to theme changes
    const unsubscribe = passkeyManager.userPreferences.onThemeChange(handleThemeChange);
    handleThemeChange(passkeyManager.userPreferences.getUserTheme());
    return () => unsubscribe();
  }, [passkeyManager, lockTheme]);

  // Controlled mode: sync with theme prop changes
  useEffect(() => {
    if (lockTheme) setCurrentTheme(theme);
  }, [theme, lockTheme]);

  return (
    <IframeButtonWithTooltip
      nearAccountId={nearAccountId}
      txSigningRequests={txSigningRequests}
      color={color}
      buttonStyle={buttonStyle}
      buttonHoverStyle={buttonHoverStyle}
      tooltipPosition={tooltipPosition}
      theme={currentTheme}
      showLoading={!!showLoading}
      options={options}
      passkeyManagerContext={passkeyManagerContext}
      onSuccess={onSuccess}
      onError={onError}
      onCancel={onCancel}
    />
  );
};

export default SecureTxConfirmButton;
