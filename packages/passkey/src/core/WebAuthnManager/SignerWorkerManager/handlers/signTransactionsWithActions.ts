
import { SignedTransaction } from '../../../NearClient';
import { TransactionInputWasm, validateActionArgsWasm } from '../../../types/actions';
import type { onProgressEvents } from '../../../types/passkeyManager';
import {
  WorkerRequestType,
  TransactionPayload,
  ConfirmationConfig,
  isSignTransactionsWithActionsSuccess,
} from '../../../types/signer-worker';
import { AccountId } from "../../../types/accountIds";
import { SignerWorkerManagerContext } from '..';
import { RpcCallPayload } from '../../../types/signer-worker';
import { toAccountId } from '../../../types/accountIds';

/**
 * Sign multiple transactions with shared VRF challenge and credential
 * Efficiently processes multiple transactions with one PRF authentication
 */
export async function signTransactionsWithActions({
  ctx,
  transactions,
  rpcCall,
  onEvent,
  confirmationConfigOverride
}: {
  ctx: SignerWorkerManagerContext,
  transactions: TransactionInputWasm[],
  rpcCall: RpcCallPayload;
  onEvent?: (update: onProgressEvents) => void;
  confirmationConfigOverride?: ConfirmationConfig;
}): Promise<Array<{
  signedTransaction: SignedTransaction;
  nearAccountId: AccountId;
  logs?: string[]
}>> {
  try {
    console.info(`WebAuthnManager: Starting batch transaction signing for ${transactions.length} transactions`);

    if (transactions.length === 0) {
      throw new Error('No transactions provided for batch signing');
    }

    // Extract nearAccountId from rpcCall
    const nearAccountId = rpcCall.nearAccountId;

    // Validate all actions in all payloads
    transactions.forEach((txPayload, txIndex) => {
      txPayload.actions.forEach((action, actionIndex) => {
        try {
          validateActionArgsWasm(action);
        } catch (error) {
          throw new Error(`Transaction ${txIndex}, Action ${actionIndex} validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      });
    });

    // Retrieve encrypted key data from IndexedDB in main thread
    console.debug('WebAuthnManager: Retrieving encrypted key from IndexedDB for account:', nearAccountId);
    const encryptedKeyData = await ctx.nearKeysDB.getEncryptedKey(nearAccountId);
    if (!encryptedKeyData) {
      throw new Error(`No encrypted key found for account: ${nearAccountId}`);
    }

    // Credentials and PRF outputs are collected during user confirmation handshake

    // Create transaction signing requests
    // NOTE: nonce and blockHash are computed in confirmation flow, not here
    const txSigningRequests: TransactionPayload[] = transactions.map(tx => ({
      nearAccountId: rpcCall.nearAccountId,
      receiverId: tx.receiverId,
      actions: JSON.stringify(tx.actions)
    }));

    // Send batch signing request to WASM worker
    const response = await ctx.sendMessage({
      message: {
        type: WorkerRequestType.SignTransactionsWithActions,
        payload: {
          rpcCall: rpcCall,
          decryption: {
            encryptedPrivateKeyData: encryptedKeyData.encryptedData,
            encryptedPrivateKeyIv: encryptedKeyData.iv
          },
          txSigningRequests: txSigningRequests,
          confirmationConfig: confirmationConfigOverride ? {
            uiMode: confirmationConfigOverride.uiMode,
            behavior: confirmationConfigOverride.behavior,
            autoProceedDelay: confirmationConfigOverride.autoProceedDelay,
          } : {
            uiMode: ctx.confirmationConfig.uiMode,
            behavior: ctx.confirmationConfig.behavior,
            autoProceedDelay: ctx.confirmationConfig.autoProceedDelay,
          }
        }
      },
      onEvent
    });

    if (!isSignTransactionsWithActionsSuccess(response)) {
      console.error('WebAuthnManager: Batch transaction signing failed:', response);
      throw new Error('Batch transaction signing failed');
    }
    if (!response.payload.success) {
      throw new Error(response.payload.error || 'Batch transaction signing failed');
    }
    // Extract arrays from the single result - wasmResult contains arrays of all transactions
    const signedTransactions = response.payload.signedTransactions || [];
    if (signedTransactions.length !== transactions.length) {
      throw new Error(`Expected ${transactions.length} signed transactions but received ${signedTransactions.length}`);
    }

    // Process results for each transaction using WASM types directly
    const results = signedTransactions.map((signedTx, index) => {
      if (!signedTx || !signedTx.transaction || !signedTx.signature) {
        throw new Error(`Incomplete signed transaction data received for transaction ${index + 1}`);
      }
      return {
        signedTransaction: new SignedTransaction({
          transaction: signedTx.transaction,
          signature: signedTx.signature,
          borsh_bytes: Array.from(signedTx.borshBytes || [])
        }),
        nearAccountId: toAccountId(nearAccountId),
        logs: response.payload.logs
      };
    });

    return results;

  } catch (error: any) {
    console.error('WebAuthnManager: Batch transaction signing error:', error);
    throw error;
  }
}
