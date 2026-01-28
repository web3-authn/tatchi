import {
  WorkerRequestType,
  isSignNep413MessageSuccess,
  isWorkerError,
  type ConfirmationConfig,
  type Nep413SigningResponse,
  type SignerMode,
  type WorkerSuccessResponse,
} from '../../../types/signer-worker';
import type { WebAuthnAuthenticationCredential } from '../../../types';
import { removePrfOutputGuard } from '../../credentialsHelpers';
import { resolveSignerModeForThresholdSigning } from '../../../threshold/thresholdEd25519RelayerHealth';
import type {
  LocalNearSkV3Material,
  ThresholdEd25519_2p_V1Material,
} from '../../../IndexedDBManager/passkeyNearKeysDB';
import type { VRFChallenge } from '../../../types/vrf-worker';
import {
  clearCachedThresholdEd25519AuthSession,
  getCachedThresholdEd25519AuthSessionJwt,
  makeThresholdEd25519AuthSessionCacheKey,
} from '../../../threshold/thresholdEd25519AuthSession';
import { isThresholdSessionAuthUnavailableError } from '../../../threshold/thresholdSessionPolicy';
import { normalizeThresholdEd25519ParticipantIds } from '../../../../threshold/participants';
import { getLastLoggedInDeviceNumber } from '../getDeviceNumber';
import { generateSessionId } from '../sessionHandshake.js';
import { SignerWorkerManagerContext } from '..';
import { isChromeExtensionContext } from '../../../ExtensionWallet';

/**
 * Sign a NEP-413 message using the user's passkey-derived private key
 *
 * @param payload - NEP-413 signing parameters including message, recipient, nonce, and state
 * @returns Promise resolving to signing result with account ID, public key, and signature
 */
