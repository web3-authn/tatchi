import React from 'react';
import clsx from 'clsx';

export interface ArrowRightAnimProps {
  title?: React.ReactNode;
  className?: string;
  color?: string;
  size?: number;
}

/**
 * ArrowRightAnim
 *
 * A small "stripe" arrow that animates from ">" to "->" on hover:
 * - At rest: only the chevron is visible.
 * - On hover: the horizontal line fades in and the chevron nudges right.
 *
 * Styling/animation is handled via CSS classes in ArrowRightAnim.css.
 */
export const ArrowRightAnim: React.FC<ArrowRightAnimProps> = ({
  title,
  className,
  color,
  size: sizeProp,
}) => {
  const size = typeof sizeProp === 'number' && Number.isFinite(sizeProp)
    ? sizeProp
    : 12;

  return (
    <div
      className={clsx('stripe-arrow', className)}
      style={color ? { color } : undefined}
    >
      {title ?? null}
      <svg
        className="HoverArrow"
        width={size}
        height={size}
        viewBox="0 0 10 10"
        aria-hidden="true"
        focusable="false"
      >
        <g fillRule="evenodd">
          <path
            className="HoverArrow__linePath"
            d="M0 5h7"
          />
          <path
            className="HoverArrow__tipPath"
            d="M1 1l4 4-4 4"
          />
        </g>
      </svg>
    </div>
  );
};

export default ArrowRightAnim;
