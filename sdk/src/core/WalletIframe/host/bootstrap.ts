import { getEmbeddedBase, setEmbeddedBase } from '../../sdkPaths';
import { ensureKnownW3aElement } from '../../WebAuthnManager/LitComponents/ensure-defined';
import { scheduleOfflineExportSwPriming } from '../../OfflineExport/priming';

interface GlobalThis {
 global?: unknown;
 process?: { env?: Record<string, string | undefined> }
}

/**
 * Bootstrap tasks for the wallet iframe host.
 * - Provides Node-ish globals required by some libs
 * - Applies a transparent surface for the iframe document
 * - Emits early diagnostics to the parent window
 * - Establishes a default embedded asset base (if not already set)
 */
function ensureNodeLikeGlobals(): void {
  const g = globalThis as GlobalThis;
  if (g.global === undefined) {
    g.global = globalThis as unknown;
  }
  if (!g.process || typeof g.process !== 'object') {
    g.process = { env: {} };
  } else if (!g.process.env || typeof g.process.env !== 'object') {
    g.process.env = {};
  }
}

export function bootstrapTransparentHost(): void {
  // Some third‑party libs expect Node-ish globals. Provide minimal, safe shims.
  ensureNodeLikeGlobals();

  if (window.location.origin === 'null') {
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
  }

  ensureTransparentSurface();

  // Early lifecycle signal for observers in the parent
  window.parent?.postMessage({ type: 'SERVICE_HOST_BOOTED' }, '*');
  window.parent?.postMessage(
    { type: 'SERVICE_HOST_DEBUG_ORIGIN', origin: window.location.origin, href: window.location.href },
    '*'
  );

  // Establish a default embedded assets base as soon as this module loads.
  // This points to the directory containing the compiled SDK files (e.g., '/sdk/').
  const here = new URL('.', import.meta.url).toString();
  const norm = here.endsWith('/') ? here : here + '/';
  if (!getEmbeddedBase()) setEmbeddedBase(norm);

  // Dev-only: warn when w3a-* custom elements remain un-upgraded
  setupDevUnupgradedObserver();

  // Defer offline-export Service Worker priming until after the wallet host is up.
  scheduleOfflineExportSwPriming();
}

/**
 * Ensure the iframe document paints transparently, without dark-mode class bleed-through.
 */
export function ensureTransparentSurface(): void {
  const apply = () => {
    const doc = document;
    doc.documentElement.classList.add('w3a-transparent');
    doc.body?.classList.add('w3a-transparent');
    doc.documentElement.classList.remove('dark');
    doc.body?.classList.remove('dark');
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => apply(), { once: true });
  } else {
    apply();
  }
  window.addEventListener('load', () => apply(), { once: true });
}

/**
 * Development-only observer that warns if any <w3a-*> element remains
 * un-upgraded for >250ms after insertion. Also attempts to auto-ensure
 * definitions for known elements via ensureKnownW3aElement().
 */
function setupDevUnupgradedObserver(): void {
  const isDev = (() => {
    const env = (globalThis as any)?.process?.env?.NODE_ENV;
    if (env && env !== 'production') return true;
    const h = window.location.hostname || '';
    if (/localhost|127\.(?:0|[1-9]\d?)\.(?:0|[1-9]\d?)\.(?:0|[1-9]\d?)|\.local(?:host)?$/i.test(h)) {
      return true;
    }
    return false;
  })();
  if (!isDev) return;

  const pending = new WeakMap<Element, number>();
  const schedule = (el: Element) => {
    const tag = (el.tagName || '').toLowerCase();
    if (!tag.startsWith('w3a-')) return;
    if (customElements.get(tag)) return; // already defined
    if (pending.has(el)) return;
    const id = window.setTimeout(async () => {
      pending.delete(el);
      if (customElements.get(tag)) return; // defined in the meantime
      await ensureKnownW3aElement(tag);
      if (!customElements.get(tag)) {
        // eslint-disable-next-line no-console
        console.warn(
          `[W3A][Dev] <${tag}> not upgraded after 250ms. Ensure a dynamic import runs before createElement. See LitComponents/README-lit-elements.md (Never Break Again).`
        );
      }
    }, 250);
    pending.set(el, id);
  };

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of Array.from(m.addedNodes)) {
        if (!(node instanceof Element)) continue;
        schedule(node);
        const nodes = (node as Element).querySelectorAll('*');
        for (const n of Array.from(nodes)) schedule(n as Element);
      }
    }
  });

  observer.observe(document.documentElement || document.body, { childList: true, subtree: true });

  // Seed: schedule existing nodes
  const nodes = document.querySelectorAll('*');
  for (const n of Array.from(nodes)) schedule(n as Element);
}
