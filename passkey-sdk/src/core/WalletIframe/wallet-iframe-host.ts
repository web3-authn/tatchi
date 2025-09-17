
// TODO: clean up wallet iframe initialization
// Minimal service iframe host bootstrap (PasskeyManager‑first)
// Ensure common Node-ish globals exist for browser bundles that expect them
try { (globalThis as any).global = (globalThis as any).global || globalThis; } catch {}
try { (globalThis as any).process = (globalThis as any).process || { env: {} }; } catch {}
try { window.addEventListener('DOMContentLoaded', () => console.debug('[WalletHost] DOMContentLoaded')); } catch {}
try { window.addEventListener('load', () => console.debug('[WalletHost] window load')); } catch {}
try { window.parent?.postMessage({ type: 'SERVICE_HOST_BOOTED' }, '*'); } catch {}
try { window.addEventListener('error', (e) => console.debug('[WalletHost] window error', e.error || e.message)); } catch {}
try { window.addEventListener('unhandledrejection', (e) => console.debug('[WalletHost] unhandledrejection', e.reason)); } catch {}
try {
  window.addEventListener('click', (e) => {
    try {
      const t = e.target as HTMLElement;
      const name = t?.tagName?.toLowerCase() || 'unknown';
      const cls = t?.className || '';
      window.parent?.postMessage({ type: 'SERVICE_HOST_CLICK', name, cls }, '*');
    } catch {}
  }, true);
} catch {}

import type {
  ParentToChildEnvelope,
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
  PMExportNearKeypairPayload,
  PMSetConfirmBehaviorPayload,
  PMSetConfirmationConfigPayload,
  PMGetLoginStatePayload,
  PMSetThemePayload,
  PMHasPasskeyPayload,
  PMViewAccessKeysPayload,
  PMDeleteDeviceKeyPayload,
} from './messages';
import { MinimalNearClient, SignedTransaction } from '../NearClient';
import { setupElemMounter } from './elem-mounter';
import type { PasskeyManagerConfigs } from '../types/passkeyManager';
import { PasskeyManager } from '../PasskeyManager';
import { PasskeyManagerIframe } from './PasskeyManagerIframe';
import type { DeviceLinkingQRData } from '../types/linkDevice';
import type { TransactionInput } from '../types';
import type { ProgressPayload } from './messages';
import type { ConfirmationConfig } from '../types/signer-worker';
import type {
  RegistrationHooksOptions,
  LoginHooksOptions,
  ActionHooksOptions,
  SignAndSendTransactionHooksOptions,
  SendTransactionHooksOptions,
  BaseHooksOptions,
  AccountRecoveryHooksOptions,
} from '../types/passkeyManager';
import type {
  ScanAndLinkDeviceOptionsDevice1,
  StartDeviceLinkingOptionsDevice2
} from '../types/linkDevice';
import { toAccountId } from '../types/accountIds';

const PROTOCOL: ReadyPayload['protocolVersion'] = '1.0.0';

let port: MessagePort | null = null;
let walletConfigs: PasskeyManagerConfigs | null = null;
let nearClient: MinimalNearClient | null = null;
let passkeyManager: PasskeyManagerIframe | PasskeyManager | null = null;
let themeUnsubscribe: (() => void) | null = null;
// Track request-level cancellations
const cancelledRequests = new Set<string>();
function markCancelled(rid?: string) { if (rid) cancelledRequests.add(rid); }
function isCancelled(rid?: string) { return !!rid && cancelledRequests.has(rid); }
function clearCancelled(rid?: string) { if (rid) cancelledRequests.delete(rid); }

