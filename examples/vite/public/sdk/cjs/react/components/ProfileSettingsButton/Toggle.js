const require_rolldown_runtime = require('../../_virtual/rolldown_runtime.js');
const require_design_tokens = require('../theme/design-tokens.js');
let react_jsx_runtime = require("react/jsx-runtime");
react_jsx_runtime = require_rolldown_runtime.__toESM(react_jsx_runtime);

//#region src/react/components/ProfileSettingsButton/Toggle.tsx
const Toggle = ({ checked, onChange, tooltip, label = "", showTooltip = true, className = "", size = "small", textPosition = "left", colors, disabled = false, theme = "light" }) => {
	const isLarge = size === "large";
	const isTextOnLeft = textPosition === "left";
	const themeColors = colors || (theme === "dark" ? require_design_tokens.PROFILE_TOGGLE_TOKENS.dark : require_design_tokens.PROFILE_TOGGLE_TOKENS.light);
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		className: `${className}`,
		children: [!showTooltip && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("style", { children: `
            .toggle-label.no-tooltip::after,
            .toggle-label.no-tooltip::before {
              display: none !important;
            }
          ` }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
			className: `toggle-label ${!showTooltip || !tooltip ? "no-tooltip" : ""}`,
			...tooltip && showTooltip && { "data-tooltip": tooltip },
			style: {
				position: "relative",
				cursor: disabled ? "not-allowed" : "pointer",
				userSelect: "none",
				fontWeight: "500",
				color: disabled ? themeColors.disabledTextColor : themeColors.textColor,
				flexDirection: isTextOnLeft ? "row-reverse" : "row",
				...isLarge && {
					display: "flex",
					alignItems: "center",
					gap: "var(--w3a-spacing-sm)"
				}
			},
			children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
					type: "checkbox",
					checked,
					onChange: (e) => !disabled && onChange(e.target.checked),
					className: "toggle-checkbox",
					disabled,
					style: {
						opacity: 0,
						position: "absolute",
						width: 0,
						height: 0
					}
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					style: {
						position: "relative",
						display: "inline-block",
						width: isLarge ? "44px" : "32px",
						height: isLarge ? "24px" : "16px",
						...disabled ? { backgroundColor: themeColors.disabledBackground } : checked ? { background: themeColors.activeBackground } : { backgroundColor: themeColors.inactiveBackground },
						borderRadius: isLarge ? "var(--w3a-border-radius-lg)" : "var(--w3a-border-radius-md)",
						transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
						cursor: disabled ? "not-allowed" : "pointer",
						transform: disabled ? "scale(1)" : checked ? "scale(1.02)" : "scale(1)",
						...isLarge && { [isTextOnLeft ? "marginLeft" : "marginRight"]: "var(--w3a-spacing-sm)" }
					},
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { style: {
						position: "absolute",
						content: "\"\"",
						height: isLarge ? "18px" : "12px",
						width: isLarge ? "18px" : "12px",
						left: isLarge ? "3px" : "2px",
						bottom: isLarge ? "3px" : "2px",
						backgroundColor: disabled ? themeColors.disabledCircle : themeColors.circleColor,
						borderRadius: "50%",
						transform: disabled ? "translateX(0px) scale(1)" : checked ? `translateX(${isLarge ? "20px" : "15px"}) scale(1.1)` : "translateX(0px) scale(1)",
						transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)"
					} })
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: "toggle-text",
					style: {
						fontWeight: "500",
						fontSize: isLarge ? "14px" : "0.8rem",
						color: disabled ? themeColors.disabledBackground : themeColors.textColor,
						[isTextOnLeft ? "marginRight" : "marginLeft"]: isLarge ? "0" : "var(--w3a-spacing-sm)",
						display: "flex",
						alignItems: "center",
						height: isLarge ? "24px" : "16px",
						lineHeight: 1
					},
					children: label
				})
			]
		})]
	});
};

//#endregion
exports.Toggle = Toggle;
//# sourceMappingURL=Toggle.js.map