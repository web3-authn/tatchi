import type { AfterCall, SyncAccountSSEEvent, EventCallback } from '../types/sdkSentEvents';
import { SyncAccountPhase, SyncAccountStatus, SyncAccountHooksOptions } from '../types/sdkSentEvents';
import type { PasskeyManagerContext } from './index';
import type {
  AccountId,
  StoredAuthenticator,
  VRFChallenge,
  WebAuthnAuthenticationCredential
} from '../types';
import type { EncryptedVRFKeypair, ServerEncryptedVrfKeypair } from '../types/vrf-worker';
import { ensureEd25519Prefix, validateNearAccountId } from '../../utils/validation';
import { parseAccountIdFromUserHandle } from '../WebAuthnManager/userHandle';
import { toAccountId } from '../types/accountIds';
import { createRandomVRFChallenge } from '../types/vrf-worker';
import { WebAuthnManager } from '../WebAuthnManager';
import { IndexedDBManager } from '../IndexedDBManager';
import type { VRFInputData } from '../types/vrf-worker';
import type { OriginPolicyInput, UserVerificationPolicy } from '../types/authenticatorOptions';
import { parseDeviceNumber } from '../WebAuthnManager/SignerWorkerManager/getDeviceNumber';
import { buildThresholdEd25519Participants2pV1 } from '../../threshold/participants';
import {
  getCredentialIdsContractCall,
  hasAccessKey,
  syncAuthenticatorsContractCall
} from '../rpcCalls';

/**
 * Use case:
 * Suppose a user accidentally clears their browser's indexedDB, and deletes their:
 * - encrypted NEAR keypair
 * - encrypted VRF keypair
 * - webauthn authenticator
 * Provide a way for the user to sync their account from on-chain authenticator information with their passkey.
 */

export interface SyncAccountResult {
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

export interface SyncAccountLookupResult {
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
 * Account sync flow with credential encapsulation
 *
 * Usage:
 * ```typescript
 * const flow = new SyncAccountFlow(context);
 * const options = await flow.discover(); // Get safe display options
 * // ... user selects account in UI ...
 * const result = await flow.sync({ credentialId, accountId }); // Execute sync
 * ```
 */
export class SyncAccountFlow {
  private context: PasskeyManagerContext;
  private options?: SyncAccountHooksOptions;
  private availableAccounts?: PasskeyOption[]; // Full options with credentials (private)
  private phase: 'idle' | 'discovering' | 'ready' | 'syncing' | 'complete' | 'error' = 'idle';
  private error?: Error;

  constructor(context: PasskeyManagerContext, options?: SyncAccountHooksOptions) {
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
      const normalizedAccountId = normalizeSyncAccountIdInput(accountId);
      const hasValidAccount = !!normalizedAccountId && validateNearAccountId(normalizedAccountId).valid;

      if (hasValidAccount) {
        const nearAccountId = toAccountId(normalizedAccountId);
        // Contract-based lookup; no WebAuthn prompt during discovery
        this.availableAccounts = await getSyncableAccounts(this.context, nearAccountId);
      } else {
        // Fallback discovery without a typed account: prompt once to select a passkey
        // Then infer the accountId from userHandle (set at registration time)
        const challenge = createRandomVRFChallenge();
        const credential = await this.context.webAuthnManager.getAuthenticationCredentialsSerializedDualPrf({
          // Account is unknown here – we only need userHandle for inference.
          nearAccountId: '' as AccountId,
          challenge: challenge as VRFChallenge,
          credentialIds: [],
        });

        // Try to infer accountId from userHandle
        const inferredAccountId = parseAccountIdFromUserHandle(credential.response?.userHandle);

	        const option: PasskeyOption = {
	          // Use rawId (base64url) consistently with on-chain/IndexedDB credential IDs.
	          credentialId: credential.rawId,
	          accountId: inferredAccountId ? toAccountId(inferredAccountId) : null,
	          publicKey: '',
	          displayName: inferredAccountId ? `${inferredAccountId}` : 'Discovered passkey',
	          // Do not reuse this discovery credential during sync:
	          // PRF outputs are scoped to the salts used above (nearAccountId=""),
	          // and will not match the real account-specific salts needed to
	          // deterministically derive the correct on-chain access key.
	          credential: null,
	        };
        this.availableAccounts = [option];
      }

      if (!this.availableAccounts || this.availableAccounts.length === 0) {
        console.warn('No syncable accounts found for this passkey');
      } else {
        console.debug(`SyncAccountFlow: Found ${this.availableAccounts.length} syncable accounts`);
      }

      this.phase = 'ready';

      // Return safe options without credentials for UI display
      return this.availableAccounts.map(option => ({
        credentialId: option.credentialId,
        accountId: option.accountId,
        publicKey: option.publicKey,
        displayName: option.displayName
      }));

    } catch (error: unknown) {
      const failure = error instanceof Error ? error : new Error(String(error));
      this.phase = 'error';
      this.error = failure;
      console.error('SyncAccountFlow: Discovery failed:', failure);
      throw failure;
    }
  }

