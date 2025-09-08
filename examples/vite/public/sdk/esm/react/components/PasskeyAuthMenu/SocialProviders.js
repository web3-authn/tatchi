import { AppleIcon } from "./icons/Apple.js";
import { AtSignIcon } from "./icons/AtSign.js";
import { ChromeIcon } from "./icons/Chrome.js";
import React from "react";
import { jsx } from "react/jsx-runtime";

//#region src/react/components/PasskeyAuthMenu/SocialProviders.tsx
const iconByKey = {
	google: {
		Icon: ChromeIcon,
		label: "Google"
	},
	x: {
		Icon: AtSignIcon,
		label: "X"
	},
	apple: {
		Icon: AppleIcon,
		label: "Apple"
	}
};
const SocialProviders = ({ socialLogin }) => {
	const entries = Object.entries(socialLogin || {});
	const enabled = entries.filter(([, fn]) => typeof fn === "function");
	if (!enabled.length) return null;
	return /* @__PURE__ */ jsx("div", {
		className: "w3a-social-row",
		children: enabled.map(([key, fn]) => {
			const { Icon, label } = iconByKey[key];
			return /* @__PURE__ */ jsx("button", {
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
				children: /* @__PURE__ */ jsx(Icon, {
					size: 22,
					style: { display: "block" }
				})
			}, key);
		})
	});
};

//#endregion
export { SocialProviders };
//# sourceMappingURL=SocialProviders.js.map