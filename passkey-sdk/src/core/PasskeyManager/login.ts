import type {
  LoginHooksOptions,
  LoginResult,
  LoginState,
  LoginSSEvent,
  AfterCall,
  BeforeCall,
  GetRecentLoginsResult,
} from '../types/passkeyManager';
import { LoginPhase, LoginStatus } from '../types/passkeyManager';
import type { PasskeyManagerContext } from './index';
import type { AccountId } from '../types/accountIds';
import type { WebAuthnAuthenticationCredential } from '../types/webauthn';
import { getUserFriendlyErrorMessage } from '../../utils/errors';
import { createRandomVRFChallenge, ServerEncryptedVrfKeypair, VRFChallenge } from '../types/vrf-worker';
import { authenticatorsToAllowCredentials} from '../WebAuthnManager/touchIdPrompt';

/**
 * Core login function that handles passkey authentication without React dependencies
 */
export async function loginPasskey(
  context: PasskeyManagerContext,
  nearAccountId: AccountId,
  options?: LoginHooksOptions
): Promise<LoginResult> {

  const { onEvent, onError, beforeCall, afterCall } = options || {};
  // Emit started event
  onEvent?.({
    step: 1,
    phase: LoginPhase.STEP_1_PREPARATION,
    status: LoginStatus.PROGRESS,
    message: `Starting login for ${nearAccountId}`
  });

  try {
    // Run beforeCall hook
    await beforeCall?.();

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
      afterCall?.(false, result);
      return result;
    }

    // Handle login and unlock VRF keypair in VRF WASM worker for WebAuthn challenge generation
    return await handleLoginUnlockVRF(
      context,
      nearAccountId,
      onEvent,
      onError,
      beforeCall,
      afterCall
    );

  } catch (err: any) {
    onError?.(err);
    onEvent?.({
      step: 0,
      phase: LoginPhase.LOGIN_ERROR,
      status: LoginStatus.ERROR,
      message: err.message,
      error: err.message
    });
    const result = { success: false, error: err.message };
    afterCall?.(false, result);
    return result;
  }
}

/**
 * Handle onchain (serverless) login using VRF flow per docs/vrf_challenges.md
 *
 * VRF AUTHENTICATION FLOW:
 * 1. Unlock VRF keypair in Service Worker memory using PRF
 *      - Check if user has VRF credentials stored locally
 *      - Decrypt VRF keypair using PRF from WebAuthn ceremony
 * 2. Generate VRF challenge using stored VRF keypair + NEAR block data (no TouchID needed)
 * 3. Use VRF output as WebAuthn challenge for authentication
 * 4. Verify VRF proof and WebAuthn response on contract simultaneously
 *      - VRF proof assures WebAuthn challenge is fresh and valid (replay protection)
 *      - WebAuthn verification for origin + biometric credentials + device authenticity
 *
 * BENEFITS OF VRF FLOW:
 * - Single WebAuthn authentication to unlock VRF keys to generate WebAuthn challenges
 *   - VRF keypair persists in-memory in VRF Worker until logout
 *   - Subsequent authentications can generate VRF challenges without additional TouchID
 * - Provides cryptographically verifiable, stateless authentication
 * - Uses NEAR block data for freshness guarantees
 * - Follows RFC-compliant VRF challenge construction
 * - Eliminates server-side session state
 */
