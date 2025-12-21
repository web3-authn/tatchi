import type { ConfirmationConfig } from '../../../../types/signer-worker';
import { PASSKEY_MANAGER_DEFAULT_CONFIGS } from '../../../../defaultConfigs';
import type { VrfWorkerManagerContext } from '../../';
import { runSecureConfirm } from '../../secureConfirmBridge';
import {
  SecureConfirmationType,
  type RegistrationSummary,
  type SecureConfirmRequest,
} from '../types';
import {
  parseAndValidateRegistrationCredentialConfirmationPayload,
  type RegistrationCredentialConfirmationPayload,
} from '../../../SignerWorkerManager/handlers/validation';

export async function requestRegistrationCredentialConfirmation({
  ctx,
  nearAccountId,
  deviceNumber,
  contractId,
  nearRpcUrl,
  confirmationConfig,
}: {
  ctx: VrfWorkerManagerContext,
  nearAccountId: string,
  deviceNumber: number,
  contractId: string,
  nearRpcUrl: string,
  confirmationConfig?: Partial<ConfirmationConfig>,
}): Promise<RegistrationCredentialConfirmationPayload> {

  // Ensure required fields are present; JSON.stringify drops undefined causing Rust parse failure
  const resolvedContractId = contractId || PASSKEY_MANAGER_DEFAULT_CONFIGS.contractId;
  // Use the first URL if defaults include a failover list
  const resolvedNearRpcUrl = nearRpcUrl
    || (PASSKEY_MANAGER_DEFAULT_CONFIGS.nearRpcUrl.split(',')[0] || PASSKEY_MANAGER_DEFAULT_CONFIGS.nearRpcUrl);

  const requestId = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
    ? crypto.randomUUID()
    : `register-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  const request: SecureConfirmRequest<{
    nearAccountId: string;
    deviceNumber: number;
    rpcCall: { contractId: string; nearRpcUrl: string; nearAccountId: string };
  }, RegistrationSummary> = {
    schemaVersion: 2,
    requestId,
    type: SecureConfirmationType.REGISTER_ACCOUNT,
    summary: {
      nearAccountId,
      deviceNumber,
      contractId: resolvedContractId,
    },
    payload: {
      nearAccountId,
      deviceNumber,
      rpcCall: {
        contractId: resolvedContractId,
        nearRpcUrl: resolvedNearRpcUrl,
        nearAccountId,
      },
    },
    confirmationConfig,
    intentDigest: `register:${nearAccountId}:${deviceNumber}`,
  };

  const decision = await runSecureConfirm(ctx, request);

  return parseAndValidateRegistrationCredentialConfirmationPayload({
    confirmed: decision.confirmed,
    requestId,
    intentDigest: decision.intentDigest || '',
    credential: decision.credential,
    vrfChallenge: decision.vrfChallenge,
    transactionContext: decision.transactionContext,
    error: decision.error,
  });
}
