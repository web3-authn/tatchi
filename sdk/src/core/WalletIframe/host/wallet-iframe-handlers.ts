import type {
  ParentToChildEnvelope,
  ParentToChildType,
  ChildToParentEnvelope,
  ProgressPayload,
  PMSignAndSendTxsPayload,
  PMExecuteActionPayload,
  PMStartEmailRecoveryPayload,
  PMFinalizeEmailRecoveryPayload,
  PMStopEmailRecoveryPayload,
} from '../shared/messages';
import type { TatchiPasskey } from '../../TatchiPasskey';
import { OFFLINE_EXPORT_FALLBACK, EXPORT_NEAR_KEYPAIR_CANCELLED, WALLET_UI_CLOSED } from '../../OfflineExport/messages';
import { isTouchIdCancellationError } from '../../../utils/errors';
import type {
  SyncAccountHooksOptions,
  ActionHooksOptions,
  DelegateActionHooksOptions,
  LoginHooksOptions,
  RegistrationHooksOptions,
  SendTransactionHooksOptions,
  SignAndSendTransactionHooksOptions,
  SignNEP413HooksOptions,
  SignTransactionHooksOptions,
} from '../../types/sdkSentEvents';
import type {
  LoginSession,
  RegistrationResult,
} from '../../types/tatchi';
import type {
  DeviceLinkingQRData,
  ScanAndLinkDeviceOptionsDevice1,
} from '../../types/linkDevice';
import type { ConfirmationConfig } from '../../types/signer-worker';
import { toAccountId } from '../../types/accountIds';
import { SignedTransaction } from '../../NearClient';
import { isPlainSignedTransactionLike, extractBorshBytesFromPlainSignedTx, PlainSignedTransactionLike } from '@/utils/validation';
import type { ActionArgs } from '../../types';

type Req<T extends ParentToChildType> = Extract<ParentToChildEnvelope, { type: T }>;
type HandlerMap = { [K in ParentToChildType]: (req: Extract<ParentToChildEnvelope, { type: K }>) => Promise<void> };

export interface HandlerDeps {
  getTatchiPasskey(): TatchiPasskey;
  post(msg: ChildToParentEnvelope): void;
  postProgress(requestId: string | undefined, payload: ProgressPayload): void;
  postToParent?(msg: unknown): void;
  respondIfCancelled(requestId: string | undefined): boolean;
}

