
import { SignedTransaction } from '../../../NearClient';
import { TransactionInputWasm, validateActionArgsWasm } from '../../../types/actions';
import { type onProgressEvents } from '../../../types/sdkSentEvents';
import type { ConfirmationConfig } from '../../../types/signer-worker';
import {
  WorkerRequestType,
  TransactionPayload,
  isSignTransactionsWithActionsSuccess,
} from '../../../types/signer-worker';
import { AccountId } from "../../../types/accountIds";
import { SignerWorkerManagerContext } from '..';
import { RpcCallPayload } from '../../../types/signer-worker';
import { PASSKEY_MANAGER_DEFAULT_CONFIGS } from '../../../defaultConfigs';
import { toAccountId } from '../../../types/accountIds';
import { getLastLoggedInDeviceNumber } from '../getDeviceNumber';
import { isObject } from '../../../WalletIframe/validation';
import { withSessionId } from './session';
import { generateSessionId } from '../sessionHandshake.js';
import { toEncryptedPrivateKeyCiphertext } from './encryptedPrivateKey';

/**
 * Sign multiple transactions with shared VRF challenge and credential
 * Efficiently processes multiple transactions with one PRF authentication
 */
export async function signTransactionsWithActions({
  ctx,
  transactions,
  rpcCall,
  onEvent,
  confirmationConfigOverride,
  sessionId: providedSessionId,
}: {
  ctx: SignerWorkerManagerContext,
  transactions: TransactionInputWasm[],
  rpcCall: RpcCallPayload;
  onEvent?: (update: onProgressEvents) => void;
  // Allow callers to pass a partial override (e.g., { uiMode: 'drawer' })
  confirmationConfigOverride?: Partial<ConfirmationConfig>;
  sessionId?: string;
}): Promise<Array<{
  signedTransaction: SignedTransaction;
  nearAccountId: AccountId;
  logs?: string[]
}>> {
  try {
    if (transactions.length === 0) {
      throw new Error('No transactions provided for batch signing');
    }

    const sessionId = providedSessionId ?? generateSessionId();
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
    const deviceNumber = await getLastLoggedInDeviceNumber(nearAccountId, ctx.indexedDB.clientDB);
    const encryptedKeyData = await ctx.indexedDB.nearKeysDB.getEncryptedKey(nearAccountId, deviceNumber);

    if (!encryptedKeyData) {
      throw new Error(`No encrypted key found for account: ${nearAccountId}`);
    }

    // Normalize rpcCall to ensure required fields are present
    const resolvedRpcCall = {
      contractId: rpcCall.contractId || PASSKEY_MANAGER_DEFAULT_CONFIGS.contractId,
      nearRpcUrl: rpcCall.nearRpcUrl || (PASSKEY_MANAGER_DEFAULT_CONFIGS.nearRpcUrl.split(',')[0] || PASSKEY_MANAGER_DEFAULT_CONFIGS.nearRpcUrl),
      nearAccountId: rpcCall.nearAccountId,
    } as RpcCallPayload;

    // Confirm via VRF-driven flow before sending anything to the signer worker.
    // WrapKeySeed derivation is handled inside confirmTxFlow (handleTransactionSigningFlow),
    // which uses the same sessionId/requestId and delivers WrapKeySeed over the reserved port.
    if (!ctx.vrfWorkerManager) {
      throw new Error('VrfWorkerManager not available for signing');
    }
    const confirmation = await ctx.vrfWorkerManager.confirmAndPrepareSigningSession({
      ctx,
      sessionId,
      kind: 'transaction',
      txSigningRequests: transactions,
      rpcCall: resolvedRpcCall,
      confirmationConfigOverride,
    });

    const intentDigest = confirmation.intentDigest;
    const transactionContext = confirmation.transactionContext;
    const credential = confirmation.credential ? JSON.stringify(confirmation.credential) : undefined;

    // Create transaction signing requests
    // NOTE: nonce and blockHash are computed in confirmation flow, not here
    const txSigningRequests: TransactionPayload[] = transactions.map(tx => ({
      nearAccountId: rpcCall.nearAccountId,
      receiverId: tx.receiverId,
      actions: tx.actions
    }));

    // Send batch signing request to WASM worker
    const response = await ctx.sendMessage({
      message: {
        type: WorkerRequestType.SignTransactionsWithActions,
        payload: withSessionId(sessionId, {
          rpcCall: resolvedRpcCall,
          createdAt: Date.now(),
          decryption: toEncryptedPrivateKeyCiphertext(encryptedKeyData),
          txSigningRequests: txSigningRequests,
          intentDigest,
          transactionContext,
          credential,
        })
      },
      onEvent,
      sessionId,
    });

    if (!isSignTransactionsWithActionsSuccess(response)) {
      console.error('WebAuthnManager: Batch transaction signing failed:', response);
      const payloadError = isObject(response?.payload) && (response as any)?.payload?.error;
      throw new Error(payloadError || 'Batch transaction signing failed');
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

  } catch (error: unknown) {
    console.error('WebAuthnManager: Batch transaction signing error:', error);
    throw error;
  }
}
