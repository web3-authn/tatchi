import type { VrfWorkerManagerContext } from '../../';
import type { ConfirmationConfig, ConfirmationUIMode } from '../../../../types/signer-worker';
import type { SecureConfirmRequest, TransactionSummary } from '../types';
import { SecureConfirmationType } from '../types';
import type { VRFChallenge } from '../../../../types';
import { awaitConfirmUIDecision, mountConfirmUI, type ConfirmUIHandle } from '../../../LitComponents/confirm-ui';
import { getNearAccountId, getSignTransactionPayload } from './requestHelpers';
import type { ThemeName } from '../../../../types/tatchi';

export function closeModalSafely(confirmed: boolean, handle?: ConfirmUIHandle) {
  handle?.close?.(confirmed);
}

export async function renderConfirmUI({
  ctx,
  request,
  confirmationConfig,
  transactionSummary,
  vrfChallenge,
  theme,
}: {
  ctx: VrfWorkerManagerContext,
  request: SecureConfirmRequest,
  confirmationConfig: ConfirmationConfig,
  transactionSummary: TransactionSummary,
  vrfChallenge?: Partial<VRFChallenge>;
  theme: ThemeName;
}): Promise<{ confirmed: boolean; confirmHandle?: ConfirmUIHandle; error?: string }> {
  const nearAccountIdForUi = getNearAccountId(request);

  const uiMode = confirmationConfig.uiMode as ConfirmationUIMode;
  const txSigningRequests = request.type === SecureConfirmationType.SIGN_TRANSACTION
    ? getSignTransactionPayload(request).txSigningRequests
    : [];

  const renderDrawerOrModal = async (mode: 'drawer' | 'modal') => {
    if (confirmationConfig.behavior === 'skipClick') {
      const handle = await mountConfirmUI({
        ctx,
        summary: transactionSummary,
        txSigningRequests,
        vrfChallenge,
        loading: true,
        theme,
        uiMode: mode,
        nearAccountIdOverride: nearAccountIdForUi,
      });
      const delay = confirmationConfig.autoProceedDelay ?? 0;
      await new Promise((r) => setTimeout(r, delay));
      return { confirmed: true, confirmHandle: handle } as const;
    }

    const { confirmed, handle, error } = await awaitConfirmUIDecision({
      ctx,
      summary: transactionSummary,
      txSigningRequests,
      vrfChallenge,
      theme,
      uiMode: mode,
      nearAccountIdOverride: nearAccountIdForUi,
    });
    return { confirmed, confirmHandle: handle, error } as const;
  };

  switch (uiMode) {
    case 'none': {
      return { confirmed: true, confirmHandle: undefined };
    }
    case 'drawer': {
      return await renderDrawerOrModal('drawer');
    }
    case 'modal': {
      return await renderDrawerOrModal('modal');
    }
    default: {
      const handle = await mountConfirmUI({
        ctx,
        summary: transactionSummary,
        txSigningRequests,
        vrfChallenge,
        loading: true,
        theme,
        uiMode: 'modal',
        nearAccountIdOverride: nearAccountIdForUi,
      });
      return { confirmed: true, confirmHandle: handle };
    }
  }
}
