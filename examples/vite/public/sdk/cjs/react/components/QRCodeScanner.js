const require_rolldown_runtime = require('../_virtual/rolldown_runtime.js');
const require_useQRCamera = require('../hooks/useQRCamera.js');
const require_useDeviceLinking = require('../hooks/useDeviceLinking.js');
const require_ThemeProvider = require('./theme/ThemeProvider.js');
let react = require("react");
react = require_rolldown_runtime.__toESM(react);
let react_jsx_runtime = require("react/jsx-runtime");
react_jsx_runtime = require_rolldown_runtime.__toESM(react_jsx_runtime);

//#region src/react/components/QRCodeScanner.tsx
const QRCodeScanner = ({ onQRCodeScanned, onDeviceLinked, onError, onClose, onEvent, fundingAmount = "0.05", isOpen = true, cameraId, className, style, showCamera = true }) => {
	const { linkDevice } = require_useDeviceLinking.useDeviceLinking({
		onDeviceLinked,
		onError,
		onClose,
		onEvent,
		fundingAmount
	});
	const qrCamera = require_useQRCamera.useQRCamera({
		onQRDetected: async (qrData) => {
			onQRCodeScanned?.(qrData);
			await linkDevice(qrData, require_useQRCamera.QRScanMode.CAMERA);
		},
		onError,
		isOpen: showCamera ? isOpen : false,
		cameraId
	});
	const [isVideoReady, setIsVideoReady] = (0, react.useState)(false);
	(0, react.useEffect)(() => {
		if (isOpen) setIsVideoReady(false);
	}, [isOpen]);
	const handleClose = (0, react.useCallback)(() => {
		qrCamera.stopScanning();
		onClose?.();
	}, [
		qrCamera.stopScanning,
		qrCamera.isScanning,
		qrCamera.videoRef,
		onClose
	]);
	(0, react.useEffect)(() => {
		return () => {
			if (qrCamera.isScanning) qrCamera.stopScanning();
		};
	}, []);
	(0, react.useEffect)(() => {
		if (!isOpen && qrCamera.isScanning) qrCamera.stopScanning();
	}, [
		isOpen,
		qrCamera.isScanning,
		qrCamera.stopScanning,
		qrCamera.videoRef
	]);
	(0, react.useEffect)(() => {
		const handleKeyDown = (event) => {
			if (event.key === "Escape" && isOpen) handleClose();
		};
		if (isOpen) document.addEventListener("keydown", handleKeyDown);
		return () => {
			document.removeEventListener("keydown", handleKeyDown);
		};
	}, [isOpen, handleClose]);
	if (!isOpen) return null;
	if (qrCamera.error) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(require_ThemeProvider.ThemeScope, { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
		className: "qr-scanner-error-container",
		children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
			className: "qr-scanner-error-message",
			children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: qrCamera.error }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					onClick: () => qrCamera.setError(null),
					className: "qr-scanner-error-button",
					children: "Try Again"
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					onClick: handleClose,
					className: "qr-scanner-error-button",
					children: "Close"
				})
			]
		})
	}) });
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(require_ThemeProvider.ThemeScope, { children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		className: `qr-scanner-modal ${className || ""}`,
		style,
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
			className: "qr-scanner-panel",
			children: showCamera && (qrCamera.scanMode === require_useQRCamera.QRScanMode.CAMERA || qrCamera.scanMode === require_useQRCamera.QRScanMode.AUTO) && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "qr-scanner-camera-section",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "qr-scanner-camera-container",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("video", {
								ref: qrCamera.videoRef,
								className: `qr-scanner-video${isVideoReady ? " is-ready" : ""}`,
								style: { transform: qrCamera.isFrontCamera ? "scaleX(-1)" : "none" },
								playsInline: true,
								autoPlay: true,
								muted: true,
								onCanPlay: () => setIsVideoReady(true),
								onLoadedData: () => setIsVideoReady(true)
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("canvas", {
								ref: qrCamera.canvasRef,
								className: "qr-scanner-canvas"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "qr-scanner-overlay",
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "qr-scanner-box",
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { className: "qr-scanner-corner-top-left" }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { className: "qr-scanner-corner-top-right" }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { className: "qr-scanner-corner-bottom-left" }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { className: "qr-scanner-corner-bottom-right" })
									]
								})
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "qr-scanner-instructions",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: "Position the QR code within the frame" }), qrCamera.isScanning && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "qr-scanner-sub-instruction qr-scanner-sub-instruction--small",
							children: "Scanning..."
						})]
					}),
					qrCamera.cameras.length > 1 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "qr-scanner-camera-controls",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
							value: qrCamera.selectedCamera,
							onChange: (e) => qrCamera.handleCameraChange(e.target.value),
							className: "qr-scanner-camera-selector",
							children: qrCamera.cameras.map((camera) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
								value: camera.deviceId,
								children: camera.label || `Camera ${camera.deviceId.substring(0, 8)}...`
							}, camera.deviceId))
						})
					})
				]
			})
		}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
			onClick: handleClose,
			className: "qr-scanner-close",
			children: "✕"
		})]
	}) });
};

//#endregion
exports.QRCodeScanner = QRCodeScanner;
//# sourceMappingURL=QRCodeScanner.js.map