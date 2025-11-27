import { html, type PropertyValues } from 'lit';
import { LitElementWithProps } from '../LitElementWithProps';
import DrawerElement from '../Drawer';
import { W3A_DRAWER_ID } from '../tags';
import TxConfirmContentElement from './tx-confirm-content';
import PadlockIconElement from '../common/PadlockIcon';
import { ensureExternalStyles } from '../css/css-loader';
import { WalletIframeDomEvents } from '../../../WalletIframe/events';
import type { TransactionInputWasm, VRFChallenge } from '../../../types';
import type { ThemeName } from '../confirm-ui-types';
import type { ConfirmUIElement } from '../confirm-ui-types';

/**
 * DrawerTxConfirmer: Drawer variant of the transaction confirmer
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
    nearExplorerUrl: { type: String, attribute: 'near-explorer-url' },
  } as const;

  declare nearAccountId: string;
  declare txSigningRequests: TransactionInputWasm[];
  declare vrfChallenge?: VRFChallenge;
  // Theme tokens now come from external CSS (tx-confirmer.css)
  // style injection has been removed to satisfy strict CSP.
  declare theme: ThemeName;
  declare loading: boolean;
  declare errorMessage?: string;
  declare title: string;
  declare confirmText: string;
  declare cancelText: string;
  declare deferClose: boolean;
  declare nearExplorerUrl?: string;

  // Keep essential custom elements from being tree-shaken
  private _ensureDrawerDefinition = DrawerElement;
  private _drawerEl: any | null = null;
  private _open: boolean = false;

  private _onWindowMessage = (ev: MessageEvent) => {
    const data = (ev && ev.data) || {};
    if (!data || typeof (data as any).type !== 'string') return;
    if ((data as any).type === 'MODAL_TIMEOUT') {
      const msg = typeof (data as any).payload === 'string' && (data as any).payload
        ? (data as any).payload
        : 'Operation timed out';
      this.loading = false;
      this.errorMessage = msg;
      // Best-effort close and emit cancel so host resolves and cleans up
      this._drawerEl?.handleClose?.();
      this.dispatchEvent(new CustomEvent(WalletIframeDomEvents.TX_CONFIRMER_CANCEL, {
        bubbles: true,
        composed: true,
        detail: { confirmed: false }
      }));
    }
  };

  private _onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' || e.key === 'Esc') {
      if (this.loading) return;
      e.preventDefault();
      this._drawerEl?.handleClose();
      if (!this._drawerEl) {
        this.dispatchEvent(new CustomEvent(WalletIframeDomEvents.TX_CONFIRMER_CANCEL, {
          bubbles: true,
          composed: true,
          detail: { confirmed: false }
        }));
      }
      // Rely on drawer's `cancel` event -> onDrawerCancel to emit w3a:modal-cancel
    }
  };

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

  protected createRenderRoot(): HTMLElement | DocumentFragment {
    // Light DOM root so tokens cascade without Shadow DOM boundaries
    const root = (this as unknown) as HTMLElement;
    // Preload tokens + styles on host
    ensureExternalStyles(root, 'w3a-components.css', 'data-w3a-components-css').catch(() => {});
    ensureExternalStyles(root, 'tx-tree.css', 'data-w3a-tx-tree-css').catch(() => {});
    ensureExternalStyles(root, 'tx-confirmer.css', 'data-w3a-tx-confirmer-css').catch(() => {});
    return root;
  }

  connectedCallback(): void {
    super.connectedCallback();
    // Ensure root token theme is applied immediately on mount
    try {
      const docEl = this.ownerDocument?.documentElement as HTMLElement | undefined;
      if (docEl && this.theme) {
        const current = docEl.getAttribute('data-w3a-theme');
        if (!current || current === 'dark' || current === 'light') {
          docEl.setAttribute('data-w3a-theme', this.theme);
          (this as any)._ownsThemeAttr = true;
        }
      }
    } catch {}
    // Also ensure tokens CSS on document root for host-scoped variables
    try {
      const docEl = this.ownerDocument?.documentElement as HTMLElement | undefined;
      if (docEl) ensureExternalStyles(docEl, 'w3a-components.css', 'data-w3a-components-css').catch(() => {});
    } catch {}
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('message', this._onWindowMessage as EventListener);
    // Ensure immediate keyboard handling (e.g., ESC) by focusing host/iframe
    const hostEl = this as unknown as HTMLElement;
    if (hostEl.tabIndex === undefined || hostEl.tabIndex === null) {
      (hostEl as any).tabIndex = -1;
    }
    hostEl.focus({ preventScroll: true } as FocusOptions);
    if (typeof window.focus === 'function') { window.focus(); }
  }

  async firstUpdated(): Promise<void> {
    this._drawerEl = (this as unknown as HTMLElement).querySelector(W3A_DRAWER_ID) as any;
    // Ensure external styles are ready before opening (await Promise-based loader)
    const root = (this.renderRoot as unknown) as ShadowRoot | DocumentFragment | HTMLElement;
    await Promise.all([
      ensureExternalStyles(root, 'w3a-components.css', 'data-w3a-components-css'),
      ensureExternalStyles(root, 'tx-tree.css', 'data-w3a-tx-tree-css'),
      ensureExternalStyles(root, 'tx-confirmer.css', 'data-w3a-tx-confirmer-css'),
      // Preload drawer.css so fallback <link> is loaded before opening
      ensureExternalStyles(root, 'drawer.css', 'data-w3a-drawer-css'),
    ]);
    // Open after mount with double-rAF to let layout/styles settle
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    this._open = true;
    this.requestUpdate();
  }

  disconnectedCallback(): void {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('message', this._onWindowMessage as EventListener);
    super.disconnectedCallback();
  }

  updated(changed: PropertyValues) {
    super.updated(changed);
    // Keep the iframe/root document's theme in sync so :root[data-w3a-theme] tokens apply
    if (changed.has('theme')) {
      const docEl = this.ownerDocument?.documentElement as HTMLElement | undefined;
      if (docEl && this.theme && (this as any)._ownsThemeAttr) {
        docEl.setAttribute('data-w3a-theme', this.theme);
      }
    }
  }

  private onDrawerCancel = () => {
    if (this.loading) return;
    // Close drawer locally to ensure animation
    this._open = false;
    this.requestUpdate();
    this.dispatchEvent(new CustomEvent(WalletIframeDomEvents.TX_CONFIRMER_CANCEL, {
      bubbles: true,
      composed: true,
      detail: { confirmed: false }
    }));
  };

  private onContentConfirm = () => {
    if (this.loading) return;
    this.loading = true;
    this.requestUpdate();
    // Bridge semantic event to canonical event
    this.dispatchEvent(new CustomEvent(WalletIframeDomEvents.TX_CONFIRMER_CONFIRM, {
      bubbles: true,
      composed: true,
      detail: { confirmed: true }
    }));
  };

  private onContentCancel = () => {
    if (this.loading) return;
    this._drawerEl?.handleClose();
    this._open = false; this.requestUpdate();
    this.dispatchEvent(new CustomEvent(WalletIframeDomEvents.TX_CONFIRMER_CANCEL, {
      bubbles: true,
      composed: true,
      detail: { confirmed: false }
    }));
  };

  // Public method for two‑phase close from host/bootstrap
  close(_confirmed: boolean) {
    this.remove();
  }

  render() {
    return html`
      <w3a-drawer
        .open=${this._open}
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
          <div class="section responsive-card responsive-card-center">
            <w3a-tx-confirm-content
              .nearAccountId=${this.nearAccountId || ''}
              .txSigningRequests=${this.txSigningRequests || []}
              .vrfChallenge=${this.vrfChallenge}
              theme=${this.theme}
              .nearExplorerUrl=${this.nearExplorerUrl}
              .showShadow=${false}
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
