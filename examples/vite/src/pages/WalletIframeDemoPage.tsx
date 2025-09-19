import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { ActionType, ActionPhase, ActionStatus, usePasskeyContext } from '@web3authn/passkey/react';
import './EmbeddedTxConfirmPage.css';

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
  const [execBusy, setExecBusy] = useState(false);
  const [batchBusy, setBatchBusy] = useState(false);
  const [regBusy, setRegBusy] = useState(false);
  const [loginBusy, setLoginBusy] = useState(false);
  const [migrateBusy, setMigrateBusy] = useState(false);
  const [newAccountId, setNewAccountId] = useState('berp7.web3-authn-v5.testnet');
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
    // PasskeyManager will route via WalletIframe when configured
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
      const reg = await passkeyManager.registerPasskey(accountId, {
        onEvent: (ev: any) => {
          if (ev?.message) toast.loading(ev.message, { id: 'reg' });
          if (ev?.status === 'success' && ev?.phase?.includes?.('complete')) toast.success('Registration complete', { id: 'reg' });
          if (ev?.status === 'error') toast.error(ev?.error || 'Registration error', { id: 'reg' });
        }
      } as any);
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

  const executeActionTransfer = useCallback(async () => {
    if (!loginState.isLoggedIn || !loginState.nearAccountId) {
      toast.error('Please log in (wallet origin) first');
      return;
    }
    const yocto = nearToYocto(amount);
    if (yocto === '0') { toast.error('Invalid amount'); return; }
    setExecBusy(true);
    const toastId = 'exec-action';
    try {
      toast.loading('Executing transfer via executeAction…', { id: toastId });
      const res = await passkeyManager.executeAction({
        nearAccountId: loginState.nearAccountId,
        receiverId: recipient.trim(),
        actionArgs: { type: ActionType.Transfer, amount: yocto },
        options: {
          onEvent: (event) => {
            if (event?.message) toast.loading(event.message, { id: toastId });
            if (event?.phase === ActionPhase.STEP_9_ACTION_COMPLETE && event?.status === ActionStatus.SUCCESS) {
              toast.success(event.message || 'Action complete', { id: toastId });
            }
          },
        },
      } as any);
      if (res?.success) {
        toast.success(`Action tx: ${res.transactionId}`);
      } else {
        toast.error(res?.error || 'Action failed');
      }
    } catch (err: any) {
      console.error('[WalletIframeDemo] executeAction error:', err);
      toast.error(err?.message || 'Action failed', { id: toastId });
    } finally {
      setExecBusy(false);
    }
  }, [loginState.isLoggedIn, loginState.nearAccountId, recipient, amount, passkeyManager]);

  const signAndSendOneCall = useCallback(async () => {
    if (!loginState.isLoggedIn || !loginState.nearAccountId) {
      toast.error('Please log in (wallet origin) first');
      return;
    }
    const yocto = nearToYocto(amount);
    if (yocto === '0') { toast.error('Invalid amount'); return; }
    setBatchBusy(true);
    const toastId = 'sign-send-onecall';
    try {
      toast.loading('Signing and sending (one call)…', { id: toastId });
      const results = await passkeyManager.signAndSendTransactions({
        nearAccountId: loginState.nearAccountId,
        transactions: [
          {
            receiverId: recipient.trim(),
            actions: [{ type: ActionType.Transfer, amount: yocto }],
          },
        ],
        options: {
          executionWait: { mode: 'sequential' },
          onEvent: (event) => {
            if (event?.message) toast.loading(event.message, { id: toastId });
            if (event?.phase === ActionPhase.STEP_9_ACTION_COMPLETE && event?.status === ActionStatus.SUCCESS) {
              toast.success(event.message || 'All done', { id: toastId });
            }
          },
        },
      });
      const txIds = (results || []).map((r: any) => r?.transactionId).filter(Boolean).join(', ');
      if (txIds) toast.success(`Sent txs: ${txIds}`);
    } catch (err: any) {
      console.error('[WalletIframeDemo] signAndSendTransactions error:', err);
      toast.error(err?.message || 'Batch failed', { id: toastId });
    } finally {
      setBatchBusy(false);
    }
  }, [loginState.isLoggedIn, loginState.nearAccountId, recipient, amount, passkeyManager]);

  const loginViaWalletOrigin = useCallback(async () => {
    const accountId = newAccountId.trim();
    if (!accountId) { toast.error('Enter a full NEAR account ID'); return; }
    setLoginBusy(true);
    const toastId = 'wallet-login';
    try {
      toast.loading('Authenticating with Passkey…', { id: toastId });
      const raw = await passkeyManager.loginPasskey(accountId, {
        onEvent: (ev: any) => {
          if (ev?.message) toast.loading(ev.message, { id: toastId });
          if (ev?.status === 'error') toast.error(ev?.error || 'Login error', { id: toastId });
        }
      } as any);
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
      toast.loading('Migration flow removed in new WalletIframe API', { id: toastId });
      toast.success('Nothing to migrate', { id: toastId });
    } catch (err: any) {
      console.error('[WalletIframeDemo] migrate error:', err);
      toast.error(err?.message || 'Migration failed', { id: toastId });
    } finally {
      setMigrateBusy(false);
    }
  }, []);

  return (
    <main className="embedded-tx-page-root">
      <div className="embedded-tx-translucent-container">
        <div className="embedded-tx-content-area">
          <h2>WalletIframe Demo</h2>
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

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 8 }}>
              <button
                className="fe-button-secondary"
                style={buttonStyle}
                onClick={executeActionTransfer}
                disabled={!loginState.isLoggedIn || execBusy}
              >
                {execBusy ? 'Executing…' : 'Execute Action (Transfer)'}
              </button>
              <button
                className="fe-button-secondary"
                style={buttonStyle}
                onClick={signAndSendOneCall}
                disabled={!loginState.isLoggedIn || batchBusy}
              >
                {batchBusy ? 'Sending…' : 'Sign & Send (one call)'}
              </button>
            </div>

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
