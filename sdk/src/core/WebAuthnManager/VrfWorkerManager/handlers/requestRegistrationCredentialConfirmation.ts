import type { ConfirmationConfig } from '../../../types/signer-worker';
import type { RegistrationCredentialConfirmationPayload } from '../../SignerWorkerManager/handlers/validateTransactions';
import { requestRegistrationCredentialConfirmation as requestRegistrationCredentialConfirmationFlow } from '../confirmTxFlow/flows/requestRegistrationCredentialConfirmation';
import type { VrfWorkerManagerHandlerContext } from './types';

/**
 * Kick off the SecureConfirm UI flow for account registration and return the confirmed decision.
 *
 * This is used when the host (main thread) needs a registration credential + VRF challenge + NEAR context,
 * but the UI/confirmation orchestration lives in the VRF worker confirmation flow.
 */
export async function requestRegistrationCredentialConfirmation(
  ctx: VrfWorkerManagerHandlerContext,
  params: {
    nearAccountId: string;
    deviceNumber: number;
    confirmerText?: { title?: string; body?: string };
    confirmationConfigOverride?: Partial<ConfirmationConfig>;
    contractId: string;
    nearRpcUrl: string;
  }
): Promise<RegistrationCredentialConfirmationPayload> {
  const hostCtx = ctx.getContext();
  const decision = await requestRegistrationCredentialConfirmationFlow({
    ctx: hostCtx,
    nearAccountId: params.nearAccountId,
    deviceNumber: params.deviceNumber,
    confirmerText: params.confirmerText,
    contractId: params.contractId,
    nearRpcUrl: params.nearRpcUrl,
    // Flow expects `confirmationConfig` on the request envelope; forward the override.
    confirmationConfig: params.confirmationConfigOverride,
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
