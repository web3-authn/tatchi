import { ActionType, toActionArgsWasm } from '../types/actions';
import type {
  SendTransactionHooksOptions,
  SignTransactionHooksOptions,
  VerifyAndSignTransactionResult,
  ActionHooksOptions,
  ActionResult,
  SignAndSendTransactionHooksOptions
} from '../types/passkeyManager';
import type { ActionArgs, TransactionInput, TransactionInputWasm } from '../types/actions';
import type { ConfirmationConfig } from '../types/signer-worker';
import type { TransactionContext } from '../types/rpc';
import type { PasskeyManagerContext } from './index';
import type { NearClient, SignedTransaction } from '../NearClient';
import type { AccountId } from '../types/accountIds';
import { ActionPhase, ActionStatus } from '../types/passkeyManager';

//////////////////////////////
// === PUBLIC API ===
//////////////////////////////

/**
 * Public API for executing actions - respects user confirmation preferences
 * executeAction signs a single transaction (with actions[]) to a single receiver.
 * If you want to sign multiple transactions to different receivers,
 * use signTransactionsWithActions() instead.
 *
 * @param context - PasskeyManager context
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
  options?: ActionHooksOptions,
}): Promise<ActionResult> {
  try {
    // Public API always uses undefined override (respects user settings)
    return executeActionInternal({
      context: args.context,
      nearAccountId: args.nearAccountId,
      receiverId: args.receiverId,
      actionArgs: args.actionArgs,
      options: args.options,
      confirmationConfigOverride: undefined
    });
  } catch (error: any) {
    throw error;
  }
}

/**
 * Signs multiple transactions with actions, and broadcasts them
 *
 * @param context - PasskeyManager context
 * @param nearAccountId - NEAR account ID to sign transactions with
 * @param transactionInput - Transaction input to sign
 * @param options - Options for the action
 * @returns Promise resolving to the action result
 */
export async function signAndSendTransactions(args: {
  context: PasskeyManagerContext,
  nearAccountId: AccountId,
  transactionInputs: TransactionInput[],
  options?: SignAndSendTransactionHooksOptions,
}): Promise<ActionResult[]> {
  return signAndSendTransactionsInternal({
    context: args.context,
    nearAccountId: args.nearAccountId,
    transactionInputs: args.transactionInputs,
    options: args.options,
    confirmationConfigOverride: undefined
  });
}

/**
 * Signs transactions with actions, without broadcasting them
 *
 * @param context - PasskeyManager context
 * @param nearAccountId - NEAR account ID to sign transactions with
 * @param actionArgs - Action arguments to sign transactions with
 * @param options - Options for the action
 * @returns Promise resolving to the action result
 */
export async function signTransactionsWithActions(args: {
  context: PasskeyManagerContext,
  nearAccountId: AccountId,
  transactionInputs: TransactionInput[],
  options?: SignTransactionHooksOptions,
}): Promise<VerifyAndSignTransactionResult[]> {
  try {
    return signTransactionsWithActionsInternal({
      context: args.context,
      nearAccountId: args.nearAccountId,
      transactionInputs: args.transactionInputs,
      options: args.options,
      confirmationConfigOverride: undefined
      // Public API always uses undefined override (respects user settings)
    });
  } catch (error: any) {
    throw error;
  }
}

