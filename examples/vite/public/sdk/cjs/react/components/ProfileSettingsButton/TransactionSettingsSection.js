const require_rolldown_runtime = require('../../_virtual/rolldown_runtime.js');
const require_Toggle = require('./Toggle.js');
const require_Slider = require('./Slider.js');
let react = require("react");
react = require_rolldown_runtime.__toESM(react);
let react_jsx_runtime = require("react/jsx-runtime");
react_jsx_runtime = require_rolldown_runtime.__toESM(react_jsx_runtime);

//#region src/react/components/ProfileSettingsButton/TransactionSettingsSection.tsx
const TransactionSettingsSection = ({ currentConfirmConfig, onToggleShowDetails, onToggleSkipClick, onSetDelay, onToggleTheme, className, style, isOpen = true, theme = "dark" }) => {
	const handleClick = (e) => {
		e.stopPropagation();
	};
	const disableDelaySlider = currentConfirmConfig?.uiMode !== "modal" || currentConfirmConfig?.behavior !== "autoProceed";
	const disableRequireClick = currentConfirmConfig?.uiMode !== "modal";
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
		className: `w3a-dropdown-tx-settings-root ${isOpen ? "is-expanded" : ""} ${className || ""}`,
		style,
		onClick: handleClick,
		children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
			className: "w3a-dropdown-toggle-tx-settings",
			children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "w3a-dropdown-toggle-tx-settings-content",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: {
						width: "100%",
						display: "flex",
						flexDirection: "column",
						gap: 8
					},
					children: [
						onToggleTheme && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(require_Toggle.Toggle, {
							checked: currentConfirmConfig?.theme === "dark",
							onChange: onToggleTheme,
							label: "Dark mode",
							size: "large",
							textPosition: "left",
							theme
						}) }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(require_Toggle.Toggle, {
							checked: currentConfirmConfig?.uiMode === "modal",
							onChange: onToggleShowDetails,
							label: "Show confirm modal",
							size: "large",
							textPosition: "left",
							theme
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: {
								opacity: disableRequireClick ? .6 : 1,
								pointerEvents: disableRequireClick ? "none" : "auto"
							},
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(require_Toggle.Toggle, {
								checked: currentConfirmConfig?.behavior === "autoProceed",
								onChange: onToggleSkipClick,
								label: "Auto-skip modal",
								size: "large",
								textPosition: "left",
								disabled: disableRequireClick,
								theme
							})
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(require_Slider.Slider, {
							disabled: disableDelaySlider,
							min: 0,
							max: 6,
							step: 1,
							value: Math.round((currentConfirmConfig?.autoProceedDelay ?? 1e3) / 500),
							onChange: (v) => onSetDelay(v * 500),
							theme
						})
					]
				})
			})
		})
	});
};

//#endregion
exports.TransactionSettingsSection = TransactionSettingsSection;
//# sourceMappingURL=TransactionSettingsSection.js.map