import type { AfterCall, AccountRecoverySSEEvent, EventCallback } from '../types/sdkSentEvents';
import { AccountRecoveryPhase, AccountRecoveryStatus, AccountRecoveryHooksOptions } from '../types/sdkSentEvents';
import type { PasskeyManagerContext } from './index';
import type {
  AccountId,
  StoredAuthenticator,
  VRFChallenge,
  WebAuthnAuthenticationCredential
} from '../types';
import type { EncryptedVRFKeypair, ServerEncryptedVrfKeypair } from '../types/vrf-worker';
import { validateNearAccountId } from '../../utils/validation';
import { parseAccountIdFromUserHandle } from '../WebAuthnManager/userHandle';
import { toAccountId } from '../types/accountIds';
import { createRandomVRFChallenge } from '../types/vrf-worker';
import { WebAuthnManager } from '../WebAuthnManager';
import { IndexedDBManager } from '../IndexedDBManager';
import type { VRFInputData } from '../types/vrf-worker';
import type { OriginPolicyInput, UserVerificationPolicy } from '../types/authenticatorOptions';
import {
  getCredentialIdsContractCall,
  syncAuthenticatorsContractCall
} from '../rpcCalls';

/**
 * Use case:
 * Suppose a user accidentally clears their browser's indexedDB, and deletes their:
 * - encrypted NEAR keypair
 * - encrypted VRF keypair
 * - webauthn authenticator
 * Provide a way for the user to recover their account from onchain authenticator information with their Passkey.
 */

export interface RecoveryResult {
  success: boolean;
  accountId: string;
  publicKey: string;
  message: string;
  error?: string;
  loginState?: {
    isLoggedIn: boolean;
    vrfActive: boolean;
    vrfSessionDuration?: number;
  };
}

export interface AccountLookupResult {
  accountId: string;
  publicKey: string;
  hasAccess: boolean;
}

export interface PasskeyOption {
  credentialId: string;
  accountId: AccountId | null;
  publicKey: string;
  displayName: string;
  credential: WebAuthnAuthenticationCredential | null;
}

// Public-facing passkey option without sensitive credential data
export interface PasskeyOptionWithoutCredential {
  credentialId: string;
  accountId: string | null;
  publicKey: string;
  displayName: string;
}

// Internal selection identifier for secure credential lookup
export interface PasskeySelection {
  credentialId: string;
  accountId: string | null;
}

/**
 * Account recovery flow with credential encapsulation
 *
 * Usage:
 * ```typescript
 * const flow = new AccountRecoveryFlow(context);
 * const options = await flow.discover(); // Get safe display options
 * // ... user selects account in UI ...
 * const result = await flow.recover({ credentialId, accountId }); // Execute recovery
 * ```
 */
export class AccountRecoveryFlow {
  private context: PasskeyManagerContext;
  private options?: AccountRecoveryHooksOptions;
  private availableAccounts?: PasskeyOption[]; // Full options with credentials (private)
  private phase: 'idle' | 'discovering' | 'ready' | 'recovering' | 'complete' | 'error' = 'idle';
  private error?: Error;

  constructor(context: PasskeyManagerContext, options?: AccountRecoveryHooksOptions) {
    this.context = context;
    this.options = options;
  }

