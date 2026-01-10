/**
 * mounter-styles - CSP-safe stylesheet manager for wallet iframe host UI containers.
 * Replaces inline style attributes with classes + dynamic CSS rules.
 */

export type DOMRectLike = { top: number; left: number; width: number; height: number };

type GlobalWithNonce = typeof window & { litNonce?: string; w3aNonce?: string };

const CLASS_CONTAINER = 'w3a-host-container';
const CLASS_ANCHORED = 'is-anchored';
const BASE_CSS = `
  html, body { background: transparent; margin: 0; padding: 0; }
  .${CLASS_CONTAINER} { position: fixed; pointer-events: auto; background: transparent; border: 0; margin: 0; padding: 0; z-index: 2147483647; }
`;

const state: {
  baseSheet: CSSStyleSheet | null;
  baseStyleEl: HTMLStyleElement | null;
  dynStyleEl: HTMLStyleElement | null;
  ruleById: Map<string, string>;
  supportConstructable: boolean | null;
} = { baseSheet: null, baseStyleEl: null, dynStyleEl: null, ruleById: new Map(), supportConstructable: null };

function supportsConstructable(): boolean {
  if (state.supportConstructable != null) return state.supportConstructable;
  state.supportConstructable = (typeof CSSStyleSheet !== 'undefined') && ('adoptedStyleSheets' in document);
  return state.supportConstructable;
}

function getNonce(): string | undefined {
  const w = window as GlobalWithNonce;
  return w.w3aNonce || w.litNonce || undefined;
}

function createStyleEl(dataAttr?: string): HTMLStyleElement {
  const el = document.createElement('style');
  const nonce = getNonce();
  if (nonce) el.setAttribute('nonce', nonce);
  if (dataAttr) el.setAttribute(dataAttr, '');
  return el;
}

export function ensureHostBaseStyles(): void {
  if (state.baseSheet || state.baseStyleEl) {
    return;
  }
  if (supportsConstructable()) {
    try {
      state.baseSheet = new CSSStyleSheet();
      state.baseSheet.replaceSync(BASE_CSS);
      const current = (document.adoptedStyleSheets || []) as CSSStyleSheet[];
      document.adoptedStyleSheets = [...current, state.baseSheet];
      return;
    } catch {
      // Fallback to a regular <style> element below
    }
  }
  const styleEl = createStyleEl();
  styleEl.textContent = BASE_CSS;
  document.head.appendChild(styleEl);
  state.baseStyleEl = styleEl;
}

function ensureDynStyleEl(): HTMLStyleElement {
  if (state.dynStyleEl) {
    return state.dynStyleEl;
  }
  const el = createStyleEl('data-w3a-host-dyn');
  document.head.appendChild(el);
  state.dynStyleEl = el;
  return el;
}

export function markContainer(el: HTMLElement): string {
  ensureHostBaseStyles();
  el.classList.add(CLASS_CONTAINER);
  el.dataset.w3aContainer = '1';
  if (el.id && el.id.startsWith('w3a-host-')) {
    return el.id;
  }
  const id = `w3a-host-${Math.random().toString(36).slice(2, 9)}`;
  el.id = id;
  return id;
}

function buildDynamicCss(): string {
  return Array.from(state.ruleById.values()).join('\n');
}

function syncConstructableRules(): boolean {
  if (!supportsConstructable() || !state.baseSheet) {
    return false;
  }
  try {
    const dynamic = buildDynamicCss();
    state.baseSheet.replaceSync(dynamic ? `${BASE_CSS}\n${dynamic}` : BASE_CSS);
    return true;
  } catch {
    return false;
  }
}

function syncStyleElementRules(): void {
  const elDyn = ensureDynStyleEl();
  elDyn.textContent = buildDynamicCss();
}

function updateDynamicRule(id: string, rule: string): void {
  state.ruleById.set(id, rule);
  if (!syncConstructableRules()) {
    syncStyleElementRules();
  }
}

export function setContainerAnchored(el: HTMLElement, rect: DOMRectLike, anchorMode: 'iframe' | 'viewport'): void {
  const id = markContainer(el);
  const top = anchorMode === 'iframe' ? 0 : Math.max(0, Math.round(rect.top));
  const left = anchorMode === 'iframe' ? 0 : Math.max(0, Math.round(rect.left));
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));
  const rule = `#${id}.${CLASS_ANCHORED}{ top:${top}px; left:${left}px; width:${width}px; height:${height}px; }`;

  updateDynamicRule(id, rule);

  el.classList.add(CLASS_ANCHORED);
}

export const HostMounterClasses = {
  CONTAINER: CLASS_CONTAINER,
  ANCHORED: CLASS_ANCHORED,
};
