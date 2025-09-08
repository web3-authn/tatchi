const require_rolldown_runtime = require('../../_virtual/rolldown_runtime.js');
const require_MenuItem = require('./MenuItem.js');
const require_LogoutMenuItem = require('./LogoutMenuItem.js');
const require_TransactionSettingsSection = require('./TransactionSettingsSection.js');
require('./ProfileDropdown.js');
let react = require("react");
react = require_rolldown_runtime.__toESM(react);
let react_jsx_runtime = require("react/jsx-runtime");
react_jsx_runtime = require_rolldown_runtime.__toESM(react_jsx_runtime);

//#region src/react/components/ProfileSettingsButton/ProfileDropdown.tsx
const ProfileDropdown = (0, react.forwardRef)(({ isOpen, menuItems, useRelayer, onRelayerChange, onLogout, onClose, menuItemsRef, toggleColors, currentConfirmConfig, onToggleShowDetails, onToggleSkipClick, onSetDelay, onToggleTheme, transactionSettingsOpen = false, theme = "dark" }, ref) => {
	const hasTransactionSettings = transactionSettingsOpen && currentConfirmConfig && onToggleShowDetails && onToggleSkipClick && onSetDelay;
	menuItems.length + (hasTransactionSettings ? 3 : 2);
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
		ref,
		className: `w3a-profile-dropdown-morphed ${theme}`,
		"data-state": isOpen ? "open" : "closed",
		children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
			className: "w3a-profile-dropdown-menu",
			children: [
				menuItems.map((item, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(require_MenuItem.MenuItem, {
					ref: (el) => {
						if (menuItemsRef.current) menuItemsRef.current[index + 1] = el;
					},
					item,
					index,
					onClose,
					className: "",
					style: { ["--stagger-item-n"]: index }
				}, index)),
				currentConfirmConfig && onToggleShowDetails && onToggleSkipClick && onSetDelay && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(require_TransactionSettingsSection.TransactionSettingsSection, {
					currentConfirmConfig,
					onToggleShowDetails,
					onToggleSkipClick,
					onSetDelay,
					onToggleTheme,
					isOpen: transactionSettingsOpen,
					theme,
					style: { ["--stagger-item-n"]: menuItems.length }
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)(require_LogoutMenuItem.LogoutMenuItem, {
					onLogout,
					className: "w3a-logout-menu-item",
					style: { ["--stagger-item-n"]: hasTransactionSettings ? menuItems.length + 1 : menuItems.length }
				})
			]
		})
	});
});

//#endregion
exports.ProfileDropdown = ProfileDropdown;
//# sourceMappingURL=ProfileDropdown2.js.map