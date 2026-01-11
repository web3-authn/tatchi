import React, { useCallback, useState } from 'react';
import toast from 'react-hot-toast';
import {
  ActionPhase,
  ActionType,
  TouchIcon,
  type ActionResult,
  TxExecutionStatus,
  useTatchi,
} from '@tatchi-xyz/sdk/react';
import type { ActionArgs } from '@tatchi-xyz/sdk/react';
import { WEBAUTHN_CONTRACT_ID, NEAR_EXPLORER_BASE_URL } from '../config';
import { GlassBorder } from './GlassBorder';
import { LoadingButton } from './LoadingButton';


interface EmbeddedTxButtonProps {
};

export const EmbeddedTxButton: React.FC<EmbeddedTxButtonProps> = ({  }) => {

  const {
    loginState: { isLoggedIn, nearAccountId },
    tatchi,
  } = useTatchi();

  const [embeddedGreetingInput, setEmbeddedGreetingInput] = useState('Hello from Embedded Component!');
  const [batchLoading, setBatchLoading] = useState(false);

  const createEmbeddedGreetingAction = useCallback((): ActionArgs => {
    const newGreetingMessage = `${embeddedGreetingInput.trim()} [updated: ${new Date().toLocaleTimeString()}]`;
    return {
      type: ActionType.FunctionCall,
      methodName: 'set_greeting',
      args: { greeting: newGreetingMessage },
      gas: '30000000000000',
      deposit: '0',
    };
  }, [embeddedGreetingInput]);

  const handleBatchSign = useCallback(async () => {
    if (!isLoggedIn || !nearAccountId) return;
    if (batchLoading) return;

    setBatchLoading(true);
    try {
      await tatchi.signAndSendTransactions({
        nearAccountId,
        transactions: [
          {
            receiverId: WEBAUTHN_CONTRACT_ID,
            actions: [
              createEmbeddedGreetingAction(),
              {
                type: ActionType.Transfer,
                amount: '100000000000000000000',
              },
            ],
          },
          {
            receiverId: WEBAUTHN_CONTRACT_ID,
            actions: [
              {
                type: ActionType.Transfer,
                amount: '200000000000000000000',
              },
            ],
          },
        ],
        options: {
          waitUntil: TxExecutionStatus.EXECUTED_OPTIMISTIC,
          onEvent: (event) => {
            switch (event.phase) {
              case ActionPhase.STEP_1_PREPARATION:
              case ActionPhase.STEP_2_USER_CONFIRMATION:
              case ActionPhase.STEP_3_WEBAUTHN_AUTHENTICATION:
              case ActionPhase.STEP_4_AUTHENTICATION_COMPLETE:
              case ActionPhase.STEP_5_TRANSACTION_SIGNING_PROGRESS:
              case ActionPhase.STEP_6_TRANSACTION_SIGNING_COMPLETE:
              case ActionPhase.STEP_7_BROADCASTING:
                toast.loading(event.message, { id: 'batch' });
                break;
              case ActionPhase.STEP_8_ACTION_COMPLETE:
                toast.success(event.message, { id: 'batch' });
                break;
              case ActionPhase.ACTION_ERROR:
              case ActionPhase.WASM_ERROR:
                toast.error(`Transaction failed: ${event.error}`, { id: 'batch' });
                break;
            }
          },
          afterCall: (success: boolean, result?: ActionResult[]) => {
            if (!success) return;

            const last = result && result.length ? result[result.length - 1] : result?.[0];
            const txId = last?.transactionId;
            if (txId) {
              const txLink = `${NEAR_EXPLORER_BASE_URL}/transactions/${txId}`;
              toast.success(
                (
                  <span>
                    Batch flow complete.{' '}
                    <a href={txLink} target="_blank" rel="noopener noreferrer">View transaction</a>
                  </span>
                ),
                { id: 'batch' }
              );
            } else {
              toast.success('Batch flow success (no TxID)', { id: 'batch' });
            }
          },
          onError: (error) => {
            const name = error?.name ?? '';
            const message = error?.message || String(error);
            const lower = message.toLowerCase();
            const isCancellation = message.includes('The operation either timed out or was not allowed') ||
              name === 'NotAllowedError' ||
              name === 'AbortError' ||
              message.includes('NotAllowedError') ||
              message.includes('AbortError') ||
              lower.includes('user cancelled') ||
              lower.includes('user canceled') ||
              lower.includes('user aborted');
            if (isCancellation) {
              toast('Transaction cancelled by user', { id: 'batch' });
              return;
            }
            toast.error(`Batch flow failed: ${message}`, { id: 'batch' });
          },
        },
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`Batch flow failed: ${message}`, { id: 'batch' });
    } finally {
      setBatchLoading(false);
    }
  }, [batchLoading, createEmbeddedGreetingAction, isLoggedIn, nearAccountId, tatchi]);

  if (!isLoggedIn || !nearAccountId) {
    return null;
  }

  return (
    <GlassBorder
      style={{ marginTop: '1rem', zIndex: 2 }}
      className="section-root"
      >
      <div className="section-container">
        <h2 className="section-title">
          Example 2: Batch Sign Transactions
        </h2>
        <p className="section-caption">
          Build your own button UI and call <code>tatchi.signAndSendTransactions</code>.
          The confirmation UX still runs inside the wallet iframe.
        </p>
      </div>

      <div className="section-container">
        <input
          type="text"
          name="embedded-greeting"
          className="embedded-tx-input"
          value={embeddedGreetingInput}
          onChange={(e) => setEmbeddedGreetingInput(e.target.value)}
          placeholder="Enter your greeting message"
        />
      </div>

      <div className="section-container">
        <LoadingButton
          onClick={handleBatchSign}
          loading={batchLoading}
          loadingText="Batch signing..."
          variant="primary"
          size="medium"
          style={{
            width: '480px',
            height: 44,
            borderRadius: '2rem',
            border: 'none',
            fontSize: '16px',
            boxShadow: '0px 0px 3px 1px rgba(0, 0, 0, 0.1)',
            background: 'var(--w3a-colors-primary)',
            color: 'white',
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <TouchIcon width={18} height={18} strokeWidth={2} />
            Batch Sign Actions
          </span>
        </LoadingButton>
      </div>
    </GlassBorder>
  );
};

export default EmbeddedTxButton;
