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
import { createRandomVRFChallenge, VRFChallenge } from '../types/vrf-worker';
import { authenticatorsToAllowCredentials } from '../WebAuthnManager/touchIdPrompt';
import { IndexedDBManager } from '../IndexedDBManager';
import type { ClientAuthenticatorData, ClientUserData } from '../IndexedDBManager';
import { verifyAuthenticationResponse } from '../rpcCalls';
import { computeLoginIntentDigest } from '../digests/intentDigest';
import { buildThresholdSessionPolicy } from '../threshold/thresholdSessionPolicy';
import { parseDeviceNumber } from '../WebAuthnManager/SignerWorkerManager/getDeviceNumber';
import {
  clearAllCachedThresholdEd25519AuthSessions,
  makeThresholdEd25519AuthSessionCacheKey,
  mintThresholdEd25519AuthSession,
  putCachedThresholdEd25519AuthSession,
} from '../threshold/thresholdEd25519AuthSession';
import { normalizeThresholdEd25519ParticipantIds } from '../../threshold/participants';

type WarmSigningSessionPolicy = { ttlMs: number; remainingUses: number };

type ThresholdSessionPlan = {
  sessionKind: 'jwt';
  relayerUrl: string;
  relayerKeyId: string;
  cacheKey: string;
  policy: Awaited<ReturnType<typeof buildThresholdSessionPolicy>>;
  deviceNumber: number;
};

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
      return await finalizeLoginError({
        message: errorMessage,
        error: new Error(errorMessage),
        rollbackVrfOnFailure,
        onEvent,
        onError,
        afterCall,
        callAfterCall: false,
      });
    }

    const session = options?.session;
    const wantsServerSession = session !== undefined;
    const deviceNumberHint = parseDeviceNumber(options?.deviceNumber, { min: 1 });
    const base = await handleLoginUnlockVRF(
      context,
      nearAccountId,
      onEvent,
      onError,
      afterCall,
      // Defer final 'login-complete' event & afterCall until warm signing session is minted
      true,
      deviceNumberHint
    );
    // If base login failed, just return
    if (!base.result.success) {
      return base.result;
    }

    const preferredDeviceNumber = deviceNumberHint ?? base.activeDeviceNumber;
    const warmPolicy = resolveWarmSigningSessionPolicy(context, options);

    const wantsThresholdSession =
      webAuthnManager.getUserPreferences().getSignerMode().mode === 'threshold-signer';
    const relayUrl = (session?.relayUrl || context.configs.relayer.url).trim();
    const verifyRoute = (session?.route || '/verify-authentication-response').trim();

    const thresholdPlan = await prepareThresholdSessionPlan({
      context,
      nearAccountId,
      preferredDeviceNumber,
      relayUrl,
      ttlMs: warmPolicy.ttlMs,
      remainingUses: warmPolicy.remainingUses,
      wantsThresholdSession,
    });

    const wantsRelayerSession = wantsServerSession || thresholdPlan !== null;
    if (wantsRelayerSession && !relayUrl) {
      console.warn('[login] No relayUrl provided for session-style signing');
    }

    if (wantsRelayerSession && relayUrl) {
      return await runRelayerSessionFlow({
        context,
        nearAccountId,
        baseLoginResult: base.result,
        baseUnlockCredential: base.unlockCredential,
        preferredDeviceNumber,
        session,
        relayUrl,
        verifyRoute,
        thresholdPlan,
        warmPolicy,
        rollbackVrfOnFailure,
        onEvent,
        onError,
        afterCall,
      });
    }

    // No relayer session requested (or relayUrl missing): mint/refresh warm signing session only.
    await mintWarmSigningSession({
      context,
      nearAccountId,
      onEvent,
      credential: base.unlockCredential,
      ttlMs: warmPolicy.ttlMs,
      remainingUses: warmPolicy.remainingUses,
    });
    return await finalizeLoginSuccess({
      webAuthnManager,
      nearAccountId,
      loginResult: base.result,
      onEvent,
      afterCall,
    });
  } catch (err: any) {
    const errorMessage =
      getUserFriendlyErrorMessage(err, 'login') || err?.message || 'Login failed';
    return await finalizeLoginError({
      message: errorMessage,
      error: err,
      rollbackVrfOnFailure,
      onEvent,
      onError,
      afterCall,
    });
  }
}

