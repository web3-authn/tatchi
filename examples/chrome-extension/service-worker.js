// MV3 Service Worker (dev harness)
// - Configures Side Panel behavior so clicking the extension icon opens the panel

try {
  chrome.runtime.onInstalled.addListener(() => {
    try {
      // Side Panel is optional; ignore if API unavailable.
      chrome.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: true });
    } catch {}
  });
} catch {}

// Wallet-host control broker (Unlock/Lock).
//
// The embedded wallet host runs inside `chrome-extension://.../wallet-service.html` iframes
// that are mounted by web pages. Those frames are not guaranteed to receive `runtime.sendMessage`
// directly (messages typically target the service worker), so we broker control messages through
// long-lived `runtime.connect` ports.
//
// Protocol:
// - wallet host connects: `chrome.runtime.connect({ name: 'TATCHI_WALLET_HOST' })`
// - SW forwards unlock/lock messages to all connected wallet-host ports and returns first ack.
// Track connected wallet hosts (wallet-service iframes / extension pages).
// We attach a small "hello" handshake so we can target the correct host:
// - embedded: wallet-service iframe mounted by a web page (referrer is http/https)
// - extension: wallet-service mounted by extension UI (side panel / popup)
const walletHostPorts = new Map(); // port -> { hostKind?: 'embedded' | 'extension' }
const walletHostPending = new Map(); // requestId -> { resolve, timer }

try {
  chrome.runtime.onConnect.addListener((port) => {
    try {
      if (!port || port.name !== 'TATCHI_WALLET_HOST') return;
      walletHostPorts.set(port, {});
      port.onDisconnect.addListener(() => {
        walletHostPorts.delete(port);
      });
      port.onMessage.addListener((msg) => {
        if (msg?.type === 'TATCHI_WALLET_HOST_HELLO') {
          const meta = walletHostPorts.get(port) || {};
          if (msg?.hostKind === 'embedded' || msg?.hostKind === 'extension') {
            meta.hostKind = msg.hostKind;
          }
          walletHostPorts.set(port, meta);
          return;
        }

        const requestId = msg?.requestId;
        const type = msg?.type;
        if (!requestId || (type !== 'TATCHI_WALLET_UNLOCK_RESULT' && type !== 'TATCHI_WALLET_LOCK_RESULT')) return;
        const pending = walletHostPending.get(requestId);
        if (!pending) return;
        walletHostPending.delete(requestId);
        try { clearTimeout(pending.timer); } catch {}
        pending.resolve({ ok: !!msg.ok, error: msg.error });
      });
    } catch {}
  });
} catch {}

async function forwardWalletHostControl(message) {
  const requestId = `${message.type}:${Date.now()}:${Math.random().toString(16).slice(2)}`;
  const timeoutMs = 25_000;
  const targetHostKind = message?.targetHostKind === 'embedded' || message?.targetHostKind === 'extension'
    ? message.targetHostKind
    : null;

  const allPorts = Array.from(walletHostPorts.keys());
  if (!allPorts.length) return { ok: false, error: 'No wallet host connected yet. Open the app page first so the extension wallet iframe mounts.' };

  const ports = targetHostKind
    ? allPorts.filter((p) => walletHostPorts.get(p)?.hostKind === targetHostKind)
    : allPorts;

  if (targetHostKind && !ports.length) {
    return { ok: false, error: `No ${targetHostKind} wallet host connected yet. Open the app page so the extension wallet iframe mounts, then try again.` };
  }

  const waitForAck = () =>
    new Promise((resolve) => {
      const timer = setTimeout(() => {
        walletHostPending.delete(requestId);
        resolve({ ok: false, error: 'Wallet host did not respond (timeout)' });
      }, timeoutMs);
      walletHostPending.set(requestId, { resolve, timer });
    });

  // Broadcast the request; accept first ack.
  for (const port of ports) {
    try {
      port.postMessage({ ...message, requestId });
    } catch {}
  }

  return await waitForAck();
}

