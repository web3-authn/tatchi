import { html, css, type PropertyValues } from 'lit';
import { LitElementWithProps } from '../LitElementWithProps';
import DrawerElement from '../Drawer';
import { W3A_DRAWER_ID } from '../tags';
import TxConfirmContentElement from './tx-confirm-content';
import PadlockIconElement from '../common/PadlockIcon';
import { WalletIframeDomEvents } from '../../../WalletIframe/events';
import type { TransactionInputWasm, VRFChallenge } from '../../../types';
import type { ThemeName } from '../confirm-ui-types';
import type { ConfirmUIElement } from '../confirm-ui-types';
// Theme tokens now come from external CSS (modal-confirmer.css)
// Fallback color set explicitly to palette's blue500 without unsafeCSS

/**
 * DrawerTxConfirmer: Drawer variant of the transaction confirmer
 * Emits WalletIframeDomEvents.MODAL_CONFIRM and WalletIframeDomEvents.MODAL_CANCEL for compatibility with iframe host bootstrap.
 */
export class DrawerTxConfirmerElement extends LitElementWithProps implements ConfirmUIElement {
  static requiredChildTags = ['w3a-tx-confirm-content', 'w3a-drawer'];
  static strictChildDefinitions = true;
  // Prevent bundlers from dropping nested custom element definitions used via templates
  static keepDefinitions = [TxConfirmContentElement, PadlockIconElement];
  static properties = {
    nearAccountId: { type: String, attribute: 'near-account-id' },
    txSigningRequests: { type: Array },
    vrfChallenge: { type: Object },
    theme: { type: String, reflect: true },
    loading: { type: Boolean },
    errorMessage: { type: String },
    title: { type: String },
    confirmText: { type: String },
    cancelText: { type: String },
    // Two‑phase close: when true, host controls removal
    deferClose: { type: Boolean, attribute: 'defer-close' },
  } as const;

  declare nearAccountId: string;
  declare txSigningRequests: TransactionInputWasm[];
  declare vrfChallenge?: VRFChallenge;
  declare theme: ThemeName;
  // styles?: Record<string, unknown>; // removed: external CSS drives tokens
  declare loading: boolean;
  declare errorMessage?: string;
  declare title: string;
  declare confirmText: string;
  declare cancelText: string;
  declare deferClose: boolean;

