import { ActionType, toActionArgsWasm } from '../types/actions';
import type {
  ActionHooksOptions,
  ExecutionWaitOption,
  SendTransactionHooksOptions,
  SignAndSendTransactionHooksOptions,
  SignTransactionHooksOptions,
} from '../types/sdkSentEvents';
import type { ActionResult, SignTransactionResult } from '../types/tatchi';
import type { TxExecutionStatus } from '@near-js/types';
import type { ActionArgs, TransactionInput, TransactionInputWasm } from '../types/actions';
import { type ConfirmationConfig, type SignerMode, coerceSignerMode } from '../types/signer-worker';
import type { PasskeyManagerContext } from './index';
import type { SignedTransaction } from '../NearClient';
import type { AccountId } from '../types/accountIds';
import { ActionPhase, ActionStatus, type ActionSSEEvent, type onProgressEvents } from '../types/sdkSentEvents';
import { toError, getNearShortErrorMessage } from '../../utils/errors';


/**
 * executeAction signs a single transaction (with actions[]) to a single receiver.
 * If you want to sign multiple transactions to different receivers,
 * use signTransactionsWithActions() instead.
 *
 * @param context - TatchiPasskey context
 * @param nearAccountId - NEAR account ID to sign transactions with
 * @param actionArgs - Action arguments to sign transactions with
 * @param options - Options for the action
 * @returns Promise resolving to the action result
 */
export async function executeAction(args: {
  context: PasskeyManagerContext,
  nearAccountId: AccountId,
  receiverId: AccountId,
  actionArgs: ActionArgs | ActionArgs[],
  options: ActionHooksOptions,
}): Promise<ActionResult> {
  try {
    const signerMode = coerceSignerMode(args.options?.signerMode, args.context.configs.signerMode);
    // Thread optional per-call confirmation override when provided; otherwise
    // user preferences determine the confirmation behavior.
    return executeActionInternal({
      context: args.context,
      nearAccountId: args.nearAccountId,
      receiverId: args.receiverId,
      actionArgs: args.actionArgs,
      signerMode,
      options: args.options,
      confirmationConfigOverride: args.options.confirmationConfig
    });
  } catch (error: unknown) {
    throw toError(error);
  }
}

// Helper: parallel broadcast with per-item stagger. Keeps UI snappy while avoiding RPC bursts.
async function sendTransactionsParallelStaggered({
  context,
  signedTxs,
  options,
  staggerMs,
}: {
  context: PasskeyManagerContext,
  signedTxs: SignTransactionResult[],
  options?: SignAndSendTransactionHooksOptions,
  staggerMs: number,
}): Promise<ActionResult[]> {
  return Promise.all(signedTxs.map(async (tx, i) => {
    if (i > 0 && staggerMs > 0) {
      await new Promise(r => setTimeout(r, i * staggerMs));
    }
    return sendTransaction({
      context,
      signedTransaction: tx.signedTransaction,
      options: {
        onEvent: options?.onEvent,
        waitUntil: options?.waitUntil,
      }
    });
  }));
}

// Execution plan types for broadcasting multiple transactions
interface SequentialExecutionPlan {
  mode: 'sequential';
  waitUntil?: TxExecutionStatus;
}
interface ParallelStaggeredExecutionPlan {
  mode: 'parallelStaggered';
  staggerMs: number;
}
type ExecutionPlan = SequentialExecutionPlan | ParallelStaggeredExecutionPlan;

// Helper: parse executionWait into a clear execution plan
function parseExecutionWait(options?: SignAndSendTransactionHooksOptions): ExecutionPlan {
  const ew = options?.executionWait as ExecutionWaitOption | undefined;
  if (!ew) {
    return { mode: 'sequential', waitUntil: options?.waitUntil };
  }
  if ('mode' in ew) {
    if (ew.mode === 'sequential') {
      return { mode: 'sequential', waitUntil: ew.waitUntil };
    }
    // parallelStaggered
    const ms = Math.max(0, Number(ew.staggerMs ?? 75));
    return { mode: 'parallelStaggered', staggerMs: ms };
  }
  // Fallback: treat unknown shapes as sequential using provided waitUntil
  return { mode: 'sequential', waitUntil: options?.waitUntil };
}