async function handleLoginUnlockVRF(
  context: PasskeyManagerContext,
  nearAccountId: AccountId,
  onEvent?: (event: LoginSSEvent) => void,
  onError?: (error: Error) => void,
  beforeCall?: BeforeCall,
  afterCall?: AfterCall<any>,
): Promise<LoginResult> {

  const { webAuthnManager } = context;

  try {

    // Step 1: Get VRF credentials and authenticators, and validate them
    const {
      userData,
      authenticators
    } = await Promise.all([
      webAuthnManager.getUser(nearAccountId),
      webAuthnManager.getAuthenticatorsByUser(nearAccountId),
    ]).then(([userData, authenticators]) => {
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
      return { userData, authenticators };
    });

    // Step 2: Try Shamir 3-pass commutative unlock first (no TouchID required), fallback to TouchID
    onEvent?.({
      step: 2,
      phase: LoginPhase.STEP_2_WEBAUTHN_ASSERTION,
      status: LoginStatus.PROGRESS,
      message: 'Attempting to unlock VRF keypair...'
    });

    let unlockResult: { success: boolean; error?: string } = { success: false };

    const hasServerEncrypted = !!userData.serverEncryptedVrfKeypair;
    const relayerUrl = context.configs.relayer?.url;
    const useShamir3PassVRFKeyUnlock = hasServerEncrypted && !!relayerUrl;

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
        });

        if (unlockResult.success) {
          const vrfStatus = await webAuthnManager.checkVrfStatus();
          const active = vrfStatus.active && vrfStatus.nearAccountId === nearAccountId;
          if (!active) {
            unlockResult = { success: false, error: 'VRF session inactive after Shamir3Pass' };
          }
        } else {
          console.error('Shamir3Pass unlock failed:', unlockResult.error);
          throw new Error(`Shamir3Pass unlock failed: ${unlockResult.error}`);
        }
      } catch (error: any) {
        console.warn('Shamir3Pass unlock error, falling back to TouchID:', error.message);
        unlockResult = { success: false, error: error.message };
      }
    }

    // Fallback to TouchID if Shamir3Pass decryption failed
    if (!unlockResult.success) {
      console.debug('Falling back to TouchID authentication for VRF unlock');
      onEvent?.({
        step: 2,
        phase: LoginPhase.STEP_2_WEBAUTHN_ASSERTION,
        status: LoginStatus.PROGRESS,
        message: 'Authenticating with TouchID to unlock VRF keypair...'
      });

      // Get credential for VRF unlock
      const challenge = createRandomVRFChallenge();
      const credential = await webAuthnManager.getAuthenticationCredentialsSerialized({
        nearAccountId,
        challenge: challenge as VRFChallenge,
        allowCredentials: authenticatorsToAllowCredentials(authenticators),
      });

      unlockResult = await webAuthnManager.unlockVRFKeypair({
        nearAccountId: nearAccountId,
        encryptedVrfKeypair: {
          encryptedVrfDataB64u: userData.encryptedVrfKeypair.encryptedVrfDataB64u,
          chacha20NonceB64u: userData.encryptedVrfKeypair.chacha20NonceB64u,
        },
        credential: credential,
      });
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

    // Step 3: Update local data and return success
    await webAuthnManager.updateLastLogin(nearAccountId);

    const result: LoginResult = {
      success: true,
      loggedInNearAccountId: nearAccountId,
      clientNearPublicKey: userData?.clientNearPublicKey!, // non-null, validated above
      nearAccountId: nearAccountId
    };

    onEvent?.({
      step: 4,
      phase: LoginPhase.STEP_4_LOGIN_COMPLETE,
      status: LoginStatus.SUCCESS,
      message: 'Login completed successfully',
      nearAccountId: nearAccountId,
      clientNearPublicKey: userData?.clientNearPublicKey || ''
    });

    afterCall?.(true, result);
    return result;

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

    const result = { success: false, error: errorMessage };
    afterCall?.(false, result);
    return result;
  }
}

export async function getLoginState(
  context: PasskeyManagerContext,
  nearAccountId?: AccountId
): Promise<LoginState> {
  const { webAuthnManager } = context;
  try {
    // Determine target account ID
    let targetAccountId = nearAccountId;
    if (!targetAccountId) {
      const lastUsedAccountId = await webAuthnManager.getLastUsedNearAccountId() || undefined;
      targetAccountId = lastUsedAccountId?.nearAccountId || undefined;
    }
    if (!targetAccountId) {
      return {
        isLoggedIn: false,
        nearAccountId: null,
        publicKey: null,
        vrfActive: false,
        userData: null
      };
    }

    // Get comprehensive user data from IndexedDB (single call instead of two)
    const userData = await webAuthnManager.getUser(targetAccountId);
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

export async function getRecentLogins(
  context: PasskeyManagerContext
): Promise<GetRecentLoginsResult> {
  const { webAuthnManager } = context;
  // Get all user accounts from IndexDB
  const allUsersData = await webAuthnManager.getAllUserData();
  const accountIds = allUsersData.map(user => user.nearAccountId);
  // Get last used account for initial state
  const lastUsedAccountId = await webAuthnManager.getLastUsedNearAccountId();
  return {
    accountIds,
    lastUsedAccountId,
  }
}

export async function logoutAndClearVrfSession(context: PasskeyManagerContext): Promise<void> {
  console.log("LOGOUT AND CLEAR VRF SESSION");
  const { webAuthnManager } = context;
  await webAuthnManager.clearVrfSession();
  try { webAuthnManager.getNonceManager().clear(); } catch {}
}

/**
 * Verify authentication response through relay server
 * Routes the request to relay server which calls the web3authn contract for verification
 * and issues a JWT or session credential
 */
export async function verifyAuthenticationResponse(
  relayServerUrl: string,
  vrfChallenge: VRFChallenge,
  webauthnAuthentication: WebAuthnAuthenticationCredential
): Promise<{
  success: boolean;
  verified?: boolean;
  jwt?: string;
  sessionCredential?: any;
  error?: string;
  contractResponse?: any;
}> {
  try {
    const response = await fetch(`${relayServerUrl}/verify-authentication-response`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        vrfChallenge: vrfChallenge,
        webauthnAuthentication: webauthnAuthentication,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `HTTP ${response.status}: ${errorText}`,
      };
    }

    const result = await response.json();
    return {
      success: true,
      verified: result.verified,
      jwt: result.jwt,
      sessionCredential: result.sessionCredential,
      contractResponse: result.contractResponse,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to verify authentication response',
    };
  }
}
