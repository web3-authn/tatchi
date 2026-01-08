
import { SignedTransaction } from '../../../NearClient';
import { TransactionInputWasm, validateActionArgsWasm } from '../../../types/actions';
import { type onProgressEvents } from '../../../types/sdkSentEvents';
import {
  WorkerRequestType,
  TransactionPayload,
  isSignTransactionsWithActionsSuccess,
  isWorkerError,
  type ConfirmationConfig,
  type RpcCallPayload,
  type SignerMode,
  type WorkerSuccessResponse,
  getThresholdBehaviorFromSignerMode,
} from '../../../types/signer-worker';
import { AccountId } from '../../../types/accountIds';
import { SignerWorkerManagerContext } from '..';
import { PASSKEY_MANAGER_DEFAULT_CONFIGS } from '../../../defaultConfigs';
import { toAccountId } from '../../../types/accountIds';
import { getLastLoggedInDeviceNumber } from '../getDeviceNumber';
import { generateSessionId } from '../sessionHandshake.js';
import { WebAuthnAuthenticationCredential } from '../../../types';
import { removePrfOutputGuard } from '../../credentialsHelpers';
import { resolveSignerModeForThresholdSigning } from '../../../threshold/thresholdEd25519RelayerHealth';
import type { TransactionContext } from '../../../types/rpc';
import type { VRFChallenge } from '../../../types/vrf-worker';
import type {
  LocalNearSkV3Material,
  ThresholdEd25519_2p_V1Material,
} from '../../../IndexedDBManager/passkeyNearKeysDB';
import {
  clearCachedThresholdEd25519AuthSession,
  getCachedThresholdEd25519AuthSessionJwt,
  makeThresholdEd25519AuthSessionCacheKey,
} from '../../../threshold/thresholdEd25519AuthSession';
import {
  isThresholdSessionAuthUnavailableError,
  isThresholdSignerMissingKeyError,
} from '../../../threshold/thresholdSessionPolicy';
import { normalizeThresholdEd25519ParticipantIds } from '../../../../threshold/participants';

/**
 * Sign multiple transactions with shared VRF challenge and credential
 * Efficiently processes multiple transactions with one PRF authentication
 */
