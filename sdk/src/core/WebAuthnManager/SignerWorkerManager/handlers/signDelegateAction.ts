import { PASSKEY_MANAGER_DEFAULT_CONFIGS } from '../../../defaultConfigs';
import { AccountId, toAccountId } from '../../../types/accountIds';
import { toActionArgsWasm, validateActionArgsWasm } from '../../../types/actions';
import { DelegateActionInput } from '../../../types/delegate';
import { type onProgressEvents } from '../../../types/sdkSentEvents';
import {
  ConfirmationConfig,
  RpcCallPayload,
  type SignerMode,
  WorkerRequestType,
  isWorkerError,
  isSignDelegateActionSuccess,
  type WorkerSuccessResponse,
  WasmSignedDelegate,
} from '../../../types/signer-worker';
import type { WebAuthnAuthenticationCredential } from '../../../types';
import { removePrfOutputGuard } from '../../credentialsHelpers';
import { resolveSignerModeForThresholdSigning } from '../../../threshold/thresholdEd25519RelayerHealth';
import type {
  LocalNearSkV3Material,
  ThresholdEd25519_2p_V1Material,
} from '../../../IndexedDBManager/passkeyNearKeysDB';
import type { TransactionContext } from '../../../types/rpc';
import type { VRFChallenge } from '../../../types/vrf-worker';
import {
  clearCachedThresholdEd25519AuthSession,
  getCachedThresholdEd25519AuthSessionJwt,
  makeThresholdEd25519AuthSessionCacheKey,
} from '../../../threshold/thresholdEd25519AuthSession';
import { isThresholdSessionAuthUnavailableError } from '../../../threshold/thresholdSessionPolicy';
import { normalizeThresholdEd25519ParticipantIds } from '../../../../threshold/participants';
import { SignerWorkerManagerContext } from '..';
import { getLastLoggedInDeviceNumber } from '../getDeviceNumber';
import { generateSessionId } from '../sessionHandshake.js';
import { ensureEd25519Prefix, toPublicKeyString } from './validateTransactions';

