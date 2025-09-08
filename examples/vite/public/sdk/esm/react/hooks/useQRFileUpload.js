import { useCallback, useRef } from "react";

//#region src/react/hooks/useQRFileUpload.ts
const useQRFileUpload = (options) => {
	const { onQRDetected, onError } = options;
	const fileInputRef = useRef(null);
	const isProcessingRef = useRef(false);
	const handleFileUpload = useCallback(async (event) => {
		const file = event.target.files?.[0];
		if (!file) return;
		console.log("useQRFileUpload: File upload -", {
			name: file.name,
			type: file.type,
			size: file.size
		});
		try {
			isProcessingRef.current = true;
			const { scanQRCodeFromFile } = await import("../packages/passkey/src/utils/qrScanner.js");
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
export { useQRFileUpload };
//# sourceMappingURL=useQRFileUpload.js.map