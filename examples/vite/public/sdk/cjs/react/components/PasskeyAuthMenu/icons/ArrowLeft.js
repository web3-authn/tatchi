const require_rolldown_runtime = require('../../../_virtual/rolldown_runtime.js');
let react = require("react");
react = require_rolldown_runtime.__toESM(react);
let react_jsx_runtime = require("react/jsx-runtime");
react_jsx_runtime = require_rolldown_runtime.__toESM(react_jsx_runtime);

//#region src/react/components/PasskeyAuthMenu/icons/ArrowLeft.tsx
const ArrowLeftIcon = ({ size = 24, className = "", color = "currentColor", strokeWidth = 2, style }) => {
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
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "m12 19-7-7 7-7" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M19 12H5" })]
	});
};

//#endregion
exports.ArrowLeftIcon = ArrowLeftIcon;
//# sourceMappingURL=ArrowLeft.js.map