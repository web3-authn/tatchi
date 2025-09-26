import { WorkerRequestType, isWorkerError, isWorkerSuccess, type ConfirmationConfig } from '../../../types/signer-worker';
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
  const res = await ctx.sendMessage<WorkerRequestType.RegistrationCredentialConfirmation>({
    message: {
      type: WorkerRequestType.RegistrationCredentialConfirmation,
      payload: {
        nearAccountId,
        deviceNumber,
        contractId,
        nearRpcUrl,
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
