import { useTheme } from "../theme/ThemeProvider.js";
import React from "react";
import { Fragment, jsx } from "react/jsx-runtime";

//#region src/react/components/PasskeyAuthMenu/AccountExistsBadge.tsx
/**
* AccountExistsBadge renders a small inline status message with tone classes.
*/
const AccountExistsBadge = ({ isUsingExistingAccount, mode, secure = true, className, id }) => {
	useTheme();
	const getStatus = () => {
		if (mode === "register") {
			if (!secure) return {
				message: "HTTPS required",
				tone: "error"
			};
			if (isUsingExistingAccount) return {
				message: "name taken",
				tone: "error"
			};
			return {
				message: "",
				tone: "neutral"
			};
		}
		if (mode === "login" || mode === "recover") {
			if (isUsingExistingAccount) return {
				message: "",
				tone: "success"
			};
			return {
				message: "Account not found",
				tone: "error"
			};
		}
		return {
			message: "",
			tone: "neutral"
		};
	};
	const { message, tone } = getStatus();
	const hasContent = message && message.trim().length > 0;
	const [visible, setVisible] = React.useState(false);
	React.useEffect(() => {
		if (!hasContent) {
			setVisible(false);
			return;
		}
		setVisible(true);
		const t = setTimeout(() => setVisible(false), 3e3);
		return () => clearTimeout(t);
	}, [hasContent, message]);
	if (!hasContent) return /* @__PURE__ */ jsx(Fragment, {});
	const toneClass = tone === "error" ? "is-error" : tone === "success" ? "is-success" : "";
	const classes = [
		"w3a-tooltip",
		toneClass,
		visible ? "is-visible" : "",
		className
	].filter(Boolean).join(" ");
	return /* @__PURE__ */ jsx("div", {
		id,
		className: classes,
		role: "status",
		"aria-live": "polite",
		children: message
	});
};

//#endregion
export { AccountExistsBadge };
//# sourceMappingURL=AccountExistsBadge.js.map