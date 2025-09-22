import React from 'react';
import { Toggle } from './Toggle';
import { Slider } from './Slider';
import type { TransactionSettingsSectionProps } from './types';
import { SegmentedControl } from '../PasskeyAuthMenu/SegmentedControl';
import { AuthMenuMode } from '../PasskeyAuthMenu';

export const TransactionSettingsSection: React.FC<TransactionSettingsSectionProps> = ({
  currentConfirmConfig,
  onSetUiMode,
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

  const disableRequireClick = currentConfirmConfig?.uiMode === 'skip';
  const disableDelaySlider = disableRequireClick || currentConfirmConfig?.behavior !== 'autoProceed';

  // Map uiMode <-> segmented control modes (reuse SegmentedControl)
  const segMode = ((): AuthMenuMode => {
    switch (currentConfirmConfig?.uiMode) {
      case 'skip': return AuthMenuMode.Register; // 0
      case 'modal': return AuthMenuMode.Login;   // 1
      case 'drawer': return AuthMenuMode.Recover; // 2
      default: return AuthMenuMode.Login;
    }
  })();

  const handleSegChange = (m: AuthMenuMode) => {
    const next = m === AuthMenuMode.Register ? 'skip' : m === AuthMenuMode.Login ? 'modal' : 'drawer';
    onSetUiMode?.(next as 'skip' | 'modal' | 'drawer');
  };

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
            <div>
              <div className="w3a-confirmation-options">
                Confirmation Options
              </div>
              <div style={{ width: '100%', maxWidth: 260 }}>
                <SegmentedControl
                  items={[
                    { value: 'skip', label: 'skip' },
                    { value: 'modal', label: 'modal' },
                    { value: 'drawer', label: 'drawer' },
                  ]}
                  value={(currentConfirmConfig?.uiMode ?? 'modal')}
                  onValueChange={(v) => onSetUiMode?.(v as 'skip' | 'modal' | 'drawer')}
                  activeBg={'var(--w3a-colors-primary)'}
                  height={44}
                  buttonFontSize={13}
                  containerStyle={{ background: 'var(--w3a-colors-colorSurface2)' }}
                  buttonStyle={{ display: 'grid', placeItems: 'center', lineHeight: 1, padding: '0 10px' }}
                  activeButtonStyle={{ color: 'var(--w3a-btn-text, #fff)' }}
                />
              </div>
            </div>
            <div
              style={{
                opacity: disableRequireClick ? 0.6 : 1,
                pointerEvents: disableRequireClick ? 'none' : 'auto'
              }}
            >
              <div style={{ width: '100%', maxWidth: 260 }}>
                <SegmentedControl
                  items={[
                    { value: 'auto', label: 'auto proceed' },
                    { value: 'require', label: 'require click' },
                  ]}
                  value={(currentConfirmConfig?.behavior === 'autoProceed') ? 'auto' : 'require'}
                  onValueChange={(v) => {
                    const wantsAuto = v === 'auto';
                    const isAuto = currentConfirmConfig?.behavior === 'autoProceed';
                    if (wantsAuto !== isAuto) onToggleSkipClick?.();
                  }}
                  activeBg={'var(--w3a-colors-primary)'}
                  height={44}
                  buttonFontSize={13}
                  containerStyle={{ background: 'var(--w3a-colors-colorSurface2)' }}
                  buttonStyle={{ display: 'grid', placeItems: 'center', lineHeight: 1, padding: '0 10px' }}
                  activeButtonStyle={{ color: 'var(--w3a-btn-text, #fff)' }}
                />
              </div>
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
