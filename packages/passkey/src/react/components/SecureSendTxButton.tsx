import React, {
  useState,
  useEffect,
  useMemo,
  isValidElement,
  cloneElement
} from 'react';
import { createComponent } from '@lit/react';
import {
  TooltipPosition,
  TooltipPositionInternal
} from '@/core/WebAuthnManager/LitComponents/IframeButtonWithTooltipConfirmer/iframe-geometry';
import type { EmbeddedTxButtonTheme } from '@/core/WebAuthnManager/LitComponents/IframeButtonWithTooltipConfirmer/embedded-tx-button-themes';
import { IframeButtonHost } from '@/core/WebAuthnManager/LitComponents/IframeButtonWithTooltipConfirmer';
import type { SecureSendTxButtonProps } from '../types';
import { usePasskeyContext } from '../context';
import TouchIcon from '../components/ProfileSettingsButton/TouchIcon';


export const TouchIdWithText: React.FC<{ buttonText?: string; loading?: boolean }> = ({
  buttonText = 'Send Transaction',
  loading = false,
}) => (
  <span style={{ display: 'inline-flex', alignItems: 'center' }}>
    <div style={{ borderRadius: '50%', position: 'relative', width: 22, height: 22, marginRight: 4 }}>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'grid', placeItems: 'center',
        transition: 'opacity 160ms ease',
        opacity: loading ? 0 : 1,
      }}>
        <TouchIcon width={22} height={22} strokeWidth={1.6} />
      </div>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'grid', placeItems: 'center',
        transition: 'opacity 160ms ease',
        opacity: loading ? 1 : 0,
      }}>
        {/* SVG spinner using SMIL animateTransform for rotation */}
        <svg width="22" height="22" viewBox="0 0 50 50" aria-hidden focusable="false">
          <circle cx="25" cy="25" r="20" stroke="currentColor" strokeWidth="4" fill="none" opacity="0.25" />
          <path d="M25 5 a20 20 0 0 1 0 40" stroke="currentColor" strokeWidth="4" fill="none">
            <animateTransform attributeName="transform" type="rotate" from="0 25 25" to="360 25 25" dur="0.8s" repeatCount="indefinite" />
          </path>
        </svg>
      </div>
    </div>
    {buttonText}
  </span>
)

/**
 * React wrapper around the Lit `iframe-button` component.
 * Much cleaner implementation that delegates iframe management to Lit.
 */
export const SecureSendTxButton: React.FC<SecureSendTxButtonProps & {
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
  // Behavioral props
  onCancel,
  onSuccess,
  onLoadTouchIdPrompt,
  // Optional customizations
  color,
  buttonStyle,
  buttonHoverStyle,
  buttonTextElement = <TouchIdWithText />,
  tooltipPosition = {
    width: '360px',
    height: 'auto',
    position: 'top-center',
  },
  tooltipTheme = 'dark',
  lockTheme = false,
}) => {

  const { passkeyManager } = usePasskeyContext();
  // Memoize passkey context for stable prop identity
  const passkeyManagerContext = useMemo(() => passkeyManager.getContext(), [passkeyManager]);
  const [currentTheme, setCurrentTheme] = useState<EmbeddedTxButtonTheme>(tooltipTheme);
  const [loadingTouchIdPrompt, setLoadingTouchIdPrompt] = useState(false);

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
    boxPadding: '6px',
  }), [tooltipPosition.width, tooltipPosition.height, tooltipPosition.position]);
  // NOTE: ensure offset >= boxPadding or tooltip's padding overlaps the button and makes
  // it harder to click in some areas of the button.
  // boxPadding is padding to ensure the tooltip has space for it's shadow

  const handleLoadTouchIdPrompt = (loading: boolean) => {
    try { setLoadingTouchIdPrompt(loading); } catch {}
    try { onLoadTouchIdPrompt?.(loading); } catch {}
  };

  const content = useMemo(() => {
    if (buttonTextElement) {
      if (isValidElement(buttonTextElement)) {
        const isDomElement = typeof (buttonTextElement as any).type === 'string';
        return isDomElement
          ? buttonTextElement
          : cloneElement(buttonTextElement as any, { loading: loadingTouchIdPrompt });
      }
      return buttonTextElement;
    }
    return <TouchIdWithText loading={loadingTouchIdPrompt} />;
  }, [buttonTextElement, loadingTouchIdPrompt]);

  return (
    <RawIframeButton
      passkeyManagerContext={passkeyManagerContext}
      // sendAndSignTransaction args
      nearAccountId={nearAccountId}
      txSigningRequests={txSigningRequests}
      // hooks
      options={{
        hooks: options?.hooks,
        onError: options?.onError,
        onEvent: options?.onEvent,
        waitUntil: options?.waitUntil,
        executeSequentially: options?.executeSequentially
      }}
      onSuccess={onSuccess}
      onCancel={onCancel}
      onLoadTouchIdPrompt={handleLoadTouchIdPrompt}
      // styles to pass to Lit component: IframeButtonHost.ts
      color={color}
      buttonStyle={toStyleRecord(buttonStyle)}
      buttonHoverStyle={toStyleRecord(buttonHoverStyle)}
      tooltipPosition={internalTooltipPosition}
      tooltipTheme={currentTheme}
    >
      {content}
    </RawIframeButton>
  );
};

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

export default SecureSendTxButton;
