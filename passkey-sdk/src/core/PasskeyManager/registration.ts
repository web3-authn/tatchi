import type { NearClient, SignedTransaction } from '../NearClient';
import { validateNearAccountId } from '../../utils/validation';
import type {
  RegistrationHooksOptions,
  RegistrationResult,
  RegistrationSSEEvent,
} from '../types/passkeyManager';
import type { AuthenticatorOptions } from '../types/authenticatorOptions';
import { RegistrationPhase, RegistrationStatus } from '../types/passkeyManager';
import {
  createAccountAndRegisterWithRelayServer
} from './faucets/createAccountRelayServer';
import { PasskeyManagerConfigs } from '../types/passkeyManager';
import { PasskeyManagerContext } from './index';
import { WebAuthnManager } from '../WebAuthnManager';
import { VRFChallenge } from '../types/vrf-worker';
import type { AccountId } from '../types/accountIds';
import { base64UrlEncode } from '../../utils/encoders';
import { getUserFriendlyErrorMessage } from '../../utils/errors';

/**
 * Core registration function that handles passkey registration
 *
 * VRF Registration Flow (Single VRF Keypair):
 * 1. Generate VRF keypair (ed25519) using crypto.randomUUID() + persist in worker memory
 * 2. Generate VRF proof + output using the VRF keypair
 *    - VRF input with domain separator + NEAR block height + hash
 * 3. Use VRF output as WebAuthn challenge in registration ceremony
 * 4. Derive AES key from WebAuthn PRF output and encrypt the SAME VRF keypair
 * 5. Store encrypted VRF keypair in IndexedDB
 * 6. Call contract verify_registration_response with VRF proof + WebAuthn registration payload
 * 7. Contract verifies VRF proof and WebAuthn registration (challenges match!)
 * 8. Contract stores VRF pubkey + authenticator credentials on-chain for
 *    future stateless authentication
 */
