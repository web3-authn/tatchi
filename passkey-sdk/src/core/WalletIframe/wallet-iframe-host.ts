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

import type { ParentToChildEnvelope, ReadyPayload } from './messages';
import { MinimalNearClient, SignedTransaction } from '../NearClient';
import type { PasskeyManagerConfigs } from '../types/passkeyManager';
import { PasskeyManager } from '../PasskeyManager';
import type { DeviceLinkingQRData } from '../types/linkDevice';

const PROTOCOL: ReadyPayload['protocolVersion'] = '1.0.0';

let port: MessagePort | null = null;
let walletConfigs: PasskeyManagerConfigs | null = null;
let nearClient: MinimalNearClient | null = null;
let passkeyManager: PasskeyManager | null = null;
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
    // Preserve rpIdOverride so WebAuthn in the wallet origin uses the correct RP ID
    const cfg = { ...walletConfigs } as PasskeyManagerConfigs;
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

// Minimal user-activation overlay to satisfy WebAuthn requirements in cross-origin iframes
function withUserActivation(run: () => Promise<void>): void {
  try {
    let done = false;
    const cleanup = () => {
      try { window.removeEventListener('pointerdown', onAnyPointerDown, true as any); } catch {}
    };
    const proceed = async () => {
      if (done) return;
      done = true;
      try { await run(); } finally { cleanup(); }
    };
    const onAnyPointerDown = () => { proceed(); };
    try { window.addEventListener('pointerdown', onAnyPointerDown, { once: true, capture: true } as any); } catch {}

    // Minimal, non-blocking toast to capture a real user gesture inside the iframe
    const cta = document.createElement('div');
    cta.style.position = 'fixed';
    cta.style.bottom = '16px';
    cta.style.right = '16px';
    cta.style.zIndex = '2147483647';
    cta.style.background = 'white';
    cta.style.color = '#111';
    cta.style.padding = '12px 14px';
    cta.style.borderRadius = '12px';
    cta.style.boxShadow = '0 10px 30px rgba(0,0,0,0.25)';
    cta.style.display = 'flex';
    cta.style.alignItems = 'center';
    cta.style.gap = '10px';

    const label = document.createElement('div');
    label.textContent = 'Continue in wallet';
    label.style.fontSize = '14px';
    label.style.fontWeight = '600';
    label.style.margin = '0';

    const btn = document.createElement('button');
    btn.textContent = 'Continue';
    btn.style.padding = '8px 12px';
    btn.style.borderRadius = '10px';
    btn.style.border = '0';
    btn.style.background = '#4DAFFE';
    btn.style.color = '#0b1220';
    btn.style.cursor = 'pointer';
    btn.addEventListener('click', async () => {
      btn.setAttribute('disabled', 'true');
      try { await proceed(); } finally { try { cta.remove(); } catch {} }
    }, { once: true });

    cta.appendChild(label);
    cta.appendChild(btn);
    document.body.appendChild(cta);
  } catch (e) {
    try { run(); } catch {}
  }
}

function post(msg: any) {
  try { port?.postMessage(msg); } catch {}
}

