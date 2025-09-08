const require_rolldown_runtime = require('../_virtual/rolldown_runtime.js');
const require_deviceDetection = require('../deviceDetection.js');
const require_qrScanner = require('../packages/passkey/src/utils/qrScanner.js');
let react = require("react");
react = require_rolldown_runtime.__toESM(react);

//#region src/react/hooks/useQRCamera.ts
/**
* QR Camera Scanning Hook
*
* Provides camera-based QR code scanning functionality for device linking.
*
* **Important:** This hook must be used inside a PasskeyManager context.
* Wrap your app with PasskeyProvider or ensure PasskeyManager is available in context.
*
* @example
* ```tsx
* import { PasskeyProvider } from '@web3authn/passkey/react';
* import { useQRCamera } from '@web3authn/passkey/react';
*
* function QRScanner() {
*   const qrCamera = useQRCamera({
*     onQRDetected: (qrData) => console.log('QR detected:', qrData),
*     onError: (error) => console.error('Error:', error)
*   });
*
*   return <video ref={qrCamera.videoRef} />;
* }
* ```
*/
let QRScanMode = /* @__PURE__ */ function(QRScanMode$1) {
	QRScanMode$1["CAMERA"] = "camera";
	QRScanMode$1["FILE"] = "file";
	QRScanMode$1["AUTO"] = "auto";
	return QRScanMode$1;
}({});
const useQRCamera = (options) => {
	const { onQRDetected, onError, isOpen = true, cameraId } = options;
	const videoRef = (0, react.useRef)(null);
	const canvasRef = (0, react.useRef)(null);
	const flowRef = (0, react.useRef)(null);
	const [isScanning, setIsScanning] = (0, react.useState)(false);
	const [isProcessing, setIsProcessing] = (0, react.useState)(false);
	const [error, setError] = (0, react.useState)(null);
	const [cameras, setCameras] = (0, react.useState)([]);
	const [selectedCamera, setSelectedCamera] = (0, react.useState)(cameraId || "");
	const [scanMode, setScanMode] = (0, react.useState)(QRScanMode.CAMERA);
	const [isFrontCamera, setIsFrontCamera] = (0, react.useState)(false);
	const [scanDurationMs, setScanDurationMs] = (0, react.useState)(0);
	(0, react.useEffect)(() => {
		flowRef.current = new require_qrScanner.ScanQRCodeFlow({
			cameraId: selectedCamera,
			cameraConfigs: { facingMode: require_deviceDetection.getOptimalCameraFacingMode() },
			timeout: 6e4
		}, {
			onQRDetected: (qrData) => {
				console.log("useQRCamera: Valid QR data detected -", {
					devicePublicKey: qrData.device2PublicKey,
					accountId: qrData.accountId,
					timestamp: new Date(qrData.timestamp || 0).toISOString()
				});
				setIsProcessing(false);
				setIsScanning(false);
				setScanDurationMs(0);
				onQRDetected?.(qrData);
			},
			onError: (err) => {
				console.error("useQRCamera: QR scan error -", err);
				setError(err.message);
				setIsProcessing(false);
				setIsScanning(false);
				setScanDurationMs(0);
				onError?.(err);
			},
			onCameraReady: (stream) => {
				console.log("useQRCamera: Camera stream ready");
			},
			onScanProgress: (duration) => {
				setScanDurationMs(duration);
			}
		});
		return () => {
			if (flowRef.current) {
				flowRef.current.stop();
				flowRef.current = null;
			}
		};
	}, []);
	(0, react.useEffect)(() => {
		const loadCameras = async () => {
			try {
				const videoDevices = await require_qrScanner.enumerateVideoDevices();
				setCameras(videoDevices);
				if (videoDevices.length > 0 && !selectedCamera) {
					const firstCamera = videoDevices[0];
					setSelectedCamera(firstCamera.deviceId);
					setIsFrontCamera(require_qrScanner.detectFrontCamera(firstCamera));
				}
			} catch (error$1) {
				setError(error$1.message);
			}
		};
		loadCameras();
	}, []);
	(0, react.useEffect)(() => {
		if (flowRef.current && selectedCamera) flowRef.current.switchCamera(selectedCamera);
	}, [selectedCamera]);
	(0, react.useEffect)(() => {
		if (videoRef.current && flowRef.current) flowRef.current.attachVideoElement(videoRef.current);
		return () => {
			if (flowRef.current) flowRef.current.detachVideoElement();
		};
	}, [videoRef.current]);
	(0, react.useEffect)(() => {
		const flow = flowRef.current;
		if (!flow) return;
		if (isOpen && scanMode === QRScanMode.CAMERA) {
			setError(null);
			setIsProcessing(true);
			setIsScanning(true);
			setScanDurationMs(0);
			flow.startQRScanner();
		} else {
			flow.stop();
			setIsScanning(false);
			setIsProcessing(false);
			setScanDurationMs(0);
		}
	}, [isOpen, scanMode]);
	const startScanning = (0, react.useCallback)(async () => {
		if (flowRef.current) {
			setError(null);
			setIsProcessing(true);
			setIsScanning(true);
			setScanDurationMs(0);
			await flowRef.current.startQRScanner();
		}
	}, []);
	const stopScanning = (0, react.useCallback)(() => {
		if (flowRef.current) {
			flowRef.current.stop();
			setIsScanning(false);
			setIsProcessing(false);
			setScanDurationMs(0);
		}
	}, []);
	const handleCameraChange = (0, react.useCallback)(async (deviceId) => {
		setSelectedCamera(deviceId);
		const selectedCameraDevice = cameras.find((camera) => camera.deviceId === deviceId);
		if (selectedCameraDevice) setIsFrontCamera(require_qrScanner.detectFrontCamera(selectedCameraDevice));
	}, [cameras]);
	const getOptimalFacingMode = (0, react.useCallback)(() => require_deviceDetection.getOptimalCameraFacingMode(), []);
	return {
		isScanning,
		isProcessing,
		error,
		cameras,
		selectedCamera,
		scanMode,
		isFrontCamera,
		scanDurationMs,
		videoRef,
		canvasRef,
		startScanning,
		stopScanning,
		handleCameraChange,
		setScanMode,
		setError,
		getOptimalFacingMode
	};
};

//#endregion
exports.QRScanMode = QRScanMode;
exports.useQRCamera = useQRCamera;
//# sourceMappingURL=useQRCamera.js.map