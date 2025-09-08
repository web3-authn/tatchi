import React from "react";
import { jsx, jsxs } from "react/jsx-runtime";

//#region src/react/components/PasskeyAuthMenu/ContentSwitcher.tsx
const ContentSwitcher = ({ waiting, waitingText = "Waiting for Passkey…", showScanDevice = false, scanDeviceContent, children, backButton }) => {
	return /* @__PURE__ */ jsxs("div", {
		className: "w3a-content-switcher",
		children: [backButton, /* @__PURE__ */ jsxs("div", {
			className: "w3a-content-area",
			children: [
				waiting && /* @__PURE__ */ jsxs("div", {
					className: "w3a-waiting",
					children: [/* @__PURE__ */ jsx("div", {
						className: "w3a-waiting-text",
						children: waitingText
					}), /* @__PURE__ */ jsx("div", {
						"aria-label": "Loading",
						className: "w3a-spinner"
					})]
				}),
				showScanDevice && /* @__PURE__ */ jsx("div", {
					className: "w3a-scan-device-content",
					children: scanDeviceContent
				}),
				!waiting && !showScanDevice && /* @__PURE__ */ jsx("div", {
					className: "w3a-signin-menu",
					children
				})
			]
		})]
	});
};

//#endregion
export { ContentSwitcher };
//# sourceMappingURL=ContentSwitcher.js.map