export async function signTransactionsWithActions({
  ctx,
  sessionId: providedSessionId,
  transactions,
  rpcCall,
  signerMode,
  onEvent,
  confirmationConfigOverride,
  title,
  body,
}: {
  ctx: SignerWorkerManagerContext,
  sessionId?: string;
  transactions: TransactionInputWasm[],
  rpcCall: RpcCallPayload;
  signerMode: SignerMode;
  onEvent?: (update: onProgressEvents) => void;
  // Allow callers to pass a partial override (e.g., { uiMode: 'drawer' })
  confirmationConfigOverride?: Partial<ConfirmationConfig>;
  title?: string;
  body?: string;
}): Promise<Array<{
  signedTransaction: SignedTransaction;
  nearAccountId: AccountId;
  logs?: string[]
}>> {

  const sessionId = providedSessionId ?? generateSessionId();
  const nearAccountId = rpcCall.nearAccountId;
  const relayerUrl = ctx.relayerUrl;

  transactions.forEach(txPayload => {
    txPayload.actions.forEach(action => {
      validateActionArgsWasm(action);
    })
  })

  const deviceNumber = await getLastLoggedInDeviceNumber(nearAccountId, ctx.indexedDB.clientDB);

  // Retrieve encrypted key data from IndexedDB in main thread
  const [localKeyMaterial, thresholdKeyMaterial] = await Promise.all([
    ctx.indexedDB.nearKeysDB.getLocalKeyMaterial(nearAccountId, deviceNumber),
    ctx.indexedDB.nearKeysDB.getThresholdKeyMaterial(nearAccountId, deviceNumber),
  ]);
  if (!localKeyMaterial) {
    throw new Error(`No local key material found for account: ${nearAccountId}`);
  }

	  const warnings: string[] = [];
	  const thresholdBehavior = getThresholdBehaviorFromSignerMode(signerMode);
	  const resolvedSignerMode = await resolveSignerModeForThresholdSigning({
	    nearAccountId,
	    signerMode,
	    relayerUrl,
	    hasThresholdKeyMaterial: !!thresholdKeyMaterial,
    warnings,
  });
  console.debug('[signTransactionsWithActions] resolvedSignerMode', { nearAccountId, resolvedSignerMode, warnings });

  const signingContext = validateAndPrepareSigningContext({
    nearAccountId,
    resolvedSignerMode,
    relayerUrl,
    rpId: ctx.touchIdPrompt.getRpId(),
    localKeyMaterial,
    thresholdKeyMaterial,
  });

  // Ensure nonce/block context is fetched for the same access key that will sign.
  // Threshold signing MUST use the threshold/group public key (relayer access key) for:
  // - correct nonce reservation
  // - relayer scope checks (/authorize expects signingPayload.transactionContext.nearPublicKeyStr == relayer key)
  ctx.nonceManager.initializeUser(toAccountId(nearAccountId), signingContext.signingNearPublicKeyStr);

  // Normalize rpcCall to ensure required fields are present.
  const resolvedRpcCall = {
    contractId: rpcCall.contractId || PASSKEY_MANAGER_DEFAULT_CONFIGS.contractId,
    nearRpcUrl: rpcCall.nearRpcUrl || PASSKEY_MANAGER_DEFAULT_CONFIGS.nearRpcUrl,
    nearAccountId: rpcCall.nearAccountId,
  } as RpcCallPayload;

  // Create transaction signing requests (shared by local + threshold signing).
  // NOTE: nonce and blockHash are computed in confirmation flow, not here.
  const txSigningRequests: TransactionPayload[] = transactions.map(tx => ({
    nearAccountId: rpcCall.nearAccountId,
    receiverId: tx.receiverId,
    actions: tx.actions,
  }));

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
    ...(signingContext.threshold && !signingContext.threshold.thresholdSessionJwt ? { signingAuthMode: 'webauthn' } : {}),
    txSigningRequests: transactions,
    rpcCall: resolvedRpcCall,
    confirmationConfigOverride,
    title,
    body,
  });

	  let { intentDigest, transactionContext, vrfChallenge, credential } =
	    extractSigningEvidenceFromConfirmation(confirmation);

	  // Threshold signer: authorize with relayer and pass threshold config into the signer worker.
	  if (signingContext.threshold) {
	    const requestPayload = {
	      signerMode: signingContext.resolvedSignerMode,
	      rpcCall: resolvedRpcCall,
	      createdAt: Date.now(),
	      decryption: {
        encryptedPrivateKeyData: '',
        encryptedPrivateKeyChacha20NonceB64u: '',
      },
      threshold: {
        relayerUrl: signingContext.threshold.relayerUrl,
        relayerKeyId: signingContext.threshold.thresholdKeyMaterial.relayerKeyId,
        clientParticipantId: signingContext.threshold.thresholdKeyMaterial.participants.find((p) => p.role === 'client')?.id,
        relayerParticipantId: signingContext.threshold.thresholdKeyMaterial.participants.find((p) => p.role === 'relayer')?.id,
        participantIds: signingContext.threshold.thresholdKeyMaterial.participants.map((p) => p.id),
        thresholdSessionKind: 'jwt' as const,
        thresholdSessionJwt: signingContext.threshold.thresholdSessionJwt,
      },
      txSigningRequests,
      intentDigest,
      transactionContext,
	      vrfChallenge,
	      credential,
	    };

	    for (let attempt = 0; attempt < 2; attempt++) {
	      try {
	        const response = await ctx.sendMessage<typeof WorkerRequestType.SignTransactionsWithActions>({
	          sessionId,
	          message: { type: WorkerRequestType.SignTransactionsWithActions, payload: requestPayload },
	          onEvent,
	        });
	        const okResponse = requireOkSignTransactionsWithActionsResponse(response);
	        return toSignedTransactionResults({
	          okResponse,
	          expectedTransactionCount: transactions.length,
	          nearAccountId,
	          warnings,
	        });
	      } catch (e: unknown) {
	        const err = e instanceof Error ? e : new Error(String(e));

	        if (thresholdBehavior === 'fallback' && isThresholdSignerMissingKeyError(err)) {
	          const msg =
	            '[WebAuthnManager] threshold-signer requested but the relayer is missing the signing share; falling back to local-signer';
	          // eslint-disable-next-line no-console
	          console.warn(msg);
	          warnings.push(msg);

	          try {
	            clearCachedThresholdEd25519AuthSession(signingContext.threshold.thresholdSessionCacheKey);
	          } catch {}
	          signingContext.threshold.thresholdSessionJwt = undefined;
	          requestPayload.threshold.thresholdSessionJwt = undefined;

	          ctx.nonceManager.initializeUser(toAccountId(nearAccountId), localKeyMaterial.publicKey);
	          if (!credential || !vrfChallenge) {
	            const refreshed = await ctx.vrfWorkerManager.confirmAndPrepareSigningSession({
	              ctx,
	              sessionId,
	              kind: 'transaction',
	              signingAuthMode: 'webauthn',
	              txSigningRequests: transactions,
	              rpcCall: resolvedRpcCall,
	              confirmationConfigOverride,
	              title,
	              body,
	            });
	            ({ intentDigest, transactionContext, vrfChallenge, credential } =
	              extractSigningEvidenceFromConfirmation(refreshed));
	          } else {
	            transactionContext = await ctx.nonceManager.getNonceBlockHashAndHeight(ctx.nearClient, { force: true });
	          }

	          return await signTransactionsWithActionsLocally({
	            ctx,
	            sessionId,
	            onEvent,
	            resolvedRpcCall,
	            localKeyMaterial,
	            txSigningRequests,
	            intentDigest,
	            transactionContext,
	            credential,
	            expectedTransactionCount: transactions.length,
	            warnings,
	          });
	        }

	        if (attempt === 0 && isThresholdSessionAuthUnavailableError(err)) {
	          clearCachedThresholdEd25519AuthSession(signingContext.threshold.thresholdSessionCacheKey);
	          signingContext.threshold.thresholdSessionJwt = undefined;
	          requestPayload.threshold.thresholdSessionJwt = undefined;

	          if (!credential || !vrfChallenge) {
	            const refreshed = await ctx.vrfWorkerManager.confirmAndPrepareSigningSession({
	              ctx,
	              sessionId,
	              kind: 'transaction',
	              signingAuthMode: 'webauthn',
	              txSigningRequests: transactions,
	              rpcCall: resolvedRpcCall,
	              confirmationConfigOverride,
	              title,
	              body,
	            });

	            ({ intentDigest, transactionContext, vrfChallenge, credential } =
	              extractSigningEvidenceFromConfirmation(refreshed));

	            requestPayload.intentDigest = intentDigest;
	            requestPayload.transactionContext = transactionContext;
	            requestPayload.vrfChallenge = vrfChallenge;
	            requestPayload.credential = credential;
	          }

	          continue;
	        }

	        throw err;
	      }
	    }
	  }

	  return await signTransactionsWithActionsLocally({
	    ctx,
	    sessionId,
	    onEvent,
	    resolvedRpcCall,
	    localKeyMaterial,
	    txSigningRequests,
	    intentDigest,
	    transactionContext,
	    credential,
	    expectedTransactionCount: transactions.length,
	    warnings,
	  });

	}

