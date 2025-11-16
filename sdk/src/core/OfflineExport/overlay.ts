/**
 * Offline Export overlay helpers.
 *
 * For clarity and simplicity, this implementation opens the offline route
 * in a new browser tab/window instead of mounting a fullscreen iframe overlay.
 */

export function openOfflineExportWindow(opts: { walletOrigin?: string; target?: string; accountId?: string } = {}): void {
  const walletOrigin = opts.walletOrigin || (typeof window !== 'undefined' ? window.location.origin : '')
  const urlObj = new URL('/offline-export/', walletOrigin)
  if (opts.accountId) {
    try { urlObj.searchParams.set('accountId', String(opts.accountId)) } catch {}
  }
  const url = urlObj.toString()
  // Prefer a global opener if available (helps unit tests without a window global)
  const globalOpen = (globalThis as any).open
  const winOpen = (typeof window !== 'undefined' ? (window as any).open : undefined)
  const openFn: ((u: string, t?: string, f?: string) => any) | undefined =
    typeof globalOpen === 'function' ? globalOpen.bind(globalThis) : (typeof winOpen === 'function' ? winOpen.bind(window) : undefined)
  if (openFn) {
    try { openFn(url, opts.target || '_blank', 'noopener,noreferrer') } catch {}
    return
  }
  // As a last resort, navigate the current tab if possible
  try { if (typeof window !== 'undefined' && window.location) window.location.href = url } catch {}
}

/**
 * Open the offline-export route if the environment is offline.
 * Returns true when it handled opening the route, false otherwise.
 */
// NOTE: Previously exported openOfflineExportIfOffline has been folded into
// explicit helpers isOffline() + openOfflineExport(...). Callers should check
// isOffline() and then use openOfflineExport(...) directly for clarity.

/** Lightweight environment probe for offline state */
export function isOffline(): boolean {
  return typeof navigator !== 'undefined' && (navigator.onLine === false)
}

/** Open the offline-export route, preferring the router when provided */
export async function openOfflineExport(args: {
  accountId: string;
  routerOpen?: (args: { accountId: string }) => Promise<void>;
  walletOrigin?: string;
  target?: string;
}): Promise<void> {
  if (typeof args.routerOpen === 'function') {
    await args.routerOpen({ accountId: args.accountId });
    return;
  }
  const walletOrigin = args.walletOrigin || (typeof window !== 'undefined' ? window.location.origin : undefined);
  openOfflineExportWindow({ walletOrigin, target: args.target ?? '_blank', accountId: args.accountId });
}
