import type {
  AfterCall,
  LoginHooksOptions,
  LoginSSEvent,
} from '../types/sdkSentEvents';
import { LoginPhase, LoginStatus } from '../types/sdkSentEvents';
import type {
  GetRecentLoginsResult,
  LoginAndCreateSessionResult,
  LoginResult,
  LoginSession,
  LoginState,
  SigningSessionStatus,
} from '../types/tatchi';
import type { PasskeyManagerContext } from './index';
import type { AccountId } from '../types/accountIds';
import type { WebAuthnAuthenticationCredential } from '../types/webauthn';
import { getUserFriendlyErrorMessage } from '../../utils/errors';
import { createRandomVRFChallenge, ServerEncryptedVrfKeypair, VRFChallenge } from '../types/vrf-worker';
import { authenticatorsToAllowCredentials } from '../WebAuthnManager/touchIdPrompt';
import { IndexedDBManager } from '../IndexedDBManager';
import type { ClientAuthenticatorData, ClientUserData } from '../IndexedDBManager';
import { verifyAuthenticationResponse } from '../rpcCalls';

/**
 * Core login function that handles passkey authentication without React dependencies.
 *
 * - Unlocks the VRF keypair (Shamir 3‑pass auto‑unlock when possible; falls back to TouchID).
 * - Updates local login state and returns success with account/public key info.
 * - Optional: mints a server session when `options.session` is provided.
 *   - Generates a fresh, chain‑anchored VRF challenge (using latest block).
 *   - Collects a WebAuthn assertion over the VRF output and posts to the relay route
 *     (defaults to `/verify-authentication-response`).
 *   - When `kind: 'jwt'`, returns the token in `result.jwt`.
 *   - When `kind: 'cookie'`, the server sets an HttpOnly cookie and no JWT is returned.
 */
