import {
  serializeAuthenticationCredentialWithPRF,
  serializeRegistrationCredentialWithPRF,
} from '../../../WebAuthnManager/credentialsHelpers';
import { base64UrlDecode } from '../../../../utils/encoders';

declare const chrome: any;

type PopupKind = 'create' | 'get';

type PopupRequest = {
  type: 'WALLET_POPUP_REQUEST';
  payload: {
    requestId: string;
    kind: PopupKind;
    options: PublicKeyCredentialCreationOptions | PublicKeyCredentialRequestOptions;
  };
};

type PopupResultOk = { ok: true; payload: { credential: unknown } };
type PopupResultErr = { ok: false; payload: { error: string } };
type PopupResult = (PopupResultOk | PopupResultErr) & {
  type: 'WALLET_POPUP_RESULT';
  requestId: string;
};

function setStatus(text: string): void {
  const el = document.getElementById('status');
  if (el) el.textContent = text;
}

function ensureContinueButton(): HTMLButtonElement {
  let btn = document.getElementById('continue') as HTMLButtonElement | null;
  if (btn) return btn;
  btn = document.createElement('button');
  btn.id = 'continue';
  btn.type = 'button';
  btn.textContent = 'Continue';
  btn.style.marginTop = '16px';
  btn.style.padding = '12px 18px';
  btn.style.borderRadius = '12px';
  // Extension pages can inherit styles from bundled CSS; force readable defaults.
  btn.style.border = '1px solid rgba(0,0,0,0.2)';
  btn.style.background = 'rgba(40,40,40,0.8)';
  btn.style.color = 'white';
  btn.style.cursor = 'pointer';
  document.body.appendChild(btn);
  return btn;
}

function postResult(targetOrigin: string, result: PopupResult): void {
  try {
    window.opener?.postMessage(result, targetOrigin);
  } catch {
    window.opener?.postMessage(result, '*');
  }
}

function describeValue(value: unknown): string {
  try {
    if (value == null) return String(value);
    if (typeof value === 'string') return `string(len=${value.length})`;
    if (typeof value === 'number') return `number(${value})`;
    if (Array.isArray(value)) return `array(len=${value.length})`;
    if (value instanceof ArrayBuffer) return `ArrayBuffer(byteLength=${value.byteLength})`;
    if (ArrayBuffer.isView(value)) return `${value.constructor?.name || 'ArrayBufferView'}(byteLength=${value.byteLength})`;
    if (typeof value === 'object') {
      const keys = Object.keys(value as Record<string, unknown>).slice(0, 10);
      return `object(keys=${keys.join(',')}${keys.length >= 10 ? ',…' : ''})`;
    }
    return typeof value;
  } catch {
    return 'unknown';
  }
}

function coerceToBufferSource(value: unknown, label: string): ArrayBufferView {
  if (value == null) throw new Error(`Invalid BufferSource (${label}): ${describeValue(value)}`);
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    // Ensure we return a Uint8Array view to keep downstream operations consistent.
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }

  if (typeof value === 'string') {
    // We expect base64url strings for BufferSources when messages are forced through JSON-ish transports.
    return base64UrlDecode(value);
  }

  if (Array.isArray(value) && value.every((x) => typeof x === 'number')) {
    return Uint8Array.from(value);
  }

  // Handle common JSON shapes (Buffer/Uint8Array)
  if (typeof value === 'object') {
    const v = value as any;
    const data = v?.data;
    const bytes = v?.bytes;
    if (typeof data === 'string') return base64UrlDecode(data);
    if (typeof bytes === 'string') return base64UrlDecode(bytes);
    if (Array.isArray(data) && data.every((x: any) => typeof x === 'number')) return Uint8Array.from(data);
    if (Array.isArray(bytes) && bytes.every((x: any) => typeof x === 'number')) return Uint8Array.from(bytes);
    if (v?.type === 'Uint8Array' && Array.isArray(v?.data)) return Uint8Array.from(v.data);

    // Array-like objects: {0:...,1:...,..., length:n}
    const len = Number(v?.length);
    if (Number.isFinite(len) && len >= 0 && len <= 4096) {
      const out = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        const n = Number(v[i]);
        if (!Number.isFinite(n)) {
          throw new Error(`Invalid BufferSource (${label}) at index ${i}: ${describeValue(value)}`);
        }
        out[i] = n & 0xff;
      }
      return out;
    }

    // Numeric-keyed objects without an explicit length (common after JSON-ish cloning):
    // { "0": 12, "1": 34, ... }.
    try {
      const keys = Object.keys(v);
      const numericKeys = keys
        .filter((k) => /^\d+$/.test(k))
        .map((k) => Number(k))
        .filter((n) => Number.isFinite(n) && n >= 0)
        .sort((a, b) => a - b);
      if (numericKeys.length > 0) {
        const max = numericKeys[numericKeys.length - 1]!;
        // Keep this conservative to avoid allocating huge arrays on malformed input.
        if (max >= 0 && max <= 4096 && numericKeys[0] === 0) {
          const out = new Uint8Array(max + 1);
          for (let i = 0; i <= max; i++) {
            const n = Number(v[i]);
            if (!Number.isFinite(n)) {
              throw new Error(`Invalid BufferSource (${label}) at index ${i}: ${describeValue(value)}`);
            }
            out[i] = n & 0xff;
          }
          return out;
        }
      }
    } catch {
      // ignore and fall through to other shapes
    }

    // View-like objects: { buffer, byteOffset, byteLength }
    if (v?.buffer != null && v?.byteLength != null) {
      const base = coerceToBufferSource(v.buffer, `${label}.buffer`) as Uint8Array;
      const byteOffset = Number(v.byteOffset || 0);
      const byteLength = Number(v.byteLength);
      if (Number.isFinite(byteOffset) && Number.isFinite(byteLength) && byteOffset >= 0 && byteLength >= 0) {
        return base.slice(byteOffset, byteOffset + byteLength);
      }
    }
  }

  throw new Error(`Invalid BufferSource (${label}): ${describeValue(value)}`);
}

