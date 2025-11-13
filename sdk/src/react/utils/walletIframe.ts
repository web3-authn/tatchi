// Utilities for coordinating with the wallet iframe (TatchiPasskeyIframe)
import type { WalletIframeRouter } from '@/core/WalletIframe/client/router';
import type { TatchiPasskey } from '@/core/TatchiPasskey';

// Minimal shape for a manager that can initialize and expose a wallet iframe client
// Matches the surface provided by TatchiPasskey when iframe mode is configured
export interface WalletIframeCapableManagerLike {
  initWalletIframe?: (nearAccountId?: string) => Promise<void>;
  getWalletIframeClient?: () => WalletIframeRouter | null | undefined;
  // Some managers (e.g., TatchiPasskeyIframe) expose readiness hooks directly
  isReady?: () => boolean;
  onReady?: (cb: () => void) => () => void;
}

/**
 * Await wallet iframe readiness when using TatchiPasskeyIframe.
 * - If the passed manager is not iframe-capable, resolves immediately (returns false).
 * - If iframe is already ready, resolves immediately (returns true).
 * - Otherwise waits for onReady/polling up to timeoutMs, then resolves (returns whether it became ready).
 */
export async function awaitWalletIframeReady(
  manager: TatchiPasskey,
  opts?: { timeoutMs?: number }
): Promise<boolean> {
  const timeoutMs = Math.max(500, Math.min(15_000, opts?.timeoutMs ?? 4000));

  if (!manager || (typeof manager !== 'object' && typeof manager !== 'function')) return false;

  const getClient = (): WalletIframeRouter | null => {
    try {
      const c = manager.getWalletIframeClient?.();
      return c || null;
    } catch {}
    return null;
  };

  const isReadyNow = (): boolean => {
    try {
      const c = getClient();
      if (c && typeof c.isReady === 'function' && c.isReady()) return true;
    } catch {}
    return false;
  };

  // Only wait if the manager looks iframe-capable
  const iframeCapable = typeof manager.initWalletIframe === 'function' || typeof manager.getWalletIframeClient === 'function';
  if (!iframeCapable) return false;

  // Kick init (idempotent in implementations)
  try { if (typeof manager.initWalletIframe === 'function') await manager.initWalletIframe(); } catch {}

  if (isReadyNow()) return true;

  return await new Promise<boolean>((resolve) => {
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return; done = true;
      try { offMgr?.(); } catch {}
      try { offCli?.(); } catch {}
      try { clearTimeout(timer); } catch {}
      resolve(ok);
    };

    // Subscribe to onReady hooks if available
    let offMgr: (() => void) | undefined;
    let offCli: (() => void) | undefined;
    try {
      const c = getClient();
      if (c && typeof c.onReady === 'function') {
        offCli = c.onReady(() => finish(true));
      }
    } catch {}

    // Poll and keep nudging init as a backup
    const start = Date.now();
    const poll = async () => {
      if (done) return;
      if (isReadyNow()) { finish(true); return; }
      if (Date.now() - start >= timeoutMs) { finish(false); return; }
      // Nudge init (no-op if already initialized)
      try { if (typeof manager.initWalletIframe === 'function') await manager.initWalletIframe(); } catch {}
      setTimeout(poll, 100);
    };
    poll();

    const timer = setTimeout(() => finish(false), timeoutMs + 50) as unknown as number;
  });
}
