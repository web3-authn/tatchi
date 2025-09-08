const require_rolldown_runtime = require('../../_virtual/rolldown_runtime.js');
const require_index = require('../../context/index.js');
const require_ThemeProvider = require('../theme/ThemeProvider.js');
const require_ShowQRCode = require('../ShowQRCode2.js');
require('./PasskeyAuthMenu.js');
const require_ArrowLeft = require('./icons/ArrowLeft.js');
const require_SocialProviders = require('./SocialProviders.js');
const require_SegmentedControl = require('./SegmentedControl.js');
const require_PasskeyInput = require('./PasskeyInput.js');
const require_ContentSwitcher = require('./ContentSwitcher.js');
const require_QRCodeIcon = require('../QRCodeIcon.js');
const require_useAuthMenuMode = require('./useAuthMenuMode.js');
const require_useProceedEligibility = require('./useProceedEligibility.js');
let react = require("react");
react = require_rolldown_runtime.__toESM(react);
let react_jsx_runtime = require("react/jsx-runtime");
react_jsx_runtime = require_rolldown_runtime.__toESM(react_jsx_runtime);

//#region src/react/components/PasskeyAuthMenu/index.tsx
/**
* - Uses theme tokens from design-tokens.ts via ThemeProvider/useTheme
* - Segmented Register/Login with animated highlight
* - Arrow proceeds to a simple "Waiting for Passkey" view with spinner
*/
const PasskeyAuthMenuInner = ({ defaultMode, onLogin, onRegister, style, className, header, socialLogin, postfixText, isUsingExistingAccount, accountExists, isSecureContext, onRecoverAccount, deviceLinkingFlow }) => {
	const { tokens, isDark } = require_ThemeProvider.useTheme();
	let ctx = null;
	try {
		ctx = require_index.usePasskeyContext();
	} catch {
		ctx = null;
	}
	const passkeyManager = ctx?.passkeyManager || null;
	const accountExistsResolved = typeof accountExists === "boolean" ? accountExists : ctx?.accountInputState?.accountExists ?? false;
	const preferredDefaultMode = defaultMode ?? (accountExistsResolved ? "login" : "register");
	const [waiting, setWaiting] = react.default.useState(false);
	const [showScanDevice, setShowScanDevice] = react.default.useState(false);
	const [internalUserInput, setInternalUserInput] = react.default.useState("");
	const usingContext = !!ctx;
	const currentValue = usingContext ? ctx.accountInputState?.inputUsername || "" : internalUserInput;
	const setCurrentValue = usingContext ? ctx.setInputUsername : setInternalUserInput;
	const secure = typeof isSecureContext === "boolean" ? isSecureContext : typeof window !== "undefined" ? window.isSecureContext : true;
	const postfixTextResolved = typeof postfixText === "string" ? postfixText : ctx?.accountInputState?.displayPostfix ?? void 0;
	const isUsingExistingAccountResolved = typeof isUsingExistingAccount === "boolean" ? isUsingExistingAccount : ctx?.accountInputState?.isUsingExistingAccount ?? void 0;
	const { mode, setMode, title, onSegmentChange, onInputChange, resetToDefault } = require_useAuthMenuMode.useAuthMenuMode({
		defaultMode: preferredDefaultMode,
		accountExists: accountExistsResolved,
		passkeyManager,
		currentValue,
		setCurrentValue
	});
	const { canShowContinue, canSubmit } = require_useProceedEligibility.useProceedEligibility({
		mode,
		currentValue,
		accountExists: accountExistsResolved,
		secure
	});
	const onArrowClick = async () => {
		if (!canSubmit) return;
		setWaiting(true);
		try {
			if (mode === "recover") await onRecoverAccount?.();
			else if (mode === "login") await onLogin?.();
			else await onRegister?.();
		} catch (error) {
			onResetToStart();
		}
	};
	react.default.useEffect(() => {
		const handleKeyDown = (event) => {
			if (event.key === "Enter" && !waiting && canShowContinue) {
				event.preventDefault();
				onArrowClick();
			}
		};
		document.addEventListener("keydown", handleKeyDown);
		return () => {
			document.removeEventListener("keydown", handleKeyDown);
		};
	}, [
		waiting,
		canShowContinue,
		onArrowClick
	]);
	const onResetToStart = () => {
		setWaiting(false);
		setShowScanDevice(false);
		resetToDefault();
		setCurrentValue("");
	};
	const segActiveBg = isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.08)";
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
		className: `w3a-signup-menu-root${className ? ` ${className}` : ""}`,
		"data-mode": mode,
		"data-waiting": waiting,
		"data-scan-device": showScanDevice,
		style,
		children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(require_ContentSwitcher.ContentSwitcher, {
			waiting,
			showScanDevice,
			backButton: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				"aria-label": "Back",
				onClick: onResetToStart,
				className: `w3a-back-button${waiting || showScanDevice ? " is-visible" : ""}`,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(require_ArrowLeft.ArrowLeftIcon, {
					size: 18,
					strokeWidth: 2.25,
					style: { display: "block" }
				})
			}),
			scanDeviceContent: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(require_ShowQRCode.ShowQRCode, {
				isOpen: showScanDevice,
				onClose: () => setShowScanDevice(false),
				onEvent: (event) => {
					console.log("ShowQRCode event:", event);
				},
				onError: (error) => {
					console.error("ShowQRCode error:", error);
				},
				deviceLinkingFlow
			}),
			children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "w3a-header",
					children: header ?? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "w3a-title",
						children: title.title
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "w3a-subhead",
						children: title.subtitle
					})] })
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)(require_SocialProviders.SocialProviders, { socialLogin }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)(require_PasskeyInput.PasskeyInput, {
					value: currentValue,
					onChange: onInputChange,
					placeholder: "Enter your username",
					postfixText: postfixTextResolved,
					isUsingExistingAccount: isUsingExistingAccountResolved,
					canProceed: canShowContinue,
					onProceed: onArrowClick,
					variant: "both",
					primaryLabel: mode === "login" ? "Login" : mode === "recover" ? "Recover account" : "Register",
					mode,
					secure
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)(require_SegmentedControl.SegmentedControl, {
					mode,
					onChange: onSegmentChange,
					activeBg: segActiveBg
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "w3a-seg-help-row",
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "w3a-seg-help",
						"aria-live": "polite",
						children: [
							mode === "login" && "Sign in with your passkey this device",
							mode === "register" && "Create a new account",
							mode === "recover" && "Recover an account (iCloud/Chrome passkey sync)"
						]
					})
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "w3a-scan-device-row",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "w3a-section-divider",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "w3a-section-divider-text",
							children: "Already have an account?"
						})
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
						onClick: () => setShowScanDevice(true),
						className: "w3a-link-device-btn",
						onMouseEnter: (e) => {
							e.currentTarget.style.background = tokens.colors.colorSurface2;
							e.currentTarget.style.boxShadow = tokens.shadows.md;
						},
						onMouseLeave: (e) => {
							e.currentTarget.style.background = tokens.colors.colorSurface;
							e.currentTarget.style.boxShadow = tokens.shadows.sm;
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(require_QRCodeIcon.default, {
							width: 18,
							height: 18,
							strokeWidth: 2
						}), "Scan and Link Device"]
					})]
				})
			]
		})
	});
};
const PasskeyAuthMenu = (props) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(require_ThemeProvider.ThemeScope, { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PasskeyAuthMenuInner, { ...props }) });

//#endregion
exports.PasskeyAuthMenu = PasskeyAuthMenu;
//# sourceMappingURL=index.js.map