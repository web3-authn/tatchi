import React from 'react';
import { Toggle } from './Toggle';
import { Slider } from './Slider';
import type { TransactionSettingsSectionProps } from './types';

export const TransactionSettingsSection: React.FC<TransactionSettingsSectionProps> = ({
  currentConfirmConfig,
  onToggleShowDetails,
  onToggleSkipClick,
  onSetDelay,
  onToggleTheme,
  className,
  style,
  isOpen = true,
  theme = 'dark'
}) => {

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  const disableDelaySlider = currentConfirmConfig?.uiMode !== 'modal'
    || currentConfirmConfig?.behavior !== 'autoProceed'

  const disableRequireClick = currentConfirmConfig?.uiMode !== 'modal'

  return (
    <div
      className={`w3a-dropdown-tx-settings-root ${isOpen ? 'is-expanded' : ''} ${className || ''}`}
      style={style}
      onClick={handleClick}
    >
      <div className="w3a-dropdown-toggle-tx-settings">
        <div className="w3a-dropdown-toggle-tx-settings-content">
          <div style={{
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            gap: 8
          }}>
            {onToggleTheme && (
              <div>
                <Toggle
                  checked={currentConfirmConfig?.theme === 'dark'}
                  onChange={onToggleTheme}
                  label="Dark mode"
                  size="large"
                  textPosition="left"
                  theme={theme}
                />
              </div>
            )}
            <Toggle
              checked={currentConfirmConfig?.uiMode === 'modal'}
              onChange={onToggleShowDetails}
              label="Show confirm modal"
              size="large"
              textPosition="left"
              theme={theme}
            />
            <div style={{
              opacity: disableRequireClick ? 0.6 : 1,
              pointerEvents: disableRequireClick ? 'none' : 'auto'
            }}>
              <Toggle
                checked={currentConfirmConfig?.behavior === 'autoProceed'}
                onChange={onToggleSkipClick}
                label="Auto-skip modal"
                size="large"
                textPosition="left"
                disabled={disableRequireClick}
                theme={theme}
              />
            </div>
            <Slider
              disabled={disableDelaySlider}
              min={0}
              max={6}
              step={1}
              value={Math.round((currentConfirmConfig?.autoProceedDelay ?? 1000) / 500)}
              onChange={(v) => onSetDelay(v * 500)}
              theme={theme}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
