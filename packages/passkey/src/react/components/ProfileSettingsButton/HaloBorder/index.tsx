import React, { useEffect, useRef } from 'react';

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
  ringGap?: number; // Gap between ring and content
  ringWidth?: number; // Thickness of the rotating ring
  ringBorderRadius?: string; // Border radius of the rotating arc
  ringBorderShadow?: string; // Box shadow of the rotating ring
  padding?: string; // Padding of the container
  innerPadding?: string; // Inner border padding of the container
  innerBackground?: string; // Inner background color of the container
}

export const HaloBorder: React.FC<HaloBorderProps> = ({
  children,
  className = '',
  animated = false,
  style = {},
  theme = 'light',
  ringGap = 4,
  ringWidth = 2,
  ringBorderRadius = '2rem',
  ringBorderShadow,
  padding,
  innerPadding = '2rem',
  innerBackground = 'var(--w3a-colors-colorBackground)',
}) => {
  // Compose inline-only styles and optional JS-driven animation
  const paddingOverride = padding ? padding : `${ringGap + ringWidth}px`;
  const haloRootStyle: React.CSSProperties = {
    background: 'transparent',
    borderRadius: '2rem',
    padding: 0,
    maxWidth: '860px',
    boxSizing: 'border-box',
    width: 'fit-content',
    height: 'fit-content',
    boxShadow: ringBorderShadow,
    ...style,
  };

  const haloInnerStyle: React.CSSProperties = {
    background: 'transparent',
    border: '1px solid transparent',
    borderRadius: '2rem',
    padding: paddingOverride,
    position: 'relative',
  };

  const containerStyle: React.CSSProperties = {
    position: 'relative',
    borderRadius: '2rem',
    overflow: 'visible',
  };

  const contentStyle: React.CSSProperties = {
    background: innerBackground,
    borderRadius: ringBorderRadius,
    padding: innerPadding,
    position: 'relative',
    zIndex: 2,
  };

  const ringRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!animated || !ringRef.current) return;

    let rafId: number;
    const start = performance.now();
    const durationMs = 1150; // match previous CSS animation: 1.15s linear
    const step = (now: number) => {
      const elapsed = now - start;
      const progress = (elapsed % durationMs) / durationMs; // 0..1
      const angle = progress * 360; // degrees
      if (ringRef.current) {
        ringRef.current.style.background = `conic-gradient(from ${angle}deg, transparent 0%, #4DAFFE 10%, #4DAFFE 25%, transparent 35%)`;
      }
      rafId = requestAnimationFrame(step);
    };
    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [animated]);

  const ringInsetPx = `-${ringGap + ringWidth}px`;
  const ringStyle = {
    position: 'absolute' as const,
    top: ringInsetPx,
    right: ringInsetPx,
    bottom: ringInsetPx,
    left: ringInsetPx,
    borderRadius: `calc(${ringBorderRadius} + ${ringGap}px + ${ringWidth}px)`,
    pointerEvents: 'none' as const,
    zIndex: 3,
    background: 'conic-gradient(from 0deg, transparent 0%, #4DAFFE 10%, #4DAFFE 25%, transparent 35%)',
    padding: `${ringWidth}px`,
    WebkitMask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
    WebkitMaskComposite: 'xor',
    maskComposite: 'exclude',
  } as React.CSSProperties & {
    WebkitMaskComposite?: any;
    WebkitMask?: any;
    maskComposite?: any;
  };

  return (
    <div className={`w3a-halo-border-root ${theme}`} style={haloRootStyle}>
      <div className="w3a-halo-border-inner" style={haloInnerStyle}>
        {animated ? (
          <div style={containerStyle}>
            <div ref={ringRef} style={ringStyle} />
            <div className={`w3a-halo-border-content ${className}`} style={contentStyle}>
              {children}
            </div>
          </div>
        ) : (
          <div className={`w3a-halo-border-content ${className}`} style={contentStyle}>
            {children}
          </div>
        )}
      </div>
    </div>
  );
};
