import React, { useState, useCallback, useEffect } from 'react';
import toast from 'react-hot-toast';

import { ActionPhase, usePasskeyContext } from '@web3authn/passkey/react';
import type { ActionArgs, FunctionCallAction, TransferAction } from '@web3authn/passkey/react';
import { ActionType, TxExecutionStatus } from '@web3authn/passkey/react';

import type { LastTxDetails } from '../types';
import { RefreshIcon } from './icons/RefreshIcon';
import { useSetGreeting } from '../hooks/useSetGreeting';
import {
  WEBAUTHN_CONTRACT_ID,
  MUTED_GREEN,
  NEAR_EXPLORER_BASE_URL
} from '../config';

interface GreetingMenuProps {
  disabled?: boolean;
  onTransactionUpdate: (txDetails: LastTxDetails | null) => void;
}

export const GreetingMenu: React.FC<GreetingMenuProps> = ({ disabled = false, onTransactionUpdate }) => {
  const {
    loginState: { isLoggedIn, nearAccountId },
    passkeyManager,
  } = usePasskeyContext();

  const [greetingInput, setGreetingInput] = useState('Hello from Passkey App!');

  // NEAR transfer state
  const [transferRecipient, setTransferRecipient] = useState('web3-authn-v4.testnet');
  const [transferAmount, setTransferAmount] = useState('');

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
      receiverId: WEBAUTHN_CONTRACT_ID,
      methodName: 'set_greeting',
      args: { greeting: newGreetingMessage },
      gas: "30000000000000",
      deposit: "0",
    };

    onTransactionUpdate(null); // Clear previous transaction details

    await passkeyManager.executeAction(nearAccountId, actionToExecute, {
      onEvent: (event) => {
        switch (event.phase) {
          case ActionPhase.STEP_1_PREPARATION:
            toast.loading('Processing transaction...', { id: 'action' });
            break;
          case ActionPhase.STEP_3_WEBAUTHN_AUTHENTICATION:
            toast.loading(event.message, { id: 'action' });
            break;
          case ActionPhase.STEP_4_AUTHENTICATION_COMPLETE:
            toast.loading(event.message, { id: 'action' });
            break;
          case ActionPhase.STEP_5_TRANSACTION_SIGNING_PROGRESS:
          case ActionPhase.STEP_6_TRANSACTION_SIGNING_COMPLETE:
            toast.loading(event.message, { id: 'action' });
            break;
          case ActionPhase.STEP_7_BROADCASTING:
            toast.success('Sending Transaction', { id: 'action' });
            break;
          case ActionPhase.STEP_8_ACTION_COMPLETE:
            toast.success('Transaction completed successfully!', { id: 'action' });
            break;
          case ActionPhase.ACTION_ERROR || ActionPhase.WASM_ERROR:
            toast.error(`Transaction failed: ${event.error}`, { id: 'action' });
            break;
        }
      },
      waitUntil: TxExecutionStatus.FINAL,
      hooks: {
        afterCall: (success: boolean, result?: any) => {
          console.log("afterCall success: ", success);
          console.log("afterCall result: ", result);
          if (success && result?.transactionId) {
            const txId = result.transactionId;
            const txLink = `${NEAR_EXPLORER_BASE_URL}/transactions/${txId}`;

            // Reset greeting input on any successful transaction
            console.log("Result: ", result);
            setGreetingInput("");
            // Transaction executed successfully - fetch the updated greeting
            console.log('afterCall success - fetching updated greeting');
            fetchGreeting();

            onTransactionUpdate({
              id: txId,
              link: txLink,
              message: newGreetingMessage
            });
          } else if (success) {
            onTransactionUpdate({ id: 'N/A', link: '#', message: 'Success, no TxID in response' });
          } else {
            onTransactionUpdate({ id: 'N/A', link: '#', message: `Failed: ${result?.error || 'Unknown error'}` });
          }
        }
      }
    });
  }, [greetingInput, isLoggedIn, nearAccountId, passkeyManager, fetchGreeting, onTransactionUpdate]);

  const handleSendNear = useCallback(async () => {
    if (!transferRecipient.trim() || !transferAmount.trim() || !isLoggedIn) {
      return;
    }

    // Validate amount is a positive number
    const amount = parseFloat(transferAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error('Please enter a valid amount greater than 0');
      return;
    }

    // Validate recipient account ID format (basic validation)
    const recipient = transferRecipient.trim();
    if (!recipient.includes('.') || recipient.length < 2) {
      toast.error('Please enter a valid NEAR account ID (e.g., recipient.testnet)');
      return;
    }

    // Convert NEAR to yoctoNEAR (1 NEAR = 10^24 yoctoNEAR)
    // Use string manipulation to avoid scientific notation like "1e+24"
    const nearStr = amount.toString();
    const parts = nearStr.split('.');
    const wholePart = parts[0] || '0';
    const fracPart = (parts[1] || '').padEnd(24, '0').slice(0, 24);
    const yoctoAmount = wholePart + fracPart;

    const transferAction: TransferAction = {
      type: ActionType.Transfer,
      receiverId: recipient,
      amount: yoctoAmount,
    };

    onTransactionUpdate(null); // Clear previous transaction details

    await passkeyManager.executeAction(nearAccountId, transferAction, {
      onEvent: (event) => {
        switch (event.phase) {
          case ActionPhase.STEP_1_PREPARATION:
            toast.loading('Processing NEAR transfer...', { id: 'transfer' });
            break;
          case ActionPhase.STEP_3_WEBAUTHN_AUTHENTICATION:
            toast.loading(event.message, { id: 'transfer' });
            break;
          case ActionPhase.STEP_4_AUTHENTICATION_COMPLETE:
            toast.loading(event.message, { id: 'transfer' });
            break;
          case ActionPhase.STEP_5_TRANSACTION_SIGNING_PROGRESS:
          case ActionPhase.STEP_6_TRANSACTION_SIGNING_COMPLETE:
            toast.loading(event.message, { id: 'transfer' });
            break;
          case ActionPhase.STEP_7_BROADCASTING:
            toast.success(`Successfully sent ${amount} NEAR to ${recipient}!`, { id: 'transfer' });
            break;
          case ActionPhase.ACTION_ERROR || ActionPhase.WASM_ERROR:
            toast.error(`Transfer failed: ${event.error}`, { id: 'transfer' });
            break;
        }
      },
      hooks: {
        afterCall: (success: boolean, result?: any) => {
          if (success) {
            // Reset transfer inputs on successful transaction
            setTransferRecipient("web3-authn-v4.testnet");
            setTransferAmount("");
          }

          if (success && result?.transactionId) {
            const txId = result.transactionId;
            const txLink = `${NEAR_EXPLORER_BASE_URL}/transactions/${txId}`;

            onTransactionUpdate({
              id: txId,
              link: txLink,
              message: `Successfully sent ${amount} NEAR to ${recipient}`
            });
          } else if (success) {
            onTransactionUpdate({
              id: 'N/A',
              link: '#',
              message: `Transfer successful: ${amount} NEAR to ${recipient}`
            });
          } else {
            onTransactionUpdate({
              id: 'N/A',
              link: '#',
              message: `Transfer failed: ${result?.error || 'Unknown error'}`
            });
          }
        }
      }
    });
  }, [transferRecipient, transferAmount, isLoggedIn, nearAccountId, passkeyManager, onTransactionUpdate]);

  if (!isLoggedIn) {
    return null;
  }

  return (
    <div className="passkey-container-root">
      <div className="passkey-container">

        <h2>Welcome, {nearAccountId}</h2>
        <p className="caption">Send NEAR transactions with Passkeys</p>

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
              onClick={handleRefreshGreeting}
              disabled={isLoading}
              title="Refresh Greeting"
              className="refresh-icon-button"
            >
              <RefreshIcon size={22} color={MUTED_GREEN}/>
            </button>
            <p><strong>{onchainGreeting || "..."}</strong></p>
          </div>

          <div className="greeting-input-group">
            <input
              type="text"
              value={greetingInput}
              onChange={(e) => setGreetingInput(e.target.value)}
              placeholder="Enter new greeting"
              className="styled-input"
            />
            <button
              onClick={handleSetGreeting}
              className="action-button"
              disabled={isLoading || !greetingInput.trim()}
            >
              {isLoading ? 'Processing...' : 'Set New Greeting'}
            </button>
          </div>

          <div className="transfer-section">
            <h3>Send NEAR</h3>
            <div className="transfer-input-group">
              <input
                type="text"
                value={transferRecipient}
                onChange={(e) => setTransferRecipient(e.target.value)}
                placeholder="Recipient account (e.g., alice.testnet)"
                className="styled-input"
              />
              <input
                type="number"
                value={transferAmount}
                onChange={(e) => setTransferAmount(e.target.value)}
                placeholder="Amount in NEAR"
                className="styled-input"
                min="0"
                step="0.01"
              />
              <button
                onClick={handleSendNear}
                className="action-button"
                disabled={isLoading || !transferRecipient.trim() || !transferAmount.trim()}
              >
                {isLoading ? 'Processing...' : 'Send NEAR'}
              </button>
            </div>
          </div>

          {error && (
            <div className="error-message">
              Error: {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}