import React from 'react';
import { toast } from 'sonner';

import { TxExecutionStatus, useTatchi } from '@tatchi-xyz/sdk/react';

import type { ActionResult, ActionArgs } from '@tatchi-xyz/sdk/react';
import { ActionType } from '@tatchi-xyz/sdk/react';
import { LoadingButton } from './LoadingButton';
import EmailRecoveryFields from './EmailRecoveryFields';
import { NEAR_EXPLORER_BASE_URL } from '../types';

export const SetupEmailRecovery: React.FC = () => {
  const {
    loginState: { isLoggedIn, nearAccountId },
    tatchi,
  } = useTatchi();

  const [isBusy, setIsBusy] = React.useState(false);
  const [recoveryEmails, setRecoveryEmails] = React.useState<string[]>(['']);
  const [minRequiredEmails, setMinRequiredEmails] = React.useState<string>('1');
  const [maxAgeMinutes, setMaxAgeMinutes] = React.useState<string>('30');
  const [onChainHashes, setOnChainHashes] = React.useState<string[]>([]);
  const [pendingEmailRecoveryKey, setPendingEmailRecoveryKey] = React.useState<string | null>(null);
  const [pendingMailtoUrl, setPendingMailtoUrl] = React.useState<string | null>(null);
  const [recoveryStatus, setRecoveryStatus] = React.useState<string | null>(null);
  const [pollingElapsedMs, setPollingElapsedMs] = React.useState<number | null>(null);
  const [autoResuming, setAutoResuming] = React.useState(false);
  const [recoveryEmailInput, setRecoveryEmailInput] = React.useState<string>('');

  const refreshOnChainEmails = React.useCallback(async () => {
    if (!tatchi || !nearAccountId || tatchi.configs.nearNetwork !== 'testnet') {
      setOnChainHashes([]);
      return;
    }

    try {
      const records = await tatchi.getRecoveryEmails(nearAccountId);
      const labels = (records || []).map(rec => rec.email);
      setOnChainHashes(labels);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[EmailRecovery] Failed to fetch recovery emails', err);
      setOnChainHashes([]);
    }
  }, [tatchi, nearAccountId]);

  React.useEffect(() => {
    void refreshOnChainEmails();
  }, [refreshOnChainEmails]);

  if (!isLoggedIn || !nearAccountId) {
    return null;
  }

  const ensureTestnet = () => {
    if (tatchi.configs.nearNetwork !== 'testnet') {
      toast.error('Email recovery demo is only available on testnet for now.');
      return false;
    }
    return true;
  };

  const handleDeleteEmailRecovery = async () => {
    if (!tatchi || !nearAccountId) return;

    if (!ensureTestnet()) return;

    const toastId = 'email-recovery-delete';
    setIsBusy(true);

    try {
      toast.loading('Disabling email recovery (clearing emails)...', { id: toastId });

      const result = await tatchi.clearRecoveryEmails(
        nearAccountId,
        {
          waitUntil: TxExecutionStatus.EXECUTED_OPTIMISTIC,
          afterCall: (success: boolean, actionResult?: ActionResult) => {
            try {
              toast.dismiss(toastId);
            } catch {}

            const txId = actionResult?.transactionId;

            if (success && txId) {
              const txLink = `${NEAR_EXPLORER_BASE_URL}/transactions/${txId}`;
              toast.success('Email recovery disabled for this account', {
                description: (
                  <a href={txLink} target="_blank" rel="noopener noreferrer">
                    View transaction on NearBlocks
                  </a>
                ),
              });
            } else if (success) {
              toast.success('Email recovery disabled for this account');
            } else {
              const message = actionResult?.error || 'Failed to disable email recovery';
              toast.error(message);
            }
          },
        },
      );

      if (!result?.success) {
        toast.error(result?.error || 'Failed to disable email recovery');
      }
      if (result?.success) {
        void refreshOnChainEmails();
      }
    } catch (error: any) {
      try {
        toast.dismiss(toastId);
      } catch {}
      const message = error?.message || 'Failed to disable email recovery';
      toast.error(message);
    } finally {
      setIsBusy(false);
    }
  };

  const handleSetRecoveryEmails = async () => {
    if (!tatchi || !nearAccountId) return;
    if (!ensureTestnet()) return;

    const toastId = 'email-recovery-set-emails';
    setIsBusy(true);

    try {
      toast.loading('Updating recovery emails...', { id: toastId });
      const result = await tatchi.setRecoveryEmails(
        nearAccountId,
        recoveryEmails,
        {
          waitUntil: TxExecutionStatus.EXECUTED_OPTIMISTIC,
          afterCall: (success: boolean, actionResult?: ActionResult) => {
            try {
              toast.dismiss(toastId);
            } catch {}

            const txId = actionResult?.transactionId;

            if (success && txId) {
              const txLink = `${NEAR_EXPLORER_BASE_URL}/transactions/${txId}`;
              toast.success('Recovery emails updated', {
                description: (
                  <a href={txLink} target="_blank" rel="noopener noreferrer">
                    View transaction on NearBlocks
                  </a>
                ),
              });
            } else if (success) {
              toast.success('Recovery emails updated');
            } else {
              const message = actionResult?.error || 'Failed to update recovery emails';
              toast.error(message);
            }
          },
        },
      );

      if (!result?.success) {
        toast.error(result?.error || 'Failed to update recovery emails');
      } else {
        void refreshOnChainEmails();
      }
    } catch (error: any) {
      try {
        toast.dismiss(toastId);
      } catch {}
      const message = error?.message || 'Failed to update recovery emails';
      toast.error(message);
    } finally {
      setIsBusy(false);
    }
  };

  const handleSetRecoveryPolicy = async () => {
    if (!tatchi || !nearAccountId) return;
    if (!ensureTestnet()) return;

    const toastId = 'email-recovery-set-policy';
    setIsBusy(true);

    try {
      toast.loading('Updating recovery policy...', { id: toastId });

      const minRequired = Math.max(1, parseInt(minRequiredEmails || '1', 10) || 1);
      const maxAgeMins = Math.max(1, parseInt(maxAgeMinutes || '30', 10) || 30);
      const max_age_ms = maxAgeMins * 60_000;

      const actions: ActionArgs[] = [
        {
          type: ActionType.FunctionCall,
          methodName: 'set_policy',
          args: {
            policy: {
              min_required_emails: minRequired,
              max_age_ms,
            },
          },
          gas: '80000000000000',
          deposit: '0',
        },
      ];

      const result = await tatchi.executeAction({
        nearAccountId,
        receiverId: nearAccountId,
        actionArgs: actions,
        options: {
          waitUntil: TxExecutionStatus.EXECUTED_OPTIMISTIC,
          afterCall: (success: boolean, actionResult?: ActionResult) => {
            try {
              toast.dismiss(toastId);
            } catch {}

            const txId = actionResult?.transactionId;

            if (success && txId) {
              const txLink = `${NEAR_EXPLORER_BASE_URL}/transactions/${txId}`;
              toast.success('Recovery policy updated', {
                description: (
                  <a href={txLink} target="_blank" rel="noopener noreferrer">
                    View transaction on NearBlocks
                  </a>
                ),
              });
            } else if (success) {
              toast.success('Recovery policy updated');
            } else {
              const message = actionResult?.error || 'Failed to update recovery policy';
              toast.error(message);
            }
          },
        },
      });

      if (!result?.success) {
        toast.error(result?.error || 'Failed to update recovery policy');
      }
    } catch (error: any) {
      try {
        toast.dismiss(toastId);
      } catch {}
      const message = error?.message || 'Failed to update recovery policy';
      toast.error(message);
    } finally {
      setIsBusy(false);
    }
  };

  const handleStartEmailRecoveryFlow = async () => {
    if (!tatchi || !nearAccountId) return;
    if (!ensureTestnet()) return;

    setPollingElapsedMs(null);
    setRecoveryStatus(null);

    const emailCandidate = (recoveryEmailInput || recoveryEmails[0] || '').trim().toLowerCase();
    if (!emailCandidate) {
      toast.error('Please set at least one recovery email first.');
      return;
    }

    const toastId = 'email-recovery-start';
    setIsBusy(true);

    try {
      toast.loading('Creating recovery key and email draft…', { id: toastId });

      const result = await tatchi.startEmailRecovery({
        accountId: nearAccountId,
        recoveryEmail: emailCandidate,
        options: {
          onEvent: (ev: any) => {
            // eslint-disable-next-line no-console
            console.debug('[EmailRecovery][start] event', ev);
            setRecoveryStatus(ev?.message || null);
          },
          onError: (err: Error) => {
            // eslint-disable-next-line no-console
            console.error('[EmailRecovery][start] error', err);
          },
          afterCall: async () => {},
        } as any,
      });

      setPendingEmailRecoveryKey(result.nearPublicKey);
      setPendingMailtoUrl(result.mailtoUrl);
      setPollingElapsedMs(null);

      toast.dismiss(toastId);

      toast.success('Recovery email draft ready', {
        description: (
          <span>
            Please send the email from <strong>{emailCandidate}</strong>. If your mail app did not open automatically,
            click the link below.
          </span>
        ),
      });

      setRecoveryStatus('Recovery email draft ready. Send it from your recovery address, then click Finalize.');
      window.location.href = result.mailtoUrl;

    } catch (error: any) {
      toast.dismiss(toastId);
      const message = error?.message || 'Failed to start email recovery flow';
      toast.error(message);
    } finally {
      setIsBusy(false);
    }
  };

  const handleFinalizeEmailRecoveryFlow = async (opts?: { suppressToast?: boolean }) => {
    if (!tatchi || !nearAccountId) return;
    if (!ensureTestnet()) return;

    const toastId = 'email-recovery-finalize';
    setIsBusy(true);
    setPollingElapsedMs(null);

    try {
      if (!opts?.suppressToast) {
        toast.loading('Waiting for recovery email and finalizing…', { id: toastId });
      }

      await tatchi.finalizeEmailRecovery({
        accountId: nearAccountId,
        nearPublicKey: pendingEmailRecoveryKey || undefined,
        options: {
          onEvent: (ev: any) => {
            // eslint-disable-next-line no-console
            console.debug('[EmailRecovery][finalize] event', ev);
            setRecoveryStatus(ev?.message || null);
            if (ev?.phase === 'email-recovery-polling-add-key') {
              const elapsed = Number((ev as any)?.data?.elapsedMs || 0);
              if (!Number.isNaN(elapsed)) setPollingElapsedMs(elapsed);
            }
            if (ev?.phase === 'email-recovery-complete') {
              setPendingMailtoUrl(null);
              setPendingEmailRecoveryKey(null);
              setPollingElapsedMs(null);
            }
          },
          onError: (err: Error) => {
            // eslint-disable-next-line no-console
            console.error('[EmailRecovery][finalize] error', err);
          },
          afterCall: async () => {},
        } as any,
      });

      if (!opts?.suppressToast) {
        toast.dismiss(toastId);
        toast.success('Email recovery completed on this device.');
      }
      setPendingEmailRecoveryKey(null);
      setPendingMailtoUrl(null);
      setRecoveryStatus('Email recovery completed on this device.');
    } catch (error: any) {
      if (!opts?.suppressToast) {
        toast.dismiss(toastId);
      }
      const message = error?.message || 'Failed to finalize email recovery';
      toast.error(message);
      setRecoveryStatus(message);
    } finally {
      setIsBusy(false);
    }
  };

  // Attempt to resume a pending recovery when page loads
  React.useEffect(() => {
    if (!tatchi || !nearAccountId || tatchi.configs.nearNetwork !== 'testnet') return;
    if (!pendingEmailRecoveryKey) return;
    let cancelled = false;
    const resume = async () => {
      setAutoResuming(true);
      setRecoveryStatus('Checking for pending email recovery…');
      try {
        await handleFinalizeEmailRecoveryFlow({ suppressToast: true });
      } catch {
        if (!cancelled) {
          setRecoveryStatus(null);
          setPollingElapsedMs(null);
        }
      } finally {
        if (!cancelled) setAutoResuming(false);
      }
    };
    void resume();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tatchi, nearAccountId, pendingEmailRecoveryKey]);

  const handleResetRecovery = () => {
    setPendingEmailRecoveryKey(null);
    setPendingMailtoUrl(null);
    setPollingElapsedMs(null);
    setRecoveryStatus(null);
  };

  return (
    <>
      <h2 className="demo-subtitle">Email Recovery (beta)</h2>
      <div className="action-text">
        Deploy a per-account recovery contract that can verify zk-email proofs
        for secure, email-based wallet recovery.
      </div>
      <div style={{ marginTop: '0.75rem', maxWidth: 480 }}>
        <EmailRecoveryFields
          value={recoveryEmails}
          onChange={setRecoveryEmails}
          disabled={isBusy}
          onChainHashes={onChainHashes}
          onClear={handleDeleteEmailRecovery}
        />
        <div style={{ marginTop: '0.5rem' }}>
          <LoadingButton
            onClick={handleSetRecoveryEmails}
            loading={isBusy}
            loadingText="Saving..."
            variant="secondary"
            size="small"
            style={{ minWidth: 180 }}
          >
            Set Recovery Emails
          </LoadingButton>
        </div>
      </div>
      <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 480 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 13, opacity: 0.9 }}>Recovery policy</span>
          <input
            type="number"
            min={1}
            step={1}
            value={minRequiredEmails}
            onChange={e => setMinRequiredEmails(e.target.value)}
            disabled={isBusy}
            placeholder="Min required emails"
            style={{
              width: 80,
              padding: '0.25rem 0.5rem',
              borderRadius: 9999,
              border: '1px solid rgba(255,255,255,0.16)',
              background: 'rgba(11,15,25,0.85)',
              color: 'inherit',
            }}
          />
          <span style={{ fontSize: 12, opacity: 0.8 }}>Email</span>
          <input
            type="number"
            min={1}
            step={1}
            value={maxAgeMinutes}
            onChange={e => setMaxAgeMinutes(e.target.value)}
            disabled={isBusy}
            placeholder="Max age (minutes)"
            style={{
              width: 120,
              padding: '0.25rem 0.5rem',
              borderRadius: 9999,
              border: '1px solid rgba(255,255,255,0.16)',
              background: 'rgba(11,15,25,0.85)',
              color: 'inherit',
            }}
          />
          <span style={{ fontSize: 12, opacity: 0.8 }}>min timeout</span>
          <LoadingButton
            onClick={handleSetRecoveryPolicy}
            loading={isBusy}
            loadingText="Saving..."
            variant="secondary"
            size="small"
            style={{ minWidth: 140 }}
          >
            Set Policy
          </LoadingButton>
        </div>
      </div>
      <div style={{ marginTop: '1.25rem', maxWidth: 480 }}>
        <h3 className="demo-subsubtitle">Recover this account via email (demo)</h3>
        <div className="action-text" style={{ marginBottom: '0.5rem' }}>
          Generate a recovery email using your first configured recovery address, send it, then finalize once the
          email has been processed on-chain.
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <input
            type="email"
            value={recoveryEmailInput}
            onChange={e => setRecoveryEmailInput(e.target.value)}
            placeholder="Recovery email to use"
            disabled={isBusy}
            style={{
              flex: '1 1 220px',
              minWidth: 220,
              padding: '0.5rem 0.75rem',
              borderRadius: 10,
              border: '1px solid rgba(255,255,255,0.16)',
              background: 'rgba(11,15,25,0.85)',
              color: 'inherit',
            }}
          />
          <LoadingButton
            onClick={handleStartEmailRecoveryFlow}
            loading={isBusy}
            loadingText="Preparing email…"
            variant="secondary"
            size="small"
            style={{ minWidth: 200 }}
          >
            Start Email Recovery
          </LoadingButton>
          <LoadingButton
            onClick={handleFinalizeEmailRecoveryFlow}
            loading={isBusy}
            loadingText="Finalizing…"
            variant="secondary"
            size="small"
            disabled={!pendingEmailRecoveryKey && !autoResuming}
            style={{ minWidth: 180 }}
          >
            Finalize Email Recovery
          </LoadingButton>
          <LoadingButton
            onClick={handleResetRecovery}
            loading={false}
            variant="ghost"
            size="small"
            disabled={isBusy}
          >
            Start Over
          </LoadingButton>
        </div>
        {pendingMailtoUrl && (
          <div style={{ marginTop: '0.5rem', fontSize: 12, opacity: 0.85 }}>
            If your email app did not open,{' '}
            <a href={pendingMailtoUrl} onClick={e => e.stopPropagation()}>
              click here to open the recovery email
            </a>{' '}
            and send it from your recovery address.
          </div>
        )}
        {recoveryStatus && (
          <div style={{ marginTop: '0.5rem', fontSize: 12, opacity: 0.9 }}>
            Status: {recoveryStatus}
            {pollingElapsedMs != null && (
              <span style={{ marginLeft: 6, opacity: 0.75 }}>
                (waiting {Math.round(pollingElapsedMs / 1000)}s for on-chain add-key)
              </span>
            )}
          </div>
        )}
      </div>
    </>
  );
};

export default SetupEmailRecovery;
