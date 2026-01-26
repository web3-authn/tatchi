import React from 'react';
import type { TransactionSettingsSectionProps } from './types';
import { SegmentedControl } from '../PasskeyAuthMenu/ui/SegmentedControl';

export const TransactionSettingsSection: React.FC<TransactionSettingsSectionProps> = ({
  currentConfirmConfig,
  signerMode,
  onToggleThresholdSigning,
  onSetUiMode,
  onToggleShowDetails,
  onToggleSkipClick,
  onSetDelay,
  className,
  style,
  isOpen = true,
  theme = 'dark'
}) => {

  React.useEffect(() => {
    if (!isOpen) return;
    if (currentConfirmConfig?.behavior !== 'skipClick') return;
    const delay = currentConfirmConfig?.autoProceedDelay ?? 0;
    if (delay === 0) return;
    onSetDelay(0);
  }, [currentConfirmConfig?.autoProceedDelay, currentConfirmConfig?.behavior, isOpen, onSetDelay]);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  const disableRequireClick = currentConfirmConfig?.uiMode === 'none';
  const disableAll = !isOpen;
  const selectedSignerMode = signerMode?.mode ?? 'local-signer';

  return (
    <div
      className={`w3a-dropdown-tx-settings-root ${isOpen ? 'is-expanded' : ''} ${className || ''}`}
      style={style}
      onClick={handleClick}
    >
      <div className="w3a-dropdown-toggle-tx-settings">
        <div
          className="w3a-dropdown-toggle-tx-settings-content"
          aria-hidden={!isOpen}
          style={{ pointerEvents: isOpen ? 'auto' : 'none' }}
        >
          <div style={{
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            gap: 8
          }}>
            {signerMode && onToggleThresholdSigning && (
              <div>
                <div className="w3a-confirmation-options">
                  Signing Mode
                </div>
                <div style={{ width: '100%' }}>
                  <SegmentedControl
                    items={[
                      { value: 'local-signer', label: 'Local Signer', disabled: disableAll },
                      { value: 'threshold-signer', label: 'MPC Signer', disabled: disableAll },
                    ]}
                    value={selectedSignerMode}
                    onValueChange={(v) => onToggleThresholdSigning(v === 'threshold-signer')}
                    activeBg={'var(--w3a-colors-primary)'}
                    height={40}
                    buttonFontSize={12}
                    containerStyle={{ background: 'var(--w3a-colors-surface2)', width: '100%' }}
                    buttonStyle={{ display: 'grid', placeItems: 'center', lineHeight: 1, padding: '0 10px' }}
                    activeButtonStyle={{ color: 'var(--w3a-colors-textButton)' }}
                  />
                </div>
              </div>
            )}
            <div>
              <div className="w3a-confirmation-options">
                Confirmation Options
              </div>
              <div style={{ width: '100%' }}>
                <SegmentedControl
                  items={[
                    { value: 'none', label: 'none', disabled: disableAll },
                    { value: 'modal', label: 'modal', disabled: disableAll },
                    { value: 'drawer', label: 'drawer', disabled: disableAll },
                  ]}
                  value={(currentConfirmConfig?.uiMode ?? 'modal')}
                  onValueChange={(v) => onSetUiMode?.(v as 'none' | 'modal' | 'drawer')}
                  activeBg={'var(--w3a-colors-primary)'}
                  height={40}
                  buttonFontSize={12}
                  containerStyle={{ background: 'var(--w3a-colors-surface2)', width: '100%' }}
                  buttonStyle={{ display: 'grid', placeItems: 'center', lineHeight: 1, padding: '0 10px' }}
                  activeButtonStyle={{ color: 'var(--w3a-colors-textButton)' }}
                />
              </div>
            </div>
            <div
              style={{
                opacity: disableRequireClick ? 0.6 : 1,
                pointerEvents: disableRequireClick ? 'none' : 'auto'
              }}
            >
              <div style={{ width: '100%' }}>
                <SegmentedControl
                  items={[
                    { value: 'auto', label: 'auto proceed', disabled: disableAll || disableRequireClick },
                    { value: 'require', label: 'require click', disabled: disableAll || disableRequireClick },
                  ]}
                  value={(currentConfirmConfig?.behavior === 'skipClick') ? 'auto' : 'require'}
                  onValueChange={(v) => {
                    const wantsAuto = v === 'auto';
                    const isAuto = currentConfirmConfig?.behavior === 'skipClick';
                    if (wantsAuto && (currentConfirmConfig?.autoProceedDelay ?? 0) !== 0) {
                      onSetDelay(0);
                    }
                    if (wantsAuto !== isAuto) onToggleSkipClick?.();
                  }}
                  activeBg={'var(--w3a-colors-primary)'}
                  height={40}
                  buttonFontSize={12}
                  containerStyle={{ background: 'var(--w3a-colors-surface2)', width: '100%' }}
                  buttonStyle={{ display: 'grid', placeItems: 'center', lineHeight: 1, padding: '0 10px' }}
                  activeButtonStyle={{ color: 'var(--w3a-colors-textButton)' }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
