import type {
  ParentToChildEnvelope,
  ParentToChildType,
  ChildToParentEnvelope,
  ProgressPayload,
  PMSignAndSendTxsPayload,
  PMExecuteActionPayload,
} from '../shared/messages';
import type {
  PasskeyManager,
  PasskeyManagerContext,
  RecoveryResult
} from '../../PasskeyManager';
import type { PasskeyManagerIframe } from '../PasskeyManagerIframe';
import { errorMessage } from '../../../utils/errors';
import type {
  RegistrationHooksOptions,
  RegistrationResult,
  LoginHooksOptions,
  ActionHooksOptions,
  SignAndSendTransactionHooksOptions,
  SendTransactionHooksOptions,
  BaseHooksOptions,
  AccountRecoveryHooksOptions,
  LoginResult,
  LoginState,
  VerifyAndSignTransactionResult,
  ActionResult,
  GetRecentLoginsResult,
} from '../../types/passkeyManager';
import type {
  DeviceLinkingQRData,
  ScanAndLinkDeviceOptionsDevice1,
  LinkDeviceResult,
  StartDevice2LinkingFlowResults
} from '../../types/linkDevice';
import type { ConfirmationConfig } from '../../types/signer-worker';
import { toAccountId } from '../../types/accountIds';
import { SignedTransaction, type AccessKeyList } from '../../NearClient';
import type { SignNEP413MessageResult } from '../../PasskeyManager/signNEP413';
import { isPlainSignedTransactionLike, extractBorshBytesFromPlainSignedTx } from '../validation';
import type { TransactionInput, ActionArgs } from '../../types';

type Req<T extends ParentToChildType> = Extract<ParentToChildEnvelope, { type: T }>;
type HandlerMap = { [K in ParentToChildType]: (req: Extract<ParentToChildEnvelope, { type: K }>) => Promise<void> };

export interface HandlerDeps {
  getPasskeyManager(): PasskeyManager | PasskeyManagerIframe;
  ensurePasskeyManager(): void;
  post(msg: ChildToParentEnvelope): void;
  postProgress(requestId: string | undefined, payload: ProgressPayload): void;
  postToParent?(msg: unknown): void;
  respondIfCancelled(requestId: string | undefined): boolean;
}

interface PM {
  loginPasskey(nearAccountId: string, options?: LoginHooksOptions): Promise<LoginResult>;
  logoutAndClearVrfSession(): Promise<void>;
  getLoginState(nearAccountId?: string): Promise<LoginState>;
  registerPasskey(nearAccountId: string, options?: RegistrationHooksOptions): Promise<RegistrationResult>;
  registerPasskeyInternal?(id: string, opts?: RegistrationHooksOptions, cfg?: ConfirmationConfig): Promise<RegistrationResult>;
  signTransactionsWithActions(args: { nearAccountId: string; transactions: TransactionInput[]; options?: ActionHooksOptions }): Promise<VerifyAndSignTransactionResult[]>;
  signAndSendTransactions(args: { nearAccountId: string; transactions: TransactionInput[]; options?: SignAndSendTransactionHooksOptions }): Promise<ActionResult[]>;
  linkDeviceWithScannedQRData(qrData: DeviceLinkingQRData, options: ScanAndLinkDeviceOptionsDevice1): Promise<LinkDeviceResult>;
  startDevice2LinkingFlow(args: { accountId?: string; onEvent?: (ev: ProgressPayload) => void }): Promise<StartDevice2LinkingFlowResults>;
  stopDevice2LinkingFlow(): Promise<void>;
  sendTransaction(args: { signedTransaction: SignedTransaction; options?: SendTransactionHooksOptions }): Promise<ActionResult>;
  executeAction(args: { nearAccountId: string; receiverId: string; actionArgs: ActionArgs | ActionArgs[]; options?: ActionHooksOptions }): Promise<ActionResult>;
  signNEP413Message(args: { nearAccountId: string; params: { message: string; recipient: string; state?: string }; options?: BaseHooksOptions }): Promise<SignNEP413MessageResult>;
  exportNearKeypairWithUI?(accountId: string, opts: { variant?: 'modal' | 'drawer'; theme?: 'dark' | 'light' }): Promise<void>;
  getRecentLogins(): Promise<GetRecentLoginsResult>;
  prefetchBlockheight(): Promise<void>;
  setConfirmBehavior(b: 'requireClick' | 'autoProceed'): void;
  setConfirmationConfig(cfg: ConfirmationConfig): void;
  getConfirmationConfig(): ConfirmationConfig;
  setUserTheme(theme: 'dark' | 'light'): void;
  hasPasskeyCredential(accountId: string): Promise<boolean>;
  viewAccessKeyList(accountId: string): Promise<AccessKeyList>;
  deleteDeviceKey(accountId: string, pk: string, options: ActionHooksOptions): Promise<ActionResult>;
  recoverAccountFlow(args: { accountId?: string; options: AccountRecoveryHooksOptions }): Promise<RecoveryResult>;
  getContext?(): PasskeyManagerContext;
}

