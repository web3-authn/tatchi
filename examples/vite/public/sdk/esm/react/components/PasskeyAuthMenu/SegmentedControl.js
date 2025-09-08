import React from "react";
import { jsx, jsxs } from "react/jsx-runtime";

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
	return /* @__PURE__ */ jsxs("div", {
		className: "w3a-seg",
		children: [/* @__PURE__ */ jsx("div", {
			className: "w3a-seg-active",
			style: {
				transform: getTransform(),
				background: activeBg
			}
		}), /* @__PURE__ */ jsxs("div", {
			className: "w3a-seg-grid",
			children: [
				/* @__PURE__ */ jsx("button", {
					className: `w3a-seg-btn register${mode === "register" ? " is-active" : ""}`,
					onClick: () => handleModeChange("register"),
					children: "Register"
				}),
				/* @__PURE__ */ jsx("button", {
					className: `w3a-seg-btn login${mode === "login" ? " is-active" : ""}`,
					onClick: () => handleModeChange("login"),
					children: "Login"
				}),
				/* @__PURE__ */ jsx("button", {
					className: `w3a-seg-btn recover${mode === "recover" ? " is-active" : ""}`,
					onClick: () => handleModeChange("recover"),
					children: "Recover"
				})
			]
		})]
	});
};

//#endregion
export { SegmentedControl };
//# sourceMappingURL=SegmentedControl.js.map