const require_rolldown_runtime = require('../_virtual/rolldown_runtime.js');
let react = require("react");
react = require_rolldown_runtime.__toESM(react);
let react_jsx_runtime = require("react/jsx-runtime");
react_jsx_runtime = require_rolldown_runtime.__toESM(react_jsx_runtime);

//#region src/react/components/QRCodeIcon.tsx
/**
* QRCodeIcon — React wrapper for the lucide QR Code SVG.
* Uses currentColor for stroke so it inherits color from context.
*/
const QRCodeIcon = ({ className, width = 24, height = 24, strokeWidth = 2, style }) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
	xmlns: "http://www.w3.org/2000/svg",
	width,
	height,
	viewBox: "0 0 24 24",
	fill: "none",
	stroke: "currentColor",
	strokeWidth,
	strokeLinecap: "round",
	strokeLinejoin: "round",
	className: `lucide lucide-qr-code-icon lucide-qr-code${className ? ` ${className}` : ""}`,
	style,
	children: [
		/* @__PURE__ */ (0, react_jsx_runtime.jsx)("rect", {
			width: "5",
			height: "5",
			x: "3",
			y: "3",
			rx: "1"
		}),
		/* @__PURE__ */ (0, react_jsx_runtime.jsx)("rect", {
			width: "5",
			height: "5",
			x: "16",
			y: "3",
			rx: "1"
		}),
		/* @__PURE__ */ (0, react_jsx_runtime.jsx)("rect", {
			width: "5",
			height: "5",
			x: "3",
			y: "16",
			rx: "1"
		}),
		/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M21 16h-3a2 2 0 0 0-2 2v3" }),
		/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M21 21v.01" }),
		/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M12 7v3a2 2 0 0 1-2 2H7" }),
		/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M3 12h.01" }),
		/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M12 3h.01" }),
		/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M12 16v.01" }),
		/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M16 12h1" }),
		/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M21 12v.01" }),
		/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M12 21v-1" })
	]
});
var QRCodeIcon_default = QRCodeIcon;

//#endregion
exports.default = QRCodeIcon_default;
//# sourceMappingURL=QRCodeIcon.js.map