import { html, css, type PropertyValues } from 'lit';
import { LitElementWithProps } from '../LitElementWithProps';

import type { TransactionInputWasm } from '../../../types';
import type { VRFChallenge } from '../../../types/vrf-worker';
import { fromTransactionInputsWasm } from '../../../types/actions';
import TxTree from '../TxTree';
import { buildDisplayTreeFromTxPayloads } from '../TxTree/tx-tree-utils';
import { TX_TREE_THEMES } from '../TxTree/tx-tree-themes';

/**
 * Shared confirmation content surface used by both Modal and Drawer containers.
 * - Renders summary, TxTree, and confirm/cancel actions
 * - Emits semantic events: `confirm` and `cancel` (containers bridge to w3a:* events)
 * - Does not own backdrop, focus traps, or ESC handling
 */
export class TxConfirmContentElement extends LitElementWithProps {
  // Fail fast in dev if nested custom elements are not defined
  static requiredChildTags = ['tx-tree'];
  static keepDefinitions = [TxTree];
  static properties = {
    nearAccountId: { type: String, attribute: 'near-account-id' },
    txSigningRequests: { type: Array },
    intentDigest: { type: String, attribute: 'intent-digest' },
    vrfChallenge: { type: Object },
    theme: { type: String },
    loading: { type: Boolean },
    errorMessage: { type: String },
    title: { type: String },
    confirmText: { type: String },
    cancelText: { type: String },
    // Treat internal tree node as reactive state so setting it re-renders immediately
    _treeNode: { attribute: false, state: true },
  } as const;

  declare nearAccountId: string;
  declare txSigningRequests: TransactionInputWasm[];
  declare intentDigest?: string;
  declare vrfChallenge?: VRFChallenge;
  declare theme: 'dark' | 'light';
  declare loading: boolean;
  declare errorMessage?: string;
  declare title: string;
  declare confirmText: string;
  declare cancelText: string;

  private _treeNode: any | null = null;
  // Keep essential custom elements from being tree-shaken
  private _ensureTreeDefinition = TxTree;
  // Consistent tree width across containers (match modal's breakpoints)
  private _txTreeWidth: string | number = '400px';
  private _onResize = () => this._updateTxTreeWidth();

  static styles = css`
    :host { display: block; color: inherit; touch-action: auto; }
    .section { margin: 8px 0; }
    .summary-row { display: grid; grid-template-columns: 110px 1fr; gap: 8px; align-items: center; margin: 6px 0; }
    .label { font-size: 12px; color: var(--w3a-colors-textMuted, rgba(255,255,255,0.7)); }
    .value { font-size: 13px; color: var(--w3a-colors-textPrimary, #f6f7f8); word-break: break-word; }
    :host([theme="light"]) .value { color: var(--w3a-colors-textPrimary, #181a1f); }
    .actions { display: grid; grid-auto-flow: column; gap: 10px; justify-content: end; margin-top: 12px; }
    button { font: inherit; border-radius: 14px; padding: 10px 14px; cursor: pointer; }
    .cancel { background: var(--w3a-colors-colorSurface, rgba(255,255,255,0.08)); color: var(--w3a-colors-textPrimary, #f6f7f8); border: 1px solid var(--w3a-colors-borderPrimary, rgba(255,255,255,0.14)); }
    .confirm { background: var(--w3a-colors-accent, #3b82f6); color: #fff; border: 1px solid transparent; }
    .error { color: var(--w3a-colors-error, #ff7a7a); font-size: 13px; margin: 8px 0; }
    .muted { color: var(--w3a-colors-textMuted, rgba(255,255,255,0.6)); font-size: 12px; }
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

  protected getComponentPrefix(): string { return 'tx-confirm-content'; }

  connectedCallback(): void {
    super.connectedCallback();
    // Prevent drawer drag initiation from content area
    try {
      this.addEventListener('pointerdown', this._stopDragStart as EventListener);
      this.addEventListener('mousedown', this._stopDragStart as EventListener);
      this.addEventListener('touchstart', this._stopDragStart as EventListener, { passive: false } as AddEventListenerOptions);
    } catch {}
  }

  disconnectedCallback(): void {
    try {
      this.removeEventListener('pointerdown', this._stopDragStart as EventListener);
      this.removeEventListener('mousedown', this._stopDragStart as EventListener);
      this.removeEventListener('touchstart', this._stopDragStart as EventListener);
    } catch {}
    try { window.removeEventListener('resize', this._onResize as unknown as EventListener); } catch {}
    super.disconnectedCallback();
  }

  firstUpdated(): void {
    // Build initial tree even if the first assignment happened before upgrade
    this._rebuildTree();
    this._updateTxTreeWidth();
    try { window.addEventListener('resize', this._onResize as unknown as EventListener, { passive: true } as AddEventListenerOptions); } catch {}
  }

  updated(changed: PropertyValues) {
    super.updated(changed);
    if (changed.has('txSigningRequests')) {
      this._rebuildTree();
    }
  }

  private _updateTxTreeWidth() {
    try {
      const w = window.innerWidth || 0;
      let next: string | number = '400px';
      if (w <= 640) next = '360px';
      else if (w <= 1024) next = '380px';
      else next = '400px';
      if (this._txTreeWidth !== next) {
        this._txTreeWidth = next;
        this.requestUpdate();
      }
    } catch {}
  }

  private _rebuildTree() {
    try {
      const inputs = Array.isArray(this.txSigningRequests) ? this.txSigningRequests : [];
      const uiTxs = fromTransactionInputsWasm(inputs);
      this._treeNode = buildDisplayTreeFromTxPayloads(uiTxs);
    } catch (e) {
      console.warn('[TxConfirmContent] failed to build TxTree', e);
      this._treeNode = null;
    }
    // Ensure view refreshes even if this runs in firstUpdated before Lit schedules next frame
    this.requestUpdate();
  }

  private _stopDragStart = (e: Event) => {
    e.stopPropagation();
  };

  private onConfirm = () => {
    if (this.loading) return;
    // Emit semantic event for containers to bridge to canonical events
    try { this.dispatchEvent(new CustomEvent('confirm', { bubbles: true, composed: true })); } catch {}
  };

  private onCancel = () => {
    if (this.loading) return;
    try { this.dispatchEvent(new CustomEvent('cancel', { bubbles: true, composed: true })); } catch {}
  };

  render() {
    return html`
      ${this.errorMessage ? html`<div class="error">${this.errorMessage}</div>` : null}
      ${this._treeNode
        ? html`<div style="width:${this._txTreeWidth}">
                <tx-tree .node=${this._treeNode}
                  .theme=${this.theme}
                  .styles=${TX_TREE_THEMES[this.theme]}
                ></tx-tree>
              </div>`
        : html`<div class="muted">No actions</div>`}
      <div class="actions">
        <button class="cancel" @click=${this.onCancel} ?disabled=${this.loading}>${this.cancelText}</button>
        <button class="confirm" @click=${this.onConfirm} ?disabled=${this.loading}>${this.confirmText}</button>
      </div>
    `;
  }
}

customElements.define('tx-confirm-content', TxConfirmContentElement);

export default TxConfirmContentElement;

