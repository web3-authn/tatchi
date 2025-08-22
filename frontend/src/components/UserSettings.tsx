import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { usePasskeyContext, type AccessKeyList } from '@web3authn/passkey/react';
import type { ConfirmationConfig, ConfirmationUIMode } from '@web3authn/passkey';
import { GlassBorder } from './GlassBorder';
import './UserSettings.css';

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

  const handleSetBehavior = (behavior: 'requireClick' | 'autoProceed') => {
    setConfirmBehavior(behavior);
    setCurrentConfig(prev => prev ? { ...prev, behavior } : null);
    toast.success(`Confirmation behavior set to ${behavior}`);
  };

  const handleSetUIMode = (uiMode: ConfirmationUIMode) => {
    if (currentConfig) {
      setConfirmationConfig({ ...currentConfig, uiMode });
      setCurrentConfig(prev => prev ? { ...prev, uiMode } : null);
      toast.success(`UI mode set to ${uiMode}`);
    }
  };

  const handleSetDelay = (delay: number) => {
    if (currentConfig) {
      setConfirmationConfig({ ...currentConfig, autoProceedDelay: delay });
      setCurrentConfig(prev => prev ? { ...prev, autoProceedDelay: delay } : null);
      toast.success(`Auto-proceed delay set to ${delay}ms`);
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
          <h2 className="settings-title">User Settings</h2>
        </div>

        {!isLoggedIn ? (
          <div className="login-prompt">
            <p className="body">Please log in to access user settings</p>
          </div>
        ) : (
          <div className="settings-content">
          {/* Confirmation Settings Section */}
          <div className="settings-section">
            <h3 className="section-title">
              Transaction Confirmation Settings
            </h3>

            <div className="settings-grid">
              {/* Confirmation Behavior */}
              <div className="form-group">
                <label className="form-label">
                  Confirmation Behavior
                </label>
                <select
                  value={currentConfig?.behavior ?? 'autoProceed'}
                  onChange={(e) => handleSetBehavior(e.target.value as 'requireClick' | 'autoProceed')}
                  className="form-select focus-ring"
                >
                  <option value="requireClick">Require Click</option>
                  <option value="autoProceed">Auto Proceed</option>
                </select>
                <p className="form-help">
                  {currentConfig?.behavior === 'requireClick'
                    ? 'User must click "Confirm" button to proceed'
                    : 'Automatically proceed to TouchID after delay'
                  }
                </p>
              </div>

              {/* UI Mode */}
              <div className="form-group">
                <label className="form-label">
                  Confirmation UI Mode
                </label>
                <select
                  value={currentConfig?.uiMode ?? 'modal'}
                  onChange={(e) => handleSetUIMode(e.target.value as ConfirmationUIMode)}
                  className="form-select focus-ring"
                >
                  <option value="skip">Skip Confirmation</option>
                  <option value="modal">Modal Dialog</option>
                  <option value="embedded">Embedded Dialog</option>
                </select>
                <p className="form-help">
                  {currentConfig?.uiMode === 'skip' && 'Skip user confirmation entirely'}
                  {currentConfig?.uiMode === 'modal' && 'Use secure modal dialog'}
                </p>
              </div>

              {/* Auto-proceed Delay */}
              {currentConfig?.behavior === 'autoProceed' && (
                <div className="form-group">
                  <label className="form-label">
                    Auto-proceed Delay (ms)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="10000"
                    step="100"
                    value={currentConfig?.autoProceedDelay ?? 1000}
                    onChange={(e) => handleSetDelay(parseInt(e.target.value) || 0)}
                    className="form-input focus-ring"
                  />
                  <p className="form-help">
                    Time to show transaction details before auto-proceeding
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Access Keys Section */}
          <div className="settings-section">
            <h3 className="section-title">
              Access Key Management
            </h3>

            <div className="settings-grid">
              <div className="form-group">
                <button
                  onClick={handleViewAccessKeys}
                  disabled={isLoadingKeys}
                  className="btn btn-primary"
                >
                  {isLoadingKeys ? (
                    <>
                      <div className="spinner"></div>
                      Loading...
                    </>
                  ) : (
                    'View Access Keys'
                  )}
                </button>
                <p className="form-help">
                  View all access keys for account: {nearAccountId}
                </p>
              </div>

              {/* Access Keys Display */}
              {accessKeys && (
                <>
                  <h4 className="heading">
                    Access Keys ({accessKeys.keys.length})
                  </h4>
                  {accessKeys.keys.map((key, index) => (
                    <div key={index} className="action-item" style={{
                      backgroundColor: '#f8fafc',
                      padding: 'var(--w3a-gap-2)',
                      borderRadius: 'var(--w3a-radius-sm)',
                      border: '1px solid var(--w3a-border)',
                    }}>
                      <div className="key-content">
                        <div className="key-details">
                          <p className="mono">
                            {key.public_key}
                          </p>
                          <p className="body">
                            Permission: {key.access_key.permission === 'FullAccess'
                              ? 'FullAccess'
                              : 'FunctionCall'
                            }
                          </p>
                          {key.access_key.permission !== 'FullAccess' && (
                            <div className="body">
                              <p>Receiver: {key.access_key.permission.FunctionCall.receiver_id}</p>
                              <p>Allowance: {key.access_key.permission.FunctionCall.allowance || 'Unlimited'}</p>
                            </div>
                          )}
                        </div>
                        <div className="key-status">
                          <span className="status-badge">
                            Active
                          </span>
                        </div>
                      </div>
                    </div>
                    ))}
                  <p className="form-help">
                    Note: Key deletion functionality will be added in a future update
                  </p>
                </>
              )}
            </div>
          </div>

          {/* Current Configuration Display */}
          <div className="settings-section">
            <h3 className="section-title">
              Current Configuration
            </h3>
            <pre className="code-block">
              {JSON.stringify(currentConfig, null, 2)}
            </pre>
          </div>
          </div>
        )}
      </div>
    </GlassBorder>
  );
};
