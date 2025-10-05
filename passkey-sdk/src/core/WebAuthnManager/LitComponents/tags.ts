// Lit component tag names
// These are rendered as web components:
// e.g. <w3a-tx-button></w3a-tx-button>, <w3a-button-with-tooltip>, etc;

// Preferred aliases for top-level elements used by WalletIframe host
export const W3A_BUTTON_WITH_TOOLTIP_ID = 'w3a-button-with-tooltip';
export const W3A_TX_BUTTON_ID = 'w3a-tx-button';
export const W3A_TX_BUTTON_HOST_ID = 'w3a-tx-button-host';

// Consolidated tag registry and helpers
export type TagDef = { id: string; aliases?: string[] };
export const TAG_DEFS = {
  txButton: { id: W3A_TX_BUTTON_ID, aliases: [] },
  txHost: { id: W3A_TX_BUTTON_HOST_ID, aliases: ['w3a-wallet-tx-host'] },
} satisfies Record<string, TagDef>;
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
export const EMBEDDED_SDK_BASE_PATH = '/sdk/';
export const IFRAME_TX_BUTTON_BOOTSTRAP_MODULE = 'iframe-tx-button-bootstrap.js';
// Modal iframe host + bootstrap + modal bundle
export const W3A_IFRAME_TX_CONFIRMER_ID = 'w3a-iframe-tx-confirmer';
export const IFRAME_TX_CONFIRMER_BOOTSTRAP_MODULE = 'iframe-tx-confirmer-bootstrap.js';
export const MODAL_TX_CONFIRM_BUNDLE = 'tx-confirm-ui.js';

// Transaction confirmer element tags (host-rendered)
// Canonical tag names use the "-tx-confirmer" suffix for consistency
export const W3A_MODAL_TX_CONFIRMER_ID = 'w3a-modal-tx-confirmer';
export const W3A_DRAWER_TX_CONFIRMER_ID = 'w3a-drawer-tx-confirmer';
export const W3A_TX_CONFIRM_CONTENT_ID = 'w3a-tx-confirm-content';

// Shared building blocks
export const W3A_DRAWER_ID = 'w3a-drawer';
export const W3A_TX_TREE_ID = 'w3a-tx-tree';
export const W3A_HALO_BORDER_ID = 'w3a-halo-border';
export const W3A_PASSKEY_HALO_LOADING_ID = 'w3a-passkey-halo-loading';

// Unified list of confirmer hosts the wallet may need to target for lifecycle events
export const CONFIRM_UI_ELEMENT_SELECTORS = [
  W3A_MODAL_TX_CONFIRMER_ID,
  W3A_DRAWER_TX_CONFIRMER_ID,
  W3A_IFRAME_TX_CONFIRMER_ID,
] as const;

// Dedicated portal container to enforce a single confirmer instance
export const W3A_CONFIRM_PORTAL_ID = 'w3a-confirm-portal';

// Export viewer iframe host + bootstrap + viewer bundle
export const W3A_EXPORT_VIEWER_IFRAME_ID = 'w3a-export-viewer-iframe';
export const W3A_EXPORT_KEY_VIEWER_ID = 'w3a-export-key-viewer';
export const IFRAME_EXPORT_BOOTSTRAP_MODULE = 'iframe-export-bootstrap.js';
export const EXPORT_VIEWER_BUNDLE = 'export-private-key-viewer.js';
export const EXPORT_DRAWER_BUNDLE = 'export-private-key-drawer.js';

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
