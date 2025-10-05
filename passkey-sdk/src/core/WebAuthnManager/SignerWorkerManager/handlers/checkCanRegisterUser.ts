
import { SIGNER_WORKER_MANAGER_CONFIG } from "../../../../config";
import { PASSKEY_MANAGER_DEFAULT_CONFIGS } from "../../../defaultConfigs";
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
import { base64UrlDecode } from '@/utils/encoders';
import { isObject, isString } from '../../../WalletIframe/validation';


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
      if (!isObject(cred)) return false;
      const resp = (cred as { response?: unknown }).response;
      if (!isObject(resp)) return false;
      return isString((resp as { clientDataJSON?: unknown }).clientDataJSON)
        && isString((resp as { attestationObject?: unknown }).attestationObject);
    };

    const serializedCredential: WebAuthnRegistrationCredential = isSerialized(credential)
      ? credential
      : serializeRegistrationCredentialWithPRF({ credential: credential });

    // Debug: inspect clientDataJSON.origin vs VRF rpId to catch origin/rpId mismatches on mobile
    try {
      const cdjBytes = base64UrlDecode(serializedCredential.response.clientDataJSON);
      const cdjStr = new TextDecoder().decode(cdjBytes);
      const cdj = JSON.parse(cdjStr) as { origin?: string; type?: string };
      console.debug('[checkCanRegisterUser] clientDataJSON', {
        origin: cdj?.origin,
        type: cdj?.type,
        vrfRpId: vrfChallenge.rpId,
      });
    } catch {}

    // Ensure required fields are present; avoid undefined which gets dropped by JSON.stringify in the worker
    const resolvedContractId = contractId || PASSKEY_MANAGER_DEFAULT_CONFIGS.webauthnContractId;
    const resolvedNearRpcUrl = nearRpcUrl || (PASSKEY_MANAGER_DEFAULT_CONFIGS.nearRpcUrl.split(',')[0] || PASSKEY_MANAGER_DEFAULT_CONFIGS.nearRpcUrl);

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
          contractId: resolvedContractId,
          nearRpcUrl: resolvedNearRpcUrl,
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
