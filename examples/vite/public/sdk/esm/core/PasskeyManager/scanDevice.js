import { validateNearAccountId } from "../../utils/validation.js";
import { DEVICE_LINKING_CONFIG } from "../../config.js";
import { DeviceLinkingPhase, DeviceLinkingStatus } from "../types/passkeyManager.js";
import { getLoginState } from "./login.js";
import { executeDeviceLinkingContractCalls } from "../rpcCalls.js";
import { DeviceLinkingError, DeviceLinkingErrorCode } from "../types/linkDevice.js";

//#region src/core/PasskeyManager/scanDevice.ts
/**
* Device1 (original device): Link device using pre-scanned QR data
*/
async function linkDeviceWithQRCode(context, qrData, options) {
	const { onEvent, onError } = options || {};
	try {
		onEvent?.({
			step: 2,
			phase: DeviceLinkingPhase.STEP_2_SCANNING,
			status: DeviceLinkingStatus.PROGRESS,
			message: "Validating QR data..."
		});
		validateDeviceLinkingQRData(qrData);
		const device1LoginState = await getLoginState(context);
		if (!device1LoginState.isLoggedIn || !device1LoginState.nearAccountId) throw new Error("Device1 must be logged in to authorize device linking");
		const device1AccountId = device1LoginState.nearAccountId;
		const fundingAmount = options.fundingAmount;
		const device2PublicKey = qrData.device2PublicKey;
		if (!device2PublicKey.startsWith("ed25519:")) throw new Error("Invalid device public key format");
		onEvent?.({
			step: 3,
			phase: DeviceLinkingPhase.STEP_3_AUTHORIZATION,
			status: DeviceLinkingStatus.PROGRESS,
			message: `Performing TouchID authentication for device linking...`
		});
		const userData = await context.webAuthnManager.getUser(device1AccountId);
		const nearPublicKeyStr = userData?.clientNearPublicKey;
		if (!nearPublicKeyStr) throw new Error("Client NEAR public key not found in user data");
		const { accessKeyInfo, nextNonce, txBlockHeight, txBlockHash } = await context.webAuthnManager.getNonceManager().getNonceBlockHashAndHeight(context.nearClient);
		const nextNextNonce = (BigInt(nextNonce) + BigInt(1)).toString();
		const nextNextNextNonce = (BigInt(nextNonce) + BigInt(2)).toString();
		const vrfInputData = {
			userId: device1AccountId,
			rpId: window.location.hostname,
			blockHeight: txBlockHeight,
			blockHash: txBlockHash
		};
		const vrfChallenge = await context.webAuthnManager.generateVrfChallenge(vrfInputData);
		onEvent?.({
			step: 6,
			phase: DeviceLinkingPhase.STEP_6_REGISTRATION,
			status: DeviceLinkingStatus.PROGRESS,
			message: "TouchID successful! Signing AddKey transaction..."
		});
		const { addKeyTxResult, storeDeviceLinkingTxResult, signedDeleteKeyTransaction } = await executeDeviceLinkingContractCalls({
			context,
			device1AccountId,
			device2PublicKey,
			nextNonce,
			nextNextNonce,
			nextNextNextNonce,
			txBlockHash,
			vrfChallenge,
			onEvent
		});
		const result = {
			success: true,
			device2PublicKey: qrData.device2PublicKey,
			transactionId: addKeyTxResult?.transaction?.hash || storeDeviceLinkingTxResult?.transaction?.hash || "unknown",
			fundingAmount,
			linkedToAccount: device1AccountId,
			signedDeleteKeyTransaction
		};
		onEvent?.({
			step: 6,
			phase: DeviceLinkingPhase.STEP_6_REGISTRATION,
			status: DeviceLinkingStatus.SUCCESS,
			message: `Device2's key added to ${device1AccountId} successfully!`
		});
		return result;
	} catch (error) {
		console.error("LinkDeviceFlow: linkDeviceWithQRData caught error:", error);
		const errorMessage = `Failed to scan and link device: ${error.message}`;
		onError?.(new Error(errorMessage));
		throw new DeviceLinkingError(errorMessage, DeviceLinkingErrorCode.AUTHORIZATION_TIMEOUT, "authorization");
	}
}
function validateDeviceLinkingQRData(qrData) {
	if (!qrData.device2PublicKey) throw new DeviceLinkingError("Missing device public key", DeviceLinkingErrorCode.INVALID_QR_DATA, "authorization");
	if (!qrData.timestamp) throw new DeviceLinkingError("Missing timestamp", DeviceLinkingErrorCode.INVALID_QR_DATA, "authorization");
	const maxAge = DEVICE_LINKING_CONFIG.TIMEOUTS.QR_CODE_MAX_AGE_MS;
	if (Date.now() - qrData.timestamp > maxAge) throw new DeviceLinkingError("QR code expired", DeviceLinkingErrorCode.SESSION_EXPIRED, "authorization");
	if (qrData.accountId) validateNearAccountId(qrData.accountId);
}

//#endregion
export { linkDeviceWithQRCode, validateDeviceLinkingQRData };
//# sourceMappingURL=scanDevice.js.map