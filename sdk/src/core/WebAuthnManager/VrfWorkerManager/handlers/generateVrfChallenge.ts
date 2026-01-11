import type {
  VRFInputData,
  VRFWorkerMessage,
  WasmGenerateVrfChallengeRequest,
} from '../../../types/vrf-worker';
import { validateVRFChallenge, type VRFChallenge } from '../../../types/vrf-worker';
import { toAccountId } from '../../../types/accountIds';
import type { VrfWorkerManagerHandlerContext } from './types';
import { checkVrfStatus } from './checkVrfStatus';
import { shamir3PassDecryptVrfKeypair } from './shamir3PassDecryptVrfKeypair';
import { toTrimmedString } from '@/utils';

/**
 * Generate a VRF challenge and cache it under `sessionId` inside the VRF worker.
 *
 * This is used by SecureConfirm flows so later steps (e.g. contract verification) can rely on
 * worker-owned challenge data instead of JS-provided state.
 */
export async function generateVrfChallengeForSession(
  ctx: VrfWorkerManagerHandlerContext,
  inputData: VRFInputData,
  sessionId: string
): Promise<VRFChallenge> {
  return generateVrfChallengeInternal(ctx, inputData, sessionId);
}

/**
 * Generate a one-off VRF challenge without caching it in the VRF worker.
 *
 * Used for standalone WebAuthn prompts where we don't need to later look up the challenge by `sessionId`.
 */
export async function generateVrfChallengeOnce(
  ctx: VrfWorkerManagerHandlerContext,
  inputData: VRFInputData
): Promise<VRFChallenge> {
  return generateVrfChallengeInternal(ctx, inputData);
}

async function generateVrfChallengeInternal(
  ctx: VrfWorkerManagerHandlerContext,
  inputData: VRFInputData,
  sessionId?: string
): Promise<VRFChallenge> {
  await ctx.ensureWorkerReady(true);

  // Root-cause fix: ensure the VRF worker's active VRF keypair matches the IndexedDB "lastUser" device.
  // Otherwise, multi-device accounts can drift such that:
  // - WebAuthn allowCredentials selects the lastUser passkey, but
  // - VRF challenges are generated from a different device's vrf_sk,
  // causing contract verification failures.
  await ensureVrfKeypairBoundToLastUser(ctx, inputData.userId);

  const message: VRFWorkerMessage<WasmGenerateVrfChallengeRequest> = {
    type: 'GENERATE_VRF_CHALLENGE',
    id: ctx.generateMessageId(),
    payload: {
      sessionId,
	      vrfInputData: {
	        userId: inputData.userId,
	        rpId: inputData.rpId,
	        blockHeight: String(inputData.blockHeight),
	        blockHash: inputData.blockHash,
	        intentDigest: inputData.intentDigest,
          sessionPolicyDigest32: inputData.sessionPolicyDigest32,
	      },
	    },
	  };

  const response = await ctx.sendMessage(message);

  if (!response.success || !response.data) {
    throw new Error(`VRF challenge generation failed: ${response.error}`);
  }

  const data = response.data as unknown as VRFChallenge;
  return validateVRFChallenge(data);
}

async function ensureVrfKeypairBoundToLastUser(
  ctx: VrfWorkerManagerHandlerContext,
  nearAccountId: string,
): Promise<void> {
  const accountId = toAccountId(nearAccountId);
  const { indexedDB } = ctx.getContext();

  const lastUser = await indexedDB.clientDB.getLastUser().catch(() => null);
  if (!lastUser || toAccountId(lastUser.nearAccountId) !== accountId) {
    return;
  }

  const lastUserDeviceNumber = Number(lastUser.deviceNumber);
  if (!Number.isFinite(lastUserDeviceNumber) || lastUserDeviceNumber < 1) {
    return;
  }

  const status = await checkVrfStatus(ctx);
  const currentVrfPublicKey = toTrimmedString(status.vrfPublicKey);

  // Best-effort: find the expected VRF public key for the last-user device from the authenticator cache.
  const authenticators = await indexedDB.clientDB.getAuthenticatorsByUser(accountId).catch(() => []);
  const expectedVrfPublicKey = toTrimmedString(
    authenticators.find(a => a.credentialId === lastUser.passkeyCredential.rawId)?.vrfPublicKey
    ?? authenticators.find(a => a.deviceNumber === lastUserDeviceNumber)?.vrfPublicKey
  );

  const needsRebind = !status.active
    || (expectedVrfPublicKey && currentVrfPublicKey !== expectedVrfPublicKey);

  if (!needsRebind) {
    return;
  }

  const shamir = lastUser.serverEncryptedVrfKeypair;
  if (!shamir?.ciphertextVrfB64u || !shamir?.kek_s_b64u || !shamir?.serverKeyId) {
    // If we can't rebind automatically, fail early instead of silently generating a challenge from the wrong vrf_sk.
    throw new Error(
      'VRF session is not bound to the last logged-in passkey device. Please log in again on this device.',
    );
  }

  const unlock = await shamir3PassDecryptVrfKeypair(ctx, {
    nearAccountId: accountId,
    ciphertextVrfB64u: shamir.ciphertextVrfB64u,
    kek_s_b64u: shamir.kek_s_b64u,
    serverKeyId: shamir.serverKeyId,
  });
  if (!unlock.success) {
    throw new Error(unlock.error || 'Failed to rebind VRF keypair to the last logged-in device');
  }

  // If we know the expected VRF pk, confirm the rebind succeeded.
  if (expectedVrfPublicKey) {
    const rebound = await checkVrfStatus(ctx);
    const reboundPk = toTrimmedString(rebound.vrfPublicKey);
    if (!rebound.active || reboundPk !== expectedVrfPublicKey) {
      throw new Error(
        'VRF session mismatch: VRF keypair did not match the last logged-in device after rebind. Please log in again.',
      );
    }
  }
}
