import { forwardRef, memo } from "react";
import { jsx, jsxs } from "react/jsx-runtime";

//#region src/react/components/ProfileSettingsButton/MenuItem.tsx
const MenuItem = memo(forwardRef(({ item, index, onClose, className, style }, ref) => {
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
	return /* @__PURE__ */ jsxs("button", {
		ref,
		disabled: item.disabled,
		className: `w3a-dropdown-menu-item${disabledClass}${classNameProps}`,
		style,
		onClick: handleClick,
		children: [/* @__PURE__ */ jsx("div", {
			className: "w3a-dropdown-menu-item-icon",
			children: item.icon
		}), /* @__PURE__ */ jsxs("div", {
			className: "w3a-dropdown-menu-item-content",
			children: [/* @__PURE__ */ jsx("div", {
				className: "w3a-dropdown-menu-item-label",
				children: item.label
			}), /* @__PURE__ */ jsx("div", {
				className: "w3a-dropdown-menu-item-description",
				children: item.description
			})]
		})]
	});
}));

//#endregion
export { MenuItem };
//# sourceMappingURL=MenuItem.js.map