import React, { useState, useEffect } from 'react';
import { useTatchi } from '../../context';
import './LinkedDevicesModal.css';
import { useTheme, Theme } from '../theme';

import { getAuthenticatorsByUser } from '@/core/rpcCalls';
import type { ContractStoredAuthenticator } from '@/core/TatchiPasskey/syncAccount';
import type { AccessKeyList } from '@/core/NearClient';
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
  const { tatchi, loginState, viewAccessKeyList } = useTatchi();
  const { theme } = useTheme();
  const devicesPerPage = 4;
  // Authenticators list: credentialId + registered timestamp + device number
  const [authRows, setAuthRows] = useState<Array<{
    credentialId: string;
    registered: string;
    deviceNumber: number;
    nearPublicKey: string | null;
  }>>([{ credentialId: 'placeholder', registered: '', deviceNumber: 0, nearPublicKey: null }]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accessKeyList, setAccessKeyList] = useState<AccessKeyList | null>(null);
  const [tooltipVisible, setTooltipVisible] = useState<number | null>(null);
  const [copiedKeys, setCopiedKeys] = useState<Set<number>>(new Set());
  const [currentDeviceNumber, setCurrentDeviceNumber] = useState<number | null>(null);
  const [deletingKeyPublicKey, setDeletingKeyPublicKey] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  const formatDateTime = (iso: string) => {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleString(); } catch { return iso; }
  };

  useEffect(() => {
    if (isOpen) {
      loadAuthenticators();
      setCurrentPage(1);
      // Also resolve current device number for highlighting
      (async () => {
        try {
          if (!tatchi) return;
          const { login } = await tatchi.getLoginSession(nearAccountId);
          const dn = (login as any)?.userData?.deviceNumber;
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

  // If the list size changes (or current device changes), ensure the current page is in range.
  useEffect(() => {
    if (!isOpen) return;
    const rows = authRows.filter(r => r.credentialId !== 'placeholder');
    const others = (currentDeviceNumber != null)
      ? rows.filter(r => r.deviceNumber !== currentDeviceNumber)
      : rows;
    const totalPages = Math.max(1, Math.ceil(others.length / devicesPerPage));
    setCurrentPage((p) => Math.min(p, totalPages));
  }, [authRows, currentDeviceNumber, devicesPerPage, isOpen]);

  // Hide hover/copy tooltips when paging.
  useEffect(() => {
    if (!isOpen) return;
    setTooltipVisible(null);
  }, [currentPage, isOpen]);

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
    if (!tatchi) return;

    setIsLoading(true);
    setError(null);
    setDeleteError(null);

    try {
      const nearClient = tatchi.getNearClient();
      const contractId = tatchi.configs.contractId;
      const [tuples, keys] = await Promise.all([
        getAuthenticatorsByUser(nearClient, contractId, toAccountId(nearAccountId)),
        viewAccessKeyList(nearAccountId)
      ]);

      // Map each authenticator to a single row with credentialId and registered timestamp
      const rows: Array<{ credentialId: string; registered: string; deviceNumber: number; nearPublicKey: string | null }> = [];
      for (const [credentialId, auth] of (tuples || []) as Array<[string, ContractStoredAuthenticator]>) {
        const dn = Number(auth.device_number);
        const rawRegistered = String((auth as any).registered ?? '');
        const registered = (() => {
          if (!rawRegistered) return '';
          // Legacy contracts may return a numeric timestamp string.
          if (/^\d+$/.test(rawRegistered)) {
            const ts = Number(rawRegistered);
            return Number.isFinite(ts) ? new Date(ts).toISOString() : rawRegistered;
          }
          return rawRegistered;
        })();

        const nearPublicKey = (auth as any).near_public_key ?? null;
        rows.push({ credentialId, registered, deviceNumber: dn, nearPublicKey });
      }
      setAuthRows(rows.length > 0 ? rows : []);
      setAccessKeyList(keys);
    } catch (err: any) {
      setError(err.message || 'Failed to load linked devices or access keys');
      setAccessKeyList(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteKey = async (publicKey: string) => {
    if (!tatchi || !publicKey) return;
    if (!nearAccountId) return;

    setDeletingKeyPublicKey(publicKey);
    setDeleteError(null);

    try {
      await tatchi.deleteDeviceKey(nearAccountId, publicKey, {
        signerMode: { mode: 'threshold-signer', behavior: 'fallback' },
      });
      await loadAuthenticators();
    } catch (err: any) {
      setDeleteError(err.message || 'Failed to delete access key');
    } finally {
      setDeletingKeyPublicKey(null);
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

  const rows = authRows.filter(r => r.credentialId !== 'placeholder');
  const current = (currentDeviceNumber != null)
    ? rows.find(r => r.deviceNumber === currentDeviceNumber)
    : null;
  const others = (currentDeviceNumber != null)
    ? rows.filter(r => r.deviceNumber !== currentDeviceNumber)
    : rows;
  const totalPages = Math.max(1, Math.ceil(others.length / devicesPerPage));
  const pageStart = (currentPage - 1) * devicesPerPage;
  const pageRows = others.slice(pageStart, pageStart + devicesPerPage);

  return (
    <Theme>
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

          {!isLoading && !error && rows.length === 0 && (
            <div className="w3a-access-keys-empty">
              <p>No authenticators found.</p>
            </div>
          )}

          {!error && rows.length > 0 && (
            <>
              <div className="w3a-keys-list">
                {current && (() => {
                  const index = 0;
                  const currentKey = current.nearPublicKey || loginState?.nearPublicKey || null;
                  const isCurrentKey = !!currentKey && loginState?.nearPublicKey === currentKey;
                  const canDelete = !!accessKeyList && accessKeyList.keys.length > 1;
                  const isDeletingThisKey = !!currentKey && deletingKeyPublicKey === currentKey;

                  return (
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
                          {currentKey && (
                            <div
                              className="mono w3a-copyable-key w3a-access-key-current"
                              onClick={(e) => {
                                e.stopPropagation();
                                void copyToClipboard(currentKey, index);
                              }}
                              onMouseEnter={() => setTooltipVisible(index)}
                              onMouseLeave={() => setTooltipVisible(null)}
                              title="Click to copy"
                            >
                              Access Key: {currentKey}
                              {tooltipVisible === index && (
                                <div className="w3a-copy-tooltip">Click to copy</div>
                              )}
                            </div>
                          )}
                        </div>
                        {currentKey && (
                          <div className="w3a-key-status">
                            <button
                              className={`w3a-btn ${isCurrentKey ? 'w3a-btn-primary' : 'w3a-btn-danger'}`}
                              style={{ width: '64px' }}
                              disabled={!canDelete || isDeletingThisKey}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                if (canDelete && !isDeletingThisKey) {
                                  void handleDeleteKey(currentKey);
                                }
                              }}
                            >
                              {isDeletingThisKey ? (
                                <span className="w3a-spinner"/>
                              ) : (
                                'Delete'
                              )}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {pageRows.map((item, i) => {
                  const canDelete = !!accessKeyList && accessKeyList.keys.length > 1;
                  const isDeletingThisKey = !!item.nearPublicKey && deletingKeyPublicKey === item.nearPublicKey;
                  const globalIndex = pageStart + i;
                  const keyIndex = 10 + globalIndex;

                  return (
                    <div key={`other-${item.deviceNumber}-${globalIndex}`} className="w3a-key-item">
                      <div className="w3a-key-content">
                        <div className="w3a-key-details">
                          <div className="w3a-key-header">
                            <div className="mono w3a-device-row">
                              <span className="w3a-device-badge">Device {item.deviceNumber}</span>
                            </div>
                          </div>
                          <div className="mono w3a-registered">Registered: {formatDateTime(item.registered)}</div>
                          {item.nearPublicKey && (
                            <div
                              className="mono w3a-copyable-key"
                              onClick={(e) => {
                                e.stopPropagation();
                                void copyToClipboard(item.nearPublicKey!, keyIndex);
                              }}
                              onMouseEnter={() => setTooltipVisible(keyIndex)}
                              onMouseLeave={() => setTooltipVisible(null)}
                              title="Click to copy"
                            >
                              Access Key: {item.nearPublicKey}
                              {tooltipVisible === keyIndex && (
                                <div className="w3a-copy-tooltip">Click to copy</div>
                              )}
                            </div>
                          )}
                        </div>
                        {item.nearPublicKey && (
                          <div className="w3a-key-status">
                            <button
                              className="w3a-btn w3a-btn-danger"
                              style={{ width: '64px' }}
                              disabled={!canDelete || isDeletingThisKey}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                if (canDelete && !isDeletingThisKey) {
                                  void handleDeleteKey(item.nearPublicKey!);
                                }
                              }}
                            >
                              {isDeletingThisKey ? (
                                <span className="w3a-spinner"/>
                              ) : (
                                'Delete'
                              )}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {totalPages > 1 && (
                <div className="w3a-pagination">
                  <button
                    className="w3a-btn w3a-btn-secondary"
                    disabled={currentPage <= 1}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setCurrentPage((p) => Math.max(1, p - 1));
                    }}
                  >
                    Previous
                  </button>
                  <div className="w3a-pagination-info">
                    Page {currentPage} of {totalPages}
                  </div>
                  <button
                    className="w3a-btn w3a-btn-secondary"
                    disabled={currentPage >= totalPages}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setCurrentPage((p) => Math.min(totalPages, p + 1));
                    }}
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}

          {deleteError && (
            <div className="w3a-access-keys-error">
              <p>{deleteError}</p>
            </div>
          )}
        </div>
      </div>
    </Theme>
  );
};