  /**
   * Phase 1: Discover available accounts
   * Returns safe display data without exposing credentials to UI
   */
  async discover(accountId: string): Promise<PasskeyOptionWithoutCredential[]> {
    try {
      this.phase = 'discovering';
      const hasValidAccount = !!accountId && validateNearAccountId(accountId).valid;

      if (hasValidAccount) {
        const nearAccountId = toAccountId(accountId);
        // Contract-based lookup; no WebAuthn prompt during discovery
        this.availableAccounts = await getRecoverableAccounts(this.context, nearAccountId);
      } else {
        // Fallback discovery without a typed account: prompt once to select a passkey
        // Then infer the accountId from userHandle (set at registration time)
        const challenge = createRandomVRFChallenge();
        const credential = await this.context.webAuthnManager.getAuthenticationCredentialsSerializedDualPrf({
          // Account is unknown here – salts aren't used downstream for discovery
          nearAccountId: '' as any,
          challenge: challenge as VRFChallenge,
          credentialIds: [],
        });

        // Try to infer accountId from userHandle
        let inferredAccountId: string | null = null;
        try {
          const assertion: any = credential.response as any;
          inferredAccountId = parseAccountIdFromUserHandle(assertion?.userHandle);
        } catch {}

        const option: PasskeyOption = {
          credentialId: credential.id,
          accountId: inferredAccountId ? (inferredAccountId as any as AccountId) : null,
          publicKey: '',
          displayName: inferredAccountId ? `${inferredAccountId}` : 'Recovered passkey',
          credential,
        };
        this.availableAccounts = [option];
      }

      if (!this.availableAccounts || this.availableAccounts.length === 0) {
        console.warn('No recoverable accounts found for this passkey');
      } else {
        console.debug(`AccountRecoveryFlow: Found ${this.availableAccounts.length} recoverable accounts`);
      }

      this.phase = 'ready';

      // Return safe options without credentials for UI display
      return this.availableAccounts.map(option => ({
        credentialId: option.credentialId,
        accountId: option.accountId,
        publicKey: option.publicKey,
        displayName: option.displayName
      }));

    } catch (error: any) {
      this.phase = 'error';
      this.error = error;
      console.error('AccountRecoveryFlow: Discovery failed:', error);
      throw error;
    }
  }

  /**
   * Phase 2: Execute recovery with user selection
   * Securely looks up credential based on selection
   */
  async recover(selection: PasskeySelection): Promise<RecoveryResult> {
    if (this.phase !== 'ready') {
      throw new Error(`Cannot recover - flow is in ${this.phase} phase. Call discover() first.`);
    }
    if (!this.availableAccounts) {
      throw new Error('No available accounts found. Call discover() first.');
    }

    try {
      this.phase = 'recovering';
      console.debug(`AccountRecoveryFlow: Recovering account: ${selection.accountId}`);

      // Securely lookup the full option with credential
      const selectedOption = this.availableAccounts.find(
        option => option.credentialId === selection.credentialId &&
                 option.accountId === selection.accountId
      );

      if (!selectedOption) {
        throw new Error('Invalid selection - account not found in available options');
      }
      if (!selectedOption.accountId) {
        // Attempt a one-time re-prompt to infer accountId from userHandle for this credential
        try {
          const challenge = createRandomVRFChallenge();
          const cred = await this.context.webAuthnManager.getAuthenticationCredentialsSerializedDualPrf({
            nearAccountId: '' as any,
            challenge: challenge as VRFChallenge,
            credentialIds: selectedOption.credentialId && selectedOption.credentialId !== 'manual-input'
              ? [selectedOption.credentialId]
              : [],
          });
          const assertion: any = cred.response as any;
          const maybeAccount = parseAccountIdFromUserHandle(assertion?.userHandle);
          if (maybeAccount) {
            selectedOption.accountId = maybeAccount as any as AccountId;
          }
        } catch {}
        if (!selectedOption.accountId) {
          throw new Error('Invalid account selection - no account ID provided');
        }
      }

      // If multiple credentials exist for this account, allow the platform chooser UI
      // by passing all known credential IDs for this account as allowCredentials.
      const allowList = (() => {
        try {
          if (!this.availableAccounts) return undefined;
          if (!selectedOption.credentialId || selectedOption.credentialId === 'manual-input') return undefined;
          const ids = this.availableAccounts
            .filter(opt => opt.accountId === selectedOption.accountId && opt.credentialId && opt.credentialId !== 'manual-input')
            .map(opt => opt.credentialId);
          const uniq = Array.from(new Set(ids));
          return uniq.length > 0 ? uniq : undefined;
        } catch { return undefined; }
      })();

      const recoveryResult = await recoverAccount(
        this.context,
        selectedOption.accountId,
        this.options,
        undefined,
        allowList
      );

      this.phase = 'complete';
      return recoveryResult;

    } catch (error: any) {
      this.phase = 'error';
      this.error = error;
      console.error('AccountRecoveryFlow: Recovery failed:', error);
      throw error;
    }
  }

  /**
   * Get current flow state (safe display data only)
   */
  getState() {
    // Convert internal accounts to safe display format
    const safeAccounts = this.availableAccounts?.map(option => ({
      credentialId: option.credentialId,
      accountId: option.accountId,
      publicKey: option.publicKey,
      displayName: option.displayName
    }));

    return {
      phase: this.phase,
      availableAccounts: safeAccounts,
      error: this.error,
      isReady: this.phase === 'ready',
      isComplete: this.phase === 'complete',
      hasError: this.phase === 'error'
    };
  }

