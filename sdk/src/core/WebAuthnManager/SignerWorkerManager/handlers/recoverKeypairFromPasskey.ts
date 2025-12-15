import {
  WorkerRequestType,  // from wasm worker
  isRecoverKeypairFromPasskeySuccess,
} from '../../../types/signer-worker';
import type { WebAuthnAuthenticationCredential } from '../../../types/webauthn';
import { SignerWorkerManagerContext } from '..';
import { withSessionId } from './session';

/**
 * Recover keypair from authentication credential for account recovery
 * Uses dual PRF-based Ed25519 key derivation with account-specific HKDF and AES encryption
 */
export async function recoverKeypairFromPasskey({
  ctx,
  credential,
  accountIdHint,
  sessionId,
}: {
  ctx: SignerWorkerManagerContext;
  credential: WebAuthnAuthenticationCredential;
  accountIdHint?: string;
  sessionId: string;
}): Promise<{
  publicKey: string;
  encryptedPrivateKey: string;
  iv: string;
  accountIdHint?: string;
  wrapKeySalt?: string;
}> {
  try {
    console.info('SignerWorkerManager: Starting dual PRF-based keypair recovery from authentication credential');
    // Accept either live PublicKeyCredential or already-serialized auth credential

    // Verify dual PRF outputs are available
    if (
      !credential.clientExtensionResults?.prf?.results?.first ||
      !credential.clientExtensionResults?.prf?.results?.second
    ) {
      throw new Error('Dual PRF outputs required for account recovery - both ChaCha20 and Ed25519 PRF outputs must be available');
    }

    if (!sessionId) throw new Error('Missing sessionId for recovery WrapKeySeed delivery');

    // Use generic sendMessage with specific request type for better type safety
    const response = await ctx.sendMessage<WorkerRequestType.RecoverKeypairFromPasskey>({
      message: {
        type: WorkerRequestType.RecoverKeypairFromPasskey,
        payload: withSessionId(sessionId, {
          credential,
          accountIdHint,
        })
      },
      sessionId,
    });

    // response is RecoverKeypairSuccessResponse | RecoverKeypairFailureResponse
    if (!isRecoverKeypairFromPasskeySuccess(response)) {
      throw new Error('Dual PRF keypair recovery failed in WASM worker');
    }

    return {
      publicKey: response.payload.publicKey,
      encryptedPrivateKey: response.payload.encryptedData,
      iv: response.payload.iv,
      accountIdHint: response.payload.accountIdHint,
      wrapKeySalt: (response.payload as any).wrapKeySalt,
    };

  } catch (error: unknown) {
    console.error('SignerWorkerManager: Dual PRF keypair recovery error:', error);
    throw error;
  }
}
