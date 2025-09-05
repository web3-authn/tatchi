import { html, css, type PropertyValues } from 'lit';
import { LitElementWithProps } from '../LitElementWithProps';
import { classMap } from 'lit/directives/class-map.js';
import { when } from 'lit/directives/when.js';
import { TransactionInputWasm, ActionArgsWasm } from '../../../types';
import { formatArgs, formatDeposit, formatGas } from '../common/formatters';
import { ModalTxConfirmerStyles, MODAL_CONFIRMER_THEMES, type ModalConfirmerTheme } from './modal-confirmer-themes';
import type { VRFChallenge } from '../../../types/vrf-worker';
// Ensure required custom elements are defined in this bundle (avoid tree-shake drops)
import HaloBorderElement from '../HaloBorder';
import PasskeyHaloLoadingElement from '../PasskeyHaloLoading';
if (!customElements.get('w3a-halo-border')) {
  try { customElements.define('w3a-halo-border', HaloBorderElement); } catch {}
}
if (!customElements.get('w3a-passkey-halo-loading')) {
  try { customElements.define('w3a-passkey-halo-loading', PasskeyHaloLoadingElement); } catch {}
}

export type ConfirmRenderMode = 'inline' | 'modal' | 'fullscreen' | 'toast';
export type ConfirmVariant = 'default' | 'warning' | 'danger';

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
export class ModalTxConfirmElement extends LitElementWithProps {
  // Component properties (automatically reactive)
  static properties = {
    mode: { type: String },
    variant: { type: String },
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
    _isVisible: { type: Boolean, state: true },
    _isAnimating: { type: Boolean, state: true }
  };

  mode: ConfirmRenderMode = 'modal';
  variant: ConfirmVariant = 'default';

  totalAmount = '';
  method = '';
  fingerprint = '';
  title = 'Sign Transaction';
  cancelText = 'Cancel';
  confirmText = 'Confirm and Sign';
  txSigningRequests: TransactionInputWasm[] = [];
  vrfChallenge?: VRFChallenge;
  loading = false;
  errorMessage: string | undefined = undefined;
  styles?: ModalTxConfirmerStyles;
  theme: ModalConfirmerTheme = 'dark';
  // When true, this element will NOT remove itself on confirm/cancel.
  // The host is responsible for sending a CLOSE_MODAL instruction.
  deferClose = false;

  // Internal state
  private _isVisible = false;
  private _isAnimating = false;

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

      --w3a-gap-2: 0.5rem;
      --w3a-gap-3: 0.75rem;
      --w3a-gap-4: 1rem;

      /* Component display */
      display: block;

