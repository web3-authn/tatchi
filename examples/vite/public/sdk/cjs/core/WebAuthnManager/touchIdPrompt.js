const require_base64 = require('../../utils/base64.js');
const require_vrf_worker = require('../types/vrf-worker.js');

//#region src/core/WebAuthnManager/touchIdPrompt.ts
/**
* Generate ChaCha20Poly1305 salt using account-specific HKDF for encryption key derivation
* @param nearAccountId - NEAR account ID to scope the salt to
* @returns 32-byte Uint8Array salt for ChaCha20Poly1305 key derivation
*/
function generateChaCha20Salt(nearAccountId) {
	const saltString = `chacha20-salt:${nearAccountId}`;
	const salt = new Uint8Array(32);
	const saltBytes = new TextEncoder().encode(saltString);
	salt.set(saltBytes.slice(0, 32));
	return salt;
}
/**
* Generate Ed25519 salt using account-specific HKDF for signing key derivation
* @param nearAccountId - NEAR account ID to scope the salt to
* @returns 32-byte Uint8Array salt for Ed25519 key derivation
*/
function generateEd25519Salt(nearAccountId) {
	const saltString = `ed25519-salt:${nearAccountId}`;
	const salt = new Uint8Array(32);
	const saltBytes = new TextEncoder().encode(saltString);
	salt.set(saltBytes.slice(0, 32));
	return salt;
}
/**
* TouchIdPrompt prompts for touchID,
* creates credentials,
* manages WebAuthn touchID prompts,
* and generates credentials, and PRF Outputs
*/
var TouchIdPrompt = class {
	constructor() {}
	/**
	* Prompts for TouchID/biometric authentication and generates WebAuthn credentials with PRF output
	* @param nearAccountId - NEAR account ID to authenticate
	* @param challenge - VRF challenge bytes to use for WebAuthn authentication
	* @param authenticators - List of stored authenticator data for the user
	* @returns WebAuthn credential with PRF output (HKDF derivation done in WASM worker)
	* ```ts
	* const credential = await touchIdPrompt.getCredentials({
	*   nearAccountId,
	*   challenge,
	*   authenticators,
	* });
	* ```
	*/
	async getCredentials({ nearAccountId, challenge, authenticators }) {
		const credential = await navigator.credentials.get({ publicKey: {
			challenge: require_vrf_worker.outputAs32Bytes(challenge),
			rpId: window.location.hostname,
			allowCredentials: authenticators.map((auth) => ({
				id: require_base64.base64UrlDecode(auth.credentialId),
				type: "public-key",
				transports: auth.transports
			})),
			userVerification: "preferred",
			timeout: 6e4,
			extensions: { prf: { eval: {
				first: generateChaCha20Salt(nearAccountId),
				second: generateEd25519Salt(nearAccountId)
			} } }
		} });
		if (!credential) throw new Error("WebAuthn authentication failed or was cancelled");
		return credential;
	}
	/**
	* Simplified authentication for account recovery
	* Uses credential IDs from contract without needing full authenticator data
	* @param nearAccountId - NEAR account ID to authenticate
	* @param challenge - VRF challenge bytes
	* @param credentialIds - Array of credential IDs from contract lookup
	* @returns WebAuthn credential with PRF output
	*/
	async getCredentialsForRecovery({ nearAccountId, challenge, credentialIds }) {
		const credential = await navigator.credentials.get({ publicKey: {
			challenge: require_vrf_worker.outputAs32Bytes(challenge),
			rpId: window.location.hostname,
			allowCredentials: credentialIds.map((credentialId) => ({
				id: require_base64.base64UrlDecode(credentialId),
				type: "public-key",
				transports: [
					"internal",
					"hybrid",
					"usb",
					"ble"
				]
			})),
			userVerification: "preferred",
			timeout: 6e4,
			extensions: { prf: { eval: {
				first: generateChaCha20Salt(nearAccountId),
				second: generateEd25519Salt(nearAccountId)
			} } }
		} });
		if (!credential) throw new Error("WebAuthn authentication failed or was cancelled");
		return credential;
	}
	/**
	* Generate WebAuthn registration credentials for normal account registration
	* @param nearAccountId - NEAR account ID (used for both WebAuthn user ID and PRF salts)
	* @param challenge - Random challenge bytes for the registration ceremony
	* @returns Credential with PRF output
	*/
	async generateRegistrationCredentials({ nearAccountId, challenge }) {
		return this.generateRegistrationCredentialsInternal({
			nearAccountId,
			challenge
		});
	}
	/**
	* Generate WebAuthn registration credentials for device linking
	* @param nearAccountId - NEAR account ID for PRF salts (always base account like alice.testnet)
	* @param challenge - Random challenge bytes for the registration ceremony
	* @param deviceNumber - Device number for device-specific user ID
	* @returns Credential with PRF output
	*/
	async generateRegistrationCredentialsForLinkDevice({ nearAccountId, challenge, deviceNumber }) {
		return this.generateRegistrationCredentialsInternal({
			nearAccountId,
			challenge,
			deviceNumber
		});
	}
	/**
	* Internal method for generating WebAuthn registration credentials with PRF output
	* @param nearAccountId - NEAR account ID for PRF salts and keypair derivation (always base account)
	* @param challenge - Random challenge bytes for the registration ceremony
	* @param deviceNumber - Device number for device-specific user ID.
	* @returns Credential with PRF output
	*/
	async generateRegistrationCredentialsInternal({ nearAccountId, challenge, deviceNumber }) {
		const credential = await navigator.credentials.create({ publicKey: {
			challenge: require_vrf_worker.outputAs32Bytes(challenge),
			rp: {
				name: "WebAuthn VRF Passkey",
				id: window.location.hostname
			},
			user: {
				id: new TextEncoder().encode(generateDeviceSpecificUserId(nearAccountId, deviceNumber)),
				name: generateDeviceSpecificUserId(nearAccountId, deviceNumber),
				displayName: generateUserFriendlyDisplayName(nearAccountId, deviceNumber)
			},
			pubKeyCredParams: [{
				alg: -7,
				type: "public-key"
			}, {
				alg: -257,
				type: "public-key"
			}],
			authenticatorSelection: {
				residentKey: "required",
				userVerification: "preferred"
			},
			timeout: 6e4,
			attestation: "none",
			extensions: { prf: { eval: {
				first: generateChaCha20Salt(nearAccountId),
				second: generateEd25519Salt(nearAccountId)
			} } }
		} });
		return credential;
	}
};
/**
* Generate device-specific user ID to prevent Chrome sync conflicts
* Creates technical identifiers with full account context
*
* @param nearAccountId - The NEAR account ID (e.g., "serp120.web3-authn-v5.testnet")
* @param deviceNumber - The device number (optional, undefined for device 1, 2 for device 2, etc.)
* @returns Technical identifier:
*   - Device 1: "serp120.web3-authn.testnet"
*   - Device 2: "serp120.web3-authn.testnet (2)"
*   - Device 3: "serp120.web3-authn.testnet (3)"
*/
function generateDeviceSpecificUserId(nearAccountId, deviceNumber) {
	if (deviceNumber === void 0 || deviceNumber === 1) return nearAccountId;
	return `${nearAccountId} (${deviceNumber})`;
}
/**
* Generate user-friendly display name for passkey manager UI
* Creates clean, intuitive names that users will see
*
* @param nearAccountId - The NEAR account ID (e.g., "serp120.web3-authn-v5.testnet")
* @param deviceNumber - The device number (optional, undefined for device 1, 2 for device 2, etc.)
* @returns User-friendly display name:
*   - Device 1: "serp120"
*   - Device 2: "serp120 (device 2)"
*   - Device 3: "serp120 (device 3)"
*/
function generateUserFriendlyDisplayName(nearAccountId, deviceNumber) {
	const baseUsername = nearAccountId.split(".")[0];
	if (deviceNumber === void 0 || deviceNumber === 1) return baseUsername;
	return `${baseUsername} (device ${deviceNumber})`;
}

//#endregion
exports.TouchIdPrompt = TouchIdPrompt;
//# sourceMappingURL=touchIdPrompt.js.map