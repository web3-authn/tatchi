/**
 * Resolve the base origin for worker scripts.
 * Priority:
 * 1) window.__W3A_WALLET_SDK_BASE__ (absolute `${walletOrigin}${sdkBasePath}/`) → take its origin
 * 2) window.location.origin (host/app origin)
 *
 * @returns The origin (protocol + host [+ port]) used to resolve worker script URLs.
 *          Prefers the wallet SDK base origin; falls back to the current window origin.
 */
export function resolveWorkerBaseOrigin(): string {
  let origin = ''
  if (typeof window !== 'undefined' && window.location?.origin) {
    origin = window.location.origin
  }
  try {
    const embeddedBase = (window as any)?.__W3A_WALLET_SDK_BASE__ as string | undefined
    if (embeddedBase) {
      origin = new URL(embeddedBase, origin || 'https://invalid.local').origin
    }
  } catch {}
  return origin
}

/**
 * Build an absolute worker script URL from a path or absolute URL.
 * If `input` is a path (e.g., `/sdk/workers/foo.js`), it will be resolved
 * against the wallet origin (from `__W3A_WALLET_SDK_BASE__`) when available,
 * otherwise against the host origin.
 *
 * @param input - Absolute URL or path (e.g., `/sdk/workers/web3authn-signer.worker.js`).
 * @returns Absolute URL to the worker script, resolved against the wallet origin when available,
 *          otherwise against the current window origin.
 */
export function resolveWorkerScriptUrl(input: string): string {
  try {
    // Absolute URL string stays as-is (normalized by URL constructor)
    if (/^https?:\/\//i.test(input)) {
      return new URL(input).toString()
    }
    const baseOrigin = resolveWorkerBaseOrigin() || (typeof window !== 'undefined' ? window.location.origin : '') || 'https://invalid.local'
    return new URL(input, baseOrigin).toString()
  } catch {
    // Best-effort fallback
    try { return new URL(input, (typeof window !== 'undefined' ? window.location.origin : 'https://invalid.local')).toString() } catch {}
    return input
  }
}