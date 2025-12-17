import type { ConfirmationConfig } from '../../../../types/signer-worker';
import type { ConfirmUIHandle, ConfirmUIUpdate } from '../../../LitComponents/confirm-ui';
import type { SecureConfirmDecision, SecureConfirmRequest, TransactionSummary } from '../types';
import type { VRFChallenge } from '../../../../types';
import { sendConfirmResponse } from './common';
import type { ConfirmTxFlowAdapters } from './interfaces';

export function createConfirmSession({
  adapters,
  worker,
  request,
  confirmationConfig,
  transactionSummary,
}: {
  adapters: ConfirmTxFlowAdapters;
  worker: Worker;
  request: SecureConfirmRequest;
  confirmationConfig: ConfirmationConfig;
  transactionSummary: TransactionSummary;
}): {
  setReservedNonces: (nonces?: string[]) => void;
  updateUI: (props: ConfirmUIUpdate) => void;
  promptUser: (args: { vrfChallenge?: Partial<VRFChallenge> }) => Promise<{ confirmed: boolean; error?: string }>;
  /**
   * Send decision back to worker and perform standard cleanup.
   * - On `confirmed: false`, releases any reserved nonces.
   * - Always closes the confirm UI handle when present.
   */
  confirmAndCloseModal: (decision: SecureConfirmDecision) => void;
  /**
   * Cleanup + rethrow helper for invariant failures (e.g. missing PRF outputs),
   * where tests/logic expect no worker response envelope.
   */
  cleanupAndRethrow: (err: unknown) => never;
} {
  let reservedNonces: string[] | undefined;
  let confirmHandle: ConfirmUIHandle | undefined;

  const setReservedNonces = (nonces?: string[]) => {
    reservedNonces = nonces;
  };

  const updateUI = (props: ConfirmUIUpdate) => {
    confirmHandle?.update?.(props);
  };

  const promptUser = async ({ vrfChallenge }: { vrfChallenge?: Partial<VRFChallenge> }) => {
    const { confirmed, confirmHandle: handle, error } = await adapters.ui.renderConfirmUI({
      request,
      confirmationConfig,
      transactionSummary,
      vrfChallenge,
    });
    confirmHandle = handle;
    return { confirmed, error };
  };

  const confirmAndCloseModal = (decision: SecureConfirmDecision) => {
    try {
      sendConfirmResponse(worker, decision);
    } finally {
      if (!decision.confirmed) {
        adapters.near.releaseReservedNonces(reservedNonces);
      }
      adapters.ui.closeModalSafely(!!decision.confirmed, confirmHandle);
    }
  };

  const cleanupAndRethrow = (err: unknown): never => {
    try {
      adapters.near.releaseReservedNonces(reservedNonces);
      adapters.ui.closeModalSafely(false, confirmHandle);
    } finally {
      throw err;
    }
  };

  return {
    setReservedNonces,
    updateUI,
    promptUser,
    confirmAndCloseModal,
    cleanupAndRethrow,
  };
}