export async function loginAndCreateSession(
  context: PasskeyManagerContext,
  nearAccountId: AccountId,
  options?: LoginHooksOptions
): Promise<LoginAndCreateSessionResult> {

  const { onEvent, onError, afterCall } = options || {};
  const { webAuthnManager } = context;

  onEvent?.({
    step: 1,
    phase: LoginPhase.STEP_1_PREPARATION,
    status: LoginStatus.PROGRESS,
    message: `Starting login for ${nearAccountId}`
  });

  const prevStatus = await webAuthnManager.checkVrfStatus();
  const prevVrfAccountId = prevStatus?.active ? prevStatus.nearAccountId : null;

  // If this call activates VRF then fails, clear the partial session.
  const rollbackVrfOnFailure = async () => {
    const status = await webAuthnManager.checkVrfStatus();
    const current = status?.active ? status.nearAccountId : null;
    if (current && current !== prevVrfAccountId) {
      await logoutAndClearSession(context);
    }
  };

  try {
    // Validation
    if (!window.isSecureContext) {
      const errorMessage = 'Passkey operations require a secure context (HTTPS or localhost).';
      const error = new Error(errorMessage);
      onError?.(error);
      onEvent?.({
        step: 0,
        phase: LoginPhase.LOGIN_ERROR,
        status: LoginStatus.ERROR,
        message: errorMessage,
        error: errorMessage
      });
      const result = { success: false, error: errorMessage };
      return result;
    }

    // Handle login and unlock VRF keypair in VRF WASM worker for WebAuthn challenge generation
    const wantsSession = options?.session?.kind == 'jwt' || options?.session?.kind == 'cookie';
    const base = await handleLoginUnlockVRF(
      context,
      nearAccountId,
      onEvent,
      onError,
      afterCall,
      // Defer final 'login-complete' event & afterCall until warm signing session is minted
      true
    );
    // If base login failed, just return
    if (!base.result.success) return base.result;

    const attachSigningSession = async (result: LoginResult): Promise<LoginAndCreateSessionResult> => {
      if (!result?.success) return result;
      try {
        const signingSession: SigningSessionStatus = await webAuthnManager.getWarmSigningSessionStatus(nearAccountId);
        return { ...result, signingSession };
      } catch {
        return result;
      }
    };

    // Resolve default warm signing session policy from configs.
    const ttlMsDefault = context.configs.signingSessionDefaults.ttlMs;
    const remainingUsesDefault = context.configs.signingSessionDefaults.remainingUses;
    const ttlMs = options?.signingSession?.ttlMs ?? ttlMsDefault;
    const remainingUses = options?.signingSession?.remainingUses ?? remainingUsesDefault;

    // Optionally mint a server session (JWT or HttpOnly cookie).
    // When requested, we also mint the warm signing session using the same WebAuthn prompt
    // so Shamir auto-unlock remains a single-prompt login UX.
    if (wantsSession) {
      const { kind, relayUrl: relayUrlOverride, route: routeOverride } = options!.session!;
      const relayUrl = (relayUrlOverride || context.configs.relayer.url).trim();
      const route = (routeOverride || '/verify-authentication-response').trim();
      if (!relayUrl) {
        // No relay; return base result without session
        console.warn("No relayUrl provided for session");
        // Ensure a warm signing session is minted for local signing UX.
        await mintWarmSigningSession({
          context,
          nearAccountId,
          onEvent,
          credential: base.unlockCredential,
          ttlMs,
          remainingUses,
        });

        const finalResult = await attachSigningSession(base.result);
        // Emit completion now since we deferred it
        onEvent?.({
          step: 4,
          phase: LoginPhase.STEP_4_LOGIN_COMPLETE,
          status: LoginStatus.SUCCESS,
          message: 'Login completed successfully',
          nearAccountId: nearAccountId,
          clientNearPublicKey: base.result?.clientNearPublicKey || ''
        } as unknown as LoginSSEvent);
        await afterCall?.(true, finalResult);
        return finalResult;
      }
      try {
        // Build a fresh VRF challenge using current block
        const blockInfo = await context.nearClient.viewBlock({ finality: 'final' });
        const txBlockHash = blockInfo?.header?.hash;
        const txBlockHeight = String(blockInfo.header?.height ?? '');
        const vrfChallenge = await webAuthnManager.generateVrfChallengeOnce({
          userId: nearAccountId,
          rpId: webAuthnManager.getRpId(),
          blockHash: txBlockHash,
          blockHeight: txBlockHeight,
        });
        const authenticators = await webAuthnManager.getAuthenticatorsByUser(nearAccountId);
        const credential = await webAuthnManager.getAuthenticationCredentialsSerialized({
          nearAccountId,
          challenge: vrfChallenge,
          allowCredentials: authenticatorsToAllowCredentials(authenticators),
        });

        // Align lastUser deviceNumber with the passkey actually chosen for session minting.
        try {
          if (authenticators.length > 1) {
            const rawId = credential.rawId;
            const matched = authenticators.find((a) => a.credentialId === rawId);
            if (matched && typeof matched.deviceNumber === 'number') {
              await context.webAuthnManager.setLastUser(nearAccountId, matched.deviceNumber);
            }
          }
        } catch {
          // Non-fatal; session minting can proceed even if last-user update fails here.
        }

        // Mint the warm signing session using the same prompt used for server-session verification.
        await mintWarmSigningSession({
          context,
          nearAccountId,
          onEvent,
          credential,
          ttlMs,
          remainingUses,
        });

        const v = await verifyAuthenticationResponse(relayUrl, route, kind as 'jwt' | 'cookie', vrfChallenge, credential);
        if (v.success && v.verified) {
          const finalResult = await attachSigningSession({ ...base.result, jwt: v.jwt });
          // Now fire completion event and afterCall since we deferred them
          onEvent?.({
            step: 4,
            phase: LoginPhase.STEP_4_LOGIN_COMPLETE,
            status: LoginStatus.SUCCESS,
            message: 'Login completed successfully',
            nearAccountId: nearAccountId,
            clientNearPublicKey: base.result?.clientNearPublicKey || ''
          } as unknown as LoginSSEvent);
          await afterCall?.(true, finalResult);
          return finalResult;
        }
        // Session verification returned an error; surface error and afterCall(false)
        const errMsg = v.error || 'Session verification failed';
        await rollbackVrfOnFailure();
        onEvent?.({
          step: 0,
          phase: LoginPhase.LOGIN_ERROR,
          status: LoginStatus.ERROR,
          message: errMsg,
          error: errMsg
        } as unknown as LoginSSEvent);
        await afterCall?.(false as any);
        return { success: false, error: errMsg };
      } catch (e: any) {
        console.error("Failed to start session: ", e);
        const errMsg = getUserFriendlyErrorMessage(e, 'login') || (e?.message || 'Session verification failed');
        await rollbackVrfOnFailure();
        onError?.(e);
        onEvent?.({
          step: 0,
          phase: LoginPhase.LOGIN_ERROR,
          status: LoginStatus.ERROR,
          message: errMsg,
          error: errMsg
        } as unknown as LoginSSEvent);
        await afterCall?.(false as any);
        return { success: false, error: errMsg };
      }
    }

    // No server session requested: mint/refresh the warm signing session.
    await mintWarmSigningSession({
      context,
      nearAccountId,
      onEvent,
      credential: base.unlockCredential,
      ttlMs,
      remainingUses,
    });

    const finalResult = await attachSigningSession(base.result);
    // Fire completion event and afterCall since we deferred them.
    onEvent?.({
      step: 4,
      phase: LoginPhase.STEP_4_LOGIN_COMPLETE,
      status: LoginStatus.SUCCESS,
      message: 'Login completed successfully',
      nearAccountId: nearAccountId,
      clientNearPublicKey: base.result?.clientNearPublicKey || ''
    } as unknown as LoginSSEvent);
    await afterCall?.(true, finalResult);
    return finalResult;

  } catch (err: any) {

    await rollbackVrfOnFailure();
    onError?.(err);
    const errorMessage = getUserFriendlyErrorMessage(err, 'login') || err?.message || 'Login failed';
    onEvent?.({
      step: 0,
      phase: LoginPhase.LOGIN_ERROR,
      status: LoginStatus.ERROR,
      message: errorMessage,
      error: errorMessage
    });
    const result = { success: false, error: errorMessage };
    afterCall?.(false);
    return result;
  }
}

