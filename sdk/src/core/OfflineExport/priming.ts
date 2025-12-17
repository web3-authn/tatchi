/**
 * Offline-export Service Worker priming utilities.
 *
 * - primeOfflineExportSw(): best-effort registration under '/offline-export/'.
 * - scheduleOfflineExportSwPriming(): schedule priming after load/idle so UI is never blocked.
 */

/**
 * Register the offline-export Service Worker under /offline-export/.
 * - Fire-and-forget. No awaits that would block UI.
 * - Only attempts when online; best-effort updates + cache priming even if already registered.
 */
export function primeOfflineExportSw(): void {
  try {
    if (!('serviceWorker' in navigator)) return;
    if (!navigator.onLine) return;
    void (async () => {
      try {
        const existing = await navigator.serviceWorker.getRegistration('/offline-export/').catch(() => undefined);
        const reg =
          existing ??
          (await navigator.serviceWorker
            .register('/offline-export/sw.js', { scope: '/offline-export/' })
            .catch(() => undefined));
        if (!reg) return;

        // Ensure we pick up new SW versions promptly.
        await reg.update().catch(() => undefined);

        // Trigger a best-effort re-precache so offline export stays warm across deployments.
        const sendPrime = (sw: ServiceWorker | null | undefined) => {
          try { sw?.postMessage({ type: 'OFFLINE_EXPORT_PRIME' }); } catch {}
        };
        sendPrime(reg.active || reg.waiting);
        // If we're mid-install, wait briefly for activation then prime.
        const installing = reg.installing;
        if (installing && !reg.active) {
          const timeoutMs = 10_000;
          const started = Date.now();
          const onState = () => {
            if (installing.state === 'activated' || installing.state === 'installed' || Date.now() - started > timeoutMs) {
              try { installing.removeEventListener('statechange', onState); } catch {}
              sendPrime(reg.active || reg.waiting || installing);
            }
          };
          try { installing.addEventListener('statechange', onState); } catch {}
          // Also kick once after a short delay in case statechange is missed.
          setTimeout(() => sendPrime(reg.active || reg.waiting || installing), 1500);
        }
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
      // Start quickly (non-blocking) so users can go offline soon after first load.
      setTimeout(() => primeOfflineExportSw(), 400);
      // Retry in idle time as a safety net.
      (window as any).requestIdleCallback
        ? (window as any).requestIdleCallback(() => primeOfflineExportSw(), { timeout: 10_000 })
        : setTimeout(() => primeOfflineExportSw(), 3000);
    } catch {
      setTimeout(() => primeOfflineExportSw(), 3000);
    }
  };
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    schedule();
  } else {
    window.addEventListener('DOMContentLoaded', schedule, { once: true });
  }
}

export {}
