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
  if (origin) {
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
    if (!doc.head.querySelector(`link[${markerAttr}]`)) {
      const link = doc.createElement('link');
      link.rel = 'stylesheet';
      link.href = resolveStylesheetUrl(assetName);
      link.setAttribute(markerAttr, '');
      doc.head.appendChild(link);
    }
  } catch (err) {
    console.warn('[W3A][css-loader] Failed to ensure stylesheet:', assetName, err);
  }
}

