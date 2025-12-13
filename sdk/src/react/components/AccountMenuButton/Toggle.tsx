import { PROFILE_TOGGLE_TOKENS } from '../theme/design-tokens';

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
  const themeColors = colors || (theme === 'dark' ? PROFILE_TOGGLE_TOKENS.dark : PROFILE_TOGGLE_TOKENS.light);

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
            gap: 'var(--w3a-spacing-sm)'
          })
        }}
      >
        <input
          type="checkbox"
          name="toggle"
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
            // Support gradients when active by assigning to 'background'
            ...(disabled
              ? { backgroundColor: themeColors.disabledBackground }
              : checked
                ? { background: themeColors.activeBackground as any }
                : { backgroundColor: themeColors.inactiveBackground }
            ),
            borderRadius: isLarge ? 'var(--w3a-border-radius-lg)' : 'var(--w3a-border-radius-md)',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            cursor: disabled ? 'not-allowed' : 'pointer',
            transform: disabled ? 'scale(1)' : checked ? 'scale(1.02)' : 'scale(1)',
            ...(isLarge && {
              [isTextOnLeft ? 'marginLeft' : 'marginRight']: 'var(--w3a-spacing-sm)'
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
            }}
          />
        </span>
        {/* flexDirection: row-reverse toggles left or right */}
        <span
          className="toggle-text"
          style={{
            fontWeight: '500',
            fontSize: isLarge ? '14px' : '0.8rem',
            color: disabled ? themeColors.disabledBackground : themeColors.textColor,
            [isTextOnLeft ? 'marginRight' : 'marginLeft']: isLarge ? '0' : 'var(--w3a-spacing-sm)',
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
