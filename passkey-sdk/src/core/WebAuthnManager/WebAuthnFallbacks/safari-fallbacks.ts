// Safari/WebAuthn fallbacks: centralized retry + top-level bridge
// - Encapsulates Safari-specific error handling (ancestor-origin, not-focused)
// - Bridges create/get to top-level via postMessage when needed
// - Keeps helpers private to reduce file count and surface area

type Kind = 'create' | 'get';

type BridgeKind = 'WALLET_WEBAUTHN_CREATE' | 'WALLET_WEBAUTHN_GET';

type BridgeClient = {
  request(
    kind: BridgeKind,
    publicKey: PublicKeyCredentialCreationOptions | PublicKeyCredentialRequestOptions,
    timeoutMs?: number,
  ): Promise<unknown | null>;
};

export interface OrchestratorDeps {
  rpId: string;
  inIframe: boolean;
  timeoutMs?: number;
  bridgeClient?: BridgeClient;
  // Gate for ancestor-error on GET; bridges for focus errors are always allowed when in iframe.
  permitGetBridgeOnAncestorError?: boolean;
}

export async function executeWithFallbacks(
  kind: Kind,
  publicKey: PublicKeyCredentialCreationOptions | PublicKeyCredentialRequestOptions,
  deps: OrchestratorDeps,
): Promise<PublicKeyCredential | unknown> {
  const { rpId, inIframe, timeoutMs = 60000, permitGetBridgeOnAncestorError = true } = deps;
  const bridgeClient = deps.bridgeClient || new ParentBridgeClient();

  const tryNative = async () => {
    return kind === 'create'
      ? await navigator.credentials.create({ publicKey: publicKey as PublicKeyCredentialCreationOptions })
      : await navigator.credentials.get({ publicKey: publicKey as PublicKeyCredentialRequestOptions });
  };

  // For create(): if iframe host differs from rpId, prefer top-level bridge so clientDataJSON.origin aligns.
  if (kind === 'create' && inIframe) {
    try {
      const host = window.location.hostname;
      if (host && rpId && host !== rpId) {
        const bridged = await bridgeClient.request('WALLET_WEBAUTHN_CREATE', publicKey as PublicKeyCredentialCreationOptions, timeoutMs);
        if (bridged) return bridged;
      }
    } catch {}
  }

  try {
    return await tryNative();
  } catch (e: unknown) {
    // Ancestor origin restriction: bridge when in iframe
    if (isAncestorOriginError(e) && inIframe) {
      if (kind === 'get' && !permitGetBridgeOnAncestorError) {
        throw e;
      }
      const bridged = await bridge(kind, publicKey, bridgeClient, timeoutMs);
      if (bridged) return bridged;
    }

    // Document-not-focused: refocus and retry, then bridge if still blocked and in iframe
    if (isDocumentNotFocusedError(e)) {
      const focused = await attemptRefocus();
      if (focused) {
        try { return await tryNative(); } catch {}
      }
      if (inIframe) {
        const bridged = await bridge(kind, publicKey, bridgeClient, timeoutMs);
        if (bridged) return bridged;
      }
    }

    throw e;
  }
}

async function bridge(
  kind: Kind,
  publicKey: PublicKeyCredentialCreationOptions | PublicKeyCredentialRequestOptions,
  client: BridgeClient,
  timeoutMs: number,
): Promise<unknown | null> {
  if (kind === 'create') {
    return client.request('WALLET_WEBAUTHN_CREATE', publicKey as PublicKeyCredentialCreationOptions, timeoutMs);
  }
  return client.request('WALLET_WEBAUTHN_GET', publicKey as PublicKeyCredentialRequestOptions, timeoutMs);
}

// Private: Parent-bridge client via postMessage
class ParentBridgeClient implements BridgeClient {
  async request(
    kind: BridgeKind,
    publicKey: PublicKeyCredentialCreationOptions | PublicKeyCredentialRequestOptions,
    timeoutMs = 60000,
  ): Promise<unknown | null> {
    const requestId = `${kind}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    const resultType = kind === 'WALLET_WEBAUTHN_GET' ? 'WALLET_WEBAUTHN_GET_RESULT' : 'WALLET_WEBAUTHN_CREATE_RESULT';

    return new Promise((resolve) => {
      let settled = false;
      const finish = (val: unknown | null) => { if (!settled) { settled = true; resolve(val); } };

      const onMessage = (ev: MessageEvent) => {
        const payload = ev?.data as unknown;
        if (!payload || typeof (payload as { type?: unknown }).type !== 'string') return;
        const t = (payload as { type: string }).type;
        if (t !== resultType) return;
        const rid = (payload as { requestId?: unknown }).requestId;
        if (rid !== requestId) return;
        try { window.removeEventListener('message', onMessage); } catch {}
        const ok = !!(payload as { ok?: unknown }).ok;
        const cred = (payload as { credential?: unknown }).credential;
        finish(ok && cred ? cred : null);
      };
      window.addEventListener('message', onMessage);
      try { window.parent?.postMessage({ type: kind, requestId, publicKey }, '*'); } catch {}
      setTimeout(() => { try { window.removeEventListener('message', onMessage); } catch {}; finish(null); }, timeoutMs);
    });
  }
}

// Private: error classification helpers
function isAncestorOriginError(err: unknown): boolean {
  const msg = safeMessage(err);
  return /origin of the document is not the same as its ancestors/i.test(msg);
}

function isDocumentNotFocusedError(err: unknown): boolean {
  const name = safeName(err);
  const msg = safeMessage(err);
  const isNotAllowed = name === 'NotAllowedError';
  const mentionsFocus = /document is not focused|not focused|focus/i.test(msg);
  return Boolean(isNotAllowed && mentionsFocus);
}

function safeMessage(err: unknown): string {
  return String((err as { message?: unknown })?.message || '');
}

function safeName(err: unknown): string {
  const n = (err as { name?: unknown })?.name;
  return typeof n === 'string' ? n : '';
}

// Private: focus utility to mitigate Safari focus issues
async function attemptRefocus(maxRetries = 2, delays: number[] = [50, 120]): Promise<boolean> {
  try { (window as any).focus?.(); } catch {}
  try { (document?.body as any)?.focus?.(); } catch {}

  const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
  const total = Math.max(0, maxRetries);
  for (let i = 0; i <= total; i++) {
    const d = delays[i] ?? delays[delays.length - 1] ?? 80;
    await wait(d);
    try { if (document.hasFocus()) return true; } catch {}
    try { (window as any).focus?.(); } catch {}
  }
  try { return document.hasFocus(); } catch { return false; }
}

