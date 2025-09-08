import { ArrowUpIcon } from "./icons/ArrowUp.js";
import { AccountExistsBadge } from "./AccountExistsBadge.js";
import React from "react";
import { jsx, jsxs } from "react/jsx-runtime";

//#region src/react/components/PasskeyAuthMenu/PasskeyInput.tsx
const PasskeyInput = ({ value, onChange, placeholder, postfixText, isUsingExistingAccount, canProceed, onProceed, variant = "arrow", primaryLabel, mode, secure }) => {
	const inputRef = React.useRef(null);
	const measurerRef = React.useRef(null);
	const [caretIndex, setCaretIndex] = React.useState(value.length);
	const [postfixLeft, setPostfixLeft] = React.useState(0);
	const [measured, setMeasured] = React.useState(false);
	const [padAndBorderLeft, setPadAndBorderLeft] = React.useState(0);
	const statusId = React.useId();
	React.useLayoutEffect(() => {
		const input = inputRef.current;
		if (!input) return;
		const cs = window.getComputedStyle(input);
		const pl = parseFloat(cs.paddingLeft) || 0;
		const bl = parseFloat(cs.borderLeftWidth) || 0;
		setPadAndBorderLeft(pl + bl);
	}, []);
	const onEnter = (e) => {
		if (e.key === "Enter") onProceed();
	};
	const updateCaret = () => {
		const el = inputRef.current;
		if (!el) return;
		const ci = el.selectionStart ?? el.value.length;
		setCaretIndex(ci);
	};
	React.useLayoutEffect(() => {
		const measurer = measurerRef.current;
		const input = inputRef.current;
		if (!measurer || !input) return;
		const cs = window.getComputedStyle(input);
		let text = value;
		switch (cs.textTransform) {
			case "uppercase":
				text = text.toUpperCase();
				break;
			case "lowercase":
				text = text.toLowerCase();
				break;
			case "capitalize":
				text = text.replace(/\b(\p{L})/gu, (m) => m.toUpperCase());
				break;
		}
		measurer.textContent = text;
		const w = measurer.offsetWidth || 0;
		setPostfixLeft(padAndBorderLeft + w + 1);
		setMeasured(true);
	}, [value, padAndBorderLeft]);
	React.useEffect(() => {
		const measurer = measurerRef.current;
		const input = inputRef.current;
		const fonts = document?.fonts;
		if (measurer && input && fonts && fonts.ready) fonts.ready.then(() => {
			setPadAndBorderLeft((x) => x);
		}).catch(() => {});
	}, []);
	return /* @__PURE__ */ jsxs("div", {
		className: "w3a-passkey-row",
		children: [/* @__PURE__ */ jsx("div", {
			className: `w3a-input-pill${canProceed ? " is-enabled" : ""}`,
			children: /* @__PURE__ */ jsxs("div", {
				className: "w3a-input-wrap",
				children: [
					/* @__PURE__ */ jsx("span", {
						ref: measurerRef,
						"aria-hidden": true,
						className: "w3a-measurer"
					}),
					/* @__PURE__ */ jsx("input", {
						ref: inputRef,
						type: "text",
						value,
						onChange: (e) => {
							onChange(e.target.value);
						},
						onKeyDown: onEnter,
						onKeyUp: updateCaret,
						onClick: updateCaret,
						onSelect: updateCaret,
						placeholder,
						className: "w3a-input",
						"aria-describedby": statusId
					}),
					postfixText && value.length > 0 && /* @__PURE__ */ jsx("span", {
						title: isUsingExistingAccount ? "Using existing account domain" : "New account domain",
						className: `w3a-postfix${isUsingExistingAccount ? " is-existing" : ""}`,
						style: {
							left: `${postfixLeft}px`,
							visibility: measured ? "visible" : "hidden"
						},
						children: postfixText
					}),
					mode && typeof secure === "boolean" && /* @__PURE__ */ jsx(AccountExistsBadge, {
						id: statusId,
						isUsingExistingAccount,
						mode,
						secure
					})
				]
			})
		}), /* @__PURE__ */ jsx(ArrowButton, {
			onClick: onProceed,
			disabled: !canProceed
		})]
	});
};
const ArrowButton = ({ onClick, disabled }) => {
	return /* @__PURE__ */ jsx("button", {
		"aria-label": "Continue",
		onClick,
		className: `w3a-arrow-btn${!disabled ? " is-enabled" : ""}`,
		disabled,
		children: !disabled && /* @__PURE__ */ jsx(ArrowUpIcon, {
			size: 24,
			strokeWidth: 2.5,
			color: "#ffffff",
			style: {
				display: "block",
				transition: "transform 200ms, width 200ms, height 200ms"
			}
		})
	});
};

//#endregion
export { PasskeyInput };
//# sourceMappingURL=PasskeyInput.js.map