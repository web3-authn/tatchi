import { LitElementWithProps } from '../LitElementWithProps';
import { html, css } from 'lit';
import { repeat } from 'lit/directives/repeat.js';

export type TreeNodeType = 'folder' | 'file';

export interface TreeNode {
  id: string;
  label: string;
  type: TreeNodeType;
  open?: boolean;
  /**
   * Optional content for the node. When provided on a 'file' node,
   * it will be shown inside a collapsible details section.
   */
  content?: string;
  children?: TreeNode[];
  /**
   * Optional highlighting information for special nodes
   */
  highlight?: {
    type: 'receiverId' | 'methodName';
    color: string;
  };
}

export interface TooltipTreeStyles {
  // Allow any CSS properties for maximum flexibility
  root?: Record<string, string>;
  treeChildren?: Record<string, string>;
  details?: Record<string, string>;
  summary?: Record<string, string>;
  summaryRow?: Record<string, string>;
  row?: Record<string, string>;
  indent?: Record<string, string>;
  label?: Record<string, string>;
  chevron?: Record<string, string>;
  fileContent?: Record<string, string>;
  folderChildren?: Record<string, string>;
  // Highlighting styles for transaction details
  highlightReceiverId?: Record<string, string>;
  highlightMethodName?: Record<string, string>;
}

