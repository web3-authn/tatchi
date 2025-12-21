import React from 'react';
import { toast } from 'sonner';

import { TxExecutionStatus, useTatchi } from '@tatchi-xyz/sdk/react';

import type { ActionResult, ActionArgs } from '@tatchi-xyz/sdk/react';
import { ActionType } from '@tatchi-xyz/sdk/react';
import { LoadingButton } from './LoadingButton';
import EmailRecoveryFields from './EmailRecoveryFields';
import EmailRecoveryPolicy from './EmailRecoveryPolicy';
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

  const ensureTestnet = () => {
    if (tatchi.configs.nearNetwork !== 'testnet') {
      toast.error('Email recovery demo is only available on testnet for now.');
      return false;
    }
    return true;
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

  if (!isLoggedIn || !nearAccountId) {
    return null;
  }

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
        />
        <div style={{ marginTop: '0.5rem' }}>
          <LoadingButton
            onClick={handleSetRecoveryEmails}
            loading={isBusy}
            loadingText="Saving..."
            variant="secondary"
            size="small"
            style={{ width: 200 }}
          >
            Set Recovery Emails
          </LoadingButton>
        </div>
      </div>
      <EmailRecoveryPolicy
        minRequiredEmails={minRequiredEmails}
        onChangeMinRequiredEmails={setMinRequiredEmails}
        maxAgeMinutes={maxAgeMinutes}
        onChangeMaxAgeMinutes={setMaxAgeMinutes}
        disabled={isBusy}
        loading={isBusy}
        onSubmit={handleSetRecoveryPolicy}
      />
    </>
  );
};

export default SetupEmailRecovery;
