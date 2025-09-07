import React from 'react';

export interface SliderProps {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  className?: string;
  onChange: (value: number) => void;
  theme?: 'light' | 'dark';
}

/**
 * Token-aware slider component styled via TransactionSettingsSection.css
 * Uses CSS variables from design-tokens for colors, radii, and shadows.
 */
export const Slider: React.FC<SliderProps> = ({
  value,
  min = 0,
  max = 100,
  step = 1,
  disabled = false,
  className = '',
  onChange,
  theme,
}) => {
  return (
    <div className="w3a-slider-root" style={{
      opacity: disabled ? 0.5 : 1,
      pointerEvents: disabled ? 'none' : 'auto'
    }}>
      <div className="w3a-slider-container">
        <input
          type="range"
          role="slider"
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value}
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(parseInt(e.target.value))}
          className={`w3a-slider ${theme ? `theme-${theme}` : ''} ${className}`}
        />
        <div className="w3a-slider-labels"
          style={{ display: disabled ? 'none' : 'flex' }}
        >
          <span>0s</span>
          <span>0.5s</span>
          <span>1s</span>
          <span>1.5s</span>
          <span>2s</span>
          <span>2.5s</span>
          <span>3s</span>
        </div>
      </div>
    </div>
  );
};

export default Slider;