export function createWalletIframeHandlers(deps: HandlerDeps): HandlerMap {
  const {
    getTatchiPasskey,
    post,
    postProgress,
    postToParent,
    respondIfCancelled,
  } = deps;

  return {
    PM_LOGIN: async (req: Req<'PM_LOGIN'>) => {
      const pm = getTatchiPasskey();
      const { nearAccountId, options } = req.payload!;
      if (respondIfCancelled(req.requestId)) return;
      const result = await pm.loginAndCreateSession(nearAccountId, {
        ...options,
        onEvent: (ev: ProgressPayload) => postProgress(req.requestId, ev)
      } as LoginHooksOptions);
      if (respondIfCancelled(req.requestId)) return;
      post({ type: 'PM_RESULT', requestId: req.requestId, payload: { ok: true, result } });
    },

    PM_LOGOUT: async (req: Req<'PM_LOGOUT'>) => {
      const pm = getTatchiPasskey();
      await pm.logoutAndClearSession();
      post({ type: 'PM_RESULT', requestId: req.requestId, payload: { ok: true } });
    },

    PM_GET_LOGIN_SESSION: async (req: Req<'PM_GET_LOGIN_SESSION'>) => {
      const pm = getTatchiPasskey();
      const result: LoginSession = await pm.getLoginSession(req.payload?.nearAccountId);
      post({ type: 'PM_RESULT', requestId: req.requestId, payload: { ok: true, result } });
    },

    PM_REGISTER: async (req: Req<'PM_REGISTER'>) => {
      const pm = getTatchiPasskey();
      const { nearAccountId, options, confirmationConfig } = req.payload!;
      if (respondIfCancelled(req.requestId)) return;

      const onEvent = (ev: ProgressPayload) => postProgress(req.requestId, ev);
      const hooksOptions = { ...options, onEvent } as RegistrationHooksOptions;

      const result: RegistrationResult = !confirmationConfig
        ? await pm.registerPasskey(nearAccountId, hooksOptions)
        : await pm.registerPasskeyInternal(nearAccountId, hooksOptions,
            confirmationConfig as unknown as ConfirmationConfig);

      if (respondIfCancelled(req.requestId)) return;
      post({ type: 'PM_RESULT', requestId: req.requestId, payload: { ok: true, result } });
    },

    PM_ENROLL_THRESHOLD_ED25519_KEY: async (req: Req<'PM_ENROLL_THRESHOLD_ED25519_KEY'>) => {
      const pm = getTatchiPasskey();
      const { nearAccountId, options } = req.payload!;
      if (respondIfCancelled(req.requestId)) return;

      const result = await pm.enrollThresholdEd25519Key(nearAccountId, options);
      if (respondIfCancelled(req.requestId)) return;
      post({ type: 'PM_RESULT', requestId: req.requestId, payload: { ok: true, result } });
    },

    PM_ROTATE_THRESHOLD_ED25519_KEY: async (req: Req<'PM_ROTATE_THRESHOLD_ED25519_KEY'>) => {
      const pm = getTatchiPasskey();
      const { nearAccountId, options } = req.payload!;
      if (respondIfCancelled(req.requestId)) return;

      const result = await pm.rotateThresholdEd25519Key(nearAccountId, options);
      if (respondIfCancelled(req.requestId)) return;
      post({ type: 'PM_RESULT', requestId: req.requestId, payload: { ok: true, result } });
    },

    PM_SIGN_TXS_WITH_ACTIONS: async (req: Req<'PM_SIGN_TXS_WITH_ACTIONS'>) => {
      const pm = getTatchiPasskey();
      const { nearAccountId, transactions, options } = req.payload!;

      const results = await pm.signTransactionsWithActions({
        nearAccountId,
        transactions: transactions,
        options: {
          ...(options || {}),
          onEvent: (ev: ProgressPayload) => postProgress(req.requestId, ev),
        } as SignTransactionHooksOptions,
      });

      if (respondIfCancelled(req.requestId)) return;
      post({ type: 'PM_RESULT', requestId: req.requestId, payload: { ok: true, result: results } });
    },

    PM_SIGN_AND_SEND_TXS: async (req: Req<'PM_SIGN_AND_SEND_TXS'>) => {
      const pm = getTatchiPasskey();
      const { nearAccountId, transactions, options } = req.payload || {};

      const results = await pm.signAndSendTransactions({
        nearAccountId: nearAccountId as string,
        transactions: transactions || [],
        options: {
          ...options,
          onEvent: (ev: ProgressPayload) => postProgress(req.requestId, ev)
        } as SignAndSendTransactionHooksOptions,
      });

      if (respondIfCancelled(req.requestId)) return;
      post({ type: 'PM_RESULT', requestId: req.requestId, payload: { ok: true, result: results } });
    },

    PM_LINK_DEVICE_WITH_SCANNED_QR_DATA: async (req: Req<'PM_LINK_DEVICE_WITH_SCANNED_QR_DATA'>) => {
      const pm = getTatchiPasskey();
      const { qrData, fundingAmount, options } = req.payload || {};
      if (respondIfCancelled(req.requestId)) return;

      const result = await pm.linkDeviceWithScannedQRData(qrData as DeviceLinkingQRData, {
        fundingAmount: fundingAmount as string,
        onEvent: (ev: ProgressPayload) => postProgress(req.requestId, ev),
        confirmationConfig: options?.confirmationConfig,
        confirmerText: options?.confirmerText,
      } as ScanAndLinkDeviceOptionsDevice1);

      if (respondIfCancelled(req.requestId)) return;
      post({ type: 'PM_RESULT', requestId: req.requestId, payload: { ok: true, result } });
    },

    PM_START_DEVICE2_LINKING_FLOW: async (req: Req<'PM_START_DEVICE2_LINKING_FLOW'>) => {
      const pm = getTatchiPasskey();
      if (respondIfCancelled(req.requestId)) return;

      const { ui, cameraId, options } = req.payload || {};
      const { qrData, qrCodeDataURL } = await pm.startDevice2LinkingFlow({
        ui,
        cameraId,
        options: {
          onEvent: (ev: ProgressPayload) => postProgress(req.requestId, ev),
          confirmationConfig: options?.confirmationConfig,
          confirmerText: options?.confirmerText,
        },
      });

      if (respondIfCancelled(req.requestId)) return;
      post({ type: 'PM_RESULT', requestId: req.requestId, payload: { ok: true, result: { flowId: req.requestId, qrData, qrCodeDataURL } } });
    },

    PM_STOP_DEVICE2_LINKING_FLOW: async (req: Req<'PM_STOP_DEVICE2_LINKING_FLOW'>) => {
      const pm = getTatchiPasskey();
      try { await pm.stopDevice2LinkingFlow(); } catch (err) { console.error(err) }
      post({ type: 'PM_RESULT', requestId: req.requestId, payload: { ok: true } });
    },

    PM_SEND_TRANSACTION: async (req: Req<'PM_SEND_TRANSACTION'>) => {
      const pm = getTatchiPasskey();
      const { signedTransaction, options } = req.payload || {};
      let st = signedTransaction;
      const plainCandidate = st;
      if (plainCandidate && isPlainSignedTransactionLike(plainCandidate)) {
        try {
          const borsh = extractBorshBytesFromPlainSignedTx(plainCandidate);
          st = SignedTransaction.fromPlain({ transaction: plainCandidate.transaction, signature: plainCandidate.signature, borsh_bytes: borsh });
        } catch {
          // If conversion fails, pass through original value
        }
      }
      const result = await pm.sendTransaction({
        signedTransaction: st as SignedTransaction,
        options: {
          ...(options || {}),
          onEvent: (ev: ProgressPayload) => postProgress(req.requestId, ev)
        } as SendTransactionHooksOptions,
      });

      if (respondIfCancelled(req.requestId)) return;
      post({ type: 'PM_RESULT', requestId: req.requestId, payload: { ok: true, result } });
    },

    PM_EXECUTE_ACTION: async (req: Req<'PM_EXECUTE_ACTION'>) => {
      const pm = getTatchiPasskey();
      const { nearAccountId, receiverId, actionArgs, options } = (req.payload || ({} as Partial<PMExecuteActionPayload>));
      const result = await pm.executeAction({
        nearAccountId: nearAccountId as string,
        receiverId: receiverId as string,
        actionArgs: (actionArgs as ActionArgs | ActionArgs[])!,
        options: {
          ...(options || {}),
          onEvent: (ev: ProgressPayload) => postProgress(req.requestId, ev)
        } as ActionHooksOptions,
      });
      if (respondIfCancelled(req.requestId)) return;
      post({ type: 'PM_RESULT', requestId: req.requestId, payload: { ok: true, result } });
    },

    PM_SIGN_DELEGATE_ACTION: async (req: Req<'PM_SIGN_DELEGATE_ACTION'>) => {
      const pm = getTatchiPasskey();
      const { nearAccountId, delegate, options } = req.payload!;
      const result = await pm.signDelegateAction({
        nearAccountId: nearAccountId,
        delegate,
        options: {
          ...(options || {}),
          onEvent: (ev: ProgressPayload) => postProgress(req.requestId, ev),
        } as DelegateActionHooksOptions,
      });
      if (respondIfCancelled(req.requestId)) return;
      post({ type: 'PM_RESULT', requestId: req.requestId, payload: { ok: true, result } });
    },

    PM_SIGN_NEP413: async (req: Req<'PM_SIGN_NEP413'>) => {
      const pm = getTatchiPasskey();
      const { nearAccountId, params, options } = req.payload!;
      const result = await pm.signNEP413Message({
        nearAccountId,
        params,
        options: {
          ...options,
          onEvent: (ev: ProgressPayload) => postProgress(req.requestId, ev)
        } as SignNEP413HooksOptions,
      });
      if (respondIfCancelled(req.requestId)) return;
      post({ type: 'PM_RESULT', requestId: req.requestId, payload: { ok: true, result } });
    },

    PM_EXPORT_NEAR_KEYPAIR_UI: async (req: Req<'PM_EXPORT_NEAR_KEYPAIR_UI'>) => {
      const pm = getTatchiPasskey();
      const { nearAccountId, variant, theme } = req.payload!;
      if (pm.exportNearKeypairWithUI) {
        void pm.exportNearKeypairWithUI(nearAccountId, { variant, theme })
          .catch((err: unknown) => {
            // User cancelled TouchID/FaceID prompt: close UI and emit a cancellation hint
            // for parent UIs, without triggering offline-export fallback.
            if (isTouchIdCancellationError(err)) {
              postToParent?.({ type: EXPORT_NEAR_KEYPAIR_CANCELLED, nearAccountId });
              postToParent?.({ type: WALLET_UI_CLOSED });
              return;
            }
            postToParent?.({ type: OFFLINE_EXPORT_FALLBACK, error: String((err as any)?.message || err || '') });
            postToParent?.({ type: WALLET_UI_CLOSED });
          });
      }
      post({ type: 'PM_RESULT', requestId: req.requestId, payload: { ok: true } });
    },

    PM_GET_RECENT_LOGINS: async (req: Req<'PM_GET_RECENT_LOGINS'>) => {
      const pm = getTatchiPasskey();
      const result = await pm.getRecentLogins();
      post({ type: 'PM_RESULT', requestId: req.requestId, payload: { ok: true, result } });
    },

    PM_PREFETCH_BLOCKHEIGHT: async (req: Req<'PM_PREFETCH_BLOCKHEIGHT'>) => {
      const pm = getTatchiPasskey();
      await pm.prefetchBlockheight().catch(() => undefined);
      post({ type: 'PM_RESULT', requestId: req.requestId, payload: { ok: true } });
    },

    PM_SET_DERIVED_ADDRESS: async (req: Req<'PM_SET_DERIVED_ADDRESS'>) => {
      const pm = getTatchiPasskey();
      const { nearAccountId, args } = req.payload!;
      if (respondIfCancelled(req.requestId)) return;
      await pm.setDerivedAddress(nearAccountId, args);
      if (respondIfCancelled(req.requestId)) return;
      post({ type: 'PM_RESULT', requestId: req.requestId, payload: { ok: true } });
    },

    PM_GET_DERIVED_ADDRESS_RECORD: async (req: Req<'PM_GET_DERIVED_ADDRESS_RECORD'>) => {
      const pm = getTatchiPasskey();
      const { nearAccountId, args } = req.payload!;
      if (respondIfCancelled(req.requestId)) return;
      const result = await pm.getDerivedAddressRecord(nearAccountId, args);
      if (respondIfCancelled(req.requestId)) return;
      post({ type: 'PM_RESULT', requestId: req.requestId, payload: { ok: true, result } });
    },

    PM_GET_DERIVED_ADDRESS: async (req: Req<'PM_GET_DERIVED_ADDRESS'>) => {
      const pm = getTatchiPasskey();
      const { nearAccountId, args } = req.payload!;
      if (respondIfCancelled(req.requestId)) return;
      const result = await pm.getDerivedAddress(nearAccountId, args);
      if (respondIfCancelled(req.requestId)) return;
      post({ type: 'PM_RESULT', requestId: req.requestId, payload: { ok: true, result } });
    },

    PM_GET_RECOVERY_EMAILS: async (req: Req<'PM_GET_RECOVERY_EMAILS'>) => {
      const pm = getTatchiPasskey();
      const { nearAccountId } = req.payload!;
      if (respondIfCancelled(req.requestId)) return;
      const result = await pm.getRecoveryEmails(nearAccountId);
      if (respondIfCancelled(req.requestId)) return;
      post({ type: 'PM_RESULT', requestId: req.requestId, payload: { ok: true, result } });
    },

    PM_SET_RECOVERY_EMAILS: async (req: Req<'PM_SET_RECOVERY_EMAILS'>) => {
      const pm = getTatchiPasskey();
      const { nearAccountId, recoveryEmails, options } = req.payload!;
      if (respondIfCancelled(req.requestId)) return;
      const result = await pm.setRecoveryEmails(nearAccountId, recoveryEmails, {
        ...(options || {}),
        onEvent: (ev: ProgressPayload) => postProgress(req.requestId, ev),
      } as ActionHooksOptions);
      if (respondIfCancelled(req.requestId)) return;
      post({ type: 'PM_RESULT', requestId: req.requestId, payload: { ok: true, result } });
    },

    PM_SET_CONFIRM_BEHAVIOR: async (req: Req<'PM_SET_CONFIRM_BEHAVIOR'>) => {
      const pm = getTatchiPasskey();
      const { behavior } = req.payload!;
      pm.setConfirmBehavior(behavior);
      post({ type: 'PM_RESULT', requestId: req.requestId, payload: { ok: true } });
    },

    PM_SET_CONFIRMATION_CONFIG: async (req: Req<'PM_SET_CONFIRMATION_CONFIG'>) => {
      const pm = getTatchiPasskey();
      const { nearAccountId } = (req.payload || {});
      const incoming = (req.payload?.config || {}) as Record<string, unknown>;
      let patch: Record<string, unknown> = { ...incoming };
      if (nearAccountId) {
        await pm.getLoginSession(nearAccountId)
          .then(({ login }) => {
            const existing = (login?.userData?.preferences?.confirmationConfig || {}) as Record<string, unknown>;
            patch = { ...existing, ...incoming };
          })
          .catch(() => undefined);
      }
      const base: ConfirmationConfig = pm.getConfirmationConfig();
      pm.setConfirmationConfig({ ...base, ...patch });
      post({ type: 'PM_RESULT', requestId: req.requestId, payload: { ok: true } });
    },

    PM_GET_CONFIRMATION_CONFIG: async (req: Req<'PM_GET_CONFIRMATION_CONFIG'>) => {
      const pm = getTatchiPasskey();
      const result = pm.getConfirmationConfig();
      post({ type: 'PM_RESULT', requestId: req.requestId, payload: { ok: true, result } });
    },

    PM_SET_SIGNER_MODE: async (req: Req<'PM_SET_SIGNER_MODE'>) => {
      const pm = getTatchiPasskey();
      const { signerMode } = req.payload!;
      try {
        pm.setSignerMode(signerMode);
      } catch {}
      post({ type: 'PM_RESULT', requestId: req.requestId, payload: { ok: true } });
    },

    PM_GET_SIGNER_MODE: async (req: Req<'PM_GET_SIGNER_MODE'>) => {
      const pm = getTatchiPasskey();
      const result = pm.getSignerMode();
      post({ type: 'PM_RESULT', requestId: req.requestId, payload: { ok: true, result } });
    },

    PM_SET_THEME: async (req: Req<'PM_SET_THEME'>) => {
      const pm = getTatchiPasskey();
      const { theme } = req.payload!;
      try { pm.setTheme(theme); } catch {}
      try {
        if (theme === 'light' || theme === 'dark') {
          document.documentElement.setAttribute('data-w3a-theme', theme);
        }
      } catch {}
      post({ type: 'PM_RESULT', requestId: req.requestId, payload: { ok: true } });
    },

    PM_HAS_PASSKEY: async (req: Req<'PM_HAS_PASSKEY'>) => {
      const pm = getTatchiPasskey();
      const { nearAccountId } = req.payload!;
      // Soft probe to warm caches in some environments (optional)
      const ctx = pm.getContext();
      const web = ctx?.webAuthnManager;
      if (web) {
        await web.getLastUser().catch(() => undefined);
        await web.getAuthenticatorsByUser(toAccountId(nearAccountId)).catch(() => undefined);
      }
      const result = await pm.hasPasskeyCredential(toAccountId(nearAccountId));
      post({ type: 'PM_RESULT', requestId: req.requestId, payload: { ok: true, result } });
    },

    PM_VIEW_ACCESS_KEYS: async (req: Req<'PM_VIEW_ACCESS_KEYS'>) => {
      const pm = getTatchiPasskey();
      const { accountId } = req.payload!;
      const result = await pm.viewAccessKeyList(accountId);
      post({ type: 'PM_RESULT', requestId: req.requestId, payload: { ok: true, result } });
    },

    PM_DELETE_DEVICE_KEY: async (req: Req<'PM_DELETE_DEVICE_KEY'>) => {
      const pm = getTatchiPasskey();
      const { accountId, publicKeyToDelete, options } = req.payload!;
      const result = await pm.deleteDeviceKey(accountId, publicKeyToDelete, {
        ...(options || {}),
        onEvent: (ev: ProgressPayload) => postProgress(req.requestId, ev),
      } as ActionHooksOptions);
      if (respondIfCancelled(req.requestId)) return;
      post({ type: 'PM_RESULT', requestId: req.requestId, payload: { ok: true, result } });
    },

    PM_SYNC_ACCOUNT_FLOW: async (req: Req<'PM_SYNC_ACCOUNT_FLOW'>) => {
      const pm = getTatchiPasskey();
      const { accountId } = (req.payload || {});
      if (respondIfCancelled(req.requestId)) return;
      const result = await pm.syncAccount({
        accountId,
        options: { onEvent: (ev: ProgressPayload) => postProgress(req.requestId, ev) } as SyncAccountHooksOptions,
      });
      if (respondIfCancelled(req.requestId)) return;
      post({ type: 'PM_RESULT', requestId: req.requestId, payload: { ok: true, result } });
    },
    PM_START_EMAIL_RECOVERY: async (req: Req<'PM_START_EMAIL_RECOVERY'>) => {
      const pm = getTatchiPasskey();
      const { accountId, options } = (req.payload as PMStartEmailRecoveryPayload);
      if (respondIfCancelled(req.requestId)) return;
      const result = await pm.startEmailRecovery({
        accountId,
        options: {
          onEvent: (ev: ProgressPayload) => postProgress(req.requestId, ev),
          confirmerText: options?.confirmerText,
          confirmationConfig: options?.confirmationConfig,
        },
      });
      if (respondIfCancelled(req.requestId)) return;
      post({ type: 'PM_RESULT', requestId: req.requestId, payload: { ok: true, result } });
    },
    PM_FINALIZE_EMAIL_RECOVERY: async (req: Req<'PM_FINALIZE_EMAIL_RECOVERY'>) => {
      const pm = getTatchiPasskey();
      const { accountId, nearPublicKey } = (req.payload as PMFinalizeEmailRecoveryPayload);
      if (respondIfCancelled(req.requestId)) return;
      await pm.finalizeEmailRecovery({
        accountId,
        nearPublicKey,
        options: {
          onEvent: (ev: ProgressPayload) => postProgress(req.requestId, ev)
        },
      });
      if (respondIfCancelled(req.requestId)) return;
      post({ type: 'PM_RESULT', requestId: req.requestId, payload: { ok: true } });
    },

    PM_STOP_EMAIL_RECOVERY: async (req: Req<'PM_STOP_EMAIL_RECOVERY'>) => {
      const pm = getTatchiPasskey();
      const { accountId, nearPublicKey } = (req.payload || {}) as PMStopEmailRecoveryPayload;
      try {
        const maybeCancel = pm.cancelEmailRecovery;
        if (typeof maybeCancel === 'function') {
          await maybeCancel.call(pm, { accountId, nearPublicKey });
        }
      } catch {}
      post({ type: 'PM_RESULT', requestId: req.requestId, payload: { ok: true } });
    },
  } as unknown as HandlerMap;
}
