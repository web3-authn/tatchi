import type { VrfWorkerManagerContext } from '../../';
import type { ConfirmationConfig } from '../../../../types/signer-worker';
import {
  SecureConfirmationType,
  TransactionSummary,
  LocalOnlySecureConfirmRequest,
  type ShowSecurePrivateKeyUiPayload,
} from '../types';
import { VRFChallenge } from '../../../../types';
import { createRandomVRFChallenge } from '../../../../types/vrf-worker';
import { addLitCancelListener } from '../../../LitComponents/lit-events';
import { ensureDefined } from '../../../LitComponents/ensure-defined';
import { W3A_EXPORT_VIEWER_IFRAME_ID } from '../../../LitComponents/tags';
import type { ExportViewerIframeElement } from '../../../LitComponents/ExportPrivateKey/iframe-host';
import {
  getNearAccountId,
  getIntentDigest,
  isUserCancelledSecureConfirm,
  ERROR_MESSAGES,
} from './index';
import { errorMessage } from '../../../../../utils/errors';
import { createConfirmSession } from '../adapters/session';
import { createConfirmTxFlowAdapters } from '../adapters/createAdapters';

async function mountExportViewer(
  payload: ShowSecurePrivateKeyUiPayload,
  confirmationConfig: ConfirmationConfig,
): Promise<void> {
  await ensureDefined(W3A_EXPORT_VIEWER_IFRAME_ID, () => import('../../../LitComponents/ExportPrivateKey/iframe-host'));
  const host = document.createElement(W3A_EXPORT_VIEWER_IFRAME_ID) as ExportViewerIframeElement;
  host.theme = payload.theme || confirmationConfig.theme || 'dark';
  host.variant = payload.variant || ((confirmationConfig.uiMode === 'drawer') ? 'drawer' : 'modal');
  host.accountId = payload.nearAccountId;
  host.publicKey = payload.publicKey;
  host.privateKey = payload.privateKey;
  host.loading = false;

  window.parent?.postMessage({ type: 'WALLET_UI_OPENED' }, '*');
  document.body.appendChild(host);

  let removeCancelListener: (() => void) | undefined;
  removeCancelListener = addLitCancelListener(host, () => {
    window.parent?.postMessage({ type: 'WALLET_UI_CLOSED' }, '*');
    removeCancelListener?.();
    host.remove();
  }, { once: true });
}

export async function handleLocalOnlyFlow(
  ctx: VrfWorkerManagerContext,
  request: LocalOnlySecureConfirmRequest,
  worker: Worker,
  opts: { confirmationConfig: ConfirmationConfig; transactionSummary: TransactionSummary },
): Promise<void> {

  const { confirmationConfig, transactionSummary } = opts;
  const adapters = createConfirmTxFlowAdapters(ctx);
  const session = createConfirmSession({
    adapters,
    worker,
    request,
    confirmationConfig,
    transactionSummary,
  });
  const nearAccountId = getNearAccountId(request);

  // SHOW_SECURE_PRIVATE_KEY_UI: purely visual; keep UI open and return confirmed immediately
  if (request.type === SecureConfirmationType.SHOW_SECURE_PRIVATE_KEY_UI) {
    try {
      await mountExportViewer(request.payload as ShowSecurePrivateKeyUiPayload, confirmationConfig);
      // Keep viewer open; do not close here.
      session.confirmAndCloseModal({
        requestId: request.requestId,
        intentDigest: getIntentDigest(request),
        confirmed: true,
      });
      return;
    } catch (err: unknown) {
      return session.confirmAndCloseModal({
        requestId: request.requestId,
        intentDigest: getIntentDigest(request),
        confirmed: false,
        error: errorMessage(err) || 'Failed to render export UI',
      });
    }
  }

  // DECRYPT_PRIVATE_KEY_WITH_PRF: collect an authentication credential (with PRF extension results)
  // and return it to the VRF worker; VRF worker extracts PRF outputs internally.
  if (request.type === SecureConfirmationType.DECRYPT_PRIVATE_KEY_WITH_PRF) {
    const vrfChallenge = createRandomVRFChallenge() as VRFChallenge;
    try {
      const credential = await adapters.webauthn.collectAuthenticationCredentialWithPRF({
        nearAccountId,
        vrfChallenge,
        // Offline export / local decrypt needs both PRF outputs so the VRF worker can
        // recover/derive key material without requiring a pre-existing VRF session.
        includeSecondPrfOutput: true,
      });
      // No modal to keep open; export viewer will be shown by a subsequent request.
      return session.confirmAndCloseModal({
        requestId: request.requestId,
        intentDigest: getIntentDigest(request),
        confirmed: true,
        credential,
      });

    } catch (err: unknown) {
      const cancelled = isUserCancelledSecureConfirm(err);
      if (cancelled) {
        window.parent?.postMessage({ type: 'WALLET_UI_CLOSED' }, '*');
      }
      return session.confirmAndCloseModal({
        requestId: request.requestId,
        intentDigest: getIntentDigest(request),
        confirmed: false,
        error: cancelled ? ERROR_MESSAGES.cancelled : (errorMessage(err) || ERROR_MESSAGES.collectCredentialsFailed),
      });
    }
  }
}