/**
 * 3. Transaction Broadcasting - Broadcasts the signed transaction to NEAR network
 * This method broadcasts a previously signed transaction and waits for execution
 *
 * @param context - PasskeyManager context
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
 * console.log('Transaction ID:', result.transaction_outcome?.id);
 * ```
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
    step: 8,
    phase: ActionPhase.STEP_8_BROADCASTING,
    status: ActionStatus.PROGRESS,
    message: `Broadcasting transaction...`
  });

  let transactionResult;
  let txId;
  try {
    transactionResult = await context.nearClient.sendTransaction(
      signedTransaction,
      options?.waitUntil
    );
    txId = transactionResult.transaction?.hash || transactionResult.transaction?.id;
    options?.onEvent?.({
      step: 8,
      phase: ActionPhase.STEP_8_BROADCASTING,
      status: ActionStatus.SUCCESS,
      message: `Transaction ${txId} sent successfully`
    });
    options?.onEvent?.({
      step: 9,
      phase: ActionPhase.STEP_9_ACTION_COMPLETE,
      status: ActionStatus.SUCCESS,
      message: `Transaction ${txId} completed `
    });
  } catch (error) {
    console.error('[sendTransaction] failed:', error);
    throw error;
  }

  const actionResult: ActionResult = {
    success: true,
    transactionId: txId,
    result: transactionResult
  };

  return actionResult;
}

//////////////////////////////
// === INTERNAL API ===
//////////////////////////////

/**
 * Internal API for executing actions with optional confirmation override
 * @internal - Only used by internal SDK components like SecureTxConfirmButton
 *
 * @param context - PasskeyManager context
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
  options,
  confirmationConfigOverride,
}: {
  context: PasskeyManagerContext,
  nearAccountId: AccountId,
  receiverId: AccountId,
  actionArgs: ActionArgs | ActionArgs[],
  options?: ActionHooksOptions,
  confirmationConfigOverride?: ConfirmationConfig | undefined,
}): Promise<ActionResult> {

  const { onEvent, onError, hooks, waitUntil } = options || {};
  const actions = Array.isArray(actionArgs) ? actionArgs : [actionArgs];

  try {
    await options?.hooks?.beforeCall?.();

    const signedTxs = await signTransactionsWithActionsInternal({
      context,
      nearAccountId,
      transactionInputs: [{
        receiverId: receiverId,
        actions: actions,
      }],
      options: { onEvent, onError, hooks, waitUntil },
      confirmationConfigOverride
    });

    const txResult = await sendTransaction({
      context,
      signedTransaction: signedTxs[0].signedTransaction,
      options: { onEvent, onError, hooks, waitUntil }
    });

    hooks?.afterCall?.(true, txResult);
    return txResult;

  } catch (error: any) {
    console.error('[executeAction] Error during execution:', error);
    onError?.(error);
    onEvent?.({
      step: 0,
      phase: ActionPhase.ACTION_ERROR,
      status: ActionStatus.ERROR,
      message: `Action failed: ${error.message}`,
      error: error.message
    });

    const result = { success: false, error: error.message, transactionId: undefined };
    hooks?.afterCall?.(false, result);
    return result;
  }
}

export async function signAndSendTransactionsInternal({
  context,
  nearAccountId,
  transactionInputs,
  options,
  confirmationConfigOverride,
}: {
  context: PasskeyManagerContext,
  nearAccountId: AccountId,
  transactionInputs: TransactionInput[],
  options?: SignAndSendTransactionHooksOptions,
  confirmationConfigOverride?: ConfirmationConfig | undefined,
}): Promise<ActionResult[]> {

  const signedTxs = await signTransactionsWithActionsInternal({
    context,
    nearAccountId,
    transactionInputs,
    options,
    confirmationConfigOverride
  });

  if (options?.executeSequentially) {
    const txResults = [];
    for (const tx of signedTxs) {
      const txResult = await sendTransaction({
        context,
        signedTransaction: tx.signedTransaction,
        options
      });
      txResults.push(txResult);
    }
    return txResults;

  } else {
    return Promise.all(signedTxs.map(tx => sendTransaction({
      context,
      signedTransaction: tx.signedTransaction,
      options
    })))
  }
}

/**
 * Internal API for signing transactions with actions
 * @internal - Only used by internal SDK components with confirmationConfigOverride
 *
 * @param context - PasskeyManager context
 * @param nearAccountId - NEAR account ID to sign transactions with
 * @param actionArgs - Action arguments to sign transactions with
 * @param options - Options for the action
 * @returns Promise resolving to the action result
 */
