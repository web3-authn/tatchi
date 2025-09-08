import React from "react";
import { jsx, jsxs } from "react/jsx-runtime";

//#region src/react/components/ProfileSettingsButton/Slider.tsx
/**
* Token-aware slider component styled via TransactionSettingsSection.css
* Uses CSS variables from design-tokens for colors, radii, and shadows.
*/
const Slider = ({ value, min = 0, max = 100, step = 1, disabled = false, className = "", onChange, theme }) => {
	return /* @__PURE__ */ jsx("div", {
		className: "w3a-slider-root",
		style: {
			opacity: disabled ? .5 : 1,
			pointerEvents: disabled ? "none" : "auto"
		},
		children: /* @__PURE__ */ jsxs("div", {
			className: "w3a-slider-container",
			children: [/* @__PURE__ */ jsx("input", {
				type: "range",
				role: "slider",
				"aria-valuemin": min,
				"aria-valuemax": max,
				"aria-valuenow": value,
				min,
				max,
				step,
				value,
				disabled,
				onChange: (e) => onChange(parseInt(e.target.value)),
				className: `w3a-slider ${theme ? `theme-${theme}` : ""} ${className}`
			}), /* @__PURE__ */ jsxs("div", {
				className: "w3a-slider-labels",
				style: { display: disabled ? "none" : "flex" },
				children: [
					/* @__PURE__ */ jsx("span", { children: "0s" }),
					/* @__PURE__ */ jsx("span", { children: "0.5s" }),
					/* @__PURE__ */ jsx("span", { children: "1s" }),
					/* @__PURE__ */ jsx("span", { children: "1.5s" }),
					/* @__PURE__ */ jsx("span", { children: "2s" }),
					/* @__PURE__ */ jsx("span", { children: "2.5s" }),
					/* @__PURE__ */ jsx("span", { children: "3s" })
				]
			})]
		})
	});
};

//#endregion
export { Slider };
//# sourceMappingURL=Slider.js.map