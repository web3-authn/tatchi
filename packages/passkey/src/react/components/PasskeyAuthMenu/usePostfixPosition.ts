import { useCallback, useLayoutEffect, useRef } from 'react';

export interface UsePostfixPositionOptions {
  /** The current input text value */
  inputValue: string;
  /** Gap in pixels between the typed text and the postfix */
  gap?: number;
  /** Extra padding added to input's right side beyond postfix width */
  paddingBuffer?: number;
}

export interface UsePostfixPositionReturn {
  /** Callback ref for the input element */
  bindInput: (el: HTMLInputElement | null) => void;
  /** Callback ref for the postfix span element */
  bindPostfix: (el: HTMLSpanElement | null) => void;
}

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
export function usePostfixPosition({ inputValue, gap = 1, paddingBuffer = 4 }: UsePostfixPositionOptions): UsePostfixPositionReturn {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const postfixRef = useRef<HTMLSpanElement | null>(null);
  const measurerRef = useRef<HTMLSpanElement | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const rafRef = useRef<number | null>(null);
  const rafRef2 = useRef<number | null>(null);

  const cleanupMeasurer = () => {
    const measurer = measurerRef.current;
    if (measurer && measurer.parentElement) {
      measurer.parentElement.removeChild(measurer);
    }
    measurerRef.current = null;
  };

  const schedule = (fn: () => void) => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (rafRef2.current) cancelAnimationFrame(rafRef2.current);
    rafRef.current = requestAnimationFrame(() => {
      rafRef2.current = requestAnimationFrame(fn);
    });
  };

  const measureAndPosition = () => {
    const input = inputRef.current;
    const postfix = postfixRef.current;
    const measurer = measurerRef.current;

    // Always clear padding when value is empty or elements are missing
    if (!inputValue || inputValue.length === 0) {
      if (input) input.style.paddingRight = '';
      if (postfix) postfix.style.visibility = 'hidden';
      return;
    }

    // If we cannot measure, ensure padding is not left behind
    if (!input || !postfix || !measurer) {
      if (input) input.style.paddingRight = '';
      return;
    }

    const cs = window.getComputedStyle(input);
    measurer.style.font = cs.font;
    measurer.style.letterSpacing = cs.letterSpacing;
    measurer.style.textTransform = cs.textTransform;
    measurer.textContent = inputValue;
    const textWidth = measurer.offsetWidth;

    const inputPaddingLeft = parseFloat(cs.paddingLeft) || 0;
    const inputBorderLeft = parseFloat(cs.borderLeftWidth) || 0;
    const calculatedLeft = inputPaddingLeft + inputBorderLeft + textWidth + gap;

    postfix.style.left = `${calculatedLeft}px`;
    postfix.style.visibility = 'visible';

    const postfixWidth = postfix.offsetWidth || 0;
    const paddingRight = `${postfixWidth + gap + paddingBuffer}px`;
    input.style.paddingRight = paddingRight;
  };

  useLayoutEffect(() => {
    const input = inputRef.current;
    const postfix = postfixRef.current;
    if (!input || !postfix) {
      return;
    }

    // Prepare measurer colocated with input/postfix for consistent font metrics
    const container = postfix.parentElement || input.parentElement || document.body;
    const measurer = document.createElement('span');
    measurer.style.position = 'absolute';
    measurer.style.visibility = 'hidden';
    measurer.style.whiteSpace = 'pre';
    measurer.style.left = '0';
    measurer.style.top = '0';
    container.appendChild(measurer);
    measurerRef.current = measurer;

    const ro = new ResizeObserver(() => schedule(measureAndPosition));
    resizeObserverRef.current = ro;
    ro.observe(input);
    ro.observe(postfix);

    // Initial and font-ready scheduling
    schedule(measureAndPosition);
    // @ts-ignore fonts API may not exist
    if (document && (document as any).fonts && (document as any).fonts.ready) {
      // @ts-ignore
      (document as any).fonts.ready.then(() => schedule(measureAndPosition)).catch(() => {});
    }

    const onResize = () => schedule(measureAndPosition);
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
        resizeObserverRef.current = null;
      }
      if (inputRef.current) {
        inputRef.current.style.paddingRight = '';
      }
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (rafRef2.current) cancelAnimationFrame(rafRef2.current);
      cleanupMeasurer();
    };
  }, [
    // CRITICAL: These dependencies ensure the effect runs when refs become available
    // Without these, the effect only runs once on mount when refs are still null
    // This was the root cause of postfix not showing on first page load
    inputRef.current,
    postfixRef.current
  ]);

  // This effect handles repositioning when the input value changes
  // It can use inputValue directly since the main effect already set up the measurer
  useLayoutEffect(() => {
    schedule(measureAndPosition);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputValue]);

  const bindInput = useCallback((el: HTMLInputElement | null) => {
    inputRef.current = el;
  }, []);

  const bindPostfix = useCallback((el: HTMLSpanElement | null) => {
    postfixRef.current = el;
  }, []);

  return { bindInput, bindPostfix };
}
