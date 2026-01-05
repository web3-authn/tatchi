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
  isSignDelegateActionSuccess,
  WasmDelegateSignResult,
  WasmSignedDelegate,
} from '../../../types/signer-worker';
import { SignerWorkerManagerContext } from '..';
import { getLastLoggedInDeviceNumber } from '../getDeviceNumber';
import { generateSessionId } from '../sessionHandshake.js';
import { toPublicKeyString } from './validation';
import { resolveSignerModeForThresholdSigning } from '../../../threshold/thresholdEd25519RelayerHealth';

export async function signDelegateAction({
  ctx,
  delegate,
  rpcCall,
  signerMode,
  relayerUrl: providedRelayerUrl,
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
  relayerUrl?: string;
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
  const relayerUrl = String(providedRelayerUrl || '').trim();
  if (!ctx.vrfWorkerManager) {
    throw new Error('VrfWorkerManager not available for delegate signing');
  }

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
  // - relayer scope checks (/authorize expects signingPayload.delegate.publicKey == relayer key)
  const signingNearPublicKeyStr = resolvedSignerMode === 'threshold-signer'
    ? thresholdKeyMaterial?.publicKey
    : localKeyMaterial.publicKey;
  if (!signingNearPublicKeyStr) {
    throw new Error(`Missing signing public key for signerMode=${resolvedSignerMode}`);
  }
  ctx.nonceManager.initializeUser(toAccountId(nearAccountId), signingNearPublicKeyStr);

  const confirmation = await ctx.vrfWorkerManager.confirmAndPrepareSigningSession({
    ctx,
    sessionId,
    kind: 'delegate',
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

  const intentDigest = confirmation.intentDigest;
  const transactionContext = confirmation.transactionContext;
  // Never forward PRF outputs to the relayer; strip extension results.
  const credential = confirmation.credential
    ? JSON.stringify({
      ...(confirmation.credential as any),
      authenticatorAttachment: (confirmation.credential as any).authenticatorAttachment ?? null,
      response: {
        ...((confirmation.credential as any).response || {}),
        userHandle: (confirmation.credential as any)?.response?.userHandle ?? null,
      },
      clientExtensionResults: null,
    })
    : undefined;
  const vrfChallenge = confirmation.vrfChallenge;

  if (resolvedSignerMode === 'threshold-signer') {
    if (!thresholdKeyMaterial) throw new Error(`Missing threshold key material for ${nearAccountId}`);
    if (!relayerUrl) {
      throw new Error('Missing relayerUrl (required for threshold-signer)');
    }
    if (!confirmation.credential || !vrfChallenge) {
      throw new Error('Missing WebAuthn credential or VRF challenge for threshold-signer authorization');
    }

    const response = await ctx.sendMessage({
      sessionId,
      message: {
        type: WorkerRequestType.SignDelegateAction,
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
          delegate: {
            senderId: delegate.senderId || nearAccountId,
            receiverId: delegate.receiverId,
            actions: actionsWasm,
            nonce: delegate.nonce.toString(),
            maxBlockHeight: delegate.maxBlockHeight.toString(),
            publicKey: toPublicKeyString(delegate.publicKey),
          },
          intentDigest,
          transactionContext,
          vrfChallenge,
          credential,
        },
      },
      onEvent,
    });

    // eslint-disable-next-line no-console
    console.debug('[WebAuthnManager][delegate] raw worker response', response);

    if (!isSignDelegateActionSuccess(response)) {
      // eslint-disable-next-line no-console
      console.error('[WebAuthnManager][delegate] non-success worker response', response);
      const payloadError = (response as any)?.payload?.error;
      throw new Error(payloadError || 'Delegate action signing failed');
    }

    const payload = response.payload as WasmDelegateSignResult;
    if (!payload.success || !payload.signedDelegate || !payload.hash) {
      // eslint-disable-next-line no-console
      console.error('[WebAuthnManager][delegate] invalid delegate payload', payload);
      throw new Error(payload.error || 'Delegate action signing failed');
    }

    return {
      signedDelegate: payload.signedDelegate,
      hash: payload.hash,
      nearAccountId: toAccountId(nearAccountId),
      logs: [...(payload.logs || []), ...warnings],
    };
  }

  const response = await ctx.sendMessage({
    sessionId,
    message: {
      type: WorkerRequestType.SignDelegateAction,
      payload: {
        signerMode: resolvedSignerMode,
        rpcCall: resolvedRpcCall,
        createdAt: Date.now(),
        decryption: {
          encryptedPrivateKeyData: localKeyMaterial.encryptedSk,
          encryptedPrivateKeyChacha20NonceB64u: localKeyMaterial.chacha20NonceB64u,
        },
        delegate: {
          senderId: delegate.senderId || nearAccountId,
          receiverId: delegate.receiverId,
          actions: actionsWasm,
          nonce: delegate.nonce.toString(),
          maxBlockHeight: delegate.maxBlockHeight.toString(),
          publicKey: toPublicKeyString(delegate.publicKey),
        },
        intentDigest,
        transactionContext,
        credential,
      },
    },
    onEvent,
  });

  // eslint-disable-next-line no-console
  console.debug('[WebAuthnManager][delegate] raw worker response', response);

  if (!isSignDelegateActionSuccess(response)) {
    // eslint-disable-next-line no-console
    console.error('[WebAuthnManager][delegate] non-success worker response', response);
    const payloadError = (response as any)?.payload?.error;
    throw new Error(payloadError || 'Delegate action signing failed');
  }

  const payload = response.payload as WasmDelegateSignResult;
  if (!payload.success || !payload.signedDelegate || !payload.hash) {
    // eslint-disable-next-line no-console
    console.error('[WebAuthnManager][delegate] invalid delegate payload', payload);
    throw new Error(payload.error || 'Delegate action signing failed');
  }

  return {
    signedDelegate: payload.signedDelegate,
    hash: payload.hash,
    nearAccountId: toAccountId(nearAccountId),
    logs: [...(payload.logs || []), ...warnings],
  };
}