export async function signTransactionsWithActionsInternal({
  context,
  nearAccountId,
  transactionInputs,
  options,
  confirmationConfigOverride,
}: {
  context: PasskeyManagerContext,
  nearAccountId: AccountId,
  transactionInputs: TransactionInput[],
  options?: ActionHooksOptions,
  confirmationConfigOverride?: ConfirmationConfig | undefined,
}): Promise<VerifyAndSignTransactionResult[]> {

  const { onEvent, onError, hooks, waitUntil } = options || {};

  try {
    await options?.hooks?.beforeCall?.();
    // Emit started event
    onEvent?.({
      step: 1,
      phase: ActionPhase.STEP_1_PREPARATION,
      status: ActionStatus.PROGRESS,
      message: transactionInputs.length > 1
        ? `Starting batched transaction with ${transactionInputs.length} actions`
        : `Starting ${transactionInputs[0].actions[0].type} action`
    });

    // 1. Validation (use first action for account validation)
    const transactionContext = await validateTransactionInputs(
      context,
      nearAccountId,
      transactionInputs,
      { onEvent, onError, hooks, waitUntil }
    );

    // 2. VRF Authentication + Transaction Signing
    const signedTxs = await wasmAuthenticateAndSignTransactions(
      context,
      nearAccountId,
      transactionContext,
      transactionInputs,
      { onEvent, onError, hooks, waitUntil, confirmationConfigOverride }
    );

    return signedTxs;
  } catch (error: any) {
    console.error('[signTransactionsWithActions] Error during execution:', error);
    onError?.(error);
    onEvent?.({
      step: 0,
      phase: ActionPhase.ACTION_ERROR,
      status: ActionStatus.ERROR,
      message: `Action failed: ${error.message}`,
      error: error.message
    });
    throw error;
  }
}

//////////////////////////////
// === HELPER FUNCTIONS ===
//////////////////////////////

export async function getNonceBlockHashAndHeight({ nearClient, nearPublicKeyStr, nearAccountId }: {
  nearClient: NearClient,
  nearPublicKeyStr: string,
  nearAccountId: AccountId
}): Promise<TransactionContext> {
  // Get access key and transaction block info concurrently
  const [accessKeyInfo, txBlockInfo] = await Promise.all([
    nearClient.viewAccessKey(nearAccountId, nearPublicKeyStr)
      .catch(e => { throw new Error(`Failed to fetch Access Key`) }),
    nearClient.viewBlock({ finality: 'final' })
      .catch(e => { throw new Error(`Failed to fetch Block Info`) })
  ]);
  if (!accessKeyInfo || accessKeyInfo.nonce === undefined) {
    throw new Error(`Access key not found or invalid for account ${nearAccountId} with public key ${nearPublicKeyStr}. Response: ${JSON.stringify(accessKeyInfo)}`);
  }
  const nextNonce = (BigInt(accessKeyInfo.nonce) + BigInt(1)).toString();
  const txBlockHeight = String(txBlockInfo.header.height);
  const txBlockHash = txBlockInfo.header.hash; // Keep original base58 string

  return {
    nearPublicKeyStr,
    accessKeyInfo,
    nextNonce,
    txBlockHeight,
    txBlockHash,
  };
}

/**
 * 1. Validation - Validates inputs and prepares transaction context
 */
async function validateTransactionInputs(
  context: PasskeyManagerContext,
  nearAccountId: AccountId,
  transactionInputs: TransactionInput[],
  options?: ActionHooksOptions,
): Promise<TransactionContext> {

  const { onEvent, onError, hooks } = options || {};
  const { webAuthnManager, nearClient } = context;
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

  const userData = await webAuthnManager.getUser(nearAccountId);
  const nearPublicKeyStr = userData?.clientNearPublicKey;
  if (!nearPublicKeyStr) {
    throw new Error('Client NEAR public key not found in user data');
  }

  return getNonceBlockHashAndHeight({ nearClient, nearPublicKeyStr, nearAccountId });
}

/**
 * 2. VRF Authentication - Handles VRF challenge generation and WebAuthn authentication
 *  with the webauthn contract
 */
