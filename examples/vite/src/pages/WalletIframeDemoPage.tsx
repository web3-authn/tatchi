import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { ActionType, ActionPhase, ActionStatus, usePasskeyContext } from '@web3authn/passkey/react';
import './EmbeddedTxConfirmPage.css';
// Import the WalletIframeClient directly from the SDK source for same-origin DB access
import { WalletIframeClient } from '../../../../passkey-sdk/src/core/WalletIframe/client.ts';

const buttonStyle = {
  marginBottom: '1rem',
  backgroundColor: 'var(--slate-grey-900)',
  color: 'var(--fe-surface)',
  fontWeight: 600,
}

export const WalletIframeDemoPage: React.FC = () => {

  const {
    loginState,
    passkeyManager,
    walletIframeConnected,
  } = usePasskeyContext();

  const [recipient, setRecipient] = useState('web3-authn-v5.testnet');
  const [amount, setAmount] = useState('0.001');
  const [busy, setBusy] = useState(false);
  const [regBusy, setRegBusy] = useState(false);
  const [loginBusy, setLoginBusy] = useState(false);
  const [migrateBusy, setMigrateBusy] = useState(false);
  const [newAccountId, setNewAccountId] = useState('berp1.web3-authn-v5.testnet');
  // Source of truth comes from SDK context (loginState). Avoid duplicating state locally.

  // Event-based readiness first; fall back to quick one-shot check
  // No local memoization of wallet status; rely on SDK's loginState updates from the provider.

  const nearToYocto = (nearAmount: string): string => {
    const num = parseFloat(nearAmount);
    if (isNaN(num) || num <= 0) return '0';
    const s = num.toString();
    const [w, f = ''] = s.split('.');
    return w + f.padEnd(24, '0').slice(0, 24);
  };

  const signAndSendViaWallet = useCallback(async () => {
    if (!loginState.isLoggedIn || !loginState.nearAccountId) {
      toast.error('Please log in (wallet origin) first');
      return;
    }
    const sc = passkeyManager.getServiceClient?.();
    if (!sc || !sc.isReady?.()) { toast.error('Service iframe not initialized'); return; }
    setBusy(true);
    try {
      const yocto = nearToYocto(amount);
      if (yocto === '0') {
        toast.error('Invalid amount');
        return;
      }

      // 1) Sign using cross-origin wallet service
      toast.loading('Signing via wallet service...', { id: 'svc' });
      const signed = await passkeyManager.signTransactionsWithActions({
        nearAccountId: loginState.nearAccountId!,
        transactions: [
          {
            receiverId: recipient.trim(),
            actions: [
              { type: ActionType.Transfer, amount: yocto },
            ],
          },
        ],
      });
      toast.success('Signed. Broadcasting...', { id: 'svc' });

      // 2) Broadcast from the parent app
      const result = await passkeyManager.sendTransaction({
        signedTransaction: signed[0].signedTransaction,
        options: {
          onEvent: (event) => {
            if (event.phase === ActionPhase.STEP_8_BROADCASTING && event.status === ActionStatus.SUCCESS) {
              toast.success(event.message || 'Broadcasted', { id: 'svc' });
            }
            if (event.phase === ActionPhase.STEP_9_ACTION_COMPLETE && event.status === ActionStatus.SUCCESS) {
              toast.success(event.message || 'Completed', { id: 'svc' });
            }
          },
        },
      });

      if (result.success) {
        toast.success(`Tx sent: ${result.transactionId}`);
      }
    } catch (err: any) {
      console.error('[WalletIframeDemo] error:', err);
      toast.error(err?.message || 'Failed to sign/broadcast');
    } finally {
      setBusy(false);
    }
  }, [loginState.isLoggedIn, loginState.nearAccountId, recipient, amount, passkeyManager]);

  const registerAccount = useCallback(async () => {
    const accountId = newAccountId.trim();
    if (!accountId) { toast.error('Enter a full NEAR account ID'); return; }
    setRegBusy(true);
    try {
      toast.loading('Starting wallet-origin registration…', { id: 'reg' });
      const sc = passkeyManager.getServiceClient?.();
      if (!sc || !sc.isReady?.()) {
        toast.error('Service iframe not initialized', { id: 'reg' });
        return;
      }
      const reg = await sc.registerPasskey?.({ nearAccountId: accountId });
      if (reg?.success && reg?.nearAccountId) {
        toast.success(`Registered ${accountId}`, { id: 'reg' });
      } else {
        toast.error(reg?.error || 'Registration failed', { id: 'reg' });
      }
    } catch (err: any) {
      console.error('[WalletIframeDemo] register error:', err);
      toast.error(err?.message || 'Registration failed');
    } finally {
      setRegBusy(false);
    }
  }, [newAccountId, passkeyManager]);

  const loginViaWalletOrigin = useCallback(async () => {
    const accountId = newAccountId.trim();
    if (!accountId) { toast.error('Enter a full NEAR account ID'); return; }
    setLoginBusy(true);
    const toastId = 'wallet-login';
    try {
      toast.loading('Authenticating with Passkey…', { id: toastId });
      const sc = passkeyManager.getServiceClient?.();
      if (!sc || !sc.isReady?.()) {
        throw new Error('Service iframe not initialized');
      }
      const raw = await sc.loginPasskey?.({ nearAccountId: accountId });
      const ok = raw.success;
      if (!ok) throw new Error(raw?.error || 'Login failed');
      // Fetch VRF status from wallet origin
      // SDK provider will reflect login state via context; no local caching here.
      toast.success(`Logged in as ${raw?.nearAccountId || accountId}`, { id: toastId });
    } catch (err: any) {
      console.error('[WalletIframeDemo] login error:', err);
      toast.error(err?.message || 'Login failed', { id: toastId });
    } finally {
      setLoginBusy(false);
    }
  }, [newAccountId, passkeyManager]);

  const migrateDataToWallet = useCallback(async () => {
    setMigrateBusy(true);
    const toastId = 'migrate';
    try {
      toast.loading('Scanning local data…', { id: toastId });

      // Same-origin client to read local IndexedDB via existing RPCs
      const localClient = new WalletIframeClient({});
      await localClient.init();

      const lastUserRes: any = await localClient.getLastUser();
      const lastUser = lastUserRes?.result || null;

      // Pull all users to migrate full users table
      const allUsersRes: any = await (localClient as any).getAllUsers?.();
      const allUsers: any[] = Array.isArray(allUsersRes?.result) ? allUsersRes.result : [];
      if (!lastUser && allUsers.length === 0) {
        toast.error('No local records found to migrate', { id: toastId });
        return;
      }

      const nearAccountId: string = (lastUser?.nearAccountId) || (allUsers[0]?.nearAccountId) || '';
      const deviceNumber: number = (lastUser?.deviceNumber) || 1;

      // Pull preferences, theme, and authenticators from local origin
      const [prefsRes, themeRes, authsRes, nearKeysRes] = await Promise.all([
        nearAccountId ? localClient.getPreferences(nearAccountId) : Promise.resolve(null),
        nearAccountId ? localClient.getTheme(nearAccountId) : Promise.resolve(null),
        nearAccountId ? localClient.getAuthenticators(nearAccountId) : Promise.resolve({ result: [] }),
        (localClient as any).getAllNearKeys?.() ?? Promise.resolve({ result: [] }),
      ]);

      const preferences = (prefsRes as any)?.result || null;
      const theme = (themeRes as any)?.result || null;
      const authenticators: any[] = Array.isArray((authsRes as any)?.result) ? (authsRes as any).result : [];
      const nearKeys: any[] = Array.isArray((nearKeysRes as any)?.result) ? (nearKeysRes as any).result : [];

      toast.loading('Migrating to wallet origin…', { id: toastId });

      // Connect to wallet origin via a dedicated client (ensures latest helper methods)
      const cfg: any = (passkeyManager as any).configs || {};
      const wc = new WalletIframeClient({
        walletOrigin: cfg.walletOrigin,
        servicePath: cfg.walletServicePath || '/wallet-service',
        theme: cfg.walletTheme,
        nearRpcUrl: cfg.nearRpcUrl,
        nearNetwork: cfg.nearNetwork,
        contractId: cfg.contractId,
        relayer: cfg.relayer,
        vrfWorkerConfigs: cfg.vrfWorkerConfigs,
        sdkBasePath: '/sdk',
      });
      await wc.init();

      // Push into wallet origin via service-iframe DB RPCs
      // 1) Users table: store WebAuthn user data for each user
      let usersStored = 0;
      let authStored = 0;
      for (const u of allUsers) {
        const userData = {
          nearAccountId: u.nearAccountId,
          deviceNumber: u.deviceNumber,
          clientNearPublicKey: u.clientNearPublicKey,
          lastUpdated: u.lastUpdated,
          passkeyCredential: u.passkeyCredential,
          encryptedVrfKeypair: u.encryptedVrfKeypair,
          serverEncryptedVrfKeypair: u.serverEncryptedVrfKeypair,
        };
        await (wc as any).storeWebAuthnUser?.(userData);
        usersStored += 1;
        // Also migrate per-user preferences if present
        if (u.preferences && typeof u.preferences === 'object') {
          await (wc as any).updatePreferences?.(u.nearAccountId, u.preferences);
        }
        // Migrate authenticators per user
        const authsResU: any = await localClient.getAuthenticators(u.nearAccountId);
        const authsU: any[] = Array.isArray(authsResU?.result) ? authsResU.result : [];
        for (const rec of authsU) {
          await (wc as any).storeAuthenticator?.(rec);
          authStored += 1;
        }
      }

      // 2) Preferences and theme for last user (if specified directly)
      if (preferences && typeof preferences === 'object') {
        await (wc as any).updatePreferences?.(nearAccountId, preferences);
      }
      // Theme
      if (theme === 'dark' || theme === 'light') {
        await wc.setTheme(nearAccountId, theme);
      }
      // 3) Authenticators (for directly specified last user-only fetch if not already covered)
      // Note: If allUsers contained this user, the per-user loop already migrated its authenticators.
      if (authenticators.length && !allUsers.some(u => u?.nearAccountId === nearAccountId)) {
        for (const rec of authenticators) {
          await (wc as any).storeAuthenticator?.(rec);
          authStored += 1;
        }
      }
      // 4) Near keys (encrypted)
      let keysStored = 0;
      for (const k of nearKeys) {
        await (wc as any).storeNearKey?.(k);
        keysStored += 1;
      }

      // 5) Last user pointer
      await (wc as any).setLastUser?.(nearAccountId, deviceNumber);

      toast.success(`Migration complete. ${usersStored} user(s), ${authStored} authenticator(s), ${keysStored} key(s) imported.`, { id: toastId });
    } catch (err: any) {
      console.error('[WalletIframeDemo] migrate error:', err);
      toast.error(err?.message || 'Migration failed', { id: toastId });
    } finally {
      setMigrateBusy(false);
    }
  }, [passkeyManager]);

  return (
    <main className="embedded-tx-page-root">
      <div className="embedded-tx-translucent-container">
        <div className="embedded-tx-content-area">
          <h2>Service Iframe Demo</h2>
          <p>
            This demo signs a transfer using the cross-origin wallet service
            running at <code>https://wallet.example.localhost</code> and then
            broadcasts from this app.
          </p>

          <div style={{ marginTop: '1rem', paddingBottom: 12, borderBottom: '1px solid var(--fe-border)' }}>
          <h3 style={{ marginTop: 0 }}>Register Account (wallet origin)</h3>
          <p style={{ marginTop: 4, opacity: 0.8 }}>
            This button runs registration inside the wallet origin iframe.
          </p>

            <label>New Account ID</label>
            <input
              type="text"
              value={newAccountId}
              onChange={(e) => setNewAccountId(e.target.value)}
              placeholder="yourname.web3-authn-v5.testnet"
              style={{ display: 'block', width: '100%', marginTop: 6, marginBottom: 12 }}
            />

            <button
              className="fe-button-primary"
              onClick={registerAccount}
              disabled={!newAccountId.trim() || regBusy}
              style={buttonStyle}
            >
              {regBusy ? 'Registering…' : 'Register New Account'}
            </button>

            <button
              style={buttonStyle}
              className="fe-button-secondary"
              onClick={loginViaWalletOrigin}
              disabled={!newAccountId.trim() || loginBusy}
            >
              {loginBusy ? 'Authenticating…' : 'Login via Wallet Origin'}
            </button>
          </div>

          <div style={{ marginTop: '1rem' }}>
            <label>Recipient</label>
            <input
              type="text"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="recipient.testnet"
              style={{ display: 'block', width: '100%', marginTop: 6, marginBottom: 12 }}
            />

            <label>Amount (NEAR)</label>
            <input
              type="text"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.001"
              style={{ display: 'block', width: '100%', marginTop: 6, marginBottom: 12 }}
            />

            <button
              style={buttonStyle}
              className="fe-button-primary"
              onClick={signAndSendViaWallet}
              disabled={!loginState.isLoggedIn || busy}
            >
              {busy ? 'Processing...' : 'Sign via Wallet Origin'}
            </button>

            <div style={{ marginTop: 16 }}>
              <button
                className="fe-button-secondary"
                style={buttonStyle}
                onClick={migrateDataToWallet}
                disabled={migrateBusy}
              >
                {migrateBusy ? 'Migrating…' : 'Migrate data to wallet origin'}
              </button>
            </div>

            <div style={{
              marginTop: 12,
              fontSize: 15,
              fontWeight: 500,
              color: walletIframeConnected? 'green' : 'red'
            }}>
              Wallet VRF: {walletIframeConnected ? `WalletIframe active (${loginState.nearAccountId || ''})` : 'inactive'}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
};
