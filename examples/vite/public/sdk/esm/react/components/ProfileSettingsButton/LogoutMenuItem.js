import LogOutIcon2_default from "./LogOutIcon2.js";
import { memo } from "react";
import { jsx, jsxs } from "react/jsx-runtime";

//#region src/react/components/ProfileSettingsButton/LogoutMenuItem.tsx
const LogoutMenuItem = memo(({ onLogout, className, style }) => {
	return /* @__PURE__ */ jsxs("button", {
		className: `w3a-dropdown-menu-item ${className || ""}`,
		style,
		onClick: (e) => {
			e.stopPropagation();
			onLogout();
		},
		children: [/* @__PURE__ */ jsx("div", {
			className: "w3a-dropdown-menu-item-icon",
			children: /* @__PURE__ */ jsx(LogOutIcon2_default, {})
		}), /* @__PURE__ */ jsx("div", {
			className: "w3a-dropdown-menu-item-content",
			children: /* @__PURE__ */ jsx("div", {
				className: "w3a-dropdown-menu-item-label",
				children: "Lock Wallet"
			})
		})]
	});
});

//#endregion
export { LogoutMenuItem };
//# sourceMappingURL=LogoutMenuItem.js.map