function resolveWarmSigningSessionPolicy(
  context: PasskeyManagerContext,
  options?: LoginHooksOptions
): WarmSigningSessionPolicy {
  const defaults = context.configs.signingSessionDefaults;
  return {
    ttlMs: options?.signingSession?.ttlMs ?? defaults.ttlMs,
    remainingUses: options?.signingSession?.remainingUses ?? defaults.remainingUses,
  };
}

async function attachSigningSessionStatus(args: {
  webAuthnManager: PasskeyManagerContext['webAuthnManager'];
  nearAccountId: AccountId;
  loginResult: LoginResult;
}): Promise<LoginAndCreateSessionResult> {
  const { webAuthnManager, nearAccountId, loginResult } = args;
  if (!loginResult.success) return loginResult;
  try {
    const signingSession: SigningSessionStatus =
      await webAuthnManager.getWarmSigningSessionStatus(nearAccountId);
    return { ...loginResult, signingSession };
  } catch {
    return loginResult;
  }
}

async function finalizeLoginSuccess(args: {
  webAuthnManager: PasskeyManagerContext['webAuthnManager'];
  nearAccountId: AccountId;
  loginResult: LoginResult;
  onEvent?: (event: LoginSSEvent) => void;
  afterCall?: AfterCall<LoginAndCreateSessionResult>;
}): Promise<LoginAndCreateSessionResult> {
  const { webAuthnManager, nearAccountId, loginResult, onEvent, afterCall } = args;
  const finalResult = await attachSigningSessionStatus({
    webAuthnManager,
    nearAccountId,
    loginResult,
  });
  onEvent?.({
    step: 4,
    phase: LoginPhase.STEP_4_LOGIN_COMPLETE,
    status: LoginStatus.SUCCESS,
    message: 'Login completed successfully',
    nearAccountId,
    clientNearPublicKey: loginResult.clientNearPublicKey ?? '',
  });
  await afterCall?.(true, finalResult);
  return finalResult;
}

async function finalizeLoginError(args: {
  message: string;
  error?: unknown;
  rollbackVrfOnFailure: () => Promise<void>;
  onEvent?: (event: LoginSSEvent) => void;
  onError?: (error: Error) => void;
  afterCall?: AfterCall<LoginAndCreateSessionResult>;
  callOnError?: boolean;
  callAfterCall?: boolean;
}): Promise<LoginAndCreateSessionResult> {
  const {
    message,
    error,
    rollbackVrfOnFailure,
    onEvent,
    onError,
    afterCall,
    callOnError = true,
    callAfterCall = true,
  } = args;

  try { await rollbackVrfOnFailure(); } catch {}

  if (callOnError) {
    onError?.(error as any);
  }

  onEvent?.({
    step: 0,
    phase: LoginPhase.LOGIN_ERROR,
    status: LoginStatus.ERROR,
    message,
    error: message,
  });

  if (callAfterCall) {
    await afterCall?.(false);
  }
  return { success: false, error: message };
}

