import { DeviceLinkingPhase, DeviceLinkingStatus } from "../packages/passkey/src/core/types/passkeyManager.js";
import { usePasskeyContext } from "../context/index.js";
import "./ShowQRCode.js";
import { useEffect, useRef, useState } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";

//#region src/react/components/ShowQRCode.tsx
function ShowQRCode({ isOpen, onClose, onEvent, onError, deviceLinkingFlow }) {
	const { startDeviceLinkingFlow } = usePasskeyContext();
	const [deviceLinkingState, setDeviceLinkingState] = useState({
		mode: "idle",
		isProcessing: false
	});
	const flowRef = useRef(null);
	useEffect(() => {
		return () => {
			if (flowRef.current) {
				flowRef.current?.cancel();
				flowRef.current = null;
			}
		};
	}, []);
	useEffect(() => {
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
				if (event.phase === DeviceLinkingPhase.STEP_7_LINKING_COMPLETE && event.status === DeviceLinkingStatus.SUCCESS) try {
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
	return /* @__PURE__ */ jsxs("div", {
		className: "qr-code-container",
		onClick: (e) => e.stopPropagation(),
		children: [/* @__PURE__ */ jsx("div", {
			className: "qr-header",
			children: /* @__PURE__ */ jsx("h2", {
				className: "qr-title",
				children: "Scan and Link Device"
			})
		}), /* @__PURE__ */ jsx("div", {
			className: "qr-body",
			children: deviceLinkingState.mode === "device2" && /* @__PURE__ */ jsxs("div", {
				className: "qr-code-section",
				children: [deviceLinkingState.qrCodeDataURL ? /* @__PURE__ */ jsx("div", {
					className: "qr-code-display",
					children: /* @__PURE__ */ jsx("img", {
						src: deviceLinkingState.qrCodeDataURL,
						alt: "Device Linking QR Code",
						className: "qr-code-image"
					})
				}) : /* @__PURE__ */ jsx("div", {
					className: "qr-loading",
					children: /* @__PURE__ */ jsx("p", { children: "Generating QR code..." })
				}), deviceLinkingState.qrCodeDataURL && /* @__PURE__ */ jsxs(Fragment, { children: [/* @__PURE__ */ jsx("div", {
					className: "qr-instruction",
					children: "Scan to backup your other device."
				}), /* @__PURE__ */ jsxs("div", {
					className: "qr-status",
					children: ["Waiting for your other device to scan", /* @__PURE__ */ jsx("span", { className: "animated-ellipsis" })]
				})] })]
			})
		})]
	});
}

//#endregion
export { ShowQRCode };
//# sourceMappingURL=ShowQRCode2.js.map