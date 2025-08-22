import React, { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { usePasskeyContext, type AccessKeyList } from '@web3authn/passkey/react';
import type { ConfirmationConfig, ConfirmationUIMode } from '@web3authn/passkey';
import { GlassBorder } from './GlassBorder';
import { Toggle } from './Toggle';
import './UserSettings.css';

interface AutoProceedSliderProps {
  show: boolean;
  currentConfig: ConfirmationConfig | null;
  onSetDelay: (delay: number) => void;
  onDelayChange: (delay: number) => void;
  align?: 'left' | 'right';
  style?: React.CSSProperties;
}

const AutoProceedSlider: React.FC<AutoProceedSliderProps> = ({
  show,
  currentConfig,
  onSetDelay,
  onDelayChange,
  style,
}) => {
  if (!show) return null;
  return (
    <div className="slider-root" style={style}>
      <div className="slider-container">
        <input
          type="range"
          min="0"
          max="6"
          step="1"
          value={Math.round((currentConfig?.autoProceedDelay ?? 1000) / 500)}
          onChange={(e) => onSetDelay(parseInt(e.target.value) * 500)}
          onMouseUp={(e) => onDelayChange(parseInt((e.target as HTMLInputElement).value) * 500)}
          onKeyUp={(e) => onDelayChange(parseInt((e.target as HTMLInputElement).value) * 500)}
          className="slider focus-ring"
        />
        <div className="slider-labels">
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

interface AccessKeysProps {
  accessKeys: AccessKeyList | null;
  isLoadingKeys: boolean;
}

const AccessKeys: React.FC<AccessKeysProps> = ({
  accessKeys,
  isLoadingKeys
}) => {
  const handleCopyKey = async (key: string) => {
    try {
      await navigator.clipboard.writeText(key);
      toast.success('Key copied to clipboard');
    } catch (error) {
      console.error('Failed to copy key:', error);
      toast.error('Failed to copy key');
    }
  };

  return (
    <div className="settings-section">
      <h3 className="section-title">Keys</h3>
      <div className="settings-grid">
        {isLoadingKeys && (
          <div className="form-group">
            <div className="loading-keys">
              <div className="spinner"></div>
              Loading keys...
            </div>
          </div>
        )}

        {/* Access Keys Display */}
        {accessKeys && (
          <>
            {accessKeys.keys.map((key, index) => (
              <div key={index} className="action-item" style={{
                backgroundColor: '#f8fafc',
                padding: 'var(--w3a-gap-2)',
                borderRadius: 'var(--w3a-radius-sm)',
                border: '1px solid var(--w3a-border)',
              }}>
                <div className="key-content">
                  <div className="key-details">
                    <div className="key-header">
                      <p
                        className="mono copyable-key"
                        onClick={() => handleCopyKey(key.public_key)}
                        style={{ cursor: 'pointer' }}
                      >
                        {key.public_key}
                      </p>
                      <span className={`status-badge ${key.access_key.permission === 'FullAccess' ? 'full-access' : 'function-call'}`}>
                        {key.access_key.permission === 'FullAccess' ? 'FullAccess' : 'FunctionCall'}
                      </span>
                    </div>
                    {key.access_key.permission !== 'FullAccess' && (
                      <div className="body">
                        <p>Receiver: {key.access_key.permission.FunctionCall.receiver_id}</p>
                        <p>Allowance: {key.access_key.permission.FunctionCall.allowance || 'Unlimited'}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
};

interface UserSettingsProps {}

export const UserSettings: React.FC<UserSettingsProps> = () => {

  const {
    loginState: { isLoggedIn, nearAccountId },
    setConfirmBehavior,
    setConfirmationConfig,
    getConfirmationConfig,
    viewAccessKeyList,
  } = usePasskeyContext();

  const [currentConfig, setCurrentConfig] = useState<ConfirmationConfig | null>(null);
  const [accessKeys, setAccessKeys] = useState<AccessKeyList | null>(null);
  const [isLoadingKeys, setIsLoadingKeys] = useState(false);

  // Load current configuration on mount and when config changes
  useEffect(() => {
    const config = getConfirmationConfig();
    setCurrentConfig(config);
  }, [getConfirmationConfig]);

  // Load access keys by default when logged in
  useEffect(() => {
    if (isLoggedIn && nearAccountId && !accessKeys && !isLoadingKeys) {
      handleViewAccessKeys();
    }
  }, [isLoggedIn, nearAccountId]);

  const handleToggleShowDetails = () => {
    if (currentConfig) {
      const newUIMode = currentConfig.uiMode === 'modal' ? 'skip' : 'modal';
      setConfirmationConfig({ ...currentConfig, uiMode: newUIMode });
      setCurrentConfig(prev => prev ? { ...prev, uiMode: newUIMode } : null);
      toast.success(`Show details ${newUIMode === 'modal' ? 'enabled' : 'disabled'}`);
    }
  };

  const handleToggleSkipClick = () => {
    if (currentConfig) {
      const newBehavior = currentConfig.behavior === 'requireClick' ? 'autoProceed' : 'requireClick';
      setConfirmBehavior(newBehavior);
      setCurrentConfig(prev => prev ? { ...prev, behavior: newBehavior } : null);
      toast.success(`Skip click ${newBehavior === 'autoProceed' ? 'enabled' : 'disabled'}`);
    }
  };

  const handleSetDelay = (delay: number) => {
    if (currentConfig) {
      setConfirmationConfig({ ...currentConfig, autoProceedDelay: delay });
      setCurrentConfig(prev => prev ? { ...prev, autoProceedDelay: delay } : null);
    }
  };

  const handleDelayChange = (delay: number) => {
    if (currentConfig) {
      setConfirmationConfig({ ...currentConfig, autoProceedDelay: delay });
      setCurrentConfig(prev => prev ? { ...prev, autoProceedDelay: delay } : null);
      toast.success(`Auto-kkip after ${(delay / 1000).toFixed(1)}s`);
    }
  };

  const handleViewAccessKeys = async () => {
    if (!nearAccountId) {
      toast.error('No account logged in');
      return;
    }

    setIsLoadingKeys(true);
    try {
      const keys = await viewAccessKeyList(nearAccountId);
      setAccessKeys(keys);
      toast.success(`Found ${keys.keys.length} access keys`);
    } catch (error) {
      console.error('Failed to fetch access keys:', error);
      toast.error('Failed to fetch access keys');
    } finally {
      setIsLoadingKeys(false);
    }
  };

  return (
    <GlassBorder>
      <div className="content-area">
        <div className="settings-header">
          <h2 className="settings-title">Settings</h2>
        </div>

        {!isLoggedIn ? (
          <div className="login-prompt">
            <p className="body">Please log in to access settings</p>
          </div>
        ) : (
          <div className="settings-content">
            {/* Confirmation Settings Section */}
            <div className="settings-section">
              <h3 className="section-title">
                Transaction Display
                <span
                  className="config-tooltip"
                  data-position="bottom"
                  data-tooltip={JSON.stringify(currentConfig, null, 2)}
                >
                  ⓘ
                </span>
              </h3>
              <div className="settings-grid">
                <div className="form-group toggle-row">
                  <Toggle
                    checked={currentConfig?.uiMode === 'modal'}
                    onChange={() => handleToggleShowDetails()}
                    label="Show details"
                    size="large"
                    textPosition="left"
                  />
                  <Toggle
                    show={currentConfig?.uiMode === 'modal'}
                    checked={currentConfig?.behavior === 'autoProceed'}
                    onChange={() => handleToggleSkipClick()}
                    label="Skip click"
                    size="large"
                    textPosition="left"
                  />
                  <AutoProceedSlider
                    show={
                      currentConfig?.behavior === 'autoProceed' &&
                      currentConfig?.uiMode === 'modal'
                    }
                    style={{ width: '50%' }}
                    currentConfig={currentConfig}
                    onSetDelay={handleSetDelay}
                    onDelayChange={handleDelayChange}
                  />
                </div>

              </div>
            </div>

            <AccessKeys
              accessKeys={accessKeys}
              isLoadingKeys={isLoadingKeys}
            />

          </div>
        )}
      </div>
    </GlassBorder>
  );
};
