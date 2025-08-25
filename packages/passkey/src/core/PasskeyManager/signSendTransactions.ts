import type { FinalExecutionOutcome } from '@near-js/types';
import type { AccountId } from '../types/accountIds';
import type { ActionParams } from '../types/actions';
import { TxExecutionStatus } from '../types/actions';
import type { SignedTransaction } from '../NearClient';
import type { PasskeyManagerContext } from './index';
import { toAccountId } from '../types/accountIds';
import { getNonceBlockHashAndHeight } from './actions';

/**
 * Sign multiple transactions (with actions[]) to different receivers
 * (executeAction sends to one recevierId only).
 * This method does not broadcast the transactions to the network, use sendTransaction() to do that.
 * This method handles nonces for multiple transactions as well.
 *
 * @param context - PasskeyManager context
 * @param nearAccountId - NEAR account ID to sign transactions with
 * @param params - Transaction signing parameters
 * - @param params.transactions: Array of transaction objects with nearAccountId, receiverId, actions, and nonce
 * - @param params.onEvent: Optional progress event callback
 * @returns Promise resolving to signed transaction results
 */
export async function signTransactionsWithActions(
  context: PasskeyManagerContext,
  nearAccountId: string,
  params: {
    transactions: Array<{
      receiverId: string;
      actions: ActionParams[];
    }>;
    onEvent?: (update: any) => void;
  }
): Promise<any[]> {
  // Get current user data for VRF operations
  const userData = await context.webAuthnManager.getUser(toAccountId(nearAccountId));
  const nearPublicKeyStr = userData?.clientNearPublicKey;
  if (!nearPublicKeyStr) {
    throw new Error('Client NEAR public key not found in user data');
  }

  // Get transaction context (nonce, block hash, etc.)
  const { nearClient } = context;
  const transactionContext = await getNonceBlockHashAndHeight({
    nearClient,
    nearPublicKeyStr,
    nearAccountId: toAccountId(nearAccountId)
  });

  // Generate VRF challenge
  const vrfChallenge = await context.webAuthnManager.generateVrfChallenge({
    userId: toAccountId(nearAccountId),
    rpId: window.location.hostname,
    blockHeight: transactionContext.txBlockHeight,
    blockHash: transactionContext.txBlockHash,
  });

  // Add nonce to each transaction
  const transactionsWithNonce = params.transactions.map((tx, i) => ({
    ...tx,
    nearAccountId: toAccountId(nearAccountId),
    nonce: (BigInt(transactionContext.nextNonce) + BigInt(i)).toString(),
  }));

  console.log("transactionsWithNonce>>>", transactionsWithNonce);

  // Call the WebAuthnManager's signTransactionsWithActions with all required parameters
  return context.webAuthnManager.signTransactionsWithActions({
    transactions: transactionsWithNonce,
    blockHash: transactionContext.txBlockHash,
    contractId: context.webAuthnManager.configs.contractId,
    vrfChallenge: vrfChallenge,
    nearRpcUrl: context.webAuthnManager.configs.nearRpcUrl,
    onEvent: params.onEvent,
  });
}

/**
 * Send a signed transaction to the NEAR network
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
export async function sendTransaction(
  context: PasskeyManagerContext,
  signedTransaction: SignedTransaction,
  waitUntil: TxExecutionStatus = TxExecutionStatus.FINAL
): Promise<FinalExecutionOutcome> {
  const { nearClient } = context;
  return nearClient.sendTransaction(signedTransaction, waitUntil);
}
