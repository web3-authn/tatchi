import React, { useState, useEffect } from 'react';
import { usePasskeyContext } from '../../context';
import './LinkedDevicesModal.css';
import { useTheme, Theme } from '../theme';
import { getAuthenticatorsByUser } from '@/core/rpcCalls';
import type { ContractStoredAuthenticator } from '@/core/PasskeyManager/recoverAccount';
import { toAccountId } from '@/core/types/accountIds';

interface LinkedDevicesModalProps {
  nearAccountId: string;
  isOpen: boolean;
  onClose: () => void;
}

export const LinkedDevicesModal: React.FC<LinkedDevicesModalProps> = ({
  nearAccountId,
  isOpen,
  onClose
}) => {
  const { passkeyManager, loginState } = usePasskeyContext();
  const { theme } = useTheme();
  // Authenticators list: credentialId + registered timestamp + device number
  const [authRows, setAuthRows] = useState<Array<{ credentialId: string; registered: string; deviceNumber: number }>>([
    { credentialId: 'placeholder', registered: '', deviceNumber: 0 }
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tooltipVisible, setTooltipVisible] = useState<number | null>(null);
  const [copiedKeys, setCopiedKeys] = useState<Set<number>>(new Set());
  const [currentDeviceNumber, setCurrentDeviceNumber] = useState<number | null>(null);

  const formatDateTime = (iso: string) => {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleString(); } catch { return iso; }
  };

  useEffect(() => {
    if (isOpen) {
      loadAuthenticators();
      // Also resolve current device number for highlighting
      (async () => {
        try {
          if (!passkeyManager) return;
          const st = await passkeyManager.getLoginState(nearAccountId);
          const dn = (st as any)?.userData?.deviceNumber;
          if (typeof dn === 'number' && Number.isFinite(dn)) {
            setCurrentDeviceNumber(dn);
          } else {
            setCurrentDeviceNumber(null);
          }
        } catch {
          setCurrentDeviceNumber(null);
        }
      })();
    }
  }, [isOpen]);

  // Close on ESC press while modal is open
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Esc') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const loadAuthenticators = async () => {
    if (!passkeyManager) return;

    setIsLoading(true);
    setError(null);

    try {
      const nearClient = passkeyManager.getNearClient();
      const contractId = passkeyManager.configs.contractId;
      const tuples = await getAuthenticatorsByUser(nearClient, contractId, toAccountId(nearAccountId));

      // Map each authenticator to a single row with credentialId and registered timestamp
      const rows: Array<{ credentialId: string; registered: string; deviceNumber: number }> = [];
      for (const [credentialId, auth] of (tuples || []) as Array<[string, ContractStoredAuthenticator]>) {
        const dn = Number(auth.device_number);
        const tsNum = Number(auth.registered);
        const registered = Number.isFinite(tsNum) ? new Date(tsNum).toISOString() : '';
        rows.push({ credentialId, registered, deviceNumber: dn });
      }
      setAuthRows(rows.length > 0 ? rows : []);

    } catch (err: any) {
      setError(err.message || 'Failed to load authenticators');
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
    <Theme mode="scope-only">
    <div className={`w3a-access-keys-modal-backdrop theme-${theme}`}
      onClick={handleBackdropClick}
      onMouseDown={(e) => e.stopPropagation()}
      onMouseUp={(e) => e.stopPropagation()}
    >
      <div className="w3a-access-keys-modal-content"
        onClick={handleModalContentClick}
        onMouseDown={(e) => e.stopPropagation()}
        onMouseUp={(e) => e.stopPropagation()}
      >
        <div className="w3a-access-keys-modal-header">
          <h2 className="w3a-access-keys-modal-title">Linked Devices</h2>
        </div>
        <button className="w3a-access-keys-modal-close"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onClose();
          }}
        >
          ✕
        </button>

        {error && (
          <div className="w3a-access-keys-error">
            <p>{error}</p>
            <button onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              loadAuthenticators();
            }} className="w3a-btn w3a-btn-primary">
              Try Again
            </button>
          </div>
        )}

        {!isLoading && !error && authRows.filter(r => r.credentialId !== 'placeholder').length === 0 && (
          <div className="w3a-access-keys-empty">
            <p>No authenticators found.</p>
          </div>
        )}

        {!error && authRows.filter(r => r.credentialId !== 'placeholder').length > 0 && (
          <div className="w3a-keys-list">
            {(() => {
              const rows = authRows.filter(r => r.credentialId !== 'placeholder');
              const current = (currentDeviceNumber != null)
                ? rows.find(r => r.deviceNumber === currentDeviceNumber)
                : null;
              const others = (currentDeviceNumber != null)
                ? rows.filter(r => r.deviceNumber !== currentDeviceNumber)
                : rows;

              const items: React.ReactNode[] = [];

              if (current) {
                const index = 0;
                items.push(
                  <div key={`current-${current.deviceNumber}`} className="w3a-key-item">
                    <div className="w3a-key-content">
                      <div className="w3a-key-details">
                        <div className="w3a-key-header">
                          <div className="mono w3a-device-row">
                            <span className="w3a-device-badge">Device {current.deviceNumber}</span>
                            <span className="w3a-current-device-text">(current device)</span>
                          </div>
                        </div>
                        <div className="mono w3a-registered">Registered: {formatDateTime(current.registered)}</div>
                        {loginState?.nearPublicKey && (
                          <div
                            className="mono w3a-copyable-key"
                            onClick={(e) => {
                              e.stopPropagation();
                              copyToClipboard(loginState.nearPublicKey!, index);
                            }}
                            onMouseEnter={() => setTooltipVisible(index)}
                            onMouseLeave={() => setTooltipVisible(null)}
                            title="Click to copy"
                          >
                            Access Key: {loginState.nearPublicKey}
                            {tooltipVisible === index && (
                              <div className="w3a-copy-tooltip">Click to copy</div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              }

              others.forEach((item, i) => {
                items.push(
                  <div key={`other-${item.deviceNumber}-${i}`} className="w3a-key-item">
                    <div className="w3a-key-content">
                      <div className="w3a-key-details">
                        <div className="w3a-key-header">
                          <div className="mono w3a-device-row">
                            <span className="w3a-device-badge">Device {item.deviceNumber}</span>
                          </div>
                        </div>
                        <div className="mono w3a-registered">Registered: {formatDateTime(item.registered)}</div>
                      </div>
                    </div>
                  </div>
                );
              });

              return items;
            })()}
          </div>
        )}
      </div>
    </div>
    </Theme>
  );
};
