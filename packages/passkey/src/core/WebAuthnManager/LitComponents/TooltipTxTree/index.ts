import { html, css, type TemplateResult } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import { LitElementWithProps } from '../LitElementWithProps';
import type { TreeNode } from './tooltip-tree-utils';

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

  // Theme management
  private currentTheme: 'dark' | 'light' = 'dark';

  static styles = css`
    /* Interface Replica Design System - Glass Morphism */
    :host {
      display: var(--w3a-tree-host-display, block);
      color: var(--w3a-tree-host-color, #ffffff); /* Interface Replica primary text */
      background: var(--w3a-tree-host-background, transparent);
    }

    .tree-root {
      /* Glass morphism with backdrop blur */
      background: var(--w3a-tree-root-background, rgba(255, 255, 255, 0.08)); /* Glass primary */
      backdrop-filter: var(--w3a-tree-root-backdrop-filter, blur(12px));
      -webkit-backdrop-filter: var(--w3a-tree-root-backdrop-filter, blur(12px));
      max-width: var(--w3a-tree-root-max-width, 600px);
      margin: var(--w3a-tree-root-margin, 0 auto);
      border-radius: var(--w3a-tree-root-border-radius, 24px); /* Inner glass layer radius */
      border: var(--w3a-tree-root-border, 1px solid rgba(255, 255, 255, 0.1)); /* Glass border */
      overflow: var(--w3a-tree-root-overflow, hidden);
      width: var(--w3a-tree-root-width, auto);
      height: var(--w3a-tree-root-height, auto);
      padding: var(--w3a-tree-root-padding, 0);
      /* Theme-aware shadows */
      box-shadow: var(--w3a-tree-root-box-shadow, 0 8px 32px rgba(0, 0, 0, 0.4), 0 4px 16px rgba(0, 0, 0, 0.3));
    }

    .tree-children {
      display: var(--w3a-tree-children-display, block);
      padding: var(--w3a-tree-children-padding, 12px); /* Increased padding for glass aesthetics */
    }

    details {
      margin: var(--w3a-tree-details-margin, 0);
      padding: var(--w3a-tree-details-padding, 0);
      border-radius: var(--w3a-tree-details-border-radius, 16px); /* Medium glass radius */
      overflow: var(--w3a-tree-details-overflow, hidden);
      background: var(--w3a-tree-details-background, rgba(255, 255, 255, 0.03)); /* Subtle glass secondary */
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
      color: var(--w3a-tree-row-color, #ffffff); /* Interface Replica primary text */
      background: var(--w3a-tree-row-background, transparent);
    }

    .summary-row {
      cursor: var(--w3a-tree-summary-cursor, pointer);
      padding: var(--w3a-tree-summary-padding, 8px 12px); /* Increased for better touch targets */
      border-radius: var(--w3a-tree-summary-border-radius, 12px); /* Glass aesthetics */
      transition: var(--w3a-tree-summary-transition, all 0.15s cubic-bezier(0.4, 0, 0.2, 1)); /* Smooth transitions */
      background: var(--w3a-tree-summary-background, rgba(255, 255, 255, 0.05)); /* Subtle glass */
    }

    .summary-row:hover {
      background: var(--w3a-tree-summary-hover-background, rgba(255, 255, 255, 0.08)); /* Glass hover state */
      transform: var(--w3a-tree-summary-hover-transform, translateY(-1px)); /* Subtle lift effect */
    }

    .indent {
      width: var(--w3a-tree-indent-width, var(--indent, 0));
      height: var(--w3a-tree-indent-height, 100%);
    }

    .label {
      display: var(--w3a-tree-label-display, inline-flex);
      align-items: var(--w3a-tree-label-align-items, center);
      gap: var(--w3a-tree-label-gap, 8px); /* Increased gap for better spacing */
      min-width: var(--w3a-tree-label-min-width, 0);
      white-space: var(--w3a-tree-label-white-space, nowrap);
      overflow: var(--w3a-tree-label-overflow, hidden);
      text-overflow: var(--w3a-tree-label-text-overflow, ellipsis);
      font-size: var(--w3a-tree-label-font-size, 13px); /* Slightly larger for better readability */
      color: var(--w3a-tree-label-color, inherit);
      font-weight: var(--w3a-tree-label-font-weight, 500); /* Medium weight for glass aesthetics */
    }

    .chevron {
      display: var(--w3a-tree-chevron-display, inline-block);
      width: var(--w3a-tree-chevron-width, 12px); /* Slightly larger */
      height: var(--w3a-tree-chevron-height, 12px);
      transform: var(--w3a-tree-chevron-transform, rotate(0deg));
      transition: var(--w3a-tree-chevron-transition, all 0.2s cubic-bezier(0.4, 0, 0.2, 1)); /* Smoother transition */
      opacity: var(--w3a-tree-chevron-opacity, 0.7); /* Subtle opacity */
      color: var(--w3a-tree-chevron-color, rgba(255, 255, 255, 0.7)); /* Subtle color */
      overflow: var(--w3a-tree-chevron-overflow, visible);
    }

    details[open] > summary .chevron {
      transform: var(--w3a-tree-chevron-open-transform, rotate(90deg));
      opacity: var(--w3a-tree-chevron-open-opacity, 1); /* Full opacity when open */
    }

    .file-row {
      padding: var(--w3a-tree-file-row-padding, 4px 8px); /* Increased padding */
      font-size: var(--w3a-tree-file-row-font-size, 13px); /* Slightly larger */
      background: var(--w3a-tree-file-row-background, transparent);
    }

    .file-content {
      /* Metallic appearance with glass morphism */
      box-sizing: var(--w3a-tree-file-content-box-sizing, border-box);
      margin: var(--w3a-tree-file-content-margin, 0px);
      padding: var(--w3a-tree-file-content-padding, 12px); /* Increased padding */
      border-radius: var(--w3a-tree-file-content-border-radius, 12px); /* Glass aesthetics */
      background: var(--w3a-tree-file-content-background, linear-gradient(135deg, #3a3a3a 0%, #1a1a1a 50%, #2a2a2a 100%)); /* Metallic gradient */
      border: var(--w3a-tree-file-content-border, 1px solid rgba(255, 255, 255, 0.08)); /* Subtle metallic border */
      box-shadow: var(--w3a-tree-file-content-box-shadow, 0 2px 8px rgba(0, 0, 0, 0.4)); /* Depth for metallic appearance */
      max-height: var(--w3a-tree-file-content-max-height, 200px); /* Slightly taller */
      overflow: var(--w3a-tree-file-content-overflow, auto);
      color: var(--w3a-tree-file-content-color, #e2e8f0);
      font-family: var(--w3a-tree-file-content-font-family, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace);
      white-space: var(--w3a-tree-file-content-white-space, pre-wrap);
      word-break: var(--w3a-tree-file-content-word-break, break-word);
      line-height: var(--w3a-tree-file-content-line-height, 1.4); /* Better line height */
      font-size: var(--w3a-tree-file-content-font-size, 12px); /* Slightly larger */
    }

    .folder-children {
      display: var(--w3a-tree-folder-children-display, block);
      padding: var(--w3a-tree-folder-children-padding, 4px 0 4px 0); /* Increased padding */
    }

    /* Interface Replica Highlighting - Sophisticated accent colors */
    .highlight-receiverId {
      color: var(--w3a-tree-highlight-receiver-id-color, #ff6b35) !important; /* Interface Replica orange */
      font-weight: var(--w3a-tree-highlight-receiver-id-font-weight, 600) !important;
      background: var(--w3a-tree-highlight-receiver-id-background, rgba(255, 107, 53, 0.1)) !important; /* Subtle background */
      text-decoration: var(--w3a-tree-highlight-receiver-id-text-decoration, none) !important;
      padding: var(--w3a-tree-highlight-receiver-id-padding, 2px 6px) !important; /* Small padding */
      border-radius: var(--w3a-tree-highlight-receiver-id-border-radius, 8px) !important; /* Rounded for glass */
      box-shadow: var(--w3a-tree-highlight-receiver-id-box-shadow, none) !important;
      border: var(--w3a-tree-highlight-receiver-id-border, 1px solid rgba(255, 107, 53, 0.2)) !important; /* Subtle border */
    }

    .highlight-methodName {
      color: var(--w3a-tree-highlight-method-name-color, #00d9ff) !important; /* Interface Replica cyan */
      font-weight: var(--w3a-tree-highlight-method-name-font-weight, 600) !important;
      background: var(--w3a-tree-highlight-method-name-background, rgba(0, 217, 255, 0.1)) !important; /* Subtle background */
      text-decoration: var(--w3a-tree-highlight-method-name-text-decoration, none) !important;
      padding: var(--w3a-tree-highlight-method-name-padding, 2px 6px) !important; /* Small padding */
      border-radius: var(--w3a-tree-highlight-method-name-border-radius, 8px) !important; /* Rounded for glass */
      box-shadow: var(--w3a-tree-highlight-method-name-box-shadow, none) !important;
      border: var(--w3a-tree-highlight-method-name-border, 1px solid rgba(0, 217, 255, 0.2)) !important; /* Subtle border */
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
          const cssVar = `--w3a-tree-${this.camelToKebab(section)}-${this.camelToKebab(prop)}`;
          this.style.setProperty(cssVar, String(value));
        });
      }
    });
  }

  private camelToKebab(str: string): string {
    return str.replace(/([A-Z])/g, '-$1').toLowerCase();
  }

  /**
   * Set the theme for the tooltip tree component
   * Applies Interface Replica design system themes
   */
  setTheme(theme: 'dark' | 'light'): void {
    this.currentTheme = theme;

    // Apply theme-aware CSS variables
    if (theme === 'light') {
      this.style.setProperty('--w3a-tree-host-color', '#000000');
      this.style.setProperty('--w3a-tree-row-color', '#000000');
      this.style.setProperty('--w3a-tree-chevron-color', 'rgba(0, 0, 0, 0.6)');
      this.style.setProperty('--w3a-tree-root-background', 'rgba(255, 255, 255, 0.6)');
      this.style.setProperty('--w3a-tree-root-border', '1px solid rgba(255, 255, 255, 0.2)');
      this.style.setProperty('--w3a-tree-root-box-shadow', '0 8px 32px rgba(0, 0, 0, 0.12), 0 4px 16px rgba(0, 0, 0, 0.08)');
      this.style.setProperty('--w3a-tree-summary-background', 'rgba(255, 255, 255, 0.25)');
      this.style.setProperty('--w3a-tree-summary-hover-background', 'rgba(255, 255, 255, 0.35)');
      this.style.setProperty('--w3a-tree-details-background', 'rgba(255, 255, 255, 0.15)');
      this.style.setProperty('--w3a-tree-file-content-background', 'linear-gradient(135deg, #ffffff 0%, #f5f5f5 50%, #ffffff 100%)');
      this.style.setProperty('--w3a-tree-file-content-border', '1px solid rgba(0, 0, 0, 0.08)');
      this.style.setProperty('--w3a-tree-file-content-box-shadow', '0 2px 4px rgba(0, 0, 0, 0.12)');
    } else {
      // Dark theme (default)
      this.style.setProperty('--w3a-tree-host-color', '#ffffff');
      this.style.setProperty('--w3a-tree-row-color', '#ffffff');
      this.style.setProperty('--w3a-tree-chevron-color', 'rgba(255, 255, 255, 0.7)');
      this.style.setProperty('--w3a-tree-root-background', 'rgba(255, 255, 255, 0.08)');
      this.style.setProperty('--w3a-tree-root-border', '1px solid rgba(255, 255, 255, 0.1)');
      this.style.setProperty('--w3a-tree-root-box-shadow', '0 8px 32px rgba(0, 0, 0, 0.4), 0 4px 16px rgba(0, 0, 0, 0.3)');
      this.style.setProperty('--w3a-tree-summary-background', 'rgba(255, 255, 255, 0.05)');
      this.style.setProperty('--w3a-tree-summary-hover-background', 'rgba(255, 255, 255, 0.08)');
      this.style.setProperty('--w3a-tree-details-background', 'rgba(255, 255, 255, 0.03)');
      this.style.setProperty('--w3a-tree-file-content-background', 'linear-gradient(135deg, #3a3a3a 0%, #1a1a1a 50%, #2a2a2a 100%)');
      this.style.setProperty('--w3a-tree-file-content-border', '1px solid rgba(255, 255, 255, 0.08)');
      this.style.setProperty('--w3a-tree-file-content-box-shadow', '0 2px 8px rgba(0, 0, 0, 0.4)');
    }
  }

  private renderLeaf(
    depth: number,
    node: TreeNode,
    open?: boolean,
    hideChevron?: boolean
  ): TemplateResult | undefined {

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
              ${!hideChevron ? html`
                <svg class="chevron" viewBox="0 0 16 16" aria-hidden="true">
                  <path fill="currentColor" d="M6 3l5 5-5 5z" />
                </svg>
              ` : ''}
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
    highlight?: { type: 'receiverId' | 'methodName'; color: string },
    hideChevron?: boolean
  ): TemplateResult | undefined {

    const indent = `${Math.max(0, depth - 1)}rem`;
    // Apply highlighting class if specified
    const highlightClass = highlight ? `highlight-${highlight.type}` : '';

    return html`
      <details class="tree-node folder" ?open=${!!open} @toggle=${this.handleToggle}>
        <summary class="row summary-row" style="--indent: ${indent}">
          <span class="indent"></span>
          <span class="label ${highlightClass}">
            ${!hideChevron ? html`
              <svg class="chevron" viewBox="0 0 16 16" aria-hidden="true">
                <path fill="currentColor" d="M6 3l5 5-5 5z" />
              </svg>
            ` : ''}
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

  private renderAnyNode(node: TreeNode, depth: number): TemplateResult | undefined {
    return node.type === 'file'
      ? this.renderLeaf(depth, node, node?.open, node?.hideChevron)
      : this.renderFolder(depth, node.label, node.children, node.open, node.highlight, node.hideChevron);
  }

  render() {
    const depth = this.depth ?? 0;

    // Initialize theme on first render if not already set
    if (!this.hasAttribute('data-theme-initialized')) {
      this.setAttribute('data-theme-initialized', 'true');
      this.setTheme(this.currentTheme);
    }

    // Apply styles if provided
    if (this.tooltipTreeStyles) {
      this.applyStyles(this.tooltipTreeStyles);
    }

    if (!this.node || (this.node.type === 'folder' && !this.node.children?.length)) {
      return html``;
    }

    let content: TemplateResult | undefined;

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
