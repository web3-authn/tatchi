import React from "react";
import { jsx, jsxs } from "react/jsx-runtime";

//#region src/react/components/PasskeyAuthMenu/icons/ArrowLeft.tsx
const ArrowLeftIcon = ({ size = 24, className = "", color = "currentColor", strokeWidth = 2, style }) => {
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
		children: [/* @__PURE__ */ jsx("path", { d: "m12 19-7-7 7-7" }), /* @__PURE__ */ jsx("path", { d: "M19 12H5" })]
	});
};

//#endregion
export { ArrowLeftIcon };
//# sourceMappingURL=ArrowLeft.js.map