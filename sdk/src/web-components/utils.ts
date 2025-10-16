// Lightweight utilities for attribute/property bridging and shadow mounting
// Kept framework-agnostic so wrappers can use directly.

export type PortalStrategy = 'shadow' | 'document';

// Compute path to the React CSS bundle relative to this module at runtime.
// This works in ESM environments and in most bundlers.
export const REACT_STYLES_URL = new URL('../react/styles/styles.css', import.meta.url).href;

let cachedCssTextPromise: Promise<string> | null = null;
let constructedSheet: CSSStyleSheet | null = null;
const injectedRoots = new WeakSet<ShadowRoot | Document>();

export function toBoolean(val: string | null | undefined): boolean | undefined {
  if (val == null) return undefined;
  const v = String(val).trim().toLowerCase();
  if (v === '' || v === 'true' || v === '1') return true;
  if (v === 'false' || v === '0' || v === 'null') return false;
  // presence-only boolean attributes default to true
  return true;
}

export function toStringAttr(val: string | null | undefined): string | undefined {
  if (val == null) return undefined;
  const s = String(val);
  return s.length ? s : undefined;
}

export function attachOpenShadow(host: HTMLElement): ShadowRoot {
  return host.shadowRoot ?? host.attachShadow({ mode: 'open' });
}

export function getPortalTarget(host: HTMLElement, strategy: PortalStrategy, explicit?: HTMLElement | ShadowRoot | null): HTMLElement | ShadowRoot {
  if (explicit) return explicit;
  if (strategy === 'document') return document.body;
  // Default: nearest shadow root if present, else document.body
  const root = (host.getRootNode && host.getRootNode()) as Document | ShadowRoot;
  return root instanceof ShadowRoot ? root : document.body;
}

export function dispatchTypedEvent<T>(el: HTMLElement, type: string, detail?: T): void {
  el.dispatchEvent(new CustomEvent<T>(type, { detail, bubbles: true, composed: true }));
}

async function loadCssText(): Promise<string> {
  if (!cachedCssTextPromise) {
    cachedCssTextPromise = fetch(REACT_STYLES_URL).then(r => r.text());
  }
  return cachedCssTextPromise;
}

export async function ensureReactStyles(root: ShadowRoot | Document): Promise<void> {
  if (injectedRoots.has(root)) return;

  const cssText = await loadCssText();

  const supportsConstructable = !!(root as any).adoptedStyleSheets && 'replaceSync' in (CSSStyleSheet.prototype as any);
  if (supportsConstructable) {
    if (!constructedSheet) {
      constructedSheet = new CSSStyleSheet();
      try { constructedSheet.replaceSync(cssText); } catch { await constructedSheet.replace(cssText); }
    }
    const sheets = (root as any).adoptedStyleSheets as CSSStyleSheet[];
    if (!sheets.includes(constructedSheet)) {
      (root as any).adoptedStyleSheets = [...sheets, constructedSheet];
    }
  } else {
    const styleEl = document.createElement('style');
    styleEl.setAttribute('data-w3a-styles', '1');
    styleEl.textContent = cssText;
    if (root instanceof ShadowRoot) root.appendChild(styleEl); else (root as Document).head.appendChild(styleEl);
  }
  injectedRoots.add(root);
}

