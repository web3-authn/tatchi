import type { AccountId } from '../../../types/accountIds';
import type { EncryptedVRFKeypair, VRFWorkerMessage, WasmDevice2RegistrationSessionRequest } from '../../../types/vrf-worker';
import type { TransactionContext } from '../../../types/rpc';
import type { VRFChallenge } from '../../../types/vrf-worker';
import type { WebAuthnRegistrationCredential } from '../../../types/webauthn';
import type { VrfWorkerManagerHandlerContext } from './types';

/**
 * Kick off the SecureConfirm flow for Device2 registration ("link device") and return the confirmed result.
 *
 * This is a bundled orchestration that can:
 * - collect a registration credential (PRF-capable),
 * - derive a deterministic VRF keypair for the new device,
 * - and return the data needed for storage + subsequent signing steps (tx context, VRF challenge, etc.).
 */
export async function confirmAndDeriveDevice2RegistrationSession(
  ctx: VrfWorkerManagerHandlerContext,
  params: {
    sessionId: string;
    nearAccountId: AccountId;
    deviceNumber: number;
    contractId: string;
    nearRpcUrl: string;
    authenticatorOptions?: object;
    wrapKeySalt?: string;
  }
): Promise<{
  confirmed: boolean;
  sessionId: string;
  credential: WebAuthnRegistrationCredential;
  vrfChallenge: VRFChallenge;
  transactionContext: TransactionContext;
  wrapKeySalt: string;
  requestId: string;
  intentDigest: string;
  deterministicVrfPublicKey: string;
  encryptedVrfKeypair: EncryptedVRFKeypair;
  error?: string;
}> {
  await ctx.ensureWorkerReady(true);

  const message: VRFWorkerMessage<WasmDevice2RegistrationSessionRequest> = {
    type: 'DEVICE2_REGISTRATION_SESSION',
    id: ctx.generateMessageId(),
    payload: {
      sessionId: params.sessionId,
      nearAccountId: params.nearAccountId,
      deviceNumber: params.deviceNumber,
      contractId: params.contractId,
      nearRpcUrl: params.nearRpcUrl,
      wrapKeySalt: params.wrapKeySalt || '',
      // No confirmationConfig override for now; can add later if needed
    }
  };

  const response = await ctx.sendMessage<WasmDevice2RegistrationSessionRequest>(message);

  if (!response.success) {
    throw new Error(`Device2 registration session failed: ${response.error}`);
  }

  const data = response.data as any;

  if (!data.confirmed) {
    throw new Error(data.error || 'User rejected Device2 registration');
  }

  if (!data.credential) {
    throw new Error('Missing credential from Device2 registration session');
  }
  if (!data.vrfChallenge) {
    throw new Error('Missing vrfChallenge from Device2 registration session');
  }
  if (!data.transactionContext) {
    throw new Error('Missing transactionContext from Device2 registration session');
  }
  if (!data.wrapKeySalt) {
    throw new Error('Missing wrapKeySalt from Device2 registration session');
  }

  return {
    confirmed: true,
    sessionId: data.sessionId,
    credential: data.credential,
    vrfChallenge: data.vrfChallenge,
    transactionContext: data.transactionContext,
    wrapKeySalt: data.wrapKeySalt,
    requestId: data.requestId,
    intentDigest: data.intentDigest,
    deterministicVrfPublicKey: data.deterministicVrfPublicKey,
    encryptedVrfKeypair: data.encryptedVrfKeypair,
  };
}
