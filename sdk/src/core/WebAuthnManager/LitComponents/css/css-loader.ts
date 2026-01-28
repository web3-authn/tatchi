import { resolveEmbeddedBase } from '../asset-base';

const supportsConstructable = typeof ShadowRoot !== 'undefined' && 'adoptedStyleSheets' in ShadowRoot.prototype;
const sheetCache: Map<string, Promise<CSSStyleSheet | null>> = new Map();

let warnedRelativeBaseOnce = false;

function resolveStylesheetUrl(assetName: string): string {
  const base = resolveEmbeddedBase();
  const join = (s: string) => (s.endsWith('/') ? s : s + '/');

  // Absolute base already includes a scheme/origin (e.g., https://..., chrome-extension://...).
  // This matters for the extension wallet where `__W3A_WALLET_SDK_BASE__` is typically
  // `chrome-extension://<id>/sdk/`. Treating it as a relative path would yield broken URLs like:
  //   chrome-extension://<id>/chrome-extension://<id>/sdk/w3a-components.css
  if (/^[a-z][a-z0-9+.-]*:/i.test(base)) return `${join(base)}${assetName}`;

  // Warn early when running inside srcdoc with a relative base.
  // In this case, relative URLs will resolve against the host app origin,
  // which likely does not serve SDK assets under `/sdk/*`.
  try {
    if (!warnedRelativeBaseOnce && typeof document !== 'undefined' && document.URL === 'about:srcdoc') {
      warnedRelativeBaseOnce = true;
      console.warn(
        `[W3A][css-loader] Embedded SDK base is relative: "${base}". ` +
        `In production, configure an absolute base so iframe assets resolve: ` +
        `set TatchiPasskeyProvider config { iframeWallet: { walletOrigin: "https://wallet.example.com", sdkBasePath: "/sdk" } }, `
      );
    }
  } catch {}

  // Relative base: prefix with current document origin if available
  const origin = typeof window !== 'undefined' && window.location ? window.location.origin : '';
  if (origin && origin !== 'null' && /^[a-z][a-z0-9+.-]*:/i.test(origin)) {
    const prefix = base.startsWith('/') ? base : `/${base}`;
    return `${join(origin + prefix)}${assetName}`;
  }
  // Last resort: treat base as absolute path
  const normalized = base.startsWith('/') ? base : `/${base}`;
  return `${join(normalized)}${assetName}`;
}

// Low-level helpers

function getDoc(root: ShadowRoot | DocumentFragment | HTMLElement): Document | null {
  return ((root as any).ownerDocument as Document | null) ?? (typeof document !== 'undefined' ? document : null);
}

function waitForStylesheet(link: HTMLLinkElement): Promise<void> {
  return new Promise<void>((resolve) => {
    let timeoutId: number | null = null;
    const done = () => {
      try {
        if (timeoutId != null) window.clearTimeout(timeoutId);
      } catch {}
      (link as any)._w3aLoaded = true;
      resolve();
    };
    if ((link as any)._w3aLoaded || link.sheet) return done();
    // Safety: avoid hanging UI forever if the stylesheet request stalls (no load/error).
    // This can happen in some dev/proxy/CSP setups and would block confirm UI rendering.
    timeoutId = window.setTimeout(done, 2_000);
    link.addEventListener('load', done, { once: true } as AddEventListenerOptions);
    link.addEventListener('error', done, { once: true } as AddEventListenerOptions);
  });
}

async function ensureDocumentLink(doc: Document, assetName: string, markerAttr: string): Promise<void> {
  const existing = doc.head?.querySelector(`link[${markerAttr}]`) as HTMLLinkElement | null;
  if (existing) { await waitForStylesheet(existing); return; }
  const link = doc.createElement('link');
  link.rel = 'stylesheet';
  link.href = resolveStylesheetUrl(assetName);
  link.setAttribute(markerAttr, '');
  doc.head?.appendChild(link);
  await waitForStylesheet(link);
}

