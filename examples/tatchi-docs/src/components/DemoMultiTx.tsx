import React, { useCallback, useState } from 'react';
import { toast } from 'sonner';

import {
  ActionPhase,
  ActionType,
  TxExecutionStatus,
  usePasskeyContext,
} from '@tatchi-xyz/sdk/react';

import { LoadingButton } from './LoadingButton';
import { WEBAUTHN_CONTRACT_ID } from '../config';

import './DemoMultiTx.css';

export const DemoMultiTx: React.FC = () => {
  const {
    loginState: { isLoggedIn, nearAccountId },
    passkeyManager,
  } = usePasskeyContext();

  // Combined multi-action demo (fixed parameters to showcase the modal)
  const DEMO_GREETING = 'Hello from Tatchi!';
  const DEMO_TRANSFER_RECIPIENT = 'w3a-v1.testnet';
  const DEMO_TRANSFER_AMOUNT = '0.001';
  const DEMO_STAKE_AMOUNT = '0.1';
  const DEMO_PUBLIC_KEY = 'ed25519:7PFkxo1jSCrxqN2jKVt5vXmQ9K1rs7JukqV4hdRzVPbd';
  const DEMO_BENEFICIARY = 'w3a-v1.testnet';
  const [loadingUi, setLoadingUi] = useState<null | 'modal' | 'drawer'>(null);

  const nearToYocto = (nearAmount: string): string => {
    const amount = parseFloat(nearAmount);
    if (isNaN(amount) || amount <= 0) return '0';
    const nearStr = amount.toString();
    const parts = nearStr.split('.');
    const wholePart = parts[0] || '0';
    const fracPart = (parts[1] || '').padEnd(24, '0').slice(0, 24);
    return wholePart + fracPart;
  };

  const handleExecuteTransaction = useCallback(async (uiMode: 'modal' | 'drawer') => {
    if (!isLoggedIn || !nearAccountId) return;

    setLoadingUi(uiMode);
    try {
      const actions: any[] = [];

      if (DEMO_GREETING.trim()) {
        actions.push({
          type: ActionType.FunctionCall,
          methodName: 'set_greeting',
          args: { greeting: DEMO_GREETING.trim() },
          gas: '30000000000000',
          deposit: '0',
        });
      }

      if (DEMO_TRANSFER_RECIPIENT.trim() && DEMO_TRANSFER_AMOUNT.trim()) {
        const yoctoAmount = nearToYocto(DEMO_TRANSFER_AMOUNT);
        if (yoctoAmount !== '0') {
          actions.push({ type: ActionType.Transfer, amount: yoctoAmount });
        }
      }

      actions.push({ type: ActionType.CreateAccount });

      const contractCode = new Uint8Array([0x00, 0x61, 0x73, 0x6d]);
      actions.push({ type: ActionType.DeployContract, code: contractCode });

      if (DEMO_STAKE_AMOUNT.trim() && DEMO_PUBLIC_KEY.trim()) {
        const yoctoStake = nearToYocto(DEMO_STAKE_AMOUNT);
        if (yoctoStake !== '0') {
          actions.push({ type: ActionType.Stake, stake: yoctoStake, publicKey: DEMO_PUBLIC_KEY.trim() });
        }
      }

      if (DEMO_PUBLIC_KEY.trim()) {
        actions.push({ type: ActionType.AddKey, publicKey: DEMO_PUBLIC_KEY.trim(), accessKey: { permission: 'FullAccess' } });
        actions.push({ type: ActionType.DeleteKey, publicKey: DEMO_PUBLIC_KEY.trim() });
      }

      if (DEMO_BENEFICIARY.trim()) {
        actions.push({ type: ActionType.DeleteAccount, beneficiaryId: DEMO_BENEFICIARY.trim() });
      }

      await passkeyManager.executeAction({
        nearAccountId,
        receiverId: WEBAUTHN_CONTRACT_ID,
        actionArgs: actions,
        options: {
          // Per-call confirmation config (non-persistent)
          confirmationConfig: { uiMode: uiMode },
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
          waitUntil: TxExecutionStatus.EXECUTED_OPTIMISTIC,
          afterCall: (success: boolean, result?: any) => {
            if (success && result?.transactionId) {
              console.log('Combined transaction success:', result.transactionId);
              console.log('Actions executed:', actions.length);
            }
          },
        },
      });
    } catch (error) {
      console.error('Transaction execution error:', error);
      toast.error('Failed to execute transaction');
    } finally {
      setLoadingUi(null);
    }
  }, [isLoggedIn, nearAccountId, passkeyManager]);

  if (!isLoggedIn) return null;

  return (
    <div className="demo-multi-tx-root">
      <div className="action-section">
        <h2 className="action-subheader">
          Choose between Modal or Drawer
        </h2>
        <div className="action-text">
          Choose between Modal or Drawer for the tx confirmer menus.
          You can also skip the confirmation menu (only on desktop).
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <LoadingButton
            onClick={() => handleExecuteTransaction('modal')}
            loading={loadingUi === 'modal'}
            loadingText="Signing..."
            variant="primary"
            size="medium"
            style={{ width: 200 }}
          >
            Sign with Modal
          </LoadingButton>
          <LoadingButton
            onClick={() => handleExecuteTransaction('drawer')}
            loading={loadingUi === 'drawer'}
            loadingText="Signing..."
            variant="primary"
            size="medium"
            style={{ width: 200 }}
          >
            sign with Drawer
          </LoadingButton>
        </div>
      </div>

    </div>
  );
};

export default DemoMultiTx;
