import React from "react";
import { jsx, jsxs } from "react/jsx-runtime";

//#region src/react/components/PasskeyAuthMenu/icons/AtSign.tsx
const AtSignIcon = ({ size = 24, className = "", color = "currentColor", strokeWidth = 2, style }) => {
	return /* @__PURE__ */ jsxs("svg", {
		xmlns: "http://www.w3.org/2000/svg",
		width: size,
		height: size,
		viewBox: "0 0 24 24",
		fill: "none",
		stroke: color,
		strokeWidth,
		strokeLinecap: "round",
		strokeLinejoin: "round",
		className,
		style,
		children: [/* @__PURE__ */ jsx("circle", {
			cx: "12",
			cy: "12",
			r: "4"
		}), /* @__PURE__ */ jsx("path", { d: "M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8" })]
	});
};

//#endregion
export { AtSignIcon };
//# sourceMappingURL=AtSign.js.map