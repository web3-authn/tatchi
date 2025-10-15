import React, { useCallback, useState } from 'react';
import {
  ActionType,
  SecureSendTxButton,
  TouchIdWithText,
  TxExecutionStatus,
  usePasskeyContext,
} from '@tatchi/sdk/react';
import type { ActionArgs } from '@tatchi/sdk/react';
import { WEBAUTHN_CONTRACT_ID, NEAR_EXPLORER_BASE_URL } from '../config';
import { useSetGreeting } from '../hooks/useSetGreeting';
import { GlassBorder } from './GlassBorder';
import './EmbeddedTxButton.css';
import type { LastTxDetails } from '../types';

type Props = { setLastTxDetails: (details: LastTxDetails | null) => void };

export const EmbeddedTxButton: React.FC<Props> = ({ setLastTxDetails }) => {
  const {
    loginState: { isLoggedIn, nearAccountId },
  } = usePasskeyContext();

  const { fetchGreeting } = useSetGreeting();
  const [embeddedGreetingInput, setEmbeddedGreetingInput] = useState('Hello from Embedded Component!');
  const [embeddedResult, setEmbeddedResult] = useState('');
  const [embeddedError, setEmbeddedError] = useState('');
  const [isEmbeddedLoading, setIsEmbeddedLoading] = useState(false);

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

  const handleEmbeddedCancel = useCallback(() => {
    setIsEmbeddedLoading(false);
    setEmbeddedResult('Transaction cancelled by user');
    setEmbeddedError('');
    try { setLastTxDetails({ id: 'N/A', link: '#', message: 'Transaction cancelled by user' }); } catch {}
  }, []);

  const handleEmbeddedSuccess = useCallback((result: any) => {
    setEmbeddedResult(`Transaction result: ${JSON.stringify(result, null, 2)}`);
    setEmbeddedError('');
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
        setLastTxDetails({ id: txId, link: txLink, message: `Greeting updated: ${embeddedGreetingInput.trim()}` });
      } else {
        setLastTxDetails({ id: 'N/A', link: '#', message: 'Success, no TxID in response' });
      }
    } catch {}
    setTimeout(() => { void fetchGreeting(); }, 1100);
  }, [fetchGreeting, embeddedGreetingInput, setLastTxDetails]);

  const handleEmbeddedError = useCallback((error: unknown) => {
    setIsEmbeddedLoading(false);
    const message = error instanceof Error ? error.message : String(error);
    setEmbeddedError(`Transaction failed: ${message}`);
    setEmbeddedResult('');
  }, []);

  if (!isLoggedIn || !nearAccountId) {
    return null; // Only show when logged in
  }

  return (
    <GlassBorder style={{ marginTop: '1rem', zIndex: 1 }}>
      <div className="embedded-tx-page-root">
        <h2 className="embedded-tx-title">
          Embedded Iframe Transaction Button
        </h2>
        <p className="embedded-tx-caption">
          This secure iframe button validates tx data in the tooltip before signing.
        </p>

        <div className="embedded-tx-input-group">
          <label className="embedded-tx-input-label">Greeting Input:</label>
          <input
            type="text"
            value={embeddedGreetingInput}
            onChange={(e) => setEmbeddedGreetingInput(e.target.value)}
            placeholder="Enter your greeting message"
            className="embedded-tx-input embedded-tx-focus-ring"
          />
          <p className="embedded-tx-input-help">
            The greeting is set on-chain after the transaction is finalized.
          </p>
        </div>

        <div className="test-embedded-section">
          <label className="test-embedded-section-label">Embedded Component:</label>
          <SecureSendTxButton
              nearAccountId={nearAccountId}
              txSigningRequests={[
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
              ]}
              options={{
                beforeCall: () => {
                  setIsEmbeddedLoading(true);
                  setEmbeddedError('');
                  setEmbeddedResult('');
                  try { setLastTxDetails(null); } catch {}
                },
                waitUntil: TxExecutionStatus.FINAL,
                afterCall: (success: boolean, result?: any) => {
                  setIsEmbeddedLoading(false);
                  try {
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
                        setLastTxDetails({ id: txId, link: txLink, message: `Embedded flow complete` });
                      } else {
                        setLastTxDetails({ id: 'N/A', link: '#', message: 'Embedded flow success (no TxID)' });
                      }
                    } else {
                      setLastTxDetails({ id: 'N/A', link: '#', message: `Embedded flow failed: ${result?.error || 'Unknown error'}` });
                    }
                  } catch {}
                },
                onError: (error) => {
                  handleEmbeddedError(error);
                },
              }}
              buttonStyle={{
                background: 'var(--w3a-colors-primary)',
                borderRadius: '24px',
                border: 'none',
                transition: 'all 0.3s ease',
                boxShadow: '0px 1px 1px 2px rgba(0, 0, 0, 0.1)',
                fontSize: '16px',
                height: '44px',
              }}
              buttonHoverStyle={{
                background: 'var(--w3a-colors-primaryHover)',
                boxShadow: '0px 2px 4px 3px rgba(0, 0, 0, 0.2)',
              }}
              tooltipPosition={{
                // Constrain tooltip width to dynamic viewport width when supported
                width: 'min(330px, calc(var(--w3a-vw, 100vw) - 1rem))',
                height: 'auto',
                position: 'bottom-left',
              }}
              txTreeTheme="light"
              buttonTextElement={<TouchIdWithText buttonText="Send Transaction" />}
              onCancel={handleEmbeddedCancel}
              onSuccess={handleEmbeddedSuccess}
            />
        </div>

        {isEmbeddedLoading && (
          <div className="embedded-tx-status-section">
            <label className="embedded-tx-status-label">Processing:</label>
            <div className="embedded-tx-loading">
              <div className="embedded-tx-spinner"></div>
              Processing transaction...
            </div>
          </div>
        )}

        {embeddedResult && (
          <div className="embedded-tx-status-section">
            <label className="embedded-tx-status-label">Success:</label>
            <div className="embedded-tx-success">
              <pre>{embeddedResult}</pre>
            </div>
          </div>
        )}

        {embeddedError && (
          <div className="embedded-tx-status-section">
            <label className="embedded-tx-status-label">Error:</label>
            <div className="embedded-tx-error">
              <pre>{embeddedError}</pre>
            </div>
          </div>
        )}
      </div>
    </GlassBorder>
  );
};

export default EmbeddedTxButton;
