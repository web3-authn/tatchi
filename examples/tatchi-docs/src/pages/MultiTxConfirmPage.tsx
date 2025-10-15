
import React, { useState, useCallback } from 'react';
import {
  ActionPhase,
  ActionStatus,
  ActionType,
  TxExecutionStatus,
  usePasskeyContext,
} from '@tatchi/sdk/react';
import type { ActionArgs } from '@tatchi/sdk/react';
import { WEBAUTHN_CONTRACT_ID } from '../config';
import { toast } from 'sonner';
import './MultiTxConfirmPage.css';
import { GlassBorder } from '../components/GlassBorder';
import { LoadingButton } from '../components/LoadingButton';

/**
 * Demo page for modal multi-action confirmation and batch transactions.
 *
 * Users can:
 * 1. Configure a multi-action transaction and execute it through the modal
 * 2. Batch sign and broadcast multiple transfers in sequence
 */
export const MultiTxConfirmPage: React.FC = () => {
  const {
    loginState: { isLoggedIn, nearAccountId },
    passkeyManager,
  } = usePasskeyContext();

  const [greetingInput, setGreetingInput] = useState('Hello from Multi Tx Confirm!');
  const [transferRecipient, setTransferRecipient] = useState('w3a-v1.testnet');
  const [transferAmount, setTransferAmount] = useState('0.001');
  const [stakeAmount, setStakeAmount] = useState('0.1');
  const [publicKey, setPublicKey] = useState('ed25519:7PFkxo1jSCrxqN2jKVt5vXmQ9K1rs7JukqV4hdRzVPbd');
  const [beneficiaryId, setBeneficiaryId] = useState('w3a-v1.testnet');
  const [isExecuting, setIsExecuting] = useState(false);

  // Batch transfer state
  const [batchTransferAmount, setBatchTransferAmount] = useState('0.001');
  const [isBatchSigning, setIsBatchSigning] = useState(false);



  // Helper function to convert NEAR to yoctoNEAR
  const nearToYocto = (nearAmount: string): string => {
    const amount = parseFloat(nearAmount);
    if (isNaN(amount) || amount <= 0) return '0';

    const nearStr = amount.toString();
    const parts = nearStr.split('.');
    const wholePart = parts[0] || '0';
    const fracPart = (parts[1] || '').padEnd(24, '0').slice(0, 24);
    return wholePart + fracPart;
  };

  // Combined transaction execution
  const handleExecuteTransaction = useCallback(async () => {
    if (!isLoggedIn) return;

    setIsExecuting(true);

    try {
      // Build array of actions
      const actions: ActionArgs[] = [];

      // FunctionCall Action
      if (greetingInput.trim()) {
        actions.push({
          type: ActionType.FunctionCall,
          methodName: 'set_greeting',
          args: { greeting: greetingInput.trim() },
          gas: "30000000000000",
          deposit: "0",
        });
      }

      // Transfer Action
      if (transferRecipient.trim() && transferAmount.trim()) {
        const yoctoAmount = nearToYocto(transferAmount);
        if (yoctoAmount !== '0') {
          actions.push({
            type: ActionType.Transfer,
            amount: yoctoAmount,
          });
        }
      }

      // CreateAccount Action
      actions.push({
        type: ActionType.CreateAccount,
      });

      // DeployContract Action
      const contractCode = new Uint8Array([0x00, 0x61, 0x73, 0x6d]); // Minimal WASM header
      actions.push({
        type: ActionType.DeployContract,
        code: contractCode,
      });

      // Stake Action
      if (stakeAmount.trim() && publicKey.trim()) {
        const yoctoStake = nearToYocto(stakeAmount);
        if (yoctoStake !== '0') {
          actions.push({
            type: ActionType.Stake,
            stake: yoctoStake,
            publicKey: publicKey.trim(),
          });
        }
      }

      // AddKey Action
      if (publicKey.trim()) {
        actions.push({
          type: ActionType.AddKey,
          publicKey: publicKey.trim(),
          accessKey: {
            permission: 'FullAccess',
          },
        });
      }

      // DeleteKey Action
      if (publicKey.trim()) {
        actions.push({
          type: ActionType.DeleteKey,
          publicKey: publicKey.trim(),
        });
      }

      // DeleteAccount Action
      if (beneficiaryId.trim()) {
        actions.push({
          type: ActionType.DeleteAccount,
          beneficiaryId: beneficiaryId.trim(),
        });
      }

      if (actions.length === 0) {
        toast.error('No valid actions to execute');
        return;
      }

      // Execute all actions in a single transaction
      await passkeyManager.executeAction({
        nearAccountId: nearAccountId!,
        receiverId: WEBAUTHN_CONTRACT_ID,
        actionArgs: actions,
        options: {
          onEvent: (event) => {
            switch (event.phase) {
              case ActionPhase.STEP_1_PREPARATION:
                toast.loading('Processing transaction...', { id: 'combinedTx' });
                break;
              case ActionPhase.STEP_9_ACTION_COMPLETE:
                toast.success('Transaction completed successfully!', { id: 'combinedTx' });
                break;
              case ActionPhase.ACTION_ERROR:
                toast.error(`Transaction failed: ${event.error}`, { id: 'combinedTx' });
                break;
            }
          },
          waitUntil: TxExecutionStatus.FINAL,
          afterCall: (success: boolean, result?: any) => {
            if (success && result?.transactionId) {
              console.log('Combined transaction success:', result.transactionId);
              console.log('Actions executed:', actions.length);
            }
          }
        }
      });
    } catch (error) {
      console.error('Transaction execution error:', error);
      toast.error('Failed to execute transaction');
    } finally {
      setIsExecuting(false);
    }
  }, [
    isLoggedIn,
    nearAccountId,
    passkeyManager,
    greetingInput,
    transferRecipient,
    transferAmount,
    stakeAmount,
    publicKey,
    beneficiaryId
  ]);

  // Batch sign transactions example
  const handleBatchSignTransactions = useCallback(async () => {
    if (!isLoggedIn) return;

    setIsBatchSigning(true);

    try {
      const yoctoAmount = nearToYocto(batchTransferAmount);
      if (yoctoAmount === '0') {
        toast.error('Invalid transfer amount');
        return;
      }

      // Sign 3 transfer transactions to different accounts
      const txResults = await passkeyManager.signAndSendTransactions({
        nearAccountId: nearAccountId!,
        transactions: [
          {
            receiverId: 'alice.testnet',
            actions: [{
              type: ActionType.Transfer,
              amount: yoctoAmount
            }]
          },
          {
            receiverId: 'bob.testnet',
            actions: [{
              type: ActionType.Transfer,
              amount: yoctoAmount
            }]
          },
          {
            receiverId: 'charlie.testnet',
            actions: [{
              type: ActionType.Transfer,
              amount: yoctoAmount
            }]
          }
        ],
        options: {
          executionWait: { mode: 'parallelStaggered', staggerMs: 500 },
          onEvent: (event) => {
            console.log('send TX event:', event);
            switch (event.phase) {
              case ActionPhase.STEP_7_TRANSACTION_SIGNING_COMPLETE:
                toast.success(event.message, { id: 'batchTx' });
                break;
              case ActionPhase.STEP_8_BROADCASTING:
                if (event.status === ActionStatus.SUCCESS) {
                  toast.success(event.message, { id: 'batchTx' });
                }
                if (event.status === ActionStatus.ERROR) {
                  toast.error(event.message, { id: 'batchTx' });
                }
                break;
              case ActionPhase.STEP_9_ACTION_COMPLETE:
                toast.success(event.message, { id: 'batchTx' });
                break;
            }
          },
        }
      });
      console.log(`Sent ${txResults.length} transactions:`, txResults);

    } catch (error) {
      console.error('Batch signing error:', error);
      toast.error('Failed to sign batch transactions');
    } finally {
      setIsBatchSigning(false);
    }
  }, [isLoggedIn, nearAccountId, passkeyManager, batchTransferAmount]);

  if (!isLoggedIn) {
    return (
      <div className="multi-tx-page-root">
        <div className="multi-tx-translucent-container">
          <div className="multi-tx-content-area">
            <div className="multi-tx-login-prompt">
              <h2 className="multi-tx-heading">Log in to explore the transaction confirm demos</h2>
              <p className="multi-tx-body">You must be logged in to try the transaction confirmation demos.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="multi-tx-confirm-page">
      <GlassBorder>
        <div className="multi-tx-confirm-page-content">

          <div className="action-section">
            <h1>Multi Tx Confirm - Combined Transaction</h1>
            <p>Configure NEAR actions and execute them in a single transaction.</p>
            <h2>Transaction Parameters</h2>
            <div className="input-group">
              <label>FunctionCall - Greeting Message:</label>
              <input
                className="multi-tx-input"
                type="text"
                value={greetingInput}
                onChange={(e) => setGreetingInput(e.target.value)}
                placeholder="Enter greeting message"
              />
            </div>

            <div className="input-group">
              <label>Transfer - Recipient Account:</label>
              <input
                className="multi-tx-input"
                type="text"
                value={transferRecipient}
                onChange={(e) => setTransferRecipient(e.target.value)}
                placeholder="Recipient account ID"
              />
            </div>

            <div className="input-group">
              <label>Transfer - Amount (NEAR):</label>
              <input
                className="multi-tx-input"
                type="number"
                value={transferAmount}
                onChange={(e) => setTransferAmount(e.target.value)}
                placeholder="Amount in NEAR"
                step="0.001"
                min="0"
              />
            </div>

            <div className="input-group">
              <label>Stake - Amount (NEAR):</label>
              <input
                className="multi-tx-input"
                type="number"
                value={stakeAmount}
                onChange={(e) => setStakeAmount(e.target.value)}
                placeholder="Stake amount in NEAR"
                step="0.001"
                min="0"
              />
            </div>

            <div className="input-group">
              <label>Public Key (for Stake/AddKey/DeleteKey):</label>
              <input
                className="multi-tx-input"
                type="text"
                value={publicKey}
                onChange={(e) => setPublicKey(e.target.value)}
                placeholder="ed25519:7PFkxo1jSCrxqN2jKVt5vXmQ9K1rs7JukqV4hdRzVPbd"
              />
            </div>

            <div className="input-group">
              <label>DeleteAccount - Beneficiary:</label>
              <input
                className="multi-tx-input"
                type="text"
                value={beneficiaryId}
                onChange={(e) => setBeneficiaryId(e.target.value)}
                placeholder="Beneficiary account ID"
              />
            </div>

            <LoadingButton
              onClick={handleExecuteTransaction}
              loading={isExecuting}
              loadingText="Executing Transaction..."
              variant="primary"
              size="medium"
            >
              Execute Combined Transaction
            </LoadingButton>
          </div>

          <div className="action-section">
            <h2>Batch Sign Transactions Example</h2>
            <p>Sign 3 transfer transactions to different accounts with a single TouchID prompt</p>

            <div className="input-group">
              <label>Transfer Amount (NEAR):</label>
              <input
                className="multi-tx-input"
                type="number"
                value={batchTransferAmount}
                onChange={(e) => setBatchTransferAmount(e.target.value)}
                placeholder="Amount in NEAR"
                step="0.001"
                min="0"
              />
            </div>

            <LoadingButton
               onClick={handleBatchSignTransactions}
               loading={isBatchSigning}
               loadingText="Signing & Broadcasting..."
               variant="primary"
               size="medium"
             >
               Sign 3 Transactions
             </LoadingButton>
          </div>


        </div>
      </GlassBorder>
    </div>
  );
};
