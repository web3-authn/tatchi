const require_rolldown_runtime = require('../../_virtual/rolldown_runtime.js');
let react = require("react");
react = require_rolldown_runtime.__toESM(react);
let react_jsx_runtime = require("react/jsx-runtime");
react_jsx_runtime = require_rolldown_runtime.__toESM(react_jsx_runtime);

//#region src/react/components/PasskeyAuthMenu/ContentSwitcher.tsx
const ContentSwitcher = ({ waiting, waitingText = "Waiting for Passkey…", showScanDevice = false, scanDeviceContent, children, backButton }) => {
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		className: "w3a-content-switcher",
		children: [backButton, /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
			className: "w3a-content-area",
			children: [
				waiting && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "w3a-waiting",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "w3a-waiting-text",
						children: waitingText
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						"aria-label": "Loading",
						className: "w3a-spinner"
					})]
				}),
				showScanDevice && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "w3a-scan-device-content",
					children: scanDeviceContent
				}),
				!waiting && !showScanDevice && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "w3a-signin-menu",
					children
				})
			]
		})]
	});
};

//#endregion
exports.ContentSwitcher = ContentSwitcher;
//# sourceMappingURL=ContentSwitcher.js.map