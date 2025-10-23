import { html, css, nothing, type PropertyValues } from 'lit';
import { LitElementWithProps } from '../LitElementWithProps';

import { TransactionInputWasm } from '../../../types';
import type { VRFChallenge } from '../../../types/vrf-worker';

import TxTree from '../TxTree';
import TxConfirmContentElement from './tx-confirm-content';
import { formatDeposit, formatGas } from '../common/formatters';
import { ModalTxConfirmerStyles, MODAL_CONFIRMER_THEMES } from './modal-confirmer-themes';
import type { ThemeName } from '../confirm-ui-types';
// Ensure required custom elements are defined in this bundle (avoid tree-shake drops)
import HaloBorderElement from '../HaloBorder';
import PasskeyHaloLoadingElement from '../PasskeyHaloLoading';
import type { ConfirmUIElement } from '../confirm-ui-types';
import { WalletIframeDomEvents } from '../../../WalletIframe/events';

export interface SecureTxSummary {
  to?: string;
  totalAmount?: string;
  method?: string;
  fingerprint?: string; // short digest for display
}

// TxAction from wasm-worker
export interface TxAction {
  action_type: string;
  method_name?: string;
  args?: string;
  gas?: string;
  deposit?: string;
  [key: string]: string | number | boolean | null | undefined | object;
}

/**
 * Modal transaction confirmation component with multiple display variants.
 * Built with Lit for automatic XSS protection and reactive updates.
 */
export class ModalTxConfirmElement extends LitElementWithProps implements ConfirmUIElement {
  static requiredChildTags = ['w3a-tx-confirm-content'];
  static strictChildDefinitions = true;
  // Prevent bundlers from dropping nested custom element definitions used via templates
  static keepDefinitions = [TxConfirmContentElement];
  // Component properties (automatically reactive)
  static properties = {
    nearAccountId: { type: String, attribute: 'near-account-id' },
    to: { type: String },
    totalAmount: { type: String },
    method: { type: String },
    fingerprint: { type: String },
    title: { type: String },
    cancelText: { type: String },
    confirmText: { type: String },
    txSigningRequests: { type: Array },
    vrfChallenge: { type: Object },
    loading: { type: Boolean },
    errorMessage: { type: String },
    styles: { type: Object },
    theme: { type: String, attribute: 'theme' },
  };

  totalAmount = '';
  method = '';
  fingerprint = '';
  title = 'Sign with Passkey';
  cancelText = 'Cancel';
  confirmText = 'Next';
  txSigningRequests: TransactionInputWasm[] = [];
  vrfChallenge?: VRFChallenge;
  loading = false;
  errorMessage: string | undefined = undefined;
  styles?: ModalTxConfirmerStyles;
  theme: ThemeName = 'dark';
  declare nearAccountId: string;
  // When true, this element will NOT remove itself on confirm/cancel.
  // The host is responsible for sending a CLOSE_MODAL instruction.
  deferClose = false;

