import React, { useEffect, useMemo, useRef, useState } from 'react';
import { usePasskeyContext } from '@/react/context';
import { TransactionInput } from '../../core/types';
import type { PasskeyManagerConfigs, ActionResult } from '@/core/types/passkeyManager';
import { isRecord, isString, isFiniteNumber } from '@/core/WalletIframe/validation';

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

  const src = useMemo(() => {
    const origin = walletOrigin || window.location.origin;
    const path = walletServicePath || '/service';
    try { return new URL(path, origin).href; } catch { return `${origin}${path}`; }
  }, [walletOrigin, walletServicePath]);

  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const onMessage = (evt: MessageEvent) => {
      const data = evt.data as unknown;
      const type = isRecord(data) && isString((data as any).type) ? (data as any).type : undefined;
      const payload = isRecord(data) && isRecord(data.payload) ? data.payload : undefined;
      if (type === 'SERVICE_HOST_BOOTED') {
        setReady(true);
      } else if (type === 'TX_BUTTON_RESULT') {
        const ok = isRecord(payload) ? (payload.ok as boolean | undefined) : undefined;
        if (ok) {
          const result = (payload as { result?: ActionResult[] }).result;
          if (result) onSuccess?.(result);
        } else if (isRecord(payload) && payload.cancelled) {
          onCancel?.();
        } else if (isRecord(payload)) {
          const msg = (payload as { error?: string }).error || 'Tx button action failed';
          onError?.(new Error(msg));
        }
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [onCancel, onError, onSuccess]);

  useEffect(() => {
    const w = iframeRef.current?.contentWindow;
    if (!w || !ready) return;
    try { w.postMessage({ type: 'WALLET_SET_CONFIG', payload: pmConfigs }, '*'); } catch {}
    try {
      w.postMessage({
        type: 'WALLET_SHOW_TX_BUTTON',
        payload: {
          nearAccountId,
          transactions,
          text,
          theme,
          className,
          buttonStyle: style,
          // Hint to render inline (no nested iframe) inside wallet host
          renderMode: 'inline'
        }
      }, '*');
    } catch {}
  }, [className, nearAccountId, pmConfigs, ready, style, text, theme, transactions]);

  // Convert number|string to CSS length string, adding px for finite numbers
  const toCssSize = (v?: number | string): string | undefined => {
    if (v == null) return undefined;
    if (isFiniteNumber(v)) return `${v}px`;
    const s = String(v).trim();
    return s || undefined;
  };
  const w = toCssSize(width);
  const h = toCssSize(height);

  return (
    <iframe
      ref={iframeRef}
      title="wallet-tx-button-host"
      className={className}
      style={{ border: 'none', width: w, height: h, ...style }}
      src={src}
      sandbox="allow-scripts allow-same-origin"
      allow="publickey-credentials-create; publickey-credentials-get"
    />
  );
}

export default WalletIframeTxButtonHost;
