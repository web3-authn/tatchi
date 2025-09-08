const require_rolldown_runtime = require('../_virtual/rolldown_runtime.js');
const require_passkeyManager = require('../packages/passkey/src/core/types/passkeyManager.js');
const require_index = require('../context/index.js');
require('./ShowQRCode.js');
let react = require("react");
react = require_rolldown_runtime.__toESM(react);
let react_jsx_runtime = require("react/jsx-runtime");
react_jsx_runtime = require_rolldown_runtime.__toESM(react_jsx_runtime);

//#region src/react/components/ShowQRCode.tsx
function ShowQRCode({ isOpen, onClose, onEvent, onError, deviceLinkingFlow }) {
	const { startDeviceLinkingFlow } = require_index.usePasskeyContext();
	const [deviceLinkingState, setDeviceLinkingState] = (0, react.useState)({
		mode: "idle",
		isProcessing: false
	});
	const flowRef = (0, react.useRef)(null);
	(0, react.useEffect)(() => {
		return () => {
			if (flowRef.current) {
				flowRef.current?.cancel();
				flowRef.current = null;
			}
		};
	}, []);
	(0, react.useEffect)(() => {
		if (!isOpen) return;
		let cancelled = false;
		setDeviceLinkingState({
			mode: "device2",
			isProcessing: true
		});
		const device2Flow = deviceLinkingFlow ?? startDeviceLinkingFlow({
			onEvent: (event) => {
				if (cancelled) return;
				onEvent(event);
				if (event.phase === require_passkeyManager.DeviceLinkingPhase.STEP_7_LINKING_COMPLETE && event.status === require_passkeyManager.DeviceLinkingStatus.SUCCESS) try {
					onClose();
				} catch {}
			},
			onError: (error) => {
				if (cancelled) return;
				setDeviceLinkingState({
					mode: "idle",
					isProcessing: false
				});
				onError(error);
				try {
					onClose();
				} catch {}
			}
		});
		flowRef.current = device2Flow;
		(async () => {
			(async () => {
				try {
					const { qrCodeDataURL } = await device2Flow.generateQR();
					if (!cancelled) setDeviceLinkingState((prev) => ({
						...prev,
						qrCodeDataURL,
						isProcessing: false
					}));
				} catch (err) {
					if (!cancelled) setDeviceLinkingState({
						mode: "idle",
						isProcessing: false
					});
				}
			})();
		})();
		return () => {
			cancelled = true;
			const shouldCancel = !deviceLinkingFlow;
			if (shouldCancel) device2Flow.cancel();
			if (flowRef.current === device2Flow) flowRef.current = null;
		};
	}, [isOpen, deviceLinkingFlow]);
	if (!isOpen) return null;
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		className: "qr-code-container",
		onClick: (e) => e.stopPropagation(),
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
			className: "qr-header",
			children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
				className: "qr-title",
				children: "Scan and Link Device"
			})
		}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
			className: "qr-body",
			children: deviceLinkingState.mode === "device2" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "qr-code-section",
				children: [deviceLinkingState.qrCodeDataURL ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "qr-code-display",
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("img", {
						src: deviceLinkingState.qrCodeDataURL,
						alt: "Device Linking QR Code",
						className: "qr-code-image"
					})
				}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "qr-loading",
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: "Generating QR code..." })
				}), deviceLinkingState.qrCodeDataURL && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "qr-instruction",
					children: "Scan to backup your other device."
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "qr-status",
					children: ["Waiting for your other device to scan", /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: "animated-ellipsis" })]
				})] })]
			})
		})]
	});
}

//#endregion
exports.ShowQRCode = ShowQRCode;
//# sourceMappingURL=ShowQRCode2.js.map