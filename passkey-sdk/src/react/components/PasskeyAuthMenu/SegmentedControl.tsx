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
  const pct = activeIndex * 100;


  const rootStyle: React.CSSProperties = {
    height: toCssDim(height),
    borderRadius: toCssDim(radius),
    ...(containerStyle || {}),
  };

  const activeStyle: React.CSSProperties = {
    transform: `translateX(${pct}%)`,
    background: activeBg,
    borderRadius: toCssDim(radius),
    width: `calc(${(100 / count).toFixed(6)}% - 4px)`,
  };

  const btnBaseStyle: React.CSSProperties = {
    fontSize: toCssDim(buttonFontSize),
    padding: toCssDim(buttonPadding),
    ...(buttonStyle || {}),
  };

  return (
    <div className={`w3a-seg${className ? ` ${className}` : ''}`} style={rootStyle}>
      <div className="w3a-seg-active" style={activeStyle} />
      <div className="w3a-seg-grid" style={{ gridTemplateColumns: `repeat(${count}, 1fr)` }}>
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
