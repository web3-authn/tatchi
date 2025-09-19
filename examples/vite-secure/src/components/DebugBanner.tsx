import React, { useEffect, useState } from 'react';
import { usePasskeyContext } from '@web3authn/passkey/react';

export const DebugBanner: React.FC = () => {
  const { walletIframeConnected, accountInputState, passkeyManager } = usePasskeyContext();
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
        await passkeyManager.initWalletIframe?.();
      } catch {}
      finally { if (mounted) setConnecting(false); }
    })();
    return () => { mounted = false; };
  }, [passkeyManager]);

  const status = walletIframeConnected ? 'connected' : (connecting ? 'initializing…' : 'waiting for READY');

  return (
    <div style={{
      position: 'fixed', bottom: 0, zIndex: 2147483647,
      background: walletIframeConnected ? 'rgba(16,185,129,0.15)' : 'rgba(234,179,8,0.15)',
      borderBottom: '1px solid rgba(0,0,0,0.1)',
      borderRadius: '0px 4px 0px 0px',
      padding: '6px 10px', fontSize: '12px', display: 'flex', gap: '12px', alignItems: 'center'
    }}>
      <strong>Wallet Iframe:</strong> <span>{status}</span>
      <span>|</span>
      <strong>Recent Accounts:</strong> <span>{recentCount}</span>
    </div>
  );
};

export default DebugBanner;

