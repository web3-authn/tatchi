import type { NearClient } from '../../NearClient';
import { IndexedDBManager } from '../../IndexedDBManager';
import { toAccountId, type AccountId } from '../../types/accountIds';
import type { VRFChallenge, VRFInputData } from '../../types/vrf-worker';
import { thresholdEd25519Keygen } from '../../rpcCalls';
import { computeThresholdEd25519KeygenIntentDigest } from '../../digests/intentDigest';
import { ensureEd25519Prefix } from '../../../utils/validation';
import { authenticatorsToAllowCredentials, type TouchIdPrompt } from '../touchIdPrompt';

type DeriveThresholdClientShareResult = {
  success: boolean;
  clientVerifyingShareB64u: string;
  wrapKeySalt: string;
  error?: string;
};

export type EnrollThresholdEd25519KeyHandlerContext = {
  nearClient: NearClient;
  vrfWorkerManager: {
    generateVrfChallengeOnce: (inputData: VRFInputData) => Promise<VRFChallenge>;
  };
  signerWorkerManager: {
    deriveThresholdEd25519ClientVerifyingShare: (args: {
      sessionId: string;
      nearAccountId: AccountId;
    }) => Promise<DeriveThresholdClientShareResult>;
  };
  touchIdPrompt: Pick<TouchIdPrompt, 'getRpId' | 'getAuthenticationCredentialsSerialized'>;
  relayerUrl: string;
};

/**
 * Threshold keygen helper (2-of-2):
 * - derive deterministic client verifying share from WrapKeySeed (via signer worker session)
 * - run `/threshold-ed25519/keygen` to fetch relayer share + group public key
 */
export async function enrollThresholdEd25519KeyHandler(
  ctx: EnrollThresholdEd25519KeyHandlerContext,
  args: {
    sessionId: string;
    nearAccountId: AccountId | string;
  }
): Promise<{
  success: boolean;
  publicKey: string;
  clientParticipantId?: number;
  relayerParticipantId?: number;
  participantIds?: number[];
  clientVerifyingShareB64u: string;
  relayerKeyId: string;
  relayerVerifyingShareB64u: string;
  wrapKeySalt: string;
  error?: string;
}> {
  const nearAccountId = toAccountId(args.nearAccountId);
  const sessionId = String(args.sessionId || '').trim();
  const relayerUrl = String(ctx.relayerUrl || '').trim();

  try {
    if (!sessionId) throw new Error('Missing sessionId');
    if (!relayerUrl) throw new Error('Missing relayer url (configs.relayer.url)');

    const derived = await ctx.signerWorkerManager.deriveThresholdEd25519ClientVerifyingShare({
      sessionId,
      nearAccountId,
    });
    if (!derived.success) {
      throw new Error(derived.error || 'Failed to derive threshold client verifying share');
    }

    const rpId = ctx.touchIdPrompt.getRpId();
    if (!rpId) throw new Error('Missing rpId for WebAuthn VRF challenge');

    // Keygen intent digest must bind the client verifying share; compute it before generating the VRF challenge.
    const keygenIntentDigestB64u = await computeThresholdEd25519KeygenIntentDigest({
      nearAccountId,
      rpId,
      clientVerifyingShareB64u: derived.clientVerifyingShareB64u,
    });

    // Fetch a fresh block height/hash for VRF freshness validation.
    const block = await ctx.nearClient.viewBlock({ finality: 'final' } as any);
    const blockHeight = String((block as any)?.header?.height ?? '');
    const blockHash = String((block as any)?.header?.hash ?? '');
    if (!blockHeight || !blockHash) throw new Error('Failed to fetch NEAR block context for keygen VRF challenge');

    const vrfChallenge = await ctx.vrfWorkerManager.generateVrfChallengeOnce({
      userId: nearAccountId,
      rpId,
      blockHeight,
      blockHash,
      intentDigest: keygenIntentDigestB64u,
    });

    // Collect a WebAuthn authentication credential with the VRF output as challenge.
    const authenticators = await IndexedDBManager.clientDB.getAuthenticatorsByUser(nearAccountId);
    const { authenticatorsForPrompt, wrongPasskeyError } = await IndexedDBManager.clientDB.ensureCurrentPasskey(
      toAccountId(nearAccountId),
      authenticators,
    );
    if (wrongPasskeyError) {
      throw new Error(wrongPasskeyError);
    }
    if (!authenticatorsForPrompt.length) {
      throw new Error(`No passkey authenticators found for account ${nearAccountId}`);
    }
    if (authenticatorsForPrompt.length === 1) {
      const expectedVrfPublicKey = authenticatorsForPrompt[0]?.vrfPublicKey;
      if (expectedVrfPublicKey && vrfChallenge.vrfPublicKey && expectedVrfPublicKey !== vrfChallenge.vrfPublicKey) {
        throw new Error('VRF session is bound to a different passkey than the current device. Please log in again and retry.');
      }
    }

    const webauthnAuthentication = await ctx.touchIdPrompt.getAuthenticationCredentialsSerialized({
      nearAccountId,
      challenge: vrfChallenge,
      allowCredentials: authenticatorsToAllowCredentials(authenticatorsForPrompt),
    });

    const keygen = await thresholdEd25519Keygen(relayerUrl, vrfChallenge, webauthnAuthentication, {
      clientVerifyingShareB64u: derived.clientVerifyingShareB64u,
      nearAccountId,
    });
    if (!keygen.ok) {
      throw new Error(keygen.error || keygen.message || keygen.code || 'Threshold keygen failed');
    }

    const publicKeyRaw = keygen.publicKey;
    const relayerKeyId = keygen.relayerKeyId;
    const relayerVerifyingShareB64u = keygen.relayerVerifyingShareB64u;
    if (!publicKeyRaw) throw new Error('Threshold keygen returned empty publicKey');
    if (!relayerKeyId) throw new Error('Threshold keygen returned empty relayerKeyId');
    if (!relayerVerifyingShareB64u) throw new Error('Threshold keygen returned empty relayerVerifyingShareB64u');

    const publicKey = ensureEd25519Prefix(publicKeyRaw);
    if (!publicKey) throw new Error('Threshold keygen returned empty publicKey');

    const clientParticipantId = typeof keygen.clientParticipantId === 'number' ? keygen.clientParticipantId : undefined;
    const relayerParticipantId = typeof keygen.relayerParticipantId === 'number' ? keygen.relayerParticipantId : undefined;

    return {
      success: true,
      publicKey,
      clientParticipantId,
      relayerParticipantId,
      participantIds: Array.isArray(keygen.participantIds) ? keygen.participantIds : undefined,
      clientVerifyingShareB64u: derived.clientVerifyingShareB64u,
      relayerKeyId,
      relayerVerifyingShareB64u,
      wrapKeySalt: derived.wrapKeySalt,
    };
  } catch (error: unknown) {
    const message = String((error as { message?: unknown })?.message ?? error);
    return { success: false, publicKey: '', clientVerifyingShareB64u: '', relayerKeyId: '', relayerVerifyingShareB64u: '', wrapKeySalt: '', error: message };
  }
}