/**
 * Signs multiple transactions with actions, and broadcasts them
 *
 * @param context - TatchiPasskey context
 * @param nearAccountId - NEAR account ID to sign transactions with
 * @param transactionInput - Transaction input to sign
 * @param options - Options for the action
 * @returns Promise resolving to the action result
 */
export async function signAndSendTransactions(args: {
  context: PasskeyManagerContext,
  nearAccountId: AccountId,
  transactionInputs: TransactionInput[],
  options: SignAndSendTransactionHooksOptions,
}): Promise<ActionResult[]> {
  const signerMode = coerceSignerMode(args.options?.signerMode, args.context.configs.signerMode);
  return signAndSendTransactionsInternal({
    context: args.context,
    nearAccountId: args.nearAccountId,
    transactionInputs: args.transactionInputs,
    signerMode,
    options: args.options,
    confirmationConfigOverride: args.options.confirmationConfig
  });
}

/**
 * Signs transactions with actions, without broadcasting them
 *
 * @param context - TatchiPasskey context
 * @param nearAccountId - NEAR account ID to sign transactions with
 * @param actionArgs - Action arguments to sign transactions with
 * @param options - Options for the action
 * @returns Promise resolving to the action result
 */
export async function signTransactionsWithActions(args: {
  context: PasskeyManagerContext,
  nearAccountId: AccountId,
  transactionInputs: TransactionInput[],
  options: SignTransactionHooksOptions,
}): Promise<SignTransactionResult[]> {
  try {
    const signerMode = coerceSignerMode(args.options?.signerMode, args.context.configs.signerMode);
    return signTransactionsWithActionsInternal({
      context: args.context,
      nearAccountId: args.nearAccountId,
      transactionInputs: args.transactionInputs,
      signerMode,
      options: args.options,
      confirmationConfigOverride: args.options.confirmationConfig
      // Public API always uses undefined override (respects user settings)
    });
  } catch (error: unknown) {
    throw toError(error);
  }
}

/**
 * 3. Transaction Broadcasting - Broadcasts the signed transaction to NEAR network
 * This method broadcasts a previously signed transaction and waits for execution
 *
 * @param context - TatchiPasskey context
 * @param signedTransaction - The signed transaction to broadcast
 * @param waitUntil - The execution status to wait for (defaults to FINAL)
 * @returns Promise resolving to the transaction execution outcome
 *
 * @example
 * ```typescript
 * // Sign a transaction first
 * const signedTransactions = await signTransactionsWithActions(context, 'alice.near', {
 *   transactions: [{
 *     nearAccountId: 'alice.near',
 *     receiverId: 'bob.near',
 *     actions: [{
 *       action_type: ActionType.Transfer,
 *       deposit: '1000000000000000000000000'
 *     }],
 *     nonce: '123'
 *   }]
 * });
 *
 * // Then broadcast it
 * const result = await sendTransaction(
 *   context,
 *   signedTransactions[0].signedTransaction,
 *   TxExecutionStatus.FINAL
 * );
 * ```
 *
 * sendTransaction centrally manages nonce lifecycle around broadcast:
 * - On success: reconciles nonce with chain via updateNonceFromBlockchain() (async),
 *   which also prunes any stale reservations.
 * - On failure: releases the reserved nonce immediately to avoid leaks.
 * Callers SHOULD NOT release the nonce in their own catch blocks.
 */
