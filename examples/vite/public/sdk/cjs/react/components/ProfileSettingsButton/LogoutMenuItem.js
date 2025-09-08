const require_rolldown_runtime = require('../../_virtual/rolldown_runtime.js');
const require_LogOutIcon2 = require('./LogOutIcon2.js');
let react = require("react");
react = require_rolldown_runtime.__toESM(react);
let react_jsx_runtime = require("react/jsx-runtime");
react_jsx_runtime = require_rolldown_runtime.__toESM(react_jsx_runtime);

//#region src/react/components/ProfileSettingsButton/LogoutMenuItem.tsx
const LogoutMenuItem = (0, react.memo)(({ onLogout, className, style }) => {
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
		className: `w3a-dropdown-menu-item ${className || ""}`,
		style,
		onClick: (e) => {
			e.stopPropagation();
			onLogout();
		},
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
			className: "w3a-dropdown-menu-item-icon",
			children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(require_LogOutIcon2.default, {})
		}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
			className: "w3a-dropdown-menu-item-content",
			children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "w3a-dropdown-menu-item-label",
				children: "Lock Wallet"
			})
		})]
	});
});

//#endregion
exports.LogoutMenuItem = LogoutMenuItem;
//# sourceMappingURL=LogoutMenuItem.js.map