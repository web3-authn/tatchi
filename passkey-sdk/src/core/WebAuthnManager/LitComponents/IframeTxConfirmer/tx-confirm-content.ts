import { html, css, type PropertyValues } from 'lit';
import { LitElementWithProps } from '../LitElementWithProps';
import { dispatchLitCancel, dispatchLitConfirm } from '../lit-events';

import type { TransactionInputWasm } from '../../../types';
import type { VRFChallenge } from '../../../types/vrf-worker';
import { fromTransactionInputsWasm } from '../../../types/actions';
import TxTree from '../TxTree';
import { buildDisplayTreeFromTxPayloads } from '../TxTree/tx-tree-utils';
import { TX_TREE_THEMES } from '../TxTree/tx-tree-themes';
import { W3A_TX_TREE_ID } from '../tags';

/**
 * Shared confirmation content surface used by both Modal and Drawer containers.
 * - Renders summary, TxTree, and confirm/cancel actions
 * - Emits semantic events: `lit-confirm` and `lit-cancel` (containers bridge to w3a:* events)
 * - Does not own backdrop, focus traps, or ESC handling
 */
export class TxConfirmContentElement extends LitElementWithProps {
  // Fail fast in dev if nested custom elements are not defined
  static requiredChildTags = [W3A_TX_TREE_ID, 'tx-tree'];
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
    :host {
      display: block;
      color: inherit;
      touch-action: auto;
      width: fit-content;
    }
    .section { margin: 8px 0; }
    .summary-row { display: grid; grid-template-columns: 110px 1fr; gap: 8px; align-items: center; margin: 6px 0; }
    .label { font-size: 12px; color: var(--w3a-colors-textMuted, rgba(255,255,255,0.7)); }
    .value { font-size: 13px; color: var(--w3a-colors-textPrimary, #f6f7f8); word-break: break-word; }
    :host([theme="light"]) .value { color: var(--w3a-colors-textPrimary, #181a1f); }
    .actions { display: grid; grid-auto-flow: column; gap: 10px; justify-content: end; margin-top: 12px; }

    button { font: inherit; border-radius: 14px; padding: 10px 14px; cursor: pointer; }
    .cancel {
      background: var(--w3a-modal__btn-cancel__background-color, var(--w3a-colors-surface, rgba(255,255,255,0.08)));
      color: var(--w3a-modal__btn-cancel__color, var(--w3a-colors-textPrimary, #f6f7f8));
      border: var(--w3a-modal__btn-cancel__border, 1px solid var(--w3a-colors-borderPrimary, rgba(255,255,255,0.14)));
      min-width: 80px;
    }
    .confirm {
      background: var(--w3a-modal__btn-confirm__background-color, var(--w3a-colors-accent, #3b82f6));
      color: var(--w3a-modal__btn-confirm__color, #fff);
      border: var(--w3a-modal__btn-confirm__border, 1px solid transparent);
      min-width: 80px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }
    .confirm.loading {
      cursor: progress;
      opacity: 0.9;
    }
    .loading-indicator {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      border: 2px solid var(--w3a-modal__loading-indicator__border-color, rgba(255,255,255,0.55));
      border-top-color: var(--w3a-modal__loading-indicator__border-top-color, rgba(255,255,255,0.95));
      animation: tx-confirm-spin 1s linear infinite;
    }
    :host([theme="light"]) .loading-indicator {
      border: 2px solid var(--w3a-modal__loading-indicator__border-color, rgba(255,255,255,0.6));
      border-top-color: var(--w3a-modal__loading-indicator__border-top-color, rgba(255,255,255,0.98));
    }
    .cancel:hover {
      background: var(--w3a-modal__btn-cancel-hover__background-color, var(--w3a-colors-surface, rgba(255,255,255,0.12)));
      border: var(--w3a-modal__btn-cancel-hover__border, 1px solid var(--w3a-colors-borderPrimary, rgba(255,255,255,0.2)));
    }
    .confirm:hover {
      background: var(--w3a-modal__btn-confirm-hover__background-color, var(--w3a-colors-accent, #3b82f6));
      border: var(--w3a-modal__btn-confirm-hover__border, 1px solid transparent);
    }
    .cancel:focus-visible, .confirm:focus-visible {
      outline: 2px solid var(--w3a-modal__btn__focus-outline-color, var(--w3a-colors-accent, #3b82f6));
      outline-offset: 3px;
    }
    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }
    .error { color: var(--w3a-colors-error, #ff7a7a); font-size: 13px; margin: 8px 0; }
    .muted { color: var(--w3a-colors-textMuted, rgba(255,255,255,0.6)); font-size: 12px; }

    @keyframes tx-confirm-spin {
      to { transform: rotate(360deg); }
    }
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
    try { dispatchLitConfirm(this); } catch {}
  };

  private onCancel = () => {
    if (this.loading) return;
    try { dispatchLitCancel(this); } catch {}
  };

  render() {
    return html`
      ${this.errorMessage ? html`<div class="error">${this.errorMessage}</div>` : null}
      ${
        this._treeNode
        ? html`<div style="width:${this._txTreeWidth}">
                <w3a-tx-tree
                  .node=${this._treeNode}
                  .theme=${this.theme}
                  .styles=${TX_TREE_THEMES[this.theme]}
                ></w3a-tx-tree>
              </div>`
        : html`<div class="muted">No actions</div>`
      }
      <div class="actions">
        <button
          class="cancel"
          @click=${this.onCancel}
          ?disabled=${this.loading}
        >
          ${this.cancelText}
        </button>
        <button
          class="confirm ${this.loading ? 'loading' : ''}"
          @click=${this.onConfirm}
          ?disabled=${this.loading}
        >
          ${this.loading
            ? html`<span class="loading-indicator" role="progressbar" aria-label="Loading"></span><span class="sr-only">Loading</span>`
            : html`${this.confirmText}`}
        </button>
      </div>
    `;
  }
}

import { W3A_TX_CONFIRM_CONTENT_ID } from '../tags';

if (!customElements.get(W3A_TX_CONFIRM_CONTENT_ID)) {
  customElements.define(W3A_TX_CONFIRM_CONTENT_ID, TxConfirmContentElement);
}

export default TxConfirmContentElement;
