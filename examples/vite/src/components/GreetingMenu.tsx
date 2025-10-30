import React, { useState, useCallback } from 'react';
import toast from 'react-hot-toast';

import { ActionPhase, usePasskeyContext } from '@tatchi-xyz/sdk/react';
import type { FunctionCallAction } from '@tatchi-xyz/sdk/react';
import { ActionType, TxExecutionStatus } from '@tatchi-xyz/sdk/react';

import { GlassBorder } from './GlassBorder';
import { RefreshCcw } from 'lucide-react';
import { useSetGreeting } from '../hooks/useSetGreeting';
import { LoadingButton } from './LoadingButton';
import { WEBAUTHN_CONTRACT_ID, NEAR_EXPLORER_BASE_URL } from '../config';

interface GreetingMenuProps {}

export const GreetingMenu: React.FC<GreetingMenuProps> = () => {
  const {
    loginState: { isLoggedIn, nearAccountId },
    passkeyManager,
  } = usePasskeyContext();

  const [greetingInput, setGreetingInput] = useState('Hello from Passkey App!');

  const {
    onchainGreeting,
    isLoading,
    fetchGreeting,
    error
  } = useSetGreeting();

  const handleRefreshGreeting = async () => {
    await fetchGreeting();
  };

  const handleSetGreeting = useCallback(async () => {
    if (!greetingInput.trim() || !isLoggedIn) {
      return;
    }

    const newGreetingMessage = `${greetingInput.trim()} [updated: ${new Date().toLocaleTimeString()}]`;

    const actionToExecute: FunctionCallAction = {
      type: ActionType.FunctionCall,
      methodName: 'set_greeting',
      args: { greeting: newGreetingMessage },
      gas: "30000000000000",
      deposit: "0",
    };

    await passkeyManager.executeAction({
      nearAccountId: nearAccountId!,
      receiverId: WEBAUTHN_CONTRACT_ID,
      actionArgs: actionToExecute,
      options: {
        onEvent: (event) => {
          switch (event.phase) {
            case ActionPhase.STEP_1_PREPARATION:
              toast.loading(event.message, { id: 'action' });
              break;
            case ActionPhase.STEP_4_WEBAUTHN_AUTHENTICATION:
              toast.loading(event.message, { id: 'action' });
              break;
            case ActionPhase.STEP_5_AUTHENTICATION_COMPLETE:
              toast.loading(event.message, { id: 'action' });
              break;
            case ActionPhase.STEP_6_TRANSACTION_SIGNING_PROGRESS:
            case ActionPhase.STEP_7_TRANSACTION_SIGNING_COMPLETE:
              toast.loading(event.message, { id: 'action' });
              break;
            case ActionPhase.STEP_8_BROADCASTING:
              toast.success(event.message, { id: 'action' });
              break;
            case ActionPhase.STEP_9_ACTION_COMPLETE:
              toast.success(event.message, { id: 'action' });
              break;
            case ActionPhase.ACTION_ERROR || ActionPhase.WASM_ERROR:
              toast.error(`Transaction failed: ${event.error}`, { id: 'action' });
              break;
          }
        },
        waitUntil: TxExecutionStatus.EXECUTED_OPTIMISTIC,
        afterCall: (success: boolean, result?: any) => {
          if (success && result?.transactionId) {
            // Reset greeting input on any successful transaction
            setGreetingInput("");
            // Transaction executed successfully - fetch the updated greeting
            fetchGreeting();
          }
        }
      }
    });
  }, [greetingInput, isLoggedIn, nearAccountId, passkeyManager, fetchGreeting]);

  if (!isLoggedIn) {
    return null;
  }

  return (
    <GlassBorder style={{ marginTop: '4rem' }} className="section-root">
      <div className="greeting-header">
        <h2 className="greeting-title">Example 1</h2>
        <p className="greeting-caption">Send NEAR transactions with Passkeys</p>
      </div>

      <div className="greeting-controls-box">
        <div className="webauthn-contract-link">
          Onchain message on&nbsp;
          <a href={`${NEAR_EXPLORER_BASE_URL}/address/${WEBAUTHN_CONTRACT_ID}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {WEBAUTHN_CONTRACT_ID}
          </a>:
        </div>
        <div className="on-chain-greeting-box">
          <button
            className="refresh-icon-button"
            onClick={handleRefreshGreeting}
            disabled={isLoading}
            title="Refresh Greeting"
          >
            <RefreshCcw size={22}/>
          </button>
          <p><strong>{onchainGreeting || "..."}</strong></p>
        </div>
      </div>

      <div className="section-container">
        <input
          type="text"
          name="greeting"
          className="embedded-tx-input"
          value={greetingInput}
          onChange={(e) => setGreetingInput(e.target.value)}
          placeholder="Enter your greeting message"
        />
      </div>
      <LoadingButton
        style={{ width: '480px' }}
        onClick={handleSetGreeting}
        loading={isLoading}
        loadingText="Executing Transaction..."
        variant="primary"
        size="medium"
      >
        Sign Multiple Transactions
      </LoadingButton>

      {error && (
        <div className="error-message">
          Error: {error}
        </div>
      )}
    </GlassBorder>
  );
}