export async function registerPasskey(
  context: PasskeyManagerContext,
  nearAccountId: AccountId,
  options: RegistrationHooksOptions,
  authenticatorOptions: AuthenticatorOptions
): Promise<RegistrationResult> {

  const { onEvent, onError, beforeCall, afterCall } = options;
  const { webAuthnManager, configs } = context;

  // Track registration progress for rollback
  const registrationState = {
    accountCreated: false,
    contractRegistered: false,
    databaseStored: false,
    contractTransactionId: null as string | null,
  };

  console.log('⚡ Registration: Passkey registration with VRF WebAuthn ceremony');
  // Emit started event
  onEvent?.({
    step: 1,
    phase: RegistrationPhase.STEP_1_WEBAUTHN_VERIFICATION,
    status: RegistrationStatus.PROGRESS,
    message: `Starting registration for ${nearAccountId}`
  } as RegistrationSSEEvent);

  try {
    // Run beforeCall hook
    await beforeCall?.();

    // Validate registration inputs
    await validateRegistrationInputs(context, nearAccountId, onEvent, onError);

    onEvent?.({
      step: 1,
      phase: RegistrationPhase.STEP_1_WEBAUTHN_VERIFICATION,
      status: RegistrationStatus.PROGRESS,
      message: 'Account available - generating VRF credentials...'
    });

    // Step 1: Generate bootstrap VRF challenge for WebAuthn ceremony
    // (temporary, replaced later with determinisitic VRF keypair)
    const { vrfChallenge } = await Promise.all([
      validateRegistrationInputs(context, nearAccountId, onEvent, onError),
      generateBootstrapVrfChallenge(context, nearAccountId),
    ]).then(([_, vrfChallenge]) => ({ vrfChallenge }));

    // Step 2: WebAuthn registration ceremony with PRF (TouchID)
    onEvent?.({
      step: 1,
      phase: RegistrationPhase.STEP_1_WEBAUTHN_VERIFICATION,
      status: RegistrationStatus.PROGRESS,
      message: 'Performing WebAuthn registration with VRF challenge...'
    });

    const credential = await webAuthnManager.generateRegistrationCredentials({
      nearAccountId: nearAccountId,
      challenge: vrfChallenge,
    });

    onEvent?.({
      step: 1,
      phase: RegistrationPhase.STEP_1_WEBAUTHN_VERIFICATION,
      status: RegistrationStatus.SUCCESS,
      message: 'WebAuthn ceremony successful, PRF output obtained'
    });

    // Steps 3-4: Encrypt VRF keypair, derive NEAR keypair, and check registration in parallel
    const {
      deterministicVrfKeyResult,
      nearKeyResult,
      canRegisterUserResult,
    } = await Promise.all([
      // Generate deterministic VRF keypair from PRF output for recovery
      webAuthnManager.deriveVrfKeypair({
        credential,
        nearAccountId,
        saveInMemory: true, // Save in worker memory so it can be used for challenge generation
      }),
      webAuthnManager.deriveNearKeypairAndEncrypt({
        credential,
        nearAccountId
      }),
      webAuthnManager.checkCanRegisterUser({
        contractId: context.configs.contractId,
        credential: credential,
        vrfChallenge: vrfChallenge,
        onEvent: (progress) => {
          console.debug(`Registration progress: ${progress.step} - ${progress.message}`);
          onEvent?.({
            step: 4,
            phase: RegistrationPhase.STEP_4_ACCOUNT_VERIFICATION,
            status: RegistrationStatus.PROGRESS,
            message: `Checking registration: ${progress.message}`
          });
        },
      }),
    ]).then(([deterministicVrfKeyResult, nearKeyResult, canRegisterUserResult]) => {
      if (!deterministicVrfKeyResult.success || !deterministicVrfKeyResult.vrfPublicKey) {
        throw new Error('Failed to derive deterministic VRF keypair from PRF');
      }
      if (!nearKeyResult.success || !nearKeyResult.publicKey) {
        throw new Error('Failed to generate NEAR keypair with PRF');
      }
      if (!canRegisterUserResult.verified) {
        console.error(canRegisterUserResult);
        const errorMessage = canRegisterUserResult.error || 'User verification failed - account may already exist or contract is unreachable';
        throw new Error(`Web3Authn contract registration check failed: ${errorMessage}`);
      }
      return {
        deterministicVrfKeyResult,
        nearKeyResult,
        canRegisterUserResult
      };
    });

    // Step 5: Create account and register with contract using appropriate flow
    onEvent?.({
      step: 2,
      phase: RegistrationPhase.STEP_2_KEY_GENERATION,
      status: RegistrationStatus.SUCCESS,
      message: 'Wallet keys derived successfully from TouchId',
      verified: true,
      nearAccountId: nearAccountId,
      nearPublicKey: nearKeyResult.publicKey,
      vrfPublicKey: vrfChallenge.vrfPublicKey,
    });

    let accountAndRegistrationResult;
    accountAndRegistrationResult = await createAccountAndRegisterWithRelayServer(
      context,
      nearAccountId,
      nearKeyResult.publicKey,
      credential,
      vrfChallenge,
      deterministicVrfKeyResult.vrfPublicKey,
      authenticatorOptions,
      onEvent,
    );

    if (!accountAndRegistrationResult.success) {
      throw new Error(accountAndRegistrationResult.error || 'Account creation and registration failed');
    }

    // Update registration state based on results
    registrationState.accountCreated = true;
    registrationState.contractRegistered = true;
    registrationState.contractTransactionId = accountAndRegistrationResult.transactionId || null;

    // Step 6: Store user data with VRF credentials atomically
    onEvent?.({
      step: 5,
      phase: RegistrationPhase.STEP_5_DATABASE_STORAGE,
      status: RegistrationStatus.PROGRESS,
      message: 'Storing VRF registration data'
    });

    await webAuthnManager.atomicStoreRegistrationData({
      nearAccountId,
      credential,
      publicKey: nearKeyResult.publicKey,
      encryptedVrfKeypair: deterministicVrfKeyResult.encryptedVrfKeypair,
      vrfPublicKey: deterministicVrfKeyResult.vrfPublicKey,
      serverEncryptedVrfKeypair: deterministicVrfKeyResult.serverEncryptedVrfKeypair,
      onEvent
    });

    // Mark database as stored for rollback tracking
    registrationState.databaseStored = true;

    onEvent?.({
      step: 5,
      phase: RegistrationPhase.STEP_5_DATABASE_STORAGE,
      status: RegistrationStatus.SUCCESS,
      message: 'VRF registration data stored successfully'
    });

    // Step 7: Unlock VRF keypair in memory (auto‑login) – only proceed with login state after this succeeds
    const unlockResult = await webAuthnManager.unlockVRFKeypair({
      nearAccountId: nearAccountId,
      encryptedVrfKeypair: deterministicVrfKeyResult.encryptedVrfKeypair,
      credential: credential,
    }).catch((unlockError: any) => {
      return { success: false, error: unlockError.message };
    });

    if (!unlockResult.success) {
      console.warn('VRF keypair unlock failed:', unlockResult.error);
      throw new Error(unlockResult.error);
    }

    // Initialize current user only after a successful unlock
    try {
      await webAuthnManager.initializeCurrentUser(nearAccountId, context.nearClient);
    } catch (initErr) {
      console.warn('Failed to initialize current user after registration:', initErr);
    }

    onEvent?.({
      step: 7,
      phase: RegistrationPhase.STEP_7_REGISTRATION_COMPLETE,
      status: RegistrationStatus.SUCCESS,
      message: 'Registration completed successfully'
    });

    const successResult = {
      success: true,
      nearAccountId: nearAccountId,
      clientNearPublicKey: nearKeyResult.publicKey,
      transactionId: registrationState.contractTransactionId,
      vrfRegistration: {
        success: true,
        vrfPublicKey: vrfChallenge.vrfPublicKey,
        encryptedVrfKeypair: deterministicVrfKeyResult.encryptedVrfKeypair,
        contractVerified: accountAndRegistrationResult.success,
      }
    };

    afterCall?.(true, successResult);
    return successResult;

  } catch (error: any) {
    console.error('Registration failed:', error.message, error.stack);

    // Perform rollback based on registration state
    await performRegistrationRollback(
      registrationState,
      nearAccountId,
      webAuthnManager,
      configs.nearRpcUrl,
      onEvent
    );

    // Use centralized error handling
    const errorMessage = getUserFriendlyErrorMessage(error, 'registration', nearAccountId);

    const errorObject = new Error(errorMessage);
    onError?.(errorObject);

    onEvent?.({
      step: 0,
      phase: RegistrationPhase.REGISTRATION_ERROR,
      status: RegistrationStatus.ERROR,
      message: errorMessage,
      error: errorMessage
    } as RegistrationSSEEvent);

    const result = { success: false, error: errorMessage };
    afterCall?.(false, result);
    return result;
  }
}

