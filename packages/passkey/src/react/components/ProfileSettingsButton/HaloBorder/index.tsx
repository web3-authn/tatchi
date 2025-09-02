import React from 'react';
import './HaloBorder.css';

/**
 * HaloBorder
 *
 * Renders a rounded container with an optional animated, floating outer ring.
 * The ring is implemented via a ::before pseudo-element on a wrapper div.
 *
 * How it works:
 * - The wrapper (`.w3a-rotating-border-container`) sets CSS vars `--ring-gap` and `--ring-width`.
 * - Its ::before element is positioned with a negative `inset` so it extends OUTSIDE the box,
 *   creating real space between the content and the ring.
 * - A conic-gradient fills the ::before element, and `mask-composite: exclude` keeps only
 *   the padding area (a thin band) visible; the band thickness == `--ring-width`.
 * - We animate the gradient’s start angle via `--w3a-ring-angle` to rotate the arc.
 */

interface HaloBorderProps {
  children: React.ReactNode;
  className?: string;
  animated?: boolean;
  style?: React.CSSProperties;
  theme?: 'dark' | 'light';
  borderGap?: number; // Gap between ring and content
  borderWidth?: number; // Thickness of the rotating ring
}

export const HaloBorder: React.FC<HaloBorderProps> = ({
  children,
  className = '',
  animated = false,
  style = {},
  theme = 'light',
  borderGap = 8,
  borderWidth = 2
}) => {
  return (
    <div
      className={`w3a-halo-border-root ${theme}`}
      style={style}
    >
      <div className="w3a-halo-border-inner">
        {animated ? (
          // Animated border using pseudo-elements
          <div
            className="w3a-rotating-border-container"
            style={{
              '--ring-gap': `${borderGap}px`,
              '--ring-width': `${borderWidth}px`
            } as React.CSSProperties & { '--ring-gap': string; '--ring-width': string }}
          >
            <div className={`w3a-halo-border-content ${className}`}>
              {children}
            </div>
          </div>
        ) : (
          // Non-animated version
          <div className={`w3a-halo-border-content ${className}`}>
            {children}
          </div>
        )}
      </div>
    </div>
  );
};
