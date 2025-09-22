import React from 'react';
import { AuthMenuMode, AuthMenuModeMap } from '.';

export interface SegmentedControlProps {
  mode: AuthMenuMode;
  onChange: (mode: AuthMenuMode) => void;
  activeBg: string;
  /** Optional labels per tab (defaults provided) */
  labels?: Partial<Record<AuthMenuMode, React.ReactNode>>;
  /**
   * Optional list of options to render, in order. Defaults to
   * [0,1,2] (register, login, recover). Use a subset to render 2 options.
   */
  options?: AuthMenuMode[];
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
  mode,
  onChange,
  activeBg,
  labels,
  options,
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
  const handleModeChange = (newMode: AuthMenuMode) => {
    if (newMode !== mode) onChange(newMode);
  };

  const opts: AuthMenuMode[] = Array.isArray(options) && options.length > 0
    ? options
    : [AuthMenuMode.Register, AuthMenuMode.Login, AuthMenuMode.Recover];

  const index = Math.max(0, opts.indexOf(mode as AuthMenuMode));
  const pct = index * 100;
  const count = Math.max(1, opts.length);

  const labelFor = (key: AuthMenuMode): React.ReactNode => {
    if (labels && labels[key] !== undefined) return labels[key]!;
    const DEFAULT_LABELS: Record<'register'|'login'|'recover', string> = {
      register: 'Register',
      login: 'Login',
      recover: 'Recover',
    };
    return DEFAULT_LABELS[AuthMenuModeMap[key]];
  };

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
        {opts.map((key) => (
          <button
            key={key}
            type="button"
            aria-pressed={mode === key}
            className={`w3a-seg-btn ${AuthMenuModeMap[key]}${mode === key ? ' is-active' : ''}${buttonClassName ? ` ${buttonClassName}` : ''}`}
            onClick={() => handleModeChange(key)}
            style={{
              ...btnBaseStyle,
              ...(mode === key ? (activeButtonStyle || {}) : {}),
            }}
          >
            {labelFor(key)}
          </button>
        ))}
      </div>
    </div>
  );
};

export default SegmentedControl;
