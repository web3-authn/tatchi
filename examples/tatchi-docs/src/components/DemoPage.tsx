import React, { useCallback, useState } from 'react';
import { toast } from 'sonner';

import {
  ActionPhase,
  ActionType,
  ActionResult,
  TxExecutionStatus,
  useTatchi,
} from '@tatchi-xyz/sdk/react';
import type { ActionArgs, FunctionCallAction } from '@tatchi-xyz/sdk/react';

import { LoadingButton } from './LoadingButton';
import Refresh from './icons/Refresh';
import { useSetGreeting } from '../hooks/useSetGreeting';
import { buildNearExplorerTxUrl } from '../types';
import './DemoPage.css';


export const DemoPage: React.FC = () => {
  const {
    loginState: { isLoggedIn, nearAccountId },
    tatchi,
  } = useTatchi();

  const {
    onchainGreeting,
    isLoading,
    fetchGreeting,
    error,
  } = useSetGreeting();

  const [greetingInput, setGreetingInput] = useState('Hello from Tatchi!');
  const [txLoading, setTxLoading] = useState(false);
  const [delegateLoading, setDelegateLoading] = useState(false);
  const canExecuteGreeting = useCallback(
    (val: string, loggedIn: boolean, accountId?: string | null) =>
      Boolean(val?.trim()) && loggedIn && Boolean(accountId),
  []);

  const handleRefreshGreeting = async () => {
    await fetchGreeting();
  };

  const createGreetingAction = useCallback((greeting: string, opts?: { postfix?: string }): ActionArgs => {
    const base = greeting.trim();
    const parts = [base];
    if (opts?.postfix && opts.postfix.trim()) parts.push(`[${opts.postfix.trim()}]`);
    parts.push(`[${new Date().toLocaleTimeString()}]`);
    const message = parts.join(' ');
    return {
      type: ActionType.FunctionCall,
      methodName: 'set_greeting',
      args: { greeting: message },
      gas: '30000000000000',
      deposit: '0',
    };
  }, []);

  const handleSetGreeting = useCallback(async () => {
    if (!canExecuteGreeting(greetingInput, isLoggedIn, nearAccountId)) return;
    // Build the greeting action using the shared helper
    const actionToExecute: FunctionCallAction = createGreetingAction(greetingInput) as FunctionCallAction;
    const contractId = tatchi.configs.contractId;
    if (!contractId) {
      toast.error('Contract ID is not configured: VITE_WEBAUTHN_CONTRACT_ID', { id: 'greeting' });
      return;
    }

    setTxLoading(true);
    try {
      await tatchi.executeAction({
      nearAccountId: nearAccountId!,
      receiverId: contractId,
      actionArgs: actionToExecute,
      options: {
        onEvent: (event) => {
          switch (event.phase) {
            case ActionPhase.STEP_1_PREPARATION:
            case ActionPhase.STEP_3_WEBAUTHN_AUTHENTICATION:
            case ActionPhase.STEP_4_AUTHENTICATION_COMPLETE:
            case ActionPhase.STEP_5_TRANSACTION_SIGNING_PROGRESS:
            case ActionPhase.STEP_6_TRANSACTION_SIGNING_COMPLETE:
              toast.loading(event.message, { id: 'greeting' });
              break;
            case ActionPhase.STEP_7_BROADCASTING:
              toast.loading(event.message, { id: 'greeting' });
              break;
            case ActionPhase.ACTION_ERROR:
            case ActionPhase.WASM_ERROR:
              toast.error(`Transaction failed: ${event.error}`, { id: 'greeting' });
              break;
          }
        },
        waitUntil: TxExecutionStatus.EXECUTED_OPTIMISTIC,
        afterCall: (success: boolean, result?: ActionResult) => {
          try { toast.dismiss('greeting'); } catch {}
          const txId = result?.transactionId;
          const isSuccess = success && result?.success !== false;
          if (isSuccess && txId) {
            const txLink = buildNearExplorerTxUrl(tatchi?.configs?.nearExplorerUrl, txId);
            toast.success('Greeting updated on-chain', {
              ...(txLink ? {
                description: (
                  <a href={txLink} target="_blank" rel="noopener noreferrer">
                    View transaction on NearBlocks
                  </a>
                ),
              } : {}),
            });
            setGreetingInput('');
            // Refresh the greeting after success
            setTimeout(() => fetchGreeting(), 1000);
          } else {
            const message = result?.error || (isSuccess ? 'Missing transaction ID' : 'Unknown error');
            toast.error(`Greeting update failed: ${message}`);
          }
          setTxLoading(false);
        },
      },
      });
    } catch (e) {
      setTxLoading(false);
    }
  }, [greetingInput, isLoggedIn, nearAccountId, tatchi, fetchGreeting]);

  const handleSignDelegateGreeting = useCallback(async () => {
    if (!canExecuteGreeting(greetingInput, isLoggedIn, nearAccountId)) return;

    const { login: loginState } = await tatchi.getLoginSession();

    setDelegateLoading(true);
    try {
      const relayerUrl = tatchi.configs.relayer?.url;
      if (!relayerUrl) {
        toast.error('Relayer URL is not configured: VITE_RELAYER_URL', {
          id: 'delegate-greeting',
        });
        return;
      }

      const delegateAction = createGreetingAction(greetingInput, { postfix: 'Delegate' });
      const contractId = tatchi.configs.contractId;
      if (!contractId) {
        toast.error('Contract ID is not configured: VITE_WEBAUTHN_CONTRACT_ID', {
          id: 'delegate-greeting',
        });
        return;
      }
      const result = await tatchi.signDelegateAction({
        nearAccountId: nearAccountId!,
        delegate: {
          senderId: nearAccountId!,
          receiverId: contractId,
          actions: [delegateAction],
          // Demo-only nonce / maxBlockHeight; real apps should use
          // chain context and replay protection from their relayer.
          nonce: Date.now(),
          maxBlockHeight: 0,
          publicKey: loginState.publicKey!,
        },
        options: {
          onEvent: (event) => {
            switch (event.phase) {
              case ActionPhase.STEP_1_PREPARATION:
              case ActionPhase.STEP_2_USER_CONFIRMATION:
              case ActionPhase.STEP_5_TRANSACTION_SIGNING_PROGRESS:
                toast.loading(event.message, { id: 'delegate-greeting' });
                break;
              case ActionPhase.STEP_6_TRANSACTION_SIGNING_COMPLETE:
                toast.success('Delegate action signed', { id: 'delegate-greeting' });
                break;
              case ActionPhase.ACTION_ERROR:
              case ActionPhase.WASM_ERROR:
                toast.error(`Delegate signing failed: ${event.error}`, { id: 'delegate-greeting' });
                break;
            }
          },
        },
      });

      toast.success('Signed delegate for set_greeting', {
        description: (
          <span>
            Delegate hash:&nbsp;
            <code>{result.hash.slice(0, 16)}…</code>
          </span>
        ),
      });

      // Forward the signed delegate to the configured relayer so it can
      // wrap the NEP-461 payload in an outer transaction and submit it.
      toast.loading('Submitting delegate to relayer…', { id: 'delegate-relay' });
      const relayResult = await tatchi.sendDelegateActionViaRelayer({
        relayerUrl,
        hash: result.hash,
        // WasmSignedDelegate is shape-compatible with the server-side SignedDelegate
        // and is treated as an opaque blob by the relayer.
        signedDelegate: result.signedDelegate as any,
        options: {
          afterCall: (success: boolean, res?: { ok?: boolean }) => {
            if (success && res?.ok !== false) {
              setTimeout(() => fetchGreeting(), 1000);
            }
          },
        },
      });

      toast.dismiss('delegate-relay');

      if (!relayResult.ok) {
        toast.error(`Relayer execution failed: ${relayResult.error || 'Unknown error'}`, {
          id: 'delegate-greeting',
        });
        return;
      }

      const txId = relayResult.relayerTxHash;
      if (txId) {
        const txLink = buildNearExplorerTxUrl(tatchi?.configs?.nearExplorerUrl, txId);
        toast.success('Delegate executed via relayer', {
          ...(txLink ? {
            description: (
              <a href={txLink} target="_blank" rel="noopener noreferrer">
                View transaction on NearBlocks
              </a>
            ),
          } : {}),
          id: 'delegate-greeting',
        });
      } else {
        toast.success('Delegate submitted via relayer (no TxID)', { id: 'delegate-greeting' });
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      toast.error(`Delegate signing failed: ${message}`, { id: 'delegate-greeting' });
    } finally {
      setDelegateLoading(false);
    }
  }, [greetingInput, isLoggedIn, nearAccountId, tatchi, createGreetingAction, fetchGreeting]);

  if (!isLoggedIn || !nearAccountId) {
    return null;
  }

  const accountName = nearAccountId?.split('.')?.[0];
  return (
    <div>
      <div className="action-section">
        <div className="demo-page-header">
          <h2 className="demo-title">Welcome, {accountName}</h2>
        </div>
      </div>

      <div className="action-section">
        <h2 className="demo-subtitle">Sign Transactions with TouchId</h2>
        <div className="action-text">
          Sign transactions securely in an cross-origin iframe.
        </div>

        <div className="greeting-controls-box">
          <div className="on-chain-greeting-box">
            <button
              onClick={handleRefreshGreeting}
              disabled={isLoading}
              title="Refresh Greeting"
              className="refresh-icon-button"
              aria-busy={isLoading}
            >
              <Refresh size={22} strokeWidth={2} />
            </button>
            <p><strong>{onchainGreeting ?? '...'}</strong></p>
          </div>

          <div className="greeting-input-group">
            <input
              type="text"
              name="greeting"
              value={greetingInput}
              onChange={(e) => setGreetingInput(e.target.value)}
              placeholder="Enter new greeting"
            />
          </div>
          <LoadingButton
            onClick={handleSetGreeting}
            loading={txLoading}
            loadingText="Processing..."
            variant="primary"
            size="medium"
            className="greeting-btn"
            disabled={!canExecuteGreeting(greetingInput, isLoggedIn, nearAccountId) || txLoading}
            style={{ width: 200 }}
          >
            Set Greeting
          </LoadingButton>
          <LoadingButton
            onClick={handleSignDelegateGreeting}
            loading={delegateLoading}
            loadingText="Signing delegate..."
            variant="secondary"
            size="medium"
            className="greeting-btn"
            disabled={!canExecuteGreeting(greetingInput, isLoggedIn, nearAccountId) || delegateLoading}
            style={{ width: 200, marginTop: '0.5rem' }}
          >
            Send Delegate Action
          </LoadingButton>

          {error && (
            <div className="error-message">Error: {error}</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DemoPage;
