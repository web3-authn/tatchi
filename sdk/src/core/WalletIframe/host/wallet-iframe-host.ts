
/**
 * Wallet Iframe Host - Host-Side Execution Layer
 *
 * This is the main service host that runs inside the wallet iframe. It receives
 * messages from the parent application and executes the actual PasskeyManager
 * operations in a secure, isolated environment.
 *
 * Key Responsibilities:
 * - Message Handling: Receives and processes messages from parent via MessagePort
 * - PasskeyManager Management: Creates and manages the real PasskeyManager instance
 * - Operation Execution: Executes wallet operations (register, login, sign, etc.)
 * - Progress Broadcasting: Sends progress events back to parent during operations
 * - UI Component Management: Handles mounting/unmounting of Lit-based UI components
 * - Configuration Management: Applies configuration from parent to PasskeyManager
 * - Error Handling: Converts errors to appropriate message format for parent
 *
 * Architecture:
 * - Uses MessagePort for bidirectional communication with parent
 * - Maintains PasskeyManager instance with iframe-specific configuration
 * - Integrates with LitElemMounter for UI component management
 * - Handles request cancellation and cleanup
 * - Provides fallback behavior for missing configurations
 *
 * Security Model:
 * - Runs in isolated iframe origin with proper WebAuthn permissions
 * - Validates all incoming messages and payloads
 * - Prevents nested iframe mode to avoid security issues
 * - Uses proper rpId configuration for WebAuthn operations
 *
 * Message Protocol:
 * - Handles PM_* message types for PasskeyManager operations
 * - Sends PROGRESS messages for real-time updates
 * - Sends PM_RESULT for successful completions
 * - Sends ERROR messages for failures
 * - Supports request cancellation via PM_CANCEL
 */
