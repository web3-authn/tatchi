import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';

import type { TatchiConfigsInput } from '@/core/types/tatchi';
import { TatchiPasskeyProvider } from '@/react/context/TatchiPasskeyProvider';
import { useTatchi } from '@/react/context';
import { AccountMenuButton } from '@/react/components/AccountMenuButton';

declare const chrome: any;

function getExtensionOrigin(): string {
  try {
    const url = chrome?.runtime?.getURL?.('');
    if (typeof url === 'string' && url) {
      return new URL(url).origin;
    }
  } catch { }
  return '';
}

function SidePanelInner() {
  const { loginState, logout } = useTatchi();
  const [accountId, setAccountId] = useState<string>(loginState.nearAccountId || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>('');

  const callWalletHost = async (payload: any): Promise<void> => {
    const runtime = chrome?.runtime;
    if (!runtime?.sendMessage) throw new Error('Chrome extension runtime not available');
    // Route through the MV3 service worker broker which forwards to the embedded wallet host iframe(s).
    const resp = await new Promise<any>((resolve) => runtime.sendMessage(payload, resolve));
    const err = runtime.lastError;
    if (err) throw new Error(err.message || String(err));
    if (!resp?.ok) throw new Error(resp?.error || 'Wallet host request failed');
  };

  const onUnlock = async () => {
    const id = accountId.trim();
    if (!id) return;
    setError('');
    setBusy(true);
    try {
      // IMPORTANT: warm signing sessions live in the embedded wallet host (wallet-service iframe)
      // that services signing requests from the app. Unlock that host directly via runtime messaging.
      await callWalletHost({
        type: 'TATCHI_WALLET_UNLOCK',
        nearAccountId: id,
        signingSession: { ttlMs: 12 * 60 * 60 * 1000, remainingUses: 10_000 },
      });
    } catch (e: any) {
      setError(String(e?.message || e || 'Login failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ padding: 12, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <h3 style={{ margin: '0 0 10px' }}>Tatchi Wallet</h3>
      <div style={{ marginBottom: 10, fontSize: 12, opacity: 0.8 }}>
        Unlock the extension signer (TouchID once) to enable warm-session signing without per-transaction TouchID prompts.
      </div>

      <label style={{ display: 'block', fontSize: 12, marginBottom: 6 }}>Account ID</label>
      <input
        value={accountId}
        onChange={(e) => setAccountId(e.target.value)}
        placeholder="alice.w3a-v1.testnet"
        style={{
          width: '100%',
          padding: '10px 12px',
          borderRadius: 10,
          border: '1px solid rgba(0,0,0,0.16)',
          background: 'rgba(255,255,255,0.9)',
          marginBottom: 10,
          boxSizing: 'border-box',
        }}
      />

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button
          type="button"
          onClick={() => void onUnlock()}
          disabled={busy || !accountId.trim()}
          style={{
            flex: 1,
            padding: '10px 12px',
            borderRadius: 10,
            border: '1px solid rgba(0,0,0,0.16)',
            background: '#2563eb',
            color: 'white',
            cursor: 'pointer',
          }}
        >
          {busy ? 'Unlocking…' : 'Unlock'}
        </button>
        <button
          type="button"
          onClick={() => {
            void (async () => {
              setError('');
              setBusy(true);
              try {
                await callWalletHost({ type: 'TATCHI_WALLET_LOCK' });
              } catch (e: any) {
                setError(String(e?.message || e || 'Lock failed'));
              } finally {
                setBusy(false);
              }
              logout();
            })();
          }}
          disabled={busy}
          style={{
            flex: 1,
            padding: '10px 12px',
            borderRadius: 10,
            border: '1px solid rgba(0,0,0,0.16)',
            background: 'rgba(0,0,0,0.06)',
            color: '#111',
            cursor: 'pointer',
          }}
        >
          Lock
        </button>
      </div>

      {error ? (
        <div style={{ marginBottom: 12, fontSize: 12, color: '#b91c1c' }}>{error}</div>
      ) : null}

      <div style={{ marginTop: 12 }}>
        <AccountMenuButton
          nearAccountId={accountId.trim() || loginState.nearAccountId || ''}
          hideUsername={false}
          // In a side panel it’s more useful to show settings immediately.
          isMenuOpen={true}
        />
      </div>
    </div>
  );
}

function SidePanelApp() {
  const extensionOrigin = getExtensionOrigin();
  const config: TatchiConfigsInput = useMemo(() => {
    const iframeWallet: NonNullable<TatchiConfigsInput['iframeWallet']> = {
      walletOrigin: extensionOrigin,
      walletServicePath: '/wallet-service.html',
      sdkBasePath: '/sdk',
      extensionWalletOrigin: extensionOrigin,
      extensionWalletServicePath: '/wallet-service.html',
    };

    return {
      // Side panel should talk to the extension-hosted wallet service.
      iframeWallet,
      // Extension signer UX: keep a warm session while "logged in" in the extension.
      signingSessionDefaults: { ttlMs: 12 * 60 * 60 * 1000, remainingUses: 10_000 },
      // Avoid relayer-backed sessions from the side panel; it is for local signer lock/unlock + settings.
      relayer: { url: '' },
    };
  }, [extensionOrigin]);

  return (
    <TatchiPasskeyProvider config={config} eager={true}>
      <SidePanelInner />
    </TatchiPasskeyProvider>
  );
}

function main(): void {
  const rootEl = document.getElementById('root');
  if (!rootEl) return;
  const root = createRoot(rootEl);
  root.render(<SidePanelApp />);
}

main();
