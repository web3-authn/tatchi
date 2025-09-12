import React, { useEffect, useMemo, useRef, useState } from 'react';
import { usePasskeyContext } from '@/react/context';
import { ArrowUpIcon } from './PasskeyAuthMenu/icons';

export function WalletRegisterButtonHost({
  nearAccountId,
  text = 'Create Passkey',
  theme = 'dark',
  width,
  height,
  className,
  style,
  onSuccess,
  onError,
  autoClose = true,
}: {
  nearAccountId: string;
  text?: string;
  theme?: 'dark' | 'light';
  width?: number | string;
  height?: number | string;
  className?: string;
  style?: React.CSSProperties;
  onSuccess?: (result: any) => void;
  onError?: (error: Error) => void;
  autoClose?: boolean;
}) {
  const ctx = usePasskeyContext();
  const pmConfigs = (ctx?.passkeyManager as any)?.configs || ({} as any);
  const { walletOrigin, walletServicePath } = pmConfigs;
  const src = useMemo(() => {
    const origin = walletOrigin || window.location.origin;
    const path = walletServicePath || '/wallet-service';
    try { return new URL(path, origin).href; } catch { return `${origin}${path}`; }
  }, [walletOrigin, walletServicePath]);

  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const onMessage = (evt: MessageEvent) => {
      const t = (evt?.data && (evt.data as any).type) || undefined;
      const p = (evt?.data && (evt.data as any).payload) || undefined;
      if (t === 'SERVICE_HOST_BOOTED') {
        setReady(true);
      } else if (t === 'REGISTER_RESULT') {
        if (p?.ok) onSuccess?.(p?.result);
        else onError?.(new Error(p?.error || 'Registration failed'));
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [onError, onSuccess]);

  useEffect(() => {
    const w = iframeRef.current?.contentWindow;
    if (!w || !ready) return;
    // Ensure wallet service has config before showing the button
    try {
      w.postMessage({ type: 'WALLET_SET_CONFIG', payload: pmConfigs }, '*');
    } catch {}
    try {
      w.postMessage({
        type: 'WALLET_SHOW_REGISTER_BUTTON',
        payload: { nearAccountId, text, theme, width, height, autoClose, className, style }
      }, '*');
    } catch {}
  }, [autoClose, className, height, nearAccountId, ready, style, text, theme, width]);

  // Match ArrowButton layout and animations
  const toCssSize = (v?: number | string): string | undefined => {
    if (v == null) return undefined;
    if (typeof v === 'number' && Number.isFinite(v)) return `${v}px`;
    const s = String(v).trim();
    return s || undefined;
  };
  const w = toCssSize(width);
  const h = toCssSize(height);

  return (
    <div style={{ position: 'relative', display: 'inline-block', width: w, height: h }}>
      <button
        aria-label="Continue"
        className={`w3a-arrow-btn is-enabled`}
        style={{ width: w, height: h }}
      >
        <ArrowUpIcon
          size={24}
          strokeWidth={2.5}
          color="#ffffff"
          style={{ display: 'block', transition: 'transform 200ms, width 200ms, height 200ms' }}
        />
      </button>
      <div
        className="w3a-arrow-overlay"
        style={{ position: 'absolute', inset: 0, zIndex: 2, pointerEvents: 'auto' }}
      >
        <iframe
          ref={iframeRef}
          title="wallet-register-button-host"
          className={className}
          style={{ background: 'transparent', border: 'none', color: 'transparent', width: '100%', height: '100%', ...style }}
          src={src}
          sandbox="allow-scripts allow-same-origin"
          allow="publickey-credentials-create; publickey-credentials-get"
        />
      </div>
    </div>
  );
}

export default WalletRegisterButtonHost;
