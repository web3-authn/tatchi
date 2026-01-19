import React from 'react';
import { toast } from 'sonner';

import { TxExecutionStatus, useTatchi } from '@tatchi-xyz/sdk/react';

import type { ActionResult } from '@tatchi-xyz/sdk/react';
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

  if (!isLoggedIn || !nearAccountId) {
    return null;
  }

  return (
    <>
      <h2 className="demo-subtitle">Email Recovery (beta)</h2>
      <div className="action-text">
        Set up recovery emails so if you lose your passkey later, you can send an encrypted email on-chain
        to a contract that verifies your email signature and recovers your account.
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
	    </>
	  );
	};

export default SetupEmailRecovery;
