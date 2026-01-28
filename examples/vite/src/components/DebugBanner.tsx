import React, { useEffect, useState } from 'react';
import { useTatchi } from '@tatchi-xyz/sdk/react';
import { detectTatchiWalletExtension } from '@tatchi-xyz/sdk';
import { parseWalletOrigins, readUseExtensionWalletPreference, writeUseExtensionWalletPreference } from '../walletRouting';

export const DebugBanner: React.FC = () => {
  // Hide on mobile devices (coarse pointers / typical UA tokens)
  try {
    const ua = (typeof navigator !== 'undefined' ? navigator.userAgent : '') || '';
    const coarse = typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    const mobileUA = /Mobi|Android|iPhone|iPad|iPod/i.test(ua);
    if (coarse || mobileUA) return null;
  } catch {}

  const { walletIframeConnected, accountInputState, tatchi } = useTatchi();
  const [recentCount, setRecentCount] = useState<number>(accountInputState.indexDBAccounts?.length || 0);
  const [connecting, setConnecting] = useState<boolean>(false);

  useEffect(() => {
    setRecentCount(accountInputState.indexDBAccounts?.length || 0);
  }, [accountInputState.indexDBAccounts]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setConnecting(true);
        // Force-init wallet iframe if configured to surface READY state quickly
        await tatchi.initWalletIframe?.();
      } catch {}
      finally { if (mounted) setConnecting(false); }
    })();
    return () => { mounted = false; };
  }, [tatchi]);

  const status = walletIframeConnected
    ? 'connected'
    : (connecting ? 'connecting…' : 'waiting for READY');

  const env = import.meta.env;
  const walletOrigins = parseWalletOrigins(env.VITE_WALLET_ORIGIN as string | undefined);
  const hasExtensionOrigin = !!walletOrigins.extensionWalletOrigin;
  const [useExtensionWallet, setUseExtensionWallet] = useState<boolean>(() => readUseExtensionWalletPreference());
  const [extensionHandshake, setExtensionHandshake] = useState<{ protocolVersion: string; extensionVersion: string } | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!walletOrigins.extensionWalletOrigin) {
        setExtensionHandshake(undefined);
        return;
      }
      const extensionId = (() => {
        try {
          return new URL(walletOrigins.extensionWalletOrigin!).hostname;
        } catch {
          return '';
        }
      })();
      if (!extensionId) {
        setExtensionHandshake(null);
        return;
      }
      const res = await detectTatchiWalletExtension(extensionId, { timeoutMs: 400 });
      if (!cancelled) setExtensionHandshake(res);
    })();
    return () => { cancelled = true; };
  }, [walletOrigins.extensionWalletOrigin]);

  return (
    <div style={{
      position: 'fixed',
      bottom: '0.5rem',
      right: '0.5rem',
      color: walletIframeConnected ? 'rgba(66,140,240,0.8)' : 'rgba(234,179,8,0.8)',
      padding: '4px 4px 0px 4px',
      lineHeight: '0.75rem',
      fontSize: '10px',
      display: 'flex',
      gap: '6px',
      alignItems: 'center',
    }}>
      <strong>wallet iframe:</strong> <span>{status}</span>
      {hasExtensionOrigin && (
        <>
          <span>|</span>
          <strong>ext:</strong>{' '}
          <span>
            {extensionHandshake
              ? `v${extensionHandshake.extensionVersion}`
              : (extensionHandshake === null ? 'not detected' : '…')}
          </span>
          <span>|</span>
          <label style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={useExtensionWallet}
              onChange={(e) => {
                const next = !!e.target.checked;
                setUseExtensionWallet(next);
                writeUseExtensionWalletPreference(next);
                try { window.location.reload(); } catch {}
              }}
            />
            use extension
          </label>
        </>
      )}
      {walletIframeConnected &&
        <>
          <span>|</span>
          <strong>accounts:</strong> <span>{recentCount}</span>
        </>
      }
    </div>
  );
};

export default DebugBanner;
