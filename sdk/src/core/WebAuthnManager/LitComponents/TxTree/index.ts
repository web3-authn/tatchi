import { html, type TemplateResult } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import { LitElementWithProps } from '../LitElementWithProps';
import { dispatchLitTreeToggled } from '../lit-events';
import type { TreeNode } from './tx-tree-utils';
import type { TxTreeStyles } from './tx-tree-themes';
import { TX_TREE_THEMES } from './tx-tree-themes';
import { formatGas, formatDeposit, formatCodeSize, shortenPubkey } from '../common/formatters';
import { isNumber, isString } from '@/utils/validation';
import { ensureExternalStyles } from '../css/css-loader';
// Re-export for backward compatibility
export type { TxTreeStyles } from './tx-tree-themes';

/**
 * TxTree
 * A small, dependency-free Lit component that renders a tree-like UI suitable for tooltips.
 *
 * Usage:
 *   <w3a-tx-tree .node=${node} depth="0"></w3a-tx-tree>
 *
 * Mapping note: txSigningRequests (TransactionInput[]) → TreeNode structure
 * Example (single FunctionCall):
 * {
 *   id: 'txs-root', label: 'Transaction', type: 'folder', open: true,
 *   children: [
 *     {
 *       id: 'tx-0',
 *       label: 'Transaction 1 to w3a-v1.testnet',
 *       type: 'folder',
 *       open: true,
 *       children: [
 *         {
 *           id: 'action-0',
 *           label: 'Action 1: FunctionCall',
 *           type: 'folder',
 *           open: false,
 *           children: [
 *             { id: 'a0-method', label: 'method: set_greeting', type: 'file' },
 *             { id: 'a0-gas', label: 'gas: 30000000000000', type: 'file' },
 *             { id: 'a0-deposit', label: 'deposit: 0', type: 'file' },
 *             { id: 'a0-args', label: 'args', type: 'file', content: '{\n  "greeting": "Hello from Embedded Component! [...]"\n}' }
 *           ]
 *         }
 *       ]
 *     }
 *   ]
 * }
 */
export class TxTree extends LitElementWithProps {

  // Pure component contract:
  // - Renders solely from inputs (node, depth, styles); holds no internal state
  // - Complex inputs are passed via property binding, not attributes
  static properties = {
    // Explicitly disable attribute reflection for complex objects to ensure
    // property binding (.node=..., .depth=..., .styles=...) is used and not coerced via attributes
    node: { attribute: false },
    // depth is driven by parent; keep attribute: false to avoid attr/property mismatch
    depth: { type: Number, attribute: false },
    // styles accepts full CSS customization - reactive to trigger re-renders
    styles: { attribute: false, state: true },
    theme: { type: String, reflect: true },
    // Optional width for the tree at depth=0. Accepts number (px) or any CSS length string.
    // Exposed as attribute for convenience, but property binding works too.
    width: { type: String },
    // Opt-in: render in Shadow DOM for encapsulation; default is light DOM for CSP simplicity
    shadowDom: { type: Boolean, attribute: 'shadow-dom' },
    // Optional: base URL for NEAR explorer links, e.g., https://testnet.nearblocks.io
    nearExplorerUrl: { type: String, attribute: 'near-explorer-url' },
    // Controls whether the outer tooltip wrapper shows a drop shadow.
    // Defaults to true to preserve existing tooltip visuals.
    showShadow: { type: Boolean, attribute: 'show-shadow' }
  } as const;

  // Do NOT set class field initializers for reactive props.
  // Initializers can overwrite values set by the parent during element upgrade.
  node?: TreeNode | null;
  depth?: number;
  styles?: TxTreeStyles;
  theme?: 'dark' | 'light';
  // Optional class applied to the root container (depth=0 only)
  class?: string;
  // Optional width for the tree (applies at depth=0 root container). Number is treated as pixels.
  width?: string | number;
  // When true, render using Shadow DOM and adopt styles into the ShadowRoot
  shadowDom?: boolean;
  // Optional base URL for explorer (e.g., https://testnet.nearblocks.io)
  nearExplorerUrl?: string;
  // When true (default), render the outer wrapper with drop shadow for tooltip usage
  showShadow: boolean = true;

