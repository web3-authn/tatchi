import type { ClientAuthenticatorData, UnifiedIndexedDBManager } from '../IndexedDBManager';
import type { AccountId } from '../types/accountIds';
import { toAccountId } from '../types/accountIds';
import type { VRFChallenge } from '../types/vrf-worker';
import { authenticatorsToAllowCredentials } from './touchIdPrompt';
import type { TouchIdPrompt } from './touchIdPrompt';
import type { WebAuthnAuthenticationCredential } from '../types/webauthn';

export async function collectAuthenticationCredentialForVrfChallenge(args: {
  indexedDB: UnifiedIndexedDBManager;
  touchIdPrompt: Pick<TouchIdPrompt, 'getAuthenticationCredentialsSerialized' | 'getAuthenticationCredentialsSerializedDualPrf'>;
  nearAccountId: AccountId | string;
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
}): Promise<WebAuthnAuthenticationCredential> {
  const nearAccountId = toAccountId(args.nearAccountId);

  const authenticators = await args.indexedDB.clientDB.getAuthenticatorsByUser(nearAccountId);
  let authenticatorsForPrompt: ClientAuthenticatorData[] = authenticators;
  if (authenticators.length > 0) {
    ({ authenticatorsForPrompt } = await args.indexedDB.clientDB.ensureCurrentPasskey(
      toAccountId(nearAccountId),
      authenticators,
    ));
  }

  args.onBeforePrompt?.({ authenticators, authenticatorsForPrompt, vrfChallenge: args.vrfChallenge });

  const allowCredentials = authenticatorsToAllowCredentials(authenticatorsForPrompt);
  const serialized = args.includeSecondPrfOutput
    ? await args.touchIdPrompt.getAuthenticationCredentialsSerializedDualPrf({
      nearAccountId,
      challenge: args.vrfChallenge,
      allowCredentials,
    })
    : await args.touchIdPrompt.getAuthenticationCredentialsSerialized({
      nearAccountId,
      challenge: args.vrfChallenge,
      allowCredentials,
    });

  // Verify that the chosen credential matches the "current" passkey device, when applicable.
  if (authenticators.length > 0) {
    const { wrongPasskeyError } = await args.indexedDB.clientDB.ensureCurrentPasskey(
      toAccountId(nearAccountId),
      authenticators,
      serialized.rawId,
    );
    if (wrongPasskeyError) {
      throw new Error(wrongPasskeyError);
    }
  }

  return serialized;
}
