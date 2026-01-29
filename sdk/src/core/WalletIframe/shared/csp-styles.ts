type GlobalWithNonce = typeof window & { litNonce?: string; w3aNonce?: string };

export type CspStyleManager = {
  ensureBase(): void;
  setRule(id: string, rule: string): void;
  removeRule(id: string): void;
};

type CspStyleManagerOptions = {
  baseCss: string;
  baseAttr?: string;
  dynamicAttr?: string;
  nonceGetter?: () => string | undefined;
};

const defaultNonceGetter = (): string | undefined => {
  const w = window as GlobalWithNonce;
  return w.w3aNonce || w.litNonce || undefined;
};

function supportsConstructable(): boolean {
  if (typeof document === 'undefined') return false;
  return (typeof CSSStyleSheet !== 'undefined') && ('adoptedStyleSheets' in document);
}

function createStyleEl(dataAttr?: string, nonce?: string): HTMLStyleElement {
  const el = document.createElement('style');
  if (nonce) {
    try { el.setAttribute('nonce', nonce); } catch {}
  }
  if (dataAttr) {
    try { el.setAttribute(dataAttr, ''); } catch {}
  }
  return el;
}

export function createCspStyleManager(opts: CspStyleManagerOptions): CspStyleManager {
  const baseCss = opts.baseCss;
  const nonceGetter = opts.nonceGetter || defaultNonceGetter;
  const ruleById = new Map<string, string>();

  let baseSheet: CSSStyleSheet | null = null;
  let baseStyleEl: HTMLStyleElement | null = null;
  let dynStyleEl: HTMLStyleElement | null = null;
  let supportConstructable: boolean | null = null;

  const canUseConstructable = (): boolean => {
    if (supportConstructable != null) return supportConstructable;
    supportConstructable = supportsConstructable();
    return supportConstructable;
  };

  const ensureBase = (): void => {
    if (typeof document === 'undefined') return;
    if (baseSheet || baseStyleEl) return;
    if (canUseConstructable()) {
      try {
        baseSheet = new CSSStyleSheet();
        baseSheet.replaceSync(baseCss);
        const current = (document.adoptedStyleSheets || []) as CSSStyleSheet[];
        document.adoptedStyleSheets = [...current, baseSheet];
        return;
      } catch {
        baseSheet = null;
      }
    }
    const styleEl = createStyleEl(opts.baseAttr, nonceGetter());
    styleEl.textContent = baseCss;
    document.head.appendChild(styleEl);
    baseStyleEl = styleEl;
  };

  const ensureDynStyleEl = (): HTMLStyleElement => {
    if (dynStyleEl) return dynStyleEl;
    const el = createStyleEl(opts.dynamicAttr, nonceGetter());
    document.head.appendChild(el);
    dynStyleEl = el;
    return el;
  };

  const buildDynamicCss = (): string => Array.from(ruleById.values()).join('\n');

  const syncConstructableRules = (): boolean => {
    if (!canUseConstructable()) return false;
    if (!baseSheet) return false;
    try {
      const dynamic = buildDynamicCss();
      baseSheet.replaceSync(dynamic ? `${baseCss}\n${dynamic}` : baseCss);
      return true;
    } catch {
      return false;
    }
  };

  const syncStyleElementRules = (): void => {
    const el = ensureDynStyleEl();
    el.textContent = buildDynamicCss();
  };

  return {
    ensureBase,
    setRule: (id: string, rule: string) => {
      ensureBase();
      ruleById.set(id, rule);
      if (!syncConstructableRules()) {
        syncStyleElementRules();
      }
    },
    removeRule: (id: string) => {
      if (!ruleById.delete(id)) return;
      if (!syncConstructableRules()) {
        syncStyleElementRules();
      }
    },
  };
}