  // Static styles removed; this component now relies on external tx-tree.css

  // Track which node IDs have recently been copied
  private _copied: Set<string> = new Set();
  private _copyTimers: Map<string, number> = new Map();
  private _animating: WeakSet<HTMLDetailsElement> = new WeakSet();

  private isCopied(id: string): boolean {
    return this._copied.has(id);
  }

  private async handleCopyClick(e: Event, node: TreeNode) {
    e.stopPropagation();
    const value = node.copyValue;
    if (!value) return;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        const ta = document.createElement('textarea');
        ta.value = value;
        ta.setAttribute('readonly', '');
        ta.className = 'w3a-offscreen';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); } catch {}
        document.body.removeChild(ta);
      }
      // Mark as copied for 2 seconds
      this._copied.add(node.id);
      this.requestUpdate();
      const existing = this._copyTimers.get(node.id);
      if (existing) {
        window.clearTimeout(existing);
      }
      const timer = window.setTimeout(() => {
        this._copied.delete(node.id);
        this._copyTimers.delete(node.id);
        this.requestUpdate();
      }, 2000);
      this._copyTimers.set(node.id, timer);
    } catch {
      // Swallow errors silently
    }
  }

  private handleToggle() {
    // Notify parents that layout may have changed so they can re-measure
    dispatchLitTreeToggled(this);
  }

  /**
   * Intercept summary clicks to run height animations for open/close.
   * Keeps native semantics by toggling details.open at the appropriate time.
   */
  private onSummaryClick = (e: Event) => {
    const summary = e.currentTarget as HTMLElement | null;
    if (!summary) return;

    // If the click originated on a receiver-id link, prevent the native
    // toggle on <summary> and open the link in a new tab instead.
    const path = (e as any).composedPath?.() as EventTarget[] | undefined;
    let clickedReceiverLink: HTMLAnchorElement | null = null;
    if (Array.isArray(path)) {
      for (const t of path) {
        if (t && typeof (t as any).matches === 'function' && (t as any).matches('a.highlight-receiver-id')) {
          clickedReceiverLink = t as HTMLAnchorElement;
          break;
        }
      }
    } else {
      const target = e.target as HTMLElement | null;
      clickedReceiverLink = (target?.closest?.('a.highlight-receiver-id') as HTMLAnchorElement | null) ?? null;
    }
    if (clickedReceiverLink) {
      e.preventDefault();
      e.stopPropagation();
      try { window.open(clickedReceiverLink.href, '_blank', 'noopener'); } catch {}
      return;
    }

    // Otherwise, prevent native toggle so we can animate first
    e.preventDefault();
    e.stopPropagation();

    const details = summary.closest('details') as HTMLDetailsElement | null;
    if (!details || this._animating.has(details)) return;

    // Find the collapsible body (folder children or file row content)
    const body = details.querySelector(':scope > .folder-children, :scope > .row.file-row') as HTMLElement | null;
    // If no body, fall back to instant toggle + event
    if (!body) {
      details.open = !details.open;
      this.handleToggle();
      return;
    }

    // Respect reduced motion
    const reduceMotion = (() => {
      return typeof window !== 'undefined' && 'matchMedia' in window
        ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
        : false;
    })();

    if (reduceMotion) {
      details.open = !details.open;
      this.handleToggle();
      return;
    }

    if (!details.open) {
      this.animateOpen(details, body);
    } else {
      this.animateClose(details, body);
    }
  }

  private animateOpen(details: HTMLDetailsElement, body: HTMLElement) {
    this._animating.add(details);
    // Prepare closed state and open the details element
    body.classList.add('anim-h');
    details.open = true;

    requestAnimationFrame(() => {
      const target = `${body.scrollHeight}px`;
      // Drive animation via host CSS variable; avoid inline styles
      this.setCssVars({ '--w3a-tree__anim-target': target });
      // Activate transition to target height
      body.classList.add('anim-h-active');
      let done = false;
      const cleanup = () => {
        if (done) return; done = true;
        body.classList.remove('anim-h');
        body.classList.remove('anim-h-active');
        this._animating.delete(details);
        this.handleToggle();
      };
      const onEnd = (ev: TransitionEvent) => {
        if (ev.propertyName !== 'height') return;
        body.removeEventListener('transitionend', onEnd);
        cleanup();
      };
      body.addEventListener('transitionend', onEnd);
      // Safety fallback in case transitionend doesn't fire (e.g., no CSS vars path)
      window.setTimeout(() => {
        body.removeEventListener('transitionend', onEnd);
        cleanup();
      }, 200);
    });
  }

  private animateClose(details: HTMLDetailsElement, body: HTMLElement) {
    this._animating.add(details);
    const start = `${body.scrollHeight}px`;
    // Pin current height, then transition to 0 using classes
    this.setCssVars({ '--w3a-tree__anim-target': start });
    body.classList.add('anim-h');
    body.classList.add('anim-h-active');
    // Force reflow to ensure start height is applied
    void body.offsetHeight;
    requestAnimationFrame(() => {
      body.classList.remove('anim-h-active');
      let done = false;
      const cleanup = () => {
        if (done) return; done = true;
        body.removeEventListener('transitionend', onEnd);
        details.open = false;
        body.classList.remove('anim-h');
        this._animating.delete(details);
        this.handleToggle();
      };
      const onEnd = (ev: TransitionEvent) => {
        if (ev.propertyName !== 'height') return;
        cleanup();
      };
      body.addEventListener('transitionend', onEnd);
      // Safety fallback in case transitionend doesn't fire
      window.setTimeout(() => cleanup(), 250);
    });
  }

  protected getComponentPrefix(): string {
    return 'tree';
  }

  protected applyStyles(styles: TxTreeStyles): void {
    super.applyStyles(styles, 'tree');
  }

  // Prefer light DOM rendering so styles are fully externalized for strict CSP.
  // External tx-tree.css is ensured for both light/shadow contexts, but we render
  // in light DOM by default to avoid Lit injecting a <style> tag.
  protected createRenderRoot(): HTMLElement | DocumentFragment {
    if (this.shadowDom) {
      // Encapsulated mode: render in ShadowRoot and adopt stylesheet there
      const root = super.createRenderRoot();
      ensureExternalStyles(root as ShadowRoot | DocumentFragment | HTMLElement, 'tx-tree.css', 'data-w3a-tx-tree-css').catch(() => {});
      return root;
    }
    // Default: light DOM render for CSP simplicity; ensure styles at host and (if present) nearest ShadowRoot
    ensureExternalStyles(this as unknown as HTMLElement, 'tx-tree.css', 'data-w3a-tx-tree-css').catch(() => {});
    const root = (this.getRootNode && this.getRootNode()) as any;
    if (root && typeof root === 'object' && 'host' in root) {
      ensureExternalStyles(root as ShadowRoot, 'tx-tree.css', 'data-w3a-tx-tree-css').catch(() => {});
    }
    return this as unknown as HTMLElement;
  }

  /**
   * Lifecycle method to apply styles when they change
   */
  protected updated(changedProperties: Map<string | number | symbol, unknown>): void {
    super.updated(changedProperties);
    // 1) Apply explicit styles when provided and non-empty
    const hasExplicitStyles = !!this.styles && Object.keys(this.styles as Record<string, unknown>).length > 0;
    if (changedProperties.has('styles') && hasExplicitStyles) {
      this.applyStyles(this.styles as TxTreeStyles);
    }
    // 2) Fall back to theme-driven defaults when styles are not provided/changed
    // This makes <w3a-tx-tree theme="dark|light"> responsive even if a parent forgets
    // to pass a styles object for the theme.
    if (changedProperties.has('theme') && !hasExplicitStyles && this.theme) {
      const preset = TX_TREE_THEMES[this.theme] || TX_TREE_THEMES.dark;
      this.applyStyles(preset);
    }
  }

  connectedCallback(): void {
    super.connectedCallback();
  }

  private renderLabelWithSelectiveHighlight(treeNode: TreeNode): TemplateResult | string {
    // Action-level labels (with inline highlights)
    if (treeNode.action) {
      const a = treeNode.action;
      switch (a.type) {
        case 'FunctionCall': {
          let method = a.methodName;
          let gasStr = formatGas(a.gas);
          let depositStr = formatDeposit(a.deposit);
          return html`Calling <span class="highlight-method-name">${method}</span>
              ${depositStr !== '0 NEAR' ? html` with <span class="highlight-method-name">${depositStr}</span>` : ''}
              ${gasStr ? html` using <span class="highlight-method-name">${gasStr}</span>` : ''}`;
        }
        case 'Transfer': {
          let amount = formatDeposit(a.amount);
          return html`Transfer <span class="highlight-amount">${amount}</span>`;
        }
        case 'CreateAccount':
          return 'Creating Account';
        case 'DeleteAccount':
          // let beneficiaryId = formatDeposit(a.beneficiaryId);
          // return html`Deleting Account, sending balance to <span class="highlight-amount">${beneficiaryId}</span>`;
          return 'Deleting Account';
        case 'Stake':
          return `Staking ${formatDeposit(a.stake)}`;
        case 'AddKey':
          let ak = a.accessKey;
          // let accessKeyObj = typeof ak === 'string' ? JSON.parse(ak) : ak;
          // let permission = accessKeyObj.permission === 'FullAccess' ? 'Full Access' : 'Function Call';
          return `Adding Key`;
        case 'DeleteKey':
          return `Deleting Key`;
        case 'DeployContract': {
          const codeSize = formatCodeSize(a.code);
          return `Deploying WASM contract (${codeSize})`;
        }
        case 'DeployGlobalContract': {
          const codeSize = formatCodeSize((a as any).code);
          const mode = (a as any).deployMode || 'Unknown';
          return `Deploy global WASM contract (mode: ${mode}, size ${codeSize})`;
        }
        case 'UseGlobalContract': {
          const accountId = (a as any).accountId;
          const codeHash = (a as any).codeHash;
          if (accountId) {
            const base = (this.nearExplorerUrl || 'https://testnet.nearblocks.io').replace(/\/$/, '');
            const href = `${base}/address/${encodeURIComponent(accountId)}`;
            return html`Use global contract <a
              class="highlight-receiver-id"
              href=${href}
              target="_blank"
              rel="noopener noreferrer"
            >${accountId}</a>`;
          }
          if (codeHash) {
            const short = shortenPubkey(codeHash, { prefix: 10, suffix: 6 });
            return html`Use global contract by hash <span class="highlight-method-name">${short}</span>`;
          }
          return 'Use global contract';
        }
        default: {
          const idxText = isNumber(treeNode.actionIndex) ? ` ${treeNode.actionIndex + 1}` : '';
          const typeText = a.type || 'Unknown';
          return `Action ${idxText}: ${typeText}`;
        }
      }
    }

    // Transaction-level labels (with inline receiver highlight)
    if (treeNode.transaction) {
      const total = treeNode.totalTransactions ?? 1;
      const idx = treeNode.transactionIndex ?? 0;
      const prefix = total > 1 ? `Transaction ${idx + 1}: to ` : 'Transaction to ';
      const receiverId = treeNode.transaction.receiverId;
      const base = (this.nearExplorerUrl || 'https://testnet.nearblocks.io').replace(/\/$/, '');
      const href = `${base}/address/${encodeURIComponent(receiverId)}`;
      return html`${prefix}<a
        class="highlight-receiver-id"
        href=${href}
        target="_blank"
        rel="noopener noreferrer"
      >${receiverId}</a>`;
    }

    // Fallback to plain label for non-action, non-transaction nodes
    return treeNode.label || '';
  }

  /**
   * Compute a plain-text version of the label for use in the title tooltip.
   * Mirrors renderLabelWithSelectiveHighlight but without inline HTML/spans.
   */
  private computePlainLabel(treeNode: TreeNode): string {
    // Action-level labels
    if (treeNode.action) {
      const a = treeNode.action;
      switch (a.type) {
        case 'FunctionCall': {
          const method = a.methodName;
          const gasStr = formatGas(a.gas);
          const depositStr = formatDeposit(a.deposit);
          return `Calling ${method} with ${depositStr} using ${gasStr}`;
        }
        case 'Transfer':
          return `Transfer ${formatDeposit(a.amount)}`;
        case 'CreateAccount':
          return 'Creating Account';
        case 'DeleteAccount':
          return 'Deleting Account';
        case 'Stake':
          return `Staking ${formatDeposit(a.stake)}`;
        case 'AddKey':
          return 'Adding Key';
        case 'DeleteKey':
          return 'Deleting Key';
        case 'DeployContract':
          return 'Deploying WASM contract';
        case 'DeployGlobalContract': {
          const codeSize = formatCodeSize((a as any).code);
          const mode = (a as any).deployMode || 'Unknown';
          return `Deploy global WASM contract (mode: ${mode}, size ${codeSize})`;
        }
        case 'UseGlobalContract': {
          const accountId = (a as any).accountId;
          const codeHash = (a as any).codeHash;
          if (accountId) {
            return `Use global contract by account ${accountId}`;
          }
          if (codeHash) {
            return `Use global contract by hash ${codeHash}`;
          }
          return 'Use global contract';
        }
        default: {
          const idxText = isNumber(treeNode.actionIndex) ? ` ${treeNode.actionIndex + 1}` : '';
          const typeText = a.type || 'Unknown';
          return `Action${idxText}: ${typeText}`;
        }
      }
    }

    // Transaction-level labels
    if (treeNode.transaction) {
      const total = treeNode.totalTransactions ?? 1;
      const idx = treeNode.transactionIndex ?? 0;
      const prefix = total > 1 ? `Transaction ${idx + 1}: to ` : 'Transaction to ';
      const receiverId = treeNode.transaction.receiverId;
      return `${prefix}${receiverId}`;
    }

    return treeNode.label || '';
  }

  private renderLeaf(depth: number, node: TreeNode): TemplateResult | undefined {

    const depthIndex = Math.max(0, depth - 1);

    // If content exists, render a collapsible details with the content
    if (isString(node.content) && node.content.length > 0) {
      return html`
        <details class="tree-node file" ?open=${!!node.open}>
          <summary class="row summary-row depth-${depthIndex}"
            data-no-elbow="${!!node.hideLabel}"
            @click=${this.onSummaryClick}
          >
            <span class="indent"></span>
            <span class="label label-action-node" ?hidden=${!!node.hideLabel}>
              ${
                !node.hideChevron
                ? html`
                  <svg class="chevron" viewBox="0 0 16 16" aria-hidden="true">
                    <path fill="currentColor" d="M6 3l5 5-5 5z" />
                  </svg>`
                : ''
              }
              <span class="label-text" title=${this.computePlainLabel(node)}>
                ${this.renderLabelWithSelectiveHighlight(node)}
              </span>
              ${
                node.copyValue
                ? html`
                  <span class="copy-badge"
                    data-copied=${this.isCopied(node.id)}
                    @click=${(e: Event) => this.handleCopyClick(e, node)}
                    title=${this.isCopied(node.id) ? 'Copied' : 'Copy'}
                  >
                    ${this.isCopied(node.id) ? 'copied' : 'copy'}
                  </span>`
                : ''
              }
            </span>
            <!-- Move file-content into .summary-row so we can collapse it by default -->
            <div class="file-content">${node.content}</div>
          </summary>
          <!-- Alternative rendering for file content kept for reference; no inline styles allowed -->
        </details>
      `;
    }
    // Plain file row without content
    return html`
      <div class="row file-row depth-${depthIndex}"
        data-no-elbow="${!!node.hideLabel}"
        ?open=${!!node.open}
      >
        <span class="indent"></span>
        <span class="label label-action-node" ?hidden=${!!node.hideLabel}>
          <span class="label-text" title=${this.computePlainLabel(node)}>
            ${this.renderLabelWithSelectiveHighlight(node)}
          </span>
          ${node.copyValue ? html`
            <span class="copy-badge"
              data-copied=${this.isCopied(node.id)}
              @click=${(e: Event) => this.handleCopyClick(e, node)}
              title=${this.isCopied(node.id) ? 'Copied' : 'Copy'}
            >${this.isCopied(node.id) ? 'copied' : 'copy'}</span>
          ` : ''}
        </span>
      </div>
    `;
  }

  private renderFolder(depth: number, node: TreeNode): TemplateResult | undefined {

    const { children: nodeChildren } = node;
    const depthIndex = Math.max(0, depth - 1);

    return html`
      <details class="tree-node folder" ?open=${!!node.open}>
        <summary class="row summary-row depth-${depthIndex}"
          data-no-elbow="${!!node.hideLabel}"
          @click=${this.onSummaryClick}
        >
          <span class="indent"></span>
          <span class="label" ?hidden=${!!node.hideLabel}>
            ${!node.hideChevron ? html`
              <svg class="chevron" viewBox="0 0 16 16" aria-hidden="true">
                <path fill="currentColor" d="M6 3l5 5-5 5z" />
              </svg>
            ` : ''}
            <span class="label-text" title=${this.computePlainLabel(node)}>
              ${this.renderLabelWithSelectiveHighlight(node)}
            </span>
          </span>
        </summary>
        ${nodeChildren && nodeChildren.length > 0 ? html`
          <div class="folder-children">
            ${repeat(nodeChildren, (c) => c.id, (c) => this.renderAnyNode(c, depth + 1))}
          </div>
        ` : html``}
      </details>
    `;
  }

  private renderAnyNode(node: TreeNode, depth: number): TemplateResult | undefined {
    return node.type === 'file'
      ? this.renderLeaf(depth, node)
      : this.renderFolder(depth, node);
  }

  render() {
    if (!this.node || (this.node.type === 'folder' && !this.node.children?.length)) {
      return html``;
    }

    let depth = this.depth ?? 0;
    let content: TemplateResult | undefined;
    if (depth === 0) {
      const extraClass = this.class ? ` ${this.class}` : '';
      const scrollClass = this.class ? ' scrollable-root' : '';
      // Render only the children as top-level entries
      // When showShadow=false, skip the outer shadow wrapper to blend into host surfaces
      const inner = html`
        <div class="tooltip-tree-root${extraClass}${scrollClass}">
          <div class="tooltip-tree-children">
            ${repeat(
              Array.isArray(this.node.children) ? this.node.children : [],
              (child) => child.id,
              (child) => this.renderAnyNode(child, depth + 1)
            )}
          </div>
        </div>
      `;
      content = this.showShadow
        ? html`<div class="tooltip-border-outer">${inner}</div>`
        : inner;
    } else if (this.node.type === 'folder') {
      content = this.renderFolder(depth, this.node);
    } else if (this.node.type === 'file') {
      content = this.renderLeaf(depth, this.node);
    }

    return content;
  }
}

import { W3A_TX_TREE_ID } from '../tags';

if (!customElements.get(W3A_TX_TREE_ID)) {
  customElements.define(W3A_TX_TREE_ID, TxTree);
}
// Legacy alias: use a subclass to avoid constructor reuse error
if (!customElements.get('tx-tree')) {
  class TxTreeAlias extends TxTree {}
  customElements.define('tx-tree', TxTreeAlias as unknown as CustomElementConstructor);
}

export default TxTree;
