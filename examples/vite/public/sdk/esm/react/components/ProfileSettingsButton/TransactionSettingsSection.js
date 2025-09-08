import { Toggle } from "./Toggle.js";
import { Slider } from "./Slider.js";
import React from "react";
import { jsx, jsxs } from "react/jsx-runtime";

//#region src/react/components/ProfileSettingsButton/TransactionSettingsSection.tsx
const TransactionSettingsSection = ({ currentConfirmConfig, onToggleShowDetails, onToggleSkipClick, onSetDelay, onToggleTheme, className, style, isOpen = true, theme = "dark" }) => {
	const handleClick = (e) => {
		e.stopPropagation();
	};
	const disableDelaySlider = currentConfirmConfig?.uiMode !== "modal" || currentConfirmConfig?.behavior !== "autoProceed";
	const disableRequireClick = currentConfirmConfig?.uiMode !== "modal";
	return /* @__PURE__ */ jsx("div", {
		className: `w3a-dropdown-tx-settings-root ${isOpen ? "is-expanded" : ""} ${className || ""}`,
		style,
		onClick: handleClick,
		children: /* @__PURE__ */ jsx("div", {
			className: "w3a-dropdown-toggle-tx-settings",
			children: /* @__PURE__ */ jsx("div", {
				className: "w3a-dropdown-toggle-tx-settings-content",
				children: /* @__PURE__ */ jsxs("div", {
					style: {
						width: "100%",
						display: "flex",
						flexDirection: "column",
						gap: 8
					},
					children: [
						onToggleTheme && /* @__PURE__ */ jsx("div", { children: /* @__PURE__ */ jsx(Toggle, {
							checked: currentConfirmConfig?.theme === "dark",
							onChange: onToggleTheme,
							label: "Dark mode",
							size: "large",
							textPosition: "left",
							theme
						}) }),
						/* @__PURE__ */ jsx(Toggle, {
							checked: currentConfirmConfig?.uiMode === "modal",
							onChange: onToggleShowDetails,
							label: "Show confirm modal",
							size: "large",
							textPosition: "left",
							theme
						}),
						/* @__PURE__ */ jsx("div", {
							style: {
								opacity: disableRequireClick ? .6 : 1,
								pointerEvents: disableRequireClick ? "none" : "auto"
							},
							children: /* @__PURE__ */ jsx(Toggle, {
								checked: currentConfirmConfig?.behavior === "autoProceed",
								onChange: onToggleSkipClick,
								label: "Auto-skip modal",
								size: "large",
								textPosition: "left",
								disabled: disableRequireClick,
								theme
							})
						}),
						/* @__PURE__ */ jsx(Slider, {
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
export { TransactionSettingsSection };
//# sourceMappingURL=TransactionSettingsSection.js.map