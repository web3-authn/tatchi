import { isObject } from '@/utils/validation';
import { AccountId, toAccountId } from '../../../types/accountIds';
import {
  WorkerRequestType,
  isDecryptPrivateKeyWithPrfSuccess,
} from '../../../types/signer-worker';
import { runSecureConfirm } from '../../VrfWorkerManager/secureConfirmBridge';
import { SecureConfirmationType } from '../../VrfWorkerManager/confirmTxFlow/types';
import { SignerWorkerManagerContext } from '..';
import { getLastLoggedInDeviceNumber } from '../getDeviceNumber';

/**
 * Two-phase export (worker-driven):
 *  - Phase 1: collect PRF (uiMode: 'none') and derive WrapKeySeed in VRF worker
 *  - Decrypt inside signer worker (session-bound)
 *  - Phase 2: show export UI with decrypted key (kept open until user closes)
 */
export async function exportNearKeypairUi({
  ctx,
  nearAccountId,
  variant,
  theme,
  sessionId,
}: {
  ctx: SignerWorkerManagerContext;
  nearAccountId: AccountId;
  variant?: 'drawer' | 'modal';
  theme?: 'dark' | 'light';
  sessionId: string;
}): Promise<void> {
  const accountId = toAccountId(nearAccountId);

  // Gather encrypted key + ChaCha20 nonce and public key from IndexedDB
  const deviceNumber = await getLastLoggedInDeviceNumber(accountId, ctx.indexedDB.clientDB);
  const [keyData, user] = await Promise.all([
    ctx.indexedDB.nearKeysDB.getLocalKeyMaterial(accountId, deviceNumber),
    ctx.indexedDB.clientDB.getUserByDevice(accountId, deviceNumber),
  ]);
  const publicKey = user?.clientNearPublicKey || '';
  if (!keyData || !publicKey) {
    throw new Error('Missing local key material for export. Re-register to upgrade vault.');
  }

  // Decrypt inside signer worker using the reserved session
  const response = await ctx.sendMessage<WorkerRequestType.DecryptPrivateKeyWithPrf>({
    sessionId,
    message: {
      type: WorkerRequestType.DecryptPrivateKeyWithPrf,
      payload: {
        nearAccountId: accountId,
        encryptedPrivateKeyData: keyData.encryptedSk,
        encryptedPrivateKeyChacha20NonceB64u: keyData.chacha20NonceB64u,
      },
    },
  });

  if (!isDecryptPrivateKeyWithPrfSuccess(response)) {
    console.error('WebAuthnManager: Export decrypt failed:', response);
    const payloadError = isObject(response?.payload) && response?.payload?.error;
    const msg = String(payloadError || 'Export decrypt failed');
    throw new Error(msg);
  }

  const privateKey = response.payload.privateKey;

  // Phase 2: show secure UI (VRF-driven viewer)
  const showReq = {
    requestId: sessionId,
    type: SecureConfirmationType.SHOW_SECURE_PRIVATE_KEY_UI,
    summary: {
      operation: 'Export Private Key' as const,
      accountId,
      publicKey,
      warning: 'Anyone with your private key can fully control your account. Never share it.',
    },
    payload: {
      nearAccountId: accountId,
      publicKey,
      privateKey,
      variant,
      theme,
    },
  };
  await runSecureConfirm(ctx, showReq);
}
