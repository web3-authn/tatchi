import { usePasskeyContext } from "../../context/index.js";
import { ThemeScope, useTheme } from "../theme/ThemeProvider.js";
import { ShowQRCode } from "../ShowQRCode2.js";
import "./PasskeyAuthMenu.js";
import { ArrowLeftIcon } from "./icons/ArrowLeft.js";
import { SocialProviders } from "./SocialProviders.js";
import { SegmentedControl } from "./SegmentedControl.js";
import { PasskeyInput } from "./PasskeyInput.js";
import { ContentSwitcher } from "./ContentSwitcher.js";
import QRCodeIcon_default from "../QRCodeIcon.js";
import { useAuthMenuMode } from "./useAuthMenuMode.js";
import { useProceedEligibility } from "./useProceedEligibility.js";
import React from "react";
import { jsx, jsxs } from "react/jsx-runtime";

//#region src/react/components/PasskeyAuthMenu/index.tsx
/**
* - Uses theme tokens from design-tokens.ts via ThemeProvider/useTheme
* - Segmented Register/Login with animated highlight
* - Arrow proceeds to a simple "Waiting for Passkey" view with spinner
*/
const PasskeyAuthMenuInner = ({ defaultMode, onLogin, onRegister, style, className, header, socialLogin, postfixText, isUsingExistingAccount, accountExists, isSecureContext, onRecoverAccount, deviceLinkingFlow }) => {
	const { tokens, isDark } = useTheme();
	let ctx = null;
	try {
		ctx = usePasskeyContext();
	} catch {
		ctx = null;
	}
	const passkeyManager = ctx?.passkeyManager || null;
	const accountExistsResolved = typeof accountExists === "boolean" ? accountExists : ctx?.accountInputState?.accountExists ?? false;
	const preferredDefaultMode = defaultMode ?? (accountExistsResolved ? "login" : "register");
	const [waiting, setWaiting] = React.useState(false);
	const [showScanDevice, setShowScanDevice] = React.useState(false);
	const [internalUserInput, setInternalUserInput] = React.useState("");
	const usingContext = !!ctx;
	const currentValue = usingContext ? ctx.accountInputState?.inputUsername || "" : internalUserInput;
	const setCurrentValue = usingContext ? ctx.setInputUsername : setInternalUserInput;
	const secure = typeof isSecureContext === "boolean" ? isSecureContext : typeof window !== "undefined" ? window.isSecureContext : true;
	const postfixTextResolved = typeof postfixText === "string" ? postfixText : ctx?.accountInputState?.displayPostfix ?? void 0;
	const isUsingExistingAccountResolved = typeof isUsingExistingAccount === "boolean" ? isUsingExistingAccount : ctx?.accountInputState?.isUsingExistingAccount ?? void 0;
	const { mode, setMode, title, onSegmentChange, onInputChange, resetToDefault } = useAuthMenuMode({
		defaultMode: preferredDefaultMode,
		accountExists: accountExistsResolved,
		passkeyManager,
		currentValue,
		setCurrentValue
	});
	const { canShowContinue, canSubmit } = useProceedEligibility({
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
	React.useEffect(() => {
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
	return /* @__PURE__ */ jsx("div", {
		className: `w3a-signup-menu-root${className ? ` ${className}` : ""}`,
		"data-mode": mode,
		"data-waiting": waiting,
		"data-scan-device": showScanDevice,
		style,
		children: /* @__PURE__ */ jsxs(ContentSwitcher, {
			waiting,
			showScanDevice,
			backButton: /* @__PURE__ */ jsx("button", {
				"aria-label": "Back",
				onClick: onResetToStart,
				className: `w3a-back-button${waiting || showScanDevice ? " is-visible" : ""}`,
				children: /* @__PURE__ */ jsx(ArrowLeftIcon, {
					size: 18,
					strokeWidth: 2.25,
					style: { display: "block" }
				})
			}),
			scanDeviceContent: /* @__PURE__ */ jsx(ShowQRCode, {
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
				/* @__PURE__ */ jsx("div", {
					className: "w3a-header",
					children: header ?? /* @__PURE__ */ jsxs("div", { children: [/* @__PURE__ */ jsx("div", {
						className: "w3a-title",
						children: title.title
					}), /* @__PURE__ */ jsx("div", {
						className: "w3a-subhead",
						children: title.subtitle
					})] })
				}),
				/* @__PURE__ */ jsx(SocialProviders, { socialLogin }),
				/* @__PURE__ */ jsx(PasskeyInput, {
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
				/* @__PURE__ */ jsx(SegmentedControl, {
					mode,
					onChange: onSegmentChange,
					activeBg: segActiveBg
				}),
				/* @__PURE__ */ jsx("div", {
					className: "w3a-seg-help-row",
					children: /* @__PURE__ */ jsxs("div", {
						className: "w3a-seg-help",
						"aria-live": "polite",
						children: [
							mode === "login" && "Sign in with your passkey this device",
							mode === "register" && "Create a new account",
							mode === "recover" && "Recover an account (iCloud/Chrome passkey sync)"
						]
					})
				}),
				/* @__PURE__ */ jsxs("div", {
					className: "w3a-scan-device-row",
					children: [/* @__PURE__ */ jsx("div", {
						className: "w3a-section-divider",
						children: /* @__PURE__ */ jsx("span", {
							className: "w3a-section-divider-text",
							children: "Already have an account?"
						})
					}), /* @__PURE__ */ jsxs("button", {
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
						children: [/* @__PURE__ */ jsx(QRCodeIcon_default, {
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
const PasskeyAuthMenu = (props) => /* @__PURE__ */ jsx(ThemeScope, { children: /* @__PURE__ */ jsx(PasskeyAuthMenuInner, { ...props }) });

//#endregion
export { PasskeyAuthMenu };
//# sourceMappingURL=index.js.map