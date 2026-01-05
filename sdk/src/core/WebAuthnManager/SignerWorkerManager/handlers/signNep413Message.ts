
import { type SignerMode, WorkerRequestType, isSignNep413MessageSuccess } from '../../../types/signer-worker';
import type { ConfirmationConfig } from '../../../types/signer-worker';
import { getLastLoggedInDeviceNumber } from '../getDeviceNumber';
import { SignerWorkerManagerContext } from '..';
import { isObject } from '../../../WalletIframe/validation';
import { generateSessionId } from '../sessionHandshake.js';
import { resolveSignerModeForThresholdSigning } from '../../../threshold/thresholdEd25519RelayerHealth';

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
	    relayerUrl?: string;
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
    const requestedSignerMode = payload.signerMode;
    const relayerUrl = String(payload.relayerUrl || '').trim();
    if (!requestedSignerMode) {
      throw new Error("Missing signerMode; must be explicitly set to 'local-signer' or 'threshold-signer'");
    }

    const deviceNumber = await getLastLoggedInDeviceNumber(payload.accountId, ctx.indexedDB.clientDB);
    const [localKeyMaterial, thresholdKeyMaterial] = await Promise.all([
      ctx.indexedDB.nearKeysDB.getLocalKeyMaterial(payload.accountId, deviceNumber),
      ctx.indexedDB.nearKeysDB.getThresholdKeyMaterial(payload.accountId, deviceNumber),
    ]);
    if (!localKeyMaterial) {
      throw new Error(`No local key material found for account: ${payload.accountId}`);
    }

	    const resolvedSignerMode = await resolveSignerModeForThresholdSigning({
	      nearAccountId: payload.accountId,
	      signerMode: requestedSignerMode,
	      relayerUrl,
	      hasThresholdKeyMaterial: !!thresholdKeyMaterial,
	    });
    const keyMaterial = resolvedSignerMode === 'threshold-signer'
      ? thresholdKeyMaterial!
      : localKeyMaterial;

    // Expect caller (SignerWorkerManager) to reserve a session and wire ports; just use provided sessionId
    const sessionId = payload.sessionId ?? generateSessionId();

    if (!ctx.vrfWorkerManager) {
      throw new Error('VrfWorkerManager not available for NEP-413 signing');
    }

    const confirmation = await ctx.vrfWorkerManager.confirmAndPrepareSigningSession({
      ctx,
      sessionId,
      kind: 'nep413',
      nearAccountId: payload.accountId,
      message: payload.message,
      recipient: payload.recipient,
      title: payload.title,
      body: payload.body,
      confirmationConfigOverride: payload.confirmationConfigOverride,
      contractId: payload.contractId,
      nearRpcUrl: payload.nearRpcUrl,
    });

    const vrfChallenge = confirmation.vrfChallenge;
    // Never forward PRF outputs to the relayer; strip extension results.
    const credential = confirmation.credential
      ? JSON.stringify({
        ...(confirmation.credential as any),
        authenticatorAttachment: (confirmation.credential as any).authenticatorAttachment ?? null,
        response: {
          ...((confirmation.credential as any).response || {}),
          userHandle: (confirmation.credential as any)?.response?.userHandle ?? null,
        },
        clientExtensionResults: null,
      })
      : undefined;

    const { decryption, threshold } = await (async (): Promise<{
      decryption: { encryptedPrivateKeyData: string; encryptedPrivateKeyChacha20NonceB64u: string };
      threshold?: { relayerUrl: string; relayerKeyId: string };
    }> => {
      if (resolvedSignerMode === 'local-signer') {
        return {
          decryption: {
            encryptedPrivateKeyData: localKeyMaterial.encryptedSk,
            encryptedPrivateKeyChacha20NonceB64u: localKeyMaterial.chacha20NonceB64u,
          },
        };
      }

      // threshold-signer
      if (!thresholdKeyMaterial) throw new Error(`Missing threshold key material for ${payload.accountId}`);
      if (!relayerUrl) {
        throw new Error('Missing payload.relayerUrl (required for signerMode=threshold-signer)');
      }
      if (!confirmation.credential || !vrfChallenge) {
        throw new Error('Missing WebAuthn credential or VRF challenge for threshold-signer authorization');
      }
      return {
        // threshold signer does not require an encrypted local secret key
        decryption: { encryptedPrivateKeyData: '', encryptedPrivateKeyChacha20NonceB64u: '' },
        threshold: {
          relayerUrl,
          relayerKeyId: thresholdKeyMaterial.relayerKeyId,
        },
      };
    })();

    const response = await ctx.sendMessage<WorkerRequestType.SignNep413Message>({
      sessionId,
      message: {
        type: WorkerRequestType.SignNep413Message,
        payload: {
          signerMode: resolvedSignerMode,
          sessionId,
          message: payload.message,
          recipient: payload.recipient,
          nonce: payload.nonce,
          state: payload.state || undefined,
          accountId: payload.accountId,
          nearPublicKey: keyMaterial.publicKey,
          decryption,
          threshold,
          vrfChallenge,
          credential,
        }
      },
    });

    if (!isSignNep413MessageSuccess(response)) {
      console.error('SignerWorkerManager: NEP-413 signing failed:', response);
      const payloadError = isObject(response?.payload) && (response as any)?.payload?.error;
      throw new Error(payloadError || 'NEP-413 signing failed');
    }

    return {
      success: true,
      accountId: response.payload.accountId,
      publicKey: response.payload.publicKey,
      signature: response.payload.signature,
      state: response.payload.state || undefined
    };

  } catch (error: unknown) {
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
