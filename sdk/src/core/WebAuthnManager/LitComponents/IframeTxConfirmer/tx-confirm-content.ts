import { html, type PropertyValues } from 'lit';
import { LitElementWithProps } from '../LitElementWithProps';
import { dispatchLitCancel, dispatchLitConfirm } from '../lit-events';

import type { TransactionInputWasm } from '../../../types';
import type { VRFChallenge } from '../../../types/vrf-worker';
import { fromTransactionInputsWasm } from '../../../types/actions';
import TxTree from '../TxTree';
import { buildDisplayTreeFromTxPayloads } from '../TxTree/tx-tree-utils';
import { ensureExternalStyles } from '../css/css-loader';
import { W3A_TX_TREE_ID } from '../tags';
import type { ThemeName } from '../confirm-ui-types';

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
    // Optional: pass explorer base URL down to TxTree
    nearExplorerUrl: { type: String, attribute: 'near-explorer-url' },
    // Forwarded flag to control TxTree's shadow wrapper (drop shadow)
    showShadow: { type: Boolean, attribute: 'show-shadow' },
  } as const;

  declare nearAccountId: string;
  declare txSigningRequests: TransactionInputWasm[];
  declare intentDigest?: string;
  declare vrfChallenge?: VRFChallenge;
  declare theme: ThemeName;
  declare loading: boolean;
  declare errorMessage?: string;
  declare title: string;
  declare confirmText: string;
  declare cancelText: string;
  declare tooltipWidth?: string | number;
  declare nearExplorerUrl?: string;
  declare showShadow: boolean;

  private _treeNode: any | null = null;
  // Keep essential custom elements from being tree-shaken
  private _ensureTreeDefinition = TxTree;
  // Tree width now sourced from a single CSS var so host can control it.
  // Falls back to the embedded tooltip width, and then to 340px.
  private _txTreeWidth: string | number = 'var(--tooltip-width, 100%)';

  // No static styles: structural styles are provided by tx-confirmer.css

  // Styles gating to avoid first-paint before tx-tree.css is ready
  private _stylesReady = false;
  private _stylePromises: Promise<void>[] = [];
  private _stylesAwaiting: Promise<void> | null = null;

  constructor() {
    super();
    // Pre-ensure document-level styles to warm the cache and await link loads
    const root = (document?.documentElement || null) as unknown as HTMLElement | null;
    if (root) {
      this._stylePromises.push(
        ensureExternalStyles(root, 'tx-tree.css', 'data-w3a-tx-tree-css'),
        ensureExternalStyles(root, 'tx-confirmer.css', 'data-w3a-tx-confirmer-css'),
        ensureExternalStyles(root, 'w3a-components.css', 'data-w3a-components-css'),
      );
    }
    this.nearAccountId = '';
    this.txSigningRequests = [];
    this.theme = 'dark';
    this.loading = false;
    this.title = 'Review Transaction';
    this.confirmText = 'Confirm';
    this.cancelText = 'Cancel';
    this.showShadow = false;
    // Leave tooltipWidth undefined by default so CSS responsive var applies.
  }

  protected getComponentPrefix(): string { return 'tx-confirm-content'; }

  protected createRenderRoot(): HTMLElement | DocumentFragment {
    const root = (this as unknown) as HTMLElement;
    // Ensure tx-tree.css for nested light-DOM TxTree
    this._stylePromises.push(ensureExternalStyles(root, 'tx-tree.css', 'data-w3a-tx-tree-css'));
    // Also ensure tx-confirmer.css for shared confirmer styles
    this._stylePromises.push(ensureExternalStyles(root, 'tx-confirmer.css', 'data-w3a-tx-confirmer-css'));
    return root;
  }

  connectedCallback(): void {
    super.connectedCallback();
    // Reflect tooltip width var for nested components
    this._applyTooltipWidthVar();
    // Build initial tree from any pre-set props (upgrade-safe)
    this._rebuildTree();
    // Prevent drawer drag initiation from content area
    this.addEventListener('pointerdown', this._stopDragStart as EventListener);
    this.addEventListener('mousedown', this._stopDragStart as EventListener);
    this.addEventListener('touchstart', this._stopDragStart as EventListener, { passive: false } as AddEventListenerOptions);
  }

  disconnectedCallback(): void {
    this.removeEventListener('pointerdown', this._stopDragStart as EventListener);
    this.removeEventListener('mousedown', this._stopDragStart as EventListener);
    this.removeEventListener('touchstart', this._stopDragStart as EventListener);
    // No resize listener to clean up (width is CSS-driven)
    super.disconnectedCallback();
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
    const w = this._normalizeWidth(this.tooltipWidth);
    // Only set when a caller explicitly provides a width; otherwise
    // keep the responsive CSS default defined on :host.
    if (w) this.setCssVars({ '--tooltip-width': w });
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
    dispatchLitConfirm(this);
  };

  private onCancel = () => {
    if (this.loading) return;
    dispatchLitCancel(this);
  };

  render() {
    return html`
      <div class="txc-root">
        ${this.errorMessage ? html`<div class="error">${this.errorMessage}</div>` : null}
        ${(() => {
          const treeTheme: 'dark' | 'light' = this.theme === 'dark' ? 'dark' : 'light';
          const explorerBase = this.nearExplorerUrl || 'https://testnet.nearblocks.io';
          return this._treeNode
            ? html`<div class="tooltip-width">
                    <w3a-tx-tree
                      light-dom
                      .node=${this._treeNode}
                      .theme=${treeTheme}
                      .width=${this._txTreeWidth}
                      .nearExplorerUrl=${explorerBase}
                      .showShadow=${this.showShadow}
                    ></w3a-tx-tree>
                  </div>`
            : html`<div class="muted">No actions</div>`;
        })()}
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
      </div>
    `;
  }
}

import { W3A_TX_CONFIRM_CONTENT_ID } from '../tags';

if (!customElements.get(W3A_TX_CONFIRM_CONTENT_ID)) {
  customElements.define(W3A_TX_CONFIRM_CONTENT_ID, TxConfirmContentElement);
}

export default TxConfirmContentElement;
