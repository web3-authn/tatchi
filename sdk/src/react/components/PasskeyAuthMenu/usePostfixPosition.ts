import { useCallback, useLayoutEffect, useRef } from 'react';

export interface UsePostfixPositionOptions {
  /** The current input text value */
  inputValue: string;
  /** Gap in pixels between the typed text and the postfix */
  gap?: number;
}

export interface UsePostfixPositionReturn {
  /** Callback ref for the input element */
  bindInput: (el: HTMLInputElement | null) => void;
  /** Callback ref for the postfix span element */
  bindPostfix: (el: HTMLSpanElement | null) => void;
}

/**
 * usePostfixPosition
 * Aligns a postfix element immediately after the full input value
 *
 * Implementation notes:
 * - Uses a hidden on-DOM measurer span to compute text width with browser layout,
 *   matching fonts, letter-spacing, and text-transform.
 * - Respects (prefers-reduced-motion) only indirectly via CSS; this hook only sets left/visibility.
 * - Avoids caret/scroll tracking; this is intentional for a stable end-of-value anchor.
 */
export function usePostfixPosition({ inputValue, gap = 0 }: UsePostfixPositionOptions): UsePostfixPositionReturn {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const postfixRef = useRef<HTMLSpanElement | null>(null);
  const measurerRef = useRef<HTMLSpanElement | null>(null);
  const padAndBorderLeftRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);
  const rafRef2 = useRef<number | null>(null);
  const latestValueRef = useRef<string>(inputValue);

  const schedule = useCallback((fn: () => void) => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (rafRef2.current) cancelAnimationFrame(rafRef2.current);
    rafRef.current = requestAnimationFrame(() => {
      rafRef2.current = requestAnimationFrame(fn);
    });
  }, []);

  const measureAndPosition = useCallback(() => {
    const input = inputRef.current;
    const postfix = postfixRef.current;
    if (!input || !postfix) return;

    const valueToMeasure = latestValueRef.current ?? '';

    // Hide when empty
    if (!valueToMeasure || valueToMeasure.length === 0) {
      postfix.style.visibility = 'hidden';
      postfix.style.left = '0px';
      return;
    }

    let measurer = measurerRef.current;
    if (!measurer || !measurer.isConnected) {
      if (typeof document === 'undefined') return;
      measurer = document.createElement('span');
      measurer.className = 'w3a-measurer';
      measurer.style.position = 'absolute';
      measurer.style.visibility = 'hidden';
      measurer.style.whiteSpace = 'pre';
      measurer.style.left = '-9999px';
      measurer.style.top = '0';
      measurerRef.current = measurer;
    }

    // Ensure measurer is attached next to the input so inherited styles match
    const parent = (input.parentElement ?? document.body);
    if (measurer.parentElement !== parent) {
      try { parent.appendChild(measurer); } catch {}
    }

    if (!measurer) return;

    const cs = window.getComputedStyle(input);

    // Read static padding/border (left side) each time in case styles change
    const pl = parseFloat(cs.paddingLeft) || 0;
    const bl = parseFloat(cs.borderLeftWidth) || 0;
    padAndBorderLeftRef.current = pl + bl;

    // Mirror input text styles on measurer for accuracy
    const fontString = cs.font && cs.font !== ''
      ? cs.font
      : `${cs.fontStyle || ''} ${cs.fontVariant || ''} ${cs.fontWeight || ''} ${cs.fontSize || '16px'} / ${cs.lineHeight || 'normal'} ${cs.fontFamily || 'sans-serif'}`;
    measurer.style.font = fontString;
    measurer.style.letterSpacing = cs.letterSpacing || '';
    measurer.style.textTransform = cs.textTransform || '';

    // Apply textTransform to content for faithful width measurement
    let text = valueToMeasure;
    switch (cs.textTransform) {
      case 'uppercase':
        text = text.toUpperCase();
        break;
      case 'lowercase':
        text = text.toLowerCase();
        break;
      case 'capitalize':
        text = text.replace(/\b(\p{L})/gu, (m) => m.toUpperCase());
        break;
    }
    measurer.textContent = text;

    const w = measurer.offsetWidth || 0;
    const left = padAndBorderLeftRef.current + w + 1 + gap; // +1 to avoid overlap
    postfix.style.left = `${left}px`;
    postfix.style.visibility = 'visible';
  }, [gap]);

  useLayoutEffect(() => {
    const input = inputRef.current;
    const postfix = postfixRef.current;
    if (!input || !postfix) return;

    // Initial measure
    measureAndPosition();

    // Observe input size changes (layout shifts)
    const ro = new ResizeObserver(() => schedule(measureAndPosition));
    ro.observe(input);
    ro.observe(postfix);

    // Re-measure after fonts are ready
    try {
      // @ts-ignore optional fonts API
      const fonts = (document as any)?.fonts;
      if (fonts?.ready) {
        fonts.ready.then(() => schedule(measureAndPosition)).catch(() => {});
      }
    } catch {}

    // Window resize
    const onResize = () => schedule(measureAndPosition);
    window.addEventListener('resize', onResize);

    return () => {
      try { window.removeEventListener('resize', onResize); } catch {}
      try { ro.disconnect(); } catch {}
      // Remove measurer from DOM
      try {
        const m = measurerRef.current;
        if (m && m.parentElement) m.parentElement.removeChild(m);
      } catch {}
      measurerRef.current = null;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (rafRef2.current) cancelAnimationFrame(rafRef2.current);
    };
  }, [measureAndPosition, schedule]);

  useLayoutEffect(() => {
    latestValueRef.current = inputValue;
    measureAndPosition();
  }, [inputValue, measureAndPosition]);

  const bindInput = useCallback((el: HTMLInputElement | null) => {
    inputRef.current = el;
  }, []);

  const bindPostfix = useCallback((el: HTMLSpanElement | null) => {
    postfixRef.current = el;
  }, []);

  return { bindInput, bindPostfix };
}
