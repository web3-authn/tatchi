import React, { useState } from 'react';
import { usePasskeyContext } from '@web3authn/passkey/react';
import { SecureTxConfirmButton, ActionType } from '@web3authn/passkey/react';
import type { ActionArgs } from '@web3authn/passkey/react';
import { WEBAUTHN_CONTRACT_ID } from '../config';
import './EmbeddedTxConfirmPage.css';

/**
 * Demo page showing how to use EmbeddedTxConfirm with the setGreeting functionality.
 *
 * This demonstrates the complete flow:
 * 1. Embedded component displays transaction details for setting a greeting
 * 2. User clicks "Send Transaction" button
 * 3. Component dispatches to WASM worker for automatic validation
 * 4. WASM worker processes the transaction without additional confirmation
 * 5. Transaction result is returned to the main thread
 */
export const EmbeddedTxConfirmPage: React.FC = () => {
  const { loginState } = usePasskeyContext();
  const [greetingInput, setGreetingInput] = useState('Hello from Embedded Component!');
  const [result, setResult] = useState<string>('');
  const [error, setError] = useState<string>('');

  // State for transaction results
  const [loading, setLoading] = useState(false);

  // Create transaction data for setting greeting
  const createGreetingAction = (): ActionArgs => {
    const newGreetingMessage = `${greetingInput.trim()} [updated: ${new Date().toLocaleTimeString()}]`;

    return {
      type: ActionType.FunctionCall,
      methodName: 'set_greeting',
      args: { greeting: newGreetingMessage },
      gas: '30000000000000',
      deposit: '0'
    };
  };

  const handleCancel = () => {
    setResult('Transaction cancelled by user');
    setError('');
  };

  if (!loginState.isLoggedIn) {
    return (
      <div className="embedded-tx-page-root">
        <div className="embedded-tx-translucent-container">
          <div className="embedded-tx-content-area">
            <div className="embedded-tx-login-prompt">
              <h2 className="embedded-tx-heading">Log in to see the Embedded Transaction Button</h2>
              <p className="embedded-tx-body">You must be logged in to test the embedded transaction confirmation feature.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="embedded-tx-page-root">
      <div className="embedded-tx-translucent-container">
        <div className="embedded-tx-content-area">
          <div className="embedded-tx-header">
            <h2 className="embedded-tx-title">Embedded Transaction Button Demo</h2>
            <p className="embedded-tx-caption">
              This component hosts the button and tooltip in a separate iframe. The wasm worker validates the transaction
              being signed matches what's being shown in the tooltip.
            </p>
          </div>

          <div className="embedded-tx-content">
            <div className="embedded-tx-input-section">
              <div className="embedded-tx-input-group">
                <label className="embedded-tx-input-label">Greeting Input:</label>
                <input
                  type="text"
                  value={greetingInput}
                  onChange={(e) => setGreetingInput(e.target.value)}
                  placeholder="Enter your greeting message"
                  className="embedded-tx-input embedded-tx-focus-ring"
                />
                <p className="embedded-tx-input-help">
                  This will be the greeting message that gets set on the smart contract.
                </p>
              </div>
            </div>

            <div className="test-embedded-section">
              <label className="test-embedded-section-label">Embedded Component:</label>
              <SecureTxConfirmButton
                nearAccountId={loginState.nearAccountId!}
                txSigningRequests={[{
                  receiverId: WEBAUTHN_CONTRACT_ID,
                  actions: [createGreetingAction()]
                }]}
                options={{
                  hooks: {
                    beforeCall: () => {
                      // optional: add any per-call logging here
                    }
                  }
                }}
                buttonStyle={{
                  background: '#0353A4', // cobalt-primary
                  borderRadius: '12px',
                  border: 'none',
                  transition: 'all 0.3s ease',
                  boxShadow: '0px 1px 2px 0px rgba(0, 0, 0, 0.05)',
                  fontSize: '16px',
                  height: '44px',
                }}
                buttonHoverStyle={{
                  background: '#0466c8', // cobalt-primary-hover
                }}
                onSuccess={(result) => {
                  setResult(`Transaction result: ${JSON.stringify(result, null, 2)}`);
                  setError('');
                }}
                tooltipStyle={{
                  width: '300px',
                  height: '300px',
                  position: 'bottom-left',
                  offset: '8px'
                }}
                onError={(error) => {
                  setError(`Transaction failed: ${error.message}`);
                  setResult('');
                }}
                onCancel={handleCancel}
              />
            </div>

            {loading && (
              <div className="embedded-tx-status-section">
                <label className="embedded-tx-status-label">Processing:</label>
                <div className="embedded-tx-loading">
                  <div className="embedded-tx-spinner"></div>
                  Processing transaction...
                </div>
              </div>
            )}

            {result && (
              <div className="embedded-tx-status-section">
                <label className="embedded-tx-status-label">Success:</label>
                <div className="embedded-tx-success">
                  <pre>{result}</pre>
                </div>
              </div>
            )}

            {error && (
              <div className="embedded-tx-status-section">
                <label className="embedded-tx-status-label">Error:</label>
                <div className="embedded-tx-error">
                  <pre>{error}</pre>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default EmbeddedTxConfirmPage;
