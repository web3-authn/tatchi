import type { ConfirmationConfig } from '../../../types/signer-worker';
import type { RegistrationCredentialConfirmationPayload } from '../../SignerWorkerManager/handlers/validation';
import { requestRegistrationCredentialConfirmation as requestRegistrationCredentialConfirmationFlow } from '../confirmTxFlow/flows/requestRegistrationCredentialConfirmation';
import type { VrfWorkerManagerHandlerContext } from './types';

export async function requestRegistrationCredentialConfirmation(
  ctx: VrfWorkerManagerHandlerContext,
  params: {
    nearAccountId: string;
    deviceNumber: number;
    confirmationConfigOverride?: Partial<ConfirmationConfig>;
    contractId: string;
    nearRpcUrl: string;
  }
): Promise<RegistrationCredentialConfirmationPayload> {
  const hostCtx = ctx.getContext();
  const decision = await requestRegistrationCredentialConfirmationFlow({
    ctx: hostCtx,
    ...params,
  });

  if (!decision.confirmed) {
    throw new Error(decision.error || 'User rejected registration request');
  }
  if (!decision.credential) {
    throw new Error('Missing credential from registration confirmation');
  }
  if (!decision.vrfChallenge) {
    throw new Error('Missing vrfChallenge from registration confirmation');
  }
  if (!decision.transactionContext) {
    throw new Error('Missing transactionContext from registration confirmation');
  }

  return decision;
}