/**
 * TooltipTxTree
 * A small, dependency-free Lit component that renders a tree-like UI suitable for tooltips.
 *
 * Usage:
 *   <tooltip-tx-tree .node=${node} depth="0"></tooltip-tx-tree>
 *
 * Mapping note: txSigningRequests (TransactionInput[]) → TreeNode structure
 * Example (single FunctionCall):
 * {
 *   id: 'txs-root', label: 'Transaction', type: 'folder', open: true,
 *   children: [
 *     {
 *       id: 'tx-0',
 *       label: 'Transaction 1 to web3-authn-v5.testnet',
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
export class TooltipTxTree extends LitElementWithProps {

  // Pure component contract:
  // - Renders solely from inputs (node, depth, tooltipTreeStyles); holds no internal state
  // - Complex inputs are passed via property binding, not attributes
  static properties = {
    // Explicitly disable attribute reflection for complex objects to ensure
    // property binding (.node=..., .depth=..., .tooltipTreeStyles=...) is used and not coerced via attributes
    node: { attribute: false },
    // depth is driven by parent; keep attribute: false to avoid attr/property mismatch
    depth: { type: Number, attribute: false },
    // tooltipTreeStyles accepts full CSS customization
    tooltipTreeStyles: { attribute: false }
  } as const;

  // Do NOT set class field initializers for reactive props.
  // Initializers can overwrite values set by the parent during element upgrade.
  node?: TreeNode | null;
  depth?: number;
  tooltipTreeStyles?: TooltipTreeStyles;

  static styles = css`
    :host {
      display: var(--w3a-tree-host-display, block);
      color: var(--w3a-tree-host-color, #e6e9f5);
      background: var(--w3a-tree-host-background, transparent);
    }

    .tree-root {
      background: var(--w3a-tree-root-background, #151833);
      max-width: var(--w3a-tree-root-max-width, 600px);
      margin: var(--w3a-tree-root-margin, 0 auto);
      border-radius: var(--w3a-tree-root-border-radius, 12px);
      border: var(--w3a-tree-root-border, none);
      overflow: var(--w3a-tree-root-overflow, hidden);
      width: var(--w3a-tree-root-width, auto);
      height: var(--w3a-tree-root-height, auto);
      padding: var(--w3a-tree-root-padding, 0);
    }

    .tree-children {
      display: var(--w3a-tree-children-display, block);
      padding: var(--w3a-tree-children-padding, 6px);
    }

    details {
      margin: var(--w3a-tree-details-margin, 0);
      padding: var(--w3a-tree-details-padding, 0);
      border-radius: var(--w3a-tree-details-border-radius, 8px);
      overflow: var(--w3a-tree-details-overflow, hidden);
      background: var(--w3a-tree-details-background, transparent);
    }

    /* Remove the default marker */
    summary::-webkit-details-marker { display: none; }
    summary { list-style: none; }

    .row {
      display: var(--w3a-tree-row-display, grid);
      grid-template-columns: var(--w3a-tree-row-grid-template-columns, var(--indent, 0) 1fr 0px);
      align-items: var(--w3a-tree-row-align-items, center);
      box-sizing: var(--w3a-tree-row-box-sizing, border-box);
      width: var(--w3a-tree-row-width, 100%);
      color: var(--w3a-tree-row-color, #e6e9f5);
      background: var(--w3a-tree-row-background, transparent);
    }

    .summary-row {
      cursor: var(--w3a-tree-summary-cursor, pointer);
      padding: var(--w3a-tree-summary-padding, 4px 6px);
      border-radius: var(--w3a-tree-summary-border-radius, 6px);
      transition: var(--w3a-tree-summary-transition, background 0.15s ease);
      background: var(--w3a-tree-summary-background, transparent);
    }

    .summary-row:hover {
      background: var(--w3a-tree-summary-hover-background, rgba(255, 255, 255, 0.06));
    }

    .indent {
      width: var(--w3a-tree-indent-width, var(--indent, 0));
      height: var(--w3a-tree-indent-height, 100%);
    }

    .label {
      display: var(--w3a-tree-label-display, inline-flex);
      align-items: var(--w3a-tree-label-align-items, center);
      gap: var(--w3a-tree-label-gap, 6px);
      min-width: var(--w3a-tree-label-min-width, 0);
      white-space: var(--w3a-tree-label-white-space, nowrap);
      overflow: var(--w3a-tree-label-overflow, hidden);
      text-overflow: var(--w3a-tree-label-text-overflow, ellipsis);
      font-size: var(--w3a-tree-label-font-size, 12px);
      color: var(--w3a-tree-label-color, inherit);
      font-weight: var(--w3a-tree-label-font-weight, inherit);
    }

    .chevron {
      display: var(--w3a-tree-chevron-display, inline-block);
      width: var(--w3a-tree-chevron-width, 10px);
      height: var(--w3a-tree-chevron-height, 10px);
      transform: var(--w3a-tree-chevron-transform, rotate(0deg));
      transition: var(--w3a-tree-chevron-transition, transform 0.12s ease);
      opacity: var(--w3a-tree-chevron-opacity, 0.85);
      color: var(--w3a-tree-chevron-color, currentColor);
    }

    details[open] > summary .chevron {
      transform: var(--w3a-tree-chevron-open-transform, rotate(90deg));
    }

    .file-row {
      padding: var(--w3a-tree-file-row-padding, 2px 6px);
      font-size: var(--w3a-tree-file-row-font-size, 12px);
      background: var(--w3a-tree-file-row-background, transparent);
    }

    .file-content {
      box-sizing: var(--w3a-tree-file-content-box-sizing, border-box);
      margin: var(--w3a-tree-file-content-margin, 0px);
      padding: var(--w3a-tree-file-content-padding, 8px);
      border-radius: var(--w3a-tree-file-content-border-radius, 6px);
      background: var(--w3a-tree-file-content-background, rgba(255, 255, 255, 0.06));
      max-height: var(--w3a-tree-file-content-max-height, 180px);
      overflow: var(--w3a-tree-file-content-overflow, auto);
      color: var(--w3a-tree-file-content-color, #e2e8f0);
      font-family: var(--w3a-tree-file-content-font-family, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace);
      white-space: var(--w3a-tree-file-content-white-space, pre-wrap);
      word-break: var(--w3a-tree-file-content-word-break, break-word);
      line-height: var(--w3a-tree-file-content-line-height, 1.35);
      font-size: var(--w3a-tree-file-content-font-size, 11px);
    }

    .folder-children {
      display: var(--w3a-tree-folder-children-display, block);
      padding: var(--w3a-tree-folder-children-padding, 2px 0 2px 0);
    }

    /* Highlighting styles for transaction details */
    .highlight-receiverId {
      color: var(--w3a-tree-highlight-receiver-id-color, #ff6b6b) !important;
      font-weight: var(--w3a-tree-highlight-receiver-id-font-weight, 600) !important;
      background: var(--w3a-tree-highlight-receiver-id-background, transparent) !important;
      text-decoration: var(--w3a-tree-highlight-receiver-id-text-decoration, none) !important;
      padding: var(--w3a-tree-highlight-receiver-id-padding, 0) !important;
      border-radius: var(--w3a-tree-highlight-receiver-id-border-radius, 0) !important;
      box-shadow: var(--w3a-tree-highlight-receiver-id-box-shadow, none) !important;
    }

    .highlight-methodName {
      color: var(--w3a-tree-highlight-method-name-color, #4ecdc4) !important;
      font-weight: var(--w3a-tree-highlight-method-name-font-weight, 600) !important;
      background: var(--w3a-tree-highlight-method-name-background, transparent) !important;
      text-decoration: var(--w3a-tree-highlight-method-name-text-decoration, none) !important;
      padding: var(--w3a-tree-highlight-method-name-padding, 0) !important;
      border-radius: var(--w3a-tree-highlight-method-name-border-radius, 0) !important;
      box-shadow: var(--w3a-tree-highlight-method-name-box-shadow, none) !important;
    }
  `;

  private handleToggle() {
    // Notify parents that layout may have changed so they can re-measure
    this.dispatchEvent(new CustomEvent('tree-toggled', { bubbles: true, composed: true }));
  }

  private applyStyles(styles: TooltipTreeStyles): void {
    if (!styles) return;

    // Apply styles to host element via CSS custom properties
    Object.entries(styles).forEach(([section, sectionStyles]) => {
      if (sectionStyles && typeof sectionStyles === 'object') {
        Object.entries(sectionStyles).forEach(([prop, value]) => {
          const cssVar = `--w3a-tree-${section}-${this.camelToKebab(prop)}`;
          this.style.setProperty(cssVar, String(value));
        });
      }
    });
  }

  private camelToKebab(str: string): string {
    return str.replace(/([A-Z])/g, '-$1').toLowerCase();
  }

  private renderLeaf(depth: number, node: TreeNode, open?: boolean): unknown {
    const indent = `${Math.max(0, depth - 1)}rem`;

    // Apply highlighting class if specified
    const highlightClass = node.highlight ? `highlight-${node.highlight.type}` : '';

    // If content exists, render a collapsible details with the content
    if (typeof node.content === 'string' && node.content.length > 0) {
      return html`
        <details class="tree-node file" ?open=${!!open} @toggle=${this.handleToggle}>
          <summary class="row summary-row" style="--indent: ${indent}">
            <span class="indent"></span>
            <span class="label ${highlightClass}">
              <svg class="chevron" viewBox="0 0 16 16" aria-hidden="true">
                <path fill="currentColor" d="M6 3l5 5-5 5z" />
              </svg>
              ${node.label}
            </span>
          </summary>
          <div class="row file-row" style="--indent: ${indent}">
            <span class="indent"></span>
            <div class="file-content">${node.content}</div>
          </div>
        </details>
      `;
    }
    // Plain file row without content
    return html`
      <div class="row file-row" style="--indent: ${indent}">
        <span class="indent"></span>
        <span class="label ${highlightClass}">${node.label}</span>
      </div>
    `;
  }

  private renderFolder(
    depth: number,
    label: string,
    nodeChildren?: TreeNode[],
    open?: boolean,
    highlight?: { type: 'receiverId' | 'methodName'; color: string }
  ): unknown {
    const indent = `${Math.max(0, depth - 1)}rem`;

    // Apply highlighting class if specified
    const highlightClass = highlight ? `highlight-${highlight.type}` : '';

    return html`
      <details class="tree-node folder" ?open=${!!open} @toggle=${this.handleToggle}>
        <summary class="row summary-row" style="--indent: ${indent}">
          <span class="indent"></span>
          <span class="label ${highlightClass}">
            <svg class="chevron" viewBox="0 0 16 16" aria-hidden="true">
              <path fill="currentColor" d="M6 3l5 5-5 5z" />
            </svg>
            ${label}
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

  private renderAnyNode(node: TreeNode, depth: number): unknown {
    return node.type === 'file'
      ? this.renderLeaf(depth, node, node?.open)
      : this.renderFolder(depth, node.label, node.children, node.open, node.highlight);
  }

  render() {
    const depth = this.depth ?? 0;

    // Apply styles if provided
    if (this.tooltipTreeStyles) {
      this.applyStyles(this.tooltipTreeStyles);
    }

    if (!this.node || (this.node.type === 'folder' && !this.node.children?.length)) {
      return html``;
    }

    let content: unknown;

    if (depth === 0) {
      // Render only the children as top-level entries
      content = html`
        <div class="tree-root">
          <div class="tree-children">
            ${repeat(
              Array.isArray(this.node.children) ? this.node.children : [],
              (child) => child.id,
              (child) => this.renderAnyNode(child, depth + 1)
            )}
          </div>
        </div>
      `;
    } else if (this.node.type === 'folder') {
      content = this.renderFolder(depth, this.node.label, this.node.children, this.node.open, this.node.highlight);
    } else if (this.node.type === 'file') {
      content = this.renderLeaf(depth, this.node, this.node?.open);
    }

    return content;
  }
}

customElements.define('tooltip-tx-tree', TooltipTxTree);

export default TooltipTxTree;

