/**
 * OverlayStyles - CSP-safe stylesheet manager for the wallet overlay iframe.
 *
 * Design goals:
 * - Zero inline style attributes (CSP style-src-attr 'none' compliant)
 * - Small, maintainable API: setHidden, setFullscreen, setAnchored
 * - Prefer constructable stylesheets; fall back to a nonce'd <style> for browsers
 *   without adoptedStyleSheets (mainly older Firefox/WebViews). Fallback is still
 *   important for broad compatibility unless you restrict supported browsers.
 */

export type DOMRectLike = { top: number; left: number; width: number; height: number };

const CLASS_BASE = 'w3a-wallet-overlay';
const CLASS_HIDDEN = 'is-hidden';
const CLASS_FULLSCREEN = 'is-fullscreen';
const CLASS_ANCHORED = 'is-anchored';

type GlobalWithNonce = typeof window & { litNonce?: string; w3aNonce?: string };

// Singleton state for the base stylesheet and dynamic anchored rules
const state: {
  baseSheet: CSSStyleSheet | null;
  // For fallback path, a dedicated <style> tag for dynamic anchored rules
  dynStyleEl: HTMLStyleElement | null;
  // Map element id -> rule index (constructable path)
  ruleIndex: Map<string, number>;
  // Cached support flag
  supportConstructable: boolean | null;
} = {
  baseSheet: null,
  dynStyleEl: null,
  ruleIndex: new Map(),
  supportConstructable: null,
};

function supportsConstructable(): boolean {
  if (state.supportConstructable != null) return state.supportConstructable;
  state.supportConstructable = (typeof CSSStyleSheet !== 'undefined') && ('adoptedStyleSheets' in document);
  return state.supportConstructable;
}

function getNonce(): string | undefined {
  const w = window as GlobalWithNonce;
  return w.w3aNonce || w.litNonce || undefined;
}

function installBaseStyles(): void {
  if (state.baseSheet || state.dynStyleEl) return;
  const css = `
    .${CLASS_BASE} { position: fixed; border: none; box-sizing: border-box; background: transparent; color-scheme: normal; transform: none; right: auto; bottom: auto; inset: auto; top: auto; left: auto; z-index: var(--w3a-wallet-overlay-z, 2147483646); }
    .${CLASS_BASE}.${CLASS_HIDDEN} { width: 0px; height: 0px; opacity: 0; pointer-events: none; z-index: auto; }
    .${CLASS_BASE}.${CLASS_FULLSCREEN} { top: 0; left: 0; right: 0; bottom: 0; inset: 0; opacity: 1; pointer-events: auto; }
    @supports (width: 100dvw) { .${CLASS_BASE}.${CLASS_FULLSCREEN} { width: 100dvw; height: 100dvh; } }
    @supports not (width: 100dvw) { .${CLASS_BASE}.${CLASS_FULLSCREEN} { width: 100vw; height: 100vh; } }
    .${CLASS_BASE}.${CLASS_ANCHORED} { opacity: 1; pointer-events: auto; }
  `;

  if (supportsConstructable()) {
    try {
      state.baseSheet = new CSSStyleSheet();
      state.baseSheet.replaceSync(css);
      const current = (document.adoptedStyleSheets || []) as CSSStyleSheet[];
      document.adoptedStyleSheets = [...current, state.baseSheet];
      return;
    } catch {}
  }
  // Fallback: <style> tag (requires CSP nonce if style-src blocks inline)
  const styleEl = document.createElement('style');
  const nonce = getNonce();
  if (nonce) try { styleEl.setAttribute('nonce', nonce); } catch {}
  styleEl.textContent = css;
  document.head.appendChild(styleEl);
  // Dynamic anchored rules will use a separate tag to keep base CSS stable
}

function ensureDynStyleEl(): HTMLStyleElement {
  if (state.dynStyleEl) return state.dynStyleEl;
  const el = document.createElement('style');
  const nonce = getNonce();
  if (nonce) try { el.setAttribute('nonce', nonce); } catch {}
  el.setAttribute('data-w3a-overlay-dyn', '');
  document.head.appendChild(el);
  state.dynStyleEl = el;
  return el;
}

function asId(el: HTMLElement): string {
  if (el.id && el.id.startsWith('w3a-overlay-')) return el.id;
  const id = `w3a-overlay-${Math.random().toString(36).slice(2, 9)}`;
  try { el.id = id; } catch {}
  return id;
}

export function ensureOverlayBase(el: HTMLElement): void {
  installBaseStyles();
  try { el.classList.add(CLASS_BASE); } catch {}
}

export function setHidden(el: HTMLElement): void {
  ensureOverlayBase(el);
  try {
    el.classList.add(CLASS_HIDDEN);
    el.classList.remove(CLASS_FULLSCREEN);
    el.classList.remove(CLASS_ANCHORED);
  } catch {}
}

export function setFullscreen(el: HTMLElement): void {
  ensureOverlayBase(el);
  try {
    el.classList.add(CLASS_FULLSCREEN);
    el.classList.remove(CLASS_HIDDEN);
    el.classList.remove(CLASS_ANCHORED);
  } catch {}
}

export function setAnchored(el: HTMLElement, rect: DOMRectLike): void {
  ensureOverlayBase(el);
  const id = asId(el);
  const top = Math.max(0, Math.round(rect.top));
  const left = Math.max(0, Math.round(rect.left));
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));
  const rule = `#${id}.${CLASS_ANCHORED}{ top:${top}px; left:${left}px; width:${width}px; height:${height}px; }`;

  if (supportsConstructable() && state.baseSheet) {
    const s = state.baseSheet;
    const prev = state.ruleIndex.get(id);
    try {
      if (typeof prev === 'number') { try { s.deleteRule(prev); } catch {} }
      const idx = s.insertRule(rule, s.cssRules.length);
      state.ruleIndex.set(id, idx);
    } catch {}
  } else {
    const elDyn = ensureDynStyleEl();
    const lines = (elDyn.textContent || '').split('\n').filter(Boolean);
    const prefix = `#${id}.`;
    const rest = lines.filter(l => !l.startsWith(prefix));
    rest.push(rule);
    elDyn.textContent = rest.join('\n');
  }

  try {
    el.classList.add(CLASS_ANCHORED);
    el.classList.remove(CLASS_HIDDEN);
    el.classList.remove(CLASS_FULLSCREEN);
  } catch {}
}

export const OverlayStyleClasses = {
  BASE: CLASS_BASE,
  HIDDEN: CLASS_HIDDEN,
  FULLSCREEN: CLASS_FULLSCREEN,
  ANCHORED: CLASS_ANCHORED,
};