  // Internal state
  // Keep essential custom elements from being tree-shaken
  private _ensureTreeDefinition = TxTree;
  private _ensureHaloElements = [HaloBorderElement, PasskeyHaloLoadingElement];
  // Removed fixed JS breakpoints; rely on CSS/container sizing for zoom resilience
  private _onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' || e.key === 'Esc') {
      // Only close for modal-style render modes
      e.preventDefault();
      this._handleCancel();
    }
  };
  private _onWindowMessage = (ev: MessageEvent) => {
    try {
      const data = (ev && ev.data) || {};
      if (!data || typeof (data as any).type !== 'string') return;
      if ((data as any).type === 'MODAL_TIMEOUT') {
        const msg = typeof (data as any).payload === 'string' && (data as any).payload
          ? (data as any).payload
          : 'Operation timed out';
        try { this.loading = false; } catch {}
        try { this.errorMessage = msg; } catch {}
        // Emit cancel so the host resolves and removes this element via two‑phase close
        this._handleCancel();
      }
    } catch {}
  };
  // Guard to prevent immediate backdrop-cancel due to the click that mounted the modal
  private _backdropArmed = false;

  // Closed Shadow DOM for security
  static shadowRootOptions: ShadowRootInit = { mode: 'closed' };

  static styles = css`
    :host {

      /* Default style-guide variables (can be overridden by applyStyles) */
      --w3a-font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      --w3a-font-size-sm: 0.8rem;
      --w3a-font-size-base: 1rem;
      --w3a-font-size-lg: 1.125rem;
      --w3a-font-size-xl: 1.25rem;

      --w3a-radius-md: 0.5rem;
      --w3a-radius-lg: 0.75rem;
      --w3a-radius-xl: 1rem;

      /* Spacing tokens only; no legacy gap vars */

      /* Component display */
      display: block;

      /* Prefer component-scoped host vars with global fallbacks */
      font-family: var(--w3a-modal__host__font-family, var(--w3a-font-family));
      font-size: var(--w3a-modal__host__font-size, var(--w3a-font-size-base));
      line-height: 1.5;
      color: var(--w3a-modal__host__color, var(--w3a-colors-textPrimary));
      background-color: var(--w3a-modal__host__background-color, var(--w3a-colors-colorBackground));

      scrollbar-width: thin;
      scrollbar-color: rgba(25, 25, 25, 0.2);
    }

    /* Reset and base styles */
    *, *::before, *::after {
      box-sizing: border-box;
    }

    .modal-backdrop-blur {
      position: fixed;
      inset: 0;
      display: grid;
      justify-content: center;
      z-index: 2147483647;
      background: var(--w3a-modal__modal-backdrop-blur__background, rgba(0, 0, 0, 0.8));
      backdrop-filter: var(--w3a-modal__modal-backdrop-blur__backdrop-filter, blur(0px));
      /* animation: var(--w3a-modal__modal-backdrop-blur__animation, backdrop-opacity 60ms ease-in); */
      opacity: 1;
      will-change: var(--w3a-modal__modal-backdrop-blur__will-change, opacity, backdrop-filter);
    }

    @keyframes backdrop-opacity {
      from {
        opacity: 0;
      }
      to {
        opacity: 1;
      }
    }

    .modal-backdrop {
      position: fixed;
      inset: 0;
      display: grid;
      place-items: center;
      z-index: 2147483648; /* Above backdrop */
      pointer-events: none;
    }

    .modal-backdrop > * {
      pointer-events: auto;
    }

    .modal-container-root {
      display: grid;
      gap: 0.5rem;
      position: var(--w3a-modal__modal-container-root__position, relative);
      border: var(--w3a-modal__modal-container-root__border, 1px solid var(--w3a-colors-borderPrimary, rgba(255,255,255,0.12)));
      border-radius: var(--w3a-modal__modal-container-root__border-radius, 2rem);
      margin: var(--w3a-modal__modal-container-root__margin, 0px);
      padding: var(--w3a-modal__modal-container-root__padding, 0.75rem);
      height: var(--w3a-modal__modal-container-root__height, auto);
      overflow: var(--w3a-modal__modal-container-root__overflow, hidden);
      box-shadow: var(--w3a-modal__modal-container-root__box-shadow, 0 20px 60px rgba(0, 0, 0, 0.6), 0 8px 24px rgba(0, 0, 0, 0.4));
      background: var(--w3a-modal__modal-container-root__background, var(--w3a-colors-colorBackground, #111));
      backdrop-filter: blur(4px);
      animation: fadeIn 32ms ease-in;
      will-change: opacity, transform;
    }

    @keyframes fadeIn {
      from {
        opacity: 0;
        transform: translateY(20px) scale(0.95);
      }
      to {
        opacity: 1;
        transform: translateY(0px) scale(1);
      }
    }

    .responsive-card {
      position: relative;
      max-width: 600px;
      overflow: visible;
      border-radius: 2rem;
      z-index: 1;
      padding: var(--w3a-modal__responsive-card__padding, 0rem);
      margin: var(--w3a-modal__responsive-card__margin, 0px);
    }
    .card-background-border {
      border-radius: var(--w3a-modal__card-background-border-radius, 2rem);
      background: var(--w3a-modal__card-background-border__background, oklch(0.25 0.012 240));
      border: var(--w3a-modal__card-background-border__border, 1px solid var(--w3a-slate600));
      margin: var(--w3a-modal__card-background-border__margin, 0px);
    }

    .rpid-wrapper {
      border-bottom: var(--w3a-modal__rpid-wrapper__border-bottom);
    }
    .rpid {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 2px;
      margin-top: 2px;
      font-size: 0.7rem;
      color: var(--w3a-modal__label__color);
      font-weight: 400;
    }
    .secure-indicator {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .padlock-icon {
      width: 1em;
      height: 1em;
      margin-inline-end: 0.5em;
      flex: none;
      color: var(--w3a-modal__padlock-icon__color, rgba(255, 255, 255, 0.6));
    }
    .block-height-icon {
      width: 1em;
      height: 1em;
      margin-inline-end: 0.5em;
      flex: none;
      color: var(--w3a-modal__block-height-icon__color, rgba(255, 255, 255, 0.6));
    }
    .domain-text {
      color: var(--w3a-modal__domain-text__color, rgba(255, 255, 255, 0.6));
    }
    .security-details {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--w3a-modal__security-details__color, rgba(255, 255, 255, 0.6));
    }

    /* Hero section with halo and headings */
    .hero {
      display: grid;
      justify-items: center;
      align-items: center;
      gap: 0.5rem;
      position: relative;
      display: flex;
    }
    .hero-container {
      min-height: var(--w3a-modal__hero-container__min-height, none);
      display: grid;
      align-items: flex-start;
      margin-right: 1rem;
    }
    .hero-heading {
      margin: 0;
      font-size: var(--w3a-font-size-lg);
      font-weight: 500;
      color: var(--w3a-modal__hero-heading__color, var(--w3a-colors-textPrimary));
      text-align: start;
    }
    .hero-subheading {
      margin: 0;
      font-size: 0.9rem;
      color: var(--w3a-modal__hero-subheading__color);
      text-align: start;
    }

    .summary-row {
      display: grid;
      /* Use content-aware label column that scales with text */
      grid-template-columns: minmax(8.5em, max-content) 1fr;
      align-items: center;
      gap: var(--w3a-spacing-sm);
      background: transparent;
      border-radius: 0;
      transition: all 100ms cubic-bezier(0.2, 0.6, 0.2, 1);
      position: relative;
      overflow: hidden;
    }
    .summary-row > * { min-width: 0; }
    .summary-label {
      color: var(--w3a-modal__summary-label__color);
      font-size: var(--w3a-font-size-sm);
      font-weight: 500;
    }
    .summary-value {
      color: var(--w3a-modal__value__color);
      font-size: var(--w3a-font-size-sm);
      font-weight: 500;
      word-break: break-word;
      overflow-wrap: anywhere;
      hyphens: auto;
    }

    /* Transactions section */

    .action-item {
      margin-bottom: var(--w3a-spacing-sm);
      overflow: hidden;
      position: relative;
    }

    .action-item:last-child {
      margin-bottom: 0;
    }

    .action-row {
      display: grid;
      /* Content-aware label column that adapts to larger text sizes */
      grid-template-columns: var(--w3a-modal__action-row__grid-template-columns, minmax(7.5em, max-content) 1fr);
      align-items: center;
      gap: var(--w3a-spacing-sm);
      padding: 0;
      margin-bottom: 0;
      background: transparent;
      border-radius: 0;
    }
    .action-row > * { min-width: 0; }

    .action-row:last-child {
      margin-bottom: 0;
    }

    .action-label {
      font-family: var(--w3a-font-family);
      color: var(--w3a-modal__action-label__color);
      font-size: var(--w3a-font-size-sm);
      line-height: 1.5;
      font-weight: var(--w3a-modal__action-label__font-weight, 500);
      letter-spacing: 0.02em;
      padding: var(--w3a-modal__action-label__padding, 2px 0px);
      margin: var(--w3a-modal__action-label__margin, 0px);
    }

    .action-content {
      padding: var(--w3a-modal__action-content__padding, 0.5rem);
      font-size: var(--w3a-font-size-sm);
      line-height: 1.4;
      max-height: var(--w3a-modal__action-content__max-height, 50vh);
      overflow: auto;
      overscroll-behavior: contain;
      scrollbar-width: thin;
      background: var(--w3a-modal__action-content__background, #242628);
      border-radius: 12px;
    }

    /* Prefer dynamic viewport units when supported (iOS Safari address bar) */
    @supports (height: 1dvh) {
      .action-content {
        max-height: var(--w3a-modal__action-content__max-height, 50dvh);
      }
    }

    .action-content-min-height {
      min-height: var(--w3a-modal__action-content__min-height, 200px);
    }

    .action-content::-webkit-scrollbar {
      width: var(--w3a-modal__action-content__scrollbar-width, 6px);
    }

    .action-content::-webkit-scrollbar-track {
      background: var(--w3a-modal__action-content-scrollbar-track__background);
      border-radius: var(--w3a-radius-md);
    }

    .action-content::-webkit-scrollbar-thumb {
      background: var(--w3a-modal__action-content-scrollbar-thumb__background);
      border-radius: var(--w3a-radius-md);
    }

    .action-value {
      color: var(--w3a-modal__action-value__color);
      word-break: break-word;
      font-weight: var(--w3a-modal__action-value__font-weight, 500);
      font-size: var(--w3a-font-size-sm);
    }

    .action-subitem {
      margin-bottom: var(--w3a-modal__action-subitem__margin-bottom, var(--w3a-spacing-sm));
      padding: 0rem 0rem 0rem var(--w3a-modal__action-subitem__padding, var(--w3a-spacing-md));
      background: var(--w3a-modal__action-subitem__background, unset);
      position: relative;
    }

    .action-subitem:last-child {
      margin-bottom: 0;
    }

    .action-subheader {
      font-size: var(--w3a-font-size-sm);
      font-weight: 600;
      color: var(--w3a-modal__action-subheader__color);
    }

    .code-block {
      background: var(--w3a-modal__code-block__background);
      border: var(--w3a-modal__code-block__border, 1px solid transparent);
      border-radius: var(--w3a-modal__code-block__border-radius, var(--w3a-radius-md));
      /* dimensions */
      margin: var(--w3a-modal__code-block__margin, 4px 0px 0px 0px);
      padding: var(--w3a-modal__code-block__padding, var(--w3a-spacing-sm));
      min-height: calc(1.4em * 3);
      max-height: var(--w3a-modal__code-block__max-height, 400px);
      height: auto;
      max-width: var(--w3a-modal__code-block__max-width, 100%);
      overflow: auto;
      /* text styles */
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
      font-size: var(--w3a-modal__code-block__font-size, var(--w3a-font-size-sm));
      color: var(--w3a-modal__code-block__color);
      line-height: 1.4;
      /* pretty print JSON and text wrap */
      white-space: pre;
      text-wrap: auto;
      word-break: var(--w3a-modal__code-block__word-break, break-word);
      /* Ensure resize handle is visible and functional */
      resize: vertical;
      box-sizing: border-box;
    }

    .method-name {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
      font-weight: var(--w3a-modal__method-name__font-weight, 600);
      color: var(--w3a-modal__method-name__color);
    }

    /* Button styles */
    .buttons {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.5rem;
      position: relative;
      z-index: 1;
      align-items: stretch;
    }

    .error-banner {
      color: var(--w3a-modal__error-banner__color, #ef4444);
      font-size: var(--w3a-modal__error-banner__font-size, 0.9rem);
      text-align: var(--w3a-modal__error-banner__text-align, start);
      font-weight: 500;
    }

    .btn {
      background-color: var(--w3a-modal__btn__background-color);
      box-shadow: var(--w3a-modal__btn__box-shadow, none);
      color: var(--w3a-modal__btn__color);
      text-align: center;
      border-radius: 2rem;
      margin-right: 1px;
      justify-content: center;
      align-items: center;
      /* Scalable tap target: ~44px at 16px root */
      min-height: 2.75em;
      width: 100%;
      padding: var(--w3a-modal__btn__padding, 0.7em 1em);
      font-size: var(--w3a-font-size-base);
      display: inline-flex;
      gap: 0.5em;
      cursor: pointer;
      border: none;
      font-family: var(--w3a-font-family);
      font-weight: var(--w3a-modal__btn__font-weight, 500);
      min-width: 0;
      position: relative;
      overflow: hidden;
      /* Smooth press-down and release animation */
      transition:
        transform var(--w3a-modal__btn__transition-transform, 120ms cubic-bezier(0.2, 0.6, 0.2, 1)),
        background-color 120ms ease-out,
        box-shadow 120ms ease-out;
      transform-origin: center;
      will-change: transform;
      -webkit-tap-highlight-color: transparent;
    }

    .btn:hover {
      background-color: var(--w3a-modal__btn-hover__background-color);
      box-shadow: var(--w3a-modal__btn-hover__box-shadow, none);
    }

    .btn:active {
      background-color: var(--w3a-modal__btn-active__background-color);
      /* Default to a subtle scale-down on press; overridable via CSS var */
      transform: var(--w3a-modal__btn__active-transform, scale(0.98));
    }

    .btn-cancel {
      box-shadow: none;
      color: var(--w3a-modal__btn-cancel__color, var(--w3a-colors-textPrimary));
      background-color: var(--w3a-modal__btn-cancel__background-color, var(--w3a-colors-surface));
      border: var(--w3a-modal__btn-cancel__border, none);
    }

    .btn-cancel:hover {
      color: var(--w3a-modal__btn-cancel-hover__color, var(--w3a-colors-textPrimary));
      background-color: var(--w3a-modal__btn-cancel-hover__background-color, var(--w3a-colors-borderPrimary));
      border: var(--w3a-modal__btn-cancel-hover__border, none);
    }

    .btn-confirm {
      background-color: var(--w3a-modal__btn-confirm__background-color);
      color: var(--w3a-modal__btn-confirm__color);
      border: var(--w3a-modal__btn-confirm__border, none);
    }

    .btn-confirm:hover {
      background-color: var(--w3a-modal__btn-confirm-hover__background-color);
      border: var(--w3a-modal__btn-confirm-hover__border, none);
    }

    .btn-danger {
      background-color: var(--w3a-modal__btn-danger__background-color, oklch(0.66 0.180 19)); /* red500 */
      color: var(--w3a-modal__btn-danger__color, #ffffff);
      border: var(--w3a-modal__btn-danger__border, none);
    }
    .btn-danger:hover {
      background-color: var(--w3a-modal__btn-danger-hover__background-color, oklch(0.74 0.166 19)); /* red400 */
    }

    .btn:focus-visible {
      outline: 2px solid var(--w3a-modal__btn__focus-outline-color);
      outline-offset: 3px;
      box-shadow: var(--w3a-modal__btn__focus-box-shadow, 0 0 0 3px oklch(0.55 0.18 240 / 0.12));
    }

    /* Single-button alignment (place single button in right column) */
    .buttons.single .btn {
      grid-column: 2 / 3;
      justify-self: end;
    }

    /* Responsive adjustments */

    @media (max-width: 375px) {
      /* Ensure full-bleed width on mobile */
      .modal-container-root { width: 100vw; }
      @supports (width: 1dvw) {
        .modal-container-root { width: 100dvw; }
      }
      /* remove backdrop on mobile becasue of Safari 26 address bar bugs */
      .modal-backdrop-blur {
        opacity: 0;
      }
    }

    @media (max-width: 640px) {
      .responsive-card {
        /* Make modal 1rem narrower on small/zoomed viewports */
        max-width: var(--w3a-modal__mobile__responsive-card__max-width, calc(100vw - 2rem));
      }

      /* Override with dvw on capable browsers for Safari correctness */
      @supports (width: 1dvw) {
        .responsive-card {
          max-width: var(--w3a-modal__mobile__responsive-card__max-width, calc(100dvw - 2rem));
        }
      }

      /* Keep inner content (TxTree) in sync to avoid overflow */
      .responsive-card w3a-tx-confirm-content {
        --tooltip-margin: 2rem;
      }

      .summary-row {
        grid-template-columns: 1fr;
        gap: var(--w3a-modal__responsive-row__gap, 0.25rem);
        padding: calc(var(--w3a-spacing-sm) + var(--w3a-spacing-xs));
      }

      .summary-label {
        font-size: var(--w3a-font-size-sm);
        margin-bottom: var(--w3a-modal__responsive-label__margin-bottom, 2px);
      }

      .action-row {
        grid-template-columns: var(--w3a-modal__action-row__template-columns, 100px 1fr);
        gap: var(--w3a-modal__responsive-action-row__gap, 0.25rem);
        padding: var(--w3a-spacing-sm);
      }

      .buttons {
        display: flex;
      }

      .btn {
        width: 100%;
        padding: var(--w3a-spacing-md) calc(var(--w3a-spacing-md) + var(--w3a-spacing-xs));
      }

      .action-content {
        font-size: var(--w3a-font-size-sm);
        max-height: var(--w3a-modal__responsive-action-content__max-height, 100px);
      }
    }

    /* Tablet adjustments */
    @media (min-width: 641px) and (max-width: 1024px) {
      .responsive-card {
        max-width: var(--w3a-modal__tablet__responsive-card__max-width, 500px);
      }
    }

    /* Large desktop adjustments */
    @media (min-width: 1025px) {
      .responsive-card {
        max-width: var(--w3a-modal__desktop__responsive-card__max-width, 600px);
      }
    }

    /* Loading indicator styles */
    .loading-indicator {
      display: inline-block;
      width: var(--w3a-modal__loading-indicator__width, 12px);
      height: var(--w3a-modal__loading-indicator__height, 12px);
      border: 2px solid var(--w3a-modal__loading-indicator__border-color, rgba(255,255,255,0.55));
      border-radius: 50%;
      border-top-color: var(--w3a-modal__loading-indicator__border-top-color, rgba(255,255,255,0.95));
      animation: spin 1s ease-in-out infinite;
      margin-right: var(--w3a-spacing-sm);
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .btn.loading {
      pointer-events: none;
      opacity: 0.8;
    }

    /* Fallback support for browsers without backdrop-filter */
    @supports not (backdrop-filter: blur(8px)) {
      .row { background: var(--w3a-modal__row__background); }
      .action-item { background: var(--w3a-modal__action-item__background); }
      .action-content { background: var(--w3a-modal__action-content__background); }
      .btn { background: var(--w3a-modal__btn__background-color); }
      .btn-confirm { background: var(--w3a-modal__btn-confirm__background-color); }
    }
  `;

  updated(changedProperties: PropertyValues) {
    super.updated(changedProperties);

    // Update styles when theme changes
    if (changedProperties.has('theme')) {
      this.updateTheme();
    }
  }

  private updateTheme() {
    // Update styles based on the current theme
    const selectedTheme = MODAL_CONFIRMER_THEMES[this.theme] || MODAL_CONFIRMER_THEMES.dark;
    const host = selectedTheme.host || {};
    // Promote essential host values to base variables so global tokens are populated
    this.styles = {
      ...selectedTheme,
      // Base-level tokens expected by CSS: --w3a-font-family, --w3a-font-size-base,
      // and optional color/background fallbacks
      fontFamily: host.fontFamily,
      fontSizeBase: host.fontSize,
      color: host.color,
      backgroundColor: host.backgroundColor,
    };
    // Apply the styles immediately
    this.applyStyles(this.styles);
  }

  protected getComponentPrefix(): string {
    return 'modal';
  }

  protected applyStyles(styles: ModalTxConfirmerStyles): void {
    super.applyStyles(styles, 'modal');
  }

  disconnectedCallback() {
    try { window.removeEventListener('keydown', this._onKeyDown); } catch {}
    try { window.removeEventListener('message', this._onWindowMessage as EventListener); } catch {}
    super.disconnectedCallback();
  }

  connectedCallback(): void {
    super.connectedCallback();
    // Arm backdrop after the current event loop to avoid capturing the mounting click
    try { setTimeout(() => { this._backdropArmed = true; }, 0); } catch {}
    // Initialize styles based on theme
    this.updateTheme();
    // Listen globally so Escape works regardless of focus target
    try { window.addEventListener('keydown', this._onKeyDown); } catch {}
    // Listen for global timeout notification (posted by SignerWorkerManager on operation timeout)
    try { window.addEventListener('message', this._onWindowMessage as EventListener); } catch {}
    // Ensure this iframe/host receives keyboard focus so ESC works immediately
    try {
      // Make host focusable and focus it without scrolling
      const hostEl = this as unknown as HTMLElement;
      hostEl.tabIndex = hostEl.tabIndex ?? -1;
      hostEl.focus({ preventScroll: true } as FocusOptions);
      // Also attempt to focus the frame window in case we're inside an iframe
      if (typeof window.focus === 'function') {
        window.focus();
      }
    } catch {}
  }

  render() {
    return html`
      <!-- Separate backdrop layer for independent animation -->
      <div class="modal-backdrop-blur" @click=${this._handleBackdropClick}></div>
      <!-- Modal content layer -->
      <div class="modal-backdrop" @click=${this._handleContentClick}>
        <div class="modal-container-root">

          <div class="responsive-card">
            <div class="hero">
              <w3a-passkey-halo-loading
                .theme=${this.theme}
                .animated=${!this.errorMessage ? true : false}
                .ringGap=${3}
                .ringWidth=${3}
                .ringBorderRadius=${'1.25rem'}
                .ringBackground=${'var(--w3a-modal__passkey-halo-loading__ring-background)'}
                .innerPadding=${'var(--w3a-modal__passkey-halo-loading__inner-padding, 5px)'}
                .innerBackground=${'var(--w3a-modal__passkey-halo-loading__inner-background)'}
                .height=${36}
                .width=${36}
              ></w3a-passkey-halo-loading>
              <div class="hero-container">
                <!-- Hero heading -->
                ${(() => {
                  const isRegistration = (this.txSigningRequests?.length || 0) === 0;
                  const heading = isRegistration ? 'Register with Passkey' : 'Confirm with Passkey';
                  return html`<h2 class="hero-heading">${heading}</h2>`;
                })()}
                ${this.errorMessage
                  ? html`<div class="error-banner">${this.errorMessage}</div>`
                  : ''}
                <!-- RpID Section -->
                <div class="rpid-wrapper">
                  <div class="rpid">
                    <div class="secure-indicator">
                      <svg xmlns="http://www.w3.org/2000/svg"
                        class="padlock-icon"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      >
                        <rect width="18" height="11" x="3" y="11" rx="2" ry="2"/>
                        <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                      </svg>
                      ${this.vrfChallenge?.rpId
                        ? html`<span class="domain-text">${this.vrfChallenge.rpId}</span>`
                        : ''}
                    </div>
                    <span class="security-details">
                      <svg xmlns="http://www.w3.org/2000/svg"
                        class="block-height-icon"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      >
                        <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/>
                        <path d="m3.3 7 8.7 5 8.7-5"/>
                        <path d="M12 22V12"/>
                      </svg>
                      ${this.vrfChallenge?.rpId
                        ? html`block ${this.vrfChallenge.blockHeight}`
                        : ''}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="responsive-card">
            <w3a-tx-confirm-content
              .nearAccountId=${this['nearAccountId'] || ''}
              .txSigningRequests=${this.txSigningRequests || []}
              .vrfChallenge=${this.vrfChallenge}
              .theme=${this.theme}
              .loading=${this.loading}
              .errorMessage=${this.errorMessage || ''}
              .title=${this.title}
              .confirmText=${this.confirmText}
              .cancelText=${this.cancelText}
              @lit-confirm=${this._handleConfirm}
              @lit-cancel=${this._handleCancel}
            ></w3a-tx-confirm-content>
          </div>
        </div>
      </div>
    `;
  }

  private _handleCancel() {
    if (this.loading) return;
    try {
      // Canonical event (include a consistent detail payload)
      this.dispatchEvent(new CustomEvent(WalletIframeDomEvents.TX_CONFIRMER_CANCEL, {
        bubbles: true,
        composed: true,
        detail: { confirmed: false }
      }));
    } catch {}
    if (!this.deferClose) {
      this._resolveAndCleanup(false);
    }
  }

  private _handleConfirm() {
    if (this.loading) return;
    this.loading = true;
    this.requestUpdate();
    try {
      // Canonical event (include a consistent detail payload)
      this.dispatchEvent(new CustomEvent(WalletIframeDomEvents.TX_CONFIRMER_CONFIRM, {
        bubbles: true,
        composed: true,
        detail: { confirmed: true }
      }));
    } catch {}
    if (!this.deferClose) {
      this._resolveAndCleanup(true);
    }
  }

  private _handleBackdropClick() {
    // Ignore the first click that may have triggered mounting the modal
    if (!this._backdropArmed) return;
    this._handleCancel();
  }

  private _handleContentClick(e: Event) {
    e.stopPropagation();
  }

  private _resolveAndCleanup(confirmed: boolean) {
    this.remove();
  }

  // Public method for two-phase close from host/bootstrap
  close(confirmed: boolean) {
    this._resolveAndCleanup(confirmed);
  }

}

// Register the custom element
import { W3A_MODAL_TX_CONFIRMER_ID } from '../tags';

// Define canonical tag
if (!customElements.get(W3A_MODAL_TX_CONFIRMER_ID)) {
  customElements.define(W3A_MODAL_TX_CONFIRMER_ID, ModalTxConfirmElement);
}