async function prepareThresholdSessionPlan(args: {
  context: PasskeyManagerContext;
  nearAccountId: AccountId;
  preferredDeviceNumber: number | null;
  relayUrl: string;
  ttlMs: number;
  remainingUses: number;
  wantsThresholdSession: boolean;
}): Promise<ThresholdSessionPlan | null> {
  const {
    context,
    nearAccountId,
    preferredDeviceNumber,
    relayUrl,
    ttlMs,
    remainingUses,
    wantsThresholdSession,
  } = args;
  if (!wantsThresholdSession || !relayUrl) return null;

  const { webAuthnManager } = context;

  try {
    const rpId = webAuthnManager.getRpId();
    if (!rpId) throw new Error('Missing rpId for threshold session');

    const lastUser = await webAuthnManager.getLastUser();
    const deviceNumber = preferredDeviceNumber ??
      (lastUser?.nearAccountId === nearAccountId
        ? lastUser.deviceNumber
        : (await IndexedDBManager.clientDB.getLastDBUpdatedUser(nearAccountId))
            ?.deviceNumber ?? null);

    if (deviceNumber === null) {
      console.warn('[login] threshold-signer configured but no threshold key material found; skipping threshold session');
      return null;
    }

    const thresholdKeyMaterial = await IndexedDBManager.nearKeysDB.getThresholdKeyMaterial(
      nearAccountId,
      deviceNumber
    );
    const relayerKeyId = thresholdKeyMaterial?.relayerKeyId || null;
    const participantIds = thresholdKeyMaterial?.participants?.map((p) => p.id) || null;
    const normalizedParticipantIds = normalizeThresholdEd25519ParticipantIds(participantIds);

    if (!relayerKeyId) {
      console.warn('[login] threshold-signer configured but no threshold key material found; skipping threshold session');
      return null;
    }

    if (!normalizedParticipantIds || normalizedParticipantIds.length < 2) {
      console.warn('[login] threshold key material missing/invalid participantIds; skipping threshold session mint');
      return null;
    }

    const policy = await buildThresholdSessionPolicy({
      nearAccountId,
      rpId,
      relayerKeyId,
      ...(normalizedParticipantIds?.length ? { participantIds: normalizedParticipantIds } : {}),
      ttlMs,
      remainingUses,
    });

    const cacheKey = makeThresholdEd25519AuthSessionCacheKey({
      nearAccountId,
      rpId,
      relayerUrl: relayUrl,
      relayerKeyId,
      ...(normalizedParticipantIds?.length ? { participantIds: normalizedParticipantIds } : {}),
    });

    return {
      sessionKind: 'jwt',
      relayerUrl: relayUrl,
      relayerKeyId,
      cacheKey,
      policy,
      deviceNumber,
    };
  } catch (e: any) {
    console.warn(
      '[login] failed to prepare threshold session policy; skipping threshold session mint:',
      e?.message || e
    );
    return null;
  }
}

async function mintThresholdSessionBestEffort(args: {
  context: PasskeyManagerContext;
  nearAccountId: AccountId;
  plan: ThresholdSessionPlan;
  vrfChallenge: VRFChallenge;
  credential: WebAuthnAuthenticationCredential;
}): Promise<void> {
  const { context, nearAccountId, plan, vrfChallenge, credential } = args;
  const { webAuthnManager } = context;

  let clientVerifyingShareB64u: string | null = null;
  try {
    const localKeyMaterial = await IndexedDBManager.nearKeysDB.getLocalKeyMaterial(
      nearAccountId,
      plan.deviceNumber
    );
    const wrapKeySalt = String(localKeyMaterial?.wrapKeySalt || '').trim();
    if (wrapKeySalt) {
      const derived =
        await webAuthnManager.deriveThresholdEd25519ClientVerifyingShareFromCredential({
          credential,
          nearAccountId,
          wrapKeySalt,
        });
      if (derived.success && derived.clientVerifyingShareB64u) {
        clientVerifyingShareB64u = derived.clientVerifyingShareB64u;
      }
    }
  } catch (e: any) {
    console.warn(
      '[login] failed to derive clientVerifyingShareB64u for threshold session mint:',
      e?.message || e
    );
  }

  if (!clientVerifyingShareB64u) {
    console.warn(
      '[login] threshold session mint skipped: missing clientVerifyingShareB64u'
    );
    return;
  }

  const minted = await mintThresholdEd25519AuthSession({
    relayerUrl: plan.relayerUrl,
    sessionKind: plan.sessionKind,
    relayerKeyId: plan.relayerKeyId,
    clientVerifyingShareB64u,
    sessionPolicy: plan.policy.policy,
    vrfChallenge,
    webauthnAuthentication: credential,
  });

  if (minted.ok && minted.jwt) {
    putCachedThresholdEd25519AuthSession(plan.cacheKey, {
      sessionKind: plan.sessionKind,
      policy: plan.policy.policy,
      policyJson: plan.policy.policyJson,
      sessionPolicyDigest32: plan.policy.sessionPolicyDigest32,
      jwt: minted.jwt,
      ...(minted.expiresAtMs ? { expiresAtMs: minted.expiresAtMs } : {}),
    });
    return;
  }

  if (!minted.ok) {
    console.warn(
      '[login] threshold session mint failed:',
      minted.code || minted.message || 'unknown error'
    );
  }
}

