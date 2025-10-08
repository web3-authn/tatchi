import { WorkerRequestType, isWorkerError, isWorkerSuccess, type ConfirmationConfig } from '../../../types/signer-worker';
import { PASSKEY_MANAGER_DEFAULT_CONFIGS } from '../../../defaultConfigs';
import type { SignerWorkerManagerContext } from '..';
import { parseAndValidateRegistrationCredentialConfirmationPayload, type RegistrationCredentialConfirmationPayload } from './validation';

export async function requestRegistrationCredentialConfirmation({
  ctx,
  nearAccountId,
  deviceNumber,
  contractId,
  nearRpcUrl,
  confirmationConfig,
}: {
  ctx: SignerWorkerManagerContext,
  nearAccountId: string,
  deviceNumber: number,
  contractId: string,
  nearRpcUrl: string,
  confirmationConfig?: ConfirmationConfig,
}): Promise<RegistrationCredentialConfirmationPayload> {
  // Ensure required fields are present; JSON.stringify drops undefined causing Rust parse failure
  const resolvedContractId = contractId || PASSKEY_MANAGER_DEFAULT_CONFIGS.contractId;
  // Use the first URL if defaults include a failover list
  const resolvedNearRpcUrl = nearRpcUrl || (PASSKEY_MANAGER_DEFAULT_CONFIGS.nearRpcUrl.split(',')[0] || PASSKEY_MANAGER_DEFAULT_CONFIGS.nearRpcUrl);

  const res = await ctx.sendMessage<WorkerRequestType.RegistrationCredentialConfirmation>({
    message: {
      type: WorkerRequestType.RegistrationCredentialConfirmation,
      payload: {
        nearAccountId,
        deviceNumber,
        contractId: resolvedContractId,
        nearRpcUrl: resolvedNearRpcUrl,
        ...(confirmationConfig ? { confirmationConfig } : {}),
      },
    },
  });
  // Handle explicit error/success and validate payload shape
  if (isWorkerError(res)) {
    const errMsg = res.payload?.error || 'Unknown worker error';
    // Provide a typed failure result
    return {
      confirmed: false,
      requestId: '',
      intentDigest: '',
      error: errMsg,
    };
  }

  if (!isWorkerSuccess(res)) {
    // Defensive: unexpected message
    throw new Error('Unexpected worker response');
  }

  return parseAndValidateRegistrationCredentialConfirmationPayload(res.payload as unknown);
}