export function createWalletIframeHandlers(deps: HandlerDeps): HandlerMap {
  const {
    getPasskeyManager,
    ensurePasskeyManager,
    post,
    postProgress,
    postToParent,
    respondIfCancelled,
  } = deps;

  return {
    PM_LOGIN: async (req: Req<'PM_LOGIN'>) => {
      const pm = getPasskeyManager() as PM;
      const { nearAccountId, options } = req.payload!;
      if (respondIfCancelled(req.requestId)) return;
      const result = await pm.loginPasskey(nearAccountId, {
        ...options,
        onEvent: (ev: ProgressPayload) => postProgress(req.requestId, ev)
      } as LoginHooksOptions);
      if (respondIfCancelled(req.requestId)) return;
      post({ type: 'PM_RESULT', requestId: req.requestId, payload: { ok: true, result } });
    },

    PM_LOGOUT: async (req: Req<'PM_LOGOUT'>) => {
      const pm = getPasskeyManager() as PM;
      await pm.logoutAndClearVrfSession();
      post({ type: 'PM_RESULT', requestId: req.requestId, payload: { ok: true } });
    },

    PM_GET_LOGIN_STATE: async (req: Req<'PM_GET_LOGIN_STATE'>) => {
      const pm = getPasskeyManager() as PM;
      const state = await pm.getLoginState(req.payload?.nearAccountId);
      post({ type: 'PM_RESULT', requestId: req.requestId, payload: { ok: true, result: state } });
    },

    PM_REGISTER: async (req: Req<'PM_REGISTER'>) => {
      const pm = getPasskeyManager() as PM;
      const { nearAccountId, options, confirmationConfig } = req.payload!;
      if (respondIfCancelled(req.requestId)) return;
      const result: RegistrationResult = confirmationConfig && typeof pm.registerPasskeyInternal === 'function'
        ? await pm.registerPasskeyInternal!(nearAccountId, {
            ...options,
            onEvent: (ev: ProgressPayload) => postProgress(req.requestId, ev)
          } as RegistrationHooksOptions, confirmationConfig as unknown as ConfirmationConfig)
        : await pm.registerPasskey(nearAccountId, {
            ...options,
            onEvent: (ev: ProgressPayload) => postProgress(req.requestId, ev)
          } as RegistrationHooksOptions);
      if (respondIfCancelled(req.requestId)) return;
      post({ type: 'PM_RESULT', requestId: req.requestId, payload: { ok: true, result } });
    },

    PM_SIGN_TXS_WITH_ACTIONS: async (req: Req<'PM_SIGN_TXS_WITH_ACTIONS'>) => {
      const pm = getPasskeyManager() as PM;
      const { nearAccountId, transactions, options } = req.payload!;
      const results = await pm.signTransactionsWithActions({
        nearAccountId,
        transactions: transactions as TransactionInput[],
        options: {
          ...options,
          onEvent: (ev: ProgressPayload) => postProgress(req.requestId, ev)
        } as ActionHooksOptions,
      });
      if (respondIfCancelled(req.requestId)) return;
      post({ type: 'PM_RESULT', requestId: req.requestId, payload: { ok: true, result: results } });
    },

    PM_SIGN_AND_SEND_TXS: async (req: Req<'PM_SIGN_AND_SEND_TXS'>) => {
      const pm = getPasskeyManager() as PM;
      const { nearAccountId, transactions, options } = (req.payload || ({} as Partial<PMSignAndSendTxsPayload>));
      const results = await pm.signAndSendTransactions({
        nearAccountId: nearAccountId as string,
        transactions: (transactions as TransactionInput[]) || [],
        options: {
          ...options,
          onEvent: (ev: ProgressPayload) => postProgress(req.requestId, ev)
        } as SignAndSendTransactionHooksOptions,
      });
      if (respondIfCancelled(req.requestId)) return;
      post({ type: 'PM_RESULT', requestId: req.requestId, payload: { ok: true, result: results } });
    },

    PM_LINK_DEVICE_WITH_SCANNED_QR_DATA: async (req: Req<'PM_LINK_DEVICE_WITH_SCANNED_QR_DATA'>) => {
      const pm = getPasskeyManager() as PM;
      const { qrData, fundingAmount } = (req.payload || ({} as { qrData?: DeviceLinkingQRData; fundingAmount?: string }));
      if (respondIfCancelled(req.requestId)) return;
      const result = await pm.linkDeviceWithScannedQRData(qrData as DeviceLinkingQRData, {
        fundingAmount: fundingAmount as string,
        onEvent: (ev: ProgressPayload) => postProgress(req.requestId, ev)
      } as ScanAndLinkDeviceOptionsDevice1);
      if (respondIfCancelled(req.requestId)) return;
      post({ type: 'PM_RESULT', requestId: req.requestId, payload: { ok: true, result } });
    },

    PM_START_DEVICE2_LINKING_FLOW: async (req: Req<'PM_START_DEVICE2_LINKING_FLOW'>) => {
      const pm = getPasskeyManager() as PM;
      const { accountId } = (req.payload || {});
      try {
        if (respondIfCancelled(req.requestId)) return;
        const { qrData, qrCodeDataURL } = await pm.startDevice2LinkingFlow({
          accountId,
          onEvent: (ev: ProgressPayload) => { try { postProgress(req.requestId, ev); } catch {} },
        });
        if (respondIfCancelled(req.requestId)) return;
        post({ type: 'PM_RESULT', requestId: req.requestId, payload: { ok: true, result: { flowId: req.requestId, qrData, qrCodeDataURL } } });
      } catch (e: unknown) {
        post({ type: 'ERROR', requestId: req.requestId, payload: { code: 'LINK_DEVICE_INIT_FAILED', message: errorMessage(e) } });
      }
    },

    PM_STOP_DEVICE2_LINKING_FLOW: async (req: Req<'PM_STOP_DEVICE2_LINKING_FLOW'>) => {
      try {
        const pm = getPasskeyManager() as PM;
        await pm.stopDevice2LinkingFlow();
      } catch {}
      post({ type: 'PM_RESULT', requestId: req.requestId, payload: { ok: true } });
    },

    PM_SEND_TRANSACTION: async (req: Req<'PM_SEND_TRANSACTION'>) => {
      const pm = getPasskeyManager() as PM;
      const { signedTransaction, options } = (req.payload || {} as { signedTransaction?: unknown; options?: SendTransactionHooksOptions });
      let st: SignedTransaction | unknown = signedTransaction;
      try {
        if (isPlainSignedTransactionLike(st)) {
          const s = st as { transaction: unknown; signature: unknown };
          st = SignedTransaction.fromPlain({
            transaction: s.transaction,
            signature: s.signature,
            borsh_bytes: extractBorshBytesFromPlainSignedTx(st as Parameters<typeof extractBorshBytesFromPlainSignedTx>[0]),
          });
        }
      } catch {}
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
      const pm = getPasskeyManager() as PM;
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

    PM_SIGN_NEP413: async (req: Req<'PM_SIGN_NEP413'>) => {
      const pm = getPasskeyManager() as PM;
      const { nearAccountId, params, options } = req.payload!;
      const result = await pm.signNEP413Message({
        nearAccountId,
        params,
        options: {
          ...options,
          onEvent: (ev: ProgressPayload) => postProgress(req.requestId, ev)
        } as BaseHooksOptions,
      });
      if (respondIfCancelled(req.requestId)) return;
      post({ type: 'PM_RESULT', requestId: req.requestId, payload: { ok: true, result } });
    },

    PM_EXPORT_NEAR_KEYPAIR: async (req: Req<'PM_EXPORT_NEAR_KEYPAIR'>) => {
      post({
        type: 'ERROR',
        requestId: req.requestId,
        payload: {
          code: 'EXPORT_NEAR_KEYPAIR_DISABLED',
          message: 'Direct key export to the parent is disabled. Use PM_EXPORT_NEAR_KEYPAIR_UI instead.'
        }
      });
    },

    PM_EXPORT_NEAR_KEYPAIR_UI: async (req: Req<'PM_EXPORT_NEAR_KEYPAIR_UI'>) => {
      const pm = getPasskeyManager() as PM;
      const { nearAccountId, variant, theme } = req.payload!;
      try {
        if (pm.exportNearKeypairWithUI) {
          void pm
            .exportNearKeypairWithUI(nearAccountId, { variant, theme })
            .catch((_err: unknown) => { try { postToParent?.({ type: 'WALLET_UI_CLOSED' }); } catch {} });
        }
        post({ type: 'PM_RESULT', requestId: req.requestId, payload: { ok: true } });
      } catch (e: unknown) {
        try { postToParent?.({ type: 'WALLET_UI_CLOSED' }); } catch {}
        post({
          type: 'ERROR',
          requestId: req.requestId,
          payload: { code: 'EXPORT_NEAR_KEYPAIR_UI_FAILED', message: errorMessage(e) }
        });
      }
    },

    PM_GET_RECENT_LOGINS: async (req: Req<'PM_GET_RECENT_LOGINS'>) => {
      const pm = getPasskeyManager() as PM;
      const result = await pm.getRecentLogins();
      post({ type: 'PM_RESULT', requestId: req.requestId, payload: { ok: true, result } });
    },

    PM_PREFETCH_BLOCKHEIGHT: async (req: Req<'PM_PREFETCH_BLOCKHEIGHT'>) => {
      const pm = getPasskeyManager() as PM;
      try { await pm.prefetchBlockheight(); } catch {}
      post({ type: 'PM_RESULT', requestId: req.requestId, payload: { ok: true } });
    },

    PM_SET_CONFIRM_BEHAVIOR: async (req: Req<'PM_SET_CONFIRM_BEHAVIOR'>) => {
      const pm = getPasskeyManager() as PM;
      const { behavior } = req.payload!;
      try {
        pm.setConfirmBehavior(behavior);
        post({ type: 'PM_RESULT', requestId: req.requestId, payload: { ok: true } });
      } catch (e: unknown) {
        post({
          type: 'ERROR',
          requestId: req.requestId,
          payload: { code: 'SET_CONFIRM_BEHAVIOR_FAILED', message: errorMessage(e) }
        });
      }
    },

    PM_SET_CONFIRMATION_CONFIG: async (req: Req<'PM_SET_CONFIRMATION_CONFIG'>) => {
      const pm = getPasskeyManager() as PM;
      const { nearAccountId } = (req.payload || {});
      try {
        const incoming = (req.payload?.config || {}) as Record<string, unknown>;
        let patch: Record<string, unknown> = { ...incoming };
        if (nearAccountId) {
          try {
            const loginState = await pm.getLoginState(nearAccountId);
            const existing = (loginState?.userData?.preferences?.confirmationConfig || {}) as Record<string, unknown>;
            patch = { ...existing, ...incoming };
          } catch {}
        }
        const base: ConfirmationConfig = pm.getConfirmationConfig();
        // Normalize at callsite if available; otherwise set directly
        if (typeof pm.setConfirmationConfig === 'function') {
          pm.setConfirmationConfig({ ...base, ...patch });
        }
        post({ type: 'PM_RESULT', requestId: req.requestId, payload: { ok: true } });
      } catch (e: unknown) {
        post({
          type: 'ERROR',
          requestId: req.requestId,
          payload: { code: 'SET_CONFIRMATION_CONFIG_FAILED', message: errorMessage(e) }
        });
      }
    },

    PM_GET_CONFIRMATION_CONFIG: async (req: Req<'PM_GET_CONFIRMATION_CONFIG'>) => {
      const pm = getPasskeyManager() as PM;
      const result = pm.getConfirmationConfig();
      post({ type: 'PM_RESULT', requestId: req.requestId, payload: { ok: true, result } });
    },

    PM_SET_THEME: async (req: Req<'PM_SET_THEME'>) => {
      const pm = getPasskeyManager() as PM;
      const { theme } = req.payload!;
      pm.setUserTheme(theme);
      post({ type: 'PM_RESULT', requestId: req.requestId, payload: { ok: true } });
    },

    PM_HAS_PASSKEY: async (req: Req<'PM_HAS_PASSKEY'>) => {
      const pm = getPasskeyManager() as PM;
      const { nearAccountId } = req.payload!;
      try {
        // Soft probe to warm caches in some environments (optional)
        const ctx = (pm.getContext?.() as any) || {};
        const web = ctx?.webAuthnManager;
        if (web) {
          try { await web.getUser(toAccountId(nearAccountId)); } catch {}
          try { await web.getAuthenticatorsByUser(toAccountId(nearAccountId)); } catch {}
        }
      } catch {}
      const result = await pm.hasPasskeyCredential(toAccountId(nearAccountId));
      post({ type: 'PM_RESULT', requestId: req.requestId, payload: { ok: true, result } });
    },

    PM_VIEW_ACCESS_KEYS: async (req: Req<'PM_VIEW_ACCESS_KEYS'>) => {
      const pm = getPasskeyManager() as PM;
      const { accountId } = req.payload!;
      const result = await pm.viewAccessKeyList(accountId);
      post({ type: 'PM_RESULT', requestId: req.requestId, payload: { ok: true, result } });
    },

    PM_DELETE_DEVICE_KEY: async (req: Req<'PM_DELETE_DEVICE_KEY'>) => {
      const pm = getPasskeyManager() as PM;
      const { accountId, publicKeyToDelete } = req.payload!;
      const result = await pm.deleteDeviceKey(accountId, publicKeyToDelete, {
        onEvent: (ev: ProgressPayload) => postProgress(req.requestId, ev)
      } as ActionHooksOptions);
      if (respondIfCancelled(req.requestId)) return;
      post({ type: 'PM_RESULT', requestId: req.requestId, payload: { ok: true, result } });
    },

    PM_RECOVER_ACCOUNT_FLOW: async (req: Req<'PM_RECOVER_ACCOUNT_FLOW'>) => {
      const pm = getPasskeyManager() as PM;
      const { accountId } = (req.payload || {});
      try {
        if (respondIfCancelled(req.requestId)) return;
        const result = await pm.recoverAccountFlow({
          accountId,
          options: { onEvent: (ev: ProgressPayload) => postProgress(req.requestId, ev) } as AccountRecoveryHooksOptions,
        });
        if (respondIfCancelled(req.requestId)) return;
        post({ type: 'PM_RESULT', requestId: req.requestId, payload: { ok: true, result } });
      } catch (e: unknown) {
        post({ type: 'ERROR', requestId: req.requestId, payload: { code: 'RECOVERY_FAILED', message: errorMessage(e) } });
      }
    },
  } as HandlerMap;
}
