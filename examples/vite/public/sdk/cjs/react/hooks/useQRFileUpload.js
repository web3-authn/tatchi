const require_rolldown_runtime = require('../_virtual/rolldown_runtime.js');
let react = require("react");
react = require_rolldown_runtime.__toESM(react);

//#region src/react/hooks/useQRFileUpload.ts
const useQRFileUpload = (options) => {
	const { onQRDetected, onError } = options;
	const fileInputRef = (0, react.useRef)(null);
	const isProcessingRef = (0, react.useRef)(false);
	const handleFileUpload = (0, react.useCallback)(async (event) => {
		const file = event.target.files?.[0];
		if (!file) return;
		console.log("useQRFileUpload: File upload -", {
			name: file.name,
			type: file.type,
			size: file.size
		});
		try {
			isProcessingRef.current = true;
			const { scanQRCodeFromFile } = await Promise.resolve().then(() => require("../packages/passkey/src/utils/qrScanner.js"));
			const parsedQRData = await scanQRCodeFromFile(file);
			console.log("useQRFileUpload: Valid file QR -", {
				device2PublicKey: parsedQRData.device2PublicKey,
				accountId: parsedQRData.accountId
			});
			onQRDetected?.(parsedQRData);
		} catch (err) {
			console.error("useQRFileUpload: File processing failed -", err.message);
			onError?.(err);
		} finally {
			isProcessingRef.current = false;
		}
	}, [onQRDetected, onError]);
	return {
		fileInputRef,
		handleFileUpload,
		isProcessing: isProcessingRef.current
	};
};

//#endregion
exports.useQRFileUpload = useQRFileUpload;
//# sourceMappingURL=useQRFileUpload.js.map