/**
 * Mint or refresh a "warm signing session" in the VRF worker.
 *
 * Notes:
 * - Reuses a previously collected WebAuthn credential when provided (e.g. TouchID fallback),
 *   to avoid prompting the user twice in a single login flow.
 * - Session TTL/remainingUses policy is enforced by the VRF worker.
 */
async function mintWarmSigningSession(args: {
  context: PasskeyManagerContext;
  nearAccountId: AccountId;
  onEvent?: (event: LoginSSEvent) => void;
  credential?: WebAuthnAuthenticationCredential;
  ttlMs: number;
  remainingUses: number;
}): Promise<void> {
  const { context, nearAccountId, onEvent, credential, ttlMs, remainingUses } = args;
  const { webAuthnManager } = context;

  onEvent?.({
    step: 3,
    phase: LoginPhase.STEP_3_VRF_UNLOCK,
    status: LoginStatus.PROGRESS,
    message: 'Unlocking warm signing session...'
  });

  // If we already performed a TouchID ceremony (e.g., VRF unlock fallback),
  // reuse that credential to avoid a second prompt.
  let effectiveCredential = credential;
  if (!effectiveCredential) {
    const challenge = createRandomVRFChallenge();
    const authenticators = await webAuthnManager.getAuthenticatorsByUser(nearAccountId);
    const { authenticatorsForPrompt } = await IndexedDBManager.clientDB.ensureCurrentPasskey(
      nearAccountId,
      authenticators,
    );
    effectiveCredential = await webAuthnManager.getAuthenticationCredentialsSerialized({
      nearAccountId,
      challenge: challenge as VRFChallenge,
      allowCredentials: authenticatorsToAllowCredentials(authenticatorsForPrompt),
    });
  }

  await webAuthnManager.mintSigningSessionFromCredential({
    nearAccountId,
    credential: effectiveCredential,
    ttlMs,
    remainingUses,
  });

  onEvent?.({
    step: 3,
    phase: LoginPhase.STEP_3_VRF_UNLOCK,
    status: LoginStatus.SUCCESS,
    message: 'Warm signing session unlocked'
  });
}