export async function signDelegateAction({
  ctx,
  delegate,
  rpcCall,
  signerMode,
  onEvent,
  confirmationConfigOverride,
  title,
  body,
  sessionId: providedSessionId,
}: {
  ctx: SignerWorkerManagerContext;
  delegate: DelegateActionInput;
  rpcCall: RpcCallPayload;
  signerMode: SignerMode;
  onEvent?: (update: onProgressEvents) => void;
  confirmationConfigOverride?: Partial<ConfirmationConfig>;
  title?: string;
  body?: string;
  sessionId?: string;
}): Promise<{
  signedDelegate: WasmSignedDelegate;
  hash: string;
  nearAccountId: AccountId;
  logs?: string[];
}> {
  const sessionId = providedSessionId ?? generateSessionId();
  const nearAccountId = rpcCall.nearAccountId || delegate.senderId;
  const relayerUrl = ctx.relayerUrl;

  const resolvedRpcCall = {
    contractId: rpcCall.contractId || PASSKEY_MANAGER_DEFAULT_CONFIGS.contractId,
    nearRpcUrl: rpcCall.nearRpcUrl || (PASSKEY_MANAGER_DEFAULT_CONFIGS.nearRpcUrl.split(',')[0] || PASSKEY_MANAGER_DEFAULT_CONFIGS.nearRpcUrl),
    nearAccountId,
  } as RpcCallPayload;

  const actionsWasm = delegate.actions.map(toActionArgsWasm);
  actionsWasm.forEach((action, actionIndex) => {
    try {
      validateActionArgsWasm(action);
    } catch (error) {
      throw new Error(
        `Delegate action ${actionIndex} validation failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });

  const deviceNumber = await getLastLoggedInDeviceNumber(nearAccountId, ctx.indexedDB.clientDB);
  const [localKeyMaterial, thresholdKeyMaterial] = await Promise.all([
    ctx.indexedDB.nearKeysDB.getLocalKeyMaterial(nearAccountId, deviceNumber),
    ctx.indexedDB.nearKeysDB.getThresholdKeyMaterial(nearAccountId, deviceNumber),
  ]);
  if (!localKeyMaterial) {
    throw new Error(`No local key material found for account: ${nearAccountId}`);
  }

  const warnings: string[] = [];
  const vrfWorkerManager = ctx.vrfWorkerManager;
  if (!vrfWorkerManager) {
    throw new Error('VrfWorkerManager not available for delegate signing');
  }

  const resolvedSignerMode = await resolveSignerModeForThresholdSigning({
    nearAccountId,
    signerMode,
    relayerUrl,
    hasThresholdKeyMaterial: !!thresholdKeyMaterial,
    warnings,
  });

  const signingContext = validateAndPrepareDelegateSigningContext({
    nearAccountId,
    resolvedSignerMode,
    relayerUrl,
    rpId: ctx.touchIdPrompt.getRpId(),
    localKeyMaterial,
    thresholdKeyMaterial,
    providedDelegatePublicKey: delegate.publicKey,
    warnings,
  });

  // Ensure nonce/block context is fetched for the same access key that will sign.
  // Threshold signing MUST use the threshold/group public key (relayer access key) for:
  // - correct nonce reservation
  // - relayer scope checks (/authorize expects signingPayload.delegate.publicKey == relayer key)
  ctx.nonceManager.initializeUser(toAccountId(nearAccountId), signingContext.signingNearPublicKeyStr);

  const confirmation = await vrfWorkerManager.confirmAndPrepareSigningSession({
    ctx,
    sessionId,
    kind: 'delegate',
    ...(signingContext.threshold && !signingContext.threshold.thresholdSessionJwt ? { signingAuthMode: 'webauthn' } : {}),
    nearAccountId,
    delegate: {
      senderId: delegate.senderId || nearAccountId,
      receiverId: delegate.receiverId,
      actions: actionsWasm,
      nonce: delegate.nonce,
      maxBlockHeight: delegate.maxBlockHeight,
    },
    rpcCall: resolvedRpcCall,
    confirmationConfigOverride,
    title,
    body,
  });

  let { intentDigest, transactionContext, vrfChallenge, credential } =
    extractSigningEvidenceFromConfirmation(confirmation);

  const delegatePayload = {
    senderId: delegate.senderId || nearAccountId,
    receiverId: delegate.receiverId,
    actions: actionsWasm,
    nonce: delegate.nonce.toString(),
    maxBlockHeight: delegate.maxBlockHeight.toString(),
    publicKey: signingContext.delegatePublicKeyStr,
  };

  if (!signingContext.threshold) {
    const response = await ctx.sendMessage<WorkerRequestType.SignDelegateAction>({
      sessionId,
      message: {
        type: WorkerRequestType.SignDelegateAction,
        payload: {
          signerMode: signingContext.resolvedSignerMode,
          rpcCall: resolvedRpcCall,
          createdAt: Date.now(),
          decryption: {
            encryptedPrivateKeyData: localKeyMaterial.encryptedSk,
            encryptedPrivateKeyChacha20NonceB64u: localKeyMaterial.chacha20NonceB64u,
          },
          delegate: delegatePayload,
          intentDigest,
          transactionContext,
          credential,
        },
      },
      onEvent,
    });

    const okResponse = requireOkSignDelegateActionResponse(response);
    return {
      signedDelegate: okResponse.payload.signedDelegate!,
      hash: okResponse.payload.hash!,
      nearAccountId: toAccountId(nearAccountId),
      logs: [...(okResponse.payload.logs || []), ...warnings],
    };
  }

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
    delegate: delegatePayload,
    intentDigest,
    transactionContext,
    vrfChallenge,
    credential,
  };

  let okResponse: WorkerSuccessResponse<typeof WorkerRequestType.SignDelegateAction>;
  try {
    const resp = await ctx.sendMessage<typeof WorkerRequestType.SignDelegateAction>({
      sessionId,
      message: { type: WorkerRequestType.SignDelegateAction, payload: requestPayload },
      onEvent,
    });
    okResponse = requireOkSignDelegateActionResponse(resp);
  } catch (e: unknown) {
    const err = e instanceof Error ? e : new Error(String(e));
    if (!isThresholdSessionAuthUnavailableError(err)) throw err;

    clearCachedThresholdEd25519AuthSession(signingContext.threshold.thresholdSessionCacheKey);
    signingContext.threshold.thresholdSessionJwt = undefined;
    requestPayload.threshold.thresholdSessionJwt = undefined;

    if (!credential || !vrfChallenge) {
      const refreshed = await vrfWorkerManager.confirmAndPrepareSigningSession({
        ctx,
        sessionId,
        kind: 'delegate',
        signingAuthMode: 'webauthn',
        nearAccountId,
        delegate: {
          senderId: delegate.senderId || nearAccountId,
          receiverId: delegate.receiverId,
          actions: actionsWasm,
          nonce: delegate.nonce,
          maxBlockHeight: delegate.maxBlockHeight,
        },
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

    const resp = await ctx.sendMessage<typeof WorkerRequestType.SignDelegateAction>({
      sessionId,
      message: { type: WorkerRequestType.SignDelegateAction, payload: requestPayload },
      onEvent,
    });
    okResponse = requireOkSignDelegateActionResponse(resp);
  }

  return {
    signedDelegate: okResponse.payload.signedDelegate!,
    hash: okResponse.payload.hash!,
    nearAccountId: toAccountId(nearAccountId),
    logs: [...(okResponse.payload.logs || []), ...warnings],
  };
}

type ThresholdDelegateSigningContext = {
  resolvedSignerMode: 'threshold-signer';
  signingNearPublicKeyStr: string;
  delegatePublicKeyStr: string;
  threshold: {
    relayerUrl: string;
    thresholdKeyMaterial: ThresholdEd25519_2p_V1Material;
    thresholdSessionCacheKey: string;
    thresholdSessionJwt: string | undefined;
  };
};

type LocalDelegateSigningContext = {
  resolvedSignerMode: 'local-signer';
  signingNearPublicKeyStr: string;
  delegatePublicKeyStr: string;
  threshold: null;
};

type DelegateSigningContext = ThresholdDelegateSigningContext | LocalDelegateSigningContext;

function validateAndPrepareDelegateSigningContext(args: {
  nearAccountId: string;
  resolvedSignerMode: SignerMode['mode'];
  relayerUrl: string;
  rpId: string | null;
  localKeyMaterial: LocalNearSkV3Material;
  thresholdKeyMaterial: ThresholdEd25519_2p_V1Material | null;
  providedDelegatePublicKey: DelegateActionInput['publicKey'];
  warnings: string[];
}): DelegateSigningContext {
  const localPublicKey = ensureEd25519Prefix(args.localKeyMaterial.publicKey);
  if (!localPublicKey) {
    throw new Error(`Missing local signing public key for ${args.nearAccountId}`);
  }

  const providedDelegatePublicKeyStr = ensureEd25519Prefix(toPublicKeyString(args.providedDelegatePublicKey));

  if (args.resolvedSignerMode !== 'threshold-signer') {
    if (providedDelegatePublicKeyStr && providedDelegatePublicKeyStr !== localPublicKey) {
      args.warnings.push(
        `Delegate public key ${providedDelegatePublicKeyStr} does not match local signer key; using ${localPublicKey}`
      );
    }
    return {
      resolvedSignerMode: 'local-signer',
      signingNearPublicKeyStr: localPublicKey,
      delegatePublicKeyStr: localPublicKey,
      threshold: null,
    };
  }

  const thresholdKeyMaterial = args.thresholdKeyMaterial;
  if (!thresholdKeyMaterial) {
    throw new Error(`Missing threshold key material for ${args.nearAccountId}`);
  }

  const thresholdPublicKey = ensureEd25519Prefix(thresholdKeyMaterial.publicKey);
  if (!thresholdPublicKey) {
    throw new Error(`Missing threshold signing public key for ${args.nearAccountId}`);
  }

  if (providedDelegatePublicKeyStr && providedDelegatePublicKeyStr !== thresholdPublicKey) {
    args.warnings.push(
      `Delegate public key ${providedDelegatePublicKeyStr} does not match threshold signer key; using ${thresholdPublicKey}`
    );
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
    delegatePublicKeyStr: thresholdPublicKey,
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

function requireOkSignDelegateActionResponse(
  response: unknown
): WorkerSuccessResponse<typeof WorkerRequestType.SignDelegateAction> {
  if (!isSignDelegateActionSuccess(response as any)) {
    if (isWorkerError(response as any)) {
      throw new Error((response as any).payload?.error || 'Delegate action signing failed');
    }
    throw new Error('Delegate action signing failed');
  }

  const resp = response as WorkerSuccessResponse<typeof WorkerRequestType.SignDelegateAction>;
  if (!resp.payload.success || !resp.payload.signedDelegate || !resp.payload.hash) {
    throw new Error(resp.payload.error || 'Delegate action signing failed');
  }
  return resp;
}
