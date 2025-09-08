const require_rolldown_runtime = require('../../../_virtual/rolldown_runtime.js');
let react = require("react");
react = require_rolldown_runtime.__toESM(react);
let react_jsx_runtime = require("react/jsx-runtime");
react_jsx_runtime = require_rolldown_runtime.__toESM(react_jsx_runtime);

//#region src/react/components/PasskeyAuthMenu/icons/Chrome.tsx
const ChromeIcon = ({ size = 24, className = "", color = "currentColor", strokeWidth = 2, style }) => {
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
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
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M10.88 21.94 15.46 14" }),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M21.17 8H12" }),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M3.95 6.06 8.54 14" }),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
				cx: "12",
				cy: "12",
				r: "10"
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
				cx: "12",
				cy: "12",
				r: "4"
			})
		]
	});
};

//#endregion
exports.ChromeIcon = ChromeIcon;
//# sourceMappingURL=Chrome.js.map