async function signTransactionsWithActionsLocally(args: {
  ctx: SignerWorkerManagerContext;
  sessionId: string;
  onEvent?: (update: onProgressEvents) => void;
  resolvedRpcCall: RpcCallPayload;
  localKeyMaterial: LocalNearSkV3Material;
  txSigningRequests: TransactionPayload[];
  intentDigest: string;
  transactionContext: TransactionContext;
  credential: string | undefined;
  expectedTransactionCount: number;
  warnings: string[];
}): Promise<Array<{
  signedTransaction: SignedTransaction;
  nearAccountId: AccountId;
  logs?: string[];
}>> {
  const response = await args.ctx.sendMessage<WorkerRequestType.SignTransactionsWithActions>({
    sessionId: args.sessionId,
    message: {
      type: WorkerRequestType.SignTransactionsWithActions,
      payload: {
        signerMode: 'local-signer',
        rpcCall: args.resolvedRpcCall,
        createdAt: Date.now(),
        decryption: {
          encryptedPrivateKeyData: args.localKeyMaterial.encryptedSk,
          encryptedPrivateKeyChacha20NonceB64u: args.localKeyMaterial.chacha20NonceB64u,
        },
        txSigningRequests: args.txSigningRequests,
        intentDigest: args.intentDigest,
        transactionContext: args.transactionContext,
        credential: args.credential,
      },
    },
    onEvent: args.onEvent,
  });

  const okResponse = requireOkSignTransactionsWithActionsResponse(response);
  return toSignedTransactionResults({
    okResponse,
    expectedTransactionCount: args.expectedTransactionCount,
    nearAccountId: args.resolvedRpcCall.nearAccountId,
    warnings: args.warnings,
  });
}

function toSignedTransactionResults(args: {
  okResponse: WorkerSuccessResponse<typeof WorkerRequestType.SignTransactionsWithActions>;
  expectedTransactionCount: number;
  nearAccountId: string;
  warnings: string[];
}): Array<{
  signedTransaction: SignedTransaction;
  nearAccountId: AccountId;
  logs?: string[];
}> {
  const signedTransactions = args.okResponse.payload.signedTransactions || [];
  if (signedTransactions.length !== args.expectedTransactionCount) {
    throw new Error(
      `Expected ${args.expectedTransactionCount} signed transactions but received ${signedTransactions.length}`
    );
  }

  return signedTransactions.map((signedTx, index) => {
    if (!signedTx || !signedTx.transaction || !signedTx.signature) {
      throw new Error(`Incomplete signed transaction data received for transaction ${index + 1}`);
    }
    return {
      signedTransaction: new SignedTransaction({
        transaction: signedTx.transaction,
        signature: signedTx.signature,
        borsh_bytes: Array.from(signedTx.borshBytes || []),
      }),
      nearAccountId: toAccountId(args.nearAccountId),
      logs: [...(args.okResponse.payload.logs || []), ...args.warnings],
    };
  });
}

