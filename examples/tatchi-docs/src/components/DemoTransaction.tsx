import React, { useCallback, useState } from 'react';
import { toast } from 'sonner';

import {
  ActionPhase,
  ActionType,
  TouchIdWithText,
  TxExecutionStatus,
  usePasskeyContext,
} from '@tatchi-xyz/sdk/react';
import { SendTxButtonWithTooltip } from '@tatchi-xyz/sdk/react';
import type { ActionArgs, FunctionCallAction } from '@tatchi-xyz/sdk/react';

import { GlassBorder } from './GlassBorder';
import { LoadingButton } from './LoadingButton';
import { useSetGreeting } from '../hooks/useSetGreeting';
import {
  WEBAUTHN_CONTRACT_ID,
  NEAR_EXPLORER_BASE_URL,
} from '../config';

import './DemoTransaction.css';
import './EmbeddedTxButton.css';
import { DemoMultiTx } from './DemoMultiTx';
import Refresh from './icons/Refresh';

export const DemoTransaction: React.FC = () => {
  const {
    loginState: {
      isLoggedIn,
      nearAccountId,
    },
    passkeyManager,
  } = usePasskeyContext();

  const {
    onchainGreeting,
    isLoading,
    fetchGreeting,
    error,
  } = useSetGreeting();

  const networkPostfix = passkeyManager.configs.nearNetwork == 'mainnet' ? 'near' : 'testnet';

  // Inputs for the two demo flows
  const [greetingInput, setGreetingInput] = useState('Hello from Tatchi!');
  const [txLoading, setTxLoading] = useState(false);
  const [embeddedGreetingInput, setEmbeddedGreetingInput] = useState('Hello Embedded Button!');

  const handleRefreshGreeting = async () => {
    await fetchGreeting();
  };

  const handleSetGreeting = useCallback(async () => {
    if (!greetingInput.trim() || !isLoggedIn || !nearAccountId) return;

    const newGreetingMessage = `${greetingInput.trim()} [updated: ${new Date().toLocaleTimeString()}]`;
    const actionToExecute: FunctionCallAction = {
      type: ActionType.FunctionCall,
      methodName: 'set_greeting',
      args: { greeting: newGreetingMessage },
      gas: '30000000000000',
      deposit: '0',
    };

    setTxLoading(true);
    try {
      await passkeyManager.executeAction({
      nearAccountId,
      receiverId: WEBAUTHN_CONTRACT_ID,
      actionArgs: actionToExecute,
      options: {
        onEvent: (event) => {
          switch (event.phase) {
            case ActionPhase.STEP_1_PREPARATION:
            case ActionPhase.STEP_4_WEBAUTHN_AUTHENTICATION:
            case ActionPhase.STEP_5_AUTHENTICATION_COMPLETE:
            case ActionPhase.STEP_6_TRANSACTION_SIGNING_PROGRESS:
            case ActionPhase.STEP_7_TRANSACTION_SIGNING_COMPLETE:
              toast.loading(event.message, { id: 'greeting' });
              break;
            case ActionPhase.STEP_8_BROADCASTING:
              toast.success(event.message, { id: 'greeting' });
              break;
            case ActionPhase.STEP_9_ACTION_COMPLETE:
              toast.success(event.message, { id: 'greeting' });
              break;
            case ActionPhase.ACTION_ERROR:
            case ActionPhase.WASM_ERROR:
              toast.error(`Transaction failed: ${event.error}`, { id: 'greeting' });
              break;
          }
        },
        waitUntil: TxExecutionStatus.EXECUTED_OPTIMISTIC,
        afterCall: (success: boolean, result?: any) => {
          if (success && result?.transactionId) {
            const txId = result.transactionId;
            const txLink = `${NEAR_EXPLORER_BASE_URL}/transactions/${txId}`;
            toast.success('Greeting updated on-chain', {
              id: 'greeting',
              description: (
                <a href={txLink} target="_blank" rel="noopener noreferrer">
                  View transaction on NearBlocks
                </a>
              ),
            });
            setGreetingInput('');
            // Refresh the greeting after success
            setTimeout(() => { void fetchGreeting(); }, 1000);
          } else if (success) {
            toast.success('Greeting updated (no TxID)');
            setGreetingInput('');
            setTimeout(() => { void fetchGreeting(); }, 1000);
          } else {
            toast.error(`Greeting update failed: ${result?.error || 'Unknown error'}`);
          }
          setTxLoading(false);
        },
      },
      });
    } catch (e) {
      setTxLoading(false);
    }
  }, [greetingInput, isLoggedIn, nearAccountId, passkeyManager, fetchGreeting]);

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

  if (!isLoggedIn || !nearAccountId) {
    return null;
  }

  const accountName = nearAccountId?.split('.')?.[0];

  return (
    <div style={{ maxWidth: 480, marginTop: '1rem' }}>
      {/* Greeting flow */}
      <GlassBorder>
        <div className="greeting-content">
          <div className="greeting-header">
            <h2 className="greeting-title">Welcome, {accountName}</h2>
          </div>
          <h2 className="embedded-tx-title">Sign Transactions with TouchId</h2>
          <div className="greeting-controls-box">

            <div className="on-chain-greeting-box">
              <button
                onClick={handleRefreshGreeting}
                disabled={isLoading}
                title="Refresh Greeting"
                className="refresh-icon-button"
              >
                <Refresh size={22} strokeWidth={2} />
              </button>
              <p><strong>{onchainGreeting ?? '...'}</strong></p>
            </div>

            <div className="greeting-input-group">
              <input
                type="text"
                value={greetingInput}
                onChange={(e) => setGreetingInput(e.target.value)}
                placeholder="Enter new greeting"
                className="greeting-focus-ring"
              />
              <LoadingButton
                onClick={handleSetGreeting}
                loading={txLoading}
                loadingText="Processing..."
                variant="primary"
                size="medium"
                className="greeting-btn"
                disabled={!greetingInput.trim() || txLoading}
                style={{ width: 200 }}
              >
                Set New Greeting
              </LoadingButton>
            </div>

            {error && (
              <div className="error-message">Error: {error}</div>
            )}
          </div>
        </div>

        <div className="embedded-tx-page-root">
          <h2 className="embedded-tx-title">Batch Sign Transactions</h2>
          <div className="embedded-tx-caption">
            Tx data in the tooltip is validated before signing.
            What you see is what you sign.
          </div>

          <div className="test-embedded-section">
            <SendTxButtonWithTooltip
              nearAccountId={nearAccountId}
              txSigningRequests={[
                {
                  receiverId: WEBAUTHN_CONTRACT_ID,
                  actions: [
                    createEmbeddedGreetingAction(),
                    { type: ActionType.Transfer, amount: '100000000000000000000' },
                  ],
                },
                {
                  receiverId: `jeff.${networkPostfix}`,
                  actions: [ { type: ActionType.Transfer, amount: '20000000000000000000' } ],
                },
                {
                  receiverId: `jensen.${networkPostfix}`,
                  actions: [ { type: ActionType.Transfer, amount: '30000000000000000000' } ],
                },
              ]}
              onEvent={(event) => {
                switch (event.phase) {
                  case ActionPhase.STEP_1_PREPARATION:
                  case ActionPhase.STEP_2_USER_CONFIRMATION:
                  case ActionPhase.STEP_3_CONTRACT_VERIFICATION:
                    toast.loading(event.message, { id: 'embedded' });
                    break;
                  case ActionPhase.STEP_4_WEBAUTHN_AUTHENTICATION:
                  case ActionPhase.STEP_5_AUTHENTICATION_COMPLETE:
                  case ActionPhase.STEP_6_TRANSACTION_SIGNING_PROGRESS:
                  case ActionPhase.STEP_7_TRANSACTION_SIGNING_COMPLETE:
                  case ActionPhase.STEP_8_BROADCASTING:
                    toast.loading(event.message, { id: 'embedded' });
                    break;
                  case ActionPhase.STEP_9_ACTION_COMPLETE:
                    toast.success(event.message, { id: 'embedded' });
                    break;
                  case ActionPhase.ACTION_ERROR:
                  case ActionPhase.WASM_ERROR:
                    toast.error(`Transaction failed: ${event.error}`, { id: 'embedded' });
                    break;
                }
              }}
              options={{
                waitUntil: TxExecutionStatus.EXECUTED_OPTIMISTIC,
                beforeCall: () => {
                  toast.loading('Preparing embedded transaction...', { id: 'embedded' });
                },
                afterCall: (success: boolean, result?: any) => {
                  if (success) {
                    let txId: string | undefined;
                    if (Array.isArray(result)) {
                      const last = result[result.length - 1] ?? result[0];
                      txId = last?.transactionId;
                    } else {
                      txId = result?.transactionId;
                    }
                    if (txId) {
                      const txLink = `${NEAR_EXPLORER_BASE_URL}/transactions/${txId}`;
                      toast.success('Embedded flow complete', {
                        id: 'embedded',
                        description: (
                          <a href={txLink} target="_blank" rel="noopener noreferrer">
                            View transaction on NearBlocks
                          </a>
                        ),
                      });
                    } else {
                      toast.success('Embedded flow complete');
                    }
                    setTimeout(() => { void fetchGreeting(); }, 1000);
                  } else {
                    toast.error(`Embedded flow failed: ${result?.error || 'Unknown error'}`, { id: 'embedded' });
                  }
                },
                onError: (error: any) => {
                  const message = error instanceof Error ? error.message : String(error);
                  toast.error(`Transaction failed: ${message}`, { id: 'embedded' });
                },
              }}
              buttonStyle={{
                color: 'white',
                background: 'var(--w3a-colors-primary)',
                borderRadius: '2rem',
                border: 'none',
                boxShadow: '0px 0px 3px 1px rgba(0, 0, 0, 0.1)',
                fontSize: '16px',
                height: '44px',
              }}
              buttonHoverStyle={{
                background: 'var(--w3a-colors-primaryHover)',
                boxShadow: '0px 0px 4px 2px rgba(0, 0, 0, 0.2)',
              }}
              tooltipPosition={{
                width: 'min(330px, calc(var(--w3a-vw, 100vw) - 1rem))',
                height: 'auto',
                position: 'bottom-left',
              }}
              buttonTextElement={<TouchIdWithText buttonText="Send Transaction" />}
              onCancel={() => toast('Transaction cancelled by user', { id: 'embedded' })}
              onSuccess={(result: any) => {
                try {
                  let txId: string | undefined;
                  if (Array.isArray(result)) {
                    const last = result[result.length - 1] ?? result[0];
                    txId = last?.transactionId;
                  } else {
                    txId = result?.transactionId;
                  }

                  if (txId) {
                    const txLink = `${NEAR_EXPLORER_BASE_URL}/transactions/${txId}`;
                    toast.success('Tx Success', {
                      id: 'embedded',
                      description: (
                        <a href={txLink} target="_blank" rel="noopener noreferrer">
                          View transaction on NearBlocks ({txId})
                        </a>
                      ),
                    });
                  } else {
                    toast.success('Tx Success', { id: 'embedded' });
                  }
                } catch {
                  toast.success('Tx Success', { id: 'embedded' });
                }
                // Refresh the greeting after success
                setTimeout(() => { void fetchGreeting(); }, 1000);
              }}
            />
          </div>
        </div>

        <div style={{ marginTop: '1rem' }}>
          <DemoMultiTx />
        </div>
      </GlassBorder>
    </div>
  );
};

export default DemoTransaction;
