import React, { useEffect, useMemo, useRef, useState } from 'react';
import { usePasskeyContext } from '@/react/context';
import { ArrowUpIcon } from './PasskeyAuthMenu/icons';
import type { PasskeyManagerConfigs, RegistrationResult } from '@/core/types/passkeyManager';
import { isObject, isString, isFiniteNumber } from '@/core/WalletIframe/validation';

export interface WalletIframeRegisterButtonHostProps {
  nearAccountId: string;
  text?: string;
  theme?: 'dark' | 'light';
  width?: number | string;
  height?: number | string;
  className?: string;
  style?: React.CSSProperties | Record<string, string>;
  onSuccess?: (result: RegistrationResult) => void;
  onError?: (error: Error) => void;
  autoClose?: boolean;
}

export function WalletIframeRegisterButtonHost({
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
}: WalletIframeRegisterButtonHostProps) {
  const ctx = usePasskeyContext();
  const pmConfigs: PasskeyManagerConfigs | undefined = ctx?.passkeyManager?.configs;
  const walletOrigin = pmConfigs?.iframeWallet?.walletOrigin;
  const walletServicePath = pmConfigs?.iframeWallet?.walletServicePath;
  const src = useMemo(() => {
    const origin = walletOrigin || window.location.origin;
    const path = walletServicePath || '/wallet-service';
    try { return new URL(path, origin).href; } catch { return `${origin}${path}`; }
  }, [walletOrigin, walletServicePath]);

  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const onMessage = (evt: MessageEvent) => {
      const data = evt.data as unknown;
      const type = isObject(data) && isString((data as any).type) ? (data as any).type : undefined;
      const payload = isObject(data) && isObject((data as any).payload) ? (data as any).payload : undefined;
      if (type === 'SERVICE_HOST_BOOTED') {
        setReady(true);
      } else if (type === 'REGISTER_RESULT' && isObject(payload)) {
        const ok = payload.ok as boolean | undefined;
        if (ok) {
          const result = (payload as { result?: RegistrationResult }).result;
          if (result) onSuccess?.(result);
        } else {
          const errMsg = (payload as { error?: string }).error || 'Registration failed';
          onError?.(new Error(errMsg));
        }
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
    if (isFiniteNumber(v)) return `${v}px`;
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

export default WalletIframeRegisterButtonHost;
