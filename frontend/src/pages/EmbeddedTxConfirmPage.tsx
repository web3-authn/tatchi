import React, { useState } from 'react';
import { usePasskeyContext } from '@web3authn/passkey/react';
import { EmbeddedTxConfirm, ActionType } from '@web3authn/passkey/react';
import type { ActionArgs } from '@web3authn/passkey/react';
import { WEBAUTHN_CONTRACT_ID } from '../config';

// Define the types locally since they're not exported from the SDK
interface EmbeddedTxSummary {
  to?: string;
  amount?: string;
  method?: string;
  fingerprint?: string;
}

interface EmbeddedTxAction {
  actionType: string;
  method_name?: string;
  args?: string;
  gas?: string;
  deposit?: string;
  [key: string]: any;
}

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
      receiverId: WEBAUTHN_CONTRACT_ID,
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
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <h2>Please log in to use the Embedded Transaction Confirmation</h2>
        <p>You need to be logged in to test the embedded transaction confirmation feature.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif', maxWidth: '800px', margin: '0 auto' }}>
      <h2>Embedded Transaction Confirmation Demo</h2>
      <p style={{ color: '#666', marginBottom: '20px' }}>
        This page demonstrates the secure embedded transaction confirmation component using a sandboxed iframe.
        The component provides maximum security isolation and communicates with the parent window using postMessage API.
        When you click "Send Transaction", it will automatically dispatch to the WASM worker for validation and signing.
      </p>

      <div style={{ marginBottom: '20px' }}>
        <h3>Greeting Input:</h3>
        <input
          type="text"
          value={greetingInput}
          onChange={(e) => setGreetingInput(e.target.value)}
          placeholder="Enter your greeting message"
          style={{
            width: '100%',
            padding: '10px',
            border: '1px solid #ddd',
            borderRadius: '4px',
            fontSize: '16px'
          }}
        />
        <p style={{ fontSize: '14px', color: '#666', marginTop: '5px' }}>
          This will be the greeting message that gets set on the smart contract.
        </p>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <h3>Embedded Component:</h3>
        <EmbeddedTxConfirm
          nearAccountId={loginState.nearAccountId!}
          actionArgs={createGreetingAction()}
          onSuccess={(result) => {
            setResult(`Transaction successful! Result: ${JSON.stringify(result, null, 2)}`);
            setError('');
          }}
          size={{
            width: '200px',
            height: '48px'
          }}
          tooltip={{
            width: '300px',
            height: '300px',
            position: 'right',
            offset: '8px'
          }}
          onError={(error) => {
            setError(`Transaction failed: ${error.message}`);
            setResult('');
          }}
          onCancel={handleCancel}
          showLoading={true}
        />
      </div>

      {loading && (
        <div style={{ marginBottom: '20px' }}>
          <h3>Processing:</h3>
          <div style={{
            background: '#e8f5e8',
            padding: '10px',
            borderRadius: '4px',
            color: '#2d5a2d',
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
          }}>
            <div style={{
              width: '16px',
              height: '16px',
              border: '2px solid #2d5a2d',
              borderTopColor: 'transparent',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite'
            }}></div>
            Processing transaction...
          </div>
        </div>
      )}

      {result && (
        <div style={{ marginBottom: '20px' }}>
          <h3>Success:</h3>
          <pre style={{
            background: '#e8f5e8',
            padding: '10px',
            borderRadius: '4px',
            color: '#2d5a2d',
            fontSize: '12px',
            overflow: 'auto'
          }}>
            {result}
          </pre>
        </div>
      )}

      {error && (
        <div style={{ marginBottom: '20px' }}>
          <h3>Error:</h3>
          <pre style={{
            background: '#ffe8e8',
            padding: '10px',
            borderRadius: '4px',
            color: '#5a2d2d',
            fontSize: '12px',
            overflow: 'auto'
          }}>
            {error}
          </pre>
        </div>
      )}

    </div>
  );
};

export default EmbeddedTxConfirmPage;
