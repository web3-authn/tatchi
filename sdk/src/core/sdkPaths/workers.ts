/**
 * Resolve the base origin for worker scripts.
 * Priority:
 * 1) window.__W3A_WALLET_SDK_BASE__ (absolute `${walletOrigin}${sdkBasePath}/`) → take its origin (only if same-origin)
 * 2) window.location.origin (host/app origin)
 *
 * @returns The origin (protocol + host [+ port]) used to resolve worker script URLs.
 *          Prefers the wallet SDK base origin; falls back to the current window origin.
 */
export function resolveWorkerBaseOrigin(): string {
  const currentOrigin =
    (typeof window !== 'undefined' && window.location?.origin)
      ? window.location.origin
      : '';

  // Only allow worker scripts to resolve from the embedded base when it matches
  // the current origin. Cross-origin worker scripts are not reliably loadable
  // across browsers (even for module workers) and will fail with CORS errors.
  try {
    const embeddedBase = (window as any)?.__W3A_WALLET_SDK_BASE__ as string | undefined;
    if (embeddedBase) {
      const embeddedOrigin = new URL(embeddedBase, currentOrigin || 'https://invalid.local').origin;
      if (embeddedOrigin === currentOrigin) {
        return embeddedOrigin;
      }
    }
  } catch {}

  return currentOrigin;
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
  return resolveWorkerUrl(input, { worker: detectWorkerFromPath(input) })
}

export function resolveWorkerUrl(
  input: string | undefined,
  opts: { worker: 'signer' | 'vrf'; baseOrigin?: string }
): string {
  const worker = opts.worker
  const baseOrigin = opts.baseOrigin || resolveWorkerBaseOrigin() || (typeof window !== 'undefined' ? window.location.origin : '') || 'https://invalid.local'
  try {
    // Prefer explicit per-worker URL override
    const ovAny = (typeof window !== 'undefined' ? (window as any) : {}) as any
    const override = worker === 'signer' ? ovAny.__W3A_SIGNER_WORKER_URL__ : ovAny.__W3A_VRF_WORKER_URL__
    const candidate = (typeof override === 'string' && override) ? override : (input || defaultWorkerPath(worker))
    if (/^https?:\/\//i.test(candidate)) {
      return new URL(candidate).toString()
    }
    return new URL(candidate, baseOrigin).toString()
  } catch {
    try { return new URL(input || defaultWorkerPath(worker), baseOrigin).toString() } catch {}
    return input || defaultWorkerPath(worker)
  }
}

function detectWorkerFromPath(p: string): 'signer' | 'vrf' {
  return /web3authn-signer\.worker\.js(?:$|\?)/.test(p) ? 'signer' : 'vrf'
}

function defaultWorkerPath(worker: 'signer' | 'vrf'): string {
  return worker === 'signer' ? '/sdk/workers/web3authn-signer.worker.js' : '/sdk/workers/web3authn-vrf.worker.js'
}
