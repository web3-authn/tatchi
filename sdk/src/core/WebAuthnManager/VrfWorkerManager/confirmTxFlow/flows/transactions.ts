import type { VrfWorkerManagerContext } from '../../';
import type { ConfirmationConfig } from '../../../../types/signer-worker';
import {
  SecureConfirmationType,
  TransactionSummary,
  SigningSecureConfirmRequest,
} from '../types';
import { VRFChallenge, TransactionContext } from '../../../../types';
import {
  renderConfirmUI,
  fetchNearContext,
  maybeRefreshVrfChallenge,
  getNearAccountId,
  getIntentDigest,
  getTxCount,
  sendConfirmResponse,
  closeModalSafely,
  isUserCancelledSecureConfirm,
  releaseReservedNonces,
  ERROR_MESSAGES,
  getSignTransactionPayload,
} from './common';
import { serializeAuthenticationCredentialWithPRF, extractPrfFromCredential } from '../../../credentialsHelpers';
import { toAccountId } from '../../../../types/accountIds';
import { getLastLoggedInDeviceNumber } from '../../../SignerWorkerManager/getDeviceNumber';
import { authenticatorsToAllowCredentials } from '../../../touchIdPrompt';
import { toError } from '../../../../../utils/errors';
import { PASSKEY_MANAGER_DEFAULT_CONFIGS } from '../../../../defaultConfigs';

