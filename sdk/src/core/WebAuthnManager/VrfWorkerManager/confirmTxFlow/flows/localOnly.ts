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
import { __isWalletIframeHostMode } from '../../../../WalletIframe/host-mode';
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
import type { ThemeName } from '../../../../types/tatchi';

async function mountExportViewer(
  payload: ShowSecurePrivateKeyUiPayload,
  confirmationConfig: ConfirmationConfig,
  theme: ThemeName,
): Promise<void> {
  await ensureDefined(W3A_EXPORT_VIEWER_IFRAME_ID, () => import('../../../LitComponents/ExportPrivateKey/iframe-host'));
  const host = document.createElement(W3A_EXPORT_VIEWER_IFRAME_ID) as ExportViewerIframeElement;
  host.theme = payload.theme || theme || 'dark';
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
  opts: { confirmationConfig: ConfirmationConfig; transactionSummary: TransactionSummary; theme: ThemeName },
): Promise<void> {

  const { confirmationConfig, transactionSummary, theme } = opts;
  const adapters = createConfirmTxFlowAdapters(ctx);
  const session = createConfirmSession({
    adapters,
    worker,
    request,
    confirmationConfig,
    transactionSummary,
    theme,
  });
  const nearAccountId = getNearAccountId(request);

  // SHOW_SECURE_PRIVATE_KEY_UI: purely visual; keep UI open and return confirmed immediately
  if (request.type === SecureConfirmationType.SHOW_SECURE_PRIVATE_KEY_UI) {
    try {
      await mountExportViewer(request.payload as ShowSecurePrivateKeyUiPayload, confirmationConfig, theme);
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
    if (__isWalletIframeHostMode()) {
      confirmationConfig.uiMode = 'skip';
      confirmationConfig.behavior = 'autoProceed';
    }

    const vrfChallenge = createRandomVRFChallenge() as VRFChallenge;
    // When this flow is initiated via worker→host messaging (wallet-iframe mode),
    // there is typically no transient user activation. If confirmationConfig chooses
    // a visible UI mode (modal/drawer), prompt first so the click lands inside the
    // wallet iframe and grants activation for the subsequent WebAuthn call.
    if (confirmationConfig.uiMode !== 'skip') {
      // Provide a sensible title/body for non-transaction flows so the confirmer
      // doesn't fall back to "Register with Passkey" (txSigningRequests is empty).
      try {
        const op = (transactionSummary as any)?.operation as string | undefined;
        const warning = (transactionSummary as any)?.warning as string | undefined;
        if (!transactionSummary.title) transactionSummary.title = op || 'Decrypt Private Key';
        if (!transactionSummary.body) {
          transactionSummary.body = warning || 'Confirm to authenticate with your passkey.';
        }
      } catch { }

      const uiVrfChallenge: Partial<VRFChallenge> = (() => {
        try {
          return {
            ...vrfChallenge,
            userId: nearAccountId,
            rpId: adapters.vrf.getRpId(),
          } as Partial<VRFChallenge>;
        } catch {
          return { ...vrfChallenge, userId: nearAccountId } as Partial<VRFChallenge>;
        }
      })();

      const { confirmed, error: uiError } = await session.promptUser({ vrfChallenge: uiVrfChallenge });
      if (!confirmed) {
        window.parent?.postMessage({ type: 'WALLET_UI_CLOSED' }, '*');
        return session.confirmAndCloseModal({
          requestId: request.requestId,
          intentDigest: getIntentDigest(request),
          confirmed: false,
          error: uiError,
        });
      }
    }
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
