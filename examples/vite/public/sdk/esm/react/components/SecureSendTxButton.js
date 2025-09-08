import { usePasskeyContext } from "../context/index.js";
import TouchIcon_default from "./ProfileSettingsButton/TouchIcon2.js";
import { o } from "../node_modules/.pnpm/@lit_react@1.0.8_@types_react@19.1.12/node_modules/@lit/react/create-component.js";
import { IframeButtonHost } from "../packages/passkey/src/core/WebAuthnManager/LitComponents/IframeButtonWithTooltipConfirmer/IframeButtonHost.js";
import React, { cloneElement, isValidElement, useEffect, useMemo, useState } from "react";
import { jsx, jsxs } from "react/jsx-runtime";

//#region src/react/components/SecureSendTxButton.tsx
const TouchIdWithText = ({ buttonText = "Send Transaction", loading = false }) => /* @__PURE__ */ jsxs("span", {
	style: {
		display: "inline-flex",
		alignItems: "center"
	},
	children: [/* @__PURE__ */ jsxs("div", {
		style: {
			borderRadius: "50%",
			position: "relative",
			width: 22,
			height: 22,
			marginRight: 4
		},
		children: [/* @__PURE__ */ jsx("div", {
			style: {
				position: "absolute",
				inset: 0,
				display: "grid",
				placeItems: "center",
				transition: "opacity 160ms ease",
				opacity: loading ? 0 : 1
			},
			children: /* @__PURE__ */ jsx(TouchIcon_default, {
				width: 22,
				height: 22,
				strokeWidth: 1.6
			})
		}), /* @__PURE__ */ jsx("div", {
			style: {
				position: "absolute",
				inset: 0,
				display: "grid",
				placeItems: "center",
				transition: "opacity 160ms ease",
				opacity: loading ? 1 : 0
			},
			children: /* @__PURE__ */ jsxs("svg", {
				width: "22",
				height: "22",
				viewBox: "0 0 50 50",
				"aria-hidden": true,
				focusable: "false",
				children: [/* @__PURE__ */ jsx("circle", {
					cx: "25",
					cy: "25",
					r: "20",
					stroke: "currentColor",
					strokeWidth: "4",
					fill: "none",
					opacity: "0.25"
				}), /* @__PURE__ */ jsx("path", {
					d: "M25 5 a20 20 0 0 1 0 40",
					stroke: "currentColor",
					strokeWidth: "4",
					fill: "none",
					children: /* @__PURE__ */ jsx("animateTransform", {
						attributeName: "transform",
						type: "rotate",
						from: "0 25 25",
						to: "360 25 25",
						dur: "0.8s",
						repeatCount: "indefinite"
					})
				})]
			})
		})]
	}), buttonText]
});
/**
* React wrapper around the Lit `iframe-button` component.
* Much cleaner implementation that delegates iframe management to Lit.
*/
const SecureSendTxButton = ({ nearAccountId, txSigningRequests, options, onCancel, onSuccess, onLoadTouchIdPrompt, color, buttonStyle, buttonHoverStyle, buttonTextElement = /* @__PURE__ */ jsx(TouchIdWithText, {}), tooltipPosition = {
	width: "360px",
	height: "auto",
	position: "top-center"
}, txTreeTheme = "dark", lockTheme = false }) => {
	const { passkeyManager } = usePasskeyContext();
	const passkeyManagerContext = useMemo(() => passkeyManager.getContext(), [passkeyManager]);
	const [currentTheme, setCurrentTheme] = useState(txTreeTheme);
	const [loadingTouchIdPrompt, setLoadingTouchIdPrompt] = useState(false);
	useEffect(() => {
		if (lockTheme) return;
		const handleThemeChange = (newTheme) => {
			setCurrentTheme(newTheme);
		};
		const unsubscribe = passkeyManager.userPreferences.onThemeChange(handleThemeChange);
		handleThemeChange(passkeyManager.userPreferences.getUserTheme());
		return () => unsubscribe();
	}, [passkeyManager, lockTheme]);
	useEffect(() => {
		if (lockTheme) setCurrentTheme(txTreeTheme);
	}, [txTreeTheme, lockTheme]);
	const RawIframeButton = useMemo(() => o({
		react: React,
		tagName: "iframe-button",
		elementClass: IframeButtonHost,
		events: {}
	}), []);
	const internalTooltipPosition = useMemo(() => ({
		width: tooltipPosition.width,
		height: tooltipPosition.height,
		position: tooltipPosition.position,
		offset: "6px",
		boxPadding: "6px"
	}), [
		tooltipPosition.width,
		tooltipPosition.height,
		tooltipPosition.position
	]);
	const handleLoadTouchIdPrompt = (loading) => {
		try {
			setLoadingTouchIdPrompt(loading);
		} catch {}
		try {
			onLoadTouchIdPrompt?.(loading);
		} catch {}
	};
	const content = useMemo(() => {
		if (buttonTextElement) {
			if (isValidElement(buttonTextElement)) {
				const isDomElement = typeof buttonTextElement.type === "string";
				return isDomElement ? buttonTextElement : cloneElement(buttonTextElement, { loading: loadingTouchIdPrompt });
			}
			return buttonTextElement;
		}
		return /* @__PURE__ */ jsx(TouchIdWithText, { loading: loadingTouchIdPrompt });
	}, [buttonTextElement, loadingTouchIdPrompt]);
	return /* @__PURE__ */ jsx(RawIframeButton, {
		onMouseEnter: () => {
			try {
				passkeyManager.prefetchBlockheight();
			} catch {}
		},
		onFocus: () => {
			try {
				passkeyManager.prefetchBlockheight();
			} catch {}
		},
		passkeyManagerContext,
		nearAccountId,
		txSigningRequests,
		options: {
			hooks: options?.hooks,
			onError: options?.onError,
			onEvent: options?.onEvent,
			waitUntil: options?.waitUntil,
			executeSequentially: options?.executeSequentially
		},
		onSuccess,
		onCancel,
		onLoadTouchIdPrompt: handleLoadTouchIdPrompt,
		color,
		buttonStyle: toStyleRecord(buttonStyle),
		buttonHoverStyle: toStyleRecord(buttonHoverStyle),
		tooltipPosition: internalTooltipPosition,
		txTreeTheme: currentTheme,
		children: content
	});
};
/**
* Converts a React CSSProperties object to a Record<string, string | number> for Lit components
* @param style
* @returns
*/
const toStyleRecord = (style) => {
	if (!style) return void 0;
	const out = {};
	Object.keys(style).forEach((k) => {
		const v = style[k];
		if (v !== void 0 && v !== null) out[k] = v;
	});
	return out;
};

//#endregion
export { SecureSendTxButton, TouchIdWithText };
//# sourceMappingURL=SecureSendTxButton.js.map