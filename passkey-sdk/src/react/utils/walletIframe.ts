// Utilities for coordinating with the wallet iframe (PasskeyManagerIframe)

/**
 * Await wallet iframe readiness when using PasskeyManagerIframe.
 * - If the passed manager is not iframe-capable, resolves immediately (returns false).
 * - If iframe is already ready, resolves immediately (returns true).
 * - Otherwise waits for onReady/polling up to timeoutMs, then resolves (returns whether it became ready).
 */
export async function awaitWalletIframeReady(
  manager: any,
  opts?: { timeoutMs?: number }
): Promise<boolean> {
  const timeoutMs = Math.max(250, Math.min(10_000, opts?.timeoutMs ?? 1500));

  if (!manager || (typeof manager !== 'object' && typeof manager !== 'function')) return false;

  const getClient = (): any => {
    try { return (typeof manager.getServiceClient === 'function') ? manager.getServiceClient() : null; } catch { return null; }
  };
  const client = getClient();

  const isReadyNow = (): boolean => {
    try { if (typeof manager.isReady === 'function' && manager.isReady()) return true; } catch {}
    try { if (client && typeof client.isReady === 'function' && client.isReady()) return true; } catch {}
    return false;
  };

  // Kick init if available (no-op if already initialized)
  try { if (typeof manager.initWalletIframe === 'function') await manager.initWalletIframe(); } catch {}

  if (!('isReady' in (manager || {})) && !client) {
    // Not an iframe-capable manager; nothing to wait for
    return false;
  }

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

    // Subscribe to whichever onReady is available
    let offMgr: (() => void) | undefined;
    let offCli: (() => void) | undefined;
    try {
      if (typeof manager.onReady === 'function') {
        offMgr = manager.onReady(() => finish(true));
      }
    } catch {}
    try {
      const c = getClient();
      if (c && typeof c.onReady === 'function') {
        offCli = c.onReady(() => finish(true));
      }
    } catch {}

    // Poll as a backup in case onReady is not provided
    const start = Date.now();
    const poll = async () => {
      if (done) return;
      if (isReadyNow()) { finish(true); return; }
      if (Date.now() - start >= timeoutMs) { finish(false); return; }
      setTimeout(poll, 100);
    };
    poll();

    const timer = setTimeout(() => finish(false), timeoutMs + 50) as unknown as number;
  });
}

