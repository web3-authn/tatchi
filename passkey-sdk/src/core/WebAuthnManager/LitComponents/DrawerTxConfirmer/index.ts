import { html, css, type PropertyValues } from 'lit';
import { LitElementWithProps } from '../LitElementWithProps';
import '../Drawer';
import TxTree from '../TxTree';
import { buildDisplayTreeFromTxPayloads } from '../TxTree/tx-tree-utils';
import type { TransactionInputWasm, VRFChallenge } from '../../../types';
import { fromTransactionInputsWasm } from '../../../types/actions';

/**
 * DrawerTxConfirmer: Drawer variant of the transaction confirmer
 * Emits 'w3a:modal-confirm' and 'w3a:modal-cancel' for compatibility with iframe host bootstrap.
 */
export class DrawerTxConfirmerElement extends LitElementWithProps {
  static properties = {
    nearAccountId: { type: String, attribute: 'near-account-id' },
    txSigningRequests: { type: Array },
    vrfChallenge: { type: Object },
    theme: { type: String },
    loading: { type: Boolean },
    errorMessage: { type: String },
    title: { type: String },
    confirmText: { type: String },
    cancelText: { type: String },
  } as const;

  declare nearAccountId: string;
  declare txSigningRequests: TransactionInputWasm[];
  declare vrfChallenge?: VRFChallenge;
  declare theme: 'dark' | 'light';
  declare loading: boolean;
  declare errorMessage?: string;
  declare title: string;
  declare confirmText: string;
  declare cancelText: string;

  private _treeNode: any | null = null;

  static styles = css`
    :host { display: contents; }
    .summary-row { display: grid; grid-template-columns: 110px 1fr; gap: 8px; align-items: center; margin: 6px 0; }
    .label { font-size: 12px; color: var(--w3a-colors-textMuted, rgba(255,255,255,0.7)); }
    .value { font-size: 13px; color: var(--w3a-colors-textPrimary, #f6f7f8); word-break: break-word; }
    .section { margin: 8px 0; }
  `;

  constructor() {
    super();
    this.nearAccountId = '';
    this.txSigningRequests = [];
    this.theme = 'dark';
    this.loading = false;
    this.title = 'Review Transaction';
    this.confirmText = 'Confirm';
    this.cancelText = 'Cancel';
  }

  protected getComponentPrefix(): string { return 'drawer-tx'; }

  updated(changed: PropertyValues) {
    super.updated(changed);
    if (changed.has('txSigningRequests')) {
      try {
        const inputs = Array.isArray(this.txSigningRequests) ? this.txSigningRequests : [];
        const uiTxs = fromTransactionInputsWasm(inputs);
        this._treeNode = buildDisplayTreeFromTxPayloads(uiTxs);
      } catch (e) {
        console.warn('[DrawerTxConfirmer] failed to build tree', e);
        this._treeNode = null;
      }
    }
  }

  private onDrawerConfirm = () => {
    if (this.loading) return;
    // Keep drawer open; host (iframe bootstrap) will close programmatically
    try {
      this.dispatchEvent(new CustomEvent('w3a:modal-confirm', { bubbles: true, composed: true }));
    } catch {}
  };

  private onDrawerCancel = () => {
    if (this.loading) return;
    try {
      this.dispatchEvent(new CustomEvent('w3a:modal-cancel', { bubbles: true, composed: true }));
    } catch {}
  };

  render() {
    return html`
      <w3a-drawer
        .open=${true}
        .theme=${this.theme}
        .title=${this.title}
        .accountId=${this.nearAccountId || ''}
        .loading=${this.loading}
        .errorMessage=${this.errorMessage || ''}
        .confirmText=${this.confirmText}
        .cancelText=${this.cancelText}
        @confirm=${this.onDrawerConfirm}
        @cancel=${this.onDrawerCancel}
      >
        <div class="section">
          <div class="summary-row"><div class="label">Account</div><div class="value">${this.nearAccountId || ''}</div></div>
        </div>
        ${this._treeNode ? html`<tx-tree .node=${this._treeNode} .theme=${this.theme}></tx-tree>` : null}
      </w3a-drawer>
    `;
  }
}

customElements.define('w3a-drawer-tx-confirm', DrawerTxConfirmerElement);

export default DrawerTxConfirmerElement;
