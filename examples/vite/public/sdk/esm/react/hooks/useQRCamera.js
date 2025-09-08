import { getOptimalCameraFacingMode } from "../deviceDetection.js";
import { ScanQRCodeFlow, detectFrontCamera, enumerateVideoDevices } from "../packages/passkey/src/utils/qrScanner.js";
import { useCallback, useEffect, useRef, useState } from "react";

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
	const videoRef = useRef(null);
	const canvasRef = useRef(null);
	const flowRef = useRef(null);
	const [isScanning, setIsScanning] = useState(false);
	const [isProcessing, setIsProcessing] = useState(false);
	const [error, setError] = useState(null);
	const [cameras, setCameras] = useState([]);
	const [selectedCamera, setSelectedCamera] = useState(cameraId || "");
	const [scanMode, setScanMode] = useState(QRScanMode.CAMERA);
	const [isFrontCamera, setIsFrontCamera] = useState(false);
	const [scanDurationMs, setScanDurationMs] = useState(0);
	useEffect(() => {
		flowRef.current = new ScanQRCodeFlow({
			cameraId: selectedCamera,
			cameraConfigs: { facingMode: getOptimalCameraFacingMode() },
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
	useEffect(() => {
		const loadCameras = async () => {
			try {
				const videoDevices = await enumerateVideoDevices();
				setCameras(videoDevices);
				if (videoDevices.length > 0 && !selectedCamera) {
					const firstCamera = videoDevices[0];
					setSelectedCamera(firstCamera.deviceId);
					setIsFrontCamera(detectFrontCamera(firstCamera));
				}
			} catch (error$1) {
				setError(error$1.message);
			}
		};
		loadCameras();
	}, []);
	useEffect(() => {
		if (flowRef.current && selectedCamera) flowRef.current.switchCamera(selectedCamera);
	}, [selectedCamera]);
	useEffect(() => {
		if (videoRef.current && flowRef.current) flowRef.current.attachVideoElement(videoRef.current);
		return () => {
			if (flowRef.current) flowRef.current.detachVideoElement();
		};
	}, [videoRef.current]);
	useEffect(() => {
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
	const startScanning = useCallback(async () => {
		if (flowRef.current) {
			setError(null);
			setIsProcessing(true);
			setIsScanning(true);
			setScanDurationMs(0);
			await flowRef.current.startQRScanner();
		}
	}, []);
	const stopScanning = useCallback(() => {
		if (flowRef.current) {
			flowRef.current.stop();
			setIsScanning(false);
			setIsProcessing(false);
			setScanDurationMs(0);
		}
	}, []);
	const handleCameraChange = useCallback(async (deviceId) => {
		setSelectedCamera(deviceId);
		const selectedCameraDevice = cameras.find((camera) => camera.deviceId === deviceId);
		if (selectedCameraDevice) setIsFrontCamera(detectFrontCamera(selectedCameraDevice));
	}, [cameras]);
	const getOptimalFacingMode = useCallback(() => getOptimalCameraFacingMode(), []);
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
export { QRScanMode, useQRCamera };
//# sourceMappingURL=useQRCamera.js.map