//////////////////////////////////////
// HELPER FUNCTIONS
//////////////////////////////////////

/**
 * Generate a VRF keypair + challenge in VRF wasm worker for WebAuthn registration ceremony bootstrapping
 *
 * ARCHITECTURE: This function solves the chicken-and-egg problem with a single VRF keypair:
 * 1. Generate VRF keypair + challenge (no PRF needed)
 * 2. Persist VRF keypair in worker memory (NOT encrypted yet)
 * 3. Use VRF challenge for WebAuthn ceremony → get PRF output
 * 4. Encrypt the SAME VRF keypair (still in memory) with PRF
 *
 * @param webAuthnManager - WebAuthn manager instance
 * @param nearAccountId - NEAR account ID for VRF input
 * @param blockHeight - Current NEAR block height for freshness
 * @param blockHashBytes - Current NEAR block hash bytes for entropy
 * @returns VRF challenge data (VRF keypair persisted in worker memory)
 */
export async function generateBootstrapVrfChallenge(
  context: PasskeyManagerContext,
  nearAccountId: AccountId,
): Promise<VRFChallenge> {

  const { webAuthnManager, nearClient } = context;

  const blockInfo = await nearClient.viewBlock({ finality: 'final' });

  console.log('Generating VRF keypair for registration');
  // Generate VRF keypair and persist in worker memory
  const vrfResult = await webAuthnManager.generateVrfKeypairBootstrap(
    true, // saveInMemory: true - this VRF keypair is persisted in worker memory until PRF encryption
    {
      userId: nearAccountId,
      rpId: window.location.hostname,
      blockHeight: String(blockInfo.header.height),
      blockHash: blockInfo.header.hash,
    }
  );

  if (!vrfResult.vrfChallenge) {
    throw new Error('Registration VRF keypair generation failed');
  }
  console.log('bootstrap VRF keypair generated and persisted in worker memory');
  return vrfResult.vrfChallenge;
}

/**
 * Validates registration inputs and throws errors if invalid
 * @param nearAccountId - NEAR account ID to validate
 * @param onEvent - Optional callback for registration progress events
 * @param onError - Optional callback for error handling
 */
