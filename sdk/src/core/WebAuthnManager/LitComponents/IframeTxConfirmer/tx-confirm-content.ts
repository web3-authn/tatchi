import { html, css, type PropertyValues } from 'lit';
import { LitElementWithProps } from '../LitElementWithProps';
import { dispatchLitCancel, dispatchLitConfirm } from '../lit-events';

import type { TransactionInputWasm } from '../../../types';
import type { VRFChallenge } from '../../../types/vrf-worker';
import { fromTransactionInputsWasm } from '../../../types/actions';
import TxTree from '../TxTree';
import { buildDisplayTreeFromTxPayloads } from '../TxTree/tx-tree-utils';
import { ensureTxTreeStyles } from '../TxTree/tx-tree-stylesheet';
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
    // Optional: set tooltip width via CSS var for nested components
    tooltipWidth: { type: String, attribute: 'tooltip-width' },
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
  declare tooltipWidth?: string | number;

  private _treeNode: any | null = null;
  // Keep essential custom elements from being tree-shaken
  private _ensureTreeDefinition = TxTree;
  // Tree width now sourced from a single CSS var so host can control it.
  // Falls back to the embedded tooltip width, and then to 340px.
  private _txTreeWidth: string | number = 'var(--tooltip-width, 100%)';

  static styles = css`
    :host {
      display: block;
      color: inherit;
      touch-action: auto;
      width: fit-content;
      /*
       * Responsive tooltip width that adapts to viewport and zoom:
       * - Caps at 340px on wide viewports
       * - Never exceeds viewport width minus a small margin on narrow/zoomed screens
       * - Uses dynamic viewport units when supported for mobile address-bar resizing
       */
      --tooltip-margin: 1.25rem; /* safe breathing room near edges */
      --tooltip-width: min(340px, calc(100vw - var(--tooltip-margin)));
    }
    @supports (width: 1dvw) {
      :host {
        --tooltip-width: min(340px, calc(100dvw - var(--tooltip-margin)));
      }
    }
    .section { margin: 0.5rem 0; }
    .summary-row {
      display: grid;
      /* Content-aware label column that adapts under text zoom */
      grid-template-columns: minmax(8.5em, max-content) 1fr;
      gap: 0.5rem;
      align-items: center;
      margin: 0rem;
    }
    .summary-row > * { min-width: 0; }
    .label { font-size: 0.75rem; color: var(--w3a-colors-textMuted, rgba(255,255,255,0.7)); }
    .value {
      font-size: 0.8125rem;
      color: var(--w3a-colors-textPrimary, #f6f7f8);
      word-break: break-word;
      overflow-wrap: anywhere;
      hyphens: auto;
    }
    :host([theme="light"]) .value { color: var(--w3a-colors-textPrimary, #181a1f); }
    .actions {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.75rem;
      align-items: stretch;
      margin-top: 0.75rem;
    }
    .actions > * { min-width: 0; }

    /* Was inline width on wrapper; now via class to satisfy strict CSP */
    .tooltip-width { width: var(--tooltip-width, 100%); }

    button {
      font: inherit;
      border-radius: 2rem;
      padding: 0.7em 1em;
      cursor: pointer;
      min-height: 2.75em; /* ~44px at 16px base */
    }
    .cancel {
      background: var(--w3a-modal__btn-cancel__background-color, var(--w3a-colors-surface, rgba(255,255,255,0.08)));
      color: var(--w3a-modal__btn-cancel__color, var(--w3a-colors-textPrimary, #f6f7f8));
      border: var(--w3a-modal__btn-cancel__border, 1px solid var(--w3a-colors-borderPrimary, rgba(255,255,255,0.14)));
      border-radius: 2rem;
    }
    .confirm {
      background: var(--w3a-modal__btn-confirm__background-color, var(--w3a-colors-accent, #3b82f6));
      color: var(--w3a-modal__btn-confirm__color, #fff);
      border: var(--w3a-modal__btn-confirm__border, 1px solid transparent);
      border-radius: 2rem;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.5em;
    }
    .confirm.loading {
      cursor: progress;
      opacity: 0.9;
    }
    .loading-indicator {
      width: 1em;
      height: 1em;
      border-radius: 50%;
      border: 0.15em solid var(--w3a-modal__loading-indicator__border-color, rgba(255,255,255,0.55));
      border-top-color: var(--w3a-modal__loading-indicator__border-top-color, rgba(255,255,255,0.95));
      animation: tx-confirm-spin 1s linear infinite;
    }
    :host([theme="light"]) .loading-indicator {
      border: 0.15em solid var(--w3a-modal__loading-indicator__border-color, rgba(255,255,255,0.6));
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
    // Leave tooltipWidth undefined by default so CSS responsive var applies.
  }

  protected getComponentPrefix(): string { return 'tx-confirm-content'; }

  protected createRenderRoot(): HTMLElement | DocumentFragment {
    const root = super.createRenderRoot();
    // Adopt tx-tree.css into this shadow root so light‑DOM TxTree is styled
    ensureTxTreeStyles(root as ShadowRoot | DocumentFragment | HTMLElement).catch(() => {});
    return root;
  }

  connectedCallback(): void {
    super.connectedCallback();
    // Reflect tooltip width var for nested components
    this._applyTooltipWidthVar();
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
    // No resize listener to clean up (width is CSS-driven)
    super.disconnectedCallback();
  }

  firstUpdated(): void {
    // Build initial tree even if the first assignment happened before upgrade
    this._rebuildTree();
    // Width is CSS-driven; no resize handling needed
    this._applyTooltipWidthVar();
  }

  updated(changed: PropertyValues) {
    super.updated(changed);
    if (changed.has('txSigningRequests')) {
      this._rebuildTree();
    }
    if (changed.has('tooltipWidth')) {
      this._applyTooltipWidthVar();
    }
  }

  private _applyTooltipWidthVar() {
    try {
      const w = this._normalizeWidth(this.tooltipWidth);
      // Only set when a caller explicitly provides a width; otherwise
      // keep the responsive CSS default defined on :host.
    if (w) this.setCssVars({ '--tooltip-width': w });
    } catch {}
  }

  private _normalizeWidth(val?: string | number): string | undefined {
    if (val === undefined || val === null) return undefined;
    if (typeof val === 'number' && Number.isFinite(val)) return `${val}px`;
    const s = String(val).trim();
    return s.length ? s : undefined;
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
        ? html`<div class="tooltip-width">
                <w3a-tx-tree
                  light-dom
                  .styles=${{}}
                  .node=${this._treeNode}
                  .theme=${this.theme}
                  .width=${this._txTreeWidth}
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
