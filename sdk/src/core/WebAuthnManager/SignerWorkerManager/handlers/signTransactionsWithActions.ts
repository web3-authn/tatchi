
import { SignedTransaction } from '../../../NearClient';
import { TransactionInputWasm, validateActionArgsWasm } from '../../../types/actions';
import { type onProgressEvents } from '../../../types/sdkSentEvents';
import type { ConfirmationConfig } from '../../../types/signer-worker';
import {
  WorkerRequestType,
  TransactionPayload,
  isSignTransactionsWithActionsSuccess,
  type SignerMode,
} from '../../../types/signer-worker';
import { AccountId } from "../../../types/accountIds";
import { SignerWorkerManagerContext } from '..';
import { RpcCallPayload } from '../../../types/signer-worker';
import { PASSKEY_MANAGER_DEFAULT_CONFIGS } from '../../../defaultConfigs';
import { toAccountId } from '../../../types/accountIds';
import { getLastLoggedInDeviceNumber } from '../getDeviceNumber';
import { isObject } from '../../../WalletIframe/validation';
import { generateSessionId } from '../sessionHandshake.js';
import { WebAuthnAuthenticationCredential } from '../../../types';
import { resolveSignerModeForThresholdSigning } from '../../../threshold/thresholdEd25519RelayerHealth';

/**
 * Sign multiple transactions with shared VRF challenge and credential
 * Efficiently processes multiple transactions with one PRF authentication
 */