const validateRegistrationInputs = async (
  context: {
    configs: PasskeyManagerConfigs,
    webAuthnManager: WebAuthnManager,
    nearClient: NearClient,
  },
  nearAccountId: AccountId,
  onEvent?: (event: RegistrationSSEEvent) => void,
  onError?: (error: Error) => void,
) => {

  onEvent?.({
    step: 1,
    phase: RegistrationPhase.STEP_1_WEBAUTHN_VERIFICATION,
    status: RegistrationStatus.PROGRESS,
    message: 'Validating registration inputs...'
  } as RegistrationSSEEvent);

  // Validation
  if (!nearAccountId) {
    const error = new Error('NEAR account ID is required for registration.');
    onError?.(error);
    throw error;
  }
  // Validate the account ID format
  const validation = validateNearAccountId(nearAccountId);
  if (!validation.valid) {
    const error = new Error(`Invalid NEAR account ID: ${validation.error}`);
    onError?.(error);
    throw error;
  }
  if (!window.isSecureContext) {
    const error = new Error('Passkey operations require a secure context (HTTPS or localhost).');
    onError?.(error);
    throw error;
  }

  // Check if account already exists on-chain
  onEvent?.({
    step: 1,
    phase: RegistrationPhase.STEP_1_WEBAUTHN_VERIFICATION,
    status: RegistrationStatus.PROGRESS,
    message: `Checking if account ${nearAccountId} is available...`
  } as RegistrationSSEEvent);

  try {
    const accountInfo = await context.nearClient.viewAccount(nearAccountId);
    // If we get here without an error, the account already exists
    const error = new Error(`Account ${nearAccountId} already exists. Please choose a different account ID.`);
    onError?.(error);
    throw error;
  } catch (viewError: any) {
    // If viewAccount throws any error, assume the account doesn't exist
    // This is more reliable than parsing specific error formats that vary between RPC servers
    console.log(`Account ${nearAccountId} is available for registration (viewAccount failed: ${viewError.message})`);
    onEvent?.({
      step: 1,
      phase: RegistrationPhase.STEP_1_WEBAUTHN_VERIFICATION,
      status: RegistrationStatus.PROGRESS,
      message: `Account ${nearAccountId} is available for registration`
    } as RegistrationSSEEvent);
    return; // Continue with registration
  }
}

/**
 * Rollback registration data in case of errors
 */
async function performRegistrationRollback(
  registrationState: {
    accountCreated: boolean;
    contractRegistered: boolean;
    databaseStored: boolean;
    contractTransactionId: string | null;
  },
  nearAccountId: AccountId,
  webAuthnManager: WebAuthnManager,
  rpcNodeUrl: string,
  onEvent?: (event: RegistrationSSEEvent) => void
): Promise<void> {
  console.debug('Starting registration rollback...', registrationState);

  // Rollback in reverse order
  try {
    // 1. Always clear any in-memory VRF session established during bootstrap
    await webAuthnManager.clearVrfSession();

    // 2. Rollback database storage
    if (registrationState.databaseStored) {
      console.debug('Rolling back database storage...');
      onEvent?.({
        step: 0,
        phase: RegistrationPhase.REGISTRATION_ERROR,
        status: RegistrationStatus.ERROR,
        message: 'Rolling back database storage...',
        error: 'Registration failed - rolling back database storage'
      } as RegistrationSSEEvent);

      await webAuthnManager.rollbackUserRegistration(nearAccountId);
      console.debug('Database rollback completed');
    }

    // 3. Contract rollback on the Web3Authn contract
    // NOT NEEDED - account creation and contract registration are atomic in the relay server flow
    if (registrationState.contractRegistered) {
      console.debug('Contract registration cannot be rolled back (immutable blockchain state)');
      onEvent?.({
        step: 0,
        phase: RegistrationPhase.REGISTRATION_ERROR,
        status: RegistrationStatus.ERROR,
        message: `Contract registration (tx: ${registrationState.contractTransactionId}) cannot be rolled back`,
        error: 'Registration failed - contract state is immutable'
      } as RegistrationSSEEvent);
    }
    console.debug('Registration rollback completed');

  } catch (rollbackError: any) {
    console.error('Rollback failed:', rollbackError);
    onEvent?.({
      step: 0,
      phase: RegistrationPhase.REGISTRATION_ERROR,
      status: RegistrationStatus.ERROR,
      message: `Rollback failed: ${rollbackError.message}`,
      error: 'Both registration and rollback failed'
    } as RegistrationSSEEvent);
  }
}