  /**
   * Phase 2: Execute sync with user selection
   * Securely looks up credential based on selection
   */
  async sync(selection: PasskeySelection): Promise<SyncAccountResult> {
    if (this.phase !== 'ready') {
      throw new Error(`Cannot sync - flow is in ${this.phase} phase. Call discover() first.`);
    }
    if (!this.availableAccounts) {
      throw new Error('No available accounts found. Call discover() first.');
    }

    try {
      this.phase = 'syncing';
      console.debug(`SyncAccountFlow: Syncing account: ${selection.accountId}`);

      // Securely lookup the full option with credential
      const selectedOption = this.availableAccounts.find(
        option => option.credentialId === selection.credentialId &&
                 option.accountId === selection.accountId
      );

      if (!selectedOption) {
        throw new Error('Invalid selection - account not found in available options');
      }
      if (!selectedOption.accountId) {
        // Attempt to infer accountId from the stored discovery credential first.
        const storedAccount = parseAccountIdFromUserHandle(selectedOption.credential?.response?.userHandle);
        if (storedAccount) {
          selectedOption.accountId = toAccountId(storedAccount);
        } else {
          // Fall back to a one-time re-prompt to infer accountId from userHandle.
          try {
            const challenge = createRandomVRFChallenge();
            const cred = await this.context.webAuthnManager.getAuthenticationCredentialsSerializedDualPrf({
              nearAccountId: '' as AccountId,
              challenge: challenge as VRFChallenge,
              credentialIds: selectedOption.credentialId && selectedOption.credentialId !== 'manual-input'
                ? [selectedOption.credentialId]
                : [],
            });
            const maybeAccount = parseAccountIdFromUserHandle(cred.response?.userHandle);
            if (maybeAccount) {
              selectedOption.accountId = toAccountId(maybeAccount);
            }
          } catch {}
        }
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

      const syncResult = await syncAccount(
        this.context,
        selectedOption.accountId,
        this.options,
        selectedOption.credential ?? undefined,
        allowList
      );

      this.phase = 'complete';
      return syncResult;

    } catch (error: unknown) {
      const failure = error instanceof Error ? error : new Error(String(error));
      this.phase = 'error';
      this.error = failure;
      console.error('SyncAccountFlow: Sync failed:', failure);
      throw failure;
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

function normalizeSyncAccountIdInput(input: string): string {
  const raw = String(input || '').trim();
  if (!raw) return '';

  // Common copy/paste: Nearblocks account URL
  const match = raw.match(/nearblocks\.io\/(?:address|account)\/([^/?#]+)/i);
  if (match?.[1]) return match[1];

  try {
    const u = new URL(raw);
    const parts = String(u.pathname || '').split('/').filter(Boolean);
    const idx = parts.findIndex((p) => p === 'address' || p === 'account');
    if (idx >= 0 && parts[idx + 1]) return parts[idx + 1];
  } catch {}

  return raw;
}

/**
 * Get available passkeys for account sync
 */
async function getSyncableAccounts(
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
  // the caller surface a precise message (no syncable accounts for this ID),
  // avoiding accidental selection of a passkey from a different account.
  return [];
}

/**
 * Main account sync function
 */
export async function syncAccount(
  context: PasskeyManagerContext,
  accountId: AccountId,
  options?: SyncAccountHooksOptions,
  reuseCredential?: WebAuthnAuthenticationCredential,
  allowedCredentialIds?: string[]
): Promise<SyncAccountResult> {
  const { onEvent, onError, afterCall } = options || {};
  const { webAuthnManager, nearClient, configs } = context;

  onEvent?.({
    step: 1,
    phase: SyncAccountPhase.STEP_1_PREPARATION,
    status: SyncAccountStatus.PROGRESS,
    message: 'Preparing account sync...',
  });

  try {
    const validation = validateNearAccountId(accountId);
    if (!validation.valid) {
      return handleSyncError(accountId, `Invalid NEAR account ID: ${validation.error}`, onError, afterCall);
    }

    onEvent?.({
      step: 2,
      phase: SyncAccountPhase.STEP_2_WEBAUTHN_AUTHENTICATION,
      status: SyncAccountStatus.PROGRESS,
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
    const passkeyAccount = parseAccountIdFromUserHandle(credential.response?.userHandle);
    if (passkeyAccount && passkeyAccount !== accountId) {
      return handleSyncError(
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
      throw new Error('Missing wrapKeySalt in derived key material; re-register to upgrade vault format.');
    }

    // Check if the recovered public key has access to the account.
    // `viewAccessKey` throws when the key doesn't exist; use the boolean helper instead.
    const hasAccess = await hasAccessKey(nearClient, accountId, recoveredKeypair.publicKey, { attempts: 1, delayMs: 0 });

    if (!hasAccess) {
      return handleSyncError(
        accountId,
        `Account ${accountId} does not have access key ${recoveredKeypair.publicKey} (check you selected the correct passkey)`,
        onError,
        afterCall
      );
    }

    const syncResult = await performAccountSync({
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
      phase: SyncAccountPhase.STEP_5_SYNC_ACCOUNT_COMPLETE,
      status: SyncAccountStatus.SUCCESS,
      message: 'Account sync completed successfully',
      data: { syncResult },
    });

    afterCall?.(true, syncResult);
    return syncResult;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const err = error instanceof Error ? error : new Error(message);
    // Clear any VRF session that might have been established during sync
    try {
      await webAuthnManager.clearVrfSession();
    } catch (clearError) {
      console.warn('Failed to clear VRF session after sync error:', clearError);
    }

    onError?.(err);
    return handleSyncError(accountId, message, onError, afterCall);
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
      throw new Error('Reused credential missing PRF outputs - cannot proceed with sync');
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
 * Handle sync error
 */
function handleSyncError(
  accountId: AccountId,
  errorMessage: string,
  onError?: (error: Error) => void,
  afterCall?: AfterCall<SyncAccountResult>
): SyncAccountResult {
  console.error('[syncAccount] Error:', errorMessage);
  onError?.(new Error(errorMessage));

  const errorResult: SyncAccountResult = {
    success: false,
    accountId,
    publicKey: '',
    message: `Sync failed: ${errorMessage}`,
    error: errorMessage
  };

  afterCall?.(false);
  return errorResult;
}

/**
 * Perform the actual sync process
 * Syncs on-chain data and restores local IndexedDB data
 */
async function performAccountSync({
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
  onEvent?: EventCallback<SyncAccountSSEEvent>,
}): Promise<SyncAccountResult> {

  const { webAuthnManager, nearClient, configs } = context;

  try {
    console.debug(`Performing sync for account: ${accountId}`);
    onEvent?.({
      step: 3,
      phase: SyncAccountPhase.STEP_3_SYNC_AUTHENTICATORS_ONCHAIN,
      status: SyncAccountStatus.PROGRESS,
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

    // 4. Restore only the authenticator used for sync
    await restoreAuthenticators({
      webAuthnManager,
      accountId,
      contractAuthenticators: [matchingAuthenticator],
      vrfPublicKey: encryptedVrfResult.vrfPublicKey
      // deterministically derived VRF keypair
    });

    onEvent?.({
      step: 4,
      phase: SyncAccountPhase.STEP_4_AUTHENTICATOR_SAVED,
      status: SyncAccountStatus.SUCCESS,
      message: 'Restored Passkey authenticator...',
    });

    // Activate threshold enrollment for this device by ensuring threshold key
    // material is available locally (and AddKey if needed).
    await activateThresholdEnrollment({
      context,
      accountId,
      deviceNumber,
      localPublicKey: publicKey,
      wrapKeySalt: String(encryptedKeypair.wrapKeySalt || '').trim(),
      contractAuthenticators,
    });

    // 5. Unlock VRF keypair in memory for immediate use
    console.debug('Unlocking VRF keypair in memory after account sync');
    const unlockResult = await webAuthnManager.unlockVRFKeypair({
      nearAccountId: accountId,
      encryptedVrfKeypair: encryptedVrfResult.encryptedVrfKeypair,
      credential: credential,
    });

    if (!unlockResult.success) {
      console.warn('Failed to unlock VRF keypair after sync:', unlockResult.error);
      // Don't throw error here - sync was successful, but VRF unlock failed
    } else {
      console.debug('VRF keypair unlocked successfully after account sync');
    }

    // 6. Initialize current user only after a successful unlock
    try {
      await webAuthnManager.initializeCurrentUser(accountId, context.nearClient);
    } catch (initErr) {
      console.warn('Failed to initialize current user after sync:', initErr);
    }

    return {
      success: true,
      accountId,
      publicKey,
      message: 'Account successfully synced',
    };

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[performAccountSync] Error:', error);
    throw new Error(`Sync process failed: ${message}`);
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
  await IndexedDBManager.nearKeysDB.storeKeyMaterial({
    kind: 'local_near_sk_v3',
    nearAccountId: accountId,
    deviceNumber,
    publicKey,
    encryptedSk: encryptedNearKeypair.encryptedPrivateKey,
    chacha20NonceB64u,
    wrapKeySalt,
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

async function activateThresholdEnrollment(args: {
  context: PasskeyManagerContext;
  accountId: AccountId;
  deviceNumber: number;
  localPublicKey: string;
  wrapKeySalt: string;
  contractAuthenticators: Array<{ credentialId: string; authenticator: StoredAuthenticator; nearPublicKey?: string }>;
}): Promise<void> {
  const deviceNumber = parseDeviceNumber(args.deviceNumber, { min: 1 });
  if (deviceNumber === null) {
    throw new Error(`Invalid deviceNumber for threshold enrollment: ${String(args.deviceNumber)}`);
  }

  // Ensure WebAuthn allowCredentials selection prefers this device's passkey
  // when multiple authenticators exist for the account.
  try {
    await args.context.webAuthnManager.setLastUser(args.accountId, deviceNumber);
  } catch {}

  const existing = await IndexedDBManager.nearKeysDB.getThresholdKeyMaterial(args.accountId, deviceNumber);
  if (existing) return;

  // Avoid introducing another TouchID/WebAuthn prompt during account sync:
  // best-effort restore of threshold key metadata (no relayer keygen, no AddKey).
  try {
    const thresholdPublicKey = await inferThresholdPublicKeyNoPrompt({
      nearClient: args.context.nearClient,
      accountId: args.accountId,
      localPublicKey: args.localPublicKey,
      contractAuthenticators: args.contractAuthenticators,
    });
    if (!thresholdPublicKey) return;
    if (!args.wrapKeySalt) return;

    await IndexedDBManager.nearKeysDB.storeKeyMaterial({
      kind: 'threshold_ed25519_2p_v1',
      nearAccountId: args.accountId,
      deviceNumber,
      publicKey: thresholdPublicKey,
      wrapKeySalt: args.wrapKeySalt,
      relayerKeyId: thresholdPublicKey, // default: relayerKeyId := publicKey
      clientShareDerivation: 'prf_first_v1',
      participants: buildThresholdEd25519Participants2pV1({
        relayerKeyId: thresholdPublicKey,
        relayerUrl: args.context.configs?.relayer?.url,
        clientShareDerivation: 'prf_first_v1',
      }),
      timestamp: Date.now(),
    });
  } catch (e) {
    console.warn('[syncAccount] Skipping threshold key restoration (non-fatal):', e);
  }
}

async function inferThresholdPublicKeyNoPrompt(args: {
  nearClient: PasskeyManagerContext['nearClient'];
  accountId: AccountId;
  localPublicKey: string;
  contractAuthenticators: Array<{ credentialId: string; authenticator: StoredAuthenticator; nearPublicKey?: string }>;
}): Promise<string | null> {
  const localKeys = new Set<string>();
  const localPublicKey = ensureEd25519Prefix(String(args.localPublicKey || '').trim());
  if (localPublicKey) localKeys.add(localPublicKey);

  for (const entry of args.contractAuthenticators) {
    const pk = ensureEd25519Prefix(String(entry.nearPublicKey || '').trim());
    if (pk) localKeys.add(pk);
  }

  const accessKeyList = await args.nearClient.viewAccessKeyList(String(args.accountId));
  const onChainKeys = Array.from(
    new Set(
      (accessKeyList?.keys || [])
        .map((k: any) => ensureEd25519Prefix(String(k?.public_key || '').trim()))
        .filter((k: string) => !!k),
    ),
  );

  // Threshold key is any access key not associated with a device-local key.
  const candidates = onChainKeys.filter((k) => !localKeys.has(k));
  if (candidates.length === 1) return candidates[0];

  // Fallback: if the account has exactly two keys, treat the "other" key as threshold.
  if (onChainKeys.length === 2 && localPublicKey) {
    const other = onChainKeys.find((k) => k !== localPublicKey);
    return other || null;
  }

  return null;
}