async function runRelayerSessionFlow(args: {
  context: PasskeyManagerContext;
  nearAccountId: AccountId;
  baseLoginResult: LoginResult;
  baseUnlockCredential?: WebAuthnAuthenticationCredential;
  preferredDeviceNumber: number | null;
  session: LoginHooksOptions['session'] | undefined;
  relayUrl: string;
  verifyRoute: string;
  thresholdPlan: ThresholdSessionPlan | null;
  warmPolicy: WarmSigningSessionPolicy;
  rollbackVrfOnFailure: () => Promise<void>;
  onEvent?: (event: LoginSSEvent) => void;
  onError?: (error: Error) => void;
  afterCall?: AfterCall<LoginAndCreateSessionResult>;
}): Promise<LoginAndCreateSessionResult> {
  const {
    context,
    nearAccountId,
    baseLoginResult,
    baseUnlockCredential,
    preferredDeviceNumber,
    session,
    relayUrl,
    verifyRoute,
    thresholdPlan,
    warmPolicy,
    rollbackVrfOnFailure,
    onEvent,
    onError,
    afterCall,
  } = args;

  const { webAuthnManager } = context;

  try {
    const rpId = webAuthnManager.getRpId();
    if (!rpId) {
      throw new Error('Missing rpId for VRF challenge generation during login');
    }

    const blockInfo = await context.nearClient.viewBlock({ finality: 'final' });
    const txBlockHash = blockInfo?.header?.hash;
    const txBlockHeight = String(blockInfo.header?.height ?? '');
    const intentDigest = await computeLoginIntentDigest({ nearAccountId, rpId });
    const vrfChallenge = await webAuthnManager.generateVrfChallengeOnce({
      userId: nearAccountId,
      rpId,
      blockHash: txBlockHash,
      blockHeight: txBlockHeight,
      intentDigest,
      ...(thresholdPlan ? { sessionPolicyDigest32: thresholdPlan.policy.sessionPolicyDigest32 } : {}),
    });

    const authenticators = await webAuthnManager.getAuthenticatorsByUser(nearAccountId);
    const authenticatorsForPrompt = prioritizeAuthenticatorsByDeviceNumber(
      authenticators,
      preferredDeviceNumber
    );
    const credential = await webAuthnManager.getAuthenticationCredentialsSerialized({
      nearAccountId,
      challenge: vrfChallenge,
      allowCredentials: authenticatorsToAllowCredentials(authenticatorsForPrompt),
    });

    const effectiveLoginResult = await bindVrfToSelectedLoginPasskeyDevice({
      webAuthnManager,
      nearAccountId,
      authenticators,
      credential,
      baseUnlockCredential,
      baseLoginResult: baseLoginResult,
    });

    await mintWarmSigningSession({
      context,
      nearAccountId,
      onEvent,
      credential,
      ttlMs: warmPolicy.ttlMs,
      remainingUses: warmPolicy.remainingUses,
    });

    let serverSessionJwt: string | undefined;
    if (session) {
      const v = await verifyAuthenticationResponse(
        relayUrl,
        verifyRoute,
        session.kind,
        vrfChallenge,
        credential
      );
      if (!v.success || !v.verified) {
        const errMsg = v.error || 'Session verification failed';
        return await finalizeLoginError({
          message: errMsg,
          rollbackVrfOnFailure,
          onEvent,
          afterCall,
          callOnError: false,
        });
      }
      serverSessionJwt = v.jwt;
    }

    if (thresholdPlan) {
      await mintThresholdSessionBestEffort({
        context,
        nearAccountId,
        plan: thresholdPlan,
        vrfChallenge,
        credential,
      });
    }

    const loginResult: LoginResult = serverSessionJwt
      ? { ...effectiveLoginResult, jwt: serverSessionJwt }
      : effectiveLoginResult;

    return await finalizeLoginSuccess({
      webAuthnManager,
      nearAccountId,
      loginResult,
      onEvent,
      afterCall,
    });
  } catch (e: any) {
    console.error('[login] Failed to start session:', e);
    const errMsg =
      getUserFriendlyErrorMessage(e, 'login') ||
      e?.message ||
      'Session verification failed';
    return await finalizeLoginError({
      message: errMsg,
      error: e,
      rollbackVrfOnFailure,
      onEvent,
      onError,
      afterCall,
    });
  }
}

