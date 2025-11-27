import React from 'react';
import { toast } from 'sonner';

import {
  ActionType,
  TxExecutionStatus,
  useTatchi,
} from '@tatchi-xyz/sdk/react';

import type { ActionArgs, ActionResult } from '@tatchi-xyz/sdk/react';
import { LoadingButton } from './LoadingButton';
import EmailRecoveryFields from './EmailRecoveryFields';
import { NEAR_EXPLORER_BASE_URL } from '../types';

const EMAIL_RECOVERER_CODE_ACCOUNT_ID = 'w3a-email-recoverer.testnet';
const ZK_EMAIL_VERIFIER_ACCOUNT_ID = 'zk-email-verifier-v1.testnet';
const EMAIL_DKIM_VERIFIER_ACCOUNT_ID = 'email-dkim-verifier-v1.testnet';
// Minimal non-empty "empty" contract bytes so DeployContract validation passes
const EMPTY_CONTRACT_BYTES = new Uint8Array([0]);

export const SetupEmailRecovery: React.FC = () => {
  const {
    loginState: { isLoggedIn, nearAccountId },
    tatchi,
  } = useTatchi();

  const [isBusy, setIsBusy] = React.useState(false);
  const [recoveryEmails, setRecoveryEmails] = React.useState<string[]>(['']);

  if (!isLoggedIn || !nearAccountId) {
    return null;
  }

  const handleSetupEmailRecovery = async () => {
    if (!tatchi || !nearAccountId) return;

    if (tatchi.configs.nearNetwork !== 'testnet') {
      toast.error('Email recovery demo is only available on testnet for now.');
      return;
    }

    const toastId = 'email-recovery-setup';
    setIsBusy(true);

    try {
      toast.loading('Setting up email recovery using global contract...', { id: toastId });

      const actions: ActionArgs[] = [
        {
          type: ActionType.UseGlobalContract,
          accountId: EMAIL_RECOVERER_CODE_ACCOUNT_ID,
        },
        {
          type: ActionType.FunctionCall,
          methodName: 'new',
          args: {
            zk_email_verifier: ZK_EMAIL_VERIFIER_ACCOUNT_ID,
            email_dkim_verifier: EMAIL_DKIM_VERIFIER_ACCOUNT_ID,
            policy: null,
            // TODO: Wire hashed recovery emails when UI is ready.
            // Placeholder: recovery_emails will be derived from recoveryEmails once hashing is wired.
            recovery_emails: [] as number[][],
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
              toast.success('Email recovery contract deployed', {
                description: (
                  <a href={txLink} target="_blank" rel="noopener noreferrer">
                    View transaction on NearBlocks
                  </a>
                ),
              });
            } else if (success) {
              toast.success('Email recovery contract deployed');
            } else {
              const message = actionResult?.error || 'Failed to deploy email recovery contract';
              toast.error(message);
            }
          },
        },
      });

      if (!result?.success) {
        toast.error(result?.error || 'Failed to deploy email recovery contract');
      }
    } catch (error: any) {
      try {
        toast.dismiss(toastId);
      } catch {}
      const message = error?.message || 'Failed to setup email recovery';
      toast.error(message);
    } finally {
      setIsBusy(false);
    }
  };

  const handleDeleteEmailRecovery = async () => {
    if (!tatchi || !nearAccountId) return;

    if (tatchi.configs.nearNetwork !== 'testnet') {
      toast.error('Email recovery demo is only available on testnet for now.');
      return;
    }

    const toastId = 'email-recovery-delete';
    setIsBusy(true);

    try {
      toast.loading('Requesting contract deletion (clearing code)...', { id: toastId });

      const result = await tatchi.executeAction({
        nearAccountId,
        receiverId: nearAccountId,
        // Deleting a contract's code on NEAR is equivalent to deploying
        // an "empty" contract for this account.
        actionArgs: [
          {
            type: ActionType.DeployContract,
            code: EMPTY_CONTRACT_BYTES,
          },
        ],
        options: {
          waitUntil: TxExecutionStatus.EXECUTED_OPTIMISTIC,
          afterCall: (success: boolean, actionResult?: ActionResult) => {
            try {
              toast.dismiss(toastId);
            } catch {}

            const txId = actionResult?.transactionId;

            if (success && txId) {
              const txLink = `${NEAR_EXPLORER_BASE_URL}/transactions/${txId}`;
              toast.success('Email recovery contract deleted', {
                description: (
                  <a href={txLink} target="_blank" rel="noopener noreferrer">
                    View transaction on NearBlocks
                  </a>
                ),
              });
            } else if (success) {
              toast.success('Email recovery contract deleted');
            } else {
              const message = actionResult?.error || 'Failed to delete email recovery contract';
              toast.error(message);
            }
          },
        },
      });

      if (!result?.success) {
        toast.error(result?.error || 'Failed to delete email recovery contract');
      }
    } catch (error: any) {
      try {
        toast.dismiss(toastId);
      } catch {}
      const message = error?.message || 'Failed to delete email recovery contract';
      toast.error(message);
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="action-section" style={{ marginTop: '1rem' }}>
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
        />
      </div>
      <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <LoadingButton
          onClick={handleSetupEmailRecovery}
          loading={isBusy}
          loadingText="Setting up..."
          variant="secondary"
          size="medium"
          style={{ width: 220 }}
        >
          Setup Email Recovery
        </LoadingButton>
        <LoadingButton
          onClick={handleDeleteEmailRecovery}
          loading={isBusy}
          loadingText="Deleting..."
          variant="secondary"
          size="medium"
          style={{ width: 260 }}
        >
          Delete Recovery Contract
        </LoadingButton>
      </div>
    </div>
  );
};

export default SetupEmailRecovery;
