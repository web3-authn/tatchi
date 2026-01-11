import type { VrfWorkerManagerContext } from '../../';
import type { VRFChallenge } from '../../../../types';
import type { SerializableCredential } from '../types';
import type { ClientAuthenticatorData } from '../../../../IndexedDBManager';
import { collectAuthenticationCredentialForVrfChallenge } from '../../../collectAuthenticationCredentialForVrfChallenge';

export async function collectAuthenticationCredentialWithPRF({
  ctx,
  nearAccountId,
  vrfChallenge,
  onBeforePrompt,
  includeSecondPrfOutput = false,
}: {
  ctx: VrfWorkerManagerContext;
  nearAccountId: string;
  vrfChallenge: VRFChallenge;
  onBeforePrompt?: (info: {
    authenticators: ClientAuthenticatorData[];
    authenticatorsForPrompt: ClientAuthenticatorData[];
    vrfChallenge: VRFChallenge;
  }) => void;
  /**
   * When true, include PRF.second in the serialized credential.
   * Use only for explicit recovery/export flows (higher-friction paths).
   */
  includeSecondPrfOutput?: boolean;
}): Promise<SerializableCredential> {
  return collectAuthenticationCredentialForVrfChallenge({
    indexedDB: ctx.indexedDB,
    touchIdPrompt: ctx.touchIdPrompt,
    nearAccountId,
    vrfChallenge,
    includeSecondPrfOutput,
    onBeforePrompt,
  });
}