export async function signTransactionsWithActions({
  ctx,
  transactions,
  rpcCall,
  signerMode,
  relayerUrl: providedRelayerUrl,
  onEvent,
  confirmationConfigOverride,
  title,
  body,
  sessionId: providedSessionId,
}: {
  ctx: SignerWorkerManagerContext,
  transactions: TransactionInputWasm[],
  rpcCall: RpcCallPayload;
  signerMode: SignerMode;
  relayerUrl?: string;
  onEvent?: (update: onProgressEvents) => void;
  // Allow callers to pass a partial override (e.g., { uiMode: 'drawer' })
  confirmationConfigOverride?: Partial<ConfirmationConfig>;
  title?: string;
  body?: string;
  sessionId?: string;
}): Promise<Array<{
  signedTransaction: SignedTransaction;
  nearAccountId: AccountId;
  logs?: string[]
}>> {
  try {
    const sessionId = providedSessionId ?? generateSessionId();
    const nearAccountId = rpcCall.nearAccountId;

    transactions.forEach(txPayload => {
      txPayload.actions.forEach(action => {
        validateActionArgsWasm(action);
      });
    });

    // Retrieve encrypted key data from IndexedDB in main thread
    console.debug('WebAuthnManager: Retrieving encrypted key from IndexedDB for account:', nearAccountId);
    const deviceNumber = await getLastLoggedInDeviceNumber(nearAccountId, ctx.indexedDB.clientDB);
    const [localKeyMaterial, thresholdKeyMaterial] = await Promise.all([
      ctx.indexedDB.nearKeysDB.getLocalKeyMaterial(nearAccountId, deviceNumber),
      ctx.indexedDB.nearKeysDB.getThresholdKeyMaterial(nearAccountId, deviceNumber),
    ]);
	    if (!localKeyMaterial) {
	      throw new Error(`No local key material found for account: ${nearAccountId}`);
	    }

	    const warnings: string[] = [];
    const relayerUrl = String(providedRelayerUrl || '').trim();
    const resolvedSignerMode = await resolveSignerModeForThresholdSigning({
      nearAccountId,
      signerMode,
      relayerUrl,
      hasThresholdKeyMaterial: !!thresholdKeyMaterial,
      warnings,
    });

    // Ensure nonce/block context is fetched for the same access key that will sign.
    // Threshold signing MUST use the threshold/group public key (relayer access key) for:
    // - correct nonce reservation
    // - relayer scope checks (/authorize expects signingPayload.transactionContext.nearPublicKeyStr == relayer key)
    const signingNearPublicKeyStr = resolvedSignerMode === 'threshold-signer'
      ? thresholdKeyMaterial?.publicKey
      : localKeyMaterial.publicKey;
    if (!signingNearPublicKeyStr) {
      throw new Error(`Missing signing public key for signerMode=${resolvedSignerMode}`);
    }
    ctx.nonceManager.initializeUser(toAccountId(nearAccountId), signingNearPublicKeyStr);

    // Normalize rpcCall to ensure required fields are present
    const resolvedRpcCall = {
      contractId: rpcCall.contractId || PASSKEY_MANAGER_DEFAULT_CONFIGS.contractId,
      nearRpcUrl: rpcCall.nearRpcUrl || PASSKEY_MANAGER_DEFAULT_CONFIGS.nearRpcUrl,
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
      title,
      body,
    });

    const intentDigest = confirmation.intentDigest;
    const transactionContext = confirmation.transactionContext;
    // Never forward PRF outputs to the relayer; strip extension results.
    const credential = confirmation.credential
      ? JSON.stringify({
        ...(confirmation.credential),
        authenticatorAttachment: confirmation.credential.authenticatorAttachment ?? null,
        response: {
          ...(confirmation.credential.response || {}),
          userHandle: (confirmation.credential as WebAuthnAuthenticationCredential)?.response?.userHandle ?? null,
        },
        clientExtensionResults: null,
      })
      : undefined;
    const vrfChallenge = confirmation.vrfChallenge;

    // Threshold signer: authorize with relayer and pass threshold config into the signer worker.
    if (resolvedSignerMode === 'threshold-signer') {
      if (!thresholdKeyMaterial) throw new Error(`Missing threshold key material for ${nearAccountId}`);
      if (!relayerUrl) {
        throw new Error('Missing configs.relayer.url (required for threshold-signer)');
      }
      if (!confirmation.credential || !vrfChallenge) {
        throw new Error('Missing WebAuthn credential or VRF challenge for threshold-signer authorization');
      }

      // Create transaction signing requests
      const txSigningRequests: TransactionPayload[] = transactions.map(tx => ({
        nearAccountId: rpcCall.nearAccountId,
        receiverId: tx.receiverId,
        actions: tx.actions
      }));

      const response = await ctx.sendMessage({
        sessionId,
        message: {
          type: WorkerRequestType.SignTransactionsWithActions,
          payload: {
            signerMode: resolvedSignerMode,
            rpcCall: resolvedRpcCall,
            createdAt: Date.now(),
            decryption: {
              encryptedPrivateKeyData: '',
              encryptedPrivateKeyChacha20NonceB64u: '',
            },
            threshold: {
              relayerUrl,
              relayerKeyId: thresholdKeyMaterial.relayerKeyId,
            },
            txSigningRequests: txSigningRequests,
            intentDigest,
            transactionContext,
            vrfChallenge,
            credential,
          }
        },
        onEvent,
      });

      if (!isSignTransactionsWithActionsSuccess(response)) {
        console.error('WebAuthnManager: Batch transaction signing failed:', response);
        const payloadError = isObject(response?.payload) && (response as any)?.payload?.error;
        throw new Error(payloadError || 'Batch transaction signing failed');
      }
      if (!response.payload.success) {
        throw new Error(response.payload.error || 'Batch transaction signing failed');
      }

      const signedTransactions = response.payload.signedTransactions || [];
      if (signedTransactions.length !== transactions.length) {
        throw new Error(`Expected ${transactions.length} signed transactions but received ${signedTransactions.length}`);
      }

      return signedTransactions.map((signedTx, index) => {
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
          logs: [...(response.payload.logs || []), ...warnings]
        };
      });
    }

    // Create transaction signing requests
    // NOTE: nonce and blockHash are computed in confirmation flow, not here
    const txSigningRequests: TransactionPayload[] = transactions.map(tx => ({
      nearAccountId: rpcCall.nearAccountId,
      receiverId: tx.receiverId,
      actions: tx.actions
    }));

    // Send batch signing request to WASM worker
    const response = await ctx.sendMessage({
      sessionId,
      message: {
        type: WorkerRequestType.SignTransactionsWithActions,
        payload: {
          signerMode: resolvedSignerMode,
          rpcCall: resolvedRpcCall,
          createdAt: Date.now(),
          decryption: {
            encryptedPrivateKeyData: localKeyMaterial.encryptedSk,
            encryptedPrivateKeyChacha20NonceB64u: localKeyMaterial.chacha20NonceB64u,
          },
          txSigningRequests: txSigningRequests,
          intentDigest,
          transactionContext,
          credential,
        }
      },
      onEvent,
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
        logs: [...(response.payload.logs || []), ...warnings]
      };
    });

    return results;

  } catch (error: unknown) {
    console.error('WebAuthnManager: Batch transaction signing error:', error);
    throw error;
  }
}
