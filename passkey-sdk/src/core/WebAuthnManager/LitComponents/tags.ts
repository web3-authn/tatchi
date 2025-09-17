
// Lit component tag names
// These are rendered as web components:
// e.g. <w3a-tx-button></w3a-tx-button>, <button-with-tooltip>, etc;
export const BUTTON_WITH_TOOLTIP_ID = 'button-with-tooltip';

// Preferred aliases for top-level elements used by WalletIframe host
export const W3A_TX_BUTTON_ID = 'w3a-tx-button';
export const W3A_REGISTER_BUTTON_ID = 'w3a-register-button';
export const W3A_REGISTER_BUTTON_HOST_ID = 'w3a-register-button-host';
export const W3A_TX_BUTTON_HOST_ID = 'w3a-tx-button-host';
// Legacy host element ids (back-compat aliases)
// legacy-only aliases (not exported): 'w3a-wallet-register-host', 'w3a-wallet-tx-host'

// Consolidated tag registry and helpers
export type TagDef = { id: string; aliases?: string[] };
export const TAG_DEFS = {
  registerButton: { id: W3A_REGISTER_BUTTON_ID, aliases: ['embedded-register-button'] },
  txButton: { id: W3A_TX_BUTTON_ID, aliases: ['iframe-button'] },
  registerHost: { id: W3A_REGISTER_BUTTON_HOST_ID, aliases: ['w3a-wallet-register-host'] },
  txHost: { id: W3A_TX_BUTTON_HOST_ID, aliases: ['w3a-wallet-tx-host'] },
} as const;
export type TagKey = keyof typeof TAG_DEFS;

/** Return canonical tag for a tag key */
export function getTag(key: TagKey): string { return TAG_DEFS[key].id; }

/** Define a custom element for canonical and alias tags (no-throw). */
export function defineTag(key: TagKey, ctor: CustomElementConstructor): void {
  const def = TAG_DEFS[key];
  try {
    if (!customElements.get(def.id)) {
      customElements.define(def.id, ctor);
    }
  } catch {}
  const aliases = def.aliases || [];
  for (const alias of aliases) {
    try { if (!customElements.get(alias)) customElements.define(alias, ctor); } catch {}
  }
}

// Asset path and bootstrap module used by the iframe host to hydrate the embedded element.
export const EMBEDDED_SDK_BASE_PATH = '/sdk/embedded/';
export const IFRAME_BOOTSTRAP_MODULE = 'iframe-button-bootstrap.js';
// Modal iframe host + bootstrap + modal bundle
export const IFRAME_MODAL_ID = 'iframe-modal';
export const IFRAME_MODAL_BOOTSTRAP_MODULE = 'iframe-modal-bootstrap.js';
export const MODAL_TX_CONFIRM_BUNDLE = 'modal-tx-confirm.js';

// CSS Class Names - Centralized for type safety and maintainability
export const CSS_CLASSES = {
  // Container elements
  EMBEDDED_CONFIRM_CONTAINER: 'embedded-confirm-container',

  // Button elements
  EMBEDDED_BTN: 'embedded-btn',

  // Tooltip elements
  TOOLTIP_CONTENT: 'tooltip-content',

  // Loading elements
  LOADING: 'loading',
  SPINNER: 'spinner',
} as const;

// Type-safe selector functions using data attributes - corresponds to CSS selectors in ButtonWithTooltip.ts
export const SELECTORS = {
  EMBEDDED_CONFIRM_CONTAINER: `[data-embedded-tx-button-root]`, // CSS: [data-embedded-tx-button-root]
  EMBEDDED_BTN: `[data-embedded-btn]`, // CSS: [data-embedded-btn]
  TOOLTIP_CONTENT: `[data-tooltip-content]`, // CSS: [data-tooltip-content], [data-tooltip-content][data-position="..."], etc.
  LOADING: `[data-loading]`, // CSS: [data-loading], [data-loading][data-visible="true"]
  SPINNER: `[data-spinner]`, // CSS: [data-spinner]
} as const;

// Type-safe query selector functions for HTMLElement - uses SELECTORS constants that correspond to CSS selectors
export class ElementSelectors {
  private root: Document | ShadowRoot | Element | null | undefined;

  constructor(root?: Document | ShadowRoot | Element | null) {
    this.root = root;
  }

  // Instance methods (bound to the root passed in constructor) - uses SELECTORS that correspond to CSS selectors
  getEmbeddedConfirmContainer(): HTMLElement | null { // Corresponds to [data-embedded-tx-button-root] CSS selector
    return this.root?.querySelector(SELECTORS.EMBEDDED_CONFIRM_CONTAINER) || null;
  }

  getEmbeddedBtn(): HTMLElement | null { // Corresponds to [data-embedded-btn] CSS selector
    return this.root?.querySelector(SELECTORS.EMBEDDED_BTN) || null;
  }

  getTooltipContent(): HTMLElement | null { // Corresponds to [data-tooltip-content] CSS selector
    return this.root?.querySelector(SELECTORS.TOOLTIP_CONTENT) || null;
  }

  getLoading(): HTMLElement | null { // Corresponds to [data-loading] CSS selector
    return this.root?.querySelector(SELECTORS.LOADING) || null;
  }

  getSpinner(): HTMLElement | null { // Corresponds to [data-spinner] CSS selector
    return this.root?.querySelector(SELECTORS.SPINNER) || null;
  }

  // Static methods (require root parameter) - uses SELECTORS that correspond to CSS selectors
  static getEmbeddedConfirmContainer(root: Document | ShadowRoot | Element | null | undefined): HTMLElement | null { // Corresponds to [data-embedded-tx-button-root] CSS selector
    return root?.querySelector(SELECTORS.EMBEDDED_CONFIRM_CONTAINER) || null;
  }

  static getEmbeddedBtn(root: Document | ShadowRoot | Element | null | undefined): HTMLElement | null { // Corresponds to [data-embedded-btn] CSS selector
    return root?.querySelector(SELECTORS.EMBEDDED_BTN) || null;
  }

  static getTooltipContent(root: Document | ShadowRoot | Element | null | undefined): HTMLElement | null { // Corresponds to [data-tooltip-content] CSS selector
    return root?.querySelector(SELECTORS.TOOLTIP_CONTENT) || null;
  }

  static getLoading(root: Document | ShadowRoot | Element | null | undefined): HTMLElement | null { // Corresponds to [data-loading] CSS selector
    return root?.querySelector(SELECTORS.LOADING) || null;
  }

  static getSpinner(root: Document | ShadowRoot | Element | null | undefined): HTMLElement | null { // Corresponds to [data-spinner] CSS selector
    return root?.querySelector(SELECTORS.SPINNER) || null;
  }
}
