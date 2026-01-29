import { isObject } from '@/utils/validation';
import type { ChildToParentEnvelope, ReadyPayload } from '../shared/messages';
import { IframeMessage } from './iframe-messages';

export type HandshakeResult = {
  port: MessagePort;
  readyPayload: ReadyPayload | null;
};

export type HandshakeOptions = {
  iframe: HTMLIFrameElement;
  connectTimeoutMs: number;
  getTargetOrigin: (attempt: number) => string;
  serviceUrl?: string;
  debug?: boolean;
  signal?: AbortSignal;
};

function abortError(): Error {
  const err = new Error('Handshake aborted');
  (err as { name?: string }).name = 'AbortError';
  return err;
}

export async function handshakeIframe(opts: HandshakeOptions): Promise<HandshakeResult> {
  let resolved = false;
  let attempt = 0;
  let warnedNullOrigin = false;
  const start = Date.now();
  const overallTimeout = opts.connectTimeoutMs;

  return await new Promise<HandshakeResult>((resolve, reject) => {
    const onAbort = () => {
      if (resolved) return;
      resolved = true;
      reject(abortError());
    };
    if (opts.signal) {
      if (opts.signal.aborted) {
        onAbort();
        return;
      }
      opts.signal.addEventListener('abort', onAbort, { once: true });
    }

    const tick = () => {
      if (resolved) return;
      const elapsed = Date.now() - start;
      if (elapsed >= overallTimeout) {
        resolved = true;
        if (opts.debug) {
          console.debug('[IframeTransport] handshake timeout after %d ms', elapsed);
        }
        reject(new Error('Wallet iframe READY timeout'));
        return;
      }
      if (opts.signal?.aborted) {
        onAbort();
        return;
      }

      attempt += 1;
      const channel = new MessageChannel();
      const port1 = channel.port1;
      const port2 = channel.port2;
      const cleanup = () => { try { port1.onmessage = null; } catch {} };

      port1.onmessage = (e: MessageEvent<ChildToParentEnvelope>) => {
        const data = e.data;
        if (data.type === IframeMessage.Ready) {
          const payload = (data as { payload?: unknown }).payload;
          const readyPayload = (() => {
            if (!payload || !isObject(payload)) return null;
            const pv = (payload as { protocolVersion?: unknown }).protocolVersion;
            return typeof pv === 'string' && pv.length > 0 ? ({ protocolVersion: pv } as ReadyPayload) : null;
          })();
          resolved = true;
          cleanup();
          port1.start?.();
          resolve({ port: port1, readyPayload });
          return;
        }
      };

      // Ensure the receiving side is actively listening before we post the CONNECT
      try { port1.start?.(); } catch {}

      const cw = opts.iframe.contentWindow;
      if (!cw) {
        resolved = true;
        cleanup();
        reject(new Error('Wallet iframe window missing'));
        return;
      }
      const targetOrigin = opts.getTargetOrigin(attempt);
      warnedNullOrigin = postConnectMessage(
        cw,
        { type: IframeMessage.Connect },
        port2,
        targetOrigin,
        warnedNullOrigin,
        elapsed,
        attempt,
        opts.serviceUrl,
        opts.debug,
      );

      // Schedule next tick if not resolved yet (light backoff to reduce spam)
      const interval = attempt < 10 ? 200 : attempt < 20 ? 400 : 800;
      setTimeout(() => { if (!resolved) tick(); }, interval);
    };

    tick();
  });
}

function postConnectMessage(
  cw: Window,
  data: unknown,
  port2: MessagePort,
  targetOrigin: string,
  warnedNullOrigin: boolean,
  elapsed: number,
  attempt: number,
  serviceUrl?: string,
  debug?: boolean,
): boolean {
  try {
    cw.postMessage(data, targetOrigin, [port2]);
    return warnedNullOrigin;
  } catch (e) {
    const message = e instanceof Error ? e.message ?? String(e) : String(e);
    if (!warnedNullOrigin && message.includes("'null'")) {
      warnedNullOrigin = true;
      if (serviceUrl) {
        console.warn('[IframeTransport] CONNECT blocked; iframe origin appears to be null. Check that %s is reachable and responds with Cross-Origin-Resource-Policy: cross-origin.', serviceUrl);
      } else {
        console.warn('[IframeTransport] CONNECT blocked; iframe origin appears to be null.');
      }
    }
    // Attempt wildcard fallback and continue retries
    try { cw.postMessage(data, '*', [port2]); } catch {}
    if (debug) {
      console.debug('[IframeTransport] CONNECT attempt %d threw after %d ms; retrying.', attempt, elapsed);
    }
    return warnedNullOrigin;
  }
}
