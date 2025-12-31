const PROTOCOL_VERSION = '0.1.0';

function safeRuntimeGetManifest() {
  try {
    return chrome.runtime.getManifest();
  } catch {
    return null;
  }
}

async function enableSidePanelOnActionClick() {
  try {
    if (!chrome.sidePanel?.setPanelBehavior) return;
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  } catch (err) {
    // Non-fatal: some Chrome channels / policies may not support Side Panel behavior yet.
    console.warn('[tatchi-ext] sidePanel.setPanelBehavior failed', err);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  void enableSidePanelOnActionClick();
});

chrome.runtime.onStartup.addListener(() => {
  void enableSidePanelOnActionClick();
});

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  try {
    if (!message || typeof message !== 'object') return;
    const msg = message;
    if (msg.type !== 'TATCHI_EXT_PING') return;

    const manifest = safeRuntimeGetManifest();
    sendResponse({
      type: 'TATCHI_EXT_PONG',
      requestId: msg.requestId,
      payload: {
        protocolVersion: PROTOCOL_VERSION,
        extensionVersion: manifest?.version || 'unknown',
      },
    });
    return true;
  } catch (err) {
    console.warn('[tatchi-ext] onMessageExternal error', err);
    try {
      sendResponse({
        type: 'TATCHI_EXT_ERROR',
        requestId: message?.requestId,
        payload: { message: String(err?.message || err || 'unknown error') },
      });
    } catch {}
    return true;
  }
});

chrome.runtime.onConnectExternal.addListener((port) => {
  try {
    const manifest = safeRuntimeGetManifest();
    port.postMessage({
      type: 'TATCHI_EXT_READY',
      payload: {
        protocolVersion: PROTOCOL_VERSION,
        extensionVersion: manifest?.version || 'unknown',
      },
    });

    port.onMessage.addListener((message) => {
      try {
        if (!message || typeof message !== 'object') return;
        const msg = message;
        if (msg.type === 'TATCHI_EXT_PING') {
          port.postMessage({
            type: 'TATCHI_EXT_PONG',
            requestId: msg.requestId,
            payload: {
              protocolVersion: PROTOCOL_VERSION,
              extensionVersion: manifest?.version || 'unknown',
            },
          });
        }
      } catch (err) {
        try {
          port.postMessage({
            type: 'TATCHI_EXT_ERROR',
            requestId: message?.requestId,
            payload: { message: String(err?.message || err || 'unknown error') },
          });
        } catch {}
      }
    });
  } catch (err) {
    console.warn('[tatchi-ext] onConnectExternal error', err);
  }
});

// Extension-internal messages (from side panel / other extension pages)
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'PANEL_PING') {
    sendResponse({ ok: true, at: Date.now() });
    return true;
  }
});