export async function handleTransactionSigningFlow(
  ctx: VrfWorkerManagerContext,
  request: SigningSecureConfirmRequest,
  worker: Worker,
  opts: { confirmationConfig: ConfirmationConfig; transactionSummary: TransactionSummary },
): Promise<void> {
  const { confirmationConfig, transactionSummary } = opts;
  const nearAccountId = getNearAccountId(request);

  // 1) NEAR context + nonce reservation
  const nearRpc = await fetchNearContext(ctx, { nearAccountId, txCount: getTxCount(request) });
  if (nearRpc.error && !nearRpc.transactionContext) {
    // eslint-disable-next-line no-console
    console.error('[SigningFlow] fetchNearContext failed', { error: nearRpc.error, details: nearRpc.details });
    return sendConfirmResponse(worker, {
      requestId: request.requestId,
      intentDigest: getIntentDigest(request),
      confirmed: false,
      error: `${ERROR_MESSAGES.nearRpcFailed}: ${nearRpc.details}`,
    });
  }
  let transactionContext = nearRpc.transactionContext as TransactionContext;

  // 2) Initial VRF challenge
  if (!ctx.vrfWorkerManager) throw new Error('VrfWorkerManager not available');
  const rpId = ctx.touchIdPrompt.getRpId();
  let uiVrfChallenge: VRFChallenge = await ctx.vrfWorkerManager.generateVrfChallengeForSession(
    {
      userId: nearAccountId,
      rpId,
      blockHeight: transactionContext.txBlockHeight,
      blockHash: transactionContext.txBlockHash,
    },
    request.requestId,
  );

  // 3) UI confirm
  const { confirmed, confirmHandle, error: uiError } = await renderConfirmUI({
    ctx,
    request,
    confirmationConfig,
    transactionSummary,
    vrfChallenge: uiVrfChallenge,
  });
  if (!confirmed) {
    releaseReservedNonces(ctx, nearRpc.reservedNonces);
    closeModalSafely(false, confirmHandle);
    return sendConfirmResponse(worker, {
      requestId: request.requestId,
      intentDigest: getIntentDigest(request),
      confirmed: false,
      error: uiError,
    });
  }

  // 4) JIT refresh VRF + ctx (best-effort)
  try {
    const refreshed = await maybeRefreshVrfChallenge(ctx, request, nearAccountId);
    uiVrfChallenge = refreshed.vrfChallenge;
    transactionContext = refreshed.transactionContext;
    confirmHandle?.update?.({ vrfChallenge: uiVrfChallenge });
  } catch (e) {
    console.debug('[SigningFlow] VRF JIT refresh skipped', e);
  }

  // 5) Collect authentication credential
  try {
    const authenticators = await ctx.indexedDB.clientDB.getAuthenticatorsByUser(toAccountId(nearAccountId));
    const { authenticatorsForPrompt } = await ctx.indexedDB.clientDB.ensureCurrentPasskey(
      toAccountId(nearAccountId),
      authenticators,
    );
    console.debug('[SigningFlow] Authenticators for transaction signing', {
      nearAccountId,
      authenticatorCount: authenticatorsForPrompt.length,
      authenticators: authenticatorsForPrompt.map(a => ({
        deviceNumber: a.deviceNumber,
        vrfPublicKey: a.vrfPublicKey,
        credentialId: a.credentialId,
      })),
      vrfChallengePublicKey: uiVrfChallenge.vrfPublicKey,
    });

    const credential = await ctx.touchIdPrompt.getAuthenticationCredentialsInternal({
      nearAccountId,
      challenge: uiVrfChallenge,
      allowCredentials: authenticatorsToAllowCredentials(authenticatorsForPrompt),
    });

    // Validate that the chosen credential matches the current device, if applicable.
    const { wrongPasskeyError } = await ctx.indexedDB.clientDB.ensureCurrentPasskey(
      toAccountId(nearAccountId),
      authenticators,
      (credential as any)?.rawId,
    );
    if (wrongPasskeyError) {
      throw new Error(wrongPasskeyError);
    }

    const dualPrfOutputs = extractPrfFromCredential({
      credential,
      firstPrfOutput: true,
      secondPrfOutput: false  // PRF.second not needed for normal transaction signing (only registration/linking)
    });
    const serialized = serializeAuthenticationCredentialWithPRF({ credential });

    // 5c) Derive WrapKeySeed inside the VRF worker and deliver it to the signer worker via
    // the reserved WrapKeySeed MessagePort. Main thread only sees wrapKeySalt metadata.
    try {
      // Ensure VRF session is active and bound to the same account we are signing for.
      const vrfStatus = await ctx.vrfWorkerManager.checkVrfStatus();
      if (!vrfStatus.active) {
        throw new Error('VRF keypair not active in memory. VRF session may have expired or was not properly initialized. Please refresh and try again.');
      }
      if (!vrfStatus.nearAccountId || String(vrfStatus.nearAccountId) !== String(toAccountId(nearAccountId))) {
        throw new Error('VRF session is active but bound to a different account than the one being signed. Please log in again on this device.');
      }

      const deviceNumber = await getLastLoggedInDeviceNumber(toAccountId(nearAccountId), ctx.indexedDB.clientDB);
      const encryptedKeyData = await ctx.indexedDB.nearKeysDB.getEncryptedKey(nearAccountId, deviceNumber);
      // For v2+ vaults, wrapKeySalt is the canonical salt. iv fallback is retained
      // only for legacy entries that predate VRF‑owned WrapKeySeed derivation.
      const wrapKeySalt = encryptedKeyData?.wrapKeySalt || encryptedKeyData?.iv || '';
      if (!wrapKeySalt) {
        throw new Error('Missing wrapKeySalt in vault; re-register to upgrade vault format.');
      }
      if (!ctx.vrfWorkerManager) {
        throw new Error('VrfWorkerManager not available for WrapKeySeed derivation');
      }

      // Extract contract verification context when available.
      // - SIGN_TRANSACTION: use per-request rpcCall (already normalized by caller).
      // - SIGN_NEP413_MESSAGE: use default contract/rpc from PASSKEY_MANAGER_DEFAULT_CONFIGS.
      let contractId: string | undefined;
      let nearRpcUrl: string | undefined;
      if (request.type === SecureConfirmationType.SIGN_TRANSACTION) {
        const payload = getSignTransactionPayload(request);
        contractId = payload?.rpcCall?.contractId;
        nearRpcUrl = payload?.rpcCall?.nearRpcUrl;
      } else if (request.type === SecureConfirmationType.SIGN_NEP413_MESSAGE) {
        contractId = PASSKEY_MANAGER_DEFAULT_CONFIGS.contractId;
        const defaultRpc = PASSKEY_MANAGER_DEFAULT_CONFIGS.nearRpcUrl;
        nearRpcUrl = defaultRpc.split(',')[0] || defaultRpc;
      }
      await ctx.vrfWorkerManager.deriveWrapKeySeedAndSendToSigner({
        sessionId: request.requestId,
        prfFirstAuthB64u: dualPrfOutputs.chacha20PrfOutput,
        wrapKeySalt,
        contractId,
        nearRpcUrl,
        credential: serialized,
      });
    } catch (err) {
      console.error('[SigningFlow] WrapKeySeed derivation failed:', err);
      throw err; // Don't silently ignore - propagate the error
    }

  // 6) Respond; keep nonces reserved for worker to use
  const response = {
    requestId: request.requestId,
    intentDigest: getIntentDigest(request),
    confirmed: true,
    credential: serialized,
    // prfOutput intentionally omitted to keep signer PRF-free
    // WrapKeySeed travels only over the dedicated VRF→Signer MessagePort; do not echo in the main-thread envelope
    vrfChallenge: uiVrfChallenge,
    transactionContext,
  };
  sendConfirmResponse(worker, response);
    closeModalSafely(true, confirmHandle);
  } catch (err: unknown) {
    // Treat TouchID/FaceID cancellation and related errors as a negative decision
    const cancelled = isUserCancelledSecureConfirm(err);
    // For missing PRF outputs, surface the error to caller (defensive path tests expect a throw)
    const msg = String((toError(err))?.message || err || '');
    if (/Missing PRF result/i.test(msg) || /Missing PRF results/i.test(msg)) {
      // Ensure UI is closed and nonces released, then rethrow
      releaseReservedNonces(ctx, nearRpc.reservedNonces);
      closeModalSafely(false, confirmHandle);
      throw err;
    }
    if (cancelled) {
      window.parent?.postMessage({ type: 'WALLET_UI_CLOSED' }, '*');
    }
    // Release any reserved nonces on failure
    releaseReservedNonces(ctx, nearRpc.reservedNonces);
    // Close the UI to avoid stale element flashing on next open
    closeModalSafely(false, confirmHandle);
    const isWrongPasskeyError = /multiple passkeys \(devicenumbers\) for account/i.test(msg);
    return sendConfirmResponse(worker, {
      requestId: request.requestId,
      intentDigest: getIntentDigest(request),
      confirmed: false,
      error: cancelled
        ? ERROR_MESSAGES.cancelled
        : (isWrongPasskeyError ? msg : ERROR_MESSAGES.collectCredentialsFailed),
    });
  }
}
