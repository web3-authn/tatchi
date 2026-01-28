import React, { useEffect, useMemo, useState } from 'react';
import { Theme, useTheme } from '../theme';
import type {
  ExtensionMigrationEvent,
  ExtensionMigrationState,
  ExtensionMigrationStep,
} from '@/core/types/extensionMigration';
import { ExtensionMigrationStatus, ExtensionMigrationStep as Step } from '@/core/types/extensionMigration';
import { useExtensionMigration } from '../../hooks/useExtensionMigration';
import './ExtensionUpgradeModal.css';

interface ExtensionUpgradeModalProps {
  nearAccountId: string;
  isOpen: boolean;
  onClose: () => void;
  cleanupDefaults?: {
    removeOldKey?: boolean;
    wipeWebWallet?: boolean;
    oldPublicKey?: string;
  };
  onEvent?: (event: ExtensionMigrationEvent) => void;
  onError?: (error: Error) => void;
}

type StepDisplayStatus = 'pending' | 'active' | 'complete' | 'error';

const STEP_LABELS: Record<ExtensionMigrationStep, string> = {
  [Step.IDLE]: 'Ready',
  [Step.PRECHECKS]: 'Check extension availability',
  [Step.REGISTER_EXTENSION_CREDENTIAL]: 'Create extension passkey',
  [Step.LINK_ON_CHAIN]: 'Link extension key on-chain',
  [Step.CLEANUP]: 'Finalize & verify extension',
  [Step.COMPLETE]: 'Migration complete',
  [Step.ERROR]: 'Migration error',
};

const STEP_ORDER: ExtensionMigrationStep[] = [
  Step.PRECHECKS,
  Step.REGISTER_EXTENSION_CREDENTIAL,
  Step.LINK_ON_CHAIN,
  Step.CLEANUP,
  Step.COMPLETE,
];

const resolveStepStatus = (
  step: ExtensionMigrationStep,
  state: ExtensionMigrationState,
  lastEvent: ExtensionMigrationEvent | null
): StepDisplayStatus => {
  if (lastEvent?.step === step) {
    if (lastEvent.status === 'progress') return 'active';
    if (lastEvent.status === 'success') return 'complete';
    if (lastEvent.status === 'error') return 'error';
  }

  const stepIndex = STEP_ORDER.indexOf(step);
  const currentIndex = STEP_ORDER.indexOf(state.step);

  if (state.status === ExtensionMigrationStatus.RUNNING) {
    if (stepIndex >= 0 && stepIndex < currentIndex) return 'complete';
    if (stepIndex === currentIndex) return 'active';
    return 'pending';
  }

  if (state.status === ExtensionMigrationStatus.COMPLETED) {
    if (stepIndex >= 0 && stepIndex <= currentIndex) return 'complete';
    return 'pending';
  }

  if (state.status === ExtensionMigrationStatus.ERROR || state.status === ExtensionMigrationStatus.CANCELLED) {
    if (stepIndex >= 0 && stepIndex < currentIndex) return 'complete';
    if (stepIndex === currentIndex) return 'error';
    return 'pending';
  }

  return 'pending';
};