/**
 * Shadow-root stylesheet fallback.
 *
 * Why: In the Chrome-extension wallet we load SDK CSS from `chrome-extension://.../sdk/*.css`.
 * When constructable stylesheets are unavailable or `fetch()` is blocked/fails (common in
 * strict CSP / extension contexts), a document-level <link> does NOT style Shadow DOM.
 *
 * Using a shadow-root <link rel="stylesheet"> keeps styles scoped to the component and
 * avoids inline <style> (compatible with `style-src-attr 'none'`).
 */
async function ensureShadowLink(root: ShadowRoot, assetName: string, markerAttr: string): Promise<void> {
  const existing = root.querySelector(`link[${markerAttr}]`) as HTMLLinkElement | null;
  if (existing) { await waitForStylesheet(existing); return; }
  const doc = getDoc(root);
  if (!doc) return;
  const link = doc.createElement('link');
  link.rel = 'stylesheet';
  link.href = resolveStylesheetUrl(assetName);
  link.setAttribute(markerAttr, '');
  root.appendChild(link);
  await waitForStylesheet(link);
}

async function adoptConstructable(root: ShadowRoot, assetName: string): Promise<boolean> {
  if (!supportsConstructable) return false;
  const cached = sheetCache.get(assetName);
  const load = cached ?? (async () => {
    if (typeof fetch !== 'function') return null;
    try {
      const res = await fetch(resolveStylesheetUrl(assetName), { mode: 'cors' });
      if (!res.ok) return null;
      const cssText = await res.text();
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(cssText);
      return sheet;
    } catch {
      return null;
    }
  })();
  if (!cached) sheetCache.set(assetName, load);
  const sheet = await load;
  if (!sheet) return false;
  const current = (root as any).adoptedStyleSheets as CSSStyleSheet[] | undefined;
  if (!current || !current.includes(sheet)) (root as any).adoptedStyleSheets = current ? [...current, sheet] : [sheet];
  return true;
}

// Public API

/**
 * Ensure an external CSS asset is applied to the given target.
 *
 * Strategy:
 * - For ShadowRoot: try constructable; if that fails (e.g., fetch blocked in extension/CSP),
 *   fall back to a shadow-root <link rel="stylesheet"> so styles still apply to Shadow DOM.
 * - For Document/HTMLElement targets: ensure a document-level <link>.
 */
export async function ensureExternalStyles(
  root: ShadowRoot | DocumentFragment | HTMLElement | null | undefined,
  assetName: string,
  markerAttr: string
): Promise<void> {
  if (!root) return;

  try {
    const doc = getDoc(root);
    const isShadow = typeof ShadowRoot !== 'undefined' && (root instanceof ShadowRoot);
    const isSrcdoc = !!doc && doc.URL === 'about:srcdoc';

    // Document-level short‑circuit for non‑shadow roots if link already exists
    if (!isShadow && doc) {
      const preexisting = doc.head?.querySelector(`link[${markerAttr}]`) as HTMLLinkElement | null;
      if (preexisting) { await waitForStylesheet(preexisting); return; }
    }

    if (isShadow) {
      // 1) Try constructable stylesheets (CSP-safe)
      if (await adoptConstructable(root as ShadowRoot, assetName)) return;
      // 2) Strict‑CSP compatible fallback: use a shadow-root <link rel="stylesheet">
      //    (no inline <style>). This keeps the stylesheet scoped to the shadow tree
      //    even when `adoptedStyleSheets` is unavailable or fetch fails.
      await ensureShadowLink(root as ShadowRoot, assetName, markerAttr);
      return;
    }

    // Non‑shadow target: ensure a single document‑level link in <head> (strict CSP friendly)
    if (doc) {
      await ensureDocumentLink(doc, assetName, markerAttr);
    }
  } catch (err) {
    console.warn('[W3A][css-loader] Failed to ensure stylesheet:', assetName, err);
  }
}