// Popup broker for WebAuthn ceremonies.
//
// Motivation:
// - WebAuthn cannot run inside an embedded `chrome-extension://...` iframe due to Permissions-Policy limits.
// - The SDK opens a top-level extension popup to run `navigator.credentials.*`.
// - Some extension contexts (notably web-accessible iframes) can be flaky about receiving `runtime.onMessage`
//   events from each other. The MV3 service worker is the most reliable rendezvous point.
//
// Protocol:
// - iframe registers request:   { type: 'W3A_POPUP_REGISTER_REQUEST', requestId, kind, options }
// - popup fetches request:      { type: 'W3A_POPUP_GET_REQUEST', requestId }
// - popup posts result:         { type: 'W3A_POPUP_RESULT', requestId, ok, payload }
// - iframe polls for result:    { type: 'W3A_POPUP_WAIT_RESULT', requestId }
const popupRequests = new Map();
const popupResults = new Map();
// Confirm-popup broker for TxConfirmer UI.
// This is separate from the WebAuthn broker because the payload shape and lifecycle differ:
// - WebAuthn popup performs navigator.credentials.* and returns a credential
// - Confirm popup renders the TxConfirmer UI and returns { confirmed, error? }
const confirmRequests = new Map();
const confirmResults = new Map();
try {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    try {
      if (!message || typeof message !== 'object') return;
      const type = message.type;

      if (type === 'TATCHI_WALLET_UNLOCK' || type === 'TATCHI_WALLET_LOCK') {
        forwardWalletHostControl(message)
          .then((res) => sendResponse(res))
          .catch((err) => sendResponse({ ok: false, error: err?.message || String(err) }));
        return true;
      }

      if (type === 'W3A_POPUP_REGISTER_REQUEST') {
        popupRequests.set(message.requestId, {
          requestId: message.requestId,
          kind: message.kind,
          options: message.options,
        });
        sendResponse({ ok: true });
        return true;
      }
      if (type === 'W3A_POPUP_GET_REQUEST') {
        const req = popupRequests.get(message.requestId);
        if (!req) {
          sendResponse({ ok: false, error: 'Request not found' });
          return true;
        }
        sendResponse({ ok: true, payload: req });
        return true;
      }
      if (type === 'W3A_POPUP_RESULT') {
        popupResults.set(message.requestId, {
          requestId: message.requestId,
          ok: !!message.ok,
          payload: message.payload || {},
        });
        sendResponse({ ok: true });
        return true;
      }
      if (type === 'W3A_POPUP_WAIT_RESULT') {
        const res = popupResults.get(message.requestId);
        if (!res) {
          sendResponse({ ok: false, pending: true });
          return true;
        }
        // One-shot delivery
        popupResults.delete(message.requestId);
        popupRequests.delete(message.requestId);
        sendResponse({ ok: true, payload: res });
        return true;
      }

      // Confirm popup (TxConfirmer UI)
      if (type === 'W3A_CONFIRM_REGISTER_REQUEST') {
        confirmRequests.set(message.requestId, {
          requestId: message.requestId,
          payload: message.payload || {},
        });
        sendResponse({ ok: true });
        return true;
      }
      if (type === 'W3A_CONFIRM_GET_REQUEST') {
        const req = confirmRequests.get(message.requestId);
        if (!req) {
          sendResponse({ ok: false, error: 'Request not found' });
          return true;
        }
        sendResponse({ ok: true, payload: req });
        return true;
      }
      if (type === 'W3A_CONFIRM_RESULT') {
        confirmResults.set(message.requestId, {
          requestId: message.requestId,
          ok: !!message.ok,
          payload: message.payload || {},
        });
        sendResponse({ ok: true });
        return true;
      }
      if (type === 'W3A_CONFIRM_WAIT_RESULT') {
        const res = confirmResults.get(message.requestId);
        if (!res) {
          sendResponse({ ok: false, pending: true });
          return true;
        }
        // One-shot delivery
        confirmResults.delete(message.requestId);
        confirmRequests.delete(message.requestId);
        sendResponse({ ok: true, payload: res });
        return true;
      }
    } catch (err) {
      try { sendResponse({ ok: false, error: err?.message || String(err) }); } catch {}
      return true;
    }
  });
} catch {}

// Optional external messaging hook (Architecture B detection / version check).
// Web pages can call `chrome.runtime.sendMessage(<extensionId>, ...)` when the
// extension declares `externally_connectable` allowlists.
try {
  chrome.runtime.onMessageExternal.addListener((message, _sender, sendResponse) => {
    try {
      if (!message || typeof message !== 'object') return;
      if (message.type !== 'TATCHI_EXT_PING') return;
      const version = chrome.runtime.getManifest?.().version || '0.0.0';
      sendResponse({
        type: 'TATCHI_EXT_PONG',
        requestId: message.requestId,
        payload: { protocolVersion: '1.0.0', extensionVersion: version },
      });
    } catch {}
  });
} catch {}
