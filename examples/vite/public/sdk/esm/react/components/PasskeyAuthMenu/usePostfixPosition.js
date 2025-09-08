import { useCallback, useLayoutEffect, useRef } from "react";

//#region src/react/components/PasskeyAuthMenu/usePostfixPosition.ts
/**
* Hook to handle dynamic positioning of a postfix element relative to input text
*
* This hook calculates the width of the input text and positions the postfix
* element immediately after the text, creating an inline domain display effect.
*
* This is a self-contained variant that manages its own refs via callback refs.
* It's more robust when multiple inputs exist on the page, since each hook
* instance maintains its own element references, measurer, and observers.
*
* ⚠️  TIMING CRITICAL: The useLayoutEffect MUST depend on [inputRef.current, postfixRef.current]
*     because refs are null on first mount and only become available after DOM elements
*     are created. Without these dependencies, the effect runs once with null refs and
*     exits early, causing postfix to never show on first page load.
*/
function usePostfixPosition({ inputValue, gap = 1, paddingBuffer = 4 }) {
	const inputRef = useRef(null);
	const postfixRef = useRef(null);
	const prevValueRef = useRef("");
	const canvasRef = useRef(null);
	const ctxRef = useRef(null);
	const resizeObserverRef = useRef(null);
	const rafRef = useRef(null);
	const rafRef2 = useRef(null);
	const schedule = (fn) => {
		if (rafRef.current) cancelAnimationFrame(rafRef.current);
		if (rafRef2.current) cancelAnimationFrame(rafRef2.current);
		rafRef.current = requestAnimationFrame(() => {
			rafRef2.current = requestAnimationFrame(fn);
		});
	};
	const measureAndPosition = () => {
		const input = inputRef.current;
		const postfix = postfixRef.current;
		if (!inputValue || inputValue.length === 0) {
			if (input) input.style.paddingRight = "";
			if (postfix) postfix.style.visibility = "hidden";
			return;
		}
		if (!input || !postfix) {
			if (input) input.style.paddingRight = "";
			return;
		}
		const cs = window.getComputedStyle(input);
		let ctx = ctxRef.current;
		if (!ctx) {
			canvasRef.current = document.createElement("canvas");
			ctx = canvasRef.current.getContext("2d");
			ctxRef.current = ctx;
		}
		let textWidth = 0;
		if (ctx) {
			const fontString = cs.font && cs.font !== "" ? cs.font : `${cs.fontStyle || ""} ${cs.fontVariant || ""} ${cs.fontWeight || ""} ${cs.fontSize || "16px"} / ${cs.lineHeight || "normal"} ${cs.fontFamily || "sans-serif"}`;
			ctx.font = fontString;
			const caret = input.selectionStart ?? inputValue.length;
			let toMeasure = inputValue.slice(0, caret);
			switch (cs.textTransform) {
				case "uppercase":
					toMeasure = inputValue.toUpperCase();
					break;
				case "lowercase":
					toMeasure = inputValue.toLowerCase();
					break;
				case "capitalize":
					toMeasure = inputValue.replace(/\b(\p{L})/gu, (m) => m.toUpperCase());
					break;
			}
			textWidth = ctx.measureText(toMeasure).width;
			if (cs.letterSpacing && cs.letterSpacing !== "normal") {
				const ls = parseFloat(cs.letterSpacing) || 0;
				if (ls !== 0 && toMeasure.length > 1) textWidth += ls * (toMeasure.length - 1);
			}
		}
		const inputPaddingLeft = parseFloat(cs.paddingLeft) || 0;
		const inputBorderLeft = parseFloat(cs.borderLeftWidth) || 0;
		const scrollLeft = input.scrollLeft || 0;
		const calculatedLeft = inputPaddingLeft + inputBorderLeft + Math.max(0, textWidth - scrollLeft) + gap;
		postfix.style.left = `${calculatedLeft}px`;
		postfix.style.visibility = "visible";
	};
	useLayoutEffect(() => {
		const input = inputRef.current;
		const postfix = postfixRef.current;
		if (!input || !postfix) return;
		const ro = new ResizeObserver(() => schedule(measureAndPosition));
		resizeObserverRef.current = ro;
		ro.observe(input);
		ro.observe(postfix);
		schedule(measureAndPosition);
		if (document && document.fonts && document.fonts.ready) document.fonts.ready.then(() => schedule(measureAndPosition)).catch(() => {});
		const onResize = () => schedule(measureAndPosition);
		const onScroll = () => schedule(measureAndPosition);
		const onSelect = () => schedule(measureAndPosition);
		input.addEventListener("scroll", onScroll);
		input.addEventListener("select", onSelect);
		window.addEventListener("resize", onResize);
		return () => {
			window.removeEventListener("resize", onResize);
			try {
				input.removeEventListener("scroll", onScroll);
			} catch {}
			try {
				input.removeEventListener("select", onSelect);
			} catch {}
			if (resizeObserverRef.current) {
				resizeObserverRef.current.disconnect();
				resizeObserverRef.current = null;
			}
			if (inputRef.current) inputRef.current.style.paddingRight = "";
			if (rafRef.current) cancelAnimationFrame(rafRef.current);
			if (rafRef2.current) cancelAnimationFrame(rafRef2.current);
			ctxRef.current = null;
			canvasRef.current = null;
		};
	}, [inputRef.current, postfixRef.current]);
	useLayoutEffect(() => {
		const prev = prevValueRef.current || "";
		const now = inputValue || "";
		if (prev.length === 0 && now.length === 1) try {
			measureAndPosition();
		} catch {}
		schedule(measureAndPosition);
		prevValueRef.current = now;
	}, [inputValue]);
	const bindInput = useCallback((el) => {
		inputRef.current = el;
	}, []);
	const bindPostfix = useCallback((el) => {
		postfixRef.current = el;
	}, []);
	return {
		bindInput,
		bindPostfix
	};
}

//#endregion
export { usePostfixPosition };
//# sourceMappingURL=usePostfixPosition.js.map