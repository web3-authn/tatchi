import type { VrfWorkerManagerContext } from '../../';
import type { ConfirmationConfig, ConfirmationUIMode } from '../../../../types/signer-worker';
import type { SecureConfirmRequest, TransactionSummary } from '../types';
import { SecureConfirmationType } from '../types';
import type { VRFChallenge } from '../../../../types';
import { awaitConfirmUIDecision, mountConfirmUI, type ConfirmUIHandle } from '../../../LitComponents/confirm-ui';
import { getNearAccountId, getSignTransactionPayload } from './requestHelpers';
import type { ThemeName } from '../../../../types/tatchi';
import { isChromeExtensionContext } from '../../../../ExtensionWallet';

export function closeModalSafely(confirmed: boolean, handle?: ConfirmUIHandle) {
  handle?.close?.(confirmed);
}

async function performExtensionPopupConfirm(args: {
  requestId: string;
  uiMode: 'modal' | 'drawer';
  theme: ThemeName;
  nearAccountId: string;
  txSigningRequests: unknown[];
  transactionSummary: TransactionSummary;
  vrfChallenge?: Partial<VRFChallenge>;
}): Promise<{ confirmed: boolean; error?: string }> {
  const chromeAny = (globalThis as any)?.chrome as any;
  const runtime = chromeAny?.runtime;
  if (!runtime?.getURL || !runtime?.sendMessage) {
    throw new Error('Chrome extension runtime not available');
  }

  const brokerRegister = 'W3A_CONFIRM_REGISTER_REQUEST';
  const brokerWait = 'W3A_CONFIRM_WAIT_RESULT';
  const requestId = `confirm:${args.requestId}`;

  await new Promise<void>((resolve, reject) => {
    runtime.sendMessage(
      {
        type: brokerRegister,
        requestId,
        payload: {
          uiMode: args.uiMode,
          theme: args.theme,
          nearAccountId: args.nearAccountId,
          txSigningRequests: args.txSigningRequests,
          transactionSummary: args.transactionSummary,
          vrfChallenge: args.vrfChallenge,
        },
      },
      (resp: any) => {
        const err = runtime.lastError;
        if (err) return reject(new Error(err.message || String(err)));
        if (!resp || resp.ok !== true) return reject(new Error(resp?.error || 'Confirm broker register failed'));
        resolve();
      },
    );
  });

  const popupUrl = runtime.getURL(`wallet-confirm.html?rid=${encodeURIComponent(requestId)}`);
  const w = 520;
  const h = 720;
  const left = Math.max(0, Math.round((window.screen.width / 2) - (w / 2)));
  const top = Math.max(0, Math.round((window.screen.height / 2) - (h / 2)));

  const openedViaChromeWindow = await new Promise<boolean>((resolve) => {
    const create = chromeAny?.windows?.create;
    if (typeof create !== 'function') return resolve(false);
    create({ url: popupUrl, type: 'popup', width: w, height: h, left, top, focused: true }, () => {
      const err = runtime.lastError;
      if (err) return resolve(false);
      resolve(true);
    });
  });
  if (!openedViaChromeWindow) {
    const popup = window.open(
      popupUrl,
      'tatchi-wallet-confirm',
      `width=${w},height=${h},top=${top},left=${left},resizable=yes,scrollbars=no,status=no,toolbar=no,menubar=no,location=no`,
    );
    if (!popup) throw new Error('Extension popup blocked. Please allow popups for this extension.');
  }

  const timeoutMs = 120_000;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await new Promise<any>((resolve) => {
      runtime.sendMessage({ type: brokerWait, requestId }, resolve);
    });
    const err = runtime.lastError;
    if (err) throw new Error(err.message || String(err));
    if (res?.ok && res.payload) {
      const payload = res.payload;
      const confirmed = !!payload?.payload?.confirmed;
      const error = typeof payload?.payload?.error === 'string' ? payload.payload.error : undefined;
      return { confirmed, error };
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('Confirmation popup timed out');
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

  // Extension wallets cannot show sensitive confirmation UX in the embedding page (app origin).
  // For extension-local signing we render the confirmer UI in a top-level extension popup instead.
  if (
    isChromeExtensionContext()
    && uiMode !== 'none'
    && confirmationConfig.behavior !== 'skipClick'
    && (
      request.type === SecureConfirmationType.SIGN_TRANSACTION
      || request.type === SecureConfirmationType.SIGN_NEP413_MESSAGE
    )
  ) {
    try {
      const res = await performExtensionPopupConfirm({
        requestId: request.requestId,
        uiMode: uiMode === 'drawer' ? 'drawer' : 'modal',
        theme,
        nearAccountId: nearAccountIdForUi,
        txSigningRequests,
        transactionSummary,
        vrfChallenge,
      });
      return { confirmed: res.confirmed, confirmHandle: undefined, ...(res.error ? { error: res.error } : {}) };
    } catch (err: unknown) {
      const msg = String((err as any)?.message || err || '');
      return { confirmed: false, confirmHandle: undefined, error: msg || 'Confirmation failed' };
    }
  }

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
