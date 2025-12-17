import { PASSKEY_MANAGER_DEFAULT_CONFIGS } from '../../../defaultConfigs';
import { AccountId, toAccountId } from '../../../types/accountIds';
import { toActionArgsWasm, validateActionArgsWasm } from '../../../types/actions';
import { DelegateActionInput } from '../../../types/delegate';
import { type onProgressEvents } from '../../../types/sdkSentEvents';
import {
  ConfirmationConfig,
  RpcCallPayload,
  WorkerRequestType,
  isSignDelegateActionSuccess,
  WasmDelegateSignResult,
  WasmSignedDelegate,
} from '../../../types/signer-worker';
import { SignerWorkerManagerContext } from '..';
import { getLastLoggedInDeviceNumber } from '../getDeviceNumber';
import { withSessionId } from './session';
import { base58Encode } from '../../../../utils/base58';
import { generateSessionId } from '../sessionHandshake.js';

const ensureEd25519Prefix = (value: string) => value.startsWith('ed25519:') ? value : `ed25519:${value}`;

const toPublicKeyString = (pk: DelegateActionInput['publicKey']): string => {
  if (typeof pk === 'string') {
    return pk;
  }
  return ensureEd25519Prefix(base58Encode(pk.keyData));
};

export async function signDelegateAction({
  ctx,
  delegate,
  rpcCall,
  onEvent,
  confirmationConfigOverride,
  sessionId: providedSessionId,
}: {
  ctx: SignerWorkerManagerContext;
  delegate: DelegateActionInput;
  rpcCall: RpcCallPayload;
  onEvent?: (update: onProgressEvents) => void;
  confirmationConfigOverride?: Partial<ConfirmationConfig>;
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
  const encryptedKeyData = await ctx.indexedDB.nearKeysDB.getEncryptedKey(nearAccountId, deviceNumber);
  if (!encryptedKeyData) {
    throw new Error(`No encrypted key found for account: ${nearAccountId}`);
  }
  if (!ctx.vrfWorkerManager) {
    throw new Error('VrfWorkerManager not available for delegate signing');
  }

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
  });

  const intentDigest = confirmation.intentDigest;
  const transactionContext = confirmation.transactionContext;
  const credential = confirmation.credential ? JSON.stringify(confirmation.credential) : undefined;

  const response = await ctx.sendMessage({
    message: {
      type: WorkerRequestType.SignDelegateAction,
      payload: withSessionId(sessionId, {
        rpcCall: resolvedRpcCall,
        createdAt: Date.now(),
        decryption: {
          encryptedPrivateKeyData: encryptedKeyData.encryptedData,
          encryptedPrivateKeyChacha20NonceB64u: encryptedKeyData.chacha20NonceB64u,
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
      }),
    },
    onEvent,
    sessionId,
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
    logs: payload.logs,
  };
}