/**
 * When multiple passkeys exist for the same account, the user can select any of them in the WebAuthn prompt.
 * If the VRF worker was auto-unlocked using a different device (e.g. Shamir 3-pass based on the "latest" row),
 * we must rebind the VRF worker to the same deviceNumber as the selected credential. Otherwise, WrapKeySeed
 * derivation can mix PRF.first(from selected credential) with vrf_sk(from a different device), which later
 * causes vault decryption failures (e.g. `aead::Error` during private key export).
 */
async function bindVrfToSelectedLoginPasskeyDevice(args: {
  webAuthnManager: PasskeyManagerContext['webAuthnManager'];
  nearAccountId: AccountId;
  authenticators: ClientAuthenticatorData[];
  credential: WebAuthnAuthenticationCredential;
  baseUnlockCredential?: WebAuthnAuthenticationCredential;
  baseLoginResult: LoginResult;
}): Promise<LoginResult> {
  const {
    webAuthnManager,
    nearAccountId,
    authenticators,
    credential,
    baseUnlockCredential,
    baseLoginResult,
  } = args;

  // Start with the base login result (may reflect whichever VRF keypair was auto-unlocked).
  // If the user selects a different passkey below, update it to match the chosen device.
  let effectiveLoginResult = baseLoginResult;

  if (authenticators.length <= 1) {
    return effectiveLoginResult;
  }

  const rawId = credential.rawId;
  const matched = authenticators.find((a) => a.credentialId === rawId);
  const selectedDeviceNumber = matched?.deviceNumber ?? null;

  if (selectedDeviceNumber === null) {
    return effectiveLoginResult;
  }

  const userForDevice = await IndexedDBManager.clientDB
    .getUserByDevice(nearAccountId, selectedDeviceNumber)
    .catch(() => null);

  if (userForDevice?.clientNearPublicKey) {
    effectiveLoginResult = {
      ...effectiveLoginResult,
      clientNearPublicKey: userForDevice.clientNearPublicKey,
    };
  }

  const shouldRebindVrf = !baseUnlockCredential || baseUnlockCredential.rawId !== rawId;
  if (shouldRebindVrf) {
    const shamir = userForDevice?.serverEncryptedVrfKeypair;
    if (!shamir?.ciphertextVrfB64u || !shamir?.kek_s_b64u || !shamir?.serverKeyId) {
      throw new Error(
        `Missing serverEncryptedVrfKeypair for account ${nearAccountId} device ${selectedDeviceNumber}. ` +
        'Open the wallet once online to refresh local state, then try again.'
      );
    }

    const unlock = await webAuthnManager.shamir3PassDecryptVrfKeypair({
      nearAccountId,
      kek_s_b64u: shamir.kek_s_b64u,
      ciphertextVrfB64u: shamir.ciphertextVrfB64u,
      serverKeyId: shamir.serverKeyId,
    });
    if (!unlock.success) {
      throw new Error(
        unlock.error ||
        'Failed to bind VRF keypair to the passkey you selected. Please try again.'
      );
    }
  }

  // Persist the deviceNumber that the user actually selected so subsequent flows (export/signing)
  // use the correct vault entry.
  await webAuthnManager.setLastUser(nearAccountId, selectedDeviceNumber);
  // Best-effort: stamp the selected device as the one last used for login.
  await webAuthnManager.updateLastLogin(nearAccountId).catch(() => undefined);

  return effectiveLoginResult;
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
  afterCall?: AfterCall<LoginAndCreateSessionResult>,
  deferCompletionHooks?: boolean,
  deviceNumberHint: number | null = null,
): Promise<{
  result: LoginResult;
  usedFallbackTouchId: boolean;
  unlockCredential?: WebAuthnAuthenticationCredential;
  activeDeviceNumber: number | null;
}> {
  const { webAuthnManager } = context;

  try {
    // Step 1: Get VRF credentials and authenticators, and validate them
    const hintUserPromise: Promise<ClientUserData | null> =
      deviceNumberHint !== null
        ? webAuthnManager.getUserByDevice(nearAccountId, deviceNumberHint).catch(() => null)
        : Promise.resolve(null);

    const [hintUser, lastUser, latestByAccount, authenticators] = await Promise.all([
      hintUserPromise,
      webAuthnManager.getLastUser(),
      IndexedDBManager.clientDB.getLastDBUpdatedUser(nearAccountId),
      webAuthnManager.getAuthenticatorsByUser(nearAccountId),
    ]);

    // Prefer the most recently updated record for this account; fall back to lastUser pointer.
    let userData: ClientUserData | null = null;
    if (hintUser && hintUser.nearAccountId === nearAccountId) {
      userData = hintUser;
    } else if (latestByAccount && latestByAccount.nearAccountId === nearAccountId) {
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

    const shamir = userData.serverEncryptedVrfKeypair;
    const relayerUrl = context.configs.relayer?.url;
    const useShamir3PassVRFKeyUnlock = !!relayerUrl && !!shamir?.serverKeyId;

    if (useShamir3PassVRFKeyUnlock && shamir) {
      try {
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
      const authenticatorsForPrompt = prioritizeAuthenticatorsByDeviceNumber(authenticators, deviceNumberHint);
      const fallback = await fallbackUnlockVrfKeypairWithTouchId({
        webAuthnManager,
        nearAccountId,
        authenticators: authenticatorsForPrompt,
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
      message: 'VRF keypair unlocked...'
    });

    // Proactive refresh: if Shamir3Pass failed and we used TouchID, re-encrypt under current server key
    try {
      const relayerUrl = context.configs.relayer?.url;
      if (usedFallbackTouchId && relayerUrl) {
        const refreshed = await webAuthnManager.shamir3PassEncryptCurrentVrfKeypair();
        await webAuthnManager.updateServerEncryptedVrfKeypair(nearAccountId, refreshed, activeDeviceNumber);
      }
    } catch (refreshErr: any) {
      console.warn('Non-fatal: Failed to refresh serverEncryptedVrfKeypair:', refreshErr?.message || refreshErr);
    }

    // Step 3: Update local data and return success
    // Ensure last-user deviceNumber reflects the passkey actually used for login.
    try {
      await webAuthnManager.setLastUser(nearAccountId, activeDeviceNumber);
    } catch {
      // Non-fatal; continue even if last-user update fails.
    }
    await webAuthnManager.updateLastLogin(nearAccountId);

    const result: LoginResult = {
      success: true,
      loggedInNearAccountId: nearAccountId,
      // Ensure the clientNearPublicKey reflects the device whose VRF credentials
      // are actually active for this login.
      clientNearPublicKey: effectiveUserData.clientNearPublicKey,
      nearAccountId: nearAccountId
    };

    if (!deferCompletionHooks) {
      onEvent?.({
        step: 4,
        phase: LoginPhase.STEP_4_LOGIN_COMPLETE,
        status: LoginStatus.SUCCESS,
        message: 'Login completed successfully',
        nearAccountId: nearAccountId,
        clientNearPublicKey: effectiveUserData.clientNearPublicKey
      });
      afterCall?.(true, result);
    }
    return { result, usedFallbackTouchId, unlockCredential, activeDeviceNumber };

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
    return { result, usedFallbackTouchId: false, activeDeviceNumber: null };
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
  // Best-effort VRF logout. Do not block logout indefinitely if the VRF worker is
  // stuck (e.g., an in-flight confirmation/signing flow).
  try {
    const clear = webAuthnManager.clearVrfSession().catch(() => undefined);
    await Promise.race([clear, new Promise<void>((resolve) => setTimeout(resolve, 2000))]);
  } catch {}
  // Ensure all ephemeral signing state is torn down so the next login starts cleanly.
  try { webAuthnManager.resetSigningState(); } catch {}
  try { webAuthnManager.getNonceManager().clear(); } catch {}
  try { clearAllCachedThresholdEd25519AuthSessions(); } catch {}
}

function prioritizeAuthenticatorsByDeviceNumber(
  authenticators: ClientAuthenticatorData[],
  deviceNumber: number | null
): ClientAuthenticatorData[] {
  if (authenticators.length <= 1) return authenticators;
  if (deviceNumber === null) return authenticators;
  const preferred = authenticators.filter((a) => a.deviceNumber === deviceNumber);
  if (preferred.length === 0) return authenticators;
  const rest = authenticators.filter((a) => a.deviceNumber !== deviceNumber);
  return [...preferred, ...rest];
}