      /* Prefer component-scoped host vars with global fallbacks */
      font-family: var(--w3a-modal__host__font-family, var(--w3a-font-family));
      font-size: var(--w3a-modal__host__font-size, var(--w3a-font-size-base));
      line-height: 1.5;
      color: var(--w3a-modal__host__color, var(--w3a-color-text));
      background-color: var(--w3a-modal__host__background-color, var(--w3a-color-background));

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
      background: var(--w3a-modal__modal-backdrop-blur__background, rgba(0, 0, 0, 0.7));
      backdrop-filter: var(--w3a-modal__modal-backdrop-blur__backdrop-filter, blur(2px));
      animation: backdrop-opacity 50ms ease-out, backdrop-blur 200ms ease-out forwards;
      will-change: opacity, backdrop-filter;
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
      position: var(--w3a-modal__modal-container-root__position, relative);
      border: var(--w3a-modal__modal-container-root__border, none);
      border-radius: var(--w3a-modal__modal-container-root__border-radius, 1.5rem);
      margin: var(--w3a-modal__modal-container-root__margin, 0px);
      padding: var(--w3a-modal__modal-container-root__padding, 0px);
      height: var(--w3a-modal__modal-container-root__height, auto);
      overflow: var(--w3a-modal__modal-container-root__overflow, hidden);
      box-shadow: var(--w3a-modal__modal-container-root__box-shadow, 0 2px 4px rgba(0, 0, 0, 0.05));
      background: var(--w3a-modal__modal-container-root__background);
    }

    @keyframes backdrop-blur {
      from {
        backdrop-filter: var(--w3a-modal__modal-backdrop-blur__filter-from, blur(0px));
      }
      to {
        backdrop-filter: var(--w3a-modal__modal-backdrop-blur__filter-to, blur(2px));
      }
    }

    @keyframes fadeIn {
      from {
        opacity: 0;
        transform: scale(0.95);
      }
      to {
        opacity: 1;
        transform: scale(1);
      }
    }

    .rpid-wrapper {
      border-bottom: var(--w3a-modal__rpid-wrapper__border-bottom);
    }
    .rpid {
      padding: 4px 1rem;
      display: flex;
      align-items: center;
      gap: 6px;
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
      width: 12px;
      height: 12px;
      margin-right: 4px;
      color: var(--w3a-modal__padlock-icon__color, rgba(255, 255, 255, 0.6));
    }
    .block-height-icon {
      width: 12px;
      height: 12px;
      margin-right: 4px;
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
      margin-left: 8px;
    }

    /* Hero section with halo and headings */
    .hero {
      display: grid;
      justify-items: center;
      align-items: center;
      gap: var(--w3a-gap-2);
      padding: var(--w3a-modal__hero__padding, 2rem 0rem 1rem 0rem);
    }
    .hero-container {
      height: var(--w3a-modal__hero-container__height, 40px);
    }
    .hero-heading {
      margin: 0;
      font-size: var(--w3a-font-size-lg);
      font-weight: 600;
      color: var(--w3a-modal__header__color);
      text-align: center;
    }
    .hero-subheading {
      margin: 0;
      font-size: 0.9rem;
      color: var(--w3a-modal__label__color);
      text-align: center;
    }

    /* Summary section */
    .summary-section {
      position: relative;
      z-index: 1;
    }
    .summary-grid {
      display: grid;
      gap: var(--w3a-gap-2);
      grid-template-columns: 1fr;
      margin-top: var(--w3a-gap-2);
      margin-bottom: var(--w3a-gap-2);
      position: relative;
      z-index: 1;
    }
    .summary-row {
      display: grid;
      grid-template-columns: var(--w3a-modal__row__template-columns, 115px 1fr);
      align-items: center;
      gap: var(--w3a-gap-2);
      background: transparent;
      border-radius: 0;
      transition: all 160ms cubic-bezier(0.2, 0.6, 0.2, 1);
      position: relative;
      overflow: hidden;
    }
    .summary-label {
      color: var(--w3a-modal__label__color);
      font-size: var(--w3a-font-size-sm);
      font-weight: var(--w3a-modal__label__font-weight, 500);
    }
    .summary-value {
      color: var(--w3a-modal__value__color);
      font-size: var(--w3a-font-size-sm);
      font-weight: var(--w3a-modal__value__font-weight, 500);
      word-break: break-word;
    }

    /* Transactions section */
    .tx-section {
      margin: var(--w3a-modal__tx-section__margin, 0px);
      position: relative;
      z-index: 1;
      animation: fadeIn 50ms ease-out forwards;
      will-change: opacity, transform;
    }

    .tx-list {
      position: relative;
      border: var(--w3a-modal__tx-list__border, 1px solid transparent);
      border-radius: var(--w3a-modal__tx-list__border-radius, 24px);
      padding: var(--w3a-modal__tx-list__padding, var(--w3a-gap-4));
      height: 100%;
      width: 100%;
      min-width: var(--w3a-modal__tx-list__min-width, 420px);
      max-width: var(--w3a-modal__tx-list__max-width, 600px);
      overflow: hidden;
      box-shadow: var(--w3a-modal__tx-list__box-shadow, none);
      background: var(--w3a-modal__tx-list__background);
    }

    .action-item {
      margin-bottom: var(--w3a-gap-2);
      overflow: hidden;
      position: relative;
    }

    .action-item:last-child {
      margin-bottom: 0;
    }

    .action-row {
      display: grid;
      grid-template-columns: var(--w3a-modal__action-row__template-columns, 100px 1fr);
      align-items: center;
      gap: var(--w3a-gap-2);
      padding: 0;
      margin-bottom: 0;
      background: transparent;
      border-radius: 0;
    }

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
      overflow: scroll;
      scrollbar-width: thin;
      background: var(--w3a-modal__action-content__background, #242628);
      border-radius: 12px;
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
      margin-bottom: var(--w3a-modal__action-subitem__margin-bottom, var(--w3a-gap-2));
      padding: 0rem 0rem 0rem var(--w3a-modal__action-subitem__padding, var(--w3a-gap-4));
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
      padding: var(--w3a-modal__code-block__padding, var(--w3a-gap-2));
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
      display: flex;
      gap: var(--w3a-gap-3);
      justify-content: flex-end;
      margin-top: var(--w3a-gap-3);
      position: relative;
      z-index: 1;
    }

    .error-banner {
      color: var(--w3a-modal__error-banner__color, #ef4444);
      font-size: var(--w3a-modal__error-banner__font-size, 0.9rem);
      text-align: var(--w3a-modal__error-banner__text-align, center);
      font-weight: 500;
    }

    .btn {
      background-color: var(--w3a-modal__btn__background-color);
      box-shadow: var(--w3a-modal__btn__box-shadow, none);
      color: var(--w3a-modal__btn__color);
      text-align: center;
      border-radius: var(--w3a-radius-lg);
      justify-content: center;
      align-items: center;
      height: var(--w3a-modal__btn__height, 2.5rem);
      padding: var(--w3a-gap-3);
      font-size: var(--w3a-font-size-base);
      display: flex;
      cursor: pointer;
      border: none;
      font-family: var(--w3a-font-family);
      font-weight: var(--w3a-modal__btn__font-weight, 500);
      transition: all 160ms cubic-bezier(0.2, 0.6, 0.2, 1);
      min-width: var(--w3a-modal__btn__min-width, 100px);
      position: relative;
      overflow: hidden;
    }

    .btn:hover {
      background-color: var(--w3a-modal__btn-hover__background-color);
      box-shadow: var(--w3a-modal__btn-hover__box-shadow, none);
    }

    .btn:active {
      background-color: var(--w3a-modal__btn-active__background-color);
      transform: var(--w3a-modal__btn__active-transform, translateY(1px));
    }

    .btn-cancel {
      box-shadow: none;
      color: var(--w3a-modal__btn-cancel__color);
      background-color: var(--w3a-modal__btn-cancel__background-color, transparent);
      border: none;
    }

    .btn-cancel:hover {
      color: var(--w3a-modal__btn-cancel-hover__color);
      background-color: var(--w3a-modal__btn-cancel-hover__background-color);
      border: var(--w3a-modal__btn-cancel-hover__border, none);
    }

    .btn-confirm {
      background-color: var(--w3a-modal__btn-confirm__background-color);
      color: var(--w3a-modal__btn-confirm__color);
      border: none;
    }

    .btn-confirm:hover {
      background-color: var(--w3a-modal__btn-confirm-hover__background-color);
      border: var(--w3a-modal__btn-confirm-hover__border, none);
    }

    .btn-danger {
      background-color: var(--w3a-modal__btn-danger__background-color, oklch(0.66 0.180 19)); /* red500 */
      color: var(--w3a-modal__btn-danger__color, #ffffff);
    }
    .btn-danger:hover {
      background-color: var(--w3a-modal__btn-danger-hover__background-color, oklch(0.74 0.166 19)); /* red400 */
    }

    .btn:focus-visible {
      outline: 2px solid var(--w3a-modal__btn__focus-outline-color);
      outline-offset: 3px;
      box-shadow: var(--w3a-modal__btn__focus-box-shadow, 0 0 0 3px oklch(0.55 0.18 240 / 0.12));
    }

    /* Responsive adjustments */
    @media (max-width: 640px) {
      .tx-list {
        min-width: var(--w3a-modal__mobile__tx-list__min-width, 320px);
        max-width: var(--w3a-modal__mobile__tx-list__max-width, 100vw - 2rem);
      }

      .summary-row {
        grid-template-columns: 1fr;
        gap: var(--w3a-modal__responsive-row__gap, 0.25rem);
        padding: var(--w3a-gap-3);
      }

      .summary-label {
        font-size: var(--w3a-font-size-sm);
        margin-bottom: var(--w3a-modal__responsive-label__margin-bottom, 2px);
      }

      .action-row {
        grid-template-columns: var(--w3a-modal__action-row__template-columns, 100px 1fr);
        gap: var(--w3a-modal__responsive-action-row__gap, 0.25rem);
        padding: var(--w3a-gap-2);
      }

      .buttons {
        flex-direction: column-reverse;
        gap: var(--w3a-gap-3);
      }

      .btn {
        width: 100%;
        padding: var(--w3a-gap-4) var(--w3a-gap-5);
      }

      .action-content {
        font-size: var(--w3a-font-size-sm);
        max-height: var(--w3a-modal__responsive-action-content__max-height, 100px);
      }
    }

    /* Tablet adjustments */
    @media (min-width: 641px) and (max-width: 1024px) {
      .tx-list {
        min-width: var(--w3a-modal__tablet__tx-list__min-width, 400px);
        max-width: var(--w3a-modal__tablet__tx-list__max-width, 500px);
      }
    }

    /* Large desktop adjustments */
    @media (min-width: 1025px) {
      .tx-list {
        min-width: var(--w3a-modal__desktop__tx-list__min-width, 420px);
        max-width: var(--w3a-modal__desktop__tx-list__max-width, 600px);
      }
    }

    /* Loading indicator styles */
    .loading-indicator {
      display: inline-block;
      width: var(--w3a-modal__loading-indicator__width, 16px);
      height: var(--w3a-modal__loading-indicator__height, 16px);
      border: 2px solid var(--w3a-modal__loading-indicator__border-color);
      border-radius: 50%;
      border-top-color: var(--w3a-modal__loading-indicator__border-top-color);
      animation: spin 1s ease-in-out infinite;
      margin-right: var(--w3a-gap-2);
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

  connectedCallback() {
    super.connectedCallback();
    this._isVisible = true;
    // Initialize styles based on theme
    this.updateTheme();
  }

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
    const host = (selectedTheme as any)?.host || {};
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
    super.disconnectedCallback();
  }

  private _renderActionDetails(action: ActionArgsWasm) {
    if (action.action_type === 'CreateAccount') {
      return html`
        <div class="action-row">
          <div class="action-label">Action</div>
          <div class="action-value">Create Account</div>
        </div>
      `;
    }
    if (action.action_type === 'DeployContract') {
      const code = action.code;
      const sizeLabel = (() => {
        if (!code) return '0 bytes';
        if (code instanceof Uint8Array) return `${code.byteLength} bytes`;
        if (Array.isArray(code)) return `${code.length} bytes`;
        return 'unknown';
      })();
      return html`
        <div class="action-row">
          <div class="action-label">Action</div>
          <div class="action-value">Deploy Contract</div>
        </div>
        <div class="action-row">
          <div class="action-label">Code Size</div>
          <div class="action-value">${sizeLabel}</div>
        </div>
      `;
    }
    if (action.action_type === 'FunctionCall') {
      return html`
        ${when(action.deposit && action.deposit !== '0', () => {
          return html`
            <div class="action-row">
              <div class="action-label">Deposit</div>
              <div class="action-value">${formatDeposit(action.deposit)}</div>
            </div>
          `
        })}
        ${when(action.args, () => {
          return html`
            <div class="action-label">Calling <span class="method-name">${action.method_name}</span> using <span class="method-name">${
formatGas(action.gas)}</span>
            </div>
            <pre class="code-block"><code>${formatArgs(action.args)}</code></pre>
          `;
        })}
      `;
    }
    if (action.action_type === 'Transfer') {
      return html`
        <div class="action-row">
          <div class="action-label">Action</div>
          <div class="action-value">Transfer</div>
        </div>
        <div class="action-row">
          <div class="action-label">Amount</div>
          <div class="action-value">${formatDeposit(action.deposit)}</div>
        </div>
      `;
    }
    if (action.action_type === 'Stake') {
      return html`
        <div class="action-row">
          <div class="action-label">Action</div>
          <div class="action-value">Stake</div>
        </div>
        <div class="action-row">
          <div class="action-label">Public Key</div>
          <div class="action-value">${action.public_key || ''}</div>
        </div>
        <div class="action-row">
          <div class="action-label">Amount</div>
          <div class="action-value">${formatDeposit(action.stake || '')}</div>
        </div>
      `;
    }
    if (action.action_type === 'AddKey') {
      const accessKey = JSON.parse(action.access_key);
      const permissions = 'FullAccess' in Object.keys(accessKey.permission)
        ? 'Full Access'
        : 'Function Call';
      return html`
        <div class="action-row">
          <div class="action-label">Action</div>
          <div class="action-value">Add Key</div>
        </div>
        <div class="action-row">
          <div class="action-label">Public Key</div>
          <div class="action-value">${action.public_key || ''}</div>
        </div>
        <div class="action-row">
          <div class="action-label">Access Key</div>
          <div class="action-value">${permissions}</div>
        </div>
      `;
    }
    if (action.action_type === 'DeleteKey') {
      return html`
        <div class="action-row">
          <div class="action-label">Action</div>
          <div class="action-value">Delete Key</div>
        </div>
        <div class="action-row">
          <div class="action-label">Public Key</div>
          <div class="action-value">${action.public_key || ''}</div>
        </div>
      `;
    }
    if (action.action_type === 'DeleteAccount') {
      return html`
        <div class="action-row">
          <div class="action-label">Action</div>
          <div class="action-value">Delete Account</div>
        </div>
        <div class="action-row">
          <div class="action-label">Beneficiary</div>
          <div class="action-value">${action.beneficiary_id || ''}</div>
        </div>
      `;
    }
    // Fallback: show raw JSON for unknown/extended actions
    let raw = '';
    try {
      raw = JSON.stringify(action, null, 2);
    } catch {
      raw = String(action);
    }
    return html`
      <div class="action-row">
        <div class="action-label">Action</div>
        <div class="action-value">Unknown</div>
      </div>
      <div class="action-row">
        <div class="action-label">Data</div>
        <div class="action-value"><pre class="code-block"><code>${raw}</code></pre></div>
      </div>
    `;
  }

  render() {

    const displayTotalAmount = !(this.totalAmount === '0' || this.totalAmount === '');

    return html`
      <!-- Separate backdrop layer for independent animation -->
      <div class="modal-backdrop-blur" @click=${this._handleBackdropClick}></div>
      <!-- Modal content layer -->
      <div class="modal-backdrop" @click=${this._handleContentClick}>
        <div class="modal-container-root">

          ${this.vrfChallenge?.rpId ? html`
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
                  <span class="domain-text">${this.vrfChallenge.rpId}</span>
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
                  block ${this.vrfChallenge.blockHeight}
                </span>
              </div>
            </div>
          ` : ''}

          <div class="tx-section">
            <div class="tx-list">

              <div class="hero">
                <w3a-passkey-halo-loading
                  .theme=${this.theme}
                  .animated=${!this.errorMessage ? true : false}
                  .ringGap=${4}
                  .ringWidth=${4}
                  .ringBorderRadius=${'1.5rem'}
                  .ringBackground=${'var(--w3a-modal__passkey-halo-loading__ring-background)'}
                  .innerPadding=${'var(--w3a-modal__passkey-halo-loading__inner-padding, 6px)'}
                  .innerBackground=${'var(--w3a-modal__passkey-halo-loading__inner-background)'}
                  .height=${60}
                  .width=${60}
                ></w3a-passkey-halo-loading>
                <div class="hero-container">
                  <h2 class="hero-heading">Check your transaction details</h2>
                  ${!this.errorMessage
                    ? html`<div class="hero-subheading">Then sign with your Passkey</div>`
                    : html`<div class="error-banner">${this.errorMessage}</div>`
                  }
                </div>
              </div>

              <!-- Transaction Summary Section -->
              ${when(displayTotalAmount, () => html`
                <div class="summary-section">
                  <div class="summary-grid">
                    <div class="summary-row">
                      <div class="summary-label">Total Sent</div>
                      <div class="summary-value">${formatDeposit(this.totalAmount)}</div>
                    </div>
                  </div>
                </div>
              `)}

              <!-- TxSigningRequests Section -->
              ${when(this.txSigningRequests.length > 0, () => html`
                ${this.txSigningRequests.map((tx, txIndex) => {
                  // Parse actions from the transaction payload (supports string or already-parsed array)
                  let actions: ActionArgsWasm[] = tx.actions;

                  // Determine if we need minimum height based on transaction/action count
                  const totalTransactions = this.txSigningRequests.length;
                  const totalActions = this.txSigningRequests.reduce((sum, tx) => sum + tx.actions.length, 0);
                  const needsMinHeight = totalTransactions > 2 || (totalTransactions === 1 && actions.length > 2);

                  return html`
                    <div class="action-item">
                      <div class="action-content ${needsMinHeight ? 'action-content-min-height' : ''}">
                        <!-- Transaction Receiver (only show for first action) -->
                        ${actions.length > 0 ? html`
                          <div class="action-subheader">
                            <div class="action-label">Transaction(${txIndex + 1}) to <span class="method-name">${tx.receiverId}</span></div>
                          </div>
                        ` : ''}
                        <!-- Actions for this transaction -->
                        ${actions.map((action, actionIndex) => html`
                          <div class="action-subitem">
                            ${this._renderActionDetails(action)}
                          </div>
                        `)}
                      </div>
                    </div>
                  `;
                })}
              `)}

              <div class="buttons">
                ${this.loading ? html`
                  <!-- Loading mode: show only cancel button with loading indicator -->
                  <button
                    class="btn btn-cancel loading"
                    @click=${this._handleCancel}
                  >
                    <span class="loading-indicator"></span>
                    Signing
                  </button>
                ` : this.errorMessage ? html`
                  <!-- Error mode: show only Close button in soft red -->
                  <button
                    class="btn btn-danger"
                    @click=${this._handleCancel}
                  >
                    Close
                  </button>
                ` : html`
                  <!-- Normal mode: show both cancel and confirm buttons -->
                  <button
                    class="btn btn-cancel"
                    @click=${this._handleCancel}
                  >
                    ${this.cancelText}
                  </button>
                  <button
                    class="btn btn-confirm"
                    @click=${this._handleConfirm}
                  >
                    ${this.confirmText}
                  </button>
                `}
              </div>

            </div>
          </div>
        </div>
      </div>
    `;
  }

  private _handleCancel() {
    try { this.dispatchEvent(new CustomEvent('w3a:cancel', { bubbles: true, composed: true })); } catch {}
    if (!this.deferClose) {
      this._resolveAndCleanup(false);
    }
  }

  private _handleConfirm() {
    try { this.dispatchEvent(new CustomEvent('w3a:confirm', { bubbles: true, composed: true })); } catch {}
    if (!this.deferClose) {
      this._resolveAndCleanup(true);
    }
  }

  private _handleBackdropClick() {
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
customElements.define('passkey-modal-confirm', ModalTxConfirmElement);
