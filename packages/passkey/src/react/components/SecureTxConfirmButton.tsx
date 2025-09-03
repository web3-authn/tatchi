import React, { useState, useEffect, useMemo } from 'react';
import type { SecureTxConfirmButtonProps } from '../types';
import { usePasskeyContext } from '../context';
import { TooltipPosition, TooltipPositionInternal } from '@/core/WebAuthnManager/LitComponents/IframeButtonWithTooltipConfirmer/iframe-geometry';
import type { EmbeddedTxButtonTheme } from '@/core/WebAuthnManager/LitComponents/IframeButtonWithTooltipConfirmer/embedded-tx-button-themes';
import { createComponent } from '@lit/react';
import { IframeButtonHost } from '@/core/WebAuthnManager/LitComponents/IframeButtonWithTooltipConfirmer';

/**
 * Converts a React CSSProperties object to a Record<string, string | number> for Lit components
 * @param style
 * @returns
 */
export const toStyleRecord = (style?: React.CSSProperties): Record<string, string | number> | undefined => {
  if (!style) return undefined;
  const out: Record<string, string | number> = {};
  Object.keys(style).forEach((k) => {
    const v = (style as any)[k];
    if (v !== undefined && v !== null) out[k] = v as any;
  });
  return out;
};


/**
 * React wrapper around the Lit `iframe-button` component.
 * Much cleaner implementation that delegates iframe management to Lit.
 */
export const SecureTxConfirmButton: React.FC<SecureTxConfirmButtonProps & {
  color?: string;
  buttonStyle?: React.CSSProperties;
  buttonHoverStyle?: React.CSSProperties;
  /** Content shown inside the button; can be text or any element */
  buttonTextElement?: React.ReactNode;
  tooltipPosition?: TooltipPosition;
  tooltipTheme?: EmbeddedTxButtonTheme;
  lockTheme?: boolean;
}> = ({
  nearAccountId,
  txSigningRequests,
  options,
  // Optional customizations
  color = '#667eea',
  buttonStyle,
  buttonHoverStyle,
  buttonTextElement,
  tooltipPosition = {
    width: '360px',
    height: 'auto',
    position: 'top-center',
  },
  tooltipTheme = 'dark',
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
  const [currentTheme, setCurrentTheme] = useState<EmbeddedTxButtonTheme>(tooltipTheme);

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

  // Controlled mode: sync with tooltipTheme prop changes
  useEffect(() => {
    if (lockTheme) setCurrentTheme(tooltipTheme);
  }, [tooltipTheme, lockTheme]);

  // Inline Lit wrapper creation
  const RawIframeButton = useMemo(() => createComponent({
    react: React,
    tagName: 'iframe-button',
    elementClass: IframeButtonHost,
    events: {}
  }), []);

  const internalTooltipPosition: TooltipPositionInternal = useMemo(() => ({
    width: tooltipPosition.width,
    height: tooltipPosition.height,
    position: tooltipPosition.position,
    offset: '6px',
    boxPadding: '5px',
  }), [tooltipPosition.width, tooltipPosition.height, tooltipPosition.position]);
  // NOTE: ensure offset >= boxPadding or tooltip's padding overlaps the button and makes
  // it harder to click in some areas of the button.
  // boxPadding is padding to ensure the tooltip has space for it's shadow

  return (
    <RawIframeButton
      nearAccountId={nearAccountId}
      txSigningRequests={txSigningRequests}
      color={color}
      buttonStyle={toStyleRecord(buttonStyle)}
      buttonHoverStyle={toStyleRecord(buttonHoverStyle)}
      tooltipPosition={internalTooltipPosition}
      tooltipTheme={currentTheme}
      showLoading={!!showLoading}
      options={options}
      passkeyManagerContext={passkeyManagerContext}
      onSuccess={onSuccess}
      onError={onError}
      onCancel={onCancel}
    >
      {buttonTextElement}
    </RawIframeButton>
  );
};

export default SecureTxConfirmButton;