/**
 * Handle onchain (serverless) login using VRF flow per docs/vrf_challenges.md
 *
 * VRF AUTHENTICATION FLOW:
 * 1. Unlock VRF keypair in VRF Worker memory, either
 *      - Decrypt via Shamir 3-pass (when Relayer is present), or
 *      - Re-derive the VRF via credentials inside VRF worker dynamically
 * 2. Generate VRF challenge using stored VRF keypair + NEAR block data (no TouchID needed)
 * 3. Use VRF output as WebAuthn challenge for authentication
 * 4. Verify VRF proof and WebAuthn response on contract simultaneously
 *      - VRF proof assures WebAuthn challenge is fresh and valid (replay protection)
 *      - WebAuthn verification for origin + biometric credentials + device authenticity
 */
async function handleLoginUnlockVRF(
  context: PasskeyManagerContext,
  nearAccountId: AccountId,
  onEvent?: (event: LoginSSEvent) => void,
  onError?: (error: Error) => void,
  afterCall?: AfterCall<any>,
  deferCompletionHooks?: boolean,
): Promise<{
  result: LoginResult;
  usedFallbackTouchId: boolean;
  unlockCredential?: WebAuthnAuthenticationCredential;
}> {
  const { webAuthnManager } = context;

  try {
    // Step 1: Get VRF credentials and authenticators, and validate them
    const [lastUser, latestByAccount, authenticators] = await Promise.all([
      webAuthnManager.getLastUser(),
      IndexedDBManager.clientDB.getLastDBUpdatedUser(nearAccountId),
      webAuthnManager.getAuthenticatorsByUser(nearAccountId),
    ]);

    // Prefer the most recently updated record for this account; fall back to lastUser pointer.
    let userData = null as (typeof lastUser) | null;
    if (latestByAccount && latestByAccount.nearAccountId === nearAccountId) {
      userData = latestByAccount;
    } else if (lastUser && lastUser.nearAccountId === nearAccountId) {
      userData = lastUser;
    } else {
      userData = await webAuthnManager.getUserByDevice(nearAccountId, 1);
    }

    // Validate user data and authenticators
    if (!userData) {
      throw new Error(`User data not found for ${nearAccountId} in IndexedDB. Please register an account.`);
    }
    if (!userData.clientNearPublicKey) {
      throw new Error(`No NEAR public key found for ${nearAccountId}. Please register an account.`);
    }
    if (
      !userData.encryptedVrfKeypair?.encryptedVrfDataB64u ||
      !userData.encryptedVrfKeypair?.chacha20NonceB64u
    ) {
      throw new Error('No VRF credentials found. Please register an account.');
    }
    if (authenticators.length === 0) {
      throw new Error(`No authenticators found for account ${nearAccountId}. Please register.`);
    }

    // Step 2: Try Shamir 3-pass commutative unlock first (no TouchID required), fallback to TouchID
    onEvent?.({
      step: 2,
      phase: LoginPhase.STEP_2_WEBAUTHN_ASSERTION,
      status: LoginStatus.PROGRESS,
      message: 'Unlocking VRF keys...'
    });

    let unlockResult: { success: boolean; error?: string } = { success: false };
    let usedFallbackTouchId = false;
    let unlockCredential: WebAuthnAuthenticationCredential | undefined;
    let activeDeviceNumber = userData.deviceNumber;
    // Effective user row whose VRF/NEAR keys are actually used for this login.
    // May be switched when multiple devices exist and the user picks a different passkey.
    let effectiveUserData = userData;

    const hasServerEncrypted = !!userData.serverEncryptedVrfKeypair;
    const relayerUrl = context.configs.relayer?.url;
    const useShamir3PassVRFKeyUnlock = hasServerEncrypted && !!relayerUrl && !!userData.serverEncryptedVrfKeypair?.serverKeyId;

    if (useShamir3PassVRFKeyUnlock) {
      try {
        const shamir = userData.serverEncryptedVrfKeypair as ServerEncryptedVrfKeypair;
        if (!shamir.ciphertextVrfB64u || !shamir.kek_s_b64u) {
          throw new Error('Missing Shamir3Pass fields (ciphertextVrfB64u/kek_s_b64u)');
        }

        unlockResult = await webAuthnManager.shamir3PassDecryptVrfKeypair({
          nearAccountId,
          kek_s_b64u: shamir.kek_s_b64u,
          ciphertextVrfB64u: shamir.ciphertextVrfB64u,
          serverKeyId: shamir.serverKeyId,
        });

        if (unlockResult.success) {
          const vrfStatus = await webAuthnManager.checkVrfStatus();
          const active = vrfStatus.active && vrfStatus.nearAccountId === nearAccountId;
          if (!active) {
            unlockResult = { success: false, error: 'VRF session inactive after Shamir3Pass' };
          }
          if (active) {
            // Proactive rotation if serverKeyId changed and we unlocked via Shamir
            await webAuthnManager.maybeProactiveShamirRefresh(nearAccountId);
          }
        } else {
          throw new Error(`Shamir3Pass auto-unlock failed: ${unlockResult.error}`);
        }
      } catch (error: any) {
        unlockResult = { success: false, error: error.message };
      }
    }

    // Fallback to TouchID if Shamir3Pass decryption failed
    if (!unlockResult.success) {
      const fallback = await fallbackUnlockVrfKeypairWithTouchId({
        webAuthnManager,
        nearAccountId,
        authenticators,
        userData,
        onEvent,
      });
      unlockResult = fallback.unlockResult;
      usedFallbackTouchId = fallback.usedFallbackTouchId;
      unlockCredential = fallback.unlockCredential;
      effectiveUserData = fallback.effectiveUserData;
      activeDeviceNumber = fallback.activeDeviceNumber;
    }

    if (!unlockResult.success) {
      throw new Error(`Failed to unlock VRF keypair: ${unlockResult.error}`);
    }

    onEvent?.({
      step: 3,
      phase: LoginPhase.STEP_3_VRF_UNLOCK,
      status: LoginStatus.SUCCESS,
      message: 'VRF keypair unlocked successfully'
    });

    // Proactive refresh: if Shamir3Pass failed and we used TouchID, re-encrypt under current server key
    try {
      const relayerUrl = context.configs.relayer?.url;
      if (usedFallbackTouchId && relayerUrl) {
        const refreshed = await webAuthnManager.shamir3PassEncryptCurrentVrfKeypair();
        await webAuthnManager.updateServerEncryptedVrfKeypair(nearAccountId, refreshed);
      }
    } catch (refreshErr: any) {
      console.warn('Non-fatal: Failed to refresh serverEncryptedVrfKeypair:', refreshErr?.message || refreshErr);
    }

    // Step 3: Update local data and return success
    // Ensure last-user deviceNumber reflects the passkey actually used for login.
    try {
      if (typeof activeDeviceNumber === 'number' && Number.isFinite(activeDeviceNumber)) {
        await webAuthnManager.setLastUser(nearAccountId, activeDeviceNumber);
      } else if (typeof userData.deviceNumber === 'number') {
        await webAuthnManager.setLastUser(nearAccountId, userData.deviceNumber);
      }
    } catch {
      // Non-fatal; continue even if last-user update fails.
    }
    await webAuthnManager.updateLastLogin(nearAccountId);

    const result: LoginResult = {
      success: true,
      loggedInNearAccountId: nearAccountId,
      // Ensure the clientNearPublicKey reflects the device whose VRF credentials
      // are actually active for this login.
      clientNearPublicKey: effectiveUserData?.clientNearPublicKey!, // non-null, validated above
      nearAccountId: nearAccountId
    };

    if (!deferCompletionHooks) {
      onEvent?.({
        step: 4,
        phase: LoginPhase.STEP_4_LOGIN_COMPLETE,
        status: LoginStatus.SUCCESS,
        message: 'Login completed successfully',
        nearAccountId: nearAccountId,
        clientNearPublicKey: effectiveUserData?.clientNearPublicKey || ''
      });
      afterCall?.(true, result);
    }
    return { result, usedFallbackTouchId, unlockCredential };

  } catch (error: any) {
    // Use centralized error handling
    const errorMessage = getUserFriendlyErrorMessage(error, 'login');

    onError?.(error);
    onEvent?.({
      step: 0,
      phase: LoginPhase.LOGIN_ERROR,
      status: LoginStatus.ERROR,
      message: errorMessage,
      error: errorMessage
    });

    const result: LoginResult = { success: false, error: errorMessage };
    afterCall?.(false);
    return { result, usedFallbackTouchId: false };
  }
}