export async function signNep413Message({ ctx, payload }: {
  ctx: SignerWorkerManagerContext;
  payload: {
    message: string;
    recipient: string;
    nonce: string;
    state: string | null;
    accountId: string;
    signerMode: SignerMode;
    title?: string;
    body?: string;
    confirmationConfigOverride?: Partial<ConfirmationConfig>;
    sessionId?: string;
    contractId?: string;
    nearRpcUrl?: string;
  };
}): Promise<{
  success: boolean;
  accountId: string;
  publicKey: string;
  signature: string;
  state?: string;
  error?: string;
}> {
  try {
    const sessionId = payload.sessionId ?? generateSessionId();
    const relayerUrl = ctx.relayerUrl;
    const nearAccountId = payload.accountId;

    const deviceNumber = await getLastLoggedInDeviceNumber(nearAccountId, ctx.indexedDB.clientDB);
    const [localKeyMaterial, thresholdKeyMaterial] = await Promise.all([
      ctx.indexedDB.nearKeysDB.getLocalKeyMaterial(nearAccountId, deviceNumber),
      ctx.indexedDB.nearKeysDB.getThresholdKeyMaterial(nearAccountId, deviceNumber),
    ]);
    if (!localKeyMaterial) {
      throw new Error(`No local key material found for account: ${nearAccountId}`);
    }

    const resolvedSignerMode = await resolveSignerModeForThresholdSigning({
      nearAccountId,
      signerMode: payload.signerMode,
      relayerUrl,
      hasThresholdKeyMaterial: !!thresholdKeyMaterial,
    });

    const vrfWorkerManager = ctx.vrfWorkerManager;
    if (!vrfWorkerManager) {
      throw new Error('VrfWorkerManager not available for NEP-413 signing');
    }

    const signingContext = validateAndPrepareNep413SigningContext({
      nearAccountId,
      resolvedSignerMode,
      relayerUrl,
      rpId: ctx.touchIdPrompt.getRpId(),
      localKeyMaterial,
      thresholdKeyMaterial,
    });

    // Extension local signing should never prompt TouchID per-request.
    // The extension signer is locked/unlocked at login/logout (warm session owned by the VRF worker).
    const signingAuthMode =
      (!signingContext.threshold && isChromeExtensionContext())
        ? 'warmSession'
        : (signingContext.threshold && !signingContext.threshold.thresholdSessionJwt ? 'webauthn' : undefined);

    const confirmation = await vrfWorkerManager.confirmAndPrepareSigningSession({
      ctx,
      sessionId,
      kind: 'nep413',
      ...(signingAuthMode ? { signingAuthMode } : {}),
      nearAccountId,
      message: payload.message,
      recipient: payload.recipient,
      title: payload.title,
      body: payload.body,
      confirmationConfigOverride: payload.confirmationConfigOverride,
      contractId: payload.contractId,
      nearRpcUrl: payload.nearRpcUrl,
    });

    let { vrfChallenge, credential } = extractSigningEvidenceFromConfirmation(confirmation);

    const requestPayload = {
      signerMode: signingContext.resolvedSignerMode,
      message: payload.message,
      recipient: payload.recipient,
      nonce: payload.nonce,
      state: payload.state || undefined,
      accountId: nearAccountId,
      nearPublicKey: signingContext.nearPublicKey,
      decryption: signingContext.decryption,
      threshold: signingContext.threshold
        ? {
          relayerUrl: signingContext.threshold.relayerUrl,
          relayerKeyId: signingContext.threshold.thresholdKeyMaterial.relayerKeyId,
          clientParticipantId: signingContext.threshold.thresholdKeyMaterial.participants.find((p) => p.role === 'client')?.id,
          relayerParticipantId: signingContext.threshold.thresholdKeyMaterial.participants.find((p) => p.role === 'relayer')?.id,
          participantIds: signingContext.threshold.thresholdKeyMaterial.participants.map((p) => p.id),
          thresholdSessionKind: 'jwt' as const,
          thresholdSessionJwt: signingContext.threshold.thresholdSessionJwt,
        }
        : undefined,
      vrfChallenge,
      credential,
    };

    if (!signingContext.threshold) {
      const response = await ctx.sendMessage<typeof WorkerRequestType.SignNep413Message>({
        sessionId,
        message: { type: WorkerRequestType.SignNep413Message, payload: requestPayload },
      });
      const okResponse = requireOkSignNep413MessageResponse(response);

      return {
        success: true,
        accountId: okResponse.payload.accountId,
        publicKey: okResponse.payload.publicKey,
        signature: okResponse.payload.signature,
        state: okResponse.payload.state || undefined,
      };
    }

    let okResponse: WorkerSuccessResponse<typeof WorkerRequestType.SignNep413Message>;
    try {
      const response = await ctx.sendMessage<typeof WorkerRequestType.SignNep413Message>({
        sessionId,
        message: { type: WorkerRequestType.SignNep413Message, payload: requestPayload },
      });
      okResponse = requireOkSignNep413MessageResponse(response);
    } catch (e: unknown) {
      const err = e instanceof Error ? e : new Error(String(e));
      if (!isThresholdSessionAuthUnavailableError(err)) throw err;

      clearCachedThresholdEd25519AuthSession(signingContext.threshold.thresholdSessionCacheKey);
      signingContext.threshold.thresholdSessionJwt = undefined;
      requestPayload.threshold!.thresholdSessionJwt = undefined;

      if (!credential || !vrfChallenge) {
        const refreshed = await vrfWorkerManager.confirmAndPrepareSigningSession({
          ctx,
          sessionId,
          kind: 'nep413',
          signingAuthMode: 'webauthn',
          nearAccountId,
          message: payload.message,
          recipient: payload.recipient,
          title: payload.title,
          body: payload.body,
          confirmationConfigOverride: payload.confirmationConfigOverride,
          contractId: payload.contractId,
          nearRpcUrl: payload.nearRpcUrl,
        });

        ({ vrfChallenge, credential } = extractSigningEvidenceFromConfirmation(refreshed));

        requestPayload.vrfChallenge = vrfChallenge;
        requestPayload.credential = credential;
      }

      const response = await ctx.sendMessage<typeof WorkerRequestType.SignNep413Message>({
        sessionId,
        message: { type: WorkerRequestType.SignNep413Message, payload: requestPayload },
      });
      okResponse = requireOkSignNep413MessageResponse(response);
    }

    return {
      success: true,
      accountId: okResponse.payload.accountId,
      publicKey: okResponse.payload.publicKey,
      signature: okResponse.payload.signature,
      state: okResponse.payload.state || undefined,
    };
  } catch (error: unknown) {
    // eslint-disable-next-line no-console
    console.error('SignerWorkerManager: NEP-413 signing error:', error);
    return {
      success: false,
      accountId: '',
      publicKey: '',
      signature: '',
      error: (error && typeof (error as { message?: unknown }).message === 'string')
        ? (error as { message: string }).message
        : 'Unknown error'
    };
  }
}

