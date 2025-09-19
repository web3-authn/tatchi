
import { SIGNER_WORKER_MANAGER_CONFIG } from "../../../../config";
import {
  WorkerRequestType,
  isWorkerError,
  isCheckCanRegisterUserSuccess,
} from '../../../types/signer-worker';
import { toEnumUserVerificationPolicy } from '../../../types/authenticatorOptions';
import { serializeRegistrationCredentialWithPRF } from '../../credentialsHelpers';
import { VRFChallenge } from '../../../types/vrf-worker';
import type { onProgressEvents } from '../../../types/passkeyManager';
import type { AuthenticatorOptions } from '../../../types/authenticatorOptions';
import { SignerWorkerManagerContext } from '..';
import type { WebAuthnRegistrationCredential } from '../../../types/webauthn';
import { errorMessage } from '@/utils/errors';


export async function checkCanRegisterUser({
  ctx,
  vrfChallenge,
  credential,
  contractId,
  nearRpcUrl,
  authenticatorOptions,
  onEvent,
}: {
  ctx: SignerWorkerManagerContext,
  vrfChallenge: VRFChallenge,
  credential: WebAuthnRegistrationCredential,
  contractId: string;
  nearRpcUrl: string;
  authenticatorOptions?: AuthenticatorOptions; // Authenticator options for registration check
  onEvent?: (update: onProgressEvents) => void;
}): Promise<{
  success: boolean;
  verified?: boolean;
  registrationInfo?: {
    credentialId: Uint8Array;
    credentialPublicKey: Uint8Array;
    userId: string;
    vrfPublicKey: Uint8Array | undefined;
  };
  logs?: string[];
  signedTransactionBorsh?: number[];
  error?: string;
}> {
  try {
    // Accept either a real PublicKeyCredential or an already-serialized credential
    const isSerialized = (cred: unknown): cred is WebAuthnRegistrationCredential => {
      return !!cred && typeof cred === 'object'
        && typeof (cred as WebAuthnRegistrationCredential).response?.clientDataJSON === 'string'
        && typeof (cred as WebAuthnRegistrationCredential).response?.attestationObject === 'string';
    };

    const serializedCredential: WebAuthnRegistrationCredential = isSerialized(credential)
      ? credential
      : serializeRegistrationCredentialWithPRF({ credential: credential });

    const response = await ctx.sendMessage<WorkerRequestType.CheckCanRegisterUser>({
      message: {
        type: WorkerRequestType.CheckCanRegisterUser,
        payload: {
          vrfChallenge: {
            vrfInput: vrfChallenge.vrfInput,
            vrfOutput: vrfChallenge.vrfOutput,
            vrfProof: vrfChallenge.vrfProof,
            vrfPublicKey: vrfChallenge.vrfPublicKey,
            userId: vrfChallenge.userId,
            rpId: vrfChallenge.rpId,
            blockHeight: vrfChallenge.blockHeight,
            blockHash: vrfChallenge.blockHash,
          },
          credential: serializedCredential,
          contractId,
          nearRpcUrl,
          authenticatorOptions: authenticatorOptions ? {
            userVerification: toEnumUserVerificationPolicy(authenticatorOptions.userVerification),
            originPolicy: authenticatorOptions.originPolicy,
          } : undefined
        }
      },
      onEvent,
      timeoutMs: SIGNER_WORKER_MANAGER_CONFIG.TIMEOUTS.TRANSACTION
    });

    if (!isCheckCanRegisterUserSuccess(response)) {
      const errorDetails = isWorkerError(response) ? response.payload.error : 'Unknown worker error';
      throw new Error(`Registration check failed: ${errorDetails}`);
    }

    const wasmResult = response.payload;
    return {
      success: true,
      verified: wasmResult.verified,
      registrationInfo: wasmResult.registrationInfo,
      logs: wasmResult.logs,
      error: wasmResult.error,
    };
  } catch (error: unknown) {
    // Preserve the detailed error message instead of converting to generic error
    console.error('checkCanRegisterUser failed:', error);
    return {
      success: false,
      verified: false,
      error: errorMessage(error) || 'Unknown error occurred',
      logs: [],
    };
  }
}
