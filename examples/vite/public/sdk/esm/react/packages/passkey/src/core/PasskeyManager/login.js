import { createRandomVRFChallenge } from "../types/vrf-worker.js";
import { getUserFriendlyErrorMessage } from "../../utils/errors.js";
import { LoginPhase, LoginStatus } from "../types/passkeyManager.js";

//#region src/core/PasskeyManager/login.ts
/**
* Core login function that handles passkey authentication without React dependencies
*/
async function loginPasskey(context, nearAccountId, options) {
	const { onEvent, onError, hooks } = options || {};
	onEvent?.({
		step: 1,
		phase: LoginPhase.STEP_1_PREPARATION,
		status: LoginStatus.PROGRESS,
		message: `Starting login for ${nearAccountId}`
	});
	try {
		await hooks?.beforeCall?.();
		if (!window.isSecureContext) {
			const errorMessage = "Passkey operations require a secure context (HTTPS or localhost).";
			const error = new Error(errorMessage);
			onError?.(error);
			onEvent?.({
				step: 0,
				phase: LoginPhase.LOGIN_ERROR,
				status: LoginStatus.ERROR,
				message: errorMessage,
				error: errorMessage
			});
			const result = {
				success: false,
				error: errorMessage
			};
			hooks?.afterCall?.(false, result);
			return result;
		}
		return await handleLoginUnlockVRF(context, nearAccountId, onEvent, onError, hooks);
	} catch (err) {
		onError?.(err);
		onEvent?.({
			step: 0,
			phase: LoginPhase.LOGIN_ERROR,
			status: LoginStatus.ERROR,
			message: err.message,
			error: err.message
		});
		const result = {
			success: false,
			error: err.message
		};
		hooks?.afterCall?.(false, result);
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
async function handleLoginUnlockVRF(context, nearAccountId, onEvent, onError, hooks) {
	const { webAuthnManager } = context;
	try {
		const { userData, authenticators } = await Promise.all([webAuthnManager.getUser(nearAccountId), webAuthnManager.getAuthenticatorsByUser(nearAccountId)]).then(([userData$1, authenticators$1]) => {
			if (!userData$1) throw new Error(`User data not found for ${nearAccountId} in IndexedDB. Please register an account.`);
			if (!userData$1.clientNearPublicKey) throw new Error(`No NEAR public key found for ${nearAccountId}. Please register an account.`);
			if (!userData$1.encryptedVrfKeypair?.encryptedVrfDataB64u || !userData$1.encryptedVrfKeypair?.chacha20NonceB64u) throw new Error("No VRF credentials found. Please register an account.");
			if (authenticators$1.length === 0) throw new Error(`No authenticators found for account ${nearAccountId}. Please register.`);
			return {
				userData: userData$1,
				authenticators: authenticators$1
			};
		});
		onEvent?.({
			step: 2,
			phase: LoginPhase.STEP_2_WEBAUTHN_ASSERTION,
			status: LoginStatus.PROGRESS,
			message: "Attempting to unlock VRF keypair..."
		});
		let unlockResult = { success: false };
		const hasServerEncrypted = !!userData.serverEncryptedVrfKeypair;
		const relayerUrl = context.configs.relayer?.url;
		const useShamir3PassVRFKeyUnlock = hasServerEncrypted && !!relayerUrl;
		if (useShamir3PassVRFKeyUnlock) try {
			const shamir = userData.serverEncryptedVrfKeypair;
			if (!shamir.ciphertextVrfB64u || !shamir.kek_s_b64u) throw new Error("Missing Shamir3Pass fields (ciphertextVrfB64u/kek_s_b64u)");
			unlockResult = await webAuthnManager.shamir3PassDecryptVrfKeypair({
				nearAccountId,
				kek_s_b64u: shamir.kek_s_b64u,
				ciphertextVrfB64u: shamir.ciphertextVrfB64u
			});
			if (unlockResult.success) {
				const vrfStatus = await webAuthnManager.checkVrfStatus();
				const active = vrfStatus.active && vrfStatus.nearAccountId === nearAccountId;
				if (!active) unlockResult = {
					success: false,
					error: "VRF session inactive after Shamir3Pass"
				};
			} else {
				console.error("Shamir3Pass unlock failed:", unlockResult.error);
				throw new Error(`Shamir3Pass unlock failed: ${unlockResult.error}`);
			}
		} catch (error) {
			console.warn("Shamir3Pass unlock error, falling back to TouchID:", error.message);
			unlockResult = {
				success: false,
				error: error.message
			};
		}
		if (!unlockResult.success) {
			console.debug("Falling back to TouchID authentication for VRF unlock");
			onEvent?.({
				step: 2,
				phase: LoginPhase.STEP_2_WEBAUTHN_ASSERTION,
				status: LoginStatus.PROGRESS,
				message: "Authenticating with TouchID to unlock VRF keypair..."
			});
			const challenge = createRandomVRFChallenge();
			const credential = await webAuthnManager.getCredentials({
				nearAccountId,
				challenge,
				authenticators
			});
			unlockResult = await webAuthnManager.unlockVRFKeypair({
				nearAccountId,
				encryptedVrfKeypair: {
					encryptedVrfDataB64u: userData.encryptedVrfKeypair.encryptedVrfDataB64u,
					chacha20NonceB64u: userData.encryptedVrfKeypair.chacha20NonceB64u
				},
				credential
			});
		}
		if (!unlockResult.success) throw new Error(`Failed to unlock VRF keypair: ${unlockResult.error}`);
		onEvent?.({
			step: 3,
			phase: LoginPhase.STEP_3_VRF_UNLOCK,
			status: LoginStatus.SUCCESS,
			message: "VRF keypair unlocked successfully"
		});
		await webAuthnManager.updateLastLogin(nearAccountId);
		await webAuthnManager.setLastUser(nearAccountId);
		const result = {
			success: true,
			loggedInNearAccountId: nearAccountId,
			clientNearPublicKey: userData?.clientNearPublicKey,
			nearAccountId
		};
		onEvent?.({
			step: 4,
			phase: LoginPhase.STEP_4_LOGIN_COMPLETE,
			status: LoginStatus.SUCCESS,
			message: "Login completed successfully",
			nearAccountId,
			clientNearPublicKey: userData?.clientNearPublicKey || ""
		});
		hooks?.afterCall?.(true, result);
		return result;
	} catch (error) {
		const errorMessage = getUserFriendlyErrorMessage(error, "login");
		onError?.(error);
		onEvent?.({
			step: 0,
			phase: LoginPhase.LOGIN_ERROR,
			status: LoginStatus.ERROR,
			message: errorMessage,
			error: errorMessage
		});
		const result = {
			success: false,
			error: errorMessage
		};
		hooks?.afterCall?.(false, result);
		return result;
	}
}
async function getLoginState(context, nearAccountId) {
	const { webAuthnManager } = context;
	try {
		let targetAccountId = nearAccountId;
		if (!targetAccountId) {
			const lastUsedAccountId = await webAuthnManager.getLastUsedNearAccountId() || void 0;
			targetAccountId = lastUsedAccountId?.nearAccountId || void 0;
		}
		if (!targetAccountId) return {
			isLoggedIn: false,
			nearAccountId: null,
			publicKey: null,
			vrfActive: false,
			userData: null
		};
		const userData = await webAuthnManager.getUser(targetAccountId);
		const publicKey = userData?.clientNearPublicKey || null;
		const vrfStatus = await webAuthnManager.checkVrfStatus();
		const vrfActive = vrfStatus.active && vrfStatus.nearAccountId === targetAccountId;
		const isLoggedIn = !!(userData && userData.clientNearPublicKey && vrfActive);
		return {
			isLoggedIn,
			nearAccountId: targetAccountId,
			publicKey,
			vrfActive,
			userData,
			vrfSessionDuration: vrfStatus.sessionDuration || 0
		};
	} catch (error) {
		console.warn("Error getting login state:", error);
		return {
			isLoggedIn: false,
			nearAccountId: nearAccountId || null,
			publicKey: null,
			vrfActive: false,
			userData: null
		};
	}
}
async function getRecentLogins(context) {
	const { webAuthnManager } = context;
	const allUsersData = await webAuthnManager.getAllUserData();
	const accountIds = allUsersData.map((user) => user.nearAccountId);
	const lastUsedAccountId = await webAuthnManager.getLastUsedNearAccountId();
	return {
		accountIds,
		lastUsedAccountId
	};
}
async function logoutAndClearVrfSession(context) {
	console.log("LOGOUT AND CLEAR VRF SESSION");
	const { webAuthnManager } = context;
	await webAuthnManager.clearVrfSession();
}

//#endregion
export { getLoginState, getRecentLogins, loginPasskey, logoutAndClearVrfSession };
//# sourceMappingURL=login.js.map