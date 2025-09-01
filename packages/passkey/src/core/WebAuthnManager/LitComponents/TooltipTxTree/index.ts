import { html, css, type TemplateResult } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import { LitElementWithProps } from '../LitElementWithProps';
import type { TreeNode } from './tooltip-tree-utils';
import type { TooltipTreeStyles } from './tooltip-tree-themes';

// Re-export for backward compatibility
export type { TooltipTreeStyles } from './tooltip-tree-themes';

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
    theme: { type: String, attribute: false }
  } as const;

  // Do NOT set class field initializers for reactive props.
  // Initializers can overwrite values set by the parent during element upgrade.
  node?: TreeNode | null;
  depth?: number;
  styles?: TooltipTreeStyles;
  theme?: 'dark' | 'light';

  static styles = css`
    :host {
      display: block;
      box-sizing: border-box;
      font-family: var(--w3a-tree_host_font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
      font-size: var(--w3a-tree_host_font-size, 1rem);
      color: var(--w3a-tree_host_color, #1e293b);
    }

    .tooltip-border-outer {
      position: relative;
      background: var(--w3a-tree_tooltip-border-outer_background, rgba(255, 255, 255, 0.95));
      backdrop-filter: var(--w3a-tree_tooltip-border-outer_backdrop-filter, blur(4px));
      -webkit-backdrop-filter: var(--w3a-tree_tooltip-border-outer_webkit-backdrop-filter, blur(4px));
      border: var(--w3a-tree_tooltip-border-outer_border, 1px solid var(--w3a-tree_tooltip-border-outer_border-color, oklch(0.8 0 0)));
      border-radius: var(--w3a-tree_tooltip-border-outer_border-radius, 24px);
    }

    .tooltip-border-inner {
      position: var(--w3a-tree_tooltip-border-inner_position, relative);
      border: var(--w3a-tree_tooltip-border-inner_border, 1px solid transparent);
      border-radius: var(--w3a-tree_tooltip-border-inner_border-radius, 24px);
      margin: var(--w3a-tree_tooltip-border-inner_margin, 8px);
      padding: var(--w3a-tree_tooltip-border-inner_padding, 0px);
      height: var(--w3a-tree_tooltip-border-inner_height, calc(100% - 2px));
      overflow: var(--w3a-tree_tooltip-border-inner_overflow, hidden);
      box-shadow: var(--w3a-tree_tooltip-border-inner_box-shadow, 0 2px 4px rgba(0, 0, 0, 0.05));
      background: var(--w3a-tree_tooltip-border-inner_background, var(--w3a-color-surface));
      backdrop-filter: var(--w3a-tree_tooltip-border-inner_backdrop-filter, blur(12px));
      WebkitBackdropFilter: var(--w3a-tree_tooltip-border-inner_webkit-backdrop-filter, blur(12px));
    }

    .tooltip-tree-root {
      background: var(--w3a-tree_tooltip-tree-root_background, #151833);
      max-width: var(--w3a-tree_tooltip-tree-root_max-width, 600px);
      margin: var(--w3a-tree_tooltip-tree-root_margin, 0 auto);
      border-radius: var(--w3a-tree_tooltip-tree-root_border-radius, 12px);
      border: var(--w3a-tree_tooltip-tree-root_border, none);
      overflow: var(--w3a-tree_tooltip-tree-root_overflow, hidden);
      width: var(--w3a-tree_tooltip-tree-root_width, auto);
      height: var(--w3a-tree_tooltip-tree-root_height, auto);
      padding: var(--w3a-tree_tooltip-tree-root_padding, 0);
    }

    .tooltip-tree-children {
      display: var(--w3a-tree_tooltip-children_display, block);
      padding: var(--w3a-tree_tooltip-children_padding, 0px);
    }

    details {
      margin: var(--w3a-tree_details_margin, 0);
      padding: var(--w3a-tree_details_padding, 0);
      border-radius: var(--w3a-tree_details_border-radius, 8px);
      overflow: var(--w3a-tree_details_overflow, hidden);
      background: var(--w3a-tree_details_background, transparent);
    }

    /* Remove the default marker */
    summary::-webkit-details-marker { display: none; }
    summary { list-style: none; }

    .row {
      display: var(--w3a-tree_row_display, grid);
      grid-template-columns: var(--w3a-tree_row_grid-template-columns, var(--indent, 0) 1fr 0px);
      align-items: var(--w3a-tree_row_align-items, center);
      box-sizing: var(--w3a-tree_row_box-sizing, border-box);
      width: var(--w3a-tree_row_width, 100%);
      color: var(--w3a-tree_row_color, #e6e9f5);
      background: var(--w3a-tree_row_background, transparent);
    }

    .summary-row {
      cursor: var(--w3a-tree_summary-row_cursor, pointer);
      padding: var(--w3a-tree_summary-row_padding, 0px 1px);
      margin-bottom: var(--w3a-tree_summary-row_margin-bottom, 1px);
      border-radius: var(--w3a-tree_summary-row_border-radius, 1px);
      transition: var(--w3a-tree_summary-row_transition, background 0.15s ease);
      background: var(--w3a-tree_summary-row_background, transparent);
    }

    .summary-row:hover {
      background: var(--w3a-tree_summary-row-hover_background, rgba(255, 255, 255, 0.06));
    }

    .indent {
      width: var(--w3a-tree_indent_width, var(--indent, 0));
      height: var(--w3a-tree_indent_height, 100%);
    }

    .label {
      display: var(--w3a-tree_label_display, inline-flex);
      align-items: var(--w3a-tree_label_align-items, center);
      gap: var(--w3a-tree_label_gap, 0px);
      padding: var(--w3a-tree_label_padding, 0px);
      min-width: var(--w3a-tree_label_min-width, 0);
      white-space: var(--w3a-tree_label_white-space, nowrap);
      overflow: var(--w3a-tree_label_overflow, hidden);
      text-overflow: var(--w3a-tree_label_text-overflow, ellipsis);
      font-size: var(--w3a-tree_label_font-size, 9px);
      color: var(--w3a-tree_label_color, inherit);
      font-weight: var(--w3a-tree_label_font-weight, inherit);
      line-height: var(--w3a-tree_label_line-height, 1.2);
    }

    .chevron {
      display: var(--w3a-tree_chevron_display, inline-block);
      width: var(--w3a-tree_chevron_width, 8px);
      height: var(--w3a-tree_chevron_height, 8px);
      transform: var(--w3a-tree_chevron_transform, rotate(0deg));
      transition: var(--w3a-tree_chevron_transition, transform 0.12s ease);
      opacity: var(--w3a-tree_chevron_opacity, 0.85);
      color: var(--w3a-tree_chevron_color, currentColor);
      overflow: var(--w3a-tree_chevron_overflow, visible);
    }

    details[open] > summary .chevron {
      transform: var(--w3a-tree_chevron-open_transform, rotate(90deg));
    }

    .file-row {
      font-size: var(--w3a-tree_file-row_font-size, 9px);
      background: var(--w3a-tree_file-row_background, transparent);
    }

    .file-content {
      box-sizing: var(--w3a-tree_file-content_box-sizing, border-box);
      margin: var(--w3a-tree_file-content_margin, 2px);
      padding: var(--w3a-tree_file-content_padding, 2px);
      border-radius: var(--w3a-tree_file-content_border-radius, 2px);
      background: var(--w3a-tree_file-content_background, rgba(255, 255, 255, 0.06));
      max-height: var(--w3a-tree_file-content_max-height, 120px);
      overflow: var(--w3a-tree_file-content_overflow, auto);
      color: var(--w3a-tree_file-content_color, #e2e8f0);
      font-family: var(--w3a-tree_file-content_font-family, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace);
      white-space: var(--w3a-tree_file-content_white-space, pre-wrap);
      word-break: var(--w3a-tree_file-content_word-break, break-word);
      line-height: var(--w3a-tree_file-content_line-height, 1.3);
      font-size: var(--w3a-tree_file-content_font-size, 0.65rem);
      box-shadow: var(--w3a-tree_file-content_box-shadow, none);
    }

    .file-content::-webkit-scrollbar {
      width: var(--w3a-tree_file-content_scrollbar-width, 4px);
    }

    .file-content::-webkit-scrollbar-track {
      background: var(--w3a-tree_file-content_scrollbar-track_background, var(--w3a-color-surface, #f8fafc));
      border-radius: var(--w3a-tree_file-content_scrollbar-track_border-radius, 2px);
    }

    .file-content::-webkit-scrollbar-thumb {
      background: var(--w3a-tree_file-content_scrollbar-thumb_background, var(--w3a-color-border, #e2e8f0));
      border-radius: var(--w3a-tree_file-content_scrollbar-thumb_border-radius, 2px);
    }

    .folder-children {
      display: var(--w3a-tree_folder-children_display, block);
    }

    /* Highlighting styles for transaction details */
    .highlight-receiver-id {
      color: var(--w3a-tree_highlight-receiver-id_color, #ff6b6b) !important;
      font-weight: var(--w3a-tree_highlight-receiver-id_font-weight, 600) !important;
      background: var(--w3a-tree_highlight-receiver-id_background, transparent) !important;
      text-decoration: var(--w3a-tree_highlight-receiver-id_text-decoration, none) !important;
      padding: var(--w3a-tree_highlight-receiver-id_padding, 0) !important;
      border-radius: var(--w3a-tree_highlight-receiver-id_border-radius, 0) !important;
      box-shadow: var(--w3a-tree_highlight-receiver-id_box-shadow, none) !important;
    }

    .highlight-method-name {
      color: var(--w3a-tree_highlight-method-name_color, #4ecdc4) !important;
      font-weight: var(--w3a-tree_highlight-method-name_font-weight, 600) !important;
      background: var(--w3a-tree_highlight-method-name_background, transparent) !important;
      text-decoration: var(--w3a-tree_highlight-method-name_text-decoration, none) !important;
      padding: var(--w3a-tree_highlight-method-name_padding, 0) !important;
      border-radius: var(--w3a-tree_highlight-method-name_border-radius, 0) !important;
      box-shadow: var(--w3a-tree_highlight-method-name_box-shadow, none) !important;
    }
  `;

  private handleToggle() {
    // Notify parents that layout may have changed so they can re-measure
    this.dispatchEvent(new CustomEvent('tree-toggled', { bubbles: true, composed: true }));
  }

  protected getComponentPrefix(): string {
    return 'tree';
  }

  protected applyStyles(styles: TooltipTreeStyles): void {
    super.applyStyles(styles, 'tree');
  }

  /**
   * Lifecycle method to apply styles when they change
   */
  protected updated(changedProperties: Map<string | number | symbol, unknown>): void {
    super.updated(changedProperties);
    // Apply styles whenever the styles prop changes
    if (changedProperties.has('styles') && this.styles) {
      this.applyStyles(this.styles);
    }
  }

  connectedCallback(): void {
    super.connectedCallback();

    // Browser doesn't know --border-angle is an animatable angle type,
    // so we need to register it globally.
    // Otherwise --border-angle only cyclesbetween 0deg and 360deg,
    // not smoothly animating through the values in between.
    const w = window as Window & { borderAngleRegistered?: boolean };
    if (!w.borderAngleRegistered && CSS.registerProperty) {
      try {
        CSS.registerProperty({
          name: '--border-angle',
          syntax: '<angle>',
          initialValue: '0deg',
          inherits: false
        });
        w.borderAngleRegistered = true;
      } catch (e) {
        console.warn('[TooltipTxTree] Failed to register --border-angle:', e);
      }
    }
  }

  private renderLabelWithSelectiveHighlight(
    label: string,
    highlight?: { type: 'receiverId' | 'methodName'; color: string }
  ): TemplateResult | string {
    if (!highlight || !label) {
      return label;
    }

    const highlightClass = `highlight-${this.camelToKebab(highlight.type)}`;

    switch (highlight.type) {
      case 'receiverId': {
        // Handle single transaction: "Transaction to receiverId"
        const singleTxMatch = label.match(/^Transaction to (.+)$/);
        if (singleTxMatch) {
          const receiverId = singleTxMatch[1];
          return html`Transaction to <span class="${highlightClass}">${receiverId}</span>`;
        }
        // Handle multiple transactions: "Transaction(index) to receiverId"
        const multiTxMatch = label.match(/^Transaction\(\d+\) to (.+)$/);
        if (multiTxMatch) {
          const receiverId = multiTxMatch[1];
          const prefix = label.substring(0, multiTxMatch.index! + multiTxMatch[0].length - multiTxMatch[1].length);
          return html`${prefix}<span class="${highlightClass}">${receiverId}</span>`;
        }
        // Fallback for unrecognized patterns
        return html`<span class="${highlightClass}">${label}</span>`;
      }
      case 'methodName': {
        const match = label.match(/^Calling (.+) with$/);
        if (match) {
          const methodName = match[1];
          return html`Calling <span class="${highlightClass}">${methodName}</span> with`;
        }
        return html`<span class="${highlightClass}">${label}</span>`;
      }
      default: {
        // Fallback: highlight the entire label if pattern doesn't match
        return html`<span class="${highlightClass}">${label}</span>`;
      }
    }
  }

  private renderLeaf(depth: number, node: TreeNode): TemplateResult | undefined {

    const { open, hideChevron, displayNone, label, highlight, content } = node;
    const indent = `${Math.max(0, depth - 1)}rem`;

    // If content exists, render a collapsible details with the content
    if (typeof node.content === 'string' && node.content.length > 0) {
      return html`
        <details class="tree-node file" ?open=${!!open} @toggle=${this.handleToggle}>
          <summary class="row summary-row" style="--indent: ${indent}; ${node.displayNone ? 'display: none;' : ''}">
            <span class="indent"></span>
            <span class="label" style="${node.displayNone ? 'display: none;' : ''}">
              ${!hideChevron ? html`
                <svg class="chevron" viewBox="0 0 16 16" aria-hidden="true">
                  <path fill="currentColor" d="M6 3l5 5-5 5z" />
                </svg>
              ` : ''}
              ${node.label ? this.renderLabelWithSelectiveHighlight(node.label, node.highlight) : ''}
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
        <span class="label" style="${node.displayNone ? 'display: none;' : ''}">${node.label ? this.renderLabelWithSelectiveHighlight(node.label, node.highlight) : ''}</span>
      </div>
    `;
  }

  private renderFolder(depth: number, node: TreeNode): TemplateResult | undefined {

    const { label, displayNone, highlight, hideChevron, children: nodeChildren } = node;
    const indent = `${Math.max(0, depth - 1)}rem`;

    return html`
      <details class="tree-node folder" ?open=${!!open} @toggle=${this.handleToggle}>
        <summary class="row summary-row" style="--indent: ${indent};${node.displayNone ? 'display: none;' : ''}">
          <span class="indent"></span>
          <span class="label" style="${node.displayNone ? 'display: none;' : ''}">
            ${!hideChevron ? html`
              <svg class="chevron" viewBox="0 0 16 16" aria-hidden="true">
                <path fill="currentColor" d="M6 3l5 5-5 5z" />
              </svg>
            ` : ''}
            ${node.label ? this.renderLabelWithSelectiveHighlight(node.label, highlight) : ''}
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
    const depth = this.depth ?? 0;

    if (!this.node || (this.node.type === 'folder' && !this.node.children?.length)) {
      return html``;
    }

    let content: TemplateResult | undefined;

    if (depth === 0) {
      // Render only the children as top-level entries
      content = html`
        <div class="tooltip-border-outer">
          <div class="tooltip-border-inner">
            <div class="tooltip-tree-root">
              <div class="tooltip-tree-children">
                ${repeat(
                  Array.isArray(this.node.children) ? this.node.children : [],
                  (child) => child.id,
                  (child) => this.renderAnyNode(child, depth + 1)
                )}
              </div>
            </div>
          </div>
        </div>
      `;
    } else if (this.node.type === 'folder') {
      content = this.renderFolder(depth, this.node);
    } else if (this.node.type === 'file') {
      content = this.renderLeaf(depth, this.node);
    }

    return content;
  }
}

customElements.define('tooltip-tx-tree', TooltipTxTree);

export default TooltipTxTree;
