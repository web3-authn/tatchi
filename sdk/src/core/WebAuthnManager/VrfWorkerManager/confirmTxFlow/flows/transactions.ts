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
  getNearAccountId,
  getIntentDigest,
  getTxCount,
  isUserCancelledSecureConfirm,
  ERROR_MESSAGES,
  getSignTransactionPayload,
} from './index';
import { toAccountId } from '../../../../types/accountIds';
import { getLastLoggedInDeviceNumber } from '../../../SignerWorkerManager/getDeviceNumber';
import { toError } from '../../../../../utils/errors';
import { PASSKEY_MANAGER_DEFAULT_CONFIGS } from '../../../../defaultConfigs';
import { createConfirmSession } from '../adapters/session';
import { createConfirmTxFlowAdapters } from '../adapters/createAdapters';
import { computeUiIntentDigestFromNep413 } from '../../../../digests/intentDigest';

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
  const adapters = createConfirmTxFlowAdapters(ctx);
  const session = createConfirmSession({
    adapters,
    worker,
    request,
    confirmationConfig,
    transactionSummary,
  });
  const nearAccountId = getNearAccountId(request);
  const signingAuthMode = getSigningAuthMode(request);
  const usesNeeded = getTxCount(request);
  const vrfIntentDigestB64u = request.type === SecureConfirmationType.SIGN_TRANSACTION
    ? getIntentDigest(request)
    : request.type === SecureConfirmationType.SIGN_NEP413_MESSAGE
      ? await computeUiIntentDigestFromNep413({
        nearAccountId,
        recipient: (request.payload as any)?.recipient ?? '',
        message: (request.payload as any)?.message ?? '',
      })
      : undefined;

  // 1) NEAR context + nonce reservation
  const nearRpc = await adapters.near.fetchNearContext({ nearAccountId, txCount: usesNeeded, reserveNonces: true });
  if (nearRpc.error && !nearRpc.transactionContext) {
    // eslint-disable-next-line no-console
    console.error('[SigningFlow] fetchNearContext failed', { error: nearRpc.error, details: nearRpc.details });
    return session.confirmAndCloseModal({
      requestId: request.requestId,
      intentDigest: getIntentDigest(request),
      confirmed: false,
      error: `${ERROR_MESSAGES.nearRpcFailed}: ${nearRpc.details}`,
    });
  }
  session.setReservedNonces(nearRpc.reservedNonces);
  let transactionContext = nearRpc.transactionContext as TransactionContext;

  // 2) Security context shown in the confirmer (rpId + block height).
  // For warmSession signing we still want to show this context even though
  // we won't collect a WebAuthn credential.
  const rpId = adapters.vrf.getRpId();
  let uiVrfChallenge: VRFChallenge | undefined;
  let uiVrfChallengeForUi: Partial<VRFChallenge> | undefined = rpId
    ? {
        userId: nearAccountId,
        rpId,
        blockHeight: transactionContext.txBlockHeight,
        blockHash: transactionContext.txBlockHash,
      }
    : undefined;

  // Initial VRF challenge (only needed for WebAuthn credential collection)
  if (signingAuthMode === 'webauthn') {
    uiVrfChallenge = await adapters.vrf.generateVrfChallengeForSession(
      {
        userId: nearAccountId,
        rpId,
        blockHeight: transactionContext.txBlockHeight,
        blockHash: transactionContext.txBlockHash,
        ...(vrfIntentDigestB64u ? { intentDigest: vrfIntentDigestB64u } : {}),
      },
      request.requestId,
    );
    uiVrfChallengeForUi = uiVrfChallenge;
  }

  // 3) UI confirm
  const { confirmed, error: uiError } = await session.promptUser({ vrfChallenge: uiVrfChallengeForUi });
  if (!confirmed) {
    return session.confirmAndCloseModal({
      requestId: request.requestId,
      intentDigest: getIntentDigest(request),
      confirmed: false,
      error: uiError,
    });
  }

  // 4) Warm session: dispense WrapKeySeed and skip WebAuthn
  if (signingAuthMode === 'warmSession') {
    try {
      await adapters.vrf.dispenseSessionKey({ sessionId: request.requestId, uses: usesNeeded });
    } catch (err: unknown) {
      const msg = String((toError(err))?.message || err || '');
      return session.confirmAndCloseModal({
        requestId: request.requestId,
        intentDigest: getIntentDigest(request),
        confirmed: false,
        error: msg || 'Failed to dispense warm session key',
      });
    }

    session.confirmAndCloseModal({
      requestId: request.requestId,
      intentDigest: getIntentDigest(request),
      confirmed: true,
      transactionContext,
    });
    return;
  }

  // 5) JIT refresh VRF + ctx (best-effort)
  try {
    const refreshed = await adapters.vrf.maybeRefreshVrfChallenge(request, nearAccountId);
    uiVrfChallenge = refreshed.vrfChallenge;
    transactionContext = refreshed.transactionContext;
    session.updateUI({ vrfChallenge: uiVrfChallenge });
  } catch (e) {
    console.debug('[SigningFlow] VRF JIT refresh skipped', e);
  }

  // 6) Collect authentication credential
  try {
    if (!uiVrfChallenge) {
      throw new Error('Missing vrfChallenge for WebAuthn signing flow');
    }
    const serializedCredential = await adapters.webauthn.collectAuthenticationCredentialWithPRF({
      nearAccountId,
      vrfChallenge: uiVrfChallenge,
    });

    // 5c) Derive WrapKeySeed inside the VRF worker and deliver it to the signer worker via
    // the reserved WrapKeySeed MessagePort. Main thread only sees wrapKeySalt metadata.
    let contractId: string | undefined;
    let nearRpcUrl: string | undefined;
    try {
      // Ensure VRF session is active and bound to the same account we are signing for.
      const vrfStatus = await adapters.vrf.checkVrfStatus();
      if (!vrfStatus.active) {
        throw new Error('VRF keypair not active in memory. VRF session may have expired or was not properly initialized. Please refresh and try again.');
      }
      if (!vrfStatus.nearAccountId || String(vrfStatus.nearAccountId) !== String(toAccountId(nearAccountId))) {
        throw new Error('VRF session is active but bound to a different account than the one being signed. Please log in again on this device.');
      }

      const deviceNumber = await getLastLoggedInDeviceNumber(toAccountId(nearAccountId), ctx.indexedDB.clientDB);
      const keyMaterial = await ctx.indexedDB.nearKeysDB.getLocalKeyMaterial(nearAccountId, deviceNumber);
      if (!keyMaterial) {
        throw new Error(`No key material found for account ${nearAccountId} device ${deviceNumber}`);
      }
      const wrapKeySalt = keyMaterial.wrapKeySalt;
      if (!wrapKeySalt) {
        throw new Error('Missing wrapKeySalt in vault; re-register to upgrade vault format.');
      }

      // Extract contract verification context when available.
      // - SIGN_TRANSACTION: use per-request rpcCall (already normalized by caller).
      // - SIGN_NEP413_MESSAGE: allow per-request override; fall back to PASSKEY_MANAGER_DEFAULT_CONFIGS.
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

      await adapters.vrf.mintSessionKeysAndSendToSigner({
        sessionId: request.requestId,
        wrapKeySalt,
        contractId,
        nearRpcUrl,
        credential: serializedCredential,
      });
	    } catch (err) {
	      console.error('[SigningFlow] WrapKeySeed derivation failed:', err);
	      throw err; // Don't silently ignore - propagate the error
	    }

    // 6) Respond; keep nonces reserved for worker to use
    session.confirmAndCloseModal({
      requestId: request.requestId,
      intentDigest: getIntentDigest(request),
      confirmed: true,
      credential: serializedCredential,
      // prfOutput intentionally omitted to keep signer PRF-free
      // WrapKeySeed travels only over the dedicated VRF→Signer MessagePort; do not echo in the main-thread envelope
      vrfChallenge: uiVrfChallenge,
      transactionContext,
    });
  } catch (err: unknown) {
    // Treat TouchID/FaceID cancellation and related errors as a negative decision
    const cancelled = isUserCancelledSecureConfirm(err);
    // For missing PRF outputs, surface the error to caller (defensive path tests expect a throw)
    const msg = String((toError(err))?.message || err || '');
    if (/Missing PRF result/i.test(msg) || /Missing PRF results/i.test(msg)) {
      // Ensure UI is closed and nonces released, then rethrow
      return session.cleanupAndRethrow(err);
    }
    if (cancelled) {
      window.parent?.postMessage({ type: 'WALLET_UI_CLOSED' }, '*');
    }
    const isWrongPasskeyError = /multiple passkeys \(devicenumbers\) for account/i.test(msg);
    return session.confirmAndCloseModal({
      requestId: request.requestId,
      intentDigest: getIntentDigest(request),
      confirmed: false,
      error: cancelled
        ? ERROR_MESSAGES.cancelled
        : (isWrongPasskeyError ? msg : (msg || ERROR_MESSAGES.collectCredentialsFailed)),
    });
  }
}