/**
 * TouchID fallback path for VRF unlock.
 *
 * Used when Shamir 3-pass auto-unlock fails/unavailable:
 * - Prompts WebAuthn to obtain a serialized credential with PRF.first + PRF.second.
 * - Aligns the local encrypted VRF keypair blob with the passkey the user actually chose
 *   (important when multiple devices/passkeys exist for the same account).
 * - Unlocks the VRF keypair inside the VRF worker and returns updated effective user context.
 */
async function fallbackUnlockVrfKeypairWithTouchId(args: {
  webAuthnManager: PasskeyManagerContext['webAuthnManager'];
  nearAccountId: AccountId;
  authenticators: ClientAuthenticatorData[];
  userData: ClientUserData;
  onEvent?: (event: LoginSSEvent) => void;
}): Promise<{
  unlockResult: { success: boolean; error?: string };
  usedFallbackTouchId: boolean;
  unlockCredential: WebAuthnAuthenticationCredential;
  effectiveUserData: ClientUserData;
  activeDeviceNumber: number;
}> {
  const { webAuthnManager, nearAccountId, authenticators, userData, onEvent } = args;

  onEvent?.({
    step: 2,
    phase: LoginPhase.STEP_2_WEBAUTHN_ASSERTION,
    status: LoginStatus.PROGRESS,
    message: 'Logging in, unlocking VRF credentials...'
  });

  const challenge = createRandomVRFChallenge();
  const credential = await webAuthnManager.getAuthenticationCredentialsSerializedDualPrf({
    nearAccountId,
    challenge: challenge as VRFChallenge,
    credentialIds: authenticators.map((a) => a.credentialId),
  });

  let effectiveUserData = userData;
  let activeDeviceNumber = userData.deviceNumber;

  // If multiple authenticators exist, align VRF credentials with the passkey
  // the user actually chose, based on credentialId → deviceNumber.
  if (authenticators.length > 1) {
    const rawId = credential.rawId;
    const matched = authenticators.find(a => a.credentialId === rawId);
    if (matched) {
      try {
        const byDevice = await IndexedDBManager.clientDB.getUserByDevice(nearAccountId, matched.deviceNumber);
        if (byDevice) {
          effectiveUserData = byDevice;
          activeDeviceNumber = matched.deviceNumber;
        }
      } catch {
        // If lookup by device fails, fall back to the base userData.
      }
    }
  }

  const unlockResult = await webAuthnManager.unlockVRFKeypair({
    nearAccountId: nearAccountId,
    encryptedVrfKeypair: {
      encryptedVrfDataB64u: effectiveUserData.encryptedVrfKeypair.encryptedVrfDataB64u,
      chacha20NonceB64u: effectiveUserData.encryptedVrfKeypair.chacha20NonceB64u,
    },
    credential: credential,
  });

  return {
    unlockResult,
    usedFallbackTouchId: unlockResult.success,
    unlockCredential: credential,
    effectiveUserData,
    activeDeviceNumber,
  };
}