type ThresholdSigningContext = {
  resolvedSignerMode: 'threshold-signer';
  signingNearPublicKeyStr: string;
  threshold: {
    relayerUrl: string;
    thresholdKeyMaterial: ThresholdEd25519_2p_V1Material;
    thresholdSessionCacheKey: string;
    thresholdSessionJwt: string | undefined;
  };
};

type LocalSigningContext = {
  resolvedSignerMode: 'local-signer';
  signingNearPublicKeyStr: string;
  threshold: null;
};

type SigningContext = ThresholdSigningContext | LocalSigningContext;

function validateAndPrepareSigningContext(args: {
  nearAccountId: string;
  resolvedSignerMode: SignerMode['mode'];
  relayerUrl: string;
  rpId: string | null;
  localKeyMaterial: LocalNearSkV3Material;
  thresholdKeyMaterial: ThresholdEd25519_2p_V1Material | null;
}): SigningContext {
  const localPublicKey = String(args.localKeyMaterial.publicKey || '').trim();
  if (!localPublicKey) {
    throw new Error(`Missing local signing public key for ${args.nearAccountId}`);
  }

  if (args.resolvedSignerMode !== 'threshold-signer') {
    return { resolvedSignerMode: 'local-signer', signingNearPublicKeyStr: localPublicKey, threshold: null };
  }

  const thresholdKeyMaterial = args.thresholdKeyMaterial;
  if (!thresholdKeyMaterial) {
    throw new Error(`Missing threshold key material for ${args.nearAccountId}`);
  }

  const thresholdPublicKey = String(thresholdKeyMaterial.publicKey || '').trim();
  if (!thresholdPublicKey) {
    throw new Error(`Missing threshold signing public key for ${args.nearAccountId}`);
  }

  const relayerUrl = String(args.relayerUrl || '').trim();
  if (!relayerUrl) {
    throw new Error('Missing relayerUrl (required for threshold-signer)');
  }

  const rpId = String(args.rpId || '').trim();
  if (!rpId) {
    throw new Error('Missing rpId for threshold signing');
  }

  const participantIds = normalizeThresholdEd25519ParticipantIds(thresholdKeyMaterial.participants.map((p) => p.id));
  if (!participantIds || participantIds.length !== 2) {
    throw new Error(
      `multi-party threshold signing is not supported yet (expected 2 participants, got [${(participantIds || []).join(',')}])`
    );
  }

  const thresholdSessionCacheKey = makeThresholdEd25519AuthSessionCacheKey({
    nearAccountId: args.nearAccountId,
    rpId,
    relayerUrl,
    relayerKeyId: thresholdKeyMaterial.relayerKeyId,
    participantIds,
  });

  return {
    resolvedSignerMode: 'threshold-signer',
    signingNearPublicKeyStr: thresholdPublicKey,
    threshold: {
      relayerUrl,
      thresholdKeyMaterial,
      thresholdSessionCacheKey,
      thresholdSessionJwt: getCachedThresholdEd25519AuthSessionJwt(thresholdSessionCacheKey),
    },
  };
}

function extractSigningEvidenceFromConfirmation(confirmation: {
  intentDigest: string;
  transactionContext: TransactionContext;
  vrfChallenge?: VRFChallenge;
  credential?: unknown;
}): {
  intentDigest: string;
  transactionContext: TransactionContext;
  vrfChallenge: VRFChallenge | undefined;
  credential: string | undefined;
} {
  const credentialForRelay: WebAuthnAuthenticationCredential | undefined = confirmation.credential
    ? removePrfOutputGuard(confirmation.credential as WebAuthnAuthenticationCredential)
    : undefined;

  return {
    intentDigest: confirmation.intentDigest,
    transactionContext: confirmation.transactionContext,
    vrfChallenge: confirmation.vrfChallenge,
    credential: credentialForRelay ? JSON.stringify(credentialForRelay) : undefined,
  };
}

function requireOkSignTransactionsWithActionsResponse(
  response: unknown
): WorkerSuccessResponse<typeof WorkerRequestType.SignTransactionsWithActions> {
  if (!isSignTransactionsWithActionsSuccess(response as any)) {
    if (isWorkerError(response as any)) {
      throw new Error((response as any).payload?.error || 'Batch transaction signing failed');
    }
    throw new Error('Batch transaction signing failed');
  }

  const resp = response as WorkerSuccessResponse<typeof WorkerRequestType.SignTransactionsWithActions>;
  if (!resp.payload.success) {
    throw new Error(resp.payload.error || 'Batch transaction signing failed');
  }
  return resp;
}
