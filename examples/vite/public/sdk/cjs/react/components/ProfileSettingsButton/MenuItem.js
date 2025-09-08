const require_rolldown_runtime = require('../../_virtual/rolldown_runtime.js');
let react = require("react");
react = require_rolldown_runtime.__toESM(react);
let react_jsx_runtime = require("react/jsx-runtime");
react_jsx_runtime = require_rolldown_runtime.__toESM(react_jsx_runtime);

//#region src/react/components/ProfileSettingsButton/MenuItem.tsx
const MenuItem = (0, react.memo)((0, react.forwardRef)(({ item, index, onClose, className, style }, ref) => {
	const handleClick = (e) => {
		e.stopPropagation();
		if (!item.disabled) {
			console.log(`Clicked: ${item.label}`);
			if (item.onClick) item.onClick();
			if (!item.keepOpenOnClick) onClose();
		}
	};
	const disabledClass = item.disabled ? " disabled" : "";
	const classNameProps = className ? ` ${className}` : "";
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
		ref,
		disabled: item.disabled,
		className: `w3a-dropdown-menu-item${disabledClass}${classNameProps}`,
		style,
		onClick: handleClick,
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
			className: "w3a-dropdown-menu-item-icon",
			children: item.icon
		}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
			className: "w3a-dropdown-menu-item-content",
			children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "w3a-dropdown-menu-item-label",
				children: item.label
			}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "w3a-dropdown-menu-item-description",
				children: item.description
			})]
		})]
	});
}));

//#endregion
exports.MenuItem = MenuItem;
//# sourceMappingURL=MenuItem.js.map