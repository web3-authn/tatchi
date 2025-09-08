const require_rolldown_runtime = require('../_virtual/rolldown_runtime.js');
const require_passkeyManager = require('../packages/passkey/src/core/types/passkeyManager.js');
const require_index = require('../context/index.js');
let react = require("react");
react = require_rolldown_runtime.__toESM(react);

//#region src/react/hooks/useDeviceLinking.ts
const useDeviceLinking = (options) => {
	const { passkeyManager } = require_index.usePasskeyContext();
	const { onDeviceLinked, onError, onClose, onEvent, fundingAmount = "0.05" } = options;
	const hasClosedEarlyRef = (0, react.useRef)(false);
	const callbacksRef = (0, react.useRef)({
		onDeviceLinked,
		onError,
		onClose,
		onEvent
	});
	callbacksRef.current = {
		onDeviceLinked,
		onError,
		onClose,
		onEvent
	};
	const linkDevice = (0, react.useCallback)(async (qrData, source) => {
		const { onDeviceLinked: onDeviceLinked$1, onError: onError$1, onClose: onClose$1, onEvent: onEvent$1 } = callbacksRef.current;
		try {
			console.log(`useDeviceLinking: Starting device linking from ${source}...`);
			hasClosedEarlyRef.current = false;
			const nearClient = passkeyManager.getNearClient();
			const result = await passkeyManager.linkDeviceWithQRCode(qrData, {
				fundingAmount,
				onEvent: (event) => {
					onEvent$1?.(event);
					console.log(`useDeviceLinking: ${source} linking event -`, event.phase, event.message);
					switch (event.phase) {
						case require_passkeyManager.DeviceLinkingPhase.STEP_3_AUTHORIZATION:
							if (event.status === require_passkeyManager.DeviceLinkingStatus.PROGRESS) {
								console.log("useDeviceLinking: QR validation complete - closing scanner while linking continues...");
								hasClosedEarlyRef.current = true;
								onClose$1?.();
							}
							break;
					}
				},
				onError: (error) => {
					console.error(`useDeviceLinking: ${source} linking error -`, error.message);
					onError$1?.(error);
				}
			});
			console.log(`useDeviceLinking: ${source} linking completed -`, { success: !!result });
			const POLLING_INTERVAL_MS = 4e3;
			const DELETE_KEY_TIMEOUT_MS = 2e4;
			let pollingInterval = null;
			let deleteKeyTimeout = null;
			let pollingActive = true;
			const checkTemporaryKeyExists = async () => {
				try {
					const accessKeyList = await nearClient.viewAccessKeyList(result.linkedToAccount || "");
					return accessKeyList.keys.some((key) => key.public_key === result.device2PublicKey);
				} catch (error) {
					console.error(`Failed to check access keys:`, error);
					return false;
				}
			};
			const cleanupTimers = () => {
				if (pollingInterval) {
					clearInterval(pollingInterval);
					pollingInterval = null;
				}
				if (deleteKeyTimeout) {
					clearTimeout(deleteKeyTimeout);
					deleteKeyTimeout = null;
				}
				pollingActive = false;
			};
			pollingInterval = setInterval(async () => {
				if (!pollingActive) return;
				const tempKeyExists = await checkTemporaryKeyExists();
				if (!tempKeyExists) {
					console.log(`Temporary key no longer exists, stopping polling and clearing timeout`);
					cleanupTimers();
				}
			}, POLLING_INTERVAL_MS);
			deleteKeyTimeout = setTimeout(async () => {
				try {
					console.log(`Checking if temporary key still exists after timeout...`);
					const tempKeyExists = await checkTemporaryKeyExists();
					if (tempKeyExists) {
						console.log(`Temporary key still exists, broadcasting DeleteKey transaction for key: ${result.device2PublicKey.substring(0, 20)}...`);
						const deleteKeyTxResult = await nearClient.sendTransaction(result.signedDeleteKeyTransaction);
						console.log(`DeleteKey transaction broadcasted successfully. Transaction hash: ${deleteKeyTxResult?.transaction?.hash}`);
					} else console.log(`Temporary key no longer exists, no need to broadcast DeleteKey transaction`);
				} catch (error) {
					console.error(`Failed to check access keys or broadcast DeleteKey transaction:`, error);
				}
				cleanupTimers();
			}, DELETE_KEY_TIMEOUT_MS);
			cleanupTimers();
			onDeviceLinked$1?.(result);
		} catch (linkingError) {
			console.error(`useDeviceLinking: ${source} linking failed -`, linkingError.message);
			onError$1?.(linkingError);
			if (!hasClosedEarlyRef.current) {
				console.log("useDeviceLinking: Closing scanner due to linking error...");
				onClose$1?.();
			}
		}
	}, [fundingAmount, passkeyManager]);
	return { linkDevice };
};

//#endregion
exports.useDeviceLinking = useDeviceLinking;
//# sourceMappingURL=useDeviceLinking.js.map