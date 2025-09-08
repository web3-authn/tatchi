const require_rolldown_runtime = require('../../_virtual/rolldown_runtime.js');
let react = require("react");
react = require_rolldown_runtime.__toESM(react);
let react_jsx_runtime = require("react/jsx-runtime");
react_jsx_runtime = require_rolldown_runtime.__toESM(react_jsx_runtime);

//#region src/react/components/PasskeyAuthMenu/SegmentedControl.tsx
const SegmentedControl = ({ mode, onChange, activeBg }) => {
	const handleModeChange = (newMode) => {
		if (newMode !== mode) onChange(newMode);
	};
	const getTransform = () => {
		switch (mode) {
			case "register": return "translateX(0)";
			case "login": return "translateX(100%)";
			case "recover": return "translateX(200%)";
			default: return "translateX(0)";
		}
	};
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		className: "w3a-seg",
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
			className: "w3a-seg-active",
			style: {
				transform: getTransform(),
				background: activeBg
			}
		}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
			className: "w3a-seg-grid",
			children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					className: `w3a-seg-btn register${mode === "register" ? " is-active" : ""}`,
					onClick: () => handleModeChange("register"),
					children: "Register"
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					className: `w3a-seg-btn login${mode === "login" ? " is-active" : ""}`,
					onClick: () => handleModeChange("login"),
					children: "Login"
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					className: `w3a-seg-btn recover${mode === "recover" ? " is-active" : ""}`,
					onClick: () => handleModeChange("recover"),
					children: "Recover"
				})
			]
		})]
	});
};

//#endregion
exports.SegmentedControl = SegmentedControl;
//# sourceMappingURL=SegmentedControl.js.map