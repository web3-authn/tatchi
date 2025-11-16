/**
 * Offline-export Service Worker priming utilities.
 *
 * - primeOfflineExportSw(): best-effort registration under '/offline-export/'.
 * - scheduleOfflineExportSwPriming(): schedule priming after load/idle so UI is never blocked.
 */

/**
 * Register the offline-export Service Worker under /offline-export/.
 * - Fire-and-forget. No awaits that would block UI.
 * - Only attempts when online; skips if already registered.
 */
export function primeOfflineExportSw(): void {
  try {
    if (!('serviceWorker' in navigator)) return;
    if (!navigator.onLine) return;
    void (async () => {
      try {
        const existing = await navigator.serviceWorker
          .getRegistration('/offline-export/')
          .catch(() => undefined);
        if (existing) return;
        await navigator.serviceWorker
          .register('/offline-export/sw.js', { scope: '/offline-export/' })
          .catch(() => undefined);
      } catch {}
    })();
  } catch {}
}

/**
 * Schedule SW priming after load/idle so initial paint and SDK init are unaffected.
 */
export function scheduleOfflineExportSwPriming(): void {
  const schedule = () => {
    try {
      (window as any).requestIdleCallback
        ? (window as any).requestIdleCallback(() => primeOfflineExportSw(), { timeout: 10_000 })
        : setTimeout(() => primeOfflineExportSw(), 3000);
    } catch {
      setTimeout(() => primeOfflineExportSw(), 3000);
    }
  };
  if (document.readyState === 'complete') {
    schedule();
  } else {
    window.addEventListener('load', schedule, { once: true });
  }
}

export {}

