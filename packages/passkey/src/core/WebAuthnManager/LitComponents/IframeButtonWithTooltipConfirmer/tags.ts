
// Lit component tag names
// These are rendered as web components:
// e.g. <iframe-button></iframe-button>, <embedded-tx-button>, etc;
export const IFRAME_BUTTON_ID = 'iframe-button';
export const EMBEDDED_TX_BUTTON_ID = 'embedded-tx-button';
export const EMBEDDED_TX_BUTTON_ROOT_CLASS = 'embedded-tx-button-root';

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

// Type-safe selector functions using data attributes - corresponds to CSS selectors in EmbeddedTxButton.ts
export const SELECTORS = {
  EMBEDDED_CONFIRM_CONTAINER: `[data-embedded-confirm-container]`, // CSS: [data-embedded-confirm-container]
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
  getEmbeddedConfirmContainer(): HTMLElement | null { // Corresponds to [data-embedded-confirm-container] CSS selector
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
  static getEmbeddedConfirmContainer(root: Document | ShadowRoot | Element | null | undefined): HTMLElement | null { // Corresponds to [data-embedded-confirm-container] CSS selector
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
