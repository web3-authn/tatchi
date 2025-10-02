import React, { useRef, useState } from 'react';
import { TouchIdWithText, usePasskeyContext } from '@web3authn/passkey/react';
import { SecureSendTxButton, ActionType } from '@web3authn/passkey/react';
import { TxExecutionStatus } from '@web3authn/passkey/react';
import type { ActionArgs } from '@web3authn/passkey/react';
import { LitDrawer } from '../../../../passkey-sdk/src/react/components/LitDrawer';
import { WEBAUTHN_CONTRACT_ID } from '../config';
import './EmbeddedTxConfirmPage.css';
import { useSetGreeting } from '../hooks/useSetGreeting';

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
  const { fetchGreeting } = useSetGreeting();
  const [greetingInput, setGreetingInput] = useState('Hello from Embedded Component!');
  const [result, setResult] = useState<string>('');
  const [error, setError] = useState<string>('');

  // State for transaction results
  const [loading, setLoading] = useState(false);

  // Imperative ref for LitDrawer (uncontrolled)
  const drawerRef = useRef<any>(null);

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
              <SecureSendTxButton
                nearAccountId={loginState.nearAccountId!}
                txSigningRequests={[
                  {
                    receiverId: WEBAUTHN_CONTRACT_ID,
                    actions: [
                      createGreetingAction(),
                      {
                        type: ActionType.Transfer,
                        amount: '100000000000000000000' // 0.0001 NEAR
                      }
                    ]
                  },
                  {
                    receiverId: WEBAUTHN_CONTRACT_ID,
                    actions: [{
                      type: ActionType.Transfer,
                      amount: '200000000000000000000' // 0.0002 NEAR
                    }]
                  },
                ]}
                options={{
                  beforeCall: () => {
                    // optional: add any per-call logging here
                  },
                  // Wait for final execution so subsequent views reflect the update
                  waitUntil: TxExecutionStatus.FINAL,
                  // After the call completes, refresh on-chain greeting
                  afterCall: (success) => {
                    if (success) {
                      // Small delay to avoid hook rate limit and ensure finality propagation
                      setTimeout(() => { void fetchGreeting(); }, 1100);
                    }
                  },
                  onError: (error) => {
                    setError(`Transaction failed: ${error.message}`);
                    setResult('');
                  }
                }}
                buttonStyle={{
                  background: 'var(--cobalt-primary)',
                  borderRadius: '24px',
                  border: 'none',
                  transition: 'all 0.3s ease',
                  boxShadow: '0px 1px 1px 2px rgba(0, 0, 0, 0.1)',
                  fontSize: '16px',
                  height: '44px',
                }}
                buttonHoverStyle={{
                  background: 'var(--cobalt-primary-hover)',
                  boxShadow: '0px 2px 4px 3px rgba(0, 0, 0, 0.2)',
                }}
                tooltipPosition={{
                  width: '330px',
                  height: 'auto',
                  position: 'bottom-left'
                }}
                /* Theme follows ThemeProvider via SecureSendTxButton */
                buttonTextElement={<TouchIdWithText buttonText="Send Transaction" />}
                onCancel={handleCancel}
                onSuccess={(result) => {
                  setResult(`Transaction result: ${JSON.stringify(result, null, 2)}`);
                  setError('');
                  // Also trigger a refresh here for safety
                  setTimeout(() => { void fetchGreeting(); }, 1100);
                }}
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
