import type { NearClient } from '../../NearClient';
import { IndexedDBManager } from '../../IndexedDBManager';
import { hasAccessKey, waitForAccessKeyAbsent } from '../../rpcCalls';
import { ensureEd25519Prefix } from '../../../utils/validation';
import { ActionType, type ActionArgsWasm, type TransactionInputWasm } from '../../types/actions';
import { toAccountId, type AccountId } from '../../types/accountIds';
import { DEFAULT_WAIT_STATUS } from '../../types/rpc';
import type {
  ConfirmationConfig,
  RpcCallPayload,
  SignerMode,
} from '../../types/signer-worker';
import type { SignTransactionResult } from '../../types/tatchi';

export type RotateThresholdEd25519KeyPostRegistrationHandlerContext = {
  nearClient: NearClient;
  contractId: string;
  nearRpcUrl: string;
  signTransactionsWithActions: (args: {
    transactions: TransactionInputWasm[];
    rpcCall: RpcCallPayload;
    signerMode: SignerMode;
    confirmationConfigOverride?: Partial<ConfirmationConfig>;
    title?: string;
    body?: string;
  }) => Promise<SignTransactionResult[]>;
};

/**
 * Threshold key rotation (post-registration):
 * - keygen (new relayerKeyId + publicKey)
 * - AddKey(new threshold publicKey)
 * - DeleteKey(old threshold publicKey)
 *
 * Uses the local signer key for AddKey/DeleteKey, and requires the account to already
 * have a stored `threshold_ed25519_2p_v1` key material entry for the target device.
 */
export async function rotateThresholdEd25519KeyPostRegistrationHandler(
  ctx: RotateThresholdEd25519KeyPostRegistrationHandlerContext,
  args: {
    nearAccountId: AccountId | string;
    deviceNumber: number;
    oldPublicKey: string;
    oldRelayerKeyId: string;
    newPublicKey: string;
    newRelayerKeyId: string;
    wrapKeySalt: string;
  }
): Promise<{
  success: boolean;
  oldPublicKey: string;
  oldRelayerKeyId: string;
  publicKey: string;
  relayerKeyId: string;
  wrapKeySalt: string;
  deleteOldKeyAttempted: boolean;
  deleteOldKeySuccess: boolean;
  warning?: string;
  error?: string;
}> {
  const nearAccountId = toAccountId(args.nearAccountId);

  const oldPublicKey = String(args.oldPublicKey || '');
  const oldRelayerKeyId = String(args.oldRelayerKeyId || '');
  const newPublicKey = String(args.newPublicKey || '');
  const newRelayerKeyId = String(args.newRelayerKeyId || '');
  const wrapKeySalt = String(args.wrapKeySalt || '');

  const base = {
    oldPublicKey,
    oldRelayerKeyId,
    publicKey: newPublicKey,
    relayerKeyId: newRelayerKeyId,
    wrapKeySalt,
  };

  const ok = (params: { deleteOldKeyAttempted: boolean; deleteOldKeySuccess: boolean; warning?: string }) => {
    const { warning, ...rest } = params;
    return {
      success: true,
      ...base,
      ...rest,
      ...(warning ? { warning } : {}),
    };
  };

  try {
    const deviceNumber = Number(args.deviceNumber);
    const resolvedDeviceNumber = Number.isSafeInteger(deviceNumber) && deviceNumber >= 1 ? deviceNumber : NaN;
    if (!Number.isSafeInteger(resolvedDeviceNumber) || resolvedDeviceNumber < 1) {
      throw new Error('Invalid deviceNumber');
    }

    const oldNormalized = ensureEd25519Prefix(oldPublicKey);
    const newNormalized = ensureEd25519Prefix(newPublicKey);

    if (!oldNormalized) {
      return ok({
        deleteOldKeyAttempted: false,
        deleteOldKeySuccess: false,
        warning: 'Rotation completed but old threshold key material had an invalid publicKey; skipped DeleteKey.',
      });
    }

    if (oldNormalized === newNormalized) {
      return ok({
        deleteOldKeyAttempted: false,
        deleteOldKeySuccess: true,
        warning: 'Rotation returned the same threshold public key; skipped DeleteKey(old).',
      });
    }

    const localKeyMaterial = await IndexedDBManager.nearKeysDB.getLocalKeyMaterial(nearAccountId, resolvedDeviceNumber);
    if (!localKeyMaterial) {
      return ok({
        deleteOldKeyAttempted: false,
        deleteOldKeySuccess: false,
        warning: `Rotation completed but could not load local key material for DeleteKey(old) (account ${nearAccountId} device ${resolvedDeviceNumber}).`,
      });
    }

    const localPk = ensureEd25519Prefix(localKeyMaterial.publicKey);
    if (localPk && localPk === oldNormalized) {
      return ok({
        deleteOldKeyAttempted: false,
        deleteOldKeySuccess: false,
        warning: 'Refusing to DeleteKey(old) because it matches the local signer public key.',
      });
    }

    const oldOnChain = await hasAccessKey(ctx.nearClient, nearAccountId, oldPublicKey, { attempts: 1, delayMs: 0 });
    if (!oldOnChain) {
      return ok({ deleteOldKeyAttempted: false, deleteOldKeySuccess: true });
    }

    const deleteKeyAction: ActionArgsWasm = {
      action_type: ActionType.DeleteKey,
      public_key: oldNormalized,
    };

    const txInputs: TransactionInputWasm[] = [
      {
        receiverId: nearAccountId,
        actions: [deleteKeyAction],
      },
    ];

    let deleteOldKeyAttempted = false;
    try {
      const rpcCall: RpcCallPayload = {
        contractId: ctx.contractId,
        nearRpcUrl: ctx.nearRpcUrl,
        nearAccountId,
      };

      const signed = await ctx.signTransactionsWithActions({
        transactions: txInputs,
        rpcCall,
        signerMode: { mode: 'local-signer' },
        confirmationConfigOverride: {
          uiMode: 'none',
          behavior: 'skipClick',
          autoProceedDelay: 0,
        },
        title: 'Rotate threshold key',
        body: 'Confirm deletion of the old threshold access key.',
      });

      const signedTx = signed?.[0]?.signedTransaction;
      if (!signedTx) throw new Error('Failed to sign DeleteKey(oldThresholdPublicKey) transaction');
      deleteOldKeyAttempted = true;

      await ctx.nearClient.sendTransaction(signedTx, DEFAULT_WAIT_STATUS.linkDeviceDeleteKey);

      const deleted = await waitForAccessKeyAbsent(ctx.nearClient, nearAccountId, oldPublicKey);
      if (!deleted) {
        return ok({
          deleteOldKeyAttempted,
          deleteOldKeySuccess: false,
          warning: 'DeleteKey(old) submitted but old access key is still present on-chain.',
        });
      }

      return ok({ deleteOldKeyAttempted, deleteOldKeySuccess: true });
    } catch (error: unknown) {
      const message = String((error as { message?: unknown })?.message ?? error);
      return ok({
        deleteOldKeyAttempted,
        deleteOldKeySuccess: false,
        warning: `Rotation completed but failed to DeleteKey(old): ${message}`,
      });
    }
  } catch (error: unknown) {
    const message = String((error as { message?: unknown })?.message ?? error);
    return {
      success: false,
      oldPublicKey,
      oldRelayerKeyId,
      publicKey: '',
      relayerKeyId: '',
      wrapKeySalt: '',
      deleteOldKeyAttempted: false,
      deleteOldKeySuccess: false,
      error: message,
    };
  }
}
