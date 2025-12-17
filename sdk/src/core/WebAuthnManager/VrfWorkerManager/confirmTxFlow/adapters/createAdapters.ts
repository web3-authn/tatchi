import type { VrfWorkerManagerContext } from '../../';
import type { ConfirmTxFlowAdapters } from './interfaces';
import { fetchNearContext, releaseReservedNonces } from './near';
import { maybeRefreshVrfChallenge } from './vrf';
import { collectAuthenticationCredentialWithPRF } from './webauthn';
import { closeModalSafely, renderConfirmUI } from './ui';

function getVrfWorkerManager(ctx: VrfWorkerManagerContext) {
  const vrfWorkerManager = ctx.vrfWorkerManager;
  if (!vrfWorkerManager) {
    throw new Error('VrfWorkerManager not available');
  }
  return vrfWorkerManager;
}

export function createConfirmTxFlowAdapters(ctx: VrfWorkerManagerContext): ConfirmTxFlowAdapters {
  return {
    near: {
      fetchNearContext: (opts) => fetchNearContext(ctx, opts),
      releaseReservedNonces: (nonces) => releaseReservedNonces(ctx, nonces),
    },
    vrf: {
      getRpId: () => ctx.touchIdPrompt.getRpId(),
      maybeRefreshVrfChallenge: (request, nearAccountId) => maybeRefreshVrfChallenge(ctx, request, nearAccountId),
      generateVrfKeypairBootstrap: (args) => getVrfWorkerManager(ctx).generateVrfKeypairBootstrap(args),
      generateVrfChallengeForSession: (inputData, sessionId) => getVrfWorkerManager(ctx).generateVrfChallengeForSession(inputData, sessionId),
      mintSessionKeysAndSendToSigner: (args) => getVrfWorkerManager(ctx).mintSessionKeysAndSendToSigner(args),
      dispenseSessionKey: (args) => getVrfWorkerManager(ctx).dispenseSessionKey(args),
      prepareDecryptSession: (args) => getVrfWorkerManager(ctx).prepareDecryptSession(args),
      requestRegistrationCredentialConfirmation: (args) => getVrfWorkerManager(ctx).requestRegistrationCredentialConfirmation(args),
      confirmAndDeriveDevice2RegistrationSession: (args) => getVrfWorkerManager(ctx).confirmAndDeriveDevice2RegistrationSession(args),
      checkVrfStatus: () => getVrfWorkerManager(ctx).checkVrfStatus(),
    },
    webauthn: {
      collectAuthenticationCredentialWithPRF: (args) => collectAuthenticationCredentialWithPRF({ ctx, ...args }),
      createRegistrationCredential: (args) => ctx.touchIdPrompt.generateRegistrationCredentialsInternal(args),
    },
    ui: {
      renderConfirmUI: (args) => renderConfirmUI({ ctx, ...args }),
      closeModalSafely,
    },
  };
}

