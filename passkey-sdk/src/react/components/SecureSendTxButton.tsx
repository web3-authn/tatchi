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
import type { EmbeddedTxButtonTheme } from '@/core/WebAuthnManager/LitComponents/IframeButtonWithTooltipConfirmer/button-with-tooltip-themes';
import { IframeButtonHost } from '@/core/WebAuthnManager/LitComponents/IframeButtonWithTooltipConfirmer';
import { W3A_TX_BUTTON_ID } from '@/core/WebAuthnManager/LitComponents/tags';
import type { SecureSendTxButtonProps } from '../types';
import { usePasskeyContext } from '../context';
import { useTheme } from './theme';
import TouchIcon from './ProfileSettingsButton/TouchIcon';
import { TransactionInput } from '@/core/types/actions';


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
  txTreeTheme?: EmbeddedTxButtonTheme;
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
  txTreeTheme = 'dark',
  lockTheme = false,
}) => {

  const { passkeyManager } = usePasskeyContext();
  // Provide external confirm handler when using PasskeyManagerIframe (no local context)
  const externalConfirm = useMemo(() => {
    // Always route via the manager's API; PasskeyManagerIframe proxies to wallet-origin.
    return async ({ nearAccountId, txSigningRequests, options }: {
      nearAccountId: string;
      txSigningRequests: TransactionInput[];
      options?: any;
    }) => {
      return await passkeyManager.signAndSendTransactions({
        nearAccountId,
        transactions: txSigningRequests,
        options,
      });
    };
  }, [passkeyManager]);

  const [currentTheme, setCurrentTheme] = useState<EmbeddedTxButtonTheme>(txTreeTheme);
  const [loadingTouchIdPrompt, setLoadingTouchIdPrompt] = useState(false);

  // Uncontrolled mode: drive theme from the shared ThemeProvider
  const { theme } = useTheme();
  useEffect(() => {
    if (lockTheme) return;
    setCurrentTheme((theme as EmbeddedTxButtonTheme) || 'dark');
  }, [theme, lockTheme]);

  // Controlled mode: sync with TxTreeTheme prop changes
  useEffect(() => {
    if (lockTheme) setCurrentTheme(txTreeTheme);
  }, [txTreeTheme, lockTheme]);

  // Inline Lit wrapper creation
  const RawIframeButton = useMemo(() => createComponent({
    react: React,
    tagName: W3A_TX_BUTTON_ID,
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
      onMouseEnter={() => {
        // Warm up block height/hash (and nonce if missing) on hover
        // Fire-and-forget to avoid blocking UI thread
        try { void passkeyManager.prefetchBlockheight(); } catch {}
      }}
      onFocus={() => {
        // Also prefetch on keyboard focus
        try { void passkeyManager.prefetchBlockheight(); } catch {}
      }}
      // sendAndSignTransaction args
      nearAccountId={nearAccountId}
      txSigningRequests={txSigningRequests}
      // hooks
      options={{
        beforeCall: options?.beforeCall,
        afterCall: options?.afterCall,
        onError: options?.onError,
        onEvent: options?.onEvent,
        waitUntil: options?.waitUntil,
        executionWait: options?.executionWait
      }}
      onSuccess={onSuccess}
      onCancel={onCancel}
      onLoadTouchIdPrompt={handleLoadTouchIdPrompt}
      // styles to pass to Lit component: IframeButtonHost.ts
      color={color}
      buttonStyle={toStyleRecord(buttonStyle)}
      buttonHoverStyle={toStyleRecord(buttonHoverStyle)}
      tooltipPosition={internalTooltipPosition}
      txTreeTheme={currentTheme}
      externalConfirm={externalConfirm as any}
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
