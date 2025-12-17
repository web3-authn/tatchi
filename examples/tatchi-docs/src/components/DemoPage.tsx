import React, { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import {
  ActionPhase,
  ActionType,
  ActionResult,
  TxExecutionStatus,
  useTatchi,
} from '@tatchi-xyz/sdk/react';
import { TouchIdWithText, SendTxButtonWithTooltip } from '@tatchi-xyz/sdk/react/embedded';
import type { ActionArgs, FunctionCallAction } from '@tatchi-xyz/sdk/react';
import type { ConfirmationUIMode, ConfirmationBehavior } from '@tatchi-xyz/sdk/core';

import { LoadingButton } from './LoadingButton';
import Refresh from './icons/Refresh';
import { useSetGreeting } from '../hooks/useSetGreeting';
import { WEBAUTHN_CONTRACT_ID, NEAR_EXPLORER_BASE_URL } from '../types';
import './DemoPage.css';


export const DemoPage: React.FC = () => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [isSlideActive, setIsSlideActive] = useState(false);
  const [hasArmedHeavy, setHasArmedHeavy] = useState(false);
  const [clockMs, setClockMs] = useState(() => Date.now());

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

  // Lightweight clock for TTL countdown display
  useEffect(() => {
    const id = window.setInterval(() => setClockMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

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

  const networkPostfix = tatchi.configs.nearNetwork == 'mainnet' ? 'near' : 'testnet';
  const [greetingInput, setGreetingInput] = useState('Hello from Tatchi!');
  const [txLoading, setTxLoading] = useState(false);
  const [delegateLoading, setDelegateLoading] = useState(false);
  const [loadingUi, setLoadingUi] = useState<ConfirmationUIMode|null>(null);
  const [unlockLoading, setUnlockLoading] = useState(false);
  const [sessionStatusLoading, setSessionStatusLoading] = useState(false);
  const [sessionRemainingUsesInput, setSessionRemainingUsesInput] = useState(3);
  const [sessionTtlSecondsInput, setSessionTtlSecondsInput] = useState(300);
  const [sessionStatus, setSessionStatus] = useState<{
    sessionId: string;
    status: 'active' | 'exhausted' | 'expired' | 'not_found';
    remainingUses?: number;
    expiresAtMs?: number;
    createdAtMs?: number;
  } | null>(null);

  const refreshSessionStatus = useCallback(async () => {
    if (!nearAccountId) return;
    setSessionStatusLoading(true);
    try {
      const sess = await tatchi.getLoginSession(nearAccountId);
      setSessionStatus(sess?.signingSession || null);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      toast.error(`Failed to fetch session status: ${message}`, { id: 'session-status' });
    } finally {
      setSessionStatusLoading(false);
    }
  }, [nearAccountId, tatchi]);

  // Fetch session status on mount/account change (best-effort; errors are toast-only)
  useEffect(() => {
    if (!isLoggedIn || !nearAccountId) return;
    void refreshSessionStatus();
  }, [isLoggedIn, nearAccountId, refreshSessionStatus]);

  const handleUnlockSession = useCallback(async () => {
    if (!nearAccountId) return;

    const remainingUses = Number.isFinite(sessionRemainingUsesInput)
      ? Math.max(0, Math.floor(sessionRemainingUsesInput))
      : undefined;
    const ttlSeconds = Number.isFinite(sessionTtlSecondsInput)
      ? Math.max(0, Math.floor(sessionTtlSecondsInput))
      : undefined;
    const ttlMs = typeof ttlSeconds === 'number' ? ttlSeconds * 1000 : undefined;

    setUnlockLoading(true);
    toast.loading('Logging in & creating session…', { id: 'unlock-session' });
    try {
      await tatchi.loginAndCreateSession(nearAccountId, {
        signingSession: { ttlMs, remainingUses },
      });
      await refreshSessionStatus();
      toast.success('Session ready', { id: 'unlock-session' });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      toast.error(`Failed to create session: ${message}`, { id: 'unlock-session' });
    } finally {
      setUnlockLoading(false);
    }
  }, [nearAccountId, sessionRemainingUsesInput, sessionTtlSecondsInput, tatchi, refreshSessionStatus]);

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
      await tatchi.executeAction({
      nearAccountId: nearAccountId!,
      receiverId: WEBAUTHN_CONTRACT_ID,
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
        afterCall: (success: boolean, result?: any) => {
          try { toast.dismiss('greeting'); } catch {}
          if (success && result?.transactionId) {
            const txId = result.transactionId;
            const txLink = `${NEAR_EXPLORER_BASE_URL}/transactions/${txId}`;
            toast.success('Greeting updated on-chain', {
              description: (
                <a href={txLink} target="_blank" rel="noopener noreferrer">
                  View transaction on NearBlocks
                </a>
              ),
            });
            setGreetingInput('');
            // Refresh the greeting after success
            setTimeout(() => fetchGreeting(), 1000);
          } else if (success) {
            toast.success('Greeting updated (no TxID)');
            setGreetingInput('');
            setTimeout(() => fetchGreeting(), 1000);
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
      const result = await tatchi.signDelegateAction({
        nearAccountId: nearAccountId!,
        delegate: {
          senderId: nearAccountId!,
          receiverId: WEBAUTHN_CONTRACT_ID,
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
        const txLink = `${NEAR_EXPLORER_BASE_URL}/transactions/${txId}`;
        toast.success('Delegate executed via relayer', {
          description: (
            <a href={txLink} target="_blank" rel="noopener noreferrer">
              View transaction on NearBlocks
            </a>
          ),
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

  const nearToYocto = (nearAmount: string): string => {
    const amount = parseFloat(nearAmount);
    if (isNaN(amount) || amount <= 0) return '0';
    const nearStr = amount.toString();
    const parts = nearStr.split('.');
    const wholePart = parts[0] || '0';
    const fracPart = (parts[1] || '').padEnd(24, '0').slice(0, 24);
    return wholePart + fracPart;
  };

  const handleExecuteMultiActions = useCallback(async (
    uiMode: ConfirmationUIMode,
    behavior?: ConfirmationBehavior
  ) => {
    if (!isLoggedIn || !nearAccountId) return;
    setLoadingUi(uiMode);

    const DEMO_GREETING = 'Demo sign multiple actions';
    const DEMO_TRANSFER_AMOUNT = '0.001';
    const DEMO_STAKE_AMOUNT = '0.1';
    const DEMO_PUBLIC_KEY = 'ed25519:7PFkxo1jSCrxqN2jKVt5vXmQ9K1rs7JukqV4hdRzVPbd';
    const DEMO_BENEFICIARY = 'w3a-v1.testnet';

    await tatchi.executeAction({
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
        confirmationConfig: { uiMode, behavior },
        onEvent: (event) => {
          switch (event.phase) {
            case ActionPhase.STEP_1_PREPARATION:
              toast.loading('Processing transaction...', { id: 'combinedTx' });
              break;
            case ActionPhase.ACTION_ERROR:
              toast.error(`Transaction failed: ${event.error}`, { id: 'combinedTx' });
              break;
          }
        },
        waitUntil: TxExecutionStatus.EXECUTED_OPTIMISTIC,
        afterCall: (success: boolean, result?: any) => {
          try { toast.dismiss('combinedTx'); } catch {}
          if (success && result?.transactionId) {
            const txLink = `${NEAR_EXPLORER_BASE_URL}/transactions/${result.transactionId}`;
            toast.success('Transaction completed successfully!', {
              description: (
                <a href={txLink} target="_blank" rel="noopener noreferrer">
                  View transaction on NearBlocks
                </a>
              ),
            });
          } else if (success) {
            toast.success('Transaction completed successfully!');
          } else {
            toast.error('Failed to execute transaction');
          }
          setLoadingUi(null);
        },
      },
    });
  }, [isLoggedIn, nearAccountId, tatchi]);

  if (!isLoggedIn || !nearAccountId) {
    return null;
  }

  const accountName = nearAccountId?.split('.')?.[0];
  const expiresInSec = sessionStatus?.expiresAtMs != null
    ? Math.max(0, Math.ceil((sessionStatus.expiresAtMs - clockMs) / 1000))
    : null;

  return (
    <div ref={rootRef}>
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

      <div className="action-section">
        <h2 className="demo-subtitle">Batch Sign Transactions</h2>
        <div className="action-text">
          Sign multiple transactions securely in an cross-origin iframe.
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
                  case ActionPhase.STEP_3_WEBAUTHN_AUTHENTICATION:
                  case ActionPhase.STEP_4_AUTHENTICATION_COMPLETE:
                  case ActionPhase.STEP_5_TRANSACTION_SIGNING_PROGRESS:
                  case ActionPhase.STEP_6_TRANSACTION_SIGNING_COMPLETE:
                  case ActionPhase.STEP_7_BROADCASTING:
                    toast.loading(event.message, { id: 'embedded' });
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
                      try { toast.dismiss('embedded'); } catch {}
                      toast.success('Embedded flow complete', {
                        description: (
                          <a href={`${NEAR_EXPLORER_BASE_URL}/transactions/${txId}`}
                            target="_blank" rel="noopener noreferrer"
                          >
                            View transaction on NearBlocks
                          </a>
                        ),
                      });
                    } else {
                      try { toast.dismiss('embedded'); } catch {}
                      toast.success('Embedded flow complete');
                    }
                    setTimeout(() => void fetchGreeting(), 1000);
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
                    try { toast.dismiss('embedded'); } catch {}
                    toast.success('Tx Success', {
                      description: (
                        <a href={txLink} target="_blank" rel="noopener noreferrer">
                          View transaction on NearBlocks ({txId})
                        </a>
                      ),
                    });
                  } else {
                    try { toast.dismiss('embedded'); } catch {}
                    toast.success('Tx Success');
                  }
                } catch {
                  try { toast.dismiss('embedded'); } catch {}
                  toast.success('Tx Success');
                }
                // Refresh the greeting after success
                setTimeout(() => fetchGreeting(), 1000);
              }}
            />
          }
        </div>
      </div>

      <div className="action-section" style={{ marginTop: '1rem' }}>
        <h2 className="demo-subtitle">Configure Transaction UX Options</h2>
        <div className="action-text">
          Choose between Modal or Drawer for the tx confirmer menus.
          You can also skip the confirmation menu.
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <LoadingButton
            onClick={() => handleExecuteMultiActions('modal', 'requireClick')}
            loading={loadingUi === 'modal'}
            loadingText="Signing..."
            variant="primary"
            size="medium"
            style={{ flex: 1 }}
          >
            Show Modal
          </LoadingButton>
          <LoadingButton
            onClick={() => handleExecuteMultiActions('drawer', 'autoProceed')}
            loading={loadingUi === 'drawer'}
            loadingText="Signing..."
            variant="secondary"
            size="medium"
            style={{ flex: 1, minWidth: 200 }}
          >
            Drawer + Skip Confirm
          </LoadingButton>
        </div>
      </div>

      <div className="action-section">
        <div className="demo-divider" aria-hidden="true" />
        <h2 className="demo-subtitle">VRF Signing Session</h2>
        <div className="action-text">
          Create a warm signing session with configurable <code>remaining_uses</code> and TTL.
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 180, flex: 1 }}>
            <label style={{ fontSize: '0.9rem', color: 'var(--fe-text-secondary)' }}>
              Remaining uses
            </label>
            <input
              type="number"
              min={0}
              step={1}
              value={sessionRemainingUsesInput}
              onChange={(e) => setSessionRemainingUsesInput(parseInt(e.target.value || '0', 10))}
              style={{
                height: 44,
                padding: '0 12px',
                backgroundColor: 'var(--w3a-colors-surface2)',
                border: '1px solid var(--fe-border)',
                borderRadius: 'var(--fe-radius-lg)',
                color: 'var(--fe-input-text)',
                fontSize: '0.9rem',
              }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 180, flex: 1 }}>
            <label style={{ fontSize: '0.9rem', color: 'var(--fe-text-secondary)' }}>
              TTL (seconds)
            </label>
            <input
              type="number"
              min={0}
              step={1}
              value={sessionTtlSecondsInput}
              onChange={(e) => setSessionTtlSecondsInput(parseInt(e.target.value || '0', 10))}
              style={{
                height: 44,
                padding: '0 12px',
                backgroundColor: 'var(--w3a-colors-surface2)',
                border: '1px solid var(--fe-border)',
                borderRadius: 'var(--fe-radius-lg)',
                color: 'var(--fe-input-text)',
                fontSize: '0.9rem',
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <LoadingButton
              onClick={handleUnlockSession}
              loading={unlockLoading}
              loadingText="Creating..."
              variant="primary"
              size="medium"
              style={{ width: 180 }}
            >
              Create Session
            </LoadingButton>
          </div>
        </div>

        <div
          style={{
            marginTop: 12,
            background: 'var(--fe-bg-secondary)',
            border: '1px solid var(--fe-border)',
            borderRadius: 'var(--fe-radius-lg)',
            padding: 'var(--fe-gap-3)',
            fontSize: '0.9rem',
            color: 'var(--fe-text)',
          }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <strong>Status:</strong>&nbsp;{sessionStatus?.status ?? '…'}
            </div>
            <div>
              <strong>Remaining uses:</strong>&nbsp;
              {typeof sessionStatus?.remainingUses === 'number' ? sessionStatus.remainingUses : '—'}
            </div>
            <div>
              <strong>TTL:</strong>&nbsp;
              {expiresInSec == null
                ? '—'
                : (sessionStatus?.status === 'active' ? `${expiresInSec}s remaining` : `${expiresInSec}s`)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DemoPage;