function normalizeCreateOptions(
  input: PublicKeyCredentialCreationOptions | unknown,
): PublicKeyCredentialCreationOptions {
  const opts = (input && typeof input === 'object') ? (input as any) : {};
  const pk: any = { ...opts };

  pk.challenge = coerceToBufferSource(pk.challenge, 'challenge');

  if (pk.user) {
    pk.user = { ...pk.user, id: coerceToBufferSource(pk.user.id, 'user.id') };
  }

  if (Array.isArray(pk.excludeCredentials)) {
    pk.excludeCredentials = pk.excludeCredentials.map((c: any) => ({
      ...c,
      id: coerceToBufferSource(c.id, 'excludeCredentials[].id'),
    }));
  }

  // PRF extension salts must be BufferSource
  const prfEval = pk?.extensions?.prf?.eval;
  if (prfEval && typeof prfEval === 'object') {
    pk.extensions = { ...(pk.extensions || {}) };
    pk.extensions.prf = { ...(pk.extensions.prf || {}) };
    pk.extensions.prf.eval = {
      ...prfEval,
      ...(prfEval.first != null ? { first: coerceToBufferSource(prfEval.first, 'extensions.prf.eval.first') } : {}),
      ...(prfEval.second != null ? { second: coerceToBufferSource(prfEval.second, 'extensions.prf.eval.second') } : {}),
    };
  }

  return pk as PublicKeyCredentialCreationOptions;
}

function normalizeGetOptions(
  input: PublicKeyCredentialRequestOptions | unknown,
): PublicKeyCredentialRequestOptions {
  const opts = (input && typeof input === 'object') ? (input as any) : {};
  const pk: any = { ...opts };

  pk.challenge = coerceToBufferSource(pk.challenge, 'challenge');

  if (Array.isArray(pk.allowCredentials)) {
    pk.allowCredentials = pk.allowCredentials.map((c: any) => ({
      ...c,
      id: coerceToBufferSource(c.id, 'allowCredentials[].id'),
    }));
  }

  const prfEval = pk?.extensions?.prf?.eval;
  if (prfEval && typeof prfEval === 'object') {
    pk.extensions = { ...(pk.extensions || {}) };
    pk.extensions.prf = { ...(pk.extensions.prf || {}) };
    pk.extensions.prf.eval = {
      ...prfEval,
      ...(prfEval.first != null ? { first: coerceToBufferSource(prfEval.first, 'extensions.prf.eval.first') } : {}),
      ...(prfEval.second != null ? { second: coerceToBufferSource(prfEval.second, 'extensions.prf.eval.second') } : {}),
    };
  }

  return pk as PublicKeyCredentialRequestOptions;
}

