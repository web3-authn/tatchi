import React from 'react';

export interface SegmentedControlProps {
  // Generic API
  items: Array<{
    value: unknown;
    label?: React.ReactNode;
    className?: string;
    disabled?: boolean;
  }>;
  value: unknown;
  onValueChange: (value: unknown) => void;
  activeBg: string;
  /** Optional container height (e.g., 54, '54px') */
  height?: number | string;
  /** Optional border radius for container/active pill */
  radius?: number | string;
  /** Optional font size for buttons */
  buttonFontSize?: number | string;
  /** Optional padding for buttons (shorthand) */
  buttonPadding?: number | string;
  /** Optional inline style for the container */
  containerStyle?: React.CSSProperties;
  /** Optional inline style for each button */
  buttonStyle?: React.CSSProperties;
  /** Optional inline style merged into the active button */
  activeButtonStyle?: React.CSSProperties;
  /** Optional extra class on root */
  className?: string;
  /** Optional extra class on each button */
  buttonClassName?: string;
}

const toCssDim = (v?: number | string): string | undefined => {
  if (v === undefined) return undefined;
  return typeof v === 'number' ? `${v}px` : v;
};

export const SegmentedControl: React.FC<SegmentedControlProps> = ({
  items,
  value,
  onValueChange,
  activeBg,
  height,
  radius,
  buttonFontSize,
  buttonPadding,
  containerStyle,
  buttonStyle,
  activeButtonStyle,
  className,
  buttonClassName,
}) => {
  // Compute layout metrics
  const count = Math.max(1, items.length);
  const activeIndex = Math.max(0, items.findIndex((it) => Object.is(it.value, value)));
  const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? React.useLayoutEffect : React.useEffect;
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const buttonRefs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const activeMetricsRef = React.useRef({ width: 0, translateX: 0 });
  const [activeMetrics, setActiveMetrics] = React.useState({ width: 0, translateX: 0 });

  buttonRefs.current.length = count;

  const updateActiveMetrics = React.useCallback(() => {
    const container = containerRef.current;
    const activeButton = buttonRefs.current[activeIndex];

    if (!container || !activeButton) return;

    const containerRect = container.getBoundingClientRect();
    const activeRect = activeButton.getBoundingClientRect();

    const translateX = activeRect.left - containerRect.left;
    const width = activeRect.width;

    const prev = activeMetricsRef.current;
    if (Math.abs(prev.translateX - translateX) > 0.5 || Math.abs(prev.width - width) > 0.5) {
      const next = { width, translateX };
      activeMetricsRef.current = next;
      setActiveMetrics(next);
    }
  }, [activeIndex]);

  useIsomorphicLayoutEffect(() => {
    updateActiveMetrics();
  }, [updateActiveMetrics, items, value]);

  useIsomorphicLayoutEffect(() => {
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateActiveMetrics);
      return () => window.removeEventListener('resize', updateActiveMetrics);
    }

    const resizeObserver = new ResizeObserver(() => updateActiveMetrics());
    const container = containerRef.current;
    if (container) resizeObserver.observe(container);

    return () => resizeObserver.disconnect();
  }, [updateActiveMetrics, items.length]);

  const rootStyle: React.CSSProperties = {
    height: toCssDim(height),
    borderRadius: toCssDim(radius),
    ...(containerStyle || {}),
  };

  const activeStyle: React.CSSProperties = {
    transform: `translateX(${activeMetrics.translateX}px)`,
    background: activeBg,
    borderRadius: toCssDim(radius),
    width: activeMetrics.width ? `${activeMetrics.width}px` : undefined,
    opacity: activeMetrics.width ? 1 : 0,
  };

  const btnBaseStyle: React.CSSProperties = {
    fontSize: toCssDim(buttonFontSize),
    padding: toCssDim(buttonPadding),
    ...(buttonStyle || {}),
  };

  return (
    <div className={`w3a-seg${className ? ` ${className}` : ''}`} style={rootStyle} ref={containerRef}>
      <div className="w3a-seg-active" style={activeStyle} />
      <div className="w3a-seg-grid">
        {items.map((it, i) => {
          const isActive = i === activeIndex;
          return (
            <button
              key={i}
              type="button"
              aria-pressed={isActive}
              className={`w3a-seg-btn${isActive ? ' is-active' : ''}${buttonClassName ? ` ${buttonClassName}` : ''}${it.className ? ` ${it.className}` : ''}`}
              onClick={() => onValueChange(it.value)}
              disabled={!!it.disabled}
              ref={(node) => {
                buttonRefs.current[i] = node;
              }}
              style={{
                ...btnBaseStyle,
                ...(isActive ? (activeButtonStyle || {}) : {}),
              }}
            >
              {it.label ?? String(it.value)}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default SegmentedControl;
