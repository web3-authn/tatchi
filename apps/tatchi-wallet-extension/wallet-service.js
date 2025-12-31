const PROTOCOL_VERSION = '1.0.0';

const originEl = document.getElementById('origin');
const rpidEl = document.getElementById('rpid');
const portStatusEl = document.getElementById('portStatus');
const logEl = document.getElementById('log');

const accountIdEl = document.getElementById('accountId');
const btnCreate = document.getElementById('btnCreate');
const btnGet = document.getElementById('btnGet');

function log(line, data) {
  const ts = new Date().toISOString();
  const suffix = data === undefined ? '' : ` ${safeJson(data)}`;
  const msg = `${ts} ${line}${suffix}`;
  logEl.textContent = `${msg}\n` + (logEl.textContent || '');
  try { console.debug('[wallet-service]', line, data); } catch {}
}

// Best-effort boot hint for the parent IframeTransport.
// When received, the parent switches CONNECT posts from targetOrigin='*' to the strict extension origin,
// which improves MessagePort transfer reliability in stricter environments.
try {
  window.parent?.postMessage({ type: 'SERVICE_HOST_BOOTED' }, '*');
} catch {}

function safeJson(x) {
  try {
    return JSON.stringify(x, (_k, v) => {
      if (v instanceof ArrayBuffer) return `ArrayBuffer(${v.byteLength})`;
      if (v instanceof Uint8Array) return `Uint8Array(${v.byteLength})`;
      return v;
    }, 2);
  } catch {
    return String(x);
  }
}

function setPortStatus(s) {
  if (!portStatusEl) return;
  portStatusEl.textContent = s;
}

function getRpId() {
  try {
    // In extension origins, hostname is the extension id.
    return new URL(window.location.href).hostname || '';
  } catch {
    return '';
  }
}

async function sha256Bytes(str) {
  const bytes = new TextEncoder().encode(str);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return new Uint8Array(hash);
}

function randomBytes(n) {
  const out = new Uint8Array(n);
  crypto.getRandomValues(out);
  return out;
}