export const ExtensionUpgradeModal: React.FC<ExtensionUpgradeModalProps> = ({
  nearAccountId,
  isOpen,
  onClose,
  cleanupDefaults,
  onEvent,
  onError,
}) => {
  const { theme } = useTheme();
  const [removeOldKey, setRemoveOldKey] = useState(!!cleanupDefaults?.removeOldKey);
  const [wipeWebWallet, setWipeWebWallet] = useState(!!cleanupDefaults?.wipeWebWallet);
  const [confirmCleanup, setConfirmCleanup] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const cleanupSelected = removeOldKey || wipeWebWallet;
  const cleanupConfirmed = !cleanupSelected || confirmCleanup;

  const cleanupOptions = useMemo(() => {
    if (!cleanupSelected) return undefined;
    return {
      removeOldKey,
      wipeWebWallet,
      oldPublicKey: cleanupDefaults?.oldPublicKey,
    };
  }, [cleanupSelected, removeOldKey, wipeWebWallet, cleanupDefaults?.oldPublicKey]);

  const {
    state,
    lastEvent,
    startMigration,
    cancelMigration,
  } = useExtensionMigration({
    cleanup: cleanupOptions,
    onEvent,
    onError,
  });

  useEffect(() => {
    if (!isOpen) return;
    setRemoveOldKey(!!cleanupDefaults?.removeOldKey);
    setWipeWebWallet(!!cleanupDefaults?.wipeWebWallet);
    setConfirmCleanup(false);
    setIsSubmitting(false);
  }, [isOpen, cleanupDefaults?.removeOldKey, cleanupDefaults?.wipeWebWallet]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Esc') {
        e.preventDefault();
        handleClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen]);

  if (!isOpen) return null;

  const isRunning = state.status === ExtensionMigrationStatus.RUNNING;
  const isDone = state.status === ExtensionMigrationStatus.COMPLETED;
  const isError = state.status === ExtensionMigrationStatus.ERROR;
  const statusMessage = lastEvent?.message || state.message;

  const handleStart = async () => {
    if (isRunning || !nearAccountId) return;
    setIsSubmitting(true);
    try {
      await startMigration(nearAccountId);
    } catch {
      // Surface errors through state + event callbacks.
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    cancelMigration('Migration cancelled by user.');
    setIsSubmitting(false);
  };

  const handleClose = () => {
    if (isRunning) {
      cancelMigration('Migration cancelled by user.');
    }
    onClose();
  };

  return (
    <Theme>
      <div
        className={`w3a-extension-upgrade-modal-backdrop theme-${theme}`}
        onClick={handleClose}
        onMouseDown={(e) => e.stopPropagation()}
        onMouseUp={(e) => e.stopPropagation()}
      >
        <div
          className="w3a-extension-upgrade-modal-content"
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onMouseUp={(e) => e.stopPropagation()}
        >
          <div className="w3a-extension-upgrade-modal-header">
            <h2 className="w3a-extension-upgrade-modal-title">Upgrade to Extension</h2>
            <p className="w3a-extension-upgrade-modal-subtitle">
              Move your account to the Chrome extension wallet.
            </p>
          </div>

          <button
            className="w3a-extension-upgrade-modal-close"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleClose();
            }}
          >
            ✕
          </button>

          <div className="w3a-extension-upgrade-steps">
            {STEP_ORDER.map((step) => {
              const status = resolveStepStatus(step, state, lastEvent);
              return (
                <div
                  key={step}
                  className={`w3a-extension-upgrade-step is-${status}`}
                >
                  <div className="w3a-extension-upgrade-step-indicator" />
                  <div className="w3a-extension-upgrade-step-text">
                    <span className="w3a-extension-upgrade-step-label">{STEP_LABELS[step]}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {statusMessage && (
            <div className={`w3a-extension-upgrade-message ${isError ? 'is-error' : ''}`}>
              {statusMessage}
            </div>
          )}

          <div className="w3a-extension-upgrade-cleanup">
            <div className="w3a-extension-upgrade-cleanup-header">
              Optional cleanup
            </div>
            <label className="w3a-extension-upgrade-checkbox">
              <input
                type="checkbox"
                checked={removeOldKey}
                disabled={isRunning}
                onChange={(e) => setRemoveOldKey(e.target.checked)}
              />
              Remove old web-wallet key (best effort)
            </label>
            <label className="w3a-extension-upgrade-checkbox">
              <input
                type="checkbox"
                checked={wipeWebWallet}
                disabled={isRunning}
                onChange={(e) => setWipeWebWallet(e.target.checked)}
              />
              Wipe web-wallet data on this device
            </label>

            {cleanupSelected && (
              <div className="w3a-extension-upgrade-confirm">
                <label className="w3a-extension-upgrade-checkbox confirm">
                  <input
                    type="checkbox"
                    checked={confirmCleanup}
                    disabled={isRunning}
                    onChange={(e) => setConfirmCleanup(e.target.checked)}
                  />
                  I understand this cleanup is permanent
                </label>
              </div>
            )}
          </div>

          <div className="w3a-extension-upgrade-actions">
            {!isDone && (
              <button
                className="w3a-btn w3a-btn-primary"
                disabled={isRunning || isSubmitting || !cleanupConfirmed}
                onClick={handleStart}
              >
                {isRunning ? 'Migrating...' : 'Start migration'}
              </button>
            )}
            {isRunning && (
              <button
                className="w3a-btn w3a-btn-danger"
                onClick={handleCancel}
              >
                Cancel
              </button>
            )}
            {!isRunning && (
              <button
                className="w3a-btn"
                onClick={handleClose}
              >
                {isDone ? 'Done' : 'Close'}
              </button>
            )}
          </div>
        </div>
      </div>
    </Theme>
  );
};
