

// Color constants for easy customization
const LIGHT_TOGGLE_COLORS = {
  activeBackground: '#2A52BE',
  activeShadow: 'rgba(22, 22, 22, 0.3)',
  inactiveBackground: '#d1d5db', // gray-300
  inactiveShadow: 'rgba(0, 0, 0, 0.1)',
  disabledBackground: '#e5e5e5',
  disabledCircle: '#cccccc',
  textColor: '#333333',
  disabledTextColor: '#999999',
  circleColor: 'white',
};

const DARK_TOGGLE_COLORS = {
  activeBackground: 'oklch(0.536 0.214 260.0)', // cobalt primary - blue400
  activeShadow: 'rgba(42, 82, 190, 0.3)',
  inactiveBackground: 'oklch(0.25 0.012 240)', // grey750 from GREY_COLORS
  inactiveShadow: 'rgba(0, 0, 0, 0.2)',
  disabledBackground: 'oklch(0.35 0.018 240)', // grey650 - charcoal
  disabledCircle: 'oklch(0.35 0.018 240)', // grey650 from GREY_COLORS
  textColor: 'oklch(1 0 0)', // darkText from GUIDELINES_COLORS
  disabledTextColor: 'oklch(0.53 0 0)', // darkTextSecondary from GUIDELINES_COLORS
  circleColor: 'oklch(0.15 0.008 240)', // grey850 from GREY_COLORS
};

const TOGGLE_COLORS = LIGHT_TOGGLE_COLORS;

export interface ToggleColorProps {
  activeBackground?: string;
  activeShadow?: string;
  inactiveBackground?: string;
  inactiveShadow?: string;
  disabledBackground?: string;
  disabledCircle?: string;
  textColor?: string;
  disabledTextColor?: string;
  circleColor?: string;
}

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  tooltip?: string;
  showTooltip?: boolean;
  className?: string;
  size?: 'small' | 'large';
  textPosition?: 'left' | 'right';
  colors?: ToggleColorProps;
  disabled?: boolean;
  theme?: 'dark' | 'light';
}

export const Toggle: React.FC<ToggleProps> = ({
  checked,
  onChange,
  tooltip,
  label = "",
  showTooltip = true,
  className = '',
  size = 'small',
  textPosition = 'left',
  colors,
  disabled = false,
  theme = 'light',
}) => {
  const isLarge = size === 'large';
  const isTextOnLeft = textPosition === 'left';

  // Use theme-appropriate colors if no custom colors provided
  const themeColors = colors || (theme === 'dark' ? DARK_TOGGLE_COLORS : LIGHT_TOGGLE_COLORS);

  return (
    <div className={`${className}`}>
      {/* Conditionally hide tooltip when showTooltip is false */}
      {!showTooltip && (
        <style>
          {`
            .toggle-label.no-tooltip::after,
            .toggle-label.no-tooltip::before {
              display: none !important;
            }
          `}
        </style>
      )}
      <label
        className={`toggle-label ${!showTooltip || !tooltip ? 'no-tooltip' : ''}`}
        {...(tooltip && showTooltip && { 'data-tooltip': tooltip })}
        style={{
          position: 'relative',
          cursor: disabled ? 'not-allowed' : 'pointer',
          userSelect: 'none',
          fontWeight: '500',
          color: disabled ? themeColors.disabledTextColor : themeColors.textColor,
          flexDirection: isTextOnLeft ? 'row-reverse' : 'row',
          ...(isLarge && {
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          })
        }}
      >
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => !disabled && onChange(e.target.checked)}
          className="toggle-checkbox"
          disabled={disabled}
          style={{
            opacity: 0,
            position: 'absolute',
            width: 0,
            height: 0
          }}
        />
        <span
          style={{
            position: 'relative',
            display: 'inline-block',
            width: isLarge ? '44px' : '32px',
            height: isLarge ? '24px' : '16px',
            backgroundColor: disabled
              ? themeColors.disabledBackground
              : checked
                ? themeColors.activeBackground
                : themeColors.inactiveBackground,
            borderRadius: isLarge ? '12px' : '8px',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            cursor: disabled ? 'not-allowed' : 'pointer',
            transform: disabled ? 'scale(1)' : checked ? 'scale(1.02)' : 'scale(1)',
            boxShadow: disabled
              ? 'none'
              : checked
                ? `0 2px 8px ${themeColors.activeShadow}`
                : `0 1px 3px ${themeColors.inactiveShadow}`,
            ...(isLarge && {
              [isTextOnLeft ? 'marginLeft' : 'marginRight']: '12px'
            })
          }}
        >
          <span
            style={{
              position: 'absolute',
              content: '""',
              height: isLarge ? '18px' : '12px',
              width: isLarge ? '18px' : '12px',
              left: isLarge ? '3px' : '2px',
              bottom: isLarge ? '3px' : '2px',
              backgroundColor: disabled ? themeColors.disabledCircle : themeColors.circleColor,
              borderRadius: '50%',
              transform: disabled
                ? 'translateX(0px) scale(1)'
                : checked
                  ? `translateX(${isLarge ? '20px' : '15px'}) scale(1.1)`
                  : 'translateX(0px) scale(1)',
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              boxShadow: disabled
                ? 'none'
                : checked
                  ? '0 3px 12px rgba(0, 0, 0, 0.3)'
                  : '0 1px 2px rgba(0, 0, 0, 0.2)'
            }}
          />
        </span>
        {/* flexDirection: row-reverse toggles left or right */}
        <span
          className="toggle-text"
          style={{
            fontWeight: '500',
            fontSize: isLarge ? '14px' : '0.8rem',
            color: disabled ? themeColors.disabledTextColor : themeColors.textColor,
            [isTextOnLeft ? 'marginRight' : 'marginLeft']: isLarge ? '0' : '8px',
            display: 'flex',
            alignItems: 'center',
            height: isLarge ? '24px' : '16px',
            lineHeight: 1
          }}
        >
          {label}
        </span>
      </label>
    </div>
  );
};

export default Toggle;