function bytesToHex(u8) {
  return Array.from(u8).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function prfSalts(accountId) {
  // Deterministic salts so repeated GET calls can compare outputs.
  const first = await sha256Bytes(`${accountId}|tatchi|prf|first`);
  const second = await sha256Bytes(`${accountId}|tatchi|prf|second`);
  return { first, second };
}

function summarizePrfResults(credential) {
  try {
    const ext = credential?.getClientExtensionResults?.() || {};
    const prf = ext?.prf || {};
    const results = prf?.results || {};
    const first = results?.first ? new Uint8Array(results.first) : null;
    const second = results?.second ? new Uint8Array(results.second) : null;
    return {
      hasPrf: !!prf,
      hasResults: !!results,
      first: first ? `${first.byteLength} bytes: ${bytesToHex(first.slice(0, 8))}…` : null,
      second: second ? `${second.byteLength} bytes: ${bytesToHex(second.slice(0, 8))}…` : null,
    };
  } catch (err) {
    return { error: String(err?.message || err) };
  }
}

async function createPasskeyWithPrf(accountId) {
  const rpId = getRpId();
  const challenge = randomBytes(32);
  const userId = randomBytes(32);
  const { first, second } = await prfSalts(accountId);

  const publicKey = {
    challenge,
    rp: { name: 'Tatchi Extension Wallet', id: rpId },
    user: {
      id: userId,
      name: accountId,
      displayName: accountId,
    },
    pubKeyCredParams: [
      { alg: -7, type: 'public-key' },
      { alg: -257, type: 'public-key' },
    ],
    authenticatorSelection: {
      residentKey: 'required',
      userVerification: 'preferred',
    },
    timeout: 60_000,
    attestation: 'none',
    extensions: {
      prf: {
        eval: {
          first,
          second,
        },
      },
    },
  };

  log('webauthn.create: start', { rpId, accountId });
  const cred = await navigator.credentials.create({ publicKey });
  log('webauthn.create: done', { id: cred?.id, prf: summarizePrfResults(cred) });
  return cred;
}

async function getPasskeyWithPrf(accountId) {
  const rpId = getRpId();
  const challenge = randomBytes(32);
  const { first, second } = await prfSalts(accountId);

  const publicKey = {
    challenge,
    rpId,
    userVerification: 'preferred',
    timeout: 60_000,
    extensions: {
      prf: {
        eval: {
          first,
          second,
        },
      },
    },
  };

  log('webauthn.get: start', { rpId, accountId });
  const cred = await navigator.credentials.get({ publicKey });
  log('webauthn.get: done', { id: cred?.id, prf: summarizePrfResults(cred) });
  return cred;
}

// ===== MessagePort handshake (CONNECT → READY) =====

let parentOrigin = null;
let adoptedPort = null;

function postToPort(msg) {
  try { adoptedPort?.postMessage(msg); } catch {}
}

function respondOk(requestId, result) {
  postToPort({ type: 'PM_RESULT', requestId, payload: { ok: true, result } });
}

function respondErr(requestId, code, message) {
  postToPort({ type: 'ERROR', requestId, payload: { code, message } });
}

function onPortMessage(ev) {
  const req = ev.data;
  if (!req || typeof req !== 'object') return;
  const type = req.type;
  const requestId = req.requestId;

  // Minimal set to let WalletIframeRouter.init() complete in Phase 0.
  if (type === 'PING') {
    postToPort({ type: 'PONG', requestId });
    return;
  }
  if (type === 'PM_SET_CONFIG') {
    respondOk(requestId, null);
    return;
  }
  if (type === 'PM_PREFETCH_BLOCKHEIGHT') {
    respondOk(requestId, null);
    return;
  }
  if (type === 'PM_GET_LOGIN_SESSION') {
    respondOk(requestId, {
      login: {
        isLoggedIn: false,
        nearAccountId: null,
        publicKey: null,
        userData: null,
        vrfActive: false,
        vrfSessionDuration: 0,
      },
      signingSession: null,
    });
    return;
  }
  if (type === 'PM_HAS_PASSKEY') {
    // Phase 0: no persistence, no IndexedDB schema. Report "no passkey" to keep
    // the app UX functional without throwing errors.
    respondOk(requestId, false);
    return;
  }
  if (type === 'PM_GET_RECENT_LOGINS') {
    // Phase 0: no persistence. Return empty history.
    respondOk(requestId, { accountIds: [], lastUsedAccount: null });
    return;
  }

  // For Phase 0, anything else is intentionally not implemented.
  respondErr(requestId, 'NOT_IMPLEMENTED', `Phase0 extension wallet-service stub does not implement ${String(type)}`);
}

function adoptPort(p) {
  adoptedPort = p;
  adoptedPort.onmessage = onPortMessage;
  adoptedPort.start?.();
  setPortStatus('connected');
  postToPort({ type: 'READY', payload: { protocolVersion: PROTOCOL_VERSION } });
  log('MessagePort adopted', { parentOrigin });
}

function onWindowMessage(ev) {
  const data = ev.data;
  if (!data || typeof data !== 'object') return;
  if (data.type !== 'CONNECT') return;
  const port = ev.ports?.[0];
  if (!port) return;
  // Bind to first observed parent origin.
  if (!parentOrigin && typeof ev.origin === 'string' && ev.origin !== 'null') {
    parentOrigin = ev.origin;
  }
  if (adoptedPort) return;
  adoptPort(port);
}

window.addEventListener('message', onWindowMessage);

// ===== UI wiring =====

try {
  originEl.textContent = window.location.origin;
  rpidEl.textContent = getRpId() || '(empty)';
} catch {}

btnCreate?.addEventListener('click', async () => {
  try {
    const accountId = String(accountIdEl?.value || 'phase0@example');
    await createPasskeyWithPrf(accountId);
  } catch (err) {
    log('webauthn.create: error', { message: String(err?.message || err) });
  }
});

btnGet?.addEventListener('click', async () => {
  try {
    const accountId = String(accountIdEl?.value || 'phase0@example');
    await getPasskeyWithPrf(accountId);
  } catch (err) {
    log('webauthn.get: error', { message: String(err?.message || err) });
  }
});

setPortStatus('disconnected');
log('wallet-service loaded');
