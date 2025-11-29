import React from 'react';
import { toast } from 'sonner';

import { TxExecutionStatus, useTatchi } from '@tatchi-xyz/sdk/react';

import type { ActionResult } from '@tatchi-xyz/sdk/react';
import { LoadingButton } from './LoadingButton';
import EmailRecoveryFields from './EmailRecoveryFields';
import { NEAR_EXPLORER_BASE_URL } from '../types';

const bytesToHex = (bytes: number[] | Uint8Array): string => {
  const arr = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes);
  return `0x${Array.from(arr)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')}`;
};

export const SetupEmailRecovery: React.FC = () => {
  const {
    loginState: { isLoggedIn, nearAccountId },
    tatchi,
  } = useTatchi();

  const [isBusy, setIsBusy] = React.useState(false);
  const [recoveryEmails, setRecoveryEmails] = React.useState<string[]>(['']);
  const [minRequiredEmails, setMinRequiredEmails] = React.useState<string>('1');
  const [maxAgeMinutes, setMaxAgeMinutes] = React.useState<string>('30');
  const [rawOnChainHashes, setRawOnChainHashes] = React.useState<number[][]>([]);
  const [onChainHashes, setOnChainHashes] = React.useState<string[]>([]);
  const [localRecoveryEmails, setLocalRecoveryEmails] = React.useState<Array<{ hashHex: string; email: string }> | null>(null);

  const refreshOnChainEmails = React.useCallback(async () => {
    if (!tatchi || !nearAccountId) {
      setRawOnChainHashes([]);
      return;
    }

    if (tatchi.configs.nearNetwork !== 'testnet') {
      setRawOnChainHashes([]);
      return;
    }

    try {
      const nearClient = tatchi.getNearClient();
      const code = await nearClient.viewCode(nearAccountId);
      const hasContract = !!code && code.byteLength > 0;
      if (!hasContract) {
        setRawOnChainHashes([]);
        return;
      }

      const hashes = await nearClient.view<Record<string, never>, number[][]>({
        account: nearAccountId,
        method: 'get_recovery_emails',
        args: {} as Record<string, never>,
      });

      if (!Array.isArray(hashes)) {
        setRawOnChainHashes([]);
        return;
      }

      setRawOnChainHashes(hashes as number[][]);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[EmailRecovery] Failed to fetch on-chain recovery emails', err);
      setRawOnChainHashes([]);
    }
  }, [tatchi, nearAccountId]);

  React.useEffect(() => {
    void refreshOnChainEmails();
  }, [refreshOnChainEmails]);

  React.useEffect(() => {
    let cancelled = false;

    const loadLocalRecoveryEmails = async () => {
      if (!tatchi || !nearAccountId) {
        setLocalRecoveryEmails(null);
        return;
      }

      try {
        const records = await tatchi.getRecoveryEmails(nearAccountId);
        const pairs = (records || []).map(rec => ({
          hashHex: rec.hashHex,
          email: rec.email,
        }));
        if (!cancelled) {
          setLocalRecoveryEmails(pairs);
        }
      } catch (error) {
        // Best-effort: failures should not break the UI
        // eslint-disable-next-line no-console
        console.warn('[EmailRecovery] Failed to load local recovery emails', error);
        if (!cancelled) {
          setLocalRecoveryEmails(null);
        }
      }
    };

    void loadLocalRecoveryEmails();

    return () => {
      cancelled = true;
    };
  }, [nearAccountId]);

  React.useEffect(() => {
    let cancelled = false;

    const recomputeDisplay = () => {
      if (!nearAccountId || !rawOnChainHashes.length) {
        setOnChainHashes([]);
        return;
      }

      try {
        const emailByHex: Record<string, string> = {};

        if (localRecoveryEmails?.length) {
          localRecoveryEmails.forEach(entry => {
            if (!entry?.hashHex || !entry?.email) return;
            if (!emailByHex[entry.hashHex]) {
              emailByHex[entry.hashHex] = entry.email;
            }
          });
        }

        const display = rawOnChainHashes.map(h => {
          const hex = bytesToHex(h);
          return emailByHex[hex] || hex;
        });

        if (!cancelled) {
          setOnChainHashes(display);
        }
      } catch (e) {
        if (!cancelled) {
          const hex = rawOnChainHashes.map(h => bytesToHex(h));
          setOnChainHashes(hex);
        }
      }
    };
    recomputeDisplay();

    return () => {
      cancelled = true;
    };
  }, [nearAccountId, rawOnChainHashes, localRecoveryEmails]);

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
              void refreshOnChainEmails();
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
        setLocalRecoveryEmails([]);
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
              void refreshOnChainEmails();
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
        try {
          const records = await tatchi.getRecoveryEmails(nearAccountId);
          const pairs = (records || []).map(rec => ({
            hashHex: rec.hashHex,
            email: rec.email,
          }));
          setLocalRecoveryEmails(pairs);
        } catch (error) {
          // eslint-disable-next-line no-console
          console.warn('[EmailRecovery] Failed to refresh local recovery emails', error);
        }
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
    </>
  );
};

export default SetupEmailRecovery;
