import React from 'react';
import { Toggle } from './Toggle';
import { Slider } from './Slider';
import type { TransactionSettingsSectionProps } from './types';
import { SegmentedControl } from '../PasskeyAuthMenu/SegmentedControl';

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
  const segMode = ((): 'register' | 'login' | 'recover' => {
    switch (currentConfirmConfig?.uiMode) {
      case 'skip': return 'register';
      case 'modal': return 'login';
      case 'drawer': return 'recover';
      default: return 'login';
    }
  })();
  const handleSegChange = (m: 'register' | 'login' | 'recover') => {
    const next = m === 'register' ? 'skip' : m === 'login' ? 'modal' : 'drawer';
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
              <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>Confirmation UI</div>
              <div style={{ width: '100%', maxWidth: 260 }}>
                <SegmentedControl
                  mode={segMode as any}
                  onChange={handleSegChange as any}
                  activeBg={'var(--w3a-colors-primary)'}
                  labels={{ register: 'skip', login: 'modal', recover: 'drawer' }}
                  height={44}
                  buttonFontSize={13}
                  containerStyle={{ background: 'var(--w3a-colors-colorSurface)' }}
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
              <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>Confirmation behavior</div>
              <div style={{ width: '100%', maxWidth: 260 }}>
                <SegmentedControl
                  mode={(currentConfirmConfig?.behavior === 'autoProceed' ? 'register' : 'login') as any}
                  onChange={(m: any) => {
                    const wantsAuto = m === 'register';
                    const isAuto = currentConfirmConfig?.behavior === 'autoProceed';
                    if (wantsAuto !== isAuto) onToggleSkipClick?.();
                  }}
                  activeBg={'var(--w3a-colors-primary)'}
                  labels={{ register: 'skip click', login: 'require click' }}
                  options={['register', 'login']}
                  height={44}
                  buttonFontSize={13}
                  containerStyle={{ background: 'var(--w3a-colors-colorSurface)' }}
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
