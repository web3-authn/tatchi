import { PASSKEY_MANAGER_DEFAULT_CONFIGS } from '../../../defaultConfigs';
import { AccountId, toAccountId } from '../../../types/accountIds';
import { toActionArgsWasm, validateActionArgsWasm } from '../../../types/actions';
import { DelegateActionInput } from '../../../types/delegate';
import type { onProgressEvents } from '../../../types/passkeyManager';
import {
  ConfirmationConfig,
  RpcCallPayload,
  WorkerRequestType,
  isSignDelegateActionSuccess,
  WasmDelegateSignResult,
  WasmSignedDelegate,
} from '../../../types/signer-worker';
import { SignerWorkerManagerContext } from '..';
import { getDeviceNumberForAccount } from '../getDeviceNumber';
import { withSessionId } from './session';
import { base58Encode } from '../../../../utils/base58';

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
  const sessionId = providedSessionId || ((typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
    ? crypto.randomUUID()
    : `delegate-session-${Date.now()}-${Math.random().toString(16).slice(2)}`);

  const nearAccountId = rpcCall.nearAccountId || delegate.senderId;
  const resolvedRpcCall = {
    contractId: rpcCall.contractId || PASSKEY_MANAGER_DEFAULT_CONFIGS.contractId,
    nearRpcUrl: rpcCall.nearRpcUrl || (PASSKEY_MANAGER_DEFAULT_CONFIGS.nearRpcUrl.split(',')[0] || PASSKEY_MANAGER_DEFAULT_CONFIGS.nearRpcUrl),
    nearAccountId,
  } as RpcCallPayload;

  const actionsWasm = delegate.actions.map(toActionArgsWasm);
  // Validate delegate actions locally before dispatching
  actionsWasm.forEach((action, actionIndex) => {
    try {
      validateActionArgsWasm(action);
    } catch (error) {
      throw new Error(`Delegate action ${actionIndex} validation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  // Retrieve encrypted key data from IndexedDB in main thread
  const deviceNumber = await getDeviceNumberForAccount(nearAccountId, ctx.indexedDB.clientDB);
  const encryptedKeyData = await ctx.indexedDB.nearKeysDB.getEncryptedKey(nearAccountId, deviceNumber);
  if (!encryptedKeyData) {
    throw new Error(`No encrypted key found for account: ${nearAccountId}`);
  }
  if (!ctx.vrfWorkerManager) {
    throw new Error('VrfWorkerManager not available for delegate signing');
  }

  // Reuse transaction confirmation path to derive WrapKeySeed + VRF context
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

  const response = await ctx.sendMessage({
    message: {
      type: WorkerRequestType.SignDelegateAction,
      payload: withSessionId({
        rpcCall: resolvedRpcCall,
        createdAt: Date.now(),
        decryption: {
          encryptedPrivateKeyData: encryptedKeyData.encryptedData,
          encryptedPrivateKeyIv: encryptedKeyData.iv,
        },
        delegate: {
          senderId: delegate.senderId || nearAccountId,
          receiverId: delegate.receiverId,
          actions: actionsWasm,
          nonce: delegate.nonce.toString(),
          maxBlockHeight: delegate.maxBlockHeight.toString(),
          publicKey: toPublicKeyString(delegate.publicKey),
        },
        intentDigest: confirmation.intentDigest,
        transactionContext: confirmation.transactionContext,
        credential: confirmation.credential ? JSON.stringify(confirmation.credential) : undefined,
      }, sessionId),
    },
    onEvent,
    sessionId,
  });

  // Debug logging of raw worker response to trace delegate failures.
  // This helps correlate Rust-side logs (DelegateSignResult.logs / error)
  // with the TypeScript path when delegate signing fails.
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