  /**
   * Reset flow to initial state
   */
  reset() {
    this.phase = 'idle';
    this.availableAccounts = undefined;
    this.error = undefined;
  }
}

/**
 * Get available passkeys for account recovery
 */
async function getRecoverableAccounts(
  context: PasskeyManagerContext,
  accountId: AccountId
): Promise<PasskeyOption[]> {
  const availablePasskeys = await getAvailablePasskeysForDomain(context, accountId);
  return availablePasskeys.filter(passkey => passkey.accountId !== null);
}

/**
 * Discover passkeys for domain using contract-based lookup
 */
async function getAvailablePasskeysForDomain(
  context: PasskeyManagerContext,
  accountId: AccountId
): Promise<PasskeyOption[]> {
  const { nearClient, configs } = context;

  const credentialIds = await getCredentialIdsContractCall(nearClient, configs.contractId, accountId);

  // Do not invoke WebAuthn here; just return display options bound to credential IDs
  if (credentialIds.length > 0) {
    return credentialIds.map((credentialId, idx) => ({
      credentialId,
      accountId,
      publicKey: '',
      displayName: credentialIds.length > 1 ? `${accountId} (passkey ${idx + 1})` : `${accountId}`,
      credential: null,
    }));
  }
  // If no contract credentials found for this specific account, do not fall back
  // to an unrestricted OS credential prompt here. Returning an empty set lets
  // the caller surface a precise message (no recoverable accounts for this ID),
  // avoiding accidental selection of a passkey from a different account.
  return [];
}

/**
 * Main account recovery function
 */
export async function recoverAccount(
  context: PasskeyManagerContext,
  accountId: AccountId,
  options?: AccountRecoveryHooksOptions,
  reuseCredential?: WebAuthnAuthenticationCredential,
  allowedCredentialIds?: string[]
): Promise<RecoveryResult> {
  const { onEvent, onError, afterCall } = options || {};
  const { webAuthnManager, nearClient, configs } = context;

  onEvent?.({
    step: 1,
    phase: AccountRecoveryPhase.STEP_1_PREPARATION,
    status: AccountRecoveryStatus.PROGRESS,
    message: 'Preparing account recovery...',
  });

  try {
    const validation = validateNearAccountId(accountId);
    if (!validation.valid) {
      return handleRecoveryError(accountId, `Invalid NEAR account ID: ${validation.error}`, onError, afterCall);
    }

    onEvent?.({
      step: 2,
      phase: AccountRecoveryPhase.STEP_2_WEBAUTHN_AUTHENTICATION,
      status: AccountRecoveryStatus.PROGRESS,
      message: 'Authenticating with contract...',
    });

    const credential = await getOrCreateCredential(
      webAuthnManager,
      accountId,
      reuseCredential,
      allowedCredentialIds
    );
    // Cross-check: ensure the authenticator's userHandle maps to the same account,
    // when available. This avoids deriving a key for the wrong account if the user
    // picks an unrelated passkey from the platform chooser.
    const assertion: any = (credential as any)?.response;
    const passkeyAccount = parseAccountIdFromUserHandle(assertion?.userHandle);
    if (passkeyAccount && passkeyAccount !== accountId) {
      return handleRecoveryError(
        accountId,
        `Selected passkey belongs to ${passkeyAccount}, not ${accountId}`,
        onError,
        afterCall
      );
    }

    const blockInfo = await nearClient.viewBlock({ finality: 'final' });
    const blockHeight = String(blockInfo.header.height);
    const blockHash = blockInfo.header.hash;

    const vrfInputData: VRFInputData = {
      userId: accountId,
      rpId: webAuthnManager.getRpId(),
      blockHeight,
      blockHash,
    };

    // Generate VRF keypair first before recovering keypair
    // keypair recovery needs the VRF keypair in memory to derive the WrapKeySeed
    const deterministicVrfResult = await webAuthnManager.deriveVrfKeypair({
      credential,
      nearAccountId: accountId,
      vrfInputData,
    });

    if (!deterministicVrfResult.success) {
      throw new Error('Failed to derive deterministic VRF keypair and generate challenge from PRF');
    }

    // Now recover the NEAR keypair (uses VRF keypair to derive WrapKeySeed)
    const recoveredKeypair = await webAuthnManager.recoverKeypairFromPasskey(
      credential,
      accountId
    );
    if (!recoveredKeypair.wrapKeySalt) {
      throw new Error('Missing wrapKeySalt in recovered key material; re-register to upgrade vault format.');
    }

    // Check if the recovered public key has access to the account
    const hasAccess = await nearClient.viewAccessKey(accountId, recoveredKeypair.publicKey);

    if (!hasAccess) {
      return handleRecoveryError(accountId, `Account ${accountId} was not created with this passkey`, onError, afterCall);
    }

    const recoveryResult = await performAccountRecovery({
      context,
      accountId,
      publicKey: recoveredKeypair.publicKey,
      encryptedKeypair: {
        encryptedPrivateKey: recoveredKeypair.encryptedPrivateKey,
        chacha20NonceB64u: recoveredKeypair.chacha20NonceB64u,
        wrapKeySalt: recoveredKeypair.wrapKeySalt,
      },
      credential: credential,
      encryptedVrfResult: {
        vrfPublicKey: deterministicVrfResult.vrfPublicKey,
        encryptedVrfKeypair: deterministicVrfResult.encryptedVrfKeypair,
        serverEncryptedVrfKeypair: deterministicVrfResult.serverEncryptedVrfKeypair || undefined,
      },
      onEvent,
    });

    onEvent?.({
      step: 5,
      phase: AccountRecoveryPhase.STEP_5_ACCOUNT_RECOVERY_COMPLETE,
      status: AccountRecoveryStatus.SUCCESS,
      message: 'Account recovery completed successfully',
      data: { recoveryResult },
    });

    afterCall?.(true, recoveryResult);
    return recoveryResult;
  } catch (error: any) {
    // Clear any VRF session that might have been established during recovery
    try {
      await webAuthnManager.clearVrfSession();
    } catch (clearError) {
      console.warn('Failed to clear VRF session after recovery error:', clearError);
    }

    onError?.(error);
    return handleRecoveryError(accountId, error.message, onError, afterCall);
  }
}

