import React, { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import {
  ActionPhase,
  ActionType,
  ActionResult,
  TouchIdWithText,
  TxExecutionStatus,
  usePasskeyContext,
} from '@tatchi-xyz/sdk/react';
import { SendTxButtonWithTooltip } from '@tatchi-xyz/sdk/react';
import type { ActionArgs, FunctionCallAction } from '@tatchi-xyz/sdk/react';

import { GlassBorder } from './GlassBorder';
import { LoadingButton } from './LoadingButton';
import Refresh from './icons/Refresh';
import { useSetGreeting } from '../hooks/useSetGreeting';
import { WEBAUTHN_CONTRACT_ID, NEAR_EXPLORER_BASE_URL } from '../config';
import './DemoPage.css';


export const DemoPage: React.FC = () => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [isSlideActive, setIsSlideActive] = useState(false);
  const [hasArmedHeavy, setHasArmedHeavy] = useState(false);

  // Detect when this slide becomes the active (enter) page in the carousel
  useEffect(() => {
    const el = rootRef.current?.closest('.carousel-page') as HTMLElement | null;
    if (!el) {
      // Not inside the carousel; arm immediately
      setIsSlideActive(true);
      setHasArmedHeavy(true);
      return;
    }
    const update = () => setIsSlideActive(el.classList.contains('page--active'));
    update();
    const mo = new MutationObserver(update);
    mo.observe(el, { attributes: true, attributeFilter: ['class'] });
    return () => mo.disconnect();
  }, []);

  // Once visible, arm heavy components after the slide transition completes
  useEffect(() => {
    if (!isSlideActive || hasArmedHeavy) return;

    const prefersReduced = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const pageEl = rootRef.current?.closest('.carousel-page') as HTMLElement | null;
    const rootEl = pageEl?.closest('.carousel-root') as HTMLElement | null;
    const transitionKind = rootEl?.getAttribute('data-transition') || 'slide';

    // Try to read CSS custom properties for durations; fall back to sensible defaults
    const cs = rootEl ? getComputedStyle(rootEl) : null;
    const parseTime = (v?: string | null) => {
      if (!v) return NaN;
      const s = v.trim();
      if (!s) return NaN;
      if (s.endsWith('ms')) return parseFloat(s);
      if (s.endsWith('s')) return parseFloat(s) * 1000;
      const n = parseFloat(s);
      return Number.isFinite(n) ? n : NaN;
    };
    const slideMs = parseTime(cs?.getPropertyValue('--carousel-slide-duration'));
    const fadeMs = parseTime(cs?.getPropertyValue('--carousel-fade-in-duration'));
    const baseMs = transitionKind === 'fade'
      ? (Number.isFinite(fadeMs) ? fadeMs : 240)
      : (Number.isFinite(slideMs) ? slideMs : 300);

    // Add a small buffer to ensure compositor settles
    const delayMs = prefersReduced ? 0 : baseMs + 80;

    let timer: number | null = null;
    // If there's no motion, or we can't detect elements, arm on next frame
    if (!pageEl || !rootEl || prefersReduced) {
      let raf1 = 0, raf2 = 0;
      raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => setHasArmedHeavy(true));
      });
      return () => { if (raf1) cancelAnimationFrame(raf1); if (raf2) cancelAnimationFrame(raf2); };
    }

    timer = window.setTimeout(() => setHasArmedHeavy(true), delayMs) as unknown as number;
    return () => { if (timer) clearTimeout(timer as unknown as number); };
  }, [isSlideActive, hasArmedHeavy]);
  const {
    loginState: { isLoggedIn, nearAccountId },
    passkeyManager,
  } = usePasskeyContext();

  const {
    onchainGreeting,
    isLoading,
    fetchGreeting,
    error,
  } = useSetGreeting();

  const networkPostfix = passkeyManager.configs.nearNetwork == 'mainnet' ? 'near' : 'testnet';
  const [greetingInput, setGreetingInput] = useState('Hello from Tatchi!');
  const [txLoading, setTxLoading] = useState(false);
  const [loadingUi, setLoadingUi] = useState<null | 'modal' | 'drawer'>(null);

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

    setTxLoading(true);
    try {
      await passkeyManager.executeAction({
      nearAccountId: nearAccountId!,
      receiverId: WEBAUTHN_CONTRACT_ID,
      actionArgs: actionToExecute,
      options: {
        onEvent: (event) => {
          switch (event.phase) {
            case ActionPhase.STEP_1_PREPARATION:
            case ActionPhase.STEP_4_WEBAUTHN_AUTHENTICATION:
            case ActionPhase.STEP_5_AUTHENTICATION_COMPLETE:
            case ActionPhase.STEP_6_TRANSACTION_SIGNING_PROGRESS:
            case ActionPhase.STEP_7_TRANSACTION_SIGNING_COMPLETE:
              toast.loading(event.message, { id: 'greeting' });
              break;
            case ActionPhase.STEP_8_BROADCASTING:
            case ActionPhase.STEP_9_ACTION_COMPLETE:
              toast.success(event.message, { id: 'greeting' });
              break;
            case ActionPhase.ACTION_ERROR:
            case ActionPhase.WASM_ERROR:
              toast.error(`Transaction failed: ${event.error}`, { id: 'greeting' });
              break;
          }
        },
        waitUntil: TxExecutionStatus.EXECUTED_OPTIMISTIC,
        afterCall: (success: boolean, result?: any) => {
          if (success && result?.transactionId) {
            const txId = result.transactionId;
            const txLink = `${NEAR_EXPLORER_BASE_URL}/transactions/${txId}`;
            toast.success('Greeting updated on-chain', {
              id: 'greeting',
              description: (
                <a href={txLink} target="_blank" rel="noopener noreferrer">
                  View transaction on NearBlocks
                </a>
              ),
            });
            setGreetingInput('');
            // Refresh the greeting after success
            setTimeout(() => { void fetchGreeting(); }, 1000);
          } else if (success) {
            toast.success('Greeting updated (no TxID)');
            setGreetingInput('');
            setTimeout(() => { void fetchGreeting(); }, 1000);
          } else {
            toast.error(`Greeting update failed: ${result?.error || 'Unknown error'}`);
          }
          setTxLoading(false);
        },
      },
      });
    } catch (e) {
      setTxLoading(false);
    }
  }, [greetingInput, isLoggedIn, nearAccountId, passkeyManager, fetchGreeting]);

  const nearToYocto = (nearAmount: string): string => {
    const amount = parseFloat(nearAmount);
    if (isNaN(amount) || amount <= 0) return '0';
    const nearStr = amount.toString();
    const parts = nearStr.split('.');
    const wholePart = parts[0] || '0';
    const fracPart = (parts[1] || '').padEnd(24, '0').slice(0, 24);
    return wholePart + fracPart;
  };

  const handleExecuteMultiActions = useCallback(async (uiMode: 'modal' | 'drawer') => {
    if (!isLoggedIn || !nearAccountId) return;
    setLoadingUi(uiMode);

    const DEMO_GREETING = 'Demo sign multiple actions';
    const DEMO_TRANSFER_AMOUNT = '0.001';
    const DEMO_STAKE_AMOUNT = '0.1';
    const DEMO_PUBLIC_KEY = 'ed25519:7PFkxo1jSCrxqN2jKVt5vXmQ9K1rs7JukqV4hdRzVPbd';
    const DEMO_BENEFICIARY = 'w3a-v1.testnet';

    await passkeyManager.executeAction({
      nearAccountId,
      receiverId: WEBAUTHN_CONTRACT_ID,
      actionArgs: [
        {
          type: ActionType.FunctionCall,
          methodName: 'set_greeting',
          args: { greeting: DEMO_GREETING },
          gas: '30000000000000',
          deposit: '0',
        },
        {
          type: ActionType.Transfer,
          amount: nearToYocto(DEMO_TRANSFER_AMOUNT),
        },
        {
          type: ActionType.CreateAccount
        },
        {
          type: ActionType.DeployContract,
          code: new Uint8Array([0x00, 0x61, 0x73, 0x6d]),
        },
        {
          type: ActionType.Stake,
          stake: nearToYocto(DEMO_STAKE_AMOUNT),
          publicKey: DEMO_PUBLIC_KEY.trim()
        },
        {
          type: ActionType.AddKey,
          publicKey: DEMO_PUBLIC_KEY.trim(),
          accessKey: { permission: 'FullAccess' }
        },
        {
          type: ActionType.DeleteKey,
          publicKey: DEMO_PUBLIC_KEY.trim()
        },
        {
          type: ActionType.DeleteAccount,
          beneficiaryId: DEMO_BENEFICIARY.trim()
        },
      ],
      options: {
        confirmationConfig: { uiMode },
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
          } else if (!success) {
            toast.error('Failed to execute transaction');
          }
          setLoadingUi(null);
        },
      },
    });
  }, [isLoggedIn, nearAccountId, passkeyManager]);

  if (!isLoggedIn || !nearAccountId) {
    return null;
  }

  const accountName = nearAccountId?.split('.')?.[0];

  return (
    <div ref={rootRef}>
      <GlassBorder style={{ maxWidth: 480, marginTop: '1rem' }} >

        <div className="action-section">
          <div className="demo-page-header">
            <h2 className="demo-title">Welcome, {accountName}</h2>
          </div>

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

            {error && (
              <div className="error-message">Error: {error}</div>
            )}
          </div>
        </div>

        <div className="action-section">
          <h2 className="demo-subtitle">Batch Sign Transactions</h2>
          <div className="action-text">
            Sign multiple transactions securely in an cross-origin iframe.
            Tx data in the tooltip is validated before signing.
            What you see is what you sign.
          </div>

          <div className={"button-with-tooltip-container"}>
            {!hasArmedHeavy
              ? <LoadingButton
                  onClick={() => {}}
                  loading={false}
                  loadingText="Batch Sign Actions"
                  variant="primary"
                  size="medium"
                  disabled={true}
                  style={{ width: 200 }}
                >
                  <TouchIdWithText buttonText="Batch Sign Actions" />
                </LoadingButton>
              : <SendTxButtonWithTooltip
                nearAccountId={nearAccountId}
                txSigningRequests={[
                  {
                    receiverId: WEBAUTHN_CONTRACT_ID,
                    actions: [
                      createGreetingAction(greetingInput, { postfix: 'Embedded' }),
                      { type: ActionType.Transfer, amount: '30000000000000000000' },
                    ],
                  },
                  {
                    receiverId: `jeff.${networkPostfix}`,
                    actions: [ { type: ActionType.Transfer, amount: '20000000000000000000' } ],
                  },
                  {
                    receiverId: `jensen.${networkPostfix}`,
                    actions: [ { type: ActionType.Transfer, amount: '10000000000000000000' } ],
                  },
                ]}
                onEvent={(event) => {
                  switch (event.phase) {
                    case ActionPhase.STEP_1_PREPARATION:
                    case ActionPhase.STEP_2_USER_CONFIRMATION:
                    case ActionPhase.STEP_3_CONTRACT_VERIFICATION:
                    case ActionPhase.STEP_4_WEBAUTHN_AUTHENTICATION:
                    case ActionPhase.STEP_5_AUTHENTICATION_COMPLETE:
                    case ActionPhase.STEP_6_TRANSACTION_SIGNING_PROGRESS:
                    case ActionPhase.STEP_7_TRANSACTION_SIGNING_COMPLETE:
                    case ActionPhase.STEP_8_BROADCASTING:
                      toast.loading(event.message, { id: 'embedded' });
                      break;
                    case ActionPhase.STEP_9_ACTION_COMPLETE:
                      toast.success(event.message, { id: 'embedded' });
                      break;
                    case ActionPhase.ACTION_ERROR:
                    case ActionPhase.WASM_ERROR:
                      toast.error(`Transaction failed: ${event.error}`, { id: 'embedded' });
                      break;
                  }
                }}
                options={{
                  // Force the confirmer to use the drawer UI for this flow
                  confirmationConfig: { uiMode: 'drawer' },
                  waitUntil: TxExecutionStatus.EXECUTED_OPTIMISTIC,
                  afterCall: (success: boolean, result?: ActionResult[]) => {
                    if (success && result) {
                      const last = result[result.length - 1] ?? result[0];
                      let txId = last?.transactionId;
                      if (txId) {
                        toast.success('Embedded flow complete', {
                          id: 'embedded',
                          description: (
                            <a href={`${NEAR_EXPLORER_BASE_URL}/transactions/${txId}`}
                              target="_blank" rel="noopener noreferrer"
                            >
                              View transaction on NearBlocks
                            </a>
                          ),
                        });
                      } else {
                        toast.success('Embedded flow complete');
                      }
                      setTimeout(() => { void fetchGreeting(); }, 1000);
                    }
                  },
                  onError: (error) => {
                    const message = error instanceof Error ? error.message : String(error);
                    toast.error(`Transaction failed: ${message}`, { id: 'embedded' });
                  },
                }}
                buttonStyle={{
                  color: 'white',
                  background: 'var(--w3a-colors-primary)',
                  borderRadius: '2rem',
                  border: 'none',
                  boxShadow: '0px 0px 3px 1px rgba(0, 0, 0, 0.1)',
                  fontSize: '16px',
                  height: '44px',
                }}
                buttonHoverStyle={{
                  background: 'var(--w3a-colors-primaryHover)',
                  boxShadow: '0px 0px 4px 2px rgba(0, 0, 0, 0.2)',
                }}
                tooltipPosition={{
                  position: 'bottom-left',
                }}
                buttonTextElement={<TouchIdWithText buttonText="Batch Sign Actions" />}
                onCancel={() => toast('Transaction cancelled by user', { id: 'embedded' })}
                onSuccess={(result) => {
                  try {
                    const last = result[result.length - 1] ?? result[0];
                    let txId = last?.transactionId;
                    if (txId) {
                      const txLink = `${NEAR_EXPLORER_BASE_URL}/transactions/${txId}`;
                      toast.success('Tx Success', {
                        id: 'embedded',
                        description: (
                          <a href={txLink} target="_blank" rel="noopener noreferrer">
                            View transaction on NearBlocks ({txId})
                          </a>
                        ),
                      });
                    } else {
                      toast.success('Tx Success', { id: 'embedded' });
                    }
                  } catch {
                    toast.success('Tx Success', { id: 'embedded' });
                  }
                  // Refresh the greeting after success
                  setTimeout(() => { void fetchGreeting(); }, 1000);
                }}
              />
            }
          </div>
        </div>

        <div className="action-section" style={{ marginTop: '1rem' }}>
          <h2 className="demo-subtitle">Choose between Modal or Drawer</h2>
          <div className="action-text">
            Choose between Modal or Drawer for the tx confirmer menus.
            You can also skip the confirmation menu (only on desktop).
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <LoadingButton
              onClick={() => handleExecuteMultiActions('modal')}
              loading={loadingUi === 'modal'}
              loadingText="Signing..."
              variant="primary"
              size="medium"
              style={{ flex: 1 }}
            >
              Show Modal
            </LoadingButton>
            <LoadingButton
              onClick={() => handleExecuteMultiActions('drawer')}
              loading={loadingUi === 'drawer'}
              loadingText="Signing..."
              variant="secondary"
              size="medium"
              style={{ flex: 1 }}
            >
              Show Drawer
            </LoadingButton>
          </div>
        </div>
      </GlassBorder>
    </div>
  );
};

export default DemoPage;
