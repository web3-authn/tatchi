import { html, type PropertyValues } from 'lit';
import { LitElementWithProps } from '../LitElementWithProps';

import { TransactionInputWasm } from '../../../types';
import type { VRFChallenge } from '../../../types/vrf-worker';

import TxTree from '../TxTree';
import { ensureExternalStyles } from '../css/css-loader';
import TxConfirmContentElement from './tx-confirm-content';
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
 * Built with Lit with strict CSP for XSS protection and reactive updates.
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
    theme: { type: String, attribute: 'theme', reflect: true },
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
  // Theme tokens now come from external CSS (modal-confirmer.css)
  // style injection has been removed to satisfy strict CSP.
  theme: ThemeName = 'dark';
  declare nearAccountId: string;
  // When true, this element will NOT remove itself on confirm/cancel.
  // The host is responsible for sending a CLOSE_MODAL instruction.
  deferClose = false;
  // Styles gating to avoid first-paint FOUC
  private _stylesReady = false;
  private _stylePromises: Promise<void>[] = [];
  private _stylesAwaiting: Promise<void> | null = null;

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
    const data = (ev && ev.data) || {};
    if (!data || typeof (data as any).type !== 'string') return;
    if ((data as any).type === 'MODAL_TIMEOUT') {
      const msg = typeof (data as any).payload === 'string' && (data as any).payload
        ? (data as any).payload
        : 'Operation timed out';
      this.loading = false;
      this.errorMessage = msg;
      // Emit cancel so the host resolves and removes this element via two‑phase close
      this._handleCancel();
    }
  };
  // Guard to prevent immediate backdrop-cancel due to the click that mounted the modal
  private _backdropArmed = false;

  // Render in light DOM to simplify CSS variable flow across nested components
  // (Shadow DOM disabled by returning the host element as the render root)

  // No inline static styles; see modal-confirmer.css
  constructor() {
    super();
    // Pre-ensure document-level styles so link loads can complete before first render
    const root = (document?.documentElement || null) as unknown as HTMLElement | null;
    if (root) {
      this._stylePromises.push(
        ensureExternalStyles(root, 'w3a-components.css', 'data-w3a-components-css'),
        ensureExternalStyles(root, 'tx-tree.css', 'data-w3a-tx-tree-css'),
        ensureExternalStyles(root, 'modal-confirmer.css', 'data-w3a-modal-confirmer-css'),
        // Preload nested visuals to avoid first-paint jank when halo/loader mount
        ensureExternalStyles(root, 'halo-border.css', 'data-w3a-halo-border-css'),
        ensureExternalStyles(root, 'passkey-halo-loading.css', 'data-w3a-passkey-halo-loading-css'),
      );
    }
  }

  private _ownsThemeAttr = false;

  updated(changedProperties: PropertyValues) {
    super.updated(changedProperties);
    // Keep the iframe/root document's theme in sync so :root[data-w3a-theme] tokens apply
    if (changedProperties.has('theme')) {
      try {
        const docEl = this.ownerDocument?.documentElement as HTMLElement | undefined;
        if (docEl && this.theme && this._ownsThemeAttr) {
          docEl.setAttribute('data-w3a-theme', this.theme);
        }
      } catch {}
    }
  }

  protected getComponentPrefix(): string {
    return 'modal';
  }

  protected createRenderRoot(): HTMLElement | DocumentFragment {
    const root = (this as unknown) as HTMLElement;
    // tx-tree.css for nested TxTree visuals inside the modal
    this._stylePromises.push(ensureExternalStyles(root, 'tx-tree.css', 'data-w3a-tx-tree-css'));
    // modal-confirmer.css for modal layout + tokens
    this._stylePromises.push(ensureExternalStyles(root, 'modal-confirmer.css', 'data-w3a-modal-confirmer-css'));
    // Ensure nested loader/halo styles are present before first paint to avoid FOUC
    this._stylePromises.push(ensureExternalStyles(root, 'halo-border.css', 'data-w3a-halo-border-css'));
    this._stylePromises.push(ensureExternalStyles(root, 'passkey-halo-loading.css', 'data-w3a-passkey-halo-loading-css'));
    return root;
  }

  // Dynamic style application removed; CSS variables come from modal-confirmer.css

  disconnectedCallback() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('message', this._onWindowMessage as EventListener);
    super.disconnectedCallback();
  }

  connectedCallback(): void {
    super.connectedCallback();
    // Ensure root token theme is applied immediately on mount
    try {
      const docEl = this.ownerDocument?.documentElement as HTMLElement | undefined;
      if (docEl && this.theme) {
        const current = docEl.getAttribute('data-w3a-theme');
        // If missing or already using built-in values, take ownership and set
        if (!current || current === 'dark' || current === 'light') {
          docEl.setAttribute('data-w3a-theme', this.theme);
          this._ownsThemeAttr = true;
        }
      }
    } catch {}
    // Arm backdrop after the current event loop to avoid capturing the mounting click
    setTimeout(() => { this._backdropArmed = true; }, 0);
    // Listen globally so Escape works regardless of focus target
    window.addEventListener('keydown', this._onKeyDown);
    // Listen for global timeout notification (posted by SignerWorkerManager on operation timeout)
    window.addEventListener('message', this._onWindowMessage as EventListener);
    // Ensure this iframe/host receives keyboard focus so ESC works immediately
    // Make host focusable and focus it without scrolling
    const hostEl = this as unknown as HTMLElement;
    hostEl.tabIndex = hostEl.tabIndex ?? -1;
    hostEl.focus({ preventScroll: true } as FocusOptions);
    // Also attempt to focus the frame window in case we're inside an iframe
    if (typeof window.focus === 'function') {
      window.focus();
    }
  }

  protected shouldUpdate(_changed: PropertyValues): boolean {
    if (this._stylesReady) return true;
    if (!this._stylesAwaiting) {
      const p = Promise.all(this._stylePromises).then(
        () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))
      );
      this._stylesAwaiting = p.then(() => { this._stylesReady = true; this.requestUpdate(); });
    }
    return false;
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
                  .ringGap=${4}
                  .ringWidth=${4}
                  .ringBorderRadius=${'1.125rem'}
                  .ringBackground=${'var(--w3a-modal__passkey-halo-loading__ring-background)'}
                  .innerPadding=${'0px'}
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
                          <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A 2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/>
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
    // Canonical event (include a consistent detail payload)
    this.dispatchEvent(new CustomEvent(WalletIframeDomEvents.TX_CONFIRMER_CANCEL, {
      bubbles: true,
      composed: true,
      detail: { confirmed: false }
    }));
    if (!this.deferClose) {
      this._resolveAndCleanup(false);
    }
  }

  private _handleConfirm() {
    if (this.loading) return;
    this.loading = true;
    this.requestUpdate();
    // Canonical event (include a consistent detail payload)
    this.dispatchEvent(new CustomEvent(WalletIframeDomEvents.TX_CONFIRMER_CONFIRM, {
      bubbles: true,
      composed: true,
      detail: { confirmed: true }
    }));
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
