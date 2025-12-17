import type { VrfWorkerManagerContext } from '../../';
import type { VRFChallenge } from '../../../../types';
import type { SerializableCredential } from '../types';
import { serializeAuthenticationCredentialWithPRF } from '../../../credentialsHelpers';
import { toAccountId } from '../../../../types/accountIds';
import { authenticatorsToAllowCredentials } from '../../../touchIdPrompt';
import type { ClientAuthenticatorData } from '../../../../IndexedDBManager';

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

  const authenticators = await ctx.indexedDB.clientDB.getAuthenticatorsByUser(toAccountId(nearAccountId));
  const { authenticatorsForPrompt, wrongPasskeyError } = await ctx.indexedDB.clientDB.ensureCurrentPasskey(
    toAccountId(nearAccountId),
    authenticators,
  );
  if (wrongPasskeyError) {
    throw new Error(wrongPasskeyError);
  }

  onBeforePrompt?.({ authenticators, authenticatorsForPrompt, vrfChallenge });

  const credential = await ctx.touchIdPrompt.getAuthenticationCredentialsInternal({
    nearAccountId,
    challenge: vrfChallenge,
    allowCredentials: authenticatorsToAllowCredentials(authenticatorsForPrompt),
  });

  const serialized = serializeAuthenticationCredentialWithPRF({
    credential,
    firstPrfOutput: true,
    secondPrfOutput: includeSecondPrfOutput,
  });

  // Verify that the chosen credential matches the "current" passkey device, when applicable.
  const { wrongPasskeyError: wrongSelectedCredentialError } = await ctx.indexedDB.clientDB.ensureCurrentPasskey(
    toAccountId(nearAccountId),
    authenticators,
    serialized.rawId,
  );
  if (wrongSelectedCredentialError) {
    throw new Error(wrongSelectedCredentialError);
  }

  return serialized;
}

