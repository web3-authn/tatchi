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

  // If we know which device we're targeting (single authenticator), ensure the VRF worker
  // challenge was generated with the same device's VRF keypair. Otherwise contract verification
  // will deterministically fail later with "Contract verification failed".
  if (authenticatorsForPrompt.length === 1) {
    const expectedVrfPublicKey = authenticatorsForPrompt[0]?.vrfPublicKey;
    if (expectedVrfPublicKey && expectedVrfPublicKey !== vrfChallenge.vrfPublicKey) {
      throw new Error('Signing session is using a different passkey/VRF session than the current device. Please log in again and retry.');
    }
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
