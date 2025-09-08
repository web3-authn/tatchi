import React from "react";
import { jsx, jsxs } from "react/jsx-runtime";

//#region src/react/components/PasskeyAuthMenu/icons/ArrowUp.tsx
const ArrowUpIcon = ({ size = 24, className = "", color = "currentColor", strokeWidth = 2, style }) => {
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
		children: [/* @__PURE__ */ jsx("path", { d: "m5 12 7-7 7 7" }), /* @__PURE__ */ jsx("path", { d: "M12 19V5" })]
	});
};

//#endregion
export { ArrowUpIcon };
//# sourceMappingURL=ArrowUp.js.map