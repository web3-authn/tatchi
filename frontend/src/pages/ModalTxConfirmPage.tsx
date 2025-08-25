
import React, { useState, useCallback } from 'react';
import { usePasskeyContext } from '@web3authn/passkey/react';
import type { ActionArgs, FunctionCallAction, TransferAction, CreateAccountAction, DeployContractAction, StakeAction, AddKeyAction, DeleteKeyAction, DeleteAccountAction } from '@web3authn/passkey/react';
import { ActionType, ActionPhase, TxExecutionStatus } from '@web3authn/passkey/react';
import { WEBAUTHN_CONTRACT_ID, NEAR_EXPLORER_BASE_URL } from '../config';
import toast from 'react-hot-toast';
import './ModalTxConfirmPage.css';
import { GlassBorder } from '../components/GlassBorder';
import { LoadingButton } from '../components/LoadingButton';

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
export const ModalTxConfirmPage: React.FC = () => {
  const {
    loginState: { isLoggedIn, nearAccountId },
    passkeyManager,
  } = usePasskeyContext();

  const [greetingInput, setGreetingInput] = useState('Hello from Modal Tx Confirm!');
  const [transferRecipient, setTransferRecipient] = useState('web3-authn-v5.testnet');
  const [transferAmount, setTransferAmount] = useState('0.001');
  const [stakeAmount, setStakeAmount] = useState('0.1');
  const [publicKey, setPublicKey] = useState('ed25519:7PFkxo1jSCrxqN2jKVt5vXmQ9K1rs7JukqV4hdRzVPbd');
  const [beneficiaryId, setBeneficiaryId] = useState('web3-authn-v5.testnet');
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
          receiverId: WEBAUTHN_CONTRACT_ID,
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
            receiverId: transferRecipient.trim(),
            amount: yoctoAmount,
          });
        }
      }

      // CreateAccount Action
      actions.push({
        type: ActionType.CreateAccount,
        receiverId: 'new-account.testnet',
      });

      // DeployContract Action
      const contractCode = new Uint8Array([0x00, 0x61, 0x73, 0x6d]); // Minimal WASM header
      actions.push({
        type: ActionType.DeployContract,
        receiverId: nearAccountId!,
        code: contractCode,
      });

      // Stake Action
      if (stakeAmount.trim() && publicKey.trim()) {
        const yoctoStake = nearToYocto(stakeAmount);
        if (yoctoStake !== '0') {
          actions.push({
            type: ActionType.Stake,
            receiverId: nearAccountId!,
            stake: yoctoStake,
            publicKey: publicKey.trim(),
          });
        }
      }

      // AddKey Action
      if (publicKey.trim()) {
        actions.push({
          type: ActionType.AddKey,
          receiverId: nearAccountId!,
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
          receiverId: nearAccountId!,
          publicKey: publicKey.trim(),
        });
      }

      // DeleteAccount Action
      if (beneficiaryId.trim()) {
        actions.push({
          type: ActionType.DeleteAccount,
          receiverId: nearAccountId!,
          beneficiaryId: beneficiaryId.trim(),
        });
      }

      if (actions.length === 0) {
        toast.error('No valid actions to execute');
        return;
      }

      // Execute all actions in a single transaction
      await passkeyManager.executeAction(nearAccountId!, actions, {
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
        hooks: {
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
      const signedTransactions = await passkeyManager.signTransactionsWithActions(nearAccountId!, {
        transactions: [
          {
            receiverId: 'alice.testnet',
            actions: [{
              action_type: ActionType.Transfer,
              deposit: yoctoAmount
            }]
          },
          {
            receiverId: 'bob.testnet',
            actions: [{
              action_type: ActionType.Transfer,
              deposit: yoctoAmount
            }]
          },
          {
            receiverId: 'charlie.testnet',
            actions: [{
              action_type: ActionType.Transfer,
              deposit: yoctoAmount
            }]
          }
        ],
        onEvent: (event) => {
          console.log('Batch signing progress:', event);
          if (event.phase === ActionPhase.STEP_7_TRANSACTION_SIGNING_COMPLETE) {
            toast.success('All transactions signed successfully!');
          }
        }
      });
      console.log('Signed transactions:', signedTransactions);

      // Sequentially broadcast each transaction
      for (const [index, signedTx] of signedTransactions.entries()) {
        if (!signedTx.signedTransaction) return;
        try {
          const result = await passkeyManager.sendTransaction(
            signedTx.signedTransaction,
            TxExecutionStatus.FINAL
          );
          console.log(`Transaction ${index + 1} broadcasted:`, result.transaction_outcome?.id);
          toast.success(`Transfer ${index + 1} completed: ${result.transaction_outcome?.id}`);
        } catch (error) {
          console.error(`Failed to broadcast transaction ${index + 1}:`, error);
          toast.error(`Transfer ${index + 1} failed: ${error}`);
        }
      }

    } catch (error) {
      console.error('Batch signing error:', error);
      toast.error('Failed to sign batch transactions');
    } finally {
      setIsBatchSigning(false);
    }
  }, [isLoggedIn, nearAccountId, passkeyManager, batchTransferAmount]);

  if (!isLoggedIn) {
    return (
      <div className="modal-tx-page-root">
        <div className="modal-tx-translucent-container">
          <div className="modal-tx-content-area">
            <div className="modal-tx-login-prompt">
              <h2 className="modal-tx-heading">Log in to see the Modal Tx Confirm Page</h2>
              <p className="modal-tx-body">You must be logged in to test the modal transaction confirmation feature.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

    return (
    <div className="modal-tx-confirm-page">
      <GlassBorder>
        <div className="modal-tx-confirm-page-content">
          <h1>Modal Tx Confirm Page - Combined Transaction</h1>
          <p>Configure all NEAR actions and execute them in a single transaction</p>

          <div className="action-section">
            <h2>Transaction Parameters</h2>

            <div className="input-group">
              <label>FunctionCall - Greeting Message:</label>
              <input
                className="modal-tx-input"
                type="text"
                value={greetingInput}
                onChange={(e) => setGreetingInput(e.target.value)}
                placeholder="Enter greeting message"
              />
            </div>

            <div className="input-group">
              <label>Transfer - Recipient Account:</label>
              <input
                className="modal-tx-input"
                type="text"
                value={transferRecipient}
                onChange={(e) => setTransferRecipient(e.target.value)}
                placeholder="Recipient account ID"
              />
            </div>

            <div className="input-group">
              <label>Transfer - Amount (NEAR):</label>
              <input
                className="modal-tx-input"
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
                className="modal-tx-input"
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
                className="modal-tx-input"
                type="text"
                value={publicKey}
                onChange={(e) => setPublicKey(e.target.value)}
                placeholder="ed25519:7PFkxo1jSCrxqN2jKVt5vXmQ9K1rs7JukqV4hdRzVPbd"
              />
            </div>

            <div className="input-group">
              <label>DeleteAccount - Beneficiary:</label>
              <input
                className="modal-tx-input"
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
                className="modal-tx-input"
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