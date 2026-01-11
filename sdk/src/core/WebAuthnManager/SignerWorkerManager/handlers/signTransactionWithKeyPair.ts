
import { SignedTransaction } from '../../../NearClient';
import { type ActionArgsWasm, validateActionArgsWasm } from '../../../types/actions';
import {
  WorkerRequestType,
  WorkerResponseType,
  WasmTransactionSignResult,
} from '../../../types/signer-worker';
import { SignerWorkerManagerContext } from '..';

/**
 * Sign transaction with raw private key (for key replacement in Option D device linking)
 * No TouchID/PRF required - uses provided private key directly
 */
export async function signTransactionWithKeyPair({
  ctx,
  nearPrivateKey,
  signerAccountId,
  receiverId,
  nonce,
  blockHash,
  actions
}: {
  ctx: SignerWorkerManagerContext;
  nearPrivateKey: string;
  signerAccountId: string;
  receiverId: string;
  nonce: string;
  blockHash: string;
  actions: ActionArgsWasm[];
}): Promise<{
  signedTransaction: SignedTransaction;
  logs?: string[];
}> {
  try {
    console.info('SignerWorkerManager: Starting transaction signing with provided private key');
    // Validate actions
    actions.forEach(action => {
      validateActionArgsWasm(action);
    });

    const response = await ctx.sendMessage<WorkerRequestType.SignTransactionWithKeyPair>({
      message: {
        type: WorkerRequestType.SignTransactionWithKeyPair,
        payload: {
          nearPrivateKey,
          signerAccountId,
          receiverId,
          nonce,
          blockHash: blockHash,
          actions: actions
        }
      }
    });

    if (response.type !== WorkerResponseType.SignTransactionWithKeyPairSuccess) {
      console.error('SignerWorkerManager: Transaction signing with private key failed:', response);
      throw new Error('Transaction signing with private key failed');
    }

    const wasmResult = response.payload as WasmTransactionSignResult;
    if (!wasmResult.success) {
      throw new Error(wasmResult.error || 'Transaction signing failed');
    }
    // Extract the signed transaction
    const signedTransactions = wasmResult.signedTransactions || [];
    if (signedTransactions.length !== 1) {
      throw new Error(`Expected 1 signed transaction but received ${signedTransactions.length}`);
    }
    const signedTx = signedTransactions[0];
    if (!signedTx || !signedTx.transaction || !signedTx.signature) {
      throw new Error('Incomplete signed transaction data received');
    }

    const result = {
      signedTransaction: new SignedTransaction({
        transaction: signedTx.transaction,
        signature: signedTx.signature,
        borsh_bytes: Array.from(signedTx.borshBytes || [])
      }),
      logs: wasmResult.logs
    };

    console.debug('SignerWorkerManager: Transaction signing with private key successful');
    return result;

  } catch (error: unknown) {
    console.error('SignerWorkerManager: Transaction signing with private key error:', error);
    throw error;
  }
}