async function onPortMessage(e: MessageEvent) {
  const req = e.data as any;
  if (!req || typeof req !== 'object') return;
  const requestId = (req as any).requestId as string | undefined;

  if (req.type === 'PING') { post({ type: 'PONG', requestId }); return; }

  if (req.type === 'PM_SET_CONFIG') {
    walletConfigs = {
      nearRpcUrl: (req.payload as any)?.nearRpcUrl || walletConfigs?.nearRpcUrl || '',
      nearNetwork: (req.payload as any)?.nearNetwork || walletConfigs?.nearNetwork || 'testnet',
      contractId: (req.payload as any)?.contractId || walletConfigs?.contractId || '',
      nearExplorerUrl: walletConfigs?.nearExplorerUrl,
      relayer: (req.payload as any)?.relayer || walletConfigs?.relayer || { accountId: '', url: '' },
      authenticatorOptions: (req.payload as any)?.authenticatorOptions || (walletConfigs as any)?.authenticatorOptions,
      vrfWorkerConfigs: (req.payload as any)?.vrfWorkerConfigs || walletConfigs?.vrfWorkerConfigs,
      walletOrigin: undefined,
      walletServicePath: undefined,
      walletTheme: (req.payload as any)?.theme || (walletConfigs as any)?.walletTheme,
      rpIdOverride: (req.payload as any)?.rpIdOverride || (walletConfigs as any)?.rpIdOverride,
    } as PasskeyManagerConfigs as any;
    // Configure SDK embedded asset base for Lit modal/embedded components
    try {
      const assetsBaseUrl = (req.payload as any)?.assetsBaseUrl as string | undefined;
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
    // Best-effort cancel: mark rid and close any open modal inside the wallet host
    const rid = (req.payload as any)?.requestId as string | undefined;
    markCancelled(rid);
    try {
      const els = Array.from(document.querySelectorAll('iframe-modal')) as HTMLElement[];
      for (const el of els) {
        try { el.dispatchEvent(new CustomEvent('w3a:modal-cancel', { bubbles: true, composed: true })); } catch {}
      }
    } catch {}
    // Also cancel any device linking flow
    try { ensurePasskeyManager(); await passkeyManager!.stopDevice2LinkingFlow(); } catch {}
    try { if (rid) post({ type: 'PROGRESS', requestId: rid, payload: { step: 0, phase: 'cancelled', status: 'error', message: 'Cancelled by user' } }); } catch {}
    post({ type: 'PONG', requestId });
    return;
  }

  try {
    switch (req.type) {
      case 'PM_LOGIN': {
        ensurePasskeyManager();
        const { nearAccountId, options } = (req.payload || {}) as any;
        if (isCancelled(requestId)) { post({ type: 'PROGRESS', requestId, payload: { step: 0, phase: 'cancelled', status: 'error', message: 'Cancelled by user' } }); post({ type: 'ERROR', requestId, payload: { code: 'CANCELLED', message: 'Request cancelled' } }); clearCancelled(requestId); return; }
        const result = await passkeyManager!.loginPasskey(nearAccountId, {
          ...(options || {}),
          onEvent: (ev: any) => post({ type: 'PROGRESS', requestId, payload: ev })
        } as any);
        if (isCancelled(requestId)) { post({ type: 'PROGRESS', requestId, payload: { step: 0, phase: 'cancelled', status: 'error', message: 'Cancelled by user' } }); post({ type: 'ERROR', requestId, payload: { code: 'CANCELLED', message: 'Request cancelled' } }); clearCancelled(requestId); return; }
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
        const { nearAccountId } = (req.payload || {}) as any;
        const state = await passkeyManager!.getLoginState(nearAccountId);
        post({ type: 'PM_RESULT', requestId, payload: { ok: true, result: state } });
        return;
      }
      case 'PM_REGISTER': {
        ensurePasskeyManager();
        const { nearAccountId, options } = (req.payload || {}) as any;
        if (isCancelled(requestId)) { post({ type: 'PROGRESS', requestId, payload: { step: 0, phase: 'cancelled', status: 'error', message: 'Cancelled by user' } }); post({ type: 'ERROR', requestId, payload: { code: 'CANCELLED', message: 'Request cancelled' } }); clearCancelled(requestId); return; }
        const result = await passkeyManager!.registerPasskey(nearAccountId, {
          ...(options || {}),
          onEvent: (ev: any) => post({ type: 'PROGRESS', requestId, payload: ev })
        });
        if (isCancelled(requestId)) { post({ type: 'PROGRESS', requestId, payload: { step: 0, phase: 'cancelled', status: 'error', message: 'Cancelled by user' } }); post({ type: 'ERROR', requestId, payload: { code: 'CANCELLED', message: 'Request cancelled' } }); clearCancelled(requestId); return; }
        post({ type: 'PM_RESULT', requestId, payload: { ok: true, result } });
        return;
      }
      case 'PM_SIGN_TXS_WITH_ACTIONS': {
        ensurePasskeyManager();
        const { nearAccountId, transactions, options } = (req.payload || {}) as any;
        const results = await passkeyManager!.signTransactionsWithActions({
          nearAccountId,
          transactions,
          options: {
            ...(options || {}),
            onEvent: (ev: any) => post({ type: 'PROGRESS', requestId, payload: ev })
          }
        } as any);
        if (isCancelled(requestId)) { post({ type: 'ERROR', requestId, payload: { code: 'CANCELLED', message: 'Request cancelled' } }); clearCancelled(requestId); return; }
        post({ type: 'PM_RESULT', requestId, payload: { ok: true, result: results } });
        return;
      }
      case 'PM_SIGN_AND_SEND_TXS': {
        ensurePasskeyManager();
        const { nearAccountId, transactions, options } = (req.payload || {}) as any;
        const results = await passkeyManager!.signAndSendTransactions({
          nearAccountId,
          transactions,
          options: {
            ...(options || {}),
            onEvent: (ev: any) => post({ type: 'PROGRESS', requestId, payload: ev })
          }
        } as any);
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
          onEvent: (ev: any) => post({ type: 'PROGRESS', requestId, payload: ev })
        } as any);
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
            onEvent: (ev: any) => { try { post({ type: 'PROGRESS', requestId, payload: ev }); } catch {} },
          } as any);
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
        const { signedTransaction, options } = (req.payload || {}) as any;
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
            onEvent: (ev: any) => post({ type: 'PROGRESS', requestId, payload: ev })
          }
        } as any);
        if (isCancelled(requestId)) { post({ type: 'ERROR', requestId, payload: { code: 'CANCELLED', message: 'Request cancelled' } }); clearCancelled(requestId); return; }
        post({ type: 'PM_RESULT', requestId, payload: { ok: true, result } });
        return;
      }
      case 'PM_EXECUTE_ACTION': {
        ensurePasskeyManager();
        const { nearAccountId, receiverId, actionArgs, options } = (req.payload || {}) as any;
        const result = await passkeyManager!.executeAction({
          nearAccountId,
          receiverId,
          actionArgs,
          options: {
            ...(options || {}),
            onEvent: (ev: any) => post({ type: 'PROGRESS', requestId, payload: ev })
          }
        } as any);
        if (isCancelled(requestId)) { post({ type: 'ERROR', requestId, payload: { code: 'CANCELLED', message: 'Request cancelled' } }); clearCancelled(requestId); return; }
        post({ type: 'PM_RESULT', requestId, payload: { ok: true, result } });
        return;
      }
      case 'PM_SIGN_NEP413': {
        ensurePasskeyManager();
        const { nearAccountId, params, options } = (req.payload || {}) as any;
        const result = await passkeyManager!.signNEP413Message({ nearAccountId, params, options: { ...(options || {}), onEvent: (ev: any) => post({ type: 'PROGRESS', requestId, payload: ev }) } } as any);
        if (isCancelled(requestId)) { post({ type: 'PROGRESS', requestId, payload: { step: 0, phase: 'cancelled', status: 'error', message: 'Cancelled by user' } }); post({ type: 'ERROR', requestId, payload: { code: 'CANCELLED', message: 'Request cancelled' } }); clearCancelled(requestId); return; }
        post({ type: 'PM_RESULT', requestId, payload: { ok: true, result } });
        return;
      }
      case 'PM_EXPORT_NEAR_KEYPAIR': {
        ensurePasskeyManager();
        const { nearAccountId } = (req.payload || {}) as any;
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
        const { behavior, nearAccountId } = (req.payload || {}) as any;
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
        const { nearAccountId } = (req.payload || {}) as any;
        try {
          let config = req.payload.config;
          if (nearAccountId) {
            const loginState = await passkeyManager!.getLoginState(nearAccountId);
            config = {
              ...config,
              ...loginState?.userData?.preferences?.confirmationConfig
            };
          }
          passkeyManager!.setConfirmationConfig(config);
          post({ type: 'PM_RESULT', requestId, payload: { ok: true } });
        } catch (e: any) {
          post({ type: 'ERROR', requestId, payload: { code: 'SET_CONFIRMATION_CONFIG_FAILED', message: e?.message || String(e) } });
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
        const { theme } = (req.payload || {}) as any;
        passkeyManager!.setUserTheme(theme);
        post({ type: 'PM_RESULT', requestId, payload: { ok: true } });
        return;
      }
      case 'PM_HAS_PASSKEY': {
        ensurePasskeyManager();
        const { nearAccountId } = (req.payload || {}) as any;
        const result = await passkeyManager!.hasPasskeyCredential(nearAccountId as any);
        post({ type: 'PM_RESULT', requestId, payload: { ok: true, result } });
        return;
      }
      case 'PM_VIEW_ACCESS_KEYS': {
        ensurePasskeyManager();
        const { accountId } = (req.payload || {}) as any;
        const result = await passkeyManager!.viewAccessKeyList(accountId);
        post({ type: 'PM_RESULT', requestId, payload: { ok: true, result } });
        return;
      }
      case 'PM_DELETE_DEVICE_KEY': {
        ensurePasskeyManager();
        const { accountId, publicKeyToDelete } = (req.payload || {}) as any;
        const result = await passkeyManager!.deleteDeviceKey(accountId, publicKeyToDelete, {
          onEvent: (ev: any) => post({ type: 'PROGRESS', requestId, payload: ev })
        } as any);
        if (isCancelled(requestId)) { post({ type: 'PROGRESS', requestId, payload: { step: 0, phase: 'cancelled', status: 'error', message: 'Cancelled by user' } }); post({ type: 'ERROR', requestId, payload: { code: 'CANCELLED', message: 'Request cancelled' } }); clearCancelled(requestId); return; }
        post({ type: 'PM_RESULT', requestId, payload: { ok: true, result } });
        return;
      }
      case 'PM_RECOVER_ACCOUNT_FLOW': {
        ensurePasskeyManager();
        const { accountId } = (req.payload || {}) as any;
        try {
          const result = await passkeyManager?.recoverAccountFlow({
            accountId,
            options: { onEvent: (ev: any) => post({ type: 'PROGRESS', requestId, payload: ev }) }
          });
          post({ type: 'PM_RESULT', requestId, payload: { ok: true, result } });
        } catch (e: any) {
          post({ type: 'ERROR', requestId, payload: { code: 'RECOVERY_FAILED', message: e?.message || String(e) } });
        }
        return;
      }

    }
    post({ type: 'ERROR', requestId, payload: { code: 'NOT_IMPLEMENTED', message: `Handler not implemented for ${req.type}` } });
  } catch (err: any) {
    post({ type: 'ERROR', requestId, payload: { code: 'HOST_ERROR', message: err?.message || String(err) } });
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
