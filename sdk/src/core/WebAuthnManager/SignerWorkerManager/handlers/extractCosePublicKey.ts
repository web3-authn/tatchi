
import { WorkerRequestType, isExtractCosePublicKeySuccess } from '../../../types/signer-worker';
import { SignerWorkerManagerContext } from '..';


/**
 * Extract COSE public key from WebAuthn attestation object
 * Simple operation that doesn't require TouchID or progress updates
 */
export async function extractCosePublicKey({ ctx, attestationObjectBase64url }: {
  ctx: SignerWorkerManagerContext;
  attestationObjectBase64url: string;
}): Promise<Uint8Array> {
  try {
    const response = await ctx.sendMessage<WorkerRequestType.ExtractCosePublicKey>({
      message: {
        type: WorkerRequestType.ExtractCosePublicKey,
        payload: {
          attestationObjectBase64url
        }
      }
    });

    if (isExtractCosePublicKeySuccess(response)) {
      return response.payload.cosePublicKeyBytes;
    } else {
      throw new Error('COSE public key extraction failed in WASM worker');
    }
  } catch (error: unknown) {
    throw error;
  }
}
