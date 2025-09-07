import { useEffect, useLayoutEffect } from 'react';
import type { RefObject } from 'react';

export interface UsePostfixPositionOptions {
  /** The input element reference */
  inputRef: RefObject<HTMLInputElement | null>;
  /** The postfix element reference */
  postfixRef: RefObject<HTMLSpanElement | null>;
  /** The current input text value */
  inputValue: string;
}

/**
 * Hook to handle dynamic positioning of a postfix element relative to input text
 *
 * This hook calculates the width of the input text and positions the postfix
 * element immediately after the text, creating an inline domain display effect.
 */
export function usePostfixPosition({
  inputRef,
  postfixRef,
  inputValue
}: UsePostfixPositionOptions): void {
  useLayoutEffect(() => {
    if (!inputRef.current || !postfixRef.current) return;

    const input = inputRef.current;
    const postfix = postfixRef.current;

    const measureAndPosition = () => {
      if (!input || !postfix) return;
      if (!inputValue || inputValue.length === 0) {
        postfix.style.visibility = 'hidden';
        // Reset padding-right when postfix hidden
        (input as HTMLInputElement).style.paddingRight = '';
        return;
      }

      // Ensure visible during positioning so it renders on first mount
      postfix.style.visibility = 'visible';

      // Use a canvas with the exact computed font shorthand when available
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (!context) return;

      const cs = window.getComputedStyle(input);
      // Prefer full computed font shorthand when available for best accuracy
      const font = cs.font && cs.font !== 'normal normal normal medium / normal serif'
        ? cs.font
        : `${cs.fontStyle} ${cs.fontVariant} ${cs.fontWeight} ${cs.fontSize} / ${cs.lineHeight} ${cs.fontFamily}`;
      context.font = font;

      // Note: canvas measureText does not account for letter-spacing; add crude adjustment if present
      const letterSpacing = parseFloat(cs.letterSpacing || '0') || 0;
      const textMetrics = context.measureText(inputValue);
      const baseWidth = textMetrics.width;
      const extra = letterSpacing > 0 ? letterSpacing * Math.max(0, inputValue.length - 1) : 0;
      const textWidth = baseWidth + extra;

      const inputPaddingLeft = parseFloat(cs.paddingLeft) || 0;
      const inputBorderLeft = parseFloat(cs.borderLeftWidth) || 0;

      // Position postfix right after the text with a small gap
      const gap = 11; // px (fine-tuned +5px)
      postfix.style.left = `${inputPaddingLeft + inputBorderLeft + textWidth + gap}px`;

      // Prevent overlap: add right padding to the input so caret/text don't run under postfix
      // Use postfix rendered width + extra gap
      const postfixWidth = postfix.offsetWidth || 0;
      (input as HTMLInputElement).style.paddingRight = `${postfixWidth + gap + 4}px`;

      // Keep postfix visible after positioning
      postfix.style.visibility = 'visible';
    };

    // Initial measure and a couple of early retries for DOM readiness
    measureAndPosition();
    let attempts = 0;
    const tryUntilReady = () => {
      attempts++;
      if (!postfixRef.current || !inputRef.current) {
        if (attempts < 5) requestAnimationFrame(tryUntilReady);
        return;
      }
      measureAndPosition();
    };
    requestAnimationFrame(tryUntilReady);

    // Re-measure on next frame to catch late layout
    const raf1 = requestAnimationFrame(measureAndPosition);

    // Also schedule a microtask/timeout for cases where layout shifts after mount
    const t1 = setTimeout(measureAndPosition, 0);

    // Re-measure after window load (fonts/CSS might finish late)
    const onWindowLoad = () => measureAndPosition();
    window.addEventListener('load', onWindowLoad);

    // Re-measure after fonts load (if Font Loading API available)
    // @ts-ignore - fonts may not exist in some environments
    if (document && (document as any).fonts && (document as any).fonts.ready) {
      // @ts-ignore
      (document as any).fonts.ready.then(() => measureAndPosition()).catch(() => {});
    }

    const onResize = () => measureAndPosition();
    window.addEventListener('resize', onResize);

    // Observe input size/style changes
    let ro: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => measureAndPosition());
      ro.observe(input);
    }

    // Observe DOM child changes around the input to catch postfix mount timing
    let mo: MutationObserver | undefined;
    if (typeof MutationObserver !== 'undefined' && input.parentElement) {
      mo = new MutationObserver(() => measureAndPosition());
      mo.observe(input.parentElement, { childList: true, subtree: true });
    }
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('load', onWindowLoad);
      cancelAnimationFrame(raf1);
      clearTimeout(t1);
      if (ro) ro.disconnect();
      if (mo) mo.disconnect();
    };
  }, [inputRef, postfixRef, inputValue]);
}
