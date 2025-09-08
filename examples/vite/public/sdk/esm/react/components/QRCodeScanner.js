import { QRScanMode, useQRCamera } from "../hooks/useQRCamera.js";
import { useDeviceLinking } from "../hooks/useDeviceLinking.js";
import { ThemeScope } from "./theme/ThemeProvider.js";
import React, { useCallback, useEffect, useState } from "react";
import { jsx, jsxs } from "react/jsx-runtime";

//#region src/react/components/QRCodeScanner.tsx
const QRCodeScanner = ({ onQRCodeScanned, onDeviceLinked, onError, onClose, onEvent, fundingAmount = "0.05", isOpen = true, cameraId, className, style, showCamera = true }) => {
	const { linkDevice } = useDeviceLinking({
		onDeviceLinked,
		onError,
		onClose,
		onEvent,
		fundingAmount
	});
	const qrCamera = useQRCamera({
		onQRDetected: async (qrData) => {
			onQRCodeScanned?.(qrData);
			await linkDevice(qrData, QRScanMode.CAMERA);
		},
		onError,
		isOpen: showCamera ? isOpen : false,
		cameraId
	});
	const [isVideoReady, setIsVideoReady] = useState(false);
	useEffect(() => {
		if (isOpen) setIsVideoReady(false);
	}, [isOpen]);
	const handleClose = useCallback(() => {
		qrCamera.stopScanning();
		onClose?.();
	}, [
		qrCamera.stopScanning,
		qrCamera.isScanning,
		qrCamera.videoRef,
		onClose
	]);
	useEffect(() => {
		return () => {
			if (qrCamera.isScanning) qrCamera.stopScanning();
		};
	}, []);
	useEffect(() => {
		if (!isOpen && qrCamera.isScanning) qrCamera.stopScanning();
	}, [
		isOpen,
		qrCamera.isScanning,
		qrCamera.stopScanning,
		qrCamera.videoRef
	]);
	useEffect(() => {
		const handleKeyDown = (event) => {
			if (event.key === "Escape" && isOpen) handleClose();
		};
		if (isOpen) document.addEventListener("keydown", handleKeyDown);
		return () => {
			document.removeEventListener("keydown", handleKeyDown);
		};
	}, [isOpen, handleClose]);
	if (!isOpen) return null;
	if (qrCamera.error) return /* @__PURE__ */ jsx(ThemeScope, { children: /* @__PURE__ */ jsx("div", {
		className: "qr-scanner-error-container",
		children: /* @__PURE__ */ jsxs("div", {
			className: "qr-scanner-error-message",
			children: [
				/* @__PURE__ */ jsx("p", { children: qrCamera.error }),
				/* @__PURE__ */ jsx("button", {
					onClick: () => qrCamera.setError(null),
					className: "qr-scanner-error-button",
					children: "Try Again"
				}),
				/* @__PURE__ */ jsx("button", {
					onClick: handleClose,
					className: "qr-scanner-error-button",
					children: "Close"
				})
			]
		})
	}) });
	return /* @__PURE__ */ jsx(ThemeScope, { children: /* @__PURE__ */ jsxs("div", {
		className: `qr-scanner-modal ${className || ""}`,
		style,
		children: [/* @__PURE__ */ jsx("div", {
			className: "qr-scanner-panel",
			children: showCamera && (qrCamera.scanMode === QRScanMode.CAMERA || qrCamera.scanMode === QRScanMode.AUTO) && /* @__PURE__ */ jsxs("div", {
				className: "qr-scanner-camera-section",
				children: [
					/* @__PURE__ */ jsxs("div", {
						className: "qr-scanner-camera-container",
						children: [
							/* @__PURE__ */ jsx("video", {
								ref: qrCamera.videoRef,
								className: `qr-scanner-video${isVideoReady ? " is-ready" : ""}`,
								style: { transform: qrCamera.isFrontCamera ? "scaleX(-1)" : "none" },
								playsInline: true,
								autoPlay: true,
								muted: true,
								onCanPlay: () => setIsVideoReady(true),
								onLoadedData: () => setIsVideoReady(true)
							}),
							/* @__PURE__ */ jsx("canvas", {
								ref: qrCamera.canvasRef,
								className: "qr-scanner-canvas"
							}),
							/* @__PURE__ */ jsx("div", {
								className: "qr-scanner-overlay",
								children: /* @__PURE__ */ jsxs("div", {
									className: "qr-scanner-box",
									children: [
										/* @__PURE__ */ jsx("div", { className: "qr-scanner-corner-top-left" }),
										/* @__PURE__ */ jsx("div", { className: "qr-scanner-corner-top-right" }),
										/* @__PURE__ */ jsx("div", { className: "qr-scanner-corner-bottom-left" }),
										/* @__PURE__ */ jsx("div", { className: "qr-scanner-corner-bottom-right" })
									]
								})
							})
						]
					}),
					/* @__PURE__ */ jsxs("div", {
						className: "qr-scanner-instructions",
						children: [/* @__PURE__ */ jsx("p", { children: "Position the QR code within the frame" }), qrCamera.isScanning && /* @__PURE__ */ jsx("p", {
							className: "qr-scanner-sub-instruction qr-scanner-sub-instruction--small",
							children: "Scanning..."
						})]
					}),
					qrCamera.cameras.length > 1 && /* @__PURE__ */ jsx("div", {
						className: "qr-scanner-camera-controls",
						children: /* @__PURE__ */ jsx("select", {
							value: qrCamera.selectedCamera,
							onChange: (e) => qrCamera.handleCameraChange(e.target.value),
							className: "qr-scanner-camera-selector",
							children: qrCamera.cameras.map((camera) => /* @__PURE__ */ jsx("option", {
								value: camera.deviceId,
								children: camera.label || `Camera ${camera.deviceId.substring(0, 8)}...`
							}, camera.deviceId))
						})
					})
				]
			})
		}), /* @__PURE__ */ jsx("button", {
			onClick: handleClose,
			className: "qr-scanner-close",
			children: "✕"
		})]
	}) });
};

//#endregion
export { QRCodeScanner };
//# sourceMappingURL=QRCodeScanner.js.map