/**
 * Get credential (reuse existing or create new)
 */
async function getOrCreateCredential(
  webAuthnManager: WebAuthnManager,
  accountId: AccountId,
  reuseCredential?: WebAuthnAuthenticationCredential,
  allowedCredentialIds?: string[]
): Promise<WebAuthnAuthenticationCredential> {

  if (reuseCredential) {
    const prfResults = reuseCredential.clientExtensionResults?.prf?.results;
    if (!prfResults?.first || !prfResults?.second) {
      throw new Error('Reused credential missing PRF outputs - cannot proceed with recovery');
    }
    return reuseCredential;
  }

  const challenge = createRandomVRFChallenge();

  return await webAuthnManager.getAuthenticationCredentialsSerializedDualPrf({
    nearAccountId: accountId,
    challenge: challenge as VRFChallenge,
    credentialIds: allowedCredentialIds ?? []
  });
}

/**
 * Handle recovery error
 */
function handleRecoveryError(
  accountId: AccountId,
  errorMessage: string,
  onError?: (error: Error) => void,
  afterCall?: AfterCall<any>
): RecoveryResult {
  console.error('[recoverAccount] Error:', errorMessage);
  onError?.(new Error(errorMessage));

  const errorResult: RecoveryResult = {
    success: false,
    accountId,
    publicKey: '',
    message: `Recovery failed: ${errorMessage}`,
    error: errorMessage
  };

  const result = { success: false, accountId, error: errorMessage } as any;
  afterCall?.(false);
  return errorResult;
}

/**
 * Perform the actual recovery process
 * Syncs on-chain data and restores local IndexedDB data
 */