async function wasmAuthenticateAndSignTransactions(
  context: PasskeyManagerContext,
  nearAccountId: AccountId,
  transactionContext: TransactionContext,
  transactionInputs: TransactionInput[],
  options?: ActionHooksOptions & { confirmationConfigOverride?: ConfirmationConfig }
  // Per-call override for confirmation behavior (does not persist to IndexedDB)
): Promise<VerifyAndSignTransactionResult[]> {

  const { onEvent, onError, hooks, confirmationConfigOverride } = options || {};
  const { webAuthnManager } = context;

  onEvent?.({
    step: 2,
    phase: ActionPhase.STEP_2_USER_CONFIRMATION,
    status: ActionStatus.PROGRESS,
    message: 'Requesting user confirmation...'
  });

  // Check if VRF session is active by trying to generate a challenge
  // This will fail if VRF is not unlocked, providing implicit status check
  const vrfStatus = await webAuthnManager.checkVrfStatus();

  if (!vrfStatus.active || vrfStatus.nearAccountId !== nearAccountId) {
    throw new Error(`VRF session not active for ${nearAccountId}. Please login first. VRF status: ${JSON.stringify(vrfStatus)}`);
  }

  // Generate VRF challenge, Use VRF output as WebAuthn challenge
  const vrfChallenge = await webAuthnManager.generateVrfChallenge({
    userId: nearAccountId,
    rpId: window.location.hostname,
    blockHeight: transactionContext.txBlockHeight,
    blockHash: transactionContext.txBlockHash, // Use original base58 string, not decoded bytes
  });

  onEvent?.({
    step: 3,
    phase: ActionPhase.STEP_3_CONTRACT_VERIFICATION,
    status: ActionStatus.PROGRESS,
    message: 'Verifying contract...'
  });

  // Convert all actions to ActionArgsWasm format for batched transaction
  const transactionInputsWasm: TransactionInputWasm[] = transactionInputs.map((tx, i) => {
    return {
      receiverId: tx.receiverId,
      actions: tx.actions.map(action => toActionArgsWasm(action)),
      nonce: (BigInt(transactionContext.nextNonce) + BigInt(i)).toString(),
    }
  });

  // Use the unified action-based WASM worker transaction signing
  const signedTxs = await webAuthnManager.signTransactionsWithActions({
    nearAccountId: nearAccountId,
    transactions: transactionInputsWasm,
    // Common parameters
    blockHash: transactionContext.txBlockHash,
    contractId: webAuthnManager.configs.contractId,
    vrfChallenge: vrfChallenge,
    nearRpcUrl: webAuthnManager.configs.nearRpcUrl,
    confirmationConfigOverride: confirmationConfigOverride,
    // Pass through the onEvent callback for progress updates
    onEvent: onEvent ? (progressEvent) => {
      if (progressEvent.phase === ActionPhase.STEP_4_WEBAUTHN_AUTHENTICATION) {
        onEvent?.({
          step: 4,
          phase: ActionPhase.STEP_4_WEBAUTHN_AUTHENTICATION,
          status: ActionStatus.PROGRESS,
          message: 'Authenticating with WebAuthn contract...',
        });
      }
      if (progressEvent.phase === ActionPhase.STEP_5_AUTHENTICATION_COMPLETE) {
        onEvent?.({
          step: 5,
          phase: ActionPhase.STEP_5_AUTHENTICATION_COMPLETE,
          status: ActionStatus.SUCCESS,
          message: 'WebAuthn verification complete',
        });
      }
      if (progressEvent.phase === ActionPhase.STEP_6_TRANSACTION_SIGNING_PROGRESS) {
        onEvent?.({
          step: 6,
          phase: ActionPhase.STEP_6_TRANSACTION_SIGNING_PROGRESS,
          status: ActionStatus.PROGRESS,
          message: 'Signing transaction...',
        });
      }
      if (progressEvent.phase === ActionPhase.STEP_7_TRANSACTION_SIGNING_COMPLETE) {
        onEvent?.({
          step: 7,
          phase: ActionPhase.STEP_7_TRANSACTION_SIGNING_COMPLETE,
          status: ActionStatus.SUCCESS,
          message: 'Transaction signed successfully',
        });
      }
      onEvent({ ...progressEvent } as any);
    } : undefined,
  });

  return signedTxs;
}


