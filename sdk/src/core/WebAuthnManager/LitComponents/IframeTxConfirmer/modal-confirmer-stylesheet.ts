import { resolveEmbeddedBase } from '../asset-base';

const MODAL_CONFIRMER_CSS = 'modal-confirmer.css';
const supportsConstructable = typeof ShadowRoot !== 'undefined' && 'adoptedStyleSheets' in ShadowRoot.prototype;

let modalSheetPromise: Promise<CSSStyleSheet | null> | null = null;

function resolveStylesheetUrl(): string {
  const base = resolveEmbeddedBase();
  const join = (input: string) => (input.endsWith('/') ? input : `${input}/`);
  if (/^https?:/i.test(base)) {
    return `${join(base)}${MODAL_CONFIRMER_CSS}`;
  }
  const origin = typeof window !== 'undefined' && window.location ? window.location.origin : '';
  if (origin) {
    const prefix = base.startsWith('/') ? base : `/${base}`;
    return `${join(origin + prefix)}${MODAL_CONFIRMER_CSS}`;
  }
  const normalized = base.startsWith('/') ? base : `/${base}`;
  return `${join(normalized)}${MODAL_CONFIRMER_CSS}`;
}

async function loadConstructableSheet(): Promise<CSSStyleSheet | null> {
  if (!supportsConstructable) return null;
  if (modalSheetPromise) return modalSheetPromise;

  modalSheetPromise = (async () => {
    if (typeof fetch !== 'function') return null;
    try {
      const url = resolveStylesheetUrl();
      const response = await fetch(url, { mode: 'cors' });
      if (!response.ok) return null;
      const cssText = await response.text();
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(cssText);
      return sheet;
    } catch (err) {
      console.warn('[ModalConfirmer] Unable to load constructable stylesheet:', err);
      return null;
    }
  })();

  return modalSheetPromise;
}

export async function ensureModalStyles(root: ShadowRoot | DocumentFragment | HTMLElement | null | undefined): Promise<void> {
  if (!root) return;

  try {
    if (supportsConstructable && 'adoptedStyleSheets' in root) {
      const sheet = await loadConstructableSheet();
      if (!sheet) return;
      const current = (root as any).adoptedStyleSheets as CSSStyleSheet[] | undefined;
      if (!current || !current.includes(sheet)) {
        (root as any).adoptedStyleSheets = current ? [...current, sheet] : [sheet];
      }
      return;
    }

    const doc = (root as any).ownerDocument as Document | null ?? (typeof document !== 'undefined' ? document : null);
    if (!doc) return;
    const markerAttr = 'data-w3a-modal-confirmer-css';
    if (!doc.head.querySelector(`link[${markerAttr}]`)) {
      const link = doc.createElement('link');
      link.rel = 'stylesheet';
      link.href = resolveStylesheetUrl();
      link.setAttribute(markerAttr, '');
      doc.head.appendChild(link);
    }
  } catch (err) {
    console.warn('[ModalConfirmer] Failed to ensure stylesheet:', err);
  }
}

