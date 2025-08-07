import { useEffect } from 'react';
import type { RefObject } from 'react';

export interface UsePostfixPositionOptions {
  /** The input element reference */
  inputRef: RefObject<HTMLInputElement>;
  /** The postfix element reference */
  postfixRef: RefObject<HTMLSpanElement>;
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

  useEffect(() => {
    if (!inputRef.current || !postfixRef.current) {
      return;
    }

    const input = inputRef.current;
    const postfix = postfixRef.current;

    if (inputValue.length > 0) {
      // Show postfix and position it
      postfix.style.visibility = 'visible';

      // Create a temporary canvas to measure text width
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');

      if (context) {
        // Get the computed styles from the input to match font rendering
        const computedStyle = window.getComputedStyle(input);
        context.font = `${computedStyle.fontWeight} ${computedStyle.fontSize} ${computedStyle.fontFamily}`;

        // Measure the actual width of the input text
        const textWidth = context.measureText(inputValue).width;
        const inputPaddingLeft = parseFloat(computedStyle.paddingLeft) || 0;

        // Position postfix right after the text with a small gap
        postfix.style.left = `${inputPaddingLeft + textWidth + 2}px`; // +2px for small gap
      }
    } else {
      // Hide postfix when no text is present
      postfix.style.visibility = 'hidden';
    }
  }, [inputRef, postfixRef, inputValue]);
}