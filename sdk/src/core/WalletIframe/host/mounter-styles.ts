/**
 * mounter-styles - CSP-safe stylesheet manager for wallet iframe host UI containers.
 * Replaces inline style attributes with classes + dynamic CSS rules.
 */

export type DOMRectLike = { top: number; left: number; width: number; height: number };

const CLASS_CONTAINER = 'w3a-host-container';
const CLASS_ANCHORED = 'is-anchored';

type GlobalWithNonce = typeof window & { litNonce?: string; w3aNonce?: string };

const state: {
  baseSheet: CSSStyleSheet | null;
  dynStyleEl: HTMLStyleElement | null;
  ruleIndex: Map<string, number>;
  supportConstructable: boolean | null;
} = { baseSheet: null, dynStyleEl: null, ruleIndex: new Map(), supportConstructable: null };

function supportsConstructable(): boolean {
  if (state.supportConstructable != null) return state.supportConstructable;
  state.supportConstructable = (typeof CSSStyleSheet !== 'undefined') && ('adoptedStyleSheets' in document);
  return state.supportConstructable;
}

function getNonce(): string | undefined {
  const w = window as GlobalWithNonce;
  return w.w3aNonce || w.litNonce || undefined;
}

export function ensureHostBaseStyles(): void {
  if (state.baseSheet || state.dynStyleEl) return;
  const css = `
    html, body { background: transparent; margin: 0; padding: 0; }
    .${CLASS_CONTAINER} { position: fixed; pointer-events: auto; background: transparent; border: 0; margin: 0; padding: 0; z-index: 2147483647; }
  `;
  if (supportsConstructable()) {
    try {
      state.baseSheet = new CSSStyleSheet();
      state.baseSheet.replaceSync(css);
      const current = (document.adoptedStyleSheets || []) as CSSStyleSheet[];
      (document as any).adoptedStyleSheets = [...current, state.baseSheet];
      return;
    } catch {}
  }
  const styleEl = document.createElement('style');
  const nonce = getNonce();
  if (nonce) try { styleEl.setAttribute('nonce', nonce); } catch {}
  styleEl.textContent = css;
  document.head.appendChild(styleEl);
}

function ensureDynStyleEl(): HTMLStyleElement {
  if (state.dynStyleEl) return state.dynStyleEl;
  const el = document.createElement('style');
  const nonce = getNonce();
  if (nonce) try { el.setAttribute('nonce', nonce); } catch {}
  el.setAttribute('data-w3a-host-dyn', '');
  document.head.appendChild(el);
  state.dynStyleEl = el;
  return el;
}

function asId(el: HTMLElement): string {
  if (el.id && el.id.startsWith('w3a-host-')) return el.id;
  const id = `w3a-host-${Math.random().toString(36).slice(2, 9)}`;
  try { el.id = id; } catch {}
  return id;
}

export function markContainer(el: HTMLElement): void {
  ensureHostBaseStyles();
  try { el.classList.add(CLASS_CONTAINER); } catch {}
  try { el.dataset.w3aContainer = '1'; } catch {}
}

export function setContainerAnchored(el: HTMLElement, rect: DOMRectLike, anchorMode: 'iframe' | 'viewport'): void {
  markContainer(el);
  const id = asId(el);
  const top = anchorMode === 'iframe' ? 0 : Math.max(0, Math.round(rect.top));
  const left = anchorMode === 'iframe' ? 0 : Math.max(0, Math.round(rect.left));
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

  try { el.classList.add(CLASS_ANCHORED); } catch {}
}

export const HostMounterClasses = {
  CONTAINER: CLASS_CONTAINER,
  ANCHORED: CLASS_ANCHORED,
};

