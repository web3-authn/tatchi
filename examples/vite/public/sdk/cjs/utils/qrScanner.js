const require_rolldown_runtime = require('../_virtual/rolldown_runtime.js');
const require_scanDevice = require('../core/PasskeyManager/scanDevice.js');

//#region src/utils/qrScanner.ts
let ScanQRCodeFlowState = /* @__PURE__ */ function(ScanQRCodeFlowState$1) {
	ScanQRCodeFlowState$1["IDLE"] = "idle";
	ScanQRCodeFlowState$1["INITIALIZING"] = "initializing";
	ScanQRCodeFlowState$1["SCANNING"] = "scanning";
	ScanQRCodeFlowState$1["SUCCESS"] = "success";
	ScanQRCodeFlowState$1["ERROR"] = "error";
	ScanQRCodeFlowState$1["CANCELLED"] = "cancelled";
	return ScanQRCodeFlowState$1;
}({});
/**
* ScanQRCodeFlow - Encapsulates QR code scanning lifecycle
* Can be used in both React (useQRCamera) and non-React (PasskeyManager) contexts
*/
var ScanQRCodeFlow = class {
	state = ScanQRCodeFlowState.IDLE;
	mediaStream = null;
	video = null;
	canvas;
	ctx;
	animationId = null;
	timeoutId = null;
	progressIntervalId = null;
	scanStartTime = 0;
	currentError = null;
	detectedQRData = null;
	constructor(options = {}, events = {}) {
		this.options = options;
		this.events = events;
		this.canvas = document.createElement("canvas");
		const ctx = this.canvas.getContext("2d");
		if (!ctx) throw new Error("Unable to get canvas 2D context");
		this.ctx = ctx;
	}
	/**
	* Get current flow state
	*/
	getState() {
		return {
			state: this.state,
			isScanning: this.state === ScanQRCodeFlowState.SCANNING,
			scanDuration: this.scanStartTime ? Date.now() - this.scanStartTime : 0,
			error: this.currentError,
			qrData: this.detectedQRData
		};
	}
	/**
	* Start scanning for QR codes
	*/
	async startQRScanner() {
		if (this.state !== ScanQRCodeFlowState.IDLE && this.state !== ScanQRCodeFlowState.ERROR && this.state !== ScanQRCodeFlowState.CANCELLED) return;
		this.setState(ScanQRCodeFlowState.INITIALIZING);
		this.currentError = null;
		this.detectedQRData = null;
		try {
			const constraints = this.buildCameraConstraints();
			this.mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
			if (!this.video) {
				this.video = document.createElement("video");
				this.video.playsInline = true;
				this.video.muted = true;
			}
			this.video.srcObject = this.mediaStream;
			await this.video.play();
			this.events.onCameraReady?.(this.mediaStream);
			this.setState(ScanQRCodeFlowState.SCANNING);
			this.scanStartTime = Date.now();
			this.startProgressTracking();
			const timeout = this.options.timeout ?? 6e4;
			if (timeout > 0) this.timeoutId = setTimeout(() => {
				this.handleError(/* @__PURE__ */ new Error(`Camera scan timeout - no QR code detected within ${timeout}ms`));
			}, timeout);
			this.scanFrame();
		} catch (error) {
			this.handleError(/* @__PURE__ */ new Error(`Camera access failed: ${error.message}`));
		}
	}
	/**
	* Stop scanning and cleanup resources
	*
	* This method stops the scanning process and cleans up all internal resources.
	* For React contexts with external video elements, use destroy() instead.
	*/
	stop() {
		this.setState(ScanQRCodeFlowState.CANCELLED);
		this.cleanup();
	}
	/**
	* Attach an external video element (for React contexts)
	*/
	attachVideoElement(video) {
		this.video = video;
		if (this.mediaStream && this.state === ScanQRCodeFlowState.SCANNING) {
			this.video.srcObject = this.mediaStream;
			this.video.play();
		}
	}
	/**
	* Detach the video element
	*/
	detachVideoElement() {
		if (this.video) this.video.srcObject = null;
		this.video = null;
	}
	/**
	* Switch to a different camera
	*/
	async switchCamera(cameraId) {
		const wasScanning = this.state === ScanQRCodeFlowState.SCANNING;
		if (wasScanning) this.stop();
		this.options.cameraId = cameraId;
		if (wasScanning) await this.startQRScanner();
	}
	/**
	* Get available video devices
	*/
	async getAvailableCameras() {
		try {
			const devices = await navigator.mediaDevices.enumerateDevices();
			return devices.filter((device) => device.kind === "videoinput");
		} catch (error) {
			console.error("Error enumerating cameras:", error);
			throw new Error("Failed to access camera devices");
		}
	}
	/**
	* Get the current media stream (for external video elements)
	*/
	getMediaStream() {
		return this.mediaStream;
	}
	setState(newState) {
		this.state = newState;
	}
	buildCameraConstraints() {
		const constraints = { video: {
			deviceId: this.options.cameraId || void 0,
			width: {
				ideal: 720,
				min: 480
			},
			height: {
				ideal: 720,
				min: 480
			},
			aspectRatio: { ideal: 1 },
			facingMode: this.options.cameraId ? void 0 : this.options.cameraConfigs?.facingMode
		} };
		if (this.options.cameraConfigs?.width || this.options.cameraConfigs?.height) {
			const videoConstraints = constraints.video;
			if (this.options.cameraConfigs.width) videoConstraints.width = {
				ideal: this.options.cameraConfigs.width,
				min: 480
			};
			if (this.options.cameraConfigs.height) videoConstraints.height = {
				ideal: this.options.cameraConfigs.height,
				min: 480
			};
		}
		return constraints;
	}
	startProgressTracking() {
		this.progressIntervalId = setInterval(() => {
			if (this.state === ScanQRCodeFlowState.SCANNING) {
				const duration = Date.now() - this.scanStartTime;
				this.events.onScanProgress?.(duration);
			}
		}, 100);
	}
	async scanFrame() {
		if (this.state !== ScanQRCodeFlowState.SCANNING || !this.video || !this.mediaStream) return;
		try {
			if (this.video.readyState === this.video.HAVE_ENOUGH_DATA) {
				this.canvas.width = this.video.videoWidth;
				this.canvas.height = this.video.videoHeight;
				this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
				const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
				const qrData = await this.scanQRFromImageData(imageData);
				if (qrData) {
					const parsedData = this.parseAndValidateQRData(qrData);
					this.handleSuccess(parsedData);
					return;
				}
			}
		} catch (error) {
			this.handleError(error instanceof Error ? error : new Error(String(error)));
			return;
		}
		if (this.state === ScanQRCodeFlowState.SCANNING) this.animationId = requestAnimationFrame(() => this.scanFrame());
	}
	async scanQRFromImageData(imageData) {
		const { default: jsQR } = await Promise.resolve().then(() => require_rolldown_runtime.__toDynamicImportESM(1)(require("../node_modules/.pnpm/jsqr@1.4.0/node_modules/jsqr/dist/jsQR.js")));
		const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "dontInvert" });
		return code ? code.data : null;
	}
	parseAndValidateQRData(qrData) {
		let parsedData;
		try {
			parsedData = JSON.parse(qrData);
		} catch {
			if (qrData.startsWith("http")) throw new Error("QR code contains a URL, not device linking data");
			if (qrData.includes("ed25519:")) throw new Error("QR code contains a NEAR key, not device linking data");
			throw new Error("Invalid QR code format - expected JSON device linking data");
		}
		require_scanDevice.validateDeviceLinkingQRData(parsedData);
		return parsedData;
	}
	handleSuccess(qrData) {
		this.setState(ScanQRCodeFlowState.SUCCESS);
		this.detectedQRData = qrData;
		this.cleanup();
		this.events.onQRDetected?.(qrData);
	}
	handleError(error) {
		this.setState(ScanQRCodeFlowState.ERROR);
		this.currentError = error;
		this.cleanup();
		this.events.onError?.(error);
	}
	cleanup() {
		if (this.animationId) {
			cancelAnimationFrame(this.animationId);
			this.animationId = null;
		}
		if (this.timeoutId) {
			clearTimeout(this.timeoutId);
			this.timeoutId = null;
		}
		if (this.progressIntervalId) {
			clearInterval(this.progressIntervalId);
			this.progressIntervalId = null;
		}
		if (this.mediaStream) {
			this.mediaStream.getTracks().forEach((track) => track.stop());
			this.mediaStream = null;
		}
		if (this.video) this.video.srcObject = null;
	}
};

//#endregion
exports.ScanQRCodeFlow = ScanQRCodeFlow;
exports.ScanQRCodeFlowState = ScanQRCodeFlowState;
//# sourceMappingURL=qrScanner.js.map