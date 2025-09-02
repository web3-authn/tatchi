import React from 'react';
import { Toggle } from './Toggle';
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
            <div>
              <Toggle
                checked={currentConfirmConfig?.uiMode === 'modal'}
                onChange={onToggleShowDetails}
                label="Show details"
                size="large"
                textPosition="left"
                theme={theme}
              />
            </div>
            <div style={{ opacity: disableRequireClick ? 0.5 : 1, pointerEvents: disableRequireClick ? 'none' : 'auto' }}>
              <Toggle
                checked={currentConfirmConfig?.behavior === 'autoProceed'}
                onChange={onToggleSkipClick}
                label="Skip click"
                size="large"
                textPosition="left"
                disabled={disableRequireClick}
                theme={theme}
              />
            </div>

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

            <div className="w3a-slider-root" style={{ opacity: disableDelaySlider ? 0.5 : 1, pointerEvents: disableDelaySlider ? 'none' : 'auto' }}>
              <div className="w3a-slider-container">
                <input
                  disabled={disableDelaySlider}
                  type="range"
                  min={0}
                  max={6}
                  step={1}
                  value={Math.round((currentConfirmConfig?.autoProceedDelay ?? 1000) / 500)}
                  onChange={(e) => onSetDelay(parseInt(e.target.value) * 500)}
                  className="w3a-slider"
                />
                <div className="w3a-slider-labels">
                  <span>0s</span><span>0.5s</span><span>1s</span><span>1.5s</span><span>2s</span><span>2.5s</span><span>3s</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
