import { MenuItem } from "./MenuItem.js";
import { LogoutMenuItem } from "./LogoutMenuItem.js";
import { TransactionSettingsSection } from "./TransactionSettingsSection.js";
import "./ProfileDropdown.js";
import { forwardRef } from "react";
import { jsx, jsxs } from "react/jsx-runtime";

//#region src/react/components/ProfileSettingsButton/ProfileDropdown.tsx
const ProfileDropdown = forwardRef(({ isOpen, menuItems, useRelayer, onRelayerChange, onLogout, onClose, menuItemsRef, toggleColors, currentConfirmConfig, onToggleShowDetails, onToggleSkipClick, onSetDelay, onToggleTheme, transactionSettingsOpen = false, theme = "dark" }, ref) => {
	const hasTransactionSettings = transactionSettingsOpen && currentConfirmConfig && onToggleShowDetails && onToggleSkipClick && onSetDelay;
	menuItems.length + (hasTransactionSettings ? 3 : 2);
	return /* @__PURE__ */ jsx("div", {
		ref,
		className: `w3a-profile-dropdown-morphed ${theme}`,
		"data-state": isOpen ? "open" : "closed",
		children: /* @__PURE__ */ jsxs("div", {
			className: "w3a-profile-dropdown-menu",
			children: [
				menuItems.map((item, index) => /* @__PURE__ */ jsx(MenuItem, {
					ref: (el) => {
						if (menuItemsRef.current) menuItemsRef.current[index + 1] = el;
					},
					item,
					index,
					onClose,
					className: "",
					style: { ["--stagger-item-n"]: index }
				}, index)),
				currentConfirmConfig && onToggleShowDetails && onToggleSkipClick && onSetDelay && /* @__PURE__ */ jsx(TransactionSettingsSection, {
					currentConfirmConfig,
					onToggleShowDetails,
					onToggleSkipClick,
					onSetDelay,
					onToggleTheme,
					isOpen: transactionSettingsOpen,
					theme,
					style: { ["--stagger-item-n"]: menuItems.length }
				}),
				/* @__PURE__ */ jsx(LogoutMenuItem, {
					onLogout,
					className: "w3a-logout-menu-item",
					style: { ["--stagger-item-n"]: hasTransactionSettings ? menuItems.length + 1 : menuItems.length }
				})
			]
		})
	});
});

//#endregion
export { ProfileDropdown };
//# sourceMappingURL=ProfileDropdown2.js.map