async function performAccountRecovery({
  context,
  accountId,
  publicKey,
  encryptedKeypair,
  credential,
  encryptedVrfResult,
  onEvent,
}: {
  context: PasskeyManagerContext,
  accountId: AccountId,
  publicKey: string,
  encryptedKeypair: {
    encryptedPrivateKey: string,
    /**
     * Base64url-encoded AEAD nonce (ChaCha20-Poly1305) for the encrypted private key.
     */
    chacha20NonceB64u: string,
    wrapKeySalt?: string,
  },
  credential: WebAuthnAuthenticationCredential,
  encryptedVrfResult: {
    encryptedVrfKeypair: EncryptedVRFKeypair;
    vrfPublicKey: string
    serverEncryptedVrfKeypair?: ServerEncryptedVrfKeypair
  },
  onEvent?: EventCallback<AccountRecoverySSEEvent>,
}): Promise<RecoveryResult> {

  const { webAuthnManager, nearClient, configs } = context;

  try {
    console.debug(`Performing recovery for account: ${accountId}`);
    onEvent?.({
      step: 3,
      phase: AccountRecoveryPhase.STEP_3_SYNC_AUTHENTICATORS_ONCHAIN,
      status: AccountRecoveryStatus.PROGRESS,
      message: 'Syncing authenticators from onchain...',
    });

    // 1. Sync on-chain authenticator data
    const contractAuthenticators = await syncAuthenticatorsContractCall(nearClient, configs.contractId, accountId);

    // 2. Find the matching authenticator to get the correct device number
    // Serialized auth credential.rawId is already base64url-encoded
    const credentialIdUsed = credential.rawId;
    const matchingAuthenticator = contractAuthenticators.find(auth => auth.credentialId === credentialIdUsed);

    if (!matchingAuthenticator) {
      throw new Error(`Could not find authenticator for credential ${credentialIdUsed}`);
    }

    const deviceNumber = matchingAuthenticator.authenticator.deviceNumber;
    if (deviceNumber === undefined) {
      throw new Error(`Device number not found for authenticator ${credentialIdUsed}`);
    }

    // 3. Restore user data to IndexedDB with correct device number
    // Use the server-encrypted VRF keypair directly from the VRF worker result
    const serverEncryptedVrfKeypairObj = encryptedVrfResult.serverEncryptedVrfKeypair;

    await restoreUserData({
      webAuthnManager,
      accountId,
      deviceNumber,
      publicKey,
      encryptedVrfKeypair: encryptedVrfResult.encryptedVrfKeypair,
      serverEncryptedVrfKeypair: serverEncryptedVrfKeypairObj,
      encryptedNearKeypair: encryptedKeypair,
      credential
    });

    // 4. Restore only the authenticator used for recovery
    await restoreAuthenticators({
      webAuthnManager,
      accountId,
      contractAuthenticators: [matchingAuthenticator],
      vrfPublicKey: encryptedVrfResult.vrfPublicKey
      // deterministically derived VRF keypair
    });

    onEvent?.({
      step: 4,
      phase: AccountRecoveryPhase.STEP_4_AUTHENTICATOR_SAVED,
      status: AccountRecoveryStatus.SUCCESS,
      message: 'Restored Passkey authenticator...',
    });

    // 5. Unlock VRF keypair in memory for immediate use
    console.debug('Unlocking VRF keypair in memory after account recovery');
    const unlockResult = await webAuthnManager.unlockVRFKeypair({
      nearAccountId: accountId,
      encryptedVrfKeypair: encryptedVrfResult.encryptedVrfKeypair,
      credential: credential,
    });

    if (!unlockResult.success) {
      console.warn('Failed to unlock VRF keypair after recovery:', unlockResult.error);
      // Don't throw error here - recovery was successful, but VRF unlock failed
    } else {
      console.debug('VRF keypair unlocked successfully after account recovery');
    }

    // 6. Initialize current user only after a successful unlock
    try {
      await webAuthnManager.initializeCurrentUser(accountId, context.nearClient);
    } catch (initErr) {
      console.warn('Failed to initialize current user after recovery:', initErr);
    }

    return {
      success: true,
      accountId,
      publicKey,
      message: 'Account successfully recovered',
    };

  } catch (error: any) {
    console.error('[performAccountRecovery] Error:', error);
    throw new Error(`Recovery process failed: ${error.message}`);
  }
}

/** Stored authenticator onchain uses snake case */
export interface ContractStoredAuthenticator {
  // V4 contract fields (snake_case JSON)
  credential_public_key: number[] | Uint8Array;
  transports?: AuthenticatorTransport[] | null;
  registered: string; // ISO timestamp (legacy contracts may return numeric timestamp string)
  expected_rp_id?: string;
  origin_policy?: OriginPolicyInput;
  user_verification?: UserVerificationPolicy;
  vrf_public_keys?: Array<number[] | Uint8Array> | string[];
  device_number: number; // 1-indexed for UX
  near_public_key?: string;
}

