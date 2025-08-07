import type { BaseHooksOptions, ActionResult, OperationHooks, EventCallback, ActionSSEEvent, AccountRecoveryEventStep5, AccountRecoverySSEEvent } from '../types/passkeyManager';
import { AccountRecoveryPhase, AccountRecoveryStatus, AccountRecoveryHooksOptions } from '../types/passkeyManager';
import type { PasskeyManagerContext } from './index';
import type { AccountId, StoredAuthenticator, VRFChallenge } from '../types';
import type { EncryptedVRFKeypair } from '../types/vrf-worker';
import { validateNearAccountId } from '../../utils/validation';
import { toAccountId } from '../types/accountIds';
import { generateBootstrapVrfChallenge } from './registration';
import { base58Decode, base64UrlEncode } from '../../utils/encoders';
import { NearClient } from '../NearClient';
import { WebAuthnManager } from '../WebAuthnManager';
import { IndexedDBManager } from '../IndexedDBManager';
import type { VRFInputData } from '../types/vrf-worker';
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
  credential: PublicKeyCredential | null;
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
  accountId: string;
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
    const nearAccountId = toAccountId(accountId);
    try {
      this.phase = 'discovering';
      console.debug('AccountRecoveryFlow: Discovering available accounts...');

      // Get full options with credentials, requires TouchID prompt
      this.availableAccounts = await getRecoverableAccounts(this.context, nearAccountId);

      if (this.availableAccounts.length === 0) {
        // throw new Error('No recoverable accounts found for this passkey');
        console.warn('No recoverable accounts found for this passkey');
        console.warn(`Continuing with account recovery for ${accountId}`);
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
        throw new Error('Invalid account selection - no account ID provided');
      }

      const recoveryResult = await recoverAccount(
        this.context,
        selectedOption.accountId,
        this.options,
        selectedOption.credential || undefined
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
  const vrfChallenge = await generateBootstrapVrfChallenge(context, accountId);
  const availablePasskeys = await getAvailablePasskeysForDomain(context, vrfChallenge, accountId);
  return availablePasskeys.filter(passkey => passkey.accountId !== null);
}

/**
 * Discover passkeys for domain using contract-based lookup
 */
async function getAvailablePasskeysForDomain(
  context: PasskeyManagerContext,
  vrfChallenge: VRFChallenge,
  accountId: AccountId
): Promise<PasskeyOption[]> {
  const { webAuthnManager, nearClient, configs } = context;

  const credentialIds = await getCredentialIdsContractCall(nearClient, configs.contractId, accountId);

  // Always try to authenticate with the provided account ID, even if no credentials found in contract
  try {
    const credential = await webAuthnManager.touchIdPrompt.getCredentialsForRecovery({
      nearAccountId: accountId,
      challenge: vrfChallenge.outputAs32Bytes(),
      credentialIds: credentialIds.length > 0 ? credentialIds : [] // Empty array if no contract credentials
    });

    if (credential) {
      return [{
        credentialId: credential.id,
        accountId: accountId,
        publicKey: '',
        displayName: `${accountId} (Authenticated with this passkey)`,
        credential: credential
      }];
    }
  } catch (error) {
    console.warn('Failed to authenticate with passkey:', error);
  }

  // If authentication failed, still return the account option but without credential
  return [{
    credentialId: 'manual-input',
    accountId: accountId, // Use the provided accountId instead of null
    publicKey: '',
    displayName: `${accountId} (Authentication failed - please try again)`,
    credential: null,
  }];
}

/**
 * Main account recovery function
 */
export async function recoverAccount(
  context: PasskeyManagerContext,
  accountId: AccountId,
  options?: AccountRecoveryHooksOptions,
  reuseCredential?: PublicKeyCredential
): Promise<RecoveryResult> {
  const { onEvent, onError, hooks } = options || {};
  const { webAuthnManager, nearClient } = context;

  await hooks?.beforeCall?.();

  onEvent?.({
    step: 1,
    phase: AccountRecoveryPhase.STEP_1_PREPARATION,
    status: AccountRecoveryStatus.PROGRESS,
    message: 'Preparing account recovery...',
  });

  try {
    const validation = validateNearAccountId(accountId);
    if (!validation.valid) {
      return handleRecoveryError(accountId, `Invalid NEAR account ID: ${validation.error}`, onError, hooks);
    }

    onEvent?.({
      step: 2,
      phase: AccountRecoveryPhase.STEP_2_WEBAUTHN_AUTHENTICATION,
      status: AccountRecoveryStatus.PROGRESS,
      message: 'Authenticating with WebAuthn...',
    });

    const credential = await getOrCreateCredential(webAuthnManager, accountId, reuseCredential);
    const recoveredKeypair = await deriveKeypairFromCredential(webAuthnManager, credential, accountId);

    const { hasAccess, blockHeight, blockHash } = await Promise.all([
      nearClient.viewAccessKey(accountId, recoveredKeypair.publicKey),
      nearClient.viewBlock({ finality: 'final' })
    ]).then(([hasAccess, blockInfo]) => {
      return {
        hasAccess,
        blockHeight: blockInfo.header.height,
        blockHash: blockInfo.header.hash,
      };
    });

    if (!hasAccess) {
      return handleRecoveryError(accountId, `Account ${accountId} was not created with this passkey`, onError, hooks);
    }
    const vrfInputData: VRFInputData = {
      userId: accountId,
      rpId: window.location.hostname,
      blockHeight,
      blockHash,
    };
    const { encryptedVrfResult, vrfChallenge } = await deriveVrfKeypair(
      webAuthnManager,
      credential,
      accountId,
      vrfInputData
    );

    const recoveryResult = await performAccountRecovery({
      context,
      accountId,
      publicKey: recoveredKeypair.publicKey,
      encryptedKeypair: {
        encryptedPrivateKey: recoveredKeypair.encryptedPrivateKey,
        iv: recoveredKeypair.iv,
      },
      vrfChallenge,
      credential,
      encryptedVrfResult,
      onEvent,
    });

    onEvent?.({
      step: 5,
      phase: AccountRecoveryPhase.STEP_5_ACCOUNT_RECOVERY_COMPLETE,
      status: AccountRecoveryStatus.SUCCESS,
      message: 'Account recovery completed successfully',
      data: recoveryResult,
    });

    hooks?.afterCall?.(true, recoveryResult);
    return recoveryResult;
  } catch (error: any) {
    onError?.(error);
    return handleRecoveryError(accountId, error.message, onError, hooks);
  }
}

/**
 * Get credential (reuse existing or create new)
 */
async function getOrCreateCredential(
  webAuthnManager: WebAuthnManager,
  accountId: AccountId,
  reuseCredential?: PublicKeyCredential
): Promise<PublicKeyCredential> {
  if (reuseCredential) {
    const prfResults = reuseCredential.getClientExtensionResults()?.prf?.results;
    if (!prfResults?.first || !prfResults?.second) {
      throw new Error('Reused credential missing PRF outputs - cannot proceed with recovery');
    }
    return reuseCredential;
  }

  const randomChallenge = crypto.getRandomValues(new Uint8Array(32));
  return await webAuthnManager.touchIdPrompt.getCredentialsForRecovery({
    nearAccountId: accountId,
    challenge: randomChallenge,
    credentialIds: []
  });
}

/**
 * Derive keypair from credential
 */
async function deriveKeypairFromCredential(
  webAuthnManager: WebAuthnManager,
  credential: PublicKeyCredential,
  accountId: string
) {
  return await webAuthnManager.recoverKeypairFromPasskey(
    crypto.getRandomValues(new Uint8Array(32)),
    credential,
    accountId
  );
}

/**
 * Derive VRF keypair and generate challenge
 */
async function deriveVrfKeypair(
  webAuthnManager: WebAuthnManager,
  credential: PublicKeyCredential,
  accountId: AccountId,
  vrfInputData: VRFInputData
) {
  const deterministicVrfResult = await webAuthnManager.deriveVrfKeypairFromPrf({
    credential,
    nearAccountId: accountId,
    vrfInputData
  });

  if (
    !deterministicVrfResult.success ||
    !deterministicVrfResult.vrfPublicKey ||
    !deterministicVrfResult.vrfChallenge ||
    !deterministicVrfResult.encryptedVrfKeypair
  ) {
    throw new Error('Failed to derive deterministic VRF keypair and generate challenge from PRF');
  }

  return {
    encryptedVrfResult: {
      vrfPublicKey: deterministicVrfResult.vrfPublicKey,
      encryptedVrfKeypair: deterministicVrfResult.encryptedVrfKeypair
    },
    vrfChallenge: deterministicVrfResult.vrfChallenge
  };
}

/**
 * Handle recovery error
 */
function handleRecoveryError(
  accountId: AccountId,
  errorMessage: string,
  onError?: (error: Error) => void,
  hooks?: OperationHooks
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

  const result = { success: false, accountId, error: errorMessage };
  hooks?.afterCall?.(false, result);
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
  vrfChallenge,
  credential,
  encryptedVrfResult,
  onEvent,
}: {
  context: PasskeyManagerContext,
  accountId: AccountId,
  publicKey: string,
  encryptedKeypair: {
    encryptedPrivateKey: string,
    iv: string
  },
  vrfChallenge: VRFChallenge,
  credential: PublicKeyCredential,
  encryptedVrfResult: { encryptedVrfKeypair: EncryptedVRFKeypair; vrfPublicKey: string },
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
    const credentialIdUsed = base64UrlEncode(new Uint8Array(credential.rawId));
    const matchingAuthenticator = contractAuthenticators.find(auth => auth.credentialId === credentialIdUsed);

    if (!matchingAuthenticator) {
      throw new Error(`Could not find authenticator for credential ${credentialIdUsed}`);
    }

    const deviceNumber = matchingAuthenticator.authenticator.deviceNumber;
    if (deviceNumber === undefined) {
      throw new Error(`Device number not found for authenticator ${credentialIdUsed}`);
    }

    // 3. Restore user data to IndexedDB with correct device number
    await restoreUserData({
      webAuthnManager,
      accountId,
      deviceNumber,
      publicKey,
      encryptedVrfKeypair: encryptedVrfResult.encryptedVrfKeypair,
      encryptedNearKeypair: encryptedKeypair,
      credential
    });

    // 4. Restore only the authenticator used for recovery
    console.debug(`Restoring only the authenticator used for recovery: ${credentialIdUsed}`);
    await restoreAuthenticators({
      webAuthnManager,
      accountId,
      contractAuthenticators: [matchingAuthenticator],
      vrfPublicKey: encryptedVrfResult.vrfPublicKey
      // the encrypted Vrf is the deterministic vrf public key
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
  credential_id: string;
  credential_public_key: Uint8Array;
  transports: AuthenticatorTransport[];
  registered: string; // Contract returns timestamp as string
  vrf_public_keys?: string[];
  device_number: number; // Always present from contract
}

async function restoreUserData({
  webAuthnManager,
  accountId,
  deviceNumber,
  publicKey,
  encryptedVrfKeypair,
  encryptedNearKeypair,
  credential
}: {
  webAuthnManager: WebAuthnManager,
  accountId: AccountId,
  deviceNumber: number,
  publicKey: string,
  encryptedVrfKeypair: EncryptedVRFKeypair,
  encryptedNearKeypair: {
    encryptedPrivateKey: string;
    iv: string
  },
  credential: PublicKeyCredential
}) {
  const existingUser = await webAuthnManager.getUser(accountId);

  // Store the encrypted NEAR keypair in the encrypted keys database
  await IndexedDBManager.nearKeysDB.storeEncryptedKey({
    nearAccountId: accountId,
    encryptedData: encryptedNearKeypair.encryptedPrivateKey,
    iv: encryptedNearKeypair.iv,
    timestamp: Date.now()
  });
  console.log("restoreUserData: using deviceNumber =", deviceNumber, "for account", accountId);

  if (!existingUser) {
    await webAuthnManager.registerUser({
      nearAccountId: accountId,
      deviceNumber,
      clientNearPublicKey: publicKey,
      lastUpdated: Date.now(),
      passkeyCredential: {
        id: credential.id,
        rawId: base64UrlEncode(new Uint8Array(credential.rawId))
      },
      encryptedVrfKeypair,
    });
  } else {
    await webAuthnManager.storeUserData({
      nearAccountId: accountId,
      clientNearPublicKey: publicKey,
      lastUpdated: Date.now(),
      passkeyCredential: existingUser.passkeyCredential,
      encryptedVrfKeypair,
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
    console.log("Restoring authenticator with device number:", deviceNumber, authenticator);

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

async function getRecoveryLoginState(webAuthnManager: WebAuthnManager, accountId: AccountId) {
  const loginState = await webAuthnManager.checkVrfStatus();
  const isVrfActive = loginState.active && loginState.nearAccountId === accountId;
  return {
    isLoggedIn: isVrfActive,
    vrfActive: isVrfActive,
    vrfSessionDuration: loginState.sessionDuration
  };
}