async function runWebAuthn(
  kind: PopupKind,
  options: PublicKeyCredentialCreationOptions | PublicKeyCredentialRequestOptions,
): Promise<unknown> {
  if (kind === 'create') {
    const normalized = normalizeCreateOptions(options);
    const cred = await navigator.credentials.create({ publicKey: normalized });
    if (!cred) throw new Error('navigator.credentials.create returned null');
    return serializeRegistrationCredentialWithPRF({
      credential: cred as PublicKeyCredential,
      firstPrfOutput: true,
      secondPrfOutput: true,
    });
  }
  const normalized = normalizeGetOptions(options);
  const cred = await navigator.credentials.get({ publicKey: normalized });
  if (!cred) throw new Error('navigator.credentials.get returned null');
  return serializeAuthenticationCredentialWithPRF({
    credential: cred as PublicKeyCredential,
    firstPrfOutput: true,
    secondPrfOutput: true,
  });
}

async function main() {
  console.log('[PopupHost] Booting...');

  let pending: PopupRequest['payload'] | null = null;
  let requestOrigin = '*';

  const btn = ensureContinueButton();
  btn.disabled = true;
  setStatus('Waiting for request…');

  const loadFromStorage = async () => {
    try {
      const rid = new URLSearchParams(window.location.search).get('rid');
      if (!rid) return;
      // Prefer runtime messaging to load the request payload. This avoids relying on chrome.storage
      // for WebAuthn options, which may contain non-JSON values (ArrayBuffers) in some browsers.
      try {
        const resp = await new Promise<any>((resolve) => {
          chrome?.runtime?.sendMessage?.({ type: 'W3A_POPUP_GET_REQUEST', requestId: rid }, resolve);
        });
        const err = chrome?.runtime?.lastError;
        if (!err && resp?.ok && resp?.payload?.requestId === rid) {
          pending = {
            requestId: resp.payload.requestId,
            kind: resp.payload.kind,
            options: resp.payload.options,
          };
          btn.disabled = false;
          setStatus(pending.kind === 'create' ? 'Click Continue to create passkey' : 'Click Continue to authenticate');
          return;
        }
      } catch { }

      const key = `__w3a_popup_request__:${rid}`;
      const bucket = chrome?.storage?.session || chrome?.storage?.local;
      const get = bucket?.get;
      if (typeof get !== 'function') return;
      const res = await new Promise<any>((resolve) => get.call(bucket, [key], resolve));
      const payload = res?.[key];
      if (!payload || payload.requestId !== rid) return;
      pending = {
        requestId: payload.requestId,
        kind: payload.kind,
        options: payload.options,
      };
      btn.disabled = false;
      setStatus(pending.kind === 'create' ? 'Click Continue to create passkey' : 'Click Continue to authenticate');
    } catch {
      // ignore
    }
  };

  const start = async () => {
    if (!pending) return;
    btn.disabled = true;
    setStatus(pending.kind === 'create' ? 'Creating passkey…' : 'Authenticating…');
    try {
      const credential = await runWebAuthn(pending.kind, pending.options);
      // Prefer extension runtime messaging (works even when window.opener is null).
      try {
        chrome?.runtime?.sendMessage?.({
          type: 'W3A_POPUP_RESULT',
          requestId: pending.requestId,
          ok: true,
          payload: { credential },
        });
      } catch { }

      postResult(requestOrigin, { type: 'WALLET_POPUP_RESULT', requestId: pending.requestId, ok: true, payload: { credential } });
      setStatus('Done');
      setTimeout(() => window.close(), 250);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      try {
        chrome?.runtime?.sendMessage?.({
          type: 'W3A_POPUP_RESULT',
          requestId: pending.requestId,
          ok: false,
          payload: { error: message || 'Popup operation failed' },
        });
      } catch { }

      postResult(requestOrigin, { type: 'WALLET_POPUP_RESULT', requestId: pending.requestId, ok: false, payload: { error: message || 'Popup operation failed' } });
      setStatus(message || 'Error');
      setTimeout(() => window.close(), 1500);
    }
  };

  // WebAuthn requires a transient user activation in the *same* document that calls
  // `navigator.credentials.*`. We therefore wait for an explicit click inside the popup
  // before starting create/get.
  btn.addEventListener('click', () => { void start(); }, { passive: true });

  window.addEventListener('message', (e) => {
    const data = e.data as PopupRequest | undefined;
    if (!data || data.type !== 'WALLET_POPUP_REQUEST' || !data.payload) return;
    pending = data.payload;
    requestOrigin = e.origin || '*';
    btn.disabled = false;
    setStatus(pending.kind === 'create' ? 'Click Continue to create passkey' : 'Click Continue to authenticate');
  });

  window.opener?.postMessage({ type: 'WALLET_POPUP_READY' }, '*');
  await loadFromStorage();
}

main().catch(console.error);
