/**
 * Resolve the base URL for embedded Lit bundles in a robust, readable way.
 *
 * Priority:
 * 1) window.__W3A_WALLET_SDK_BASE__ when set by the wallet host (absolute URL)
 * 2) Current ESM module location (import.meta.url):
 *    - If the URL contains a '/sdk/' segment, slice up to that segment.
 *    - Else return `${origin}/sdk/` when the origin is http(s).
 * 3) Last‑resort static fallback '/sdk/' (relative)
 */

const SDK_SEGMENT = '/sdk/';

function withTrailingSlash(s: string): string {
  return s.endsWith('/') ? s : s + '/';
}

function readGlobalEmbeddedBase(): string | undefined {
  try {
    if (typeof window === 'undefined') return undefined;
    const v = (window as any)?.__W3A_WALLET_SDK_BASE__ as string | undefined;
    if (typeof v === 'string' && v.length > 0) return withTrailingSlash(v);
  } catch {}
  return undefined;
}

function deriveFromModuleUrl(): string | undefined {
  try {
    const m = (import.meta as any)?.url as string | undefined;
    if (!m) return undefined;
    const base = typeof window !== 'undefined' ? window.location.href : undefined;
    const u = new URL(m, base as any);
    const href = u.toString();

    const idx = href.indexOf(SDK_SEGMENT);
    if (idx > 0) {
      return withTrailingSlash(href.slice(0, idx + SDK_SEGMENT.length));
    }

    const origin = u.origin;
    if (origin && /^https?:/i.test(origin)) {
      return withTrailingSlash(origin + '/sdk');
    }
  } catch {}
  return undefined;
}

export function resolveEmbeddedBase(): string {
  return (
    readGlobalEmbeddedBase() ||
    deriveFromModuleUrl() ||
    '/sdk/'
  );
}