type ThresholdNep413SigningContext = {
  resolvedSignerMode: 'threshold-signer';
  nearPublicKey: string;
  decryption: { encryptedPrivateKeyData: string; encryptedPrivateKeyChacha20NonceB64u: string };
  threshold: {
    relayerUrl: string;
    thresholdKeyMaterial: ThresholdEd25519_2p_V1Material;
    thresholdSessionCacheKey: string;
    thresholdSessionJwt: string | undefined;
  };
};

type LocalNep413SigningContext = {
  resolvedSignerMode: 'local-signer';
  nearPublicKey: string;
  decryption: { encryptedPrivateKeyData: string; encryptedPrivateKeyChacha20NonceB64u: string };
  threshold: null;
};

type Nep413SigningContext = ThresholdNep413SigningContext | LocalNep413SigningContext;

function validateAndPrepareNep413SigningContext(args: {
  nearAccountId: string;
  resolvedSignerMode: SignerMode['mode'];
  relayerUrl: string;
  rpId: string | null;
  localKeyMaterial: LocalNearSkV3Material;
  thresholdKeyMaterial: ThresholdEd25519_2p_V1Material | null;
}): Nep413SigningContext {
  const localPublicKey = String(args.localKeyMaterial.publicKey || '').trim();
  if (!localPublicKey) {
    throw new Error(`Missing local signing public key for ${args.nearAccountId}`);
  }

  if (args.resolvedSignerMode !== 'threshold-signer') {
    return {
      resolvedSignerMode: 'local-signer',
      nearPublicKey: localPublicKey,
      decryption: {
        encryptedPrivateKeyData: args.localKeyMaterial.encryptedSk,
        encryptedPrivateKeyChacha20NonceB64u: args.localKeyMaterial.chacha20NonceB64u,
      },
      threshold: null,
    };
  }

  const thresholdKeyMaterial = args.thresholdKeyMaterial;
  if (!thresholdKeyMaterial) {
    throw new Error(`Missing threshold key material for ${args.nearAccountId}`);
  }

  const thresholdPublicKey = String(thresholdKeyMaterial.publicKey || '').trim();
  if (!thresholdPublicKey) {
    throw new Error(`Missing threshold signing public key for ${args.nearAccountId}`);
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
  if (!participantIds || participantIds.length < 2) {
    throw new Error(
      `Invalid threshold signing participantIds (expected >=2 participants, got [${(participantIds || []).join(',')}])`
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
    nearPublicKey: thresholdPublicKey,
    decryption: {
      encryptedPrivateKeyData: '',
      encryptedPrivateKeyChacha20NonceB64u: '',
    },
    threshold: {
      relayerUrl,
      thresholdKeyMaterial,
      thresholdSessionCacheKey,
      thresholdSessionJwt: getCachedThresholdEd25519AuthSessionJwt(thresholdSessionCacheKey),
    },
  };
}

function extractSigningEvidenceFromConfirmation(confirmation: {
  vrfChallenge?: VRFChallenge;
  credential?: unknown;
}): {
  vrfChallenge: VRFChallenge | undefined;
  credential: string | undefined;
} {
  const credentialForRelay: WebAuthnAuthenticationCredential | undefined = confirmation.credential
    ? removePrfOutputGuard(confirmation.credential as WebAuthnAuthenticationCredential)
    : undefined;

  return {
    vrfChallenge: confirmation.vrfChallenge,
    credential: credentialForRelay ? JSON.stringify(credentialForRelay) : undefined,
  };
}

function requireOkSignNep413MessageResponse(
  response: Nep413SigningResponse,
): WorkerSuccessResponse<typeof WorkerRequestType.SignNep413Message> {
  if (!isSignNep413MessageSuccess(response)) {
    if (isWorkerError(response)) {
      throw new Error(response.payload.error || 'NEP-413 signing failed');
    }
    throw new Error('NEP-413 signing failed');
  }
  return response;
}
