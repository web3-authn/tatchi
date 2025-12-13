import { useCallback, useLayoutEffect, useRef } from 'react';

const DEFAULT_FONT = "16px sans-serif";
const ROOT_FONT_SIZE_FALLBACK = 16;

const applyTextTransform = (value: string, transform: string): string => {
  switch (transform) {
    case 'uppercase':
      return value.toUpperCase();
    case 'lowercase':
      return value.toLowerCase();
    case 'capitalize':
      return value.replace(/\b(\p{L})/gu, (m) => m.toUpperCase());
    default:
      return value;
  }
};

const parseLengthToPx = (raw: string, fontSizePx: number): number => {
  if (!raw) return 0;
  const value = raw.trim();
  if (!value || value === 'normal') return 0;
  const numeric = Number.parseFloat(value);
  if (Number.isNaN(numeric) || numeric === 0) return 0;
  if (value.endsWith('px')) return numeric;
  if (value.endsWith('em')) return numeric * fontSizePx;
  if (value.endsWith('rem')) {
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      const rootFontSize =
        Number.parseFloat(window.getComputedStyle(document.documentElement).fontSize) ||
        ROOT_FONT_SIZE_FALLBACK;
      return numeric * rootFontSize;
    }
    return numeric * fontSizePx;
  }
  return numeric;
};

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
 * - Measures text width via an off-screen canvas to avoid synchronous layout work.
 * - Mirrors font, letter-spacing, and text-transform so the postfix aligns with rendered text.
 * - Respects (prefers-reduced-motion) only indirectly via CSS; this hook only sets left/visibility.
 * - Avoids caret/scroll tracking; this is intentional for a stable end-of-value anchor.
 */
export function usePostfixPosition({
  inputValue,
  gap = 0,
}: UsePostfixPositionOptions): UsePostfixPositionReturn {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const postfixRef = useRef<HTMLSpanElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const padAndBorderLeftRef = useRef<number>(0);
  const fontRef = useRef<string>(DEFAULT_FONT);
  const letterSpacingPxRef = useRef<number>(0);
  const textTransformRef = useRef<string>('none');
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

    if (typeof document === 'undefined') return;
    let ctx = ctxRef.current;
    if (!ctx) {
      const canvas = document.createElement('canvas');
      canvasRef.current = canvas;
      ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctxRef.current = ctx;
    }

    ctx.font = fontRef.current || DEFAULT_FONT;
    const transformed = applyTextTransform(valueToMeasure, textTransformRef.current || 'none');
    let width = ctx.measureText(transformed).width;
    const letterSpacingPx = letterSpacingPxRef.current;
    if (letterSpacingPx !== 0 && transformed.length > 1) {
      width += letterSpacingPx * (transformed.length - 1);
    }

    const left = padAndBorderLeftRef.current + width + 1 + gap; // +1 to avoid overlap
    postfix.style.left = `${left}px`;
    postfix.style.visibility = 'visible';
  }, [gap]);

  const updateComputedStyles = useCallback(() => {
    const input = inputRef.current;
    if (!input || typeof window === 'undefined') return;
    const cs = window.getComputedStyle(input);

    const fontString =
      cs.font && cs.font !== ''
        ? cs.font
        : `${cs.fontStyle || ''} ${cs.fontVariant || ''} ${cs.fontWeight || ''} ${cs.fontSize || '16px'} / ${cs.lineHeight || 'normal'} ${cs.fontFamily || 'sans-serif'}`;
    fontRef.current = fontString || DEFAULT_FONT;

    textTransformRef.current = cs.textTransform || 'none';

    const fontSizePx = Number.parseFloat(cs.fontSize) || 16;
    letterSpacingPxRef.current = parseLengthToPx(cs.letterSpacing || '', fontSizePx);

    const pl = Number.parseFloat(cs.paddingLeft) || 0;
    const bl = Number.parseFloat(cs.borderLeftWidth) || 0;
    padAndBorderLeftRef.current = pl + bl;
  }, []);

  const inputNode = inputRef.current;
  const postfixNode = postfixRef.current;

  useLayoutEffect(() => {
    const input = inputRef.current;
    const postfix = postfixRef.current;
    if (!input || !postfix) return;

    // Initial measure
    updateComputedStyles();
    measureAndPosition();

    // Observe input size changes (layout shifts)
    const ro = new ResizeObserver(() => {
      updateComputedStyles();
      schedule(measureAndPosition);
    });
    ro.observe(input);
    ro.observe(postfix);

    // Re-measure after fonts are ready (optional fonts API)
    const fonts: any = (document as any)?.fonts;
    if (fonts?.ready) {
      fonts.ready
        .then(() => {
          updateComputedStyles();
          schedule(measureAndPosition);
        })
        .catch(() => {});
    }

    // Window resize
    const onResize = () => {
      updateComputedStyles();
      schedule(measureAndPosition);
    };
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      ro.disconnect();
      canvasRef.current = null;
      ctxRef.current = null;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (rafRef2.current) cancelAnimationFrame(rafRef2.current);
    };
  }, [inputNode, postfixNode, measureAndPosition, schedule, updateComputedStyles]);

  useLayoutEffect(() => {
    latestValueRef.current = inputValue;
    measureAndPosition();
  }, [inputValue, measureAndPosition]);

  const bindInput = useCallback(
    (el: HTMLInputElement | null) => {
      inputRef.current = el;
      if (el) {
        updateComputedStyles();
        measureAndPosition();
      }
    },
    [measureAndPosition, updateComputedStyles],
  );

  const bindPostfix = useCallback(
    (el: HTMLSpanElement | null) => {
      postfixRef.current = el;
      if (el) {
        updateComputedStyles();
        measureAndPosition();
      }
    },
    [measureAndPosition, updateComputedStyles],
  );

  return { bindInput, bindPostfix };
}

