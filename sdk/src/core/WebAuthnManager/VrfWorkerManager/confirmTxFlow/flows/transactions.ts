import type { VrfWorkerManagerContext } from '../../';
import type { ConfirmationConfig } from '../../../../types/signer-worker';
import {
  SecureConfirmationType,
  TransactionSummary,
  SigningSecureConfirmRequest,
  SigningAuthMode,
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
import { serializeAuthenticationCredentialWithPRF } from '../../../credentialsHelpers';
import { toAccountId } from '../../../../types/accountIds';
import { getLastLoggedInDeviceNumber } from '../../../SignerWorkerManager/getDeviceNumber';
import { authenticatorsToAllowCredentials } from '../../../touchIdPrompt';
import { toError } from '../../../../../utils/errors';
import { PASSKEY_MANAGER_DEFAULT_CONFIGS } from '../../../../defaultConfigs';

function getSigningAuthMode(request: SigningSecureConfirmRequest): SigningAuthMode {
  if (request.type === SecureConfirmationType.SIGN_TRANSACTION) {
    return getSignTransactionPayload(request).signingAuthMode ?? 'webauthn';
  }
  if (request.type === SecureConfirmationType.SIGN_NEP413_MESSAGE) {
    const p = request.payload as any;
    return (p?.signingAuthMode as SigningAuthMode | undefined) ?? 'webauthn';
  }
  return 'webauthn';
}

export async function handleTransactionSigningFlow(
  ctx: VrfWorkerManagerContext,
  request: SigningSecureConfirmRequest,
  worker: Worker,
  opts: { confirmationConfig: ConfirmationConfig; transactionSummary: TransactionSummary },
): Promise<void> {
  const { confirmationConfig, transactionSummary } = opts;
  const nearAccountId = getNearAccountId(request);
  const signingAuthMode = getSigningAuthMode(request);
  const usesNeeded = getTxCount(request);

  // 1) NEAR context + nonce reservation
  const nearRpc = await fetchNearContext(ctx, { nearAccountId, txCount: usesNeeded });
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

  // 2) Initial VRF challenge (only needed for WebAuthn credential collection)
  let uiVrfChallenge: VRFChallenge | undefined;
  if (signingAuthMode === 'webauthn') {
    if (!ctx.vrfWorkerManager) throw new Error('VrfWorkerManager not available');
    const rpId = ctx.touchIdPrompt.getRpId();
    uiVrfChallenge = await ctx.vrfWorkerManager.generateVrfChallengeForSession(
      {
        userId: nearAccountId,
        rpId,
        blockHeight: transactionContext.txBlockHeight,
        blockHash: transactionContext.txBlockHash,
      },
      request.requestId,
    );
  }

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

  // 4) Warm session: dispense WrapKeySeed and skip WebAuthn
  if (signingAuthMode === 'warmSession') {
    try {
      if (!ctx.vrfWorkerManager) throw new Error('VrfWorkerManager not available');
      await ctx.vrfWorkerManager.dispenseSessionKey({ sessionId: request.requestId, uses: usesNeeded });
    } catch (err: unknown) {
      releaseReservedNonces(ctx, nearRpc.reservedNonces);
      closeModalSafely(false, confirmHandle);
      const msg = String((toError(err))?.message || err || '');
      return sendConfirmResponse(worker, {
        requestId: request.requestId,
        intentDigest: getIntentDigest(request),
        confirmed: false,
        error: msg || 'Failed to dispense warm session key',
      });
    }

    sendConfirmResponse(worker, {
      requestId: request.requestId,
      intentDigest: getIntentDigest(request),
      confirmed: true,
      transactionContext,
    });
    closeModalSafely(true, confirmHandle);
    return;
  }

  // 5) JIT refresh VRF + ctx (best-effort)
  try {
    const refreshed = await maybeRefreshVrfChallenge(ctx, request, nearAccountId);
    uiVrfChallenge = refreshed.vrfChallenge;
    transactionContext = refreshed.transactionContext;
    confirmHandle?.update?.({ vrfChallenge: uiVrfChallenge });
  } catch (e) {
    console.debug('[SigningFlow] VRF JIT refresh skipped', e);
  }

  // 6) Collect authentication credential
  try {
    const authenticators = await ctx.indexedDB.clientDB.getAuthenticatorsByUser(toAccountId(nearAccountId));
    const { authenticatorsForPrompt } = await ctx.indexedDB.clientDB.ensureCurrentPasskey(
      toAccountId(nearAccountId),
      authenticators,
    );
    if (!uiVrfChallenge) {
      throw new Error('Missing vrfChallenge for WebAuthn signing flow');
    }
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

    const serialized = serializeAuthenticationCredentialWithPRF({ credential });

    // 5c) Derive WrapKeySeed inside the VRF worker and deliver it to the signer worker via
    // the reserved WrapKeySeed MessagePort. Main thread only sees wrapKeySalt metadata.
    try {
      const vrfWorkerManager = ctx.vrfWorkerManager;
      if (!vrfWorkerManager) {
        throw new Error('VrfWorkerManager not available for WrapKeySeed derivation');
      }
      // Ensure VRF session is active and bound to the same account we are signing for.
      const vrfStatus = await vrfWorkerManager.checkVrfStatus();
      if (!vrfStatus.active) {
        throw new Error('VRF keypair not active in memory. VRF session may have expired or was not properly initialized. Please refresh and try again.');
      }
      if (!vrfStatus.nearAccountId || String(vrfStatus.nearAccountId) !== String(toAccountId(nearAccountId))) {
        throw new Error('VRF session is active but bound to a different account than the one being signed. Please log in again on this device.');
      }

      const deviceNumber = await getLastLoggedInDeviceNumber(toAccountId(nearAccountId), ctx.indexedDB.clientDB);
      const encryptedKeyData = await ctx.indexedDB.nearKeysDB.getEncryptedKey(nearAccountId, deviceNumber);
      // For v2+ vaults, wrapKeySalt is the canonical salt.
      const wrapKeySalt = encryptedKeyData?.wrapKeySalt || '';
      if (!wrapKeySalt) {
        throw new Error('Missing wrapKeySalt in vault; re-register to upgrade vault format.');
      }

      // Extract contract verification context when available.
      // - SIGN_TRANSACTION: use per-request rpcCall (already normalized by caller).
      // - SIGN_NEP413_MESSAGE: allow per-request override; fall back to PASSKEY_MANAGER_DEFAULT_CONFIGS.
      let contractId: string | undefined;
      let nearRpcUrl: string | undefined;
      if (request.type === SecureConfirmationType.SIGN_TRANSACTION) {
        const payload = getSignTransactionPayload(request);
        contractId = payload?.rpcCall?.contractId;
        nearRpcUrl = payload?.rpcCall?.nearRpcUrl;
      } else if (request.type === SecureConfirmationType.SIGN_NEP413_MESSAGE) {
        const payload = request.payload as any;
        contractId = payload?.contractId
          || PASSKEY_MANAGER_DEFAULT_CONFIGS.contractId;
        nearRpcUrl = payload?.nearRpcUrl
          || PASSKEY_MANAGER_DEFAULT_CONFIGS.nearRpcUrl;
      }

      await vrfWorkerManager.mintSessionKeysAndSendToSigner({
        sessionId: request.requestId,
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
