const require_base64 = require('../../utils/base64.js');

//#region src/core/types/vrf-worker.ts
/**
* Decode VRF output and use first 32 bytes as WebAuthn challenge
* @param vrfChallenge - VRF challenge object
* @returns 32-byte Uint8Array
*/
function outputAs32Bytes(vrfChallenge) {
	let vrfOutputBytes = require_base64.base64UrlDecode(vrfChallenge.vrfOutput);
	return vrfOutputBytes.slice(0, 32);
}
/**
* Validate and create a VRFChallenge object
* @param vrfChallengeData - The challenge data to validate
* @returns VRFChallenge object
*/
function validateVRFChallenge(vrfChallengeData) {
	if (!vrfChallengeData.vrfInput || typeof vrfChallengeData.vrfInput !== "string") throw new Error("vrfInput must be a non-empty string");
	if (!vrfChallengeData.vrfOutput || typeof vrfChallengeData.vrfOutput !== "string") throw new Error("vrfOutput must be a non-empty string");
	if (!vrfChallengeData.vrfProof || typeof vrfChallengeData.vrfProof !== "string") throw new Error("vrfProof must be a non-empty string");
	if (!vrfChallengeData.vrfPublicKey || typeof vrfChallengeData.vrfPublicKey !== "string") throw new Error("vrfPublicKey must be a non-empty string");
	if (!vrfChallengeData.userId || typeof vrfChallengeData.userId !== "string") throw new Error("userId must be a non-empty string");
	if (!vrfChallengeData.rpId || typeof vrfChallengeData.rpId !== "string") throw new Error("rpId must be a non-empty string");
	if (!vrfChallengeData.blockHeight || typeof vrfChallengeData.blockHeight !== "string") throw new Error("blockHeight must be a non-empty string");
	if (!vrfChallengeData.blockHash || typeof vrfChallengeData.blockHash !== "string") throw new Error("blockHash must be a non-empty string");
	return {
		vrfInput: vrfChallengeData.vrfInput,
		vrfOutput: vrfChallengeData.vrfOutput,
		vrfProof: vrfChallengeData.vrfProof,
		vrfPublicKey: vrfChallengeData.vrfPublicKey,
		userId: vrfChallengeData.userId,
		rpId: vrfChallengeData.rpId,
		blockHeight: vrfChallengeData.blockHeight,
		blockHash: vrfChallengeData.blockHash
	};
}
/**
* Create a random VRF challenge
* @returns Partial<VRFChallenge> with vrfOutput set, but other fields are undefined
* This is used for local operations that don't require a VRF verification
*/
function createRandomVRFChallenge() {
	const challenge = crypto.getRandomValues(new Uint8Array(32));
	const vrfOutput = require_base64.base64UrlEncode(challenge);
	return {
		vrfOutput,
		vrfInput: void 0,
		vrfProof: void 0,
		vrfPublicKey: void 0,
		userId: void 0,
		rpId: void 0,
		blockHeight: void 0,
		blockHash: void 0
	};
}

//#endregion
exports.createRandomVRFChallenge = createRandomVRFChallenge;
exports.outputAs32Bytes = outputAs32Bytes;
exports.validateVRFChallenge = validateVRFChallenge;
//# sourceMappingURL=vrf-worker.js.map