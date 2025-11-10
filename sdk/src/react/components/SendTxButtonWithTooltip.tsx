import React, {
  useState,
  useEffect,
  useMemo,
  isValidElement,
  cloneElement,
  useRef,
} from 'react';
import { createComponent } from '@lit/react';
import {
  TooltipPosition,
  TooltipPositionInternal
} from '@/core/WebAuthnManager/LitComponents/IframeButtonWithTooltipConfirmer/iframe-geometry';
import type { ThemeName } from '@/core/WebAuthnManager/LitComponents/confirm-ui-types';
import { IframeButtonHost } from '@/core/WebAuthnManager/LitComponents/IframeButtonWithTooltipConfirmer';
import { W3A_TX_BUTTON_ID } from '@/core/WebAuthnManager/LitComponents/tags';
import type { SendTxButtonWithTooltipBaseProps } from '../types';
import { useTatchiContext } from '../context';
import { useTheme } from './theme';
import TouchIcon from './ProfileSettingsButton/icons/TouchIcon';
import { TransactionInput } from '@/core/types/actions';
import type { EventCallback, ActionSSEEvent } from '@/core/types/passkeyManager';


export const TouchIdWithText: React.FC<{ buttonText?: string; loading?: boolean }> = ({
  buttonText = 'Send Transaction',
  loading = false,
}) => (
  <span style={{
    display: 'inline-flex',
    alignItems: 'center',
    fontSize: '0.9rem',
   }}
  >
    <div style={{
      borderRadius: '50%',
      position: 'relative',
      width: 22,
      height: 22,
      marginRight: 4,
    }}>
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

export interface SendTxButtonWithTooltipProps extends SendTxButtonWithTooltipBaseProps {
  color?: string;
  buttonStyle?: React.CSSProperties;
  buttonHoverStyle?: React.CSSProperties;
  /** Content shown inside the button; can be text or any element */
  buttonTextElement?: React.ReactNode;
  tooltipPosition?: TooltipPosition;
  txTreeTheme?: ThemeName;
  lockTheme?: boolean;
}

/**
 * React wrapper around the Lit `w3a-tx-button` component.
 * Much cleaner implementation that delegates iframe management to Lit.
 */
export const SendTxButtonWithTooltip: React.FC<SendTxButtonWithTooltipProps> = ({
  nearAccountId,
  txSigningRequests,
  options,
  // Behavioral props
  onCancel,
  onEvent,
  onSuccess,
  onLoadTouchIdPrompt,
  // Optional customizations
  color,
  buttonStyle,
  buttonHoverStyle,
  buttonTextElement = <TouchIdWithText />,
  tooltipPosition = {
    width: 'min(330px, calc(var(--w3a-vw, 100vw) - 1rem))',
    height: 'auto',
    position: 'top-center',
  },
  txTreeTheme = 'dark',
  lockTheme = false,
}) => {

  useWarnDuplicateHooks({ onEventProp: onEvent, optionsOnEvent: options?.onEvent });

  const { tatchi } = useTatchiContext();
  // Provide external confirm handler when using TatchiPasskeyIframe (no local context)
  const externalConfirm = useMemo(() => {
    // Always route via the manager's API; TatchiPasskeyIframe proxies to wallet-origin.
    return async ({ nearAccountId, txSigningRequests, options }: {
      nearAccountId: string;
      txSigningRequests: TransactionInput[];
      options?: any;
    }) => {
      return await tatchi.signAndSendTransactions({
        nearAccountId,
        transactions: txSigningRequests,
        options,
      });
    };
  }, [tatchi]);

  const [currentTheme, setCurrentTheme] = useState<ThemeName>(txTreeTheme);
  const [loadingTouchIdPrompt, setLoadingTouchIdPrompt] = useState(false);

  // Uncontrolled mode: drive theme from the shared Theme context
  const { theme } = useTheme();
  useEffect(() => {
    if (lockTheme) return;
    setCurrentTheme((theme as ThemeName) || 'dark');
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
    // If a tooltipPosition is provided without a width, use a sensible default.
    width: tooltipPosition?.width ?? 'min(330px, calc(var(--w3a-vw, 100vw) - 1rem))',
    height: tooltipPosition.height,
    position: tooltipPosition.position,
    offset: '6px',
    boxPadding: '6px',
  }), [
    // Use optional chaining in deps to account for runtime undefineds
    tooltipPosition?.width,
    tooltipPosition?.height,
    tooltipPosition?.position,
  ]);
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
        try { void tatchi.prefetchBlockheight(); } catch {}
      }}
      onFocus={() => {
        // Also prefetch on keyboard focus
        try { void tatchi.prefetchBlockheight(); } catch {}
      }}
      // sendAndSignTransaction args
      nearAccountId={nearAccountId}
      txSigningRequests={txSigningRequests}
      // hooks
      options={{
        afterCall: options?.afterCall,
        onError: options?.onError,
        // Prefer explicit onEvent prop if provided, else fall back to options.onEvent
        onEvent: onEvent ?? options?.onEvent,
        waitUntil: options?.waitUntil,
        executionWait: options?.executionWait,
        // Plumb per-call confirmation override (e.g., force drawer)
        confirmationConfig: options?.confirmationConfig,
      }}
      onCancel={onCancel}
      onSuccess={onSuccess}
      onLoadTouchIdPrompt={handleLoadTouchIdPrompt}
      // styles to pass to Lit component: IframeButtonHost.ts
      color={color}
      buttonStyle={toStyleRecord(buttonStyle)}
      buttonHoverStyle={toStyleRecord(buttonHoverStyle)}
      tooltipPosition={internalTooltipPosition}
      txTreeTheme={currentTheme}
      externalConfirm={externalConfirm}
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

/**
 * Warns when duplicate hooks are provided to SendTxButtonWithTooltip.
 * Specifically checks for both top-level `onEvent` prop and `options.onEvent`.
 * The component prioritizes the top-level prop and ignores `options.onEvent`.
 */
function useWarnDuplicateHooks({
  onEventProp,
  optionsOnEvent,
}: {
  onEventProp?: EventCallback<ActionSSEEvent>;
  optionsOnEvent?: EventCallback<ActionSSEEvent>;
}) {
  const warnedRef = useRef(false);
  useEffect(() => {
    const bothProvided = Boolean(onEventProp) && Boolean(optionsOnEvent);
    if (bothProvided && !warnedRef.current) {
      console.warn(
        '[SendTxButtonWithTooltip] Both onEvent (top-level prop) and options.onEvent are provided. The top-level onEvent takes precedence; options.onEvent will be ignored. Pass only one to avoid confusion.'
      );
      warnedRef.current = true;
    }
    if (!bothProvided) {
      warnedRef.current = false;
    }
  }, [onEventProp, optionsOnEvent]);
}

export default SendTxButtonWithTooltip;
