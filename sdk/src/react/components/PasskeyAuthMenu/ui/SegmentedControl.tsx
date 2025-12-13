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
  /**
   * Optional vertical inset between container edge and the active pill.
   * Defaults to the CSS value (5px). Supply if you need tighter/looser
   * vertical padding when customizing height.
   */
  inset?: number | string;
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
  inset,
}) => {
  // Compute layout metrics
  const count = Math.max(1, items.length);
  const activeIndex = Math.max(0, items.findIndex((it) => Object.is(it.value, value)));
  const useIsomorphicLayoutEffect = typeof window !== 'undefined'
    ? React.useLayoutEffect
    : React.useEffect;

  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const gridRef = React.useRef<HTMLDivElement | null>(null);
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
    // Schedule a couple of rAF ticks to catch post-animation/layout settles
    // (e.g., after parent height transitions or content animations)
    let raf1 = 0;
    let raf2 = 0;
    raf1 = requestAnimationFrame(() => {
      updateActiveMetrics();
      raf2 = requestAnimationFrame(() => {
        updateActiveMetrics();
      });
    });
    return () => {
      if (raf1) cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
    };
  }, [updateActiveMetrics, items, value]);

  useIsomorphicLayoutEffect(() => {
    const onResize = () => updateActiveMetrics();

    // Fallback listeners when ResizeObserver is not available
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', onResize);
      document.addEventListener('visibilitychange', onResize);
      return () => {
        window.removeEventListener('resize', onResize);
        document.removeEventListener('visibilitychange', onResize);
      };
    }

    // Observe container, grid, and active button for size changes
    const observers: ResizeObserver[] = [];
    const makeRO = () => new ResizeObserver(() => updateActiveMetrics());

    const roContainer = makeRO();
    observers.push(roContainer);
    const container = containerRef.current;
    if (container) roContainer.observe(container);

    const roGrid = makeRO();
    observers.push(roGrid);
    const grid = gridRef.current;
    if (grid) roGrid.observe(grid);

    const roActiveBtn = makeRO();
    observers.push(roActiveBtn);
    const activeBtn = buttonRefs.current[activeIndex] ?? null;
    if (activeBtn) roActiveBtn.observe(activeBtn);

    // Also re-measure after transitions/animations on the nearest content switcher
    const root = container?.closest('.w3a-content-switcher') || container;
    const onTransitionEnd = () => updateActiveMetrics();
    const onAnimationEnd = () => updateActiveMetrics();
    root?.addEventListener('transitionend', onTransitionEnd);
    root?.addEventListener('animationend', onAnimationEnd);

    // Fonts can change text metrics; remeasure when ready
    const fonts: any = (document as any)?.fonts;
    let fontsReadyCancelled = false;
    if (fonts?.ready) {
      fonts.ready
        .then(() => {
          if (!fontsReadyCancelled) updateActiveMetrics();
        })
        .catch(() => {});
    }

    // Recalculate when tab becomes visible again
    document.addEventListener('visibilitychange', onResize);
    window.addEventListener('resize', onResize);

    return () => {
      observers.forEach((ro) => ro.disconnect());
      root?.removeEventListener('transitionend', onTransitionEnd);
      root?.removeEventListener('animationend', onAnimationEnd);
      document.removeEventListener('visibilitychange', onResize);
      window.removeEventListener('resize', onResize);
      fontsReadyCancelled = true;
    };
  }, [updateActiveMetrics, items.length, activeIndex]);

  // mobilePressHandlers: reduce mobile press delay by activating on pointerdown
  // for touch/pen, while preserving click for mouse/keyboard. De-dupes follow-up click.
  const _pressedTargets = new WeakSet<EventTarget & Element>();

  function mobilePressHandlers(onActivate: () => void) {
    return {
      onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
        const pt = e.pointerType;
        if (pt && pt !== 'mouse') {
          e.preventDefault();
          _pressedTargets.add(e.currentTarget);
          onActivate();
        }
      },
      onClick: (e: React.MouseEvent<HTMLElement>) => {
        if (_pressedTargets.has(e.currentTarget)) {
          _pressedTargets.delete(e.currentTarget);
          return;
        }
        onActivate();
      },
    } as const;
  }

  const hasCustomHeight = height !== undefined;
  const insetCss = toCssDim(inset);
  const rootStyle: React.CSSProperties = {
    height: toCssDim(height),
    // Ensure CSS min-height does not force larger control when a custom height is provided
    minHeight: toCssDim(height),
    borderRadius: toCssDim(radius),
    ...(containerStyle || {}),
  };

  const activeStyle: React.CSSProperties = {
    transform: `translateX(${activeMetrics.translateX}px)`,
    background: activeBg,
    borderRadius: toCssDim(radius),
    width: activeMetrics.width ? `${activeMetrics.width}px` : undefined,
    opacity: activeMetrics.width ? 1 : 0,
    // Respect custom inset if provided; otherwise fall back to CSS (5px)
    top: insetCss,
    bottom: insetCss,
  };

  const btnBaseStyle: React.CSSProperties = {
    fontSize: toCssDim(buttonFontSize),
    padding: toCssDim(buttonPadding),
    // Keep labels perfectly centered and stretch buttons to the container height
    height: '100%',
    // When a custom height is set, allow the button to shrink below the CSS min-height
    minHeight: hasCustomHeight ? 0 : undefined,
    ...(buttonStyle || {}),
  };

  return (
    <div
      className={`w3a-seg${className ? ` ${className}` : ''}`}
      style={rootStyle}
      ref={containerRef}
    >
      <div className="w3a-seg-active" style={activeStyle} />
      <div className="w3a-seg-grid" ref={gridRef}>
        {items.map((it, i) => {
          const isActive = i === activeIndex;
          return (
            <button
              key={i}
              type="button"
              aria-pressed={isActive}
              className={`w3a-seg-btn${isActive ? ' is-active' : ''}${buttonClassName ? ` ${buttonClassName}` : ''}${it.className ? ` ${it.className}` : ''}`}
              {...mobilePressHandlers(() => onValueChange(it.value))}
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