function ensurePasskeyManager(): void {
  if (!walletConfigs || !walletConfigs.nearRpcUrl) {
    throw new Error('Wallet service not configured. Call PM_SET_CONFIG first.');
  }
  if (!nearClient) nearClient = new MinimalNearClient(walletConfigs.nearRpcUrl);
  if (!passkeyManager) {
    const cfg = { ...walletConfigs };
    passkeyManager = new PasskeyManager(cfg, nearClient);
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

function post(msg: ChildToParentEnvelope) {
  try { port?.postMessage(msg); } catch {}
}

// Lightweight cross-origin control channel for small UI surfaces like a register button.
// This channel uses window.postMessage directly (not MessagePort) so that a standalone
// iframe can instruct this host to render a clickable button that performs WebAuthn
// create() within the same browsing context (satisfying user activation requirements).
(() => {
  setupElemMounter({
    ensurePasskeyManager,
    getPasskeyManager: () => passkeyManager,
    updateWalletConfigs: (patch) => {
      try {
        walletConfigs = { ...walletConfigs, ...patch } as PasskeyManagerConfigs;
        console.debug('[WalletHost:RegisterBtn] config updated via WALLET_SET_CONFIG');
      } catch {}
    },
  });
})();

async function onPortMessage(e: MessageEvent<ParentToChildEnvelope>) {
  const req = e.data as ParentToChildEnvelope;
  if (!req || typeof req !== 'object') return;
  const requestId = req.requestId;

  if (req.type === 'PING') { post({ type: 'PONG', requestId }); return; }

  if (req.type === 'PM_SET_CONFIG') {
    const payload = req.payload as PMSetConfigPayload;
    walletConfigs = {
      nearRpcUrl: payload?.nearRpcUrl || walletConfigs?.nearRpcUrl || '',
      nearNetwork: payload?.nearNetwork || walletConfigs?.nearNetwork || 'testnet',
      contractId: payload?.contractId || walletConfigs?.contractId || '',
      nearExplorerUrl: walletConfigs?.nearExplorerUrl,
      relayer: payload?.relayer || walletConfigs?.relayer,
      authenticatorOptions: payload?.authenticatorOptions || walletConfigs?.authenticatorOptions,
      vrfWorkerConfigs: payload?.vrfWorkerConfigs || walletConfigs?.vrfWorkerConfigs,
      walletOrigin: undefined,
      walletServicePath: undefined,
      walletTheme: payload?.theme || walletConfigs?.walletTheme,
      rpIdOverride: payload?.rpIdOverride || walletConfigs?.rpIdOverride,
    } as PasskeyManagerConfigs;
    // Configure SDK embedded asset base for Lit modal/embedded components
    try {
      const assetsBaseUrl = payload?.assetsBaseUrl as string | undefined;
      if (assetsBaseUrl && typeof assetsBaseUrl === 'string') {
        const norm = assetsBaseUrl.endsWith('/') ? assetsBaseUrl : assetsBaseUrl + '/';
        (window as any).__W3A_EMBEDDED_BASE__ = norm + 'embedded/';
        try { console.debug('[WalletHost] assets base set:', (window as any).__W3A_EMBEDDED_BASE__); } catch {}
      }
    } catch {}
    nearClient = null; passkeyManager = null;
    post({ type: 'PONG', requestId });
    return;
  }

  if (req.type === 'PM_CANCEL') {
    // Best-effort cancel: mark requestId and close any open modal inside the wallet host
    const rid = req.payload?.requestId;
    markCancelled(rid);
    const els = Array.from(document.querySelectorAll('iframe-modal')) as HTMLElement[];
    for (const el of els) {
      try { el.dispatchEvent(new CustomEvent('w3a:modal-cancel', { bubbles: true, composed: true })); } catch {}
    }
    // Also cancel any device linking flow
    ensurePasskeyManager();
    await passkeyManager!.stopDevice2LinkingFlow();
    if (rid) {
      post({
        type: 'PROGRESS',
        requestId: rid,
        payload: { step: 0, phase: 'cancelled', status: 'error', message: 'Cancelled by user' }
      });
    }
    post({ type: 'PONG', requestId });
    return;
  }

  try {
    switch (req.type) {
      case 'PM_LOGIN': {
        ensurePasskeyManager();
        const { nearAccountId, options } = req.payload as PMLoginPayload;

        if (isCancelled(requestId)) {
          post({
            type: 'PROGRESS',
            requestId,
            payload: { step: 0, phase: 'cancelled', status: 'error', message: 'Cancelled by user' }
          });
          post({
            type: 'ERROR',
            requestId,
            payload: { code: 'CANCELLED', message: 'Request cancelled' }
          });
          clearCancelled(requestId);
          return;
        }

        const result = await passkeyManager!.loginPasskey(nearAccountId, {
          ...options,
          onEvent: (ev: ProgressPayload) => post({ type: 'PROGRESS', requestId, payload: ev })
        } as LoginHooksOptions);

        if (isCancelled(requestId)) {
          post({
            type: 'PROGRESS',
            requestId,
            payload: { step: 0, phase: 'cancelled', status: 'error', message: 'Cancelled by user' }
          });
          post({ type: 'ERROR', requestId, payload: { code: 'CANCELLED', message: 'Request cancelled' } });
          clearCancelled(requestId);
          return;
        }
        post({ type: 'PM_RESULT', requestId, payload: { ok: true, result } });
        return;
      }

      case 'PM_LOGOUT': {
        ensurePasskeyManager();
        await passkeyManager!.logoutAndClearVrfSession();
        post({ type: 'PM_RESULT', requestId, payload: { ok: true } });
        return;
      }

      case 'PM_GET_LOGIN_STATE': {
        ensurePasskeyManager();
        const { nearAccountId } = req.payload as PMGetLoginStatePayload;
        const state = await passkeyManager!.getLoginState(nearAccountId);
        post({ type: 'PM_RESULT', requestId, payload: { ok: true, result: state } });
        return;
      }

      case 'PM_REGISTER': {
        ensurePasskeyManager();
        const { nearAccountId, options } = req.payload as PMRegisterPayload;
        if (isCancelled(requestId)) {
          post({
            type: 'PROGRESS',
            requestId,
            payload: { step: 0, phase: 'cancelled', status: 'error', message: 'Cancelled by user' }
          });
          post({ type: 'ERROR', requestId, payload: { code: 'CANCELLED', message: 'Request cancelled' } });
          clearCancelled(requestId);
          return;
        }
        const result = await passkeyManager!.registerPasskey(nearAccountId, {
          ...options,
          onEvent: (ev: ProgressPayload) => post({ type: 'PROGRESS', requestId, payload: ev })
        } as RegistrationHooksOptions);
        if (isCancelled(requestId)) {
          post({
            type: 'PROGRESS',
            requestId,
            payload: { step: 0, phase: 'cancelled', status: 'error', message: 'Cancelled by user' }
          });
          post({ type: 'ERROR', requestId, payload: { code: 'CANCELLED', message: 'Request cancelled' } });
          clearCancelled(requestId);
          return;
        }
        post({ type: 'PM_RESULT', requestId, payload: { ok: true, result } });
        return;
      }

      case 'PM_SIGN_TXS_WITH_ACTIONS': {
        ensurePasskeyManager();
        const { nearAccountId, transactions, options } = req.payload as PMSignTxsPayload;
        const results = await passkeyManager!.signTransactionsWithActions({
          nearAccountId,
          transactions: transactions,
          options: {
            ...options,
            onEvent: (ev: ProgressPayload) => post({ type: 'PROGRESS', requestId, payload: ev })
          } as ActionHooksOptions,
        });
        if (isCancelled(requestId)) {
          post({
            type: 'ERROR',
            requestId,
            payload: { code: 'CANCELLED', message: 'Request cancelled' }
          });
          clearCancelled(requestId);
          return;
        }
        post({ type: 'PM_RESULT', requestId, payload: { ok: true, result: results } });
        return;
      }

      case 'PM_SIGN_AND_SEND_TXS': {
        ensurePasskeyManager();
        const { nearAccountId, transactions, options } = (req.payload || {}) as PMSignAndSendTxsPayload;
        const results = await passkeyManager!.signAndSendTransactions({
          nearAccountId,
          transactions: transactions,
          options: {
            ...options,
            onEvent: (ev: ProgressPayload) => post({ type: 'PROGRESS', requestId, payload: ev })
          } as SignAndSendTransactionHooksOptions,
        });
        if (isCancelled(requestId)) {
          post({
            type: 'PROGRESS',
            requestId,
            payload: { step: 0, phase: 'cancelled', status: 'error', message: 'Cancelled by user' }
          });
          post({
            type: 'ERROR',
            requestId,
            payload: { code: 'CANCELLED', message: 'Request cancelled' }
          });
          clearCancelled(requestId);
          return;
        }
        post({ type: 'PM_RESULT', requestId, payload: { ok: true, result: results } });
        return;
      }

      case 'PM_LINK_DEVICE_WITH_SCANNED_QR_DATA': {
        // Device1: Scan QR in parent, authorize AddKey + mapping within iframe
        ensurePasskeyManager();
        // TODO: fix typing for link device
        const { qrData, fundingAmount } = (req.payload || {}) as { qrData: DeviceLinkingQRData; fundingAmount: string };
        if (isCancelled(requestId)) {
          post({
            type: 'PROGRESS',
            requestId,
            payload: { step: 0, phase: 'cancelled', status: 'error', message: 'Cancelled by user' }
          });
          post({
            type: 'ERROR',
            requestId,
            payload: { code: 'CANCELLED', message: 'Request cancelled' }
          });
          clearCancelled(requestId);
          return;
        }
        const result = await passkeyManager!.linkDeviceWithScannedQRData(qrData, {
          fundingAmount,
          onEvent: (ev: ProgressPayload) => post({ type: 'PROGRESS', requestId, payload: ev })
        } as ScanAndLinkDeviceOptionsDevice1);
        if (isCancelled(requestId)) {
          post({
            type: 'PROGRESS',
            requestId,
            payload: { step: 0, phase: 'cancelled', status: 'error', message: 'Cancelled by user' }
          });
          post({
            type: 'ERROR',
            requestId,
            payload: { code: 'CANCELLED', message: 'Request cancelled' }
          });
          clearCancelled(requestId);
          return;
        }
        post({ type: 'PM_RESULT', requestId, payload: { ok: true, result } });
        return;
      }

      case 'PM_START_DEVICE2_LINKING_FLOW': {
        // Device2: Generate QR and poll for AddKey; headless. Return QR so parent can render.
        ensurePasskeyManager();
        const { accountId } = (req.payload || {}) as { accountId?: string };
        try {
          const { qrData, qrCodeDataURL } = await passkeyManager!.startDevice2LinkingFlow({
            accountId,
            onEvent: (ev: ProgressPayload) => { try { post({ type: 'PROGRESS', requestId, payload: ev }); } catch {} },
          });
          post({
            type: 'PM_RESULT', requestId,
            payload: { ok: true, result: { flowId: requestId, qrData, qrCodeDataURL } }
          });
        } catch (e: any) {
          post({
            type: 'ERROR', requestId,
            payload: { code: 'LINK_DEVICE_INIT_FAILED', message: e?.message || String(e) }
          });
        }
        return;
      }

      case 'PM_STOP_DEVICE2_LINKING_FLOW': {
        try { ensurePasskeyManager(); await passkeyManager!.stopDevice2LinkingFlow(); } catch {}
        post({ type: 'PM_RESULT', requestId, payload: { ok: true } });
        return;
      }

      case 'PM_SEND_TRANSACTION': {
        ensurePasskeyManager();
        const { signedTransaction, options } = (req.payload || {}) as PMSendTxPayload & { options?: Record<string, unknown> };
        let st: any = signedTransaction;
        try {
          if (st && typeof st.base64Encode !== 'function' && (st.borsh_bytes || st.borshBytes)) {
            st = new SignedTransaction({
              transaction: st.transaction,
              signature: st.signature,
              borsh_bytes: Array.isArray(st.borsh_bytes) ? st.borsh_bytes : Array.from(st.borshBytes || []),
            });
          }
        } catch {}
        const result = await passkeyManager!.sendTransaction({
          signedTransaction: st,
          options: {
            ...(options || {}),
            onEvent: (ev: ProgressPayload) => post({ type: 'PROGRESS', requestId, payload: ev })
          } as SendTransactionHooksOptions,
        });
        if (isCancelled(requestId)) {
          post({
            type: 'ERROR',
            requestId,
            payload: { code: 'CANCELLED', message: 'Request cancelled' }
          });
          clearCancelled(requestId);
          return;
        }
        post({ type: 'PM_RESULT', requestId, payload: { ok: true, result } });
        return;
      }

      case 'PM_EXECUTE_ACTION': {
        ensurePasskeyManager();
        const {
          nearAccountId,
          receiverId,
          actionArgs,
          options
        } = (req.payload || {}) as PMExecuteActionPayload & { options?: Record<string, unknown> };
        const result = await passkeyManager!.executeAction({
          nearAccountId,
          receiverId,
          actionArgs: actionArgs,
          options: {
            ...(options || {}),
            onEvent: (ev: ProgressPayload) => post({ type: 'PROGRESS', requestId, payload: ev })
          } as ActionHooksOptions,
        });
        if (isCancelled(requestId)) {
          post({
            type: 'ERROR',
            requestId,
            payload: { code: 'CANCELLED', message: 'Request cancelled' }
          });
          clearCancelled(requestId);
          return;
        }
        post({ type: 'PM_RESULT', requestId, payload: { ok: true, result } });
        return;
      }

      case 'PM_SIGN_NEP413': {
        ensurePasskeyManager();
        const { nearAccountId, params, options } = (req.payload || {}) as PMSignNep413Payload;
        const result = await passkeyManager!.signNEP413Message({
          nearAccountId,
          params,
          options: {
            ...options,
            onEvent: (ev: ProgressPayload) => post({ type: 'PROGRESS', requestId, payload: ev })
          } as BaseHooksOptions
        });
        if (isCancelled(requestId)) {
          post({
            type: 'PROGRESS',
            requestId,
            payload: { step: 0, phase: 'cancelled', status: 'error', message: 'Cancelled by user' }
          });
          post({
            type: 'ERROR',
            requestId,
            payload: { code: 'CANCELLED', message: 'Request cancelled' }
          });
          clearCancelled(requestId);
          return;
        }
        post({ type: 'PM_RESULT', requestId, payload: { ok: true, result } });
        return;
      }

      case 'PM_EXPORT_NEAR_KEYPAIR': {
        ensurePasskeyManager();
        const { nearAccountId } = (req.payload || {}) as PMExportNearKeypairPayload;
        const result = await passkeyManager!.exportNearKeypairWithTouchId(nearAccountId);
        post({ type: 'PM_RESULT', requestId, payload: { ok: true, result } });
        return;
      }

      case 'PM_GET_RECENT_LOGINS': {
        ensurePasskeyManager();
        const result = await passkeyManager!.getRecentLogins();
        post({ type: 'PM_RESULT', requestId, payload: { ok: true, result } });
        return;
      }

      case 'PM_PREFETCH_BLOCKHEIGHT': {
        ensurePasskeyManager();
        await passkeyManager!.prefetchBlockheight();
        post({ type: 'PM_RESULT', requestId, payload: { ok: true } });
        return;
      }

      case 'PM_SET_CONFIRM_BEHAVIOR': {
        ensurePasskeyManager();
        const { behavior, nearAccountId } = (req.payload || {}) as PMSetConfirmBehaviorPayload;
        try {
          if (nearAccountId) {
            try { await passkeyManager!.getLoginState(nearAccountId); } catch {}
          }
          passkeyManager!.setConfirmBehavior(behavior);
          post({ type: 'PM_RESULT', requestId, payload: { ok: true } });
        } catch (e: any) {
          post({ type: 'ERROR', requestId, payload: { code: 'SET_CONFIRM_BEHAVIOR_FAILED', message: e?.message || String(e) } });
        }
        return;
      }

      case 'PM_SET_CONFIRMATION_CONFIG': {
        ensurePasskeyManager();
        const { nearAccountId } = (req.payload || {}) as PMSetConfirmationConfigPayload & { nearAccountId?: string };
        try {
          const incoming = (req.payload as PMSetConfirmationConfigPayload).config || ({} as Record<string, unknown>);
          let patch: Record<string, unknown> = { ...incoming };
          if (nearAccountId) {
            const loginState = await passkeyManager!.getLoginState(nearAccountId);
            const existing = (loginState?.userData?.preferences?.confirmationConfig || {}) as Record<string, unknown>;
            patch = { ...existing, ...incoming };
          }
          const base: ConfirmationConfig = passkeyManager!.getConfirmationConfig();
          const normalized: ConfirmationConfig = normalizeConfirmationConfig(base, patch);
          passkeyManager!.setConfirmationConfig(normalized);
          post({ type: 'PM_RESULT', requestId, payload: { ok: true } });
        } catch (e: any) {
          post({
            type: 'ERROR',
            requestId,
            payload: {
              code: 'SET_CONFIRMATION_CONFIG_FAILED',
              message: e?.message || String(e)
            }
          });
        }
        return;
      }

      case 'PM_GET_CONFIRMATION_CONFIG': {
        ensurePasskeyManager();
        const result = passkeyManager!.getConfirmationConfig();
        post({ type: 'PM_RESULT', requestId, payload: { ok: true, result } });
        return;
      }

      case 'PM_SET_THEME': {
        ensurePasskeyManager();
        const { theme } = (req.payload || {}) as PMSetThemePayload;
        passkeyManager!.setUserTheme(theme);
        post({ type: 'PM_RESULT', requestId, payload: { ok: true } });
        return;
      }

      case 'PM_HAS_PASSKEY': {
        ensurePasskeyManager();
        const { nearAccountId } = (req.payload || {}) as PMHasPasskeyPayload;
        const result = await passkeyManager!.hasPasskeyCredential(toAccountId(nearAccountId));
        post({ type: 'PM_RESULT', requestId, payload: { ok: true, result } });
        return;
      }

      case 'PM_VIEW_ACCESS_KEYS': {
        ensurePasskeyManager();
        const { accountId } = (req.payload || {}) as PMViewAccessKeysPayload;
        const result = await passkeyManager!.viewAccessKeyList(accountId);
        post({ type: 'PM_RESULT', requestId, payload: { ok: true, result } });
        return;
      }

      case 'PM_DELETE_DEVICE_KEY': {
        ensurePasskeyManager();
        const { accountId, publicKeyToDelete } = (req.payload || {}) as PMDeleteDeviceKeyPayload;
        const result = await passkeyManager!.deleteDeviceKey(accountId, publicKeyToDelete, {
          onEvent: (ev: ProgressPayload) => post({ type: 'PROGRESS', requestId, payload: ev })
        } as ActionHooksOptions);

        if (isCancelled(requestId)) {
          post({
            type: 'PROGRESS',
            requestId,
            payload: { step: 0, phase: 'cancelled', status: 'error', message: 'Cancelled by user' }
          });
          post({
            type: 'ERROR',
            requestId,
            payload: { code: 'CANCELLED', message: 'Request cancelled' }
          });
          clearCancelled(requestId);
          return;
        }
        post({ type: 'PM_RESULT', requestId, payload: { ok: true, result } });
        return;
      }

      case 'PM_RECOVER_ACCOUNT_FLOW': {
        ensurePasskeyManager();
        const { accountId } = (req.payload || {}) as { accountId?: string };
        try {
          const result = await passkeyManager?.recoverAccountFlow({
            accountId,
            options: { onEvent: (ev: ProgressPayload) => post({ type: 'PROGRESS', requestId, payload: ev }) } as AccountRecoveryHooksOptions,
          });
          post({ type: 'PM_RESULT', requestId, payload: { ok: true, result } });
        } catch (e: any) {
          post({
            type: 'ERROR',
            requestId,
            payload: { code: 'RECOVERY_FAILED', message: e?.message || String(e) }
          });
        }
        return;
      }

    }
  } catch (err: any) {
    post({
      type: 'ERROR',
      requestId,
      payload: { code: 'HOST_ERROR', message: err?.message || String(err) }
    });
  }
}

function adoptPort(p: MessagePort) {
  port = p;
  port.onmessage = onPortMessage as any;
  port.start?.();
  try { console.debug('[WalletHost] Port adopted; posting READY'); } catch {}
  post({ type: 'READY', payload: { protocolVersion: PROTOCOL } });
}

function onWindowMessage(e: MessageEvent) {
  const { data, ports } = e;
  if (!data || typeof data !== 'object') return;
  if ((data as any).type === 'CONNECT' && ports && ports[0]) {
    try { console.debug('[WalletHost] CONNECT received; adopting port'); } catch {}
    adoptPort(ports[0]);
  }
}

try { window.addEventListener('message', onWindowMessage); } catch {}

export {};

// Normalize an arbitrary patch object into a valid ConfirmationConfig object using base as defaults
function normalizeConfirmationConfig(base: ConfirmationConfig, patch: Record<string, unknown>): ConfirmationConfig {
  const p: any = patch || {};
  const uiModeCand = typeof p.uiMode === 'string' ? p.uiMode : undefined;
  const behaviorCand = typeof p.behavior === 'string' ? p.behavior : undefined;
  let delayCand: number | undefined;
  if (typeof p.autoProceedDelay === 'number' && Number.isFinite(p.autoProceedDelay)) {
    delayCand = p.autoProceedDelay as number;
  } else if (typeof p.autoProceedDelay === 'string') {
    const parsed = Number(p.autoProceedDelay);
    delayCand = Number.isFinite(parsed) ? parsed : undefined;
  }
  const themeCand = typeof p.theme === 'string' ? p.theme : undefined;

  const uiMode: ConfirmationConfig['uiMode'] = (uiModeCand === 'skip' || uiModeCand === 'modal' || uiModeCand === 'embedded')
    ? uiModeCand
    : base.uiMode;

  const behavior: ConfirmationConfig['behavior'] = (behaviorCand === 'requireClick' || behaviorCand === 'autoProceed')
    ? behaviorCand
    : base.behavior;

  const theme: ConfirmationConfig['theme'] = (themeCand === 'dark' || themeCand === 'light')
    ? themeCand
    : base.theme;

  const autoProceedDelay = typeof delayCand === 'number' ? delayCand : base.autoProceedDelay;

  return { uiMode, behavior, autoProceedDelay, theme };
}