export async function sendTransaction({
  context,
  signedTransaction,
  options,
}: {
  context: PasskeyManagerContext,
  signedTransaction: SignedTransaction,
  options?: SendTransactionHooksOptions,
}): Promise<ActionResult> {

  options?.onEvent?.({
    step: 7,
    phase: ActionPhase.STEP_7_BROADCASTING,
    status: ActionStatus.PROGRESS,
    message: `Broadcasting transaction...`
  });

  let transactionResult;
  let txId;
  try {
    // Debug snapshot of the signed transaction shape to aid integration debugging.
    try {
      const st: any = signedTransaction as any;
      const snapshot = {
        type: typeof st,
        keys: st && typeof st === 'object' ? Object.keys(st) : null,
        hasBase64Encode: typeof st?.base64Encode === 'function',
        hasEncode: typeof st?.encode === 'function',
        hasSnakeBytes: !!st?.borsh_bytes,
        hasCamelBytes: !!st?.borshBytes,
      };
      console.debug('[sendTransaction] signedTransaction snapshot', snapshot);
    } catch {
      // best-effort logging only
    }

    transactionResult = await context.nearClient.sendTransaction(
      signedTransaction,
      options?.waitUntil
    );
    txId = transactionResult.transaction?.hash || transactionResult.transaction?.id;

    // Update nonce from blockchain after successful transaction broadcast asynchronously
    const nonce = signedTransaction.transaction.nonce;
    context.webAuthnManager.getNonceManager().updateNonceFromBlockchain(
      context.nearClient,
      nonce.toString()
    ).catch((error) => {
      console.warn('[sendTransaction] Failed to update nonce from blockchain:', error);
      // don't fail transaction if nonce update fails
    });

    options?.onEvent?.({
      step: 7,
      phase: ActionPhase.STEP_7_BROADCASTING,
      status: ActionStatus.SUCCESS,
      message: `Transaction ${txId} sent successfully`
    });
    options?.onEvent?.({
      step: 8,
      phase: ActionPhase.STEP_8_ACTION_COMPLETE,
      status: ActionStatus.SUCCESS,
      message: `Transaction ${txId} completed `
    });
  } catch (error: unknown) {
    const e = toError(error);
    console.error('[sendTransaction] failed:', e);
    const details = (e as { details?: unknown }).details;
    if (details) {
      // Surface full details at error level for visibility during debugging
      console.error('[sendTransaction] RPC error details:', details);
    }
    // Centralized cleanup: release reserved nonce on failure (idempotent)
    try {
      const nonce = signedTransaction.transaction.nonce;
      context.webAuthnManager.getNonceManager().releaseNonce(nonce.toString());
    } catch (nonceError) {
      console.warn('[sendTransaction]: Failed to release nonce after failure:', nonceError);
    }
    throw e;
  }

  return {
    success: true,
    transactionId: txId,
    result: transactionResult
  };
}

//////////////////////////////
// === INTERNAL API ===
//////////////////////////////

/**
 * Internal API for executing actions with optional confirmation override
 * @internal - Only used by internal SDK components like SecureTxConfirmButton
 *
 * @param context - TatchiPasskey context
 * @param nearAccountId - NEAR account ID to sign transactions with
 * @param actionArgs - Action arguments to sign transactions with
 * @param options - Options for the action
 * @returns Promise resolving to the action result
 */
export async function executeActionInternal({
  context,
  nearAccountId,
  receiverId,
  actionArgs,
  signerMode,
  options,
  confirmationConfigOverride,
}: {
  context: PasskeyManagerContext,
  nearAccountId: AccountId,
  receiverId: AccountId,
  actionArgs: ActionArgs | ActionArgs[],
  signerMode: SignerMode,
  options?: ActionHooksOptions,
  // Accept partial override and merge later in confirm flow
  confirmationConfigOverride?: Partial<ConfirmationConfig> | undefined,
}): Promise<ActionResult> {

  const { onEvent, onError, afterCall, waitUntil } = options || {};
  const confirmerText = options?.confirmerText;
  const actions = Array.isArray(actionArgs) ? actionArgs : [actionArgs];

  try {
    // Pre-warm NonceManager with fresh transaction context data without blocking UI feedback
    void context.webAuthnManager
      .getNonceManager()
      .getNonceBlockHashAndHeight(context.nearClient)
      .catch((error) => {
        console.warn('[executeAction]: Failed to pre-warm NonceManager:', error);
        // Continue execution - NonceManager will fall back to direct RPC calls if needed
      });

    const signedTxs = await signTransactionsWithActionsInternal({
      context,
      nearAccountId,
      transactionInputs: [{
        receiverId: receiverId,
        actions: actions,
      }],
      signerMode,
      options: { onEvent, onError, waitUntil, confirmerText },
      confirmationConfigOverride
    });

    const txResult = await sendTransaction({
      context,
      signedTransaction: signedTxs[0].signedTransaction,
      options: { onEvent, onError, waitUntil }
    });
    afterCall?.(true, txResult);
    return txResult;

  } catch (error: unknown) {
    console.error('[executeAction] Error during execution:', error);
    const e = toError(error);
    const short = (e as { short?: string }).short || getNearShortErrorMessage(e);
    onError?.(e);
    onEvent?.({
      step: 0,
      phase: ActionPhase.ACTION_ERROR,
      status: ActionStatus.ERROR,
      message: `Action failed: ${short || e.message}`,
      error: short || e.message
    });
    const result: ActionResult = {
      success: false,
      error: e.message,
      // propagate structured RPC details when present so UIs can render helpful errors
      errorDetails: (e as any)?.details,
      transactionId: undefined,
    };
    afterCall?.(false);
    return result;
  }
}

