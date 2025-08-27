import { LitElement, html, css } from 'lit';
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
}

/**
 * TooltipTxTree
 * A small, dependency-free Lit component that renders a tree-like UI suitable for tooltips.
 *
 * Usage:
 *   <tooltip-tx-tree .node=${node} depth="0"></tooltip-tx-tree>
 */
export class TooltipTxTree extends LitElement {
  // Pure component contract:
  // - Renders solely from inputs (node, depth); holds no internal state
  // - Complex inputs are passed via property binding, not attributes
  // - Do NOT initialize reactive props here; default them in render()
  static properties = {
    // Explicitly disable attribute reflection for complex objects to ensure
    // property binding (.node=..., .depth=...) is used and not coerced via attributes
    node: { attribute: false },
    // depth is driven by parent; keep attribute: false to avoid attr/property mismatch
    depth: { type: Number, attribute: false }
  } as const;

  // Do NOT set class field initializers for reactive props.
  // Initializers can overwrite values set by the parent during element upgrade.
  node?: TreeNode | null;
  depth?: number;

  static styles = css`
    :host {
      display: block;
      color: var(--w3a-tree-text, #e6e9f5);
      background: var(--w3a-tree-bg, transparent);
    }

    .tree-root {
      background: var(--w3a-tree-panel, #151833);
      max-width: var(--w3a-tree-max-width, 600px);
      margin: var(--w3a-tree-wrap-margin, 0 auto);
      border-radius: 12px;
      overflow: hidden;
      width: var(--w3a-tree-width, auto);
      height: var(--w3a-tree-height, auto);
    }
    .children {
      display: block;
      padding: 6px;
    }

    details {
      margin: 0;
      padding: 0;
      border-radius: 8px;
      overflow: hidden;
      background: transparent;
    }

    /* Remove the default marker */
    summary::-webkit-details-marker { display: none; }
    summary { list-style: none; }

    .row {
      display: grid;
      grid-template-columns: var(--indent, 0) 1fr 0px;
      align-items: center;
      box-sizing: border-box;
      width: 100%;
      color: var(--w3a-tree-text, #e6e9f5);
      background: transparent;
    }

    .summary-row {
      cursor: pointer;
      padding: 4px 6px;
      border-radius: 6px;
      transition: background 0.15s ease;
    }

    .summary-row:hover {
      background: rgba(255, 255, 255, 0.06);
    }

    .indent {
      width: var(--indent, 0);
      height: 100%;
    }

    .label {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      min-width: 0; /* enable ellipsis */
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      font-size: 12px;
    }

    .chevron {
      display: inline-block;
      width: 10px;
      height: 10px;
      transform: rotate(0deg);
      transition: transform 0.12s ease;
      opacity: 0.85;
    }

    details[open] > summary .chevron {
      transform: rotate(90deg);
    }

    .file-row {
      padding: 2px 6px;
      font-size: 12px;
    }

    .file-content {
      box-sizing: border-box;
      margin: 0px;
      padding: 8px;
      border-radius: 6px;
      background: rgba(255, 255, 255, 0.06);
      max-height: 180px;
      overflow: auto;
      color: #e2e8f0;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
      white-space: pre-wrap;
      word-break: break-word;
      line-height: 1.35;
      font-size: 11px;
    }

    .folder-children {
      display: block;
      padding: 2px 0 2px 0;
    }
  `;

  private handleToggle() {
    // Notify parents that layout may have changed so they can re-measure
    this.dispatchEvent(new CustomEvent('tree-toggled', { bubbles: true, composed: true }));
  }

  private renderLeaf(node: TreeNode, depth: number): unknown {
    const indent = `${Math.max(0, depth - 1)}rem`;
    // If content exists, render a collapsible details with the content
    if (typeof node.content === 'string' && node.content.length > 0) {
      return html`
        <details class="tree-node file" ?open=${false} @toggle=${this.handleToggle}>
          <summary class="row summary-row" style="--indent: ${indent}">
            <span class="indent"></span>
            <span class="label">
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
        <span class="label">${node.label}</span>
      </div>
    `;
  }

  private renderFolder(label: string, nodeChildren: TreeNode[] | undefined, open: boolean | undefined, depth: number): unknown {
    const indent = `${Math.max(0, depth - 1)}rem`;
    return html`
      <details class="tree-node folder" ?open=${!!open} @toggle=${this.handleToggle}>
        <summary class="row summary-row" style="--indent: ${indent}">
          <span class="indent"></span>
          <span class="label">
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
      ? this.renderLeaf(node, depth)
      : this.renderFolder(node.label, node.children, node.open, depth);
  }

  render() {

    const depth = this.depth ?? 0;
    console.log('[TooltipTxTree] render called with node:', this.node, 'depth:', depth);

    if (!this.node || (this.node.type === 'folder' && !this.node.children?.length)) {
      return html``;
    }

    let content: unknown;

    if (depth === 0) {
      // Render only the children as top-level entries
      content = html`
        <div class="tree-root">
          <div class="children">
            ${repeat(
              Array.isArray(this.node.children) ? this.node.children : [],
              (child) => child.id,
              (child) => this.renderAnyNode(child, depth + 1)
            )}
          </div>
        </div>
      `;
    } else if (this.node.type === 'folder') {
      content = this.renderFolder(this.node.label, this.node.children, this.node.open, depth);
    } else if (this.node.type === 'file') {
      content = this.renderLeaf(this.node, depth);
    }

    return content;
  }
}

customElements.define('tooltip-tx-tree', TooltipTxTree);

export default TooltipTxTree;


