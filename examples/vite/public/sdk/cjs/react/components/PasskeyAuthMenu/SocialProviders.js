const require_rolldown_runtime = require('../../_virtual/rolldown_runtime.js');
const require_Apple = require('./icons/Apple.js');
const require_AtSign = require('./icons/AtSign.js');
const require_Chrome = require('./icons/Chrome.js');
let react = require("react");
react = require_rolldown_runtime.__toESM(react);
let react_jsx_runtime = require("react/jsx-runtime");
react_jsx_runtime = require_rolldown_runtime.__toESM(react_jsx_runtime);

//#region src/react/components/PasskeyAuthMenu/SocialProviders.tsx
const iconByKey = {
	google: {
		Icon: require_Chrome.ChromeIcon,
		label: "Google"
	},
	x: {
		Icon: require_AtSign.AtSignIcon,
		label: "X"
	},
	apple: {
		Icon: require_Apple.AppleIcon,
		label: "Apple"
	}
};
const SocialProviders = ({ socialLogin }) => {
	const entries = Object.entries(socialLogin || {});
	const enabled = entries.filter(([, fn]) => typeof fn === "function");
	if (!enabled.length) return null;
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
		className: "w3a-social-row",
		children: enabled.map(([key, fn]) => {
			const { Icon, label } = iconByKey[key];
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				className: "w3a-social-btn",
				title: label,
				onClick: () => {
					try {
						const result = fn?.();
						if (result) console.log(`[socialLogin:${String(key)}]`, result);
					} catch (e) {
						console.error(`[socialLogin:${String(key)}] error`, e);
					}
				},
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
					size: 22,
					style: { display: "block" }
				})
			}, key);
		})
	});
};

//#endregion
exports.SocialProviders = SocialProviders;
//# sourceMappingURL=SocialProviders.js.map