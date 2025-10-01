
import React, { useState, useCallback } from 'react';
import {
  ActionPhase,
  ActionStatus,
  ActionType,
  SecureSendTxButton,
  TouchIdWithText,
  TxExecutionStatus,
  usePasskeyContext,
} from '@web3authn/passkey/react';
import type { ActionArgs } from '@web3authn/passkey/react';
import { WEBAUTHN_CONTRACT_ID } from '../config';
import toast from 'react-hot-toast';
import './MultiTxConfirmPage.css';
import './EmbeddedTxConfirmPage.css';
import { GlassBorder } from '../components/GlassBorder';
import { LoadingButton } from '../components/LoadingButton';
import { useSetGreeting } from '../hooks/useSetGreeting';

/**
 * Demo page combining the modal multi-action confirmation and embedded iframe button flows.
 *
 * Users can:
 * 1. Configure a multi-action transaction and execute it through the modal
 * 2. Batch sign and broadcast multiple transfers in sequence
 * 3. Trigger the embedded iframe button, validating that displayed transaction data matches the signed payload
 */
export const MultiTxConfirmPage: React.FC = () => {
  const {
    loginState: { isLoggedIn, nearAccountId },
    passkeyManager,
  } = usePasskeyContext();

  const { fetchGreeting } = useSetGreeting();
  const [greetingInput, setGreetingInput] = useState('Hello from Multi Tx Confirm!');
  const [transferRecipient, setTransferRecipient] = useState('web3-authn-v5.testnet');
  const [transferAmount, setTransferAmount] = useState('0.001');
  const [stakeAmount, setStakeAmount] = useState('0.1');
  const [publicKey, setPublicKey] = useState('ed25519:7PFkxo1jSCrxqN2jKVt5vXmQ9K1rs7JukqV4hdRzVPbd');
  const [beneficiaryId, setBeneficiaryId] = useState('web3-authn-v5.testnet');
  const [isExecuting, setIsExecuting] = useState(false);

  // Batch transfer state
  const [batchTransferAmount, setBatchTransferAmount] = useState('0.001');
  const [isBatchSigning, setIsBatchSigning] = useState(false);

  // Embedded button state
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
  }, []);

  const handleEmbeddedSuccess = useCallback((result: unknown) => {
    setEmbeddedResult(`Transaction result: ${JSON.stringify(result, null, 2)}`);
    setEmbeddedError('');
    setTimeout(() => {
      void fetchGreeting();
    }, 1100);
  }, [fetchGreeting]);

  const handleEmbeddedError = useCallback((error: unknown) => {
    setIsEmbeddedLoading(false);
    const message = error instanceof Error ? error.message : String(error);
    setEmbeddedError(`Transaction failed: ${message}`);
    setEmbeddedResult('');
  }, []);

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
          executionWait: { mode: 'parallelStaggered', staggerMs: 250 },
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
      <div className="modal-tx-page-root">
        <div className="modal-tx-translucent-container">
          <div className="modal-tx-content-area">
            <div className="modal-tx-login-prompt">
              <h2 className="modal-tx-heading">Log in to explore the transaction confirm demos</h2>
              <p className="modal-tx-body">You must be logged in to try the modal and embedded transaction confirmation flows.</p>
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
          <div className="action-section">
            <h1>Multi Tx Confirm - Combined Transaction</h1>
            <p>Configure NEAR actions and execute them in a single transaction.</p>

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

          <div className="action-section">
            <h2>Embedded Transaction Button Demo</h2>
            <p className="embedded-tx-caption">
              This embedded iframe button shows the same transaction details the worker validates before signing.
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
                nearAccountId={nearAccountId!}
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
                  },
                  waitUntil: TxExecutionStatus.FINAL,
                  afterCall: () => {
                    setIsEmbeddedLoading(false);
                  },
                  onError: (error) => {
                    handleEmbeddedError(error);
                  },
                }}
                buttonStyle={{
                  background: '#0353A4',
                  borderRadius: '24px',
                  border: 'none',
                  transition: 'all 0.3s ease',
                  boxShadow: '0px 1px 1px 2px rgba(0, 0, 0, 0.1)',
                  fontSize: '16px',
                  height: '44px',
                }}
                buttonHoverStyle={{
                  background: '#0466c8',
                  boxShadow: '0px 2px 4px 3px rgba(0, 0, 0, 0.2)',
                }}
                tooltipPosition={{
                  width: '330px',
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
        </div>
      </GlassBorder>
    </div>
  );
};
