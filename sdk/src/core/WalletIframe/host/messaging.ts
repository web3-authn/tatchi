import type {
  ChildToParentEnvelope,
  ParentToChildEnvelope,
  ReadyPayload,
} from '../shared/messages';
import type { HostContext } from './context';

export function post(ctx: HostContext, msg: ChildToParentEnvelope): void {
  try { ctx.port?.postMessage(msg); } catch {}
}

export function postToParent(ctx: HostContext, message: unknown): void {
  const parentWindow = window.parent;
  if (!parentWindow) return;
  const target = ctx.parentOrigin && ctx.parentOrigin !== 'null' ? ctx.parentOrigin : '*';
  try { parentWindow.postMessage(message, target); } catch {}
}

export function adoptPort(
  ctx: HostContext,
  p: MessagePort,
  onPortMessage: (ev: MessageEvent<ParentToChildEnvelope>) => void,
  protocolVersion: ReadyPayload['protocolVersion']
): void {
  ctx.port = p;
  try { ctx.port.onmessage = (ev) => onPortMessage(ev as MessageEvent<ParentToChildEnvelope>); } catch {}
  try { ctx.port.start?.(); } catch {}
  post(ctx, { type: 'READY', payload: { protocolVersion } });
}

/**
 * Gate whether we should adopt a transferred MessagePort for CONNECT.
 *
 * - Improves security by preventing a non-parent window from hijacking the MessagePort.
 * - Keeps the handshake robust: it tolerates early ‘null’ origins, supports retries,
 *   and binds adoption to the real parent.
 */
function shouldAcceptConnectEvent(e: MessageEvent, hasAdoptedPort: boolean): boolean {
  if (hasAdoptedPort) return false;
  try {
    const src = (e as MessageEvent).source as Window | null;
    if (src !== window.parent) return false;
  } catch {}
  return true;
}

export function onWindowMessage(
  ctx: HostContext,
  e: MessageEvent,
  onPortMessage: (ev: MessageEvent<ParentToChildEnvelope>) => void,
  protocolVersion: ReadyPayload['protocolVersion']
): void {
  const { data, ports } = e as MessageEvent & { ports?: MessagePort[] };
  if (!data || typeof data !== 'object') return;
  if ((data as { type?: unknown }).type === 'CONNECT' && ports && ports[0]) {
    if (!shouldAcceptConnectEvent(e, !!ctx.port)) return;
    if (typeof e.origin === 'string' && e.origin.length && e.origin !== 'null') {
      ctx.parentOrigin = e.origin;
    }
    adoptPort(ctx, ports[0], onPortMessage, protocolVersion);
  }
}

export function addHostListeners(
  ctx: HostContext,
  onPortMessage: (ev: MessageEvent<ParentToChildEnvelope>) => void,
  protocolVersion: ReadyPayload['protocolVersion']
): void {
  const bound = (e: MessageEvent) => onWindowMessage(ctx, e, onPortMessage, protocolVersion);
  ctx.onWindowMessage = bound;
  window.addEventListener('message', bound);
}

export function removeHostListeners(ctx: HostContext): void {
  if (ctx.onWindowMessage) {
    window.removeEventListener('message', ctx.onWindowMessage);
    ctx.onWindowMessage = undefined;
  }
}
