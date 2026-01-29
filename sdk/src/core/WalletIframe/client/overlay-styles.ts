/**
 * OverlayStyles - CSP-safe stylesheet manager for the wallet overlay iframe.
 *
 * Design goals:
 * - Zero inline style attributes (CSP style-src-attr 'none' compliant)
 * - Small, maintainable API: setHidden, setFullscreen, setAnchored
 * - Prefer constructable stylesheets; fall back to a nonce'd <style> for browsers
 *   without adoptedStyleSheets (mainly older Firefox/WebViews).
 */

import { createCspStyleManager } from '../shared/csp-styles';

export type DOMRectLike = { top: number; left: number; width: number; height: number };

const CLASS_BASE = 'w3a-wallet-overlay';
const CLASS_HIDDEN = 'is-hidden';
const CLASS_FULLSCREEN = 'is-fullscreen';
const CLASS_ANCHORED = 'is-anchored';

const BASE_CSS = `
  .${CLASS_BASE} { position: fixed; border: none; box-sizing: border-box; background: transparent; color-scheme: normal; transform: none; right: auto; bottom: auto; inset: auto; top: auto; left: auto; z-index: var(--w3a-wallet-overlay-z, 2147483646); }
  .${CLASS_BASE}.${CLASS_HIDDEN} { width: 0px; height: 0px; opacity: 0; pointer-events: none; z-index: auto; }
  .${CLASS_BASE}.${CLASS_FULLSCREEN} { top: 0; left: 0; right: 0; bottom: 0; inset: 0; opacity: 1; pointer-events: auto; }
  @supports (width: 100dvw) { .${CLASS_BASE}.${CLASS_FULLSCREEN} { width: 100dvw; height: 100dvh; } }
  @supports not (width: 100dvw) { .${CLASS_BASE}.${CLASS_FULLSCREEN} { width: 100vw; height: 100vh; } }
  .${CLASS_BASE}.${CLASS_ANCHORED} { opacity: 1; pointer-events: auto; }
`;

const styleManager = createCspStyleManager({
  baseCss: BASE_CSS,
  baseAttr: 'data-w3a-overlay-base',
  dynamicAttr: 'data-w3a-overlay-dyn',
});

function getOverlayId(el: HTMLElement): string | null {
  if (el.id && el.id.startsWith('w3a-overlay-')) return el.id;
  return null;
}

function ensureOverlayId(el: HTMLElement): string {
  const existing = getOverlayId(el);
  if (existing) return existing;
  const id = `w3a-overlay-${Math.random().toString(36).slice(2, 9)}`;
  try { el.id = id; } catch {}
  return id;
}

function clearAnchoredRule(el: HTMLElement): void {
  const id = getOverlayId(el);
  if (id) styleManager.removeRule(id);
}

export function ensureOverlayBase(el: HTMLElement): void {
  styleManager.ensureBase();
  try { el.classList.add(CLASS_BASE); } catch {}
}

export function cleanupOverlayStyles(el: HTMLElement): void {
  clearAnchoredRule(el);
}

export function setHidden(el: HTMLElement): void {
  ensureOverlayBase(el);
  clearAnchoredRule(el);
  try {
    el.classList.add(CLASS_HIDDEN);
    el.classList.remove(CLASS_FULLSCREEN);
    el.classList.remove(CLASS_ANCHORED);
  } catch {}
}

export function setFullscreen(el: HTMLElement): void {
  ensureOverlayBase(el);
  clearAnchoredRule(el);
  try {
    el.classList.add(CLASS_FULLSCREEN);
    el.classList.remove(CLASS_HIDDEN);
    el.classList.remove(CLASS_ANCHORED);
  } catch {}
}

export function setAnchored(el: HTMLElement, rect: DOMRectLike): void {
  ensureOverlayBase(el);
  const id = ensureOverlayId(el);
  const top = Math.max(0, Math.round(rect.top));
  const left = Math.max(0, Math.round(rect.left));
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));
  const rule = `#${id}.${CLASS_ANCHORED}{ top:${top}px; left:${left}px; width:${width}px; height:${height}px; }`;
  styleManager.setRule(id, rule);

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