/**
 * High-level login snapshot used by React contexts/UI.
 *
 * Returns:
 * - `login`: derived from IndexedDB last-user pointer + VRF worker status
 * - `signingSession`: warm signing session status when available
 *
 * The `nearAccountId` argument is treated as a "query hint" and must match the
 * last logged-in account to be considered logged in (prevents accidental cross-account reads).
 */
export async function getLoginSession(
  context: PasskeyManagerContext,
  nearAccountId?: AccountId
): Promise<LoginSession> {
  const login = await getLoginStateInternal(context, nearAccountId);
  if (!login?.isLoggedIn || !login.nearAccountId) return { login, signingSession: null };
  try {
    const signingSession = await context.webAuthnManager.getWarmSigningSessionStatus(login.nearAccountId);
    return { login, signingSession };
  } catch {
    return { login, signingSession: null };
  }
}

/**
 * Internal helper for computing `LoginState`.
 *
 * Implementation detail:
 * - Trusts the IndexedDB last-user pointer for account selection, then confirms
 *   that the VRF worker is actually active for that same account.
 */
async function getLoginStateInternal(
  context: PasskeyManagerContext,
  nearAccountId?: AccountId
): Promise<LoginState> {
  const { webAuthnManager } = context;
  try {
    // Determine target account strictly from the last logged-in device.
    const lastUser = await webAuthnManager.getLastUser();
    const targetAccountId = nearAccountId ?? lastUser?.nearAccountId ?? null;

    // If caller requested a specific account, it must match the last logged-in account.
    if (!lastUser || (targetAccountId && lastUser.nearAccountId !== targetAccountId)) {
      return {
        isLoggedIn: false,
        nearAccountId: targetAccountId || null,
        publicKey: null,
        vrfActive: false,
        userData: null
      };
    }

    const userData = lastUser;
    const publicKey = userData?.clientNearPublicKey || null;

    // Check actual VRF worker status
    const vrfStatus = await webAuthnManager.checkVrfStatus();
    const vrfActive = vrfStatus.active && vrfStatus.nearAccountId === targetAccountId;

    // Determine if user is considered "logged in"
    // User is logged in if they have user data and VRF is active
    const isLoggedIn = !!(userData && userData.clientNearPublicKey && vrfActive);

    return {
      isLoggedIn,
      nearAccountId: targetAccountId,
      publicKey,
      vrfActive,
      userData,
      vrfSessionDuration: vrfStatus.sessionDuration || 0
    };

  } catch (error: any) {
    console.warn('Error getting login state:', error);
    return {
      isLoggedIn: false,
      nearAccountId: nearAccountId || null,
      publicKey: null,
      vrfActive: false,
      userData: null
    };
  }
}

/**
 * List recently used accounts from IndexedDB.
 *
 * Used for account picker UIs and initial app bootstrap state.
 */
export async function getRecentLogins(
  context: PasskeyManagerContext
): Promise<GetRecentLoginsResult> {
  const { webAuthnManager } = context;
  // Get all user accounts from IndexDB
  const allUsersData = await webAuthnManager.getAllUsers();
  const accountIds = allUsersData.map(user => user.nearAccountId);
  // Get last used account for initial state
  const lastUsedAccount = await webAuthnManager.getLastUser();
  return {
    accountIds,
    lastUsedAccount,
  };
}

/**
 * Clear the active VRF session and any client-side nonce caches.
 *
 * This is the canonical "logout" operation for the SDK (does not delete accounts).
 */
export async function logoutAndClearSession(context: PasskeyManagerContext): Promise<void> {
  const { webAuthnManager } = context;
  await webAuthnManager.clearVrfSession();
  try { webAuthnManager.getNonceManager().clear(); } catch {}
}
