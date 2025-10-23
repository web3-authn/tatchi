import { getEmbeddedBase, setEmbeddedBase } from '../../sdkPaths';

/**
 * Bootstrap tasks for the wallet iframe host.
 * - Provides Node-ish globals required by some libs
 * - Applies a transparent surface for the iframe document
 * - Emits early diagnostics to the parent window
 * - Establishes a default embedded asset base (if not already set)
 */
export function bootstrapTransparentHost(): void {
  try {
    (globalThis as unknown as { global?: unknown }).global =
      (globalThis as unknown as { global?: unknown }).global || (globalThis as unknown);
  } catch {}
  try {
    (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process =
      (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process || { env: {} };
  } catch {}

  if (window.location.origin === 'null') {
    try {
      // Helpful in misconfigured cross-origin or COOP/COEP situations
      // (use direct '*' targeting before we know parent origin)
      window.parent?.postMessage(
        { type: 'SERVICE_HOST_DEBUG_ORIGIN', origin: window.location.origin, href: window.location.href },
        '*'
      );
      // Keep a console trace locally too
      // eslint-disable-next-line no-console
      console.warn(
        '[WalletHost] iframe is running with opaque (null) origin. Check COEP/CORP headers and ensure navigation succeeded.'
      );
    } catch {}
  }

  ensureTransparentSurface();

  // Early lifecycle signal for observers in the parent
  try {
    window.parent?.postMessage({ type: 'SERVICE_HOST_BOOTED' }, '*');
    window.parent?.postMessage(
      { type: 'SERVICE_HOST_DEBUG_ORIGIN', origin: window.location.origin, href: window.location.href },
      '*'
    );
  } catch {}

  // Establish a default embedded assets base as soon as this module loads.
  // This points to the directory containing the compiled SDK files (e.g., '/sdk/').
  try {
    const here = new URL('.', import.meta.url).toString();
    const norm = here.endsWith('/') ? here : here + '/';
    if (!getEmbeddedBase()) setEmbeddedBase(norm);
  } catch {}

  // Lightweight click telemetry for debugging embedded UI interactions
  try {
    window.addEventListener(
      'click',
      (e) => {
        try {
          const t = e.target as HTMLElement;
          const name = t?.tagName?.toLowerCase() || 'unknown';
          const cls = (t as any)?.className || '';
          window.parent?.postMessage({ type: 'SERVICE_HOST_CLICK', name, cls }, '*');
        } catch {}
      },
      true
    );
  } catch {}
}

/**
 * Ensure the iframe document paints transparently, without dark-mode class bleed-through.
 */
export function ensureTransparentSurface(): void {
  const apply = () => {
    const doc = document;
    try {
      doc.documentElement.style.background = 'transparent';
      doc.documentElement.style.margin = '0';
      doc.documentElement.style.padding = '0';
      doc.documentElement.style.colorScheme = 'normal';
      doc.documentElement.classList.remove('dark');
    } catch {}
    try {
      if (doc.body) {
        doc.body.style.background = 'transparent';
        doc.body.style.margin = '0';
        doc.body.style.padding = '0';
        doc.body.style.colorScheme = 'normal';
        doc.body.classList.remove('dark');
      }
    } catch {}
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => apply(), { once: true });
  } else {
    apply();
  }
  window.addEventListener('load', () => apply(), { once: true });
}

