const require_rolldown_runtime = require('../../_virtual/rolldown_runtime.js');
const require_ThemeProvider = require('../theme/ThemeProvider.js');
let react = require("react");
react = require_rolldown_runtime.__toESM(react);
let react_jsx_runtime = require("react/jsx-runtime");
react_jsx_runtime = require_rolldown_runtime.__toESM(react_jsx_runtime);

//#region src/react/components/PasskeyAuthMenu/AccountExistsBadge.tsx
/**
* AccountExistsBadge renders a small inline status message with tone classes.
*/
const AccountExistsBadge = ({ isUsingExistingAccount, mode, secure = true, className, id }) => {
	require_ThemeProvider.useTheme();
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
	const [visible, setVisible] = react.default.useState(false);
	react.default.useEffect(() => {
		if (!hasContent) {
			setVisible(false);
			return;
		}
		setVisible(true);
		const t = setTimeout(() => setVisible(false), 3e3);
		return () => clearTimeout(t);
	}, [hasContent, message]);
	if (!hasContent) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(react_jsx_runtime.Fragment, {});
	const toneClass = tone === "error" ? "is-error" : tone === "success" ? "is-success" : "";
	const classes = [
		"w3a-tooltip",
		toneClass,
		visible ? "is-visible" : "",
		className
	].filter(Boolean).join(" ");
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
		id,
		className: classes,
		role: "status",
		"aria-live": "polite",
		children: message
	});
};

//#endregion
exports.AccountExistsBadge = AccountExistsBadge;
//# sourceMappingURL=AccountExistsBadge.js.map