export async function signAndSendTransactionsInternal({
  context,
  nearAccountId,
  transactionInputs,
  signerMode,
  options,
  confirmationConfigOverride,
}: {
  context: PasskeyManagerContext,
  nearAccountId: AccountId,
  transactionInputs: TransactionInput[],
  signerMode: SignerMode,
  options?: SignAndSendTransactionHooksOptions,
  confirmationConfigOverride?: Partial<ConfirmationConfig> | undefined,
}): Promise<ActionResult[]> {

  try {
    const signedTxs = await signTransactionsWithActionsInternal({
      context,
      nearAccountId,
      transactionInputs,
      signerMode,
      options,
      confirmationConfigOverride
    });

    // Determine execution strategy from the new executionWait option.
    const plan = parseExecutionWait(options);
    if (plan.mode === 'sequential') {
      const txResults: ActionResult[] = [];
      for (let i = 0; i < signedTxs.length; i++) {
        const tx = signedTxs[i];
        const txResult = await sendTransaction({
          context,
          signedTransaction: tx.signedTransaction,
          options: {
            onEvent: options?.onEvent,
            waitUntil: plan.waitUntil ?? options?.waitUntil,
          }
        });
        txResults.push(txResult);
      }
      return txResults;
    }

    // Parallel execution with configurable staggering to reduce transient RPC failures
    return await sendTransactionsParallelStaggered({
      context,
      signedTxs,
      options,
      staggerMs: plan.staggerMs
    });
  } catch (error: unknown) {
    // If signing fails, release all reserved nonces
    context.webAuthnManager.getNonceManager().releaseAllNonces();
    const e = toError(error);
    const short = (e as { short?: string }).short || getNearShortErrorMessage(e) || e.message;
    options?.onEvent?.({
      step: 0,
      phase: ActionPhase.ACTION_ERROR,
      status: ActionStatus.ERROR,
      message: `Action failed: ${short}`,
      error: short
    });
    options?.onError?.(e);
    throw e;
  }
}

/**
 * Internal API for signing transactions with actions
 * @internal - Only used by internal SDK components with confirmationConfigOverride
 *
 * @param context - TatchiPasskey context
 * @param nearAccountId - NEAR account ID to sign transactions with
 * @param actionArgs - Action arguments to sign transactions with
 * @param options - Options for the action
 * @returns Promise resolving to the action result
 */
export async function signTransactionsWithActionsInternal({
  context,
  nearAccountId,
  transactionInputs,
  signerMode,
  options,
  confirmationConfigOverride,
}: {
  context: PasskeyManagerContext,
  nearAccountId: AccountId,
  transactionInputs: TransactionInput[],
  signerMode: SignerMode,
  options?: Omit<ActionHooksOptions, 'afterCall'>,
  confirmationConfigOverride?: Partial<ConfirmationConfig> | undefined,
}): Promise<SignTransactionResult[]> {

  const { onEvent, onError, waitUntil, confirmerText } = options || {};

  try {
    // Emit started event
    onEvent?.({
      step: 1,
      phase: ActionPhase.STEP_1_PREPARATION,
      status: ActionStatus.PROGRESS,
      message: transactionInputs.length > 1
        ? `Starting batched transaction with ${transactionInputs.length} actions`
        : `Starting ${transactionInputs[0].actions[0].type} action`
    });

    // 1. Basic validation (NEAR data fetching moved to confirmation flow)
    await validateInputsOnly(nearAccountId, transactionInputs, { onEvent, onError, waitUntil });

    // 2. VRF Authentication + Transaction Signing (NEAR data fetched in confirmation flow)
    onEvent?.({
      step: 2,
      phase: ActionPhase.STEP_2_USER_CONFIRMATION,
      status: ActionStatus.PROGRESS,
      message: 'Requesting user confirmation...'
    });

    // Convert all actions to ActionArgsWasm format for batched transaction
    const transactionInputsWasm: TransactionInputWasm[] = transactionInputs.map(tx => {
      return {
        receiverId: tx.receiverId,
        actions: tx.actions.map(action => toActionArgsWasm(action)),
      }
    });

    // VRF challenge and NEAR data will be generated in the confirmation flow
    // - Nonce will be fetched within the confirmation flow
    // This eliminates the ~500ms blocking operations before modal display
    return context.webAuthnManager.signTransactionsWithActions({
      transactions: transactionInputsWasm,
      rpcCall: {
        contractId: context.configs.contractId,
        nearRpcUrl: context.configs.nearRpcUrl,
        nearAccountId: nearAccountId, // caller account
      },
      signerMode,
      // VRF challenge and NEAR data computed in confirmation flow
      confirmationConfigOverride: confirmationConfigOverride,
      title: confirmerText?.title,
      body: confirmerText?.body,
      // Pass through the onEvent callback for progress updates
      onEvent: onEvent ? (progressEvent: onProgressEvents) => {
        if (progressEvent.phase === ActionPhase.STEP_3_WEBAUTHN_AUTHENTICATION) {
          onEvent?.({
            step: 3,
            phase: ActionPhase.STEP_3_WEBAUTHN_AUTHENTICATION,
            status: ActionStatus.PROGRESS,
            message: 'Authenticating with contract...',
          });
        }
        if (progressEvent.phase === ActionPhase.STEP_4_AUTHENTICATION_COMPLETE) {
          onEvent?.({
            step: 4,
            phase: ActionPhase.STEP_4_AUTHENTICATION_COMPLETE,
            status: ActionStatus.SUCCESS,
            message: 'WebAuthn verification complete',
          });
        }
        if (progressEvent.phase === ActionPhase.STEP_5_TRANSACTION_SIGNING_PROGRESS) {
          onEvent?.({
            step: 5,
            phase: ActionPhase.STEP_5_TRANSACTION_SIGNING_PROGRESS,
            status: ActionStatus.PROGRESS,
            message: 'Signing transaction...',
          });
        }
        if (progressEvent.phase === ActionPhase.STEP_6_TRANSACTION_SIGNING_COMPLETE) {
          onEvent?.({
            step: 6,
            phase: ActionPhase.STEP_6_TRANSACTION_SIGNING_COMPLETE,
            status: ActionStatus.SUCCESS,
            message: 'Transaction signed successfully',
          });
        }
        // Bridge worker onProgressEvents (generic) to ActionSSEEvent expected by public hooks
        onEvent(progressEvent as ActionSSEEvent);
      } : undefined,
    });

  } catch (error: any) {
    console.error('[signTransactionsWithActions] Error during execution:', error);
    const e = toError(error);
    const short = (e as { short?: string }).short || getNearShortErrorMessage(e) || e.message;
    onError?.(e);
    onEvent?.({
      step: 0,
      phase: ActionPhase.ACTION_ERROR,
      status: ActionStatus.ERROR,
      message: `Action failed: ${short}`,
      error: short
    });
    throw e;
  }
}

/**
 * 1. Input Validation - Validates inputs without fetching NEAR data
 */
async function validateInputsOnly(
  nearAccountId: AccountId,
  transactionInputs: TransactionInput[],
  options?: Omit<ActionHooksOptions, 'afterCall'>,
): Promise<void> {
  const { onEvent, onError } = options || {};

  // Basic validation
  if (!nearAccountId) {
    throw new Error('User not logged in or NEAR account ID not set for direct action.');
  }

  onEvent?.({
    step: 1,
    phase: ActionPhase.STEP_1_PREPARATION,
    status: ActionStatus.PROGRESS,
    message: 'Validating inputs...'
  });

  if (transactionInputs.length === 0) {
    throw new Error('No payloads provided for signing');
  }

  for (const transactionInput of transactionInputs) {
    if (!transactionInput.receiverId) {
      throw new Error('Missing required parameter: receiverId');
    }
    for (const action of transactionInput.actions) {
      if (action.type === ActionType.FunctionCall && (!action.methodName || action.args === undefined)) {
        throw new Error('Missing required parameters for function call: methodName or args');
      }
      if (action.type === ActionType.Transfer && !action.amount) {
        throw new Error('Missing required parameter for transfer: amount');
      }
    }
  }
}
