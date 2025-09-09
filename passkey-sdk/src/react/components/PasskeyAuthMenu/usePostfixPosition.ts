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
  const prevValueRef = useRef<string>('');
  // Off-DOM canvas for text measurement (avoids inserting hidden spans)
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const rafRef = useRef<number | null>(null);
  const rafRef2 = useRef<number | null>(null);

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

    // Always clear padding when value is empty or elements are missing
    if (!inputValue || inputValue.length === 0) {
      if (input) input.style.paddingRight = '';
      if (postfix) postfix.style.visibility = 'hidden';
      return;
    }

    // If we cannot measure, ensure padding is not left behind
    if (!input || !postfix) {
      if (input) input.style.paddingRight = '';
      return;
    }

    const cs = window.getComputedStyle(input);
    // Prepare canvas context with computed font
    let ctx = ctxRef.current;
    if (!ctx) {
      canvasRef.current = document.createElement('canvas');
      ctx = canvasRef.current.getContext('2d');
      ctxRef.current = ctx;
    }
    let textWidth = 0;
    if (ctx) {
      // Fallback if cs.font is empty: build from parts
      const fontString = cs.font && cs.font !== ''
        ? cs.font
        : `${cs.fontStyle || ''} ${cs.fontVariant || ''} ${cs.fontWeight || ''} ${cs.fontSize || '16px'} / ${cs.lineHeight || 'normal'} ${cs.fontFamily || 'sans-serif'}`;
      ctx.font = fontString;
      // Measure only up to caret to avoid dependence on timing of scrollLeft updates
      const caret = (input as HTMLInputElement).selectionStart ?? inputValue.length;
      // Respect text-transform for width calculation
      let toMeasure = inputValue.slice(0, caret);
      switch (cs.textTransform) {
        case 'uppercase':
          toMeasure = inputValue.toUpperCase();
          break;
        case 'lowercase':
          toMeasure = inputValue.toLowerCase();
          break;
        case 'capitalize':
          toMeasure = inputValue.replace(/\b(\p{L})/gu, (m) => m.toUpperCase());
          break;
      }
      textWidth = ctx.measureText(toMeasure).width;
      // Approximate letter-spacing impact if set
      if (cs.letterSpacing && cs.letterSpacing !== 'normal') {
        const ls = parseFloat(cs.letterSpacing) || 0;
        if (ls !== 0 && toMeasure.length > 1) {
          textWidth += ls * (toMeasure.length - 1);
        }
      }
    }

    const inputPaddingLeft = parseFloat(cs.paddingLeft) || 0;
    const inputBorderLeft = parseFloat(cs.borderLeftWidth) || 0;
    // Account for horizontal scroll so postfix stays attached to visible text end
    const scrollLeft = (input as any).scrollLeft || 0;
    const calculatedLeft = inputPaddingLeft + inputBorderLeft + Math.max(0, textWidth - scrollLeft) + gap;

    postfix.style.left = `${calculatedLeft}px`;
    postfix.style.visibility = 'visible';

    // Do not modify input padding-right; avoid squishing the visible text width
    // Overlap is prevented by positioning the postfix after the visible text end
  };

  useLayoutEffect(() => {
    const input = inputRef.current;
    const postfix = postfixRef.current;
    if (!input || !postfix) {
      return;
    }

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
    const onScroll = () => schedule(measureAndPosition);
    const onSelect = () => schedule(measureAndPosition);
    input.addEventListener('scroll', onScroll);
    input.addEventListener('select', onSelect);
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      try { input.removeEventListener('scroll', onScroll); } catch {}
      try { input.removeEventListener('select', onSelect); } catch {}
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
        resizeObserverRef.current = null;
      }
      if (inputRef.current) {
        inputRef.current.style.paddingRight = '';
      }
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (rafRef2.current) cancelAnimationFrame(rafRef2.current);
      ctxRef.current = null;
      canvasRef.current = null;
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
    const prev = prevValueRef.current || '';
    const now = inputValue || '';
    // Only do a synchronous measure for the first character to eliminate
    // the empty → 1 char flash. For all other edits (including deletions),
    // rely on rAF + scroll listener to avoid measuring before scrollLeft
    // has settled, which causes a second jump.
    if (prev.length === 0 && now.length === 1) {
      try { measureAndPosition(); } catch {}
    }
    schedule(measureAndPosition);
    prevValueRef.current = now;
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