  // Keep essential custom elements from being tree-shaken
  private _ensureDrawerDefinition = DrawerElement;
  private _drawerEl: any | null = null;
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
        // Best-effort close and emit cancel so host resolves and cleans up
        try { this._drawerEl?.handleClose?.(); } catch {}
        try {
          this.dispatchEvent(new CustomEvent(WalletIframeDomEvents.TX_CONFIRMER_CANCEL, {
            bubbles: true,
            composed: true,
            detail: { confirmed: false }
          }));
        } catch {}
      }
    } catch {}
  };
  private _onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' || e.key === 'Esc') {
      if (this.loading) return;
      e.preventDefault();
      try { this._drawerEl?.handleClose(); } catch {}
      if (!this._drawerEl) {
        try {
          this.dispatchEvent(new CustomEvent(WalletIframeDomEvents.TX_CONFIRMER_CANCEL, {
            bubbles: true,
            composed: true,
            detail: { confirmed: false }
          }));
        } catch {}
      }
      // Rely on drawer's `cancel` event -> onDrawerCancel to emit w3a:modal-cancel
    }
  };

  static styles = css`
    :host { display: contents; }
    /* Narrower sheet for tx confirmer drawer */
    w3a-drawer {
      /* Scale with viewport and base font size for better zoom behavior */
      --w3a-drawer__max-width: min(100vw, 28rem);
    }
    .drawer-tx-confirmer-root {
      display: grid;
      place-content: center;
    }
    .drawer-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      row-gap: 0.5em;
      margin-top: 0.5rem;
      margin-bottom: 0.5rem;
    }
    .drawer-title {
      margin: 0;
      font-size: var(--w3a-font-size-lg, 1.125rem);
      line-height: 1.3;
      font-weight: 700;
    }
    .drawer-actions { display: flex; gap: 8px; }
    .drawer-btn {
      border: 1px solid var(--w3a-colors-borderPrimary, rgba(255,255,255,0.12));
      background: var(--w3a-colors-surface, rgba(255,255,255,0.06));
      color: var(--w3a-colors-textPrimary, #f6f7f8);
      border-radius: 10px;
      padding: 0.6em 0.9em;
      font-weight: 600;
      cursor: pointer;
    }
    .drawer-btn.primary {
      background: var(--w3a-btn-primary, #4DAFFE);
      color: var(--w3a-btn-text, #0b1220);
      border-color: transparent;
    }
    .footer-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 12px;
    }
    .section {
      margin: 8px 0;
      max-width: clamp(20rem, 90vw, 26rem);
      min-width: 0;
    }
    .responsive-card {
      position: relative;
      /* Scales with viewport and root font size under text zoom */
      max-width: clamp(20rem, 90vw, 26rem);
      min-width: 0;
      overflow: visible;
      border-radius: 1rem;
      z-index: 1;
      padding: var(--w3a-modal__responsive-card__padding, 0rem);
      margin: var(--w3a-modal__responsive-card__margin, 0px);
    }
    .margin-left1 {
      margin-left: 1rem;
    }

    .rpid-wrapper {
      margin-bottom: 1rem;
    }
    .rpid {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-top: 2px;
      font-size: 0.7rem;
      overflow-wrap: anywhere;
      hyphens: auto;
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
      color: var(--w3a-modal__padlock-icon__color, oklch(0.66 0.180 255));
    }

    .security-details {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .block-height-icon {
      width: 1em;
      height: 1em;
      margin-inline-end: 0.5em;
      flex: none;
      color: var(--w3a-modal__block-height-icon__color, oklch(0.66 0.180 255));
    }
    .divider {
      width: 1px; height: 12px;
      background: var(--w3a-colors-borderPrimary, rgba(255,255,255,0.18));
      margin: 0 4px;
    }
  `;

  constructor() {
    super();
    this.nearAccountId = '';
    this.txSigningRequests = [];
    this.theme = 'dark';
    this.loading = false;
    this.title = 'Confirm with Passkey';
    this.confirmText = 'Next';
    this.cancelText = 'Cancel';
    this.deferClose = false;
  }

  protected getComponentPrefix(): string { return 'drawer-tx'; }

  // Dynamic style application removed; tokens are provided by modal-confirmer.css

  connectedCallback(): void {
    super.connectedCallback();
    try { window.addEventListener('keydown', this._onKeyDown); } catch {}
    try { window.addEventListener('message', this._onWindowMessage as EventListener); } catch {}
    // Ensure immediate keyboard handling (e.g., ESC) by focusing host/iframe
    try {
      const hostEl = this as unknown as HTMLElement;
      if (hostEl.tabIndex === undefined || hostEl.tabIndex === null) {
        (hostEl as any).tabIndex = -1;
      }
      hostEl.focus({ preventScroll: true } as FocusOptions);
      if (typeof window.focus === 'function') { window.focus(); }
    } catch {}
    // Initialize theme styles
    this.updateTheme();
  }

  firstUpdated(): void {
    this._drawerEl = this.shadowRoot?.querySelector(W3A_DRAWER_ID) as any;
  }

  disconnectedCallback(): void {
    try { window.removeEventListener('keydown', this._onKeyDown); } catch {}
    try { window.removeEventListener('message', this._onWindowMessage as EventListener); } catch {}
    super.disconnectedCallback();
  }

  updated(changed: PropertyValues) {
    super.updated(changed);
    if (changed.has('theme')) {
      this.updateTheme();
    }
  }

  private updateTheme() {
    // External CSS (modal-confirmer.css) handles theme tokens; nothing to apply here.
  }

  private onDrawerCancel = () => {
    if (this.loading) return;
    try {
      this.dispatchEvent(new CustomEvent(WalletIframeDomEvents.TX_CONFIRMER_CANCEL, {
        bubbles: true,
        composed: true,
        detail: { confirmed: false }
      }));
    } catch {}
  };

  private onContentConfirm = () => {
    if (this.loading) return;
    this.loading = true;
    this.requestUpdate();
    // Bridge semantic event to canonical event
    try {
      this.dispatchEvent(new CustomEvent(WalletIframeDomEvents.TX_CONFIRMER_CONFIRM, {
        bubbles: true,
        composed: true,
        detail: { confirmed: true }
      }));
    } catch {}
  };

  private onContentCancel = () => {
    if (this.loading) return;
    try { this._drawerEl?.handleClose(); } catch {}
    try {
      this.dispatchEvent(new CustomEvent(WalletIframeDomEvents.TX_CONFIRMER_CANCEL, {
        bubbles: true,
        composed: true,
        detail: { confirmed: false }
      }));
    } catch {}
  };

  // Public method for two‑phase close from host/bootstrap
  close(_confirmed: boolean) {
    try { this.remove(); } catch {}
  }

  render() {
    return html`
      <w3a-drawer
        .open=${true}
        theme=${this.theme}
        .loading=${this.loading}
        .errorMessage=${this.errorMessage || ''}
        .height=${'auto'}
        .overpullPx=${160}
        .dragToClose=${true}
        .showCloseButton=${true}
        @lit-cancel=${this.onDrawerCancel}
      >
        <div class="drawer-tx-confirmer-root">
          <div class="section responsive-card margin-left1">
            <div class="drawer-header">
              <h2 class="drawer-title">${this.title}</h2>
            </div>
          </div>

          <div class="section responsive-card margin-left1">
            <div class="rpid-wrapper">
              <div class="rpid">
                <div class="secure-indicator">
                      <w3a-padlock-icon class="padlock-icon"></w3a-padlock-icon>
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
          <div class="section responsive-card">
            <w3a-tx-confirm-content
              .nearAccountId=${this.nearAccountId || ''}
              .txSigningRequests=${this.txSigningRequests || []}
              .vrfChallenge=${this.vrfChallenge}
              theme=${this.theme}
              .loading=${this.loading}
              .errorMessage=${this.errorMessage || ''}
              .title=${this.title}
              .confirmText=${this.confirmText}
              .cancelText=${this.cancelText}
              @lit-confirm=${this.onContentConfirm}
              @lit-cancel=${this.onContentCancel}
            ></w3a-tx-confirm-content>
          </div>

        </div>
      </w3a-drawer>
    `;
  }
}

import { W3A_DRAWER_TX_CONFIRMER_ID } from '../tags';

// Define canonical tag
if (!customElements.get(W3A_DRAWER_TX_CONFIRMER_ID)) {
  customElements.define(W3A_DRAWER_TX_CONFIRMER_ID, DrawerTxConfirmerElement);
}

export default DrawerTxConfirmerElement;
