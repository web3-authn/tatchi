import { isObject } from '@/utils/validation';
import { serializeRegistrationCredentialWithPRF, serializeAuthenticationCredentialWithPRF } from '../../WebAuthnManager/credentialsHelpers';
import { WebAuthnBridgeMessage } from '../../WebAuthnManager/WebAuthnFallbacks';

type CreateReq = { requestId?: string; publicKey?: PublicKeyCredentialCreationOptions };
type GetReq = { requestId?: string; publicKey?: PublicKeyCredentialRequestOptions };

export type WebAuthnBridge = {
  handleMessage: (
    kind: typeof WebAuthnBridgeMessage.Create | typeof WebAuthnBridgeMessage.Get,
    raw: unknown,
    event: MessageEvent
  ) => void;
};

type WebAuthnBridgeOptions = {
  walletOrigin: string;
};

export function createWebAuthnBridge(opts: WebAuthnBridgeOptions): WebAuthnBridge {
  const formatBridgeError = (err: unknown): string => (err instanceof Error ? err.message : String(err));

  const postBridgeResult = (
    source: WindowProxy | null,
    type: 'WALLET_WEBAUTHN_CREATE_RESULT' | 'WALLET_WEBAUTHN_GET_RESULT',
    requestId: string,
    ok: boolean,
    payload: { credential?: unknown; error?: string },
  ): void => {
    // Reply directly to the requesting wallet iframe window and scope by the expected wallet origin.
    // If the iframe is misconfigured and has an opaque origin, fall back to '*' to avoid hard failures.
    try {
      source?.postMessage({ type, requestId, ok, ...payload }, opts.walletOrigin);
    } catch {
      try { source?.postMessage({ type, requestId, ok, ...payload }, '*'); } catch {}
    }
  };

  const handleWebAuthnCreate = async (req: CreateReq, e: MessageEvent): Promise<void> => {
    const requestId = req?.requestId || '';
    if (!isObject(req?.publicKey)) {
      postBridgeResult(e.source as WindowProxy | null, WebAuthnBridgeMessage.CreateResult, requestId, false, { error: 'publicKey options required' });
      return;
    }
    if (!navigator.credentials?.create) {
      postBridgeResult(e.source as WindowProxy | null, WebAuthnBridgeMessage.CreateResult, requestId, false, { error: 'WebAuthn create not available' });
      return;
    }
    try {
      const src = req.publicKey as PublicKeyCredentialCreationOptions;
      const rpName = src.rp?.name || 'WebAuthn';
      const rpId = src.rp?.id || window.location.hostname;
      const pub: PublicKeyCredentialCreationOptions = { ...src, rp: { name: rpName, id: rpId } };
      const cred = await navigator.credentials.create({ publicKey: pub }) as PublicKeyCredential;
      const serialized = serializeRegistrationCredentialWithPRF({ credential: cred, firstPrfOutput: true, secondPrfOutput: true });
      postBridgeResult(e.source as WindowProxy | null, WebAuthnBridgeMessage.CreateResult, requestId, true, { credential: serialized });
    } catch (err) {
      const message = formatBridgeError(err);
      console.warn('[IframeTransport][bridge] CREATE failed', { requestId, err: message });
      postBridgeResult(e.source as WindowProxy | null, WebAuthnBridgeMessage.CreateResult, requestId, false, { error: message });
    }
  };

  const handleWebAuthnGet = async (req: GetReq, e: MessageEvent): Promise<void> => {
    const requestId = req?.requestId || '';
    if (!isObject(req?.publicKey)) {
      postBridgeResult(e.source as WindowProxy | null, WebAuthnBridgeMessage.GetResult, requestId, false, { error: 'publicKey options required' });
      return;
    }
    if (!navigator.credentials?.get) {
      postBridgeResult(e.source as WindowProxy | null, WebAuthnBridgeMessage.GetResult, requestId, false, { error: 'WebAuthn get not available' });
      return;
    }
    try {
      const src = req.publicKey as PublicKeyCredentialRequestOptions;
      const rpId = src.rpId || window.location.hostname;
      const pub: PublicKeyCredentialRequestOptions = { ...src, rpId };
      const cred = await navigator.credentials.get({ publicKey: pub }) as PublicKeyCredential;
      const serialized = serializeAuthenticationCredentialWithPRF({ credential: cred, firstPrfOutput: true, secondPrfOutput: true });
      postBridgeResult(e.source as WindowProxy | null, WebAuthnBridgeMessage.GetResult, requestId, true, { credential: serialized });
    } catch (err) {
      const message = formatBridgeError(err);
      console.warn('[IframeTransport][bridge] GET failed', { requestId, err: message });
      postBridgeResult(e.source as WindowProxy | null, WebAuthnBridgeMessage.GetResult, requestId, false, { error: message });
    }
  };

  return {
    handleMessage: (kind, raw, e) => {
      if (kind === WebAuthnBridgeMessage.Create) {
        void handleWebAuthnCreate(raw as CreateReq, e);
        return;
      }
      void handleWebAuthnGet(raw as GetReq, e);
    },
  };
}