async function restoreUserData({
  webAuthnManager,
  accountId,
  deviceNumber,
  publicKey,
  encryptedVrfKeypair,
  serverEncryptedVrfKeypair,
  encryptedNearKeypair,
  credential
}: {
  webAuthnManager: WebAuthnManager,
  accountId: AccountId,
  deviceNumber: number,
  publicKey: string,
  encryptedVrfKeypair: EncryptedVRFKeypair,
  serverEncryptedVrfKeypair?: ServerEncryptedVrfKeypair,
  encryptedNearKeypair: {
    encryptedPrivateKey: string;
    /** Base64url-encoded AEAD nonce (ChaCha20-Poly1305) for the encrypted private key */
    chacha20NonceB64u: string;
    wrapKeySalt?: string;
  },
  credential: WebAuthnAuthenticationCredential
}) {
  const existingUser = await webAuthnManager.getUserByDevice(accountId, deviceNumber);
  if (!encryptedNearKeypair.wrapKeySalt) {
    throw new Error('Missing wrapKeySalt in recovered key material; re-register to upgrade vault format.');
  }
  const wrapKeySalt = encryptedNearKeypair.wrapKeySalt;

  const chacha20NonceB64u = encryptedNearKeypair.chacha20NonceB64u;
  if (!chacha20NonceB64u) {
    throw new Error('Missing chacha20NonceB64u in recovered key material; cannot store encrypted NEAR key.');
  }

  // Store the encrypted NEAR keypair in the encrypted keys database
  await IndexedDBManager.nearKeysDB.storeEncryptedKey({
    nearAccountId: accountId,
    deviceNumber,
    encryptedData: encryptedNearKeypair.encryptedPrivateKey,
    chacha20NonceB64u,
    wrapKeySalt,
    version: 2,
    timestamp: Date.now()
  });

  if (!existingUser) {
    await webAuthnManager.registerUser({
      nearAccountId: accountId,
      deviceNumber,
      version: 2,
      clientNearPublicKey: publicKey,
      lastUpdated: Date.now(),
      passkeyCredential: {
        id: credential.id,
        rawId: credential.rawId
      },
      encryptedVrfKeypair: {
        encryptedVrfDataB64u: encryptedVrfKeypair.encryptedVrfDataB64u,
        chacha20NonceB64u: encryptedVrfKeypair.chacha20NonceB64u,
      },
      serverEncryptedVrfKeypair,
    });
  } else {
    await webAuthnManager.storeUserData({
      nearAccountId: accountId,
      clientNearPublicKey: publicKey,
      lastUpdated: Date.now(),
      passkeyCredential: existingUser.passkeyCredential,
      encryptedVrfKeypair: {
        encryptedVrfDataB64u: encryptedVrfKeypair.encryptedVrfDataB64u,
        chacha20NonceB64u: encryptedVrfKeypair.chacha20NonceB64u,
      },
      serverEncryptedVrfKeypair,
      deviceNumber
    });
  }
}

async function restoreAuthenticators({
  webAuthnManager,
  accountId,
  contractAuthenticators,
  vrfPublicKey
}: {
  webAuthnManager: WebAuthnManager,
  accountId: AccountId,
  contractAuthenticators: {
    credentialId: string,
    authenticator: StoredAuthenticator
  }[],
  vrfPublicKey: string
}) {
  for (const { credentialId, authenticator } of contractAuthenticators) {
    const credentialPublicKey = authenticator.credentialPublicKey;

    // Fix transport processing: filter out undefined values and provide fallback
    const validTransports = authenticator.transports.filter((transport) =>
      transport !== undefined && transport !== null && typeof transport === 'string'
    );

    // If no valid transports, default to 'internal' for platform authenticators
    const transports = validTransports?.length > 0 ? validTransports : ['internal'];

    // Extract device number from contract authenticator data (now camelCase)
    const deviceNumber = authenticator.deviceNumber;
    console.debug("Restoring authenticator with device number:", deviceNumber, authenticator);

    await webAuthnManager.storeAuthenticator({
      nearAccountId: accountId,
      credentialId: credentialId,
      credentialPublicKey,
      transports,
      name: `Recovered Device ${deviceNumber} Passkey`,
      registered: authenticator.registered.toISOString(),
      syncedAt: new Date().toISOString(),
      vrfPublicKey,
      deviceNumber // Pass the device number from contract data
    });
  }
}
