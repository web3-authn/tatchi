const require_base64 = require('../../utils/base64.js');

//#region src/core/WebAuthnManager/credentialsHelpers.ts
/**
* Extract PRF outputs from WebAuthn credential extension results
* ENCODING: Uses base64url for WASM compatibility
* @param credential - WebAuthn credential with dual PRF extension results
* @param firstPrfOutput - Whether to include the first PRF output (default: true)
* @param secondPrfOutput - Whether to include the second PRF output (default: false)
* @returns PRF outputs
*/
function extractPrfFromCredential({ credential, firstPrfOutput = true, secondPrfOutput = false }) {
	const extensionResults = credential.getClientExtensionResults();
	const prfResults = extensionResults?.prf?.results;
	if (!prfResults) throw new Error("Missing PRF results from credential, use a PRF-enabled Authenticator");
	const first = firstPrfOutput ? prfResults?.first ? require_base64.base64UrlEncode(prfResults.first) : void 0 : void 0;
	const second = secondPrfOutput ? prfResults?.second ? require_base64.base64UrlEncode(prfResults.second) : void 0 : void 0;
	return {
		chacha20PrfOutput: first,
		ed25519PrfOutput: second
	};
}
/**
* Serialize PublicKeyCredential for both authentication and registration for WASM worker
* - Uses base64url encoding for WASM compatibility
*
* @returns SerializableCredential - The serialized credential
* - DOES NOT return PRF outputs
*/
function serializeRegistrationCredential(credential) {
	const response = credential.response;
	return {
		id: credential.id,
		rawId: require_base64.base64UrlEncode(credential.rawId),
		type: credential.type,
		authenticatorAttachment: credential.authenticatorAttachment ?? void 0,
		response: {
			clientDataJSON: require_base64.base64UrlEncode(response.clientDataJSON),
			attestationObject: require_base64.base64UrlEncode(response.attestationObject),
			transports: response.getTransports() || []
		},
		clientExtensionResults: { prf: { results: {
			first: void 0,
			second: void 0
		} } }
	};
}
function serializeAuthenticationCredential(credential) {
	const response = credential.response;
	return {
		id: credential.id,
		rawId: require_base64.base64UrlEncode(credential.rawId),
		type: credential.type,
		authenticatorAttachment: credential.authenticatorAttachment ?? void 0,
		response: {
			clientDataJSON: require_base64.base64UrlEncode(response.clientDataJSON),
			authenticatorData: require_base64.base64UrlEncode(response.authenticatorData),
			signature: require_base64.base64UrlEncode(response.signature),
			userHandle: response.userHandle ? require_base64.base64UrlEncode(response.userHandle) : void 0
		},
		clientExtensionResults: { prf: { results: {
			first: void 0,
			second: void 0
		} } }
	};
}
/**
* Serialize PublicKeyCredential for both authentication and registration for WASM worker
* @returns SerializableCredential - The serialized credential
* - INCLUDES PRF outputs
*/
function serializeRegistrationCredentialWithPRF({ credential, firstPrfOutput = true, secondPrfOutput = true }) {
	const base = serializeRegistrationCredential(credential);
	const { chacha20PrfOutput, ed25519PrfOutput } = extractPrfFromCredential({
		credential,
		firstPrfOutput,
		secondPrfOutput
	});
	return {
		...base,
		clientExtensionResults: { prf: { results: {
			first: chacha20PrfOutput,
			second: ed25519PrfOutput
		} } }
	};
}
function serializeAuthenticationCredentialWithPRF({ credential, firstPrfOutput = true, secondPrfOutput = false }) {
	const base = serializeAuthenticationCredential(credential);
	const { chacha20PrfOutput, ed25519PrfOutput } = extractPrfFromCredential({
		credential,
		firstPrfOutput,
		secondPrfOutput
	});
	return {
		...base,
		clientExtensionResults: { prf: { results: {
			first: chacha20PrfOutput,
			second: ed25519PrfOutput
		} } }
	};
}
/**
* Removes PRF outputs from the credential
* @param credential - The WebAuthn credential containing PRF outputs
* @returns Object containing credential with PRF removed and the extracted ChaCha20 PRF output
*/
function removePrfOutputGuard(credential) {
	const credentialWithoutPrf = {
		...credential,
		clientExtensionResults: {
			...credential.clientExtensionResults,
			prf: { results: {
				first: null,
				second: null
			} }
		}
	};
	return credentialWithoutPrf;
}

//#endregion
exports.extractPrfFromCredential = extractPrfFromCredential;
exports.removePrfOutputGuard = removePrfOutputGuard;
exports.serializeAuthenticationCredentialWithPRF = serializeAuthenticationCredentialWithPRF;
exports.serializeRegistrationCredential = serializeRegistrationCredential;
exports.serializeRegistrationCredentialWithPRF = serializeRegistrationCredentialWithPRF;
//# sourceMappingURL=credentialsHelpers.js.map