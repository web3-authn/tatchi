import React, { useState, useEffect } from 'react';
import { usePasskeyContext } from '../../context';
import { HaloBorder } from './HaloBorder';
import './AccessKeysModal.css';
import { AccessKeyInfoView, FunctionCallPermissionView } from '@near-js/types';
import { useTheme } from '../theme/useTheme';
import PasskeyHaloLoading from './PasskeyHaloLoading';

interface AccessKeysModalProps {
  nearAccountId: string;
  isOpen: boolean;
  onClose: () => void;
}

interface AccessKey {
  public_key: string;
  access_key: {
    nonce: number;
    permission: {
      FunctionCall?: {
        allowance: string;
        receiver_id: string;
        method_names: string[];
      };
      FullAccess?: {};
    };
  };
}

export const AccessKeysModal: React.FC<AccessKeysModalProps> = ({
  nearAccountId,
  isOpen,
  onClose
}) => {
  const { passkeyManager } = usePasskeyContext();
  const { theme } = useTheme();
  const [accessKeys, setAccessKeys] = useState<AccessKeyInfoView[]>([
    {
      public_key: 'placeholder',
      access_key: {
        nonce: 0n,
        block_height: 0,
        block_hash: 'placeholder',
        permission: {
          FunctionCall: {
            allowance: '1000000000000000000000000',
            receiver_id: 'placeholder',
            method_names: ['placeholder']
          }
        }
      },
    }
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tooltipVisible, setTooltipVisible] = useState<number | null>(null);
  const [copiedKeys, setCopiedKeys] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (isOpen) {
      loadAccessKeys();
    }
  }, [isOpen]);

  const loadAccessKeys = async () => {
    if (!passkeyManager) return;

    setIsLoading(true);
    setError(null);

    try {
      const keys = await passkeyManager.viewAccessKeyList(nearAccountId);
      setTimeout(() => {
        setAccessKeys(keys.keys);
      }, 500);
    } catch (err: any) {
      setError(err.message || 'Failed to load access keys');
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = async (text: string, keyIndex: number) => {
    try {
      await navigator.clipboard.writeText(text);

      // Fire custom event for copy action
      const copyEvent = new CustomEvent('accessKeyCopied', {
        detail: {
          publicKey: text,
          keyIndex: keyIndex,
          timestamp: Date.now()
        }
      });
      window.dispatchEvent(copyEvent);

      // Show brief tooltip feedback
      setTooltipVisible(keyIndex);
      setTimeout(() => setTooltipVisible(null), 2000);

      // Set copied state for status badge
      setCopiedKeys(prev => new Set(prev).add(keyIndex));
      setTimeout(() => {
        setCopiedKeys(prev => {
          const newSet = new Set(prev);
          newSet.delete(keyIndex);
          return newSet;
        });
      }, 3000);
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
    }
  };

  const getPermissionType = (permission: "FullAccess" | FunctionCallPermissionView) => {
    if (permission === "FullAccess") return 'Full Access';
    if (
      'FunctionCall' in permission &&
      'receiver_id' in permission?.FunctionCall &&
      'method_names' in permission?.FunctionCall &&
      permission?.FunctionCall?.method_names?.length > 0
    ) {
      return 'Function Call';
    }
    return 'Unknown';
  };

  const getPermissionDetails = (permission: any) => {
    if (permission.FunctionCall) {
      const { allowance, receiver_id, method_names } = permission.FunctionCall;
      return {
        allowance: allowance || '0',
        receiverId: receiver_id,
        methodNames: method_names || []
      };
    }
    return null;
  };

  if (!isOpen) return null;

  // Prevent any events from bubbling up to parent components
  const handleBackdropClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onClose();
  };

  const handleModalContentClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Don't call onClose here - we want to keep the modal open
  };

  return (
    <div className={`w3a-access-keys-modal-backdrop theme-${theme}`}
      onClick={handleBackdropClick}
      onMouseDown={(e) => e.stopPropagation()}
      onMouseUp={(e) => e.stopPropagation()}
    >
      <HaloBorder theme={theme} animated={true} ringGap={8} ringWidth={4}>
        <div className="w3a-access-keys-modal-content"
          onClick={handleModalContentClick}
          onMouseDown={(e) => e.stopPropagation()}
          onMouseUp={(e) => e.stopPropagation()}
        >
          <div className="w3a-access-keys-modal-header">
            <h2 className="w3a-access-keys-modal-title">Access Keys</h2>
            <button className="w3a-access-keys-modal-close"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onClose();
              }}
            >
              ✕
            </button>
          </div>

          <PasskeyHaloLoading
            style={{
              display: 'grid',
              placeItems: 'center',
            }}
            height={48}
            width={48}
          />

          {error && (
            <div className="w3a-access-keys-error">
              <p>{error}</p>
              <button onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                loadAccessKeys();
              }} className="w3a-btn w3a-btn-primary">
                Try Again
              </button>
            </div>
          )}

          {!isLoading && !error && accessKeys.length === 0 && (
            <div className="w3a-access-keys-empty">
              <p>No access keys found.</p>
            </div>
          )}

          {!error && accessKeys.length > 0 && (
            <div className="w3a-keys-list">
              {accessKeys.map((key, index) => {
                const permissionType = getPermissionType(key.access_key.permission);
                const permissionDetails = getPermissionDetails(key.access_key.permission);
                return (
                  <div key={index} className="w3a-key-item">
                    <div className="w3a-key-content">
                      <div className="w3a-key-details">
                        <div className="w3a-key-header">
                          {
                            key.public_key === 'placeholder' ? (
                              <div className="mono w3a-copyable-key">
                                <span style={{ opacity: 0 }}>
                                  ........................................................
                                </span>
                              </div>
                            ) : (
                              <div
                                className="mono w3a-copyable-key"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  copyToClipboard(key.public_key, index);
                                }}
                                onMouseEnter={() => setTooltipVisible(index)}
                                onMouseLeave={() => setTooltipVisible(null)}
                                title="Click to copy"
                              >
                                {key.public_key}
                                {tooltipVisible === index && (
                                  <div className="w3a-copy-tooltip">Click to copy</div>
                                )}
                              </div>
                            )
                          }
                        </div>
                      </div>

                      {
                        key.public_key !== 'placeholder' &&
                        <div className="w3a-key-status">
                          <span className={`w3a-status-badge ${copiedKeys.has(index) ? 'w3a-copied' : 'w3a-' + permissionType.toLowerCase().replace(' ', '-')}`}>
                            {copiedKeys.has(index) ? 'Copied' : permissionType}
                          </span>
                        </div>
                      }
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </HaloBorder>
    </div>
  );
};
