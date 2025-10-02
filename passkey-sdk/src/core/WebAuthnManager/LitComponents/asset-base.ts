/**
 * Resolve the base URL for embedded Lit bundles in a robust, readable way.
 *
 * Priority:
 * 1) window.__W3A_EMBEDDED_BASE__ when set by the wallet host (absolute URL)
 * 2) Directory of the current ESM module (import.meta.url), which is absolute
 * 3) Last-resort static fallback '/sdk/embedded/'
 */
export function resolveEmbeddedBase(): string {
  // Prefer the wallet host-provided absolute base
  try {
    const w = (window as unknown as { __W3A_EMBEDDED_BASE__?: string });
    const v = w?.__W3A_EMBEDDED_BASE__;
    if (typeof v === 'string' && v.length > 0) {
      return v.endsWith('/') ? v : (v + '/');
    }
  } catch {}

  // Use stable SDK default if host has not set a base yet
  return '/sdk/embedded/';
}
