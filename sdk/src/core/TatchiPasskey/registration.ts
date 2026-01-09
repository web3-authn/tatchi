import type { NearClient } from '../NearClient';
import { ensureEd25519Prefix, validateNearAccountId } from '../../utils/validation';
import type {
  RegistrationHooksOptions,
  RegistrationSSEEvent,
} from '../types/sdkSentEvents';
import type { RegistrationResult, TatchiConfigs } from '../types/tatchi';
import type { AuthenticatorOptions } from '../types/authenticatorOptions';
import { RegistrationPhase, RegistrationStatus } from '../types/sdkSentEvents';
import {
  createAccountAndRegisterWithRelayServer
} from './faucets/createAccountRelayServer';
import { PasskeyManagerContext } from './index';
import { WebAuthnManager } from '../WebAuthnManager';
import { IndexedDBManager } from '../IndexedDBManager';
import { VRFChallenge } from '../types/vrf-worker';
import { type ConfirmationConfig, type SignerMode, coerceSignerMode } from '../types/signer-worker';
import type { WebAuthnRegistrationCredential } from '../types/webauthn';
import type { AccountId } from '../types/accountIds';
import { getUserFriendlyErrorMessage } from '../../utils/errors';
import { authenticatorsToAllowCredentials } from '../WebAuthnManager/touchIdPrompt';
import { DEFAULT_WAIT_STATUS } from '../types/rpc';
import { buildThresholdEd25519Participants2pV1 } from '../../threshold/participants';
// Registration forces a visible, clickable confirmation for cross‑origin safety

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
export async function registerPasskeyInternal(
  context: PasskeyManagerContext,
  nearAccountId: AccountId,
  options: RegistrationHooksOptions,
  authenticatorOptions: AuthenticatorOptions,
  confirmationConfigOverride?: Partial<ConfirmationConfig>
): Promise<RegistrationResult> {

  const { onEvent, onError, afterCall } = options;
  const { webAuthnManager, configs } = context;

  // Track registration progress for rollback
  const registrationState = {
    accountCreated: false,
    contractRegistered: false,
    databaseStored: false,
    contractTransactionId: null as string | null,
  };

  console.log('⚡ Registration: Passkey registration with VRF WebAuthn');
  onEvent?.({
    step: 1,
    phase: RegistrationPhase.STEP_1_WEBAUTHN_VERIFICATION,
    status: RegistrationStatus.PROGRESS,
    message: `Starting registration for ${nearAccountId}`
  } as RegistrationSSEEvent);

  try {

    await validateRegistrationInputs(context, nearAccountId, onEvent, onError);

    onEvent?.({
      step: 1,
      phase: RegistrationPhase.STEP_1_WEBAUTHN_VERIFICATION,
      status: RegistrationStatus.PROGRESS,
      message: 'Account available, generating credentials...'
    });

    const confirmationConfig: Partial<ConfirmationConfig> = {
      uiMode: 'modal',
      behavior: 'requireClick', // cross‑origin safari requirement: must requireClick
      theme: (context.configs?.walletTheme === 'light') ? 'light' : 'dark',
      ...(confirmationConfigOverride ?? options?.confirmationConfig ?? {}),
    };

    const registrationSession = await context.webAuthnManager.requestRegistrationCredentialConfirmation({
      nearAccountId: String(nearAccountId),
      deviceNumber: 1,
      confirmerText: options?.confirmerText,
      confirmationConfigOverride: confirmationConfig,
    });

    const credential = registrationSession.credential;
    const vrfChallenge = registrationSession.vrfChallenge;

    onEvent?.({
      step: 1,
      phase: RegistrationPhase.STEP_1_WEBAUTHN_VERIFICATION,
      status: RegistrationStatus.SUCCESS,
      message: 'WebAuthn ceremony successful'
    });

    // Start the contract pre-check, run it in parallel to key derivation (await later)
    const canRegisterUserPromise = webAuthnManager.checkCanRegisterUser({
      contractId: context.configs.contractId,
      credential,
      vrfChallenge,
      onEvent: (progress) => {
        console.debug(`Registration progress: ${progress.step} - ${progress.message}`);
        onEvent?.({
          step: 3,
          phase: RegistrationPhase.STEP_3_CONTRACT_PRE_CHECK,
          status: RegistrationStatus.PROGRESS,
          message: `${progress.message}`
        });
      },
    });

    // 1) Ensure VRF keypair is derived and loaded in-memory
    // before deriving WrapKeySeed for NEAR key encryption
    const deterministicVrfKeyResult = await webAuthnManager.deriveVrfKeypair({
      credential,
      nearAccountId,
      saveInMemory: true,
    });
    if (!deterministicVrfKeyResult.success || !deterministicVrfKeyResult.vrfPublicKey) {
      throw new Error('Failed to derive deterministic VRF keypair from PRF');
    }

    const requestedSignerMode = coerceSignerMode(options?.signerMode, configs.signerMode);
    const requestedSignerModeStr = requestedSignerMode.mode;

    // 2) Derive/enroll the local NEAR key after VRF keypair exists.
    const nearKeyResult = await webAuthnManager.deriveNearKeypairAndEncryptFromSerialized({
      credential,
      nearAccountId,
      options: { deviceNumber: 1 },
    });
    if (!nearKeyResult.success || !nearKeyResult.publicKey) {
      const reason = nearKeyResult?.error || 'Failed to generate NEAR keypair with PRF';
      throw new Error(reason);
    }
    const nearPublicKey = nearKeyResult.publicKey;
    const wrapKeySalt = String(nearKeyResult.wrapKeySalt || '').trim();
    if (!wrapKeySalt) {
      throw new Error('Missing wrapKeySalt after local key derivation');
    }

    // Optional: threshold-signer enrollment during registration.
    // Derive client verifying share (public) and let the relay compute threshold group public key
    // and include it in the on-chain AddKey set during create_account_and_register_user.
    let thresholdClientVerifyingShareB64u: string | null = null;
    if (requestedSignerModeStr === 'threshold-signer') {
      const derived = await webAuthnManager.deriveThresholdEd25519ClientVerifyingShareFromCredential({
        credential,
        nearAccountId,
        wrapKeySalt,
      });
      if (!derived.success || !derived.clientVerifyingShareB64u) {
        throw new Error(derived.error || 'Failed to derive threshold client verifying share');
      }
      thresholdClientVerifyingShareB64u = derived.clientVerifyingShareB64u;
    }

    // 3) Await contract registration check (main blocker)
    const canRegisterUserResult = await canRegisterUserPromise;
    if (!canRegisterUserResult.verified) {
      console.error(canRegisterUserResult);
      const errorMessage = canRegisterUserResult.error || 'User verification failed - account may already exist or contract is unreachable';
      throw new Error(`Web3Authn contract registration check failed: ${errorMessage}`);
    }

    // Step 4-5: Create account and register with contract using the relay (atomic)
    onEvent?.({
      step: 2,
      phase: RegistrationPhase.STEP_2_KEY_GENERATION,
      status: RegistrationStatus.SUCCESS,
      message: 'Wallet derived successfully from Passkey',
      verified: true,
      nearAccountId: nearAccountId,
      nearPublicKey: nearPublicKey,
      vrfPublicKey: vrfChallenge.vrfPublicKey,
    });

    let accountAndRegistrationResult;
    accountAndRegistrationResult = await createAccountAndRegisterWithRelayServer(
      context,
      nearAccountId,
      nearPublicKey,
      credential,
      vrfChallenge,
      deterministicVrfKeyResult.vrfPublicKey,
      authenticatorOptions,
      onEvent,
      {
        thresholdEd25519: thresholdClientVerifyingShareB64u
          ? { clientVerifyingShareB64u: thresholdClientVerifyingShareB64u }
          : undefined,
      },
    );

    if (!accountAndRegistrationResult.success) {
      throw new Error(accountAndRegistrationResult.error || 'Account creation and registration failed');
    }

    // Update registration state based on results
    registrationState.accountCreated = true;
    registrationState.contractRegistered = true;
    registrationState.contractTransactionId = accountAndRegistrationResult.transactionId || null;

    // Step 6: Post-commit verification: ensure on-chain access key matches expected public key
    onEvent?.({
      step: 6,
      phase: RegistrationPhase.STEP_6_ACCOUNT_VERIFICATION,
      status: RegistrationStatus.PROGRESS,
      message: 'Verifying on-chain access key matches expected public key...'
    });

    const expectedAccessKeys: string[] = [nearPublicKey];
    const thresholdPublicKey = String(accountAndRegistrationResult?.thresholdEd25519?.publicKey || '').trim();
    const relayerKeyId = String(accountAndRegistrationResult?.thresholdEd25519?.relayerKeyId || '').trim();

    const accessKeyVerified = await verifyAccountAccessKeysPresent(
      context.nearClient,
      nearAccountId,
      expectedAccessKeys,
    );

    if (!accessKeyVerified) {
      throw new Error('On-chain access key mismatch or not found after registration');
    }

    onEvent?.({
      step: 6,
      phase: RegistrationPhase.STEP_6_ACCOUNT_VERIFICATION,
      status: RegistrationStatus.SUCCESS,
      message: 'Access key verified on-chain'
    });

    await activateThresholdEnrollmentPostRegistration({
      requestedSignerMode: requestedSignerModeStr,
      nearAccountId,
      nearPublicKey,
      thresholdPublicKey,
      relayerKeyId,
      clientParticipantId: accountAndRegistrationResult?.thresholdEd25519?.clientParticipantId,
      relayerParticipantId: accountAndRegistrationResult?.thresholdEd25519?.relayerParticipantId,
      thresholdClientVerifyingShareB64u,
      relayerVerifyingShareB64u: String(
        accountAndRegistrationResult?.thresholdEd25519?.relayerVerifyingShareB64u || '',
      ).trim(),
      credential,
      wrapKeySalt,
      webAuthnManager: context.webAuthnManager,
      nearClient: context.nearClient,
      onEvent,
    });

    // Step 7: Store user data with VRF credentials atomically
    onEvent?.({
      step: 7,
      phase: RegistrationPhase.STEP_7_DATABASE_STORAGE,
      status: RegistrationStatus.PROGRESS,
      message: 'Storing passkey wallet metadata...'
    });

    await webAuthnManager.atomicStoreRegistrationData({
      nearAccountId,
      credential,
      publicKey: nearPublicKey,
      encryptedVrfKeypair: deterministicVrfKeyResult.encryptedVrfKeypair,
      vrfPublicKey: deterministicVrfKeyResult.vrfPublicKey,
      serverEncryptedVrfKeypair: deterministicVrfKeyResult.serverEncryptedVrfKeypair,
    });

    // Mark database as stored for rollback tracking
    registrationState.databaseStored = true;

    onEvent?.({
      step: 7,
      phase: RegistrationPhase.STEP_7_DATABASE_STORAGE,
      status: RegistrationStatus.SUCCESS,
      message: 'Registration metadata stored successfully'
    });

    // Initialize NonceManager with newly stored user before fetching block/nonce
    try {
      context.webAuthnManager.getNonceManager().initializeUser(nearAccountId, nearPublicKey);
      await context.webAuthnManager.getNonceManager().prefetchBlockheight(context.nearClient);
    } catch {}

    // Step 7: Ensure VRF session is active for auto-login
    // If VRF keypair is already in-memory (saved earlier), skip an extra Touch ID prompt.
    let vrfStatus = await webAuthnManager.checkVrfStatus().catch(() => ({ active: false }));
    if (!vrfStatus?.active) {
      // Obtain an authentication credential for VRF unlock (separate from registration credential)
      // IMPORTANT: Immediately after account creation, the new access key may not be queryable yet on some RPC nodes.
      // We only need fresh block info for the VRF challenge here, so fetch the block directly to avoid AK lookup failures.
      const blockInfo = await context.nearClient.viewBlock({ finality: 'final' });
      const txBlockHash = blockInfo?.header?.hash;
      const txBlockHeight = String(blockInfo.header?.height ?? '');
      const vrfChallenge2 = await webAuthnManager.generateVrfChallengeOnce({
        userId: nearAccountId,
        rpId: webAuthnManager.getRpId(),
        blockHash: txBlockHash,
        blockHeight: txBlockHeight,
      });
      const authenticators = await webAuthnManager.getAuthenticatorsByUser(nearAccountId);
      const authCredential = await webAuthnManager.getAuthenticationCredentialsSerializedDualPrf({
        nearAccountId,
        challenge: vrfChallenge2,
        credentialIds: authenticators.map((a) => a.credentialId),
      });
      const unlockResult = await webAuthnManager.unlockVRFKeypair({
        nearAccountId: nearAccountId,
        encryptedVrfKeypair: deterministicVrfKeyResult.encryptedVrfKeypair,
        credential: authCredential,
      }).catch((unlockError: unknown) => {
        const message = (unlockError && typeof unlockError === 'object' && 'message' in unlockError)
          ? String((unlockError as { message?: unknown }).message || '')
          : String(unlockError || '');
        return { success: false, error: message };
      });

      if (!unlockResult.success) {
        console.warn('VRF keypair unlock failed:', unlockResult.error);
        throw new Error(unlockResult.error);
      }
    } else {
      console.debug('Registration: VRF session already active; skipping extra Touch ID unlock');
    }

    // Initialize current user only after a successful unlock
    try {
      await webAuthnManager.initializeCurrentUser(nearAccountId, context.nearClient);
    } catch (initErr) {
      console.warn('Failed to initialize current user after registration:', initErr);
    }

    onEvent?.({
      step: 8,
      phase: RegistrationPhase.STEP_8_REGISTRATION_COMPLETE,
      status: RegistrationStatus.SUCCESS,
      message: 'Registration completed!'
    });

    const successResult = {
      success: true,
      nearAccountId: nearAccountId,
      clientNearPublicKey: nearPublicKey,
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

  } catch (error: unknown) {
    const message = (error && typeof error === 'object' && 'message' in error)
      ? String((error as { message?: unknown }).message || '')
      : String(error || '');
    const stack = (error && typeof error === 'object' && 'stack' in error)
      ? String((error as { stack?: unknown }).stack || '')
      : '';
    console.error('Registration failed:', message, stack);

    // Perform rollback based on registration state
    await performRegistrationRollback(
      registrationState,
      nearAccountId,
      webAuthnManager,
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
    afterCall?.(false);
    return result;
  }
}

// Backward-compatible wrapper without explicit confirmationConfig override
export async function registerPasskey(
  context: PasskeyManagerContext,
  nearAccountId: AccountId,
  options: RegistrationHooksOptions,
  authenticatorOptions: AuthenticatorOptions
): Promise<RegistrationResult> {
  return registerPasskeyInternal(context, nearAccountId, options, authenticatorOptions, undefined);
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

  // Generate VRF keypair and persist in worker memory
  const vrfResult = await webAuthnManager.generateVrfKeypairBootstrap({
    vrfInputData: {
      userId: nearAccountId,
      // Keep VRF rpId consistent with WebAuthn rpId selection logic.
      rpId: webAuthnManager.getRpId(),
      blockHeight: String(blockInfo.header.height),
      blockHash: blockInfo.header.hash,
    },
    saveInMemory: true,
    // VRF keypair persists in worker memory until PRF encryption
  });

  if (!vrfResult.vrfChallenge) {
    throw new Error('Registration VRF keypair generation failed');
  }
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
    configs: TatchiConfigs,
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

  // on-chain account existence check is performed later via signer worker (checkCanRegisterUser),
  onEvent?.({
    step: 1,
    phase: RegistrationPhase.STEP_1_WEBAUTHN_VERIFICATION,
    status: RegistrationStatus.PROGRESS,
    message: `Account format validated, preparing confirmation`
  } as RegistrationSSEEvent);
  return;
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

  } catch (rollbackError: unknown) {
    console.error('Rollback failed:', rollbackError);
    onEvent?.({
      step: 0,
      phase: RegistrationPhase.REGISTRATION_ERROR,
      status: RegistrationStatus.ERROR,
      message: `Rollback failed: ${
        (rollbackError && typeof rollbackError === 'object' && 'message' in rollbackError)
          ? String((rollbackError as { message?: unknown }).message || '')
          : String(rollbackError || '')
      }`,
      error: 'Both registration and rollback failed'
    } as RegistrationSSEEvent);
  }
}

async function activateThresholdEnrollmentPostRegistration(opts: {
  requestedSignerMode: SignerMode['mode'];
  nearAccountId: AccountId;
  nearPublicKey: string;
  thresholdPublicKey: string;
  relayerKeyId: string;
  clientParticipantId?: number;
  relayerParticipantId?: number;
  thresholdClientVerifyingShareB64u: string | null;
  relayerVerifyingShareB64u: string;
  credential: WebAuthnRegistrationCredential;
  wrapKeySalt: string;
  webAuthnManager: WebAuthnManager;
  nearClient: NearClient;
  onEvent?: (event: RegistrationSSEEvent) => void;
}): Promise<void> {
  // Optional: activate threshold enrollment post-registration by having the client
  // submit AddKey(thresholdPublicKey) signed with the local key.
  if (opts.requestedSignerMode !== 'threshold-signer') return;

  const thresholdPublicKey = String(opts.thresholdPublicKey || '').trim();
  const relayerKeyId = String(opts.relayerKeyId || '').trim();
  const clientVerifyingShareB64u = String(opts.thresholdClientVerifyingShareB64u || '').trim();
  const relayerVerifyingShareB64u = String(opts.relayerVerifyingShareB64u || '').trim();

  if (!thresholdPublicKey || !relayerKeyId || !clientVerifyingShareB64u || !relayerVerifyingShareB64u) {
    console.warn('[Registration] threshold-signer requested but threshold enrollment details are missing; continuing with local-signer only');
    return;
  }

  try {
    opts.onEvent?.({
      step: 6,
      phase: RegistrationPhase.STEP_6_ACCOUNT_VERIFICATION,
      status: RegistrationStatus.PROGRESS,
      message: 'Activating threshold access key onchain...'
    });

    // Prepare a single AddKey transaction signed with the local key (no extra TouchID prompt).
    try {
      opts.webAuthnManager.getNonceManager().initializeUser(opts.nearAccountId, opts.nearPublicKey);
    } catch {}
    const txContext = await opts.webAuthnManager.getNonceManager().getNonceBlockHashAndHeight(
      opts.nearClient,
      { force: true },
    );

    const signed = await opts.webAuthnManager.signAddKeyThresholdPublicKeyNoPrompt({
      nearAccountId: opts.nearAccountId,
      credential: opts.credential,
      wrapKeySalt: opts.wrapKeySalt,
      transactionContext: txContext,
      thresholdPublicKey,
      relayerVerifyingShareB64u,
      clientParticipantId: opts.clientParticipantId,
      relayerParticipantId: opts.relayerParticipantId,
    });

    const signedTx = signed?.signedTransaction;
    if (!signedTx) throw new Error('Failed to sign AddKey(thresholdPublicKey) transaction');

    await opts.nearClient.sendTransaction(signedTx, DEFAULT_WAIT_STATUS.thresholdAddKey);

    const thresholdKeyVerified = await verifyAccountAccessKeysPresent(
      opts.nearClient,
      opts.nearAccountId,
      [opts.nearPublicKey, thresholdPublicKey],
    );
    if (!thresholdKeyVerified) {
      throw new Error('Threshold access key not found on-chain after AddKey');
    }

    await IndexedDBManager.nearKeysDB.storeKeyMaterial({
      kind: 'threshold_ed25519_2p_v1',
      nearAccountId: opts.nearAccountId,
      deviceNumber: 1,
      publicKey: thresholdPublicKey,
      wrapKeySalt: opts.wrapKeySalt,
      relayerKeyId,
      clientShareDerivation: 'prf_first_v1',
      participants: buildThresholdEd25519Participants2pV1({
        clientParticipantId: opts.clientParticipantId,
        relayerParticipantId: opts.relayerParticipantId,
        relayerKeyId,
        relayerUrl: opts.webAuthnManager.tatchiPasskeyConfigs?.relayer?.url,
        clientVerifyingShareB64u,
        relayerVerifyingShareB64u,
        clientShareDerivation: 'prf_first_v1',
      }),
      timestamp: Date.now(),
    });

    opts.onEvent?.({
      step: 6,
      phase: RegistrationPhase.STEP_6_ACCOUNT_VERIFICATION,
      status: RegistrationStatus.SUCCESS,
      message: 'Threshold access key activated on-chain'
    });
  } catch (e) {
    console.warn('[Registration] threshold enrollment activation failed; continuing with local-signer only:', e);
  }
}

async function verifyAccountAccessKeysPresent(
  nearClient: NearClient,
  nearAccountId: string,
  expectedPublicKeys: string[],
  opts?: { attempts?: number; delayMs?: number },
): Promise<boolean> {
  const unique = Array.from(
    new Set(expectedPublicKeys.map((k) => ensureEd25519Prefix(k)).filter(Boolean)),
  );
  if (!unique.length) return false;

  const attempts = Math.max(1, Math.floor(opts?.attempts ?? 6));
  const delayMs = Math.max(50, Math.floor(opts?.delayMs ?? 750));

  for (let i = 0; i < attempts; i++) {
    try {
      const { fullAccessKeys, functionCallAccessKeys } = await nearClient.getAccessKeys({ account: nearAccountId });
      const keys = [...fullAccessKeys, ...functionCallAccessKeys].map((k) => ensureEd25519Prefix(k.public_key));
      const allPresent = unique.every((expected) => keys.includes(expected));
      if (allPresent) return true;
    } catch {
      // tolerate transient view errors during propagation; retry
    }
    await new Promise((res) => setTimeout(res, delayMs));
  }
  return false;
}