try { (globalThis as unknown as { global?: unknown }).global = (globalThis as unknown as { global?: unknown }).global || (globalThis as unknown); } catch {}
try { (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process || { env: {} }; } catch {}
try {
  if (window.location.origin === 'null') {
    console.warn('[WalletHost] iframe is running with opaque (null) origin. Check COEP/CORP headers and ensure navigation succeeded.');
  }
} catch {}
try { applyTransparentIframeSurface(); } catch {}
try { postToParent({ type: 'SERVICE_HOST_BOOTED' }); } catch {}
try { postToParent({ type: 'SERVICE_HOST_DEBUG_ORIGIN', origin: window.location.origin, href: window.location.href }); } catch {}
// Establish a default embedded assets base as soon as this module loads.
// This points to the directory containing this file (e.g., '/sdk/').
try {
  const here = new URL('.', import.meta.url).toString();
  const norm = here.endsWith('/') ? here : (here + '/');
  const w = window as unknown as { __W3A_EMBEDDED_BASE__?: string };
  if (!w.__W3A_EMBEDDED_BASE__) w.__W3A_EMBEDDED_BASE__ = norm;
} catch {}
try {
  window.addEventListener('click', (e) => {
    try {
      const t = e.target as HTMLElement;
      const name = t?.tagName?.toLowerCase() || 'unknown';
      const cls = t?.className || '';
      postToParent({ type: 'SERVICE_HOST_CLICK', name, cls });
    } catch {}
  }, true);
} catch {}

import type {
  ParentToChildEnvelope,
  ParentToChildType,
  ChildToParentEnvelope,
  ReadyPayload,
  PMSetConfigPayload,
  PMCancelPayload,
  PMRegisterPayload,
  PMLoginPayload,
  PMSignTxsPayload,
  PMSignAndSendTxsPayload,
  PMSendTxPayload,
  PMExecuteActionPayload,
  PMSignNep413Payload,
  PMExportNearKeypairUiPayload,
  PMSetConfirmBehaviorPayload,
  PMSetConfirmationConfigPayload,
  PMGetLoginStatePayload,
  PMSetThemePayload,
  PMHasPasskeyPayload,
  PMViewAccessKeysPayload,
  PMDeleteDeviceKeyPayload,
} from '../shared/messages';
import { CONFIRM_UI_ELEMENT_SELECTORS } from '../../WebAuthnManager/LitComponents/tags';
import { MinimalNearClient, SignedTransaction } from '../../NearClient';
import { setupLitElemMounter } from './iframe-lit-elem-mounter';
import type { PasskeyManagerConfigs } from '../../types/passkeyManager';
import { isObject, isString, isNumber, isFiniteNumber, isPlainSignedTransactionLike, extractBorshBytesFromPlainSignedTx } from '../validation';
import { errorMessage } from '../../../utils/errors';
import { PasskeyManager } from '../../PasskeyManager';
import { PasskeyManagerIframe } from '../PasskeyManagerIframe';
import type { DeviceLinkingQRData } from '../../types/linkDevice';
import type { ProgressPayload } from '../shared/messages';
import type { ConfirmationConfig } from '../../types/signer-worker';
import { WalletIframeDomEvents } from '../events';
import type {
  RegistrationHooksOptions,
  RegistrationResult,
  LoginHooksOptions,
  ActionHooksOptions,
  SignAndSendTransactionHooksOptions,
  SendTransactionHooksOptions,
  BaseHooksOptions,
  AccountRecoveryHooksOptions,
} from '../../types/passkeyManager';
import type { ScanAndLinkDeviceOptionsDevice1 } from '../../types/linkDevice';
import { toAccountId } from '../../types/accountIds';

const PROTOCOL: ReadyPayload['protocolVersion'] = '1.0.0';

let port: MessagePort | null = null;
let walletConfigs: PasskeyManagerConfigs | null = null;
let nearClient: MinimalNearClient | null = null;
let passkeyManager: PasskeyManagerIframe | PasskeyManager | null = null;
let themeUnsubscribe: (() => void) | null = null;
let parentOrigin: string | null = null;
// Track request-level cancellations
const cancelledRequests = new Set<string>();
function markCancelled(rid?: string) { if (rid) cancelledRequests.add(rid); }
function isCancelled(rid?: string) { return !!rid && cancelledRequests.has(rid); }
function clearCancelled(rid?: string) { if (rid) cancelledRequests.delete(rid); }

function postProgress(requestId: string | undefined, payload: ProgressPayload): void {
  if (!requestId) return;
  post({ type: 'PROGRESS', requestId, payload });
}

function emitCancellationPayload(requestId: string | undefined): void {
  if (!requestId) return;
  postProgress(requestId, { step: 0, phase: 'cancelled', status: 'error', message: 'Cancelled by user' });
  post({ type: 'ERROR', requestId, payload: { code: 'CANCELLED', message: 'Request cancelled' } });
}

function respondIfCancelled(requestId: string | undefined): boolean {
  if (!requestId || !isCancelled(requestId)) return false;
  emitCancellationPayload(requestId);
  clearCancelled(requestId);
  return true;
}

type HandlerMap = {
  [K in ParentToChildType]?: (req: Extract<ParentToChildEnvelope, { type: K }>) => Promise<void>;
};

async function handleLoginRequest(req: Extract<ParentToChildEnvelope, { type: 'PM_LOGIN' }>): Promise<void> {
  const pm = getPasskeyManager();
  const { nearAccountId, options } = req.payload as PMLoginPayload;

  if (respondIfCancelled(req.requestId)) return;

  const result = await pm.loginPasskey(nearAccountId, {
    ...options,
    onEvent: (ev: ProgressPayload) => postProgress(req.requestId, ev)
  } as LoginHooksOptions);

  if (respondIfCancelled(req.requestId)) return;
  post({ type: 'PM_RESULT', requestId: req.requestId, payload: { ok: true, result } });
}

async function handleLogoutRequest(req: Extract<ParentToChildEnvelope, { type: 'PM_LOGOUT' }>): Promise<void> {
  const pm = getPasskeyManager();
  await pm.logoutAndClearVrfSession();
  post({ type: 'PM_RESULT', requestId: req.requestId, payload: { ok: true } });
}

async function handleGetLoginState(req: Extract<ParentToChildEnvelope, { type: 'PM_GET_LOGIN_STATE' }>): Promise<void> {
  const pm = getPasskeyManager();
  const payload = req.payload as PMGetLoginStatePayload | undefined;
  const state = await pm.getLoginState(payload?.nearAccountId);
  post({ type: 'PM_RESULT', requestId: req.requestId, payload: { ok: true, result: state } });
}

async function handleRegisterRequest(req: Extract<ParentToChildEnvelope, { type: 'PM_REGISTER' }>): Promise<void> {
  const pm = getPasskeyManager();
  const { nearAccountId, options, confirmationConfig } = req.payload as PMRegisterPayload & { confirmationConfig?: import('../../types/signer-worker').ConfirmationConfig };

  if (respondIfCancelled(req.requestId)) return;

  // Prefer one-time override when provided
  const anyPm = pm as unknown as {
    registerPasskeyInternal?: (id: string, opts?: RegistrationHooksOptions, cfg?: import('../../types/signer-worker').ConfirmationConfig) => Promise<RegistrationResult>;
    registerPasskey: (id: string, opts?: RegistrationHooksOptions) => Promise<RegistrationResult>;
  };
  const result = confirmationConfig && typeof anyPm.registerPasskeyInternal === 'function'
    ? await anyPm.registerPasskeyInternal(nearAccountId, {
        ...options,
        onEvent: (ev: ProgressPayload) => postProgress(req.requestId, ev)
      } as RegistrationHooksOptions, confirmationConfig)
    : await pm.registerPasskey(nearAccountId, {
        ...options,
        onEvent: (ev: ProgressPayload) => postProgress(req.requestId, ev)
      } as RegistrationHooksOptions);

  if (respondIfCancelled(req.requestId)) return;
  post({ type: 'PM_RESULT', requestId: req.requestId, payload: { ok: true, result } });
}

async function handleSignTxsWithActions(req: Extract<ParentToChildEnvelope, { type: 'PM_SIGN_TXS_WITH_ACTIONS' }>): Promise<void> {
  const pm = getPasskeyManager();
  const { nearAccountId, transactions, options } = req.payload as PMSignTxsPayload;

  const results = await pm.signTransactionsWithActions({
    nearAccountId,
    transactions,
    options: {
      ...options,
      onEvent: (ev: ProgressPayload) => postProgress(req.requestId, ev)
    } as ActionHooksOptions,
  });

  if (respondIfCancelled(req.requestId)) return;
  post({ type: 'PM_RESULT', requestId: req.requestId, payload: { ok: true, result: results } });
}

async function handleSignAndSendTxs(req: Extract<ParentToChildEnvelope, { type: 'PM_SIGN_AND_SEND_TXS' }>): Promise<void> {
  const pm = getPasskeyManager();
  const { nearAccountId, transactions, options } = (req.payload || {}) as PMSignAndSendTxsPayload;

  const results = await pm.signAndSendTransactions({
    nearAccountId,
    transactions,
    options: {
      ...options,
      onEvent: (ev: ProgressPayload) => postProgress(req.requestId, ev)
    } as SignAndSendTransactionHooksOptions,
  });

  if (respondIfCancelled(req.requestId)) return;
  post({ type: 'PM_RESULT', requestId: req.requestId, payload: { ok: true, result: results } });
}

async function handleLinkDeviceWithScannedQrData(req: Extract<ParentToChildEnvelope, { type: 'PM_LINK_DEVICE_WITH_SCANNED_QR_DATA' }>): Promise<void> {
  const pm = getPasskeyManager();
  const { qrData, fundingAmount } = (req.payload || {}) as { qrData: DeviceLinkingQRData; fundingAmount: string };

  if (respondIfCancelled(req.requestId)) return;

  const result = await pm.linkDeviceWithScannedQRData(qrData, {
    fundingAmount,
    onEvent: (ev: ProgressPayload) => postProgress(req.requestId, ev)
  } as ScanAndLinkDeviceOptionsDevice1);

  if (respondIfCancelled(req.requestId)) return;
  post({ type: 'PM_RESULT', requestId: req.requestId, payload: { ok: true, result } });
}

async function handleStartDevice2LinkingFlow(req: Extract<ParentToChildEnvelope, { type: 'PM_START_DEVICE2_LINKING_FLOW' }>): Promise<void> {
  const pm = getPasskeyManager();
  const { accountId } = (req.payload || {}) as { accountId?: string };

  try {
    if (respondIfCancelled(req.requestId)) return;

    const { qrData, qrCodeDataURL } = await pm.startDevice2LinkingFlow({
      accountId,
      onEvent: (ev: ProgressPayload) => {
        try { postProgress(req.requestId, ev); } catch {}
      },
    });

    if (respondIfCancelled(req.requestId)) return;

    post({
      type: 'PM_RESULT',
      requestId: req.requestId,
      payload: { ok: true, result: { flowId: req.requestId, qrData, qrCodeDataURL } }
    });
  } catch (e: unknown) {
    post({ type: 'ERROR', requestId: req.requestId, payload: { code: 'LINK_DEVICE_INIT_FAILED', message: errorMessage(e) } });
  }
}

async function handleStopDevice2LinkingFlow(req: Extract<ParentToChildEnvelope, { type: 'PM_STOP_DEVICE2_LINKING_FLOW' }>): Promise<void> {
  try {
    const pm = getPasskeyManager();
    await pm.stopDevice2LinkingFlow();
  } catch {}
  post({ type: 'PM_RESULT', requestId: req.requestId, payload: { ok: true } });
}

async function handleSendTransaction(req: Extract<ParentToChildEnvelope, { type: 'PM_SEND_TRANSACTION' }>): Promise<void> {
  const pm = getPasskeyManager();
  const { signedTransaction, options } = (req.payload || {}) as PMSendTxPayload & { options?: Record<string, unknown> };

  let st: SignedTransaction | unknown = signedTransaction;
  const isPlainSignedTransaction = isPlainSignedTransactionLike;
  try {
    if (isPlainSignedTransaction(st)) {
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
}

async function handleExecuteAction(req: Extract<ParentToChildEnvelope, { type: 'PM_EXECUTE_ACTION' }>): Promise<void> {
  const pm = getPasskeyManager();
  const { nearAccountId, receiverId, actionArgs, options } = (req.payload || {}) as PMExecuteActionPayload & { options?: Record<string, unknown> };

  const result = await pm.executeAction({
    nearAccountId,
    receiverId,
    actionArgs,
    options: {
      ...(options || {}),
      onEvent: (ev: ProgressPayload) => postProgress(req.requestId, ev)
    } as ActionHooksOptions,
  });

  if (respondIfCancelled(req.requestId)) return;
  post({ type: 'PM_RESULT', requestId: req.requestId, payload: { ok: true, result } });
}

async function handleSignNep413(req: Extract<ParentToChildEnvelope, { type: 'PM_SIGN_NEP413' }>): Promise<void> {
  const pm = getPasskeyManager();
  const { nearAccountId, params, options } = (req.payload || {}) as PMSignNep413Payload;

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
}

async function handleExportNearKeypair(req: Extract<ParentToChildEnvelope, { type: 'PM_EXPORT_NEAR_KEYPAIR' }>): Promise<void> {
  post({
    type: 'ERROR',
    requestId: req.requestId,
    payload: {
      code: 'EXPORT_NEAR_KEYPAIR_DISABLED',
      message: 'Direct key export to the parent is disabled. Use PM_EXPORT_NEAR_KEYPAIR_UI instead.'
    }
  });
}

async function handleExportNearKeypairUi(req: Extract<ParentToChildEnvelope, { type: 'PM_EXPORT_NEAR_KEYPAIR_UI' }>): Promise<void> {
  const pm = getPasskeyManager();
  const { nearAccountId, variant, theme } = (req.payload || {}) as PMExportNearKeypairUiPayload;

  try {
    void (pm as unknown as { exportNearKeypairWithUI: (accountId: string, opts: { variant?: 'modal' | 'drawer'; theme?: 'dark' | 'light' }) => Promise<void> })
      .exportNearKeypairWithUI(nearAccountId, { variant, theme })
      .catch((err: unknown) => {
        try { postToParent({ type: 'WALLET_UI_CLOSED' }); } catch {}
        console.warn('[WalletHost] exportNearKeypairWithUI rejected early:', err);
      });
    post({ type: 'PM_RESULT', requestId: req.requestId, payload: { ok: true } });
  } catch (e: unknown) {
    try { postToParent({ type: 'WALLET_UI_CLOSED' }); } catch {}
    post({ type: 'ERROR', requestId: req.requestId, payload: { code: 'EXPORT_NEAR_KEYPAIR_UI_FAILED', message: errorMessage(e) } });
  }
}

async function handleGetRecentLogins(req: Extract<ParentToChildEnvelope, { type: 'PM_GET_RECENT_LOGINS' }>): Promise<void> {
  const pm = getPasskeyManager();
  const result = await pm.getRecentLogins();
  post({ type: 'PM_RESULT', requestId: req.requestId, payload: { ok: true, result } });
}

async function handlePrefetchBlockheight(req: Extract<ParentToChildEnvelope, { type: 'PM_PREFETCH_BLOCKHEIGHT' }>): Promise<void> {
  const pm = getPasskeyManager();
  await pm.prefetchBlockheight();
  post({ type: 'PM_RESULT', requestId: req.requestId, payload: { ok: true } });
}

async function handleSetConfirmBehavior(req: Extract<ParentToChildEnvelope, { type: 'PM_SET_CONFIRM_BEHAVIOR' }>): Promise<void> {
  const pm = getPasskeyManager();
  const { behavior, nearAccountId } = (req.payload || {}) as PMSetConfirmBehaviorPayload;
  try {
    if (nearAccountId) {
      try { await pm.getLoginState(nearAccountId); } catch {}
    }
    pm.setConfirmBehavior(behavior);
    post({ type: 'PM_RESULT', requestId: req.requestId, payload: { ok: true } });
  } catch (e: unknown) {
    post({ type: 'ERROR', requestId: req.requestId, payload: { code: 'SET_CONFIRM_BEHAVIOR_FAILED', message: errorMessage(e) } });
  }
}

async function handleSetConfirmationConfig(req: Extract<ParentToChildEnvelope, { type: 'PM_SET_CONFIRMATION_CONFIG' }>): Promise<void> {
  const pm = getPasskeyManager();
  const { nearAccountId } = (req.payload || {}) as PMSetConfirmationConfigPayload & { nearAccountId?: string };

  try {
    const incoming = (req.payload as PMSetConfirmationConfigPayload).config || ({} as Record<string, unknown>);
    let patch: Record<string, unknown> = { ...incoming };
    if (nearAccountId) {
      const loginState = await pm.getLoginState(nearAccountId);
      const existing = (loginState?.userData?.preferences?.confirmationConfig || {}) as Record<string, unknown>;
      patch = { ...existing, ...incoming };
    }
    const base: ConfirmationConfig = pm.getConfirmationConfig();
    const normalized: ConfirmationConfig = normalizeConfirmationConfig(base, patch);
    pm.setConfirmationConfig(normalized);
    post({ type: 'PM_RESULT', requestId: req.requestId, payload: { ok: true } });
  } catch (e: unknown) {
    post({ type: 'ERROR', requestId: req.requestId, payload: { code: 'SET_CONFIRMATION_CONFIG_FAILED', message: errorMessage(e) } });
  }
}

async function handleGetConfirmationConfig(req: Extract<ParentToChildEnvelope, { type: 'PM_GET_CONFIRMATION_CONFIG' }>): Promise<void> {
  const pm = getPasskeyManager();
  const result = pm.getConfirmationConfig();
  post({ type: 'PM_RESULT', requestId: req.requestId, payload: { ok: true, result } });
}

async function handleSetTheme(req: Extract<ParentToChildEnvelope, { type: 'PM_SET_THEME' }>): Promise<void> {
  const pm = getPasskeyManager();
  const { theme } = (req.payload || {}) as PMSetThemePayload;
  pm.setUserTheme(theme);
  post({ type: 'PM_RESULT', requestId: req.requestId, payload: { ok: true } });
}

async function handleHasPasskey(req: Extract<ParentToChildEnvelope, { type: 'PM_HAS_PASSKEY' }>): Promise<void> {
  const pm = getPasskeyManager();
  const { nearAccountId } = (req.payload || {}) as PMHasPasskeyPayload;

  try {
    const ctx = (pm as unknown as { getContext?: () => { webAuthnManager?: { getUser: (id: string) => Promise<unknown>; getAuthenticatorsByUser: (id: string) => Promise<unknown[]> } } })?.getContext?.();
    const web = ctx?.webAuthnManager;
    if (web) {
      let user: unknown = null;
      let auths: unknown[] = [];
      try { user = await web.getUser(toAccountId(nearAccountId)); } catch {}
      try { auths = await web.getAuthenticatorsByUser(toAccountId(nearAccountId)); } catch {}
      void user;
      void auths;
    }
  } catch {}

  const result = await pm.hasPasskeyCredential(toAccountId(nearAccountId));
  post({ type: 'PM_RESULT', requestId: req.requestId, payload: { ok: true, result } });
}

async function handleViewAccessKeys(req: Extract<ParentToChildEnvelope, { type: 'PM_VIEW_ACCESS_KEYS' }>): Promise<void> {
  const pm = getPasskeyManager();
  const { accountId } = (req.payload || {}) as PMViewAccessKeysPayload;
  const result = await pm.viewAccessKeyList(accountId);
  post({ type: 'PM_RESULT', requestId: req.requestId, payload: { ok: true, result } });
}

async function handleDeleteDeviceKey(req: Extract<ParentToChildEnvelope, { type: 'PM_DELETE_DEVICE_KEY' }>): Promise<void> {
  const pm = getPasskeyManager();
  const { accountId, publicKeyToDelete } = (req.payload || {}) as PMDeleteDeviceKeyPayload;

  const result = await pm.deleteDeviceKey(accountId, publicKeyToDelete, {
    onEvent: (ev: ProgressPayload) => postProgress(req.requestId, ev)
  } as ActionHooksOptions);

  if (respondIfCancelled(req.requestId)) return;
  post({ type: 'PM_RESULT', requestId: req.requestId, payload: { ok: true, result } });
}

async function handleRecoverAccountFlow(req: Extract<ParentToChildEnvelope, { type: 'PM_RECOVER_ACCOUNT_FLOW' }>): Promise<void> {
  const pm = getPasskeyManager();
  const { accountId } = (req.payload || {}) as { accountId?: string };

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
}

const requestHandlers: HandlerMap = {
  PM_LOGIN: handleLoginRequest,
  PM_LOGOUT: handleLogoutRequest,
  PM_GET_LOGIN_STATE: handleGetLoginState,
  PM_REGISTER: handleRegisterRequest,
  PM_SIGN_TXS_WITH_ACTIONS: handleSignTxsWithActions,
  PM_SIGN_AND_SEND_TXS: handleSignAndSendTxs,
  PM_LINK_DEVICE_WITH_SCANNED_QR_DATA: handleLinkDeviceWithScannedQrData,
  PM_START_DEVICE2_LINKING_FLOW: handleStartDevice2LinkingFlow,
  PM_STOP_DEVICE2_LINKING_FLOW: handleStopDevice2LinkingFlow,
  PM_SEND_TRANSACTION: handleSendTransaction,
  PM_EXECUTE_ACTION: handleExecuteAction,
  PM_SIGN_NEP413: handleSignNep413,
  PM_EXPORT_NEAR_KEYPAIR: handleExportNearKeypair,
  PM_EXPORT_NEAR_KEYPAIR_UI: handleExportNearKeypairUi,
  PM_GET_RECENT_LOGINS: handleGetRecentLogins,
  PM_PREFETCH_BLOCKHEIGHT: handlePrefetchBlockheight,
  PM_SET_CONFIRM_BEHAVIOR: handleSetConfirmBehavior,
  PM_SET_CONFIRMATION_CONFIG: handleSetConfirmationConfig,
  PM_GET_CONFIRMATION_CONFIG: handleGetConfirmationConfig,
  PM_SET_THEME: handleSetTheme,
  PM_HAS_PASSKEY: handleHasPasskey,
  PM_VIEW_ACCESS_KEYS: handleViewAccessKeys,
  PM_DELETE_DEVICE_KEY: handleDeleteDeviceKey,
  PM_RECOVER_ACCOUNT_FLOW: handleRecoverAccountFlow,
};

function ensurePasskeyManager(): void {
  if (!walletConfigs || !walletConfigs.nearRpcUrl) {
    throw new Error('Wallet service not configured. Call PM_SET_CONFIG first.');
  }
  if (!walletConfigs.contractId) {
    throw new Error('Wallet service misconfigured: contractId is required.');
  }
  if (!nearClient) nearClient = new MinimalNearClient(walletConfigs.nearRpcUrl);
  if (!passkeyManager) {
    // IMPORTANT: The wallet host must not consider itself an iframe client.
    // Clear walletOrigin/servicePath so SignerWorkerManager does NOT enable nested iframe mode.

    const cfg = {
      ...walletConfigs,
      iframeWallet: {
        ...(walletConfigs?.iframeWallet || {}),
        walletOrigin: undefined,
        walletServicePath: undefined,
        // Rely on rpIdOverride provided by the parent (if any).
        rpIdOverride: walletConfigs?.iframeWallet?.rpIdOverride,
        isWalletIframeHost: true,
      },
    } as PasskeyManagerConfigs;
    passkeyManager = new PasskeyManager(cfg, nearClient);
    // Warm critical resources (Signer/VRF workers, IndexedDB) on the wallet origin.
    // Non-blocking and safe to call without account context.
    try {
      const pmAny = passkeyManager as unknown as { warmCriticalResources?: () => Promise<void> };
      if (pmAny?.warmCriticalResources) void pmAny.warmCriticalResources();
    } catch {}
    // Bridge theme changes to the host document so embedded UIs can react via CSS
    try {
      const up = passkeyManager.userPreferences;
      // Set initial theme attribute
      try { document.documentElement.setAttribute('data-w3a-theme', up.getUserTheme()); } catch {}
      // Deduplicate subscription on reconfigurations
      try { themeUnsubscribe?.(); } catch {}
      themeUnsubscribe = up.onThemeChange((t) => {
        try { document.documentElement.setAttribute('data-w3a-theme', t); } catch {}
      });
    } catch {}
  }
}

function getPasskeyManager(): PasskeyManager | PasskeyManagerIframe {
  ensurePasskeyManager();
  return passkeyManager!;
}

function post(msg: ChildToParentEnvelope) {
  port?.postMessage(msg);
}

function postToParent(message: unknown): void {
  const parentWindow = window.parent;
  if (!parentWindow) return;
  // If the first CONNECT arrived while this document still had an opaque
  // ('null') origin, MessageEvent.origin can be the literal string 'null'.
  // Do not lock onto that value; target '*' until a concrete origin is known.
  const target = (parentOrigin && parentOrigin !== 'null') ? parentOrigin : '*';
  parentWindow.postMessage(message, target);
}

// Lightweight cross-origin control channel for small embedded UI surfaces (e.g., tx button).
// This channel uses window.postMessage directly (not MessagePort) so that a standalone
// iframe can instruct this host to render a clickable control that performs WebAuthn
// operations within the same browsing context (satisfying user activation requirements).
(() => {
  setupLitElemMounter({
    ensurePasskeyManager,
    getPasskeyManager: () => passkeyManager,
    updateWalletConfigs: (patch) => {
      walletConfigs = { ...walletConfigs, ...patch } as PasskeyManagerConfigs;
    },
    postToParent,
  });
})();

/**
 * Main message handler for iframe communication
 * This function receives all messages from the parent application and routes them
 * to the appropriate PasskeyManager operations.
 */
async function onPortMessage(e: MessageEvent<ParentToChildEnvelope>) {
  const req = e.data as ParentToChildEnvelope;
  if (!req || !isObject(req)) return;
  const requestId = req.requestId;

  // Handle ping/pong for connection health checks
  if (req.type === 'PING') {
    // Initialize PasskeyManager and prewarm workers on wallet origin (non-blocking)
    try {
      ensurePasskeyManager();
      const pmAny = passkeyManager as unknown as { warmCriticalResources?: () => Promise<void> };
      if (pmAny?.warmCriticalResources) void pmAny.warmCriticalResources();
    } catch {}
    post({ type: 'PONG', requestId });
    return;
  }

  // Handle configuration updates from parent
  if (req.type === 'PM_SET_CONFIG') {
    const payload = req.payload as PMSetConfigPayload;
    // try { console.debug('[WalletHost] PM_SET_CONFIG received', { rpIdOverride: payload?.rpIdOverride, walletOrigin: (payload as any)?.walletOrigin, parentOrigin }); } catch {}
    walletConfigs = {
      nearRpcUrl: payload?.nearRpcUrl || walletConfigs?.nearRpcUrl || '',
      nearNetwork: payload?.nearNetwork || walletConfigs?.nearNetwork || 'testnet',
      // Accept both legacy `contractId` and canonical `contractId`
      contractId: (payload as any)?.contractId
        || (payload as any)?.contractId
        || walletConfigs?.contractId
        || '',
      nearExplorerUrl: walletConfigs?.nearExplorerUrl,
      relayer: payload?.relayer || walletConfigs?.relayer,
      authenticatorOptions: payload?.authenticatorOptions || walletConfigs?.authenticatorOptions,
      vrfWorkerConfigs: payload?.vrfWorkerConfigs || walletConfigs?.vrfWorkerConfigs,
      walletTheme: payload?.theme || walletConfigs?.walletTheme,
      iframeWallet: {
        ...(walletConfigs?.iframeWallet || {}),
        walletOrigin: undefined,
        walletServicePath: undefined,
        rpIdOverride: payload?.rpIdOverride || walletConfigs?.iframeWallet?.rpIdOverride,
      },
    } as PasskeyManagerConfigs;
    // Configure SDK embedded asset base for Lit modal/embedded components
    try {
      const assetsBaseUrl = payload?.assetsBaseUrl as string | undefined;
      // Default to serving embedded assets from this wallet origin under /sdk/
      const defaultRoot = (() => {
        try {
          const base = new URL('/sdk/', window.location.origin).toString();
          return base.endsWith('/') ? base : base + '/';
        } catch { return '/sdk/'; }
      })();
      let resolvedBase = defaultRoot;
      if (isString(assetsBaseUrl)) {
        try {
          const u = new URL(assetsBaseUrl, window.location.origin);
          // Only honor provided assetsBaseUrl if it matches this wallet origin to avoid CORS
          if (u.origin === window.location.origin) {
            const norm = u.toString().endsWith('/') ? u.toString() : (u.toString() + '/');
            resolvedBase = norm;
          }
        } catch {}
      }
      (window as any).__W3A_EMBEDDED_BASE__ = resolvedBase;
      try {
        window.dispatchEvent(new CustomEvent('W3A_EMBEDDED_BASE_SET', { detail: resolvedBase }));
      } catch {}
    } catch {}
    nearClient = null; passkeyManager = null;
    // Forward UI registry to iframe-lit-elem-mounter if provided
    try {
      const uiRegistry = payload?.uiRegistry;
      if (uiRegistry && isObject(uiRegistry)) {
        window.postMessage({ type: 'WALLET_UI_REGISTER_TYPES', payload: uiRegistry }, '*');
      }
    } catch {}
    post({ type: 'PONG', requestId });
    return;
  }

  if (req.type === 'PM_CANCEL') {
    // Best-effort cancel: mark requestId and close any open modal inside the wallet host
    const rid = req.payload?.requestId;
    markCancelled(rid);
    // Cover all possible confirmation hosts used inside the wallet iframe
    const els = (CONFIRM_UI_ELEMENT_SELECTORS as readonly string[])
      .flatMap((sel) => Array.from(document.querySelectorAll(sel)) as HTMLElement[]);
    for (const el of els) {
      try {
        el.dispatchEvent(new CustomEvent(WalletIframeDomEvents.TX_CONFIRMER_CANCEL, { bubbles: true, composed: true }));
      } catch {}
    }
    // Also cancel any device linking flow
    ensurePasskeyManager();
    await passkeyManager!.stopDevice2LinkingFlow();
    if (rid) {
      // Immediately emit a terminal cancellation for the original request.
      // Handlers may also emit their own CANCELLED error; router tolerates duplicates.
      emitCancellationPayload(rid);
    }
    post({ type: 'PONG', requestId });
    return;
  }

  try {
    const handler = requestHandlers[req.type as ParentToChildType];
    if (handler) {
      await handler(req as any);
    }
  } catch (err: unknown) {
    post({ type: 'ERROR', requestId, payload: { code: 'HOST_ERROR', message: errorMessage(err) } });
  }
}

function adoptPort(p: MessagePort) {
  port = p;
  port.onmessage = (ev) => onPortMessage(ev as MessageEvent<ParentToChildEnvelope>);
  port.start?.();
  post({ type: 'READY', payload: { protocolVersion: PROTOCOL } });
}

function onWindowMessage(e: MessageEvent) {
  const { data, ports } = e;
  if (!data || !isObject(data)) return;
  if ((data as { type?: unknown }).type === 'CONNECT' && ports && ports[0]) {
    if (typeof e.origin === 'string' && e.origin.length && e.origin !== 'null') {
      parentOrigin = e.origin;
    }
    adoptPort(ports[0]);
  }
}

try { window.addEventListener('message', onWindowMessage); } catch {}

export {};

// Normalize an arbitrary patch object into a valid ConfirmationConfig object using base as defaults
function normalizeConfirmationConfig(base: ConfirmationConfig, patch: Record<string, unknown>): ConfirmationConfig {
  const p: Record<string, unknown> = patch || {};
  const uiModeCand = isString(p.uiMode) ? p.uiMode : undefined;
  const behaviorCand = isString(p.behavior) ? p.behavior : undefined;
  let delayCand: number | undefined;
  if (isFiniteNumber(p.autoProceedDelay)) {
    delayCand = p.autoProceedDelay as number;
  } else if (isString(p.autoProceedDelay)) {
    const parsed = Number(p.autoProceedDelay);
    delayCand = Number.isFinite(parsed) ? parsed : undefined;
  }
  const themeCand = isString(p.theme) ? p.theme : undefined;

  const uiMode: ConfirmationConfig['uiMode'] = (uiModeCand === 'skip' || uiModeCand === 'modal' || uiModeCand === 'drawer')
    ? uiModeCand
    : base.uiMode;

  const behavior: ConfirmationConfig['behavior'] = (behaviorCand === 'requireClick' || behaviorCand === 'autoProceed')
    ? behaviorCand
    : base.behavior;

  const theme: ConfirmationConfig['theme'] = (themeCand === 'dark' || themeCand === 'light')
    ? themeCand
    : base.theme;

  const autoProceedDelay = isNumber(delayCand) ? delayCand : base.autoProceedDelay;

  return { uiMode, behavior, autoProceedDelay, theme };
}
function applyTransparentIframeSurface() {
  const apply = () => {
    try {
      const doc = document;
      doc.documentElement.style.background = 'transparent';
      doc.documentElement.style.margin = '0';
      doc.documentElement.style.padding = '0';
      try {
        doc.documentElement.style.colorScheme = 'normal';
        doc.documentElement.classList.remove('dark');
      } catch {}
      if (doc.body) {
        doc.body.style.background = 'transparent';
        doc.body.style.margin = '0';
        doc.body.style.padding = '0';
        try {
          doc.body.style.colorScheme = 'normal';
          doc.body.classList.remove('dark');
        } catch {}
      }
    } catch {}
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => apply(), { once: true });
  } else {
    apply();
  }
  window.addEventListener('load', () => apply(), { once: true });
}
