import React, { useEffect, useMemo, useRef, useState } from 'react';
import { usePasskeyContext } from '@/react/context';
import { TransactionInput } from '../../core/types';
import type { PasskeyManagerConfigs, ActionResult } from '@/core/types/passkeyManager';
import { isObject, isString, isFiniteNumber } from '@/core/WalletIframe/validation';

export interface WalletIframeTxButtonHostProps {
  nearAccountId: string;
  transactions: Array<TransactionInput>;
  text?: string;
  theme?: 'dark' | 'light';
  width?: number | string;
  height?: number | string;
  className?: string;
  style?: React.CSSProperties;
  buttonStyle: Record<string, string> | CSSStyleDeclaration;
  buttonHoverStyle: Record<string, string> | CSSStyleDeclaration;
  tooltipPosition: Record<string, string>,
  onSuccess?: (result: ActionResult[]) => void;
  onCancel?: () => void;
  onError?: (error: Error) => void;
}

/**
 * WalletTxButtonHost
 *
 * Mounts a tx-confirm button inside the wallet iframe document and wires result
 * messages back to the parent app. The button is rendered inline in the wallet
 * iframe (no nested iframe), enabling invokedFrom='wallet-iframe' and allowing
 * confirmationConfig to be respected across origins (embedded/skip without modal).
 */
export function WalletIframeTxButtonHost({
  nearAccountId,
  transactions,
  text = 'Send Transaction',
  theme = 'dark',
  width = 200,
  height = 48,
  className,
  style,
  onSuccess,
  onCancel,
  onError,
}: WalletIframeTxButtonHostProps) {

  const ctx = usePasskeyContext();
  const pmConfigs: PasskeyManagerConfigs | undefined = ctx?.passkeyManager?.configs;
  const walletOrigin = pmConfigs?.iframeWallet?.walletOrigin;
  const walletServicePath = pmConfigs?.iframeWallet?.walletServicePath;

  const config = useMemo(() => {
    const fallbackOrigin = (() => {
      try {
        return typeof window !== 'undefined' ? window.location.origin : null;
      } catch {
        return null;
      }
    })();

    const originCandidate = walletOrigin || fallbackOrigin;
    if (!originCandidate) {
      return {
        iframeSrc: null,
        allowOrigin: null,
        warning: null,
        error: '[WalletIframeTxButtonHost] Unable to resolve wallet origin. Provide iframeWallet.walletOrigin or ensure window.location.origin is available.',
      } as const;
    }

    let originUrl: URL;
    try {
      originUrl = new URL(originCandidate);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        iframeSrc: null,
        allowOrigin: null,
        warning: null,
        error: `[WalletIframeTxButtonHost] Invalid wallet origin: ${message}`,
      } as const;
    }

    let warning: string | null = null;
    if (!walletOrigin) {
      warning = '[WalletIframeTxButtonHost] iframeWallet.walletOrigin is not configured. Falling back to the host origin reduces isolation.';
    } else if (fallbackOrigin && originUrl.origin === fallbackOrigin) {
      warning = '[WalletIframeTxButtonHost] iframeWallet.walletOrigin matches the host origin. Wallet iframe isolation is reduced.';
    }

    try {
      const path = walletServicePath || '/service';
      const iframeSrc = new URL(path, originUrl).href;
      return {
        iframeSrc,
        allowOrigin: originUrl.origin,
        warning,
        error: null,
      } as const;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        iframeSrc: null,
        allowOrigin: originUrl.origin,
        warning,
        error: `[WalletIframeTxButtonHost] Failed to construct iframe URL: ${message}`,
      } as const;
    }
  }, [walletOrigin, walletServicePath]);

  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [ready, setReady] = useState(false);
  const idRef = useRef<string>(`w3a-tx-host-${Math.random().toString(36).slice(2)}`);

  useEffect(() => {
    const onMessage = (evt: MessageEvent) => {
      const data = evt.data as unknown;
      const type = isObject(data) && isString((data as any).type) ? (data as any).type : undefined;
      const payload = isObject(data) && isObject((data as any).payload) ? (data as any).payload : undefined;
      if (type === 'SERVICE_HOST_BOOTED') {
        setReady(true);
      } else if (type === 'TX_BUTTON_RESULT') {
        const ok = isObject(payload) ? (payload.ok as boolean | undefined) : undefined;
        const id = isObject(payload) ? (payload.id as string | undefined) : undefined;
        if (id && id !== idRef.current) return;
        if (ok) {
          const result = (payload as { result?: ActionResult[] }).result;
          if (result) onSuccess?.(result);
        } else if (isObject(payload) && (payload as { cancelled?: boolean }).cancelled) {
          onCancel?.();
        } else if (isObject(payload)) {
          const msg = (payload as { error?: string }).error || 'Tx button action failed';
          onError?.(new Error(msg));
        }
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [onCancel, onError, onSuccess]);

  useEffect(() => {
    if (config.error || !config.iframeSrc) return;
    const w = iframeRef.current?.contentWindow;
    if (!w || !ready) return;
    w.postMessage({ type: 'WALLET_SET_CONFIG', payload: pmConfigs }, '*');
    w.postMessage({
      type: 'WALLET_UI_MOUNT',
      payload: {
        key: 'w3a-tx-button-host',
        id: idRef.current,
        props: {
          nearAccountId,
          transactions,
          text,
          theme,
          className,
          buttonStyle: style,
        }
      }
    }, '*');
    return () => {
      w?.postMessage({ type: 'WALLET_UI_UNMOUNT', payload: { id: idRef.current } }, '*');
    };
  }, [className, nearAccountId, pmConfigs, ready, style, text, theme, transactions]);

  // Convert number|string to CSS length string, adding px for finite numbers
  const toCssSize = (v?: number | string): string | undefined => {
    if (v == null) return undefined;
    if (isFiniteNumber(v)) return `${v}px`;
    const s = String(v).trim();
    return s || undefined;
  };
  useEffect(() => {
    if (config.warning) {
      console.warn(config.warning);
    }
  }, [config.warning]);

  const w = toCssSize(width);
  const h = toCssSize(height);

  if (config.error) {
    console.error(config.error);
    return null;
  }

  if (!config.iframeSrc) {
    return null;
  }

  const allowAttr = config.allowOrigin
    ? `publickey-credentials-create 'self' ${config.allowOrigin}; publickey-credentials-get 'self' ${config.allowOrigin}; clipboard-read; clipboard-write`
    : "publickey-credentials-create 'self'; publickey-credentials-get 'self'; clipboard-read; clipboard-write";

  return (
    <iframe
      ref={iframeRef}
      title="wallet-tx-button-host"
      className={className}
      style={{ border: 'none', width: w, height: h, ...style }}
      src={config.iframeSrc}
      sandbox="allow-scripts allow-same-origin"
      allow={allowAttr}
    />
  );
}

export default WalletIframeTxButtonHost;
