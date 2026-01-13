
import { PASSKEY_MANAGER_DEFAULT_CONFIGS } from "../../../defaultConfigs";
import type { CheckCanRegisterUserResult } from '../../../rpcCalls';
import { checkCanRegisterUserContractCall } from '../../../rpcCalls';
import { serializeRegistrationCredentialWithPRF, removePrfOutputGuard } from '../../credentialsHelpers';
import { VRFChallenge } from '../../../types/vrf-worker';
import { RegistrationPhase, RegistrationStatus, type RegistrationEventStep3 } from '../../../types/sdkSentEvents';
import type { AuthenticatorOptions } from '../../../types/authenticatorOptions';
import { SignerWorkerManagerContext } from '..';
import type { WebAuthnRegistrationCredential } from '../../../types/webauthn';
import { errorMessage } from '@/utils/errors';
import { isObject, isString } from '@/utils/validation';


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
  onEvent?: (update: RegistrationEventStep3) => void;
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

    // Ensure required fields are present; avoid undefined which gets dropped by JSON.stringify in the worker
    const resolvedContractId = contractId || PASSKEY_MANAGER_DEFAULT_CONFIGS.contractId;

    onEvent?.({
      step: 3,
      phase: RegistrationPhase.STEP_3_CONTRACT_PRE_CHECK,
      status: RegistrationStatus.PROGRESS,
      message: 'Running webauthn contract registration checks...',
    });

    // PRF outputs must never be sent over the network. Strip them before
    // calling the contract while preserving the rest of the credential shape.
    const strippedCredential = removePrfOutputGuard<WebAuthnRegistrationCredential>(serializedCredential);

    const result: CheckCanRegisterUserResult = await checkCanRegisterUserContractCall({
      nearClient: ctx.nearClient,
      contractId: resolvedContractId,
      vrfChallenge,
      credential: strippedCredential,
      authenticatorOptions,
    });

    if (!result.success) {
      throw new Error(result.error || 'Registration pre-check RPC failed');
    }

    const wasmResult = {
      verified: result.verified,
      registrationInfo: undefined,
      logs: result.logs,
      error: result.error,
    };

    onEvent?.({
      step: 3,
      phase: RegistrationPhase.STEP_3_CONTRACT_PRE_CHECK,
      status: result.verified ? RegistrationStatus.SUCCESS : RegistrationStatus.ERROR,
      message: result.verified ? 'Registration pre-check succeeded' : (result.error || 'Registration pre-check failed'),
      ...(result.verified ? {} : { error: result.error || 'Registration pre-check failed' }),
    });

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
