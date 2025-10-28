import { resolveEmbeddedBase } from '../asset-base';

const supportsConstructable = typeof ShadowRoot !== 'undefined' && 'adoptedStyleSheets' in ShadowRoot.prototype;

const sheetCache: Map<string, Promise<CSSStyleSheet | null>> = new Map();

function resolveStylesheetUrl(assetName: string): string {
  const base = resolveEmbeddedBase();
  const join = (input: string) => (input.endsWith('/') ? input : `${input}/`);
  if (/^https?:/i.test(base)) {
    return `${join(base)}${assetName}`;
  }
  const origin = typeof window !== 'undefined' && window.location ? window.location.origin : '';
  // Avoid treating opaque origins (about:srcdoc) as a valid prefix
  if (origin && origin !== 'null' && /^https?:/i.test(origin)) {
    const prefix = base.startsWith('/') ? base : `/${base}`;
    return `${join(origin + prefix)}${assetName}`;
  }
  const normalized = base.startsWith('/') ? base : `/${base}`;
  return `${join(normalized)}${assetName}`;
}

async function loadConstructableSheet(assetName: string): Promise<CSSStyleSheet | null> {
  if (!supportsConstructable) return null;
  const key = assetName;
  const existing = sheetCache.get(key);
  if (existing) return existing;

  const promise = (async () => {
    if (typeof fetch !== 'function') return null;
    try {
      const url = resolveStylesheetUrl(assetName);
      const response = await fetch(url, { mode: 'cors' });
      if (!response.ok) return null;
      const cssText = await response.text();
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(cssText);
      return sheet;
    } catch (err) {
      console.warn('[W3A][css-loader] Unable to load constructable stylesheet:', assetName, err);
      return null;
    }
  })();
  sheetCache.set(key, promise);
  return promise;
}

/**
 * Ensure an external CSS asset is applied to a shadow root or document context.
 * - Uses adoptedStyleSheets when supported (constructable stylesheets)
 * - Falls back to injecting a <link rel="stylesheet"> with a marker attribute
 */
export async function ensureExternalStyles(
  root: ShadowRoot | DocumentFragment | HTMLElement | null | undefined,
  assetName: string,
  markerAttr: string
): Promise<void> {
  if (!root) return;

  try {
    // If a <link> with the marker already exists in the document, we can often
    // just rely on it. BUT: document-level <link> does NOT style Shadow DOM.
    // For ShadowRoot targets with constructable support, we must still adopt a
    // stylesheet into the shadow root. So only short-circuit for non-shadow roots
    // or when constructable stylesheets are not available.
    const docEarly = (root as any).ownerDocument as Document | null ?? (typeof document !== 'undefined' ? document : null);
    if (docEarly) {
      const preexisting = docEarly.head.querySelector(`link[${markerAttr}]`) as HTMLLinkElement | null;
      const isShadow = typeof ShadowRoot !== 'undefined' && (root instanceof ShadowRoot);
      const canConstruct = supportsConstructable && 'adoptedStyleSheets' in root;
      if (preexisting && (!isShadow || !canConstruct)) {
        if ((preexisting as any)._w3aLoaded) return;
        await new Promise<void>((resolve) => {
          const done = () => { (preexisting as any)._w3aLoaded = true; resolve(); };
          if (preexisting.sheet) return done();
          preexisting.addEventListener('load', done, { once: true } as AddEventListenerOptions);
          preexisting.addEventListener('error', done, { once: true } as AddEventListenerOptions);
        });
        return;
      }
    }

    if (supportsConstructable && 'adoptedStyleSheets' in root) {
      const sheet = await loadConstructableSheet(assetName);
      if (!sheet) return;
      const current = (root as any).adoptedStyleSheets as CSSStyleSheet[] | undefined;
      if (!current || !current.includes(sheet)) {
        (root as any).adoptedStyleSheets = current ? [...current, sheet] : [sheet];
      }
      return;
    }

    const doc = (root as any).ownerDocument as Document | null ?? (typeof document !== 'undefined' ? document : null);
    if (!doc) return;
    const existing = doc.head.querySelector(`link[${markerAttr}]`) as HTMLLinkElement | null;
    if (existing) {
      if ((existing as any)._w3aLoaded) return;
      await new Promise<void>((resolve) => {
        const done = () => { (existing as any)._w3aLoaded = true; resolve(); };
        if (existing.sheet) return done();
        existing.addEventListener('load', done, { once: true } as AddEventListenerOptions);
        existing.addEventListener('error', done, { once: true } as AddEventListenerOptions);
      });
      return;
    }
    const link = doc.createElement('link');
    link.rel = 'stylesheet';
    link.href = resolveStylesheetUrl(assetName);
    link.setAttribute(markerAttr, '');
    await new Promise<void>((resolve) => {
      const done = () => { (link as any)._w3aLoaded = true; resolve(); };
      link.addEventListener('load', done, { once: true } as AddEventListenerOptions);
      link.addEventListener('error', done, { once: true } as AddEventListenerOptions);
      doc.head.appendChild(link);
      // If the browser resolves synchronously (from cache), sheet may be present
      if (link.sheet) done();
    });
  } catch (err) {
    console.warn('[W3A][css-loader] Failed to ensure stylesheet:', assetName, err);
  }
}
