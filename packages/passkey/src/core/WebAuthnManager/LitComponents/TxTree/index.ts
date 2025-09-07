import { html, css, type TemplateResult } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import { LitElementWithProps } from '../LitElementWithProps';
import type { TreeNode } from './tx-tree-utils';
import type { TxTreeStyles } from './tx-tree-themes';
import { formatGas, formatDeposit, formatCodeSize } from '../common/formatters';
// Re-export for backward compatibility
export type { TxTreeStyles } from './tx-tree-themes';

/**
 * TxTree
 * A small, dependency-free Lit component that renders a tree-like UI suitable for tooltips.
 *
 * Usage:
 *   <tx-tree .node=${node} depth="0"></tx-tree>
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
    theme: { type: String, attribute: false }
  } as const;

  // Do NOT set class field initializers for reactive props.
  // Initializers can overwrite values set by the parent during element upgrade.
  node?: TreeNode | null;
  depth?: number;
  styles?: TxTreeStyles;
  theme?: 'dark' | 'light';
  // Optional class applied to the root container (depth=0 only)
  class?: string;

  static styles = css`
    :host {
      display: block;
      box-sizing: border-box;
      font-family: var(--w3a-tree__host__font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
      font-size: var(--w3a-tree__host__font-size, 1rem);
      color: var(--w3a-tree__host__color, #1e293b);
      /* Directional inner padding for shadow room without moving container */
      padding-top: var(--w3a-tree__host__padding-top, 0px);
      padding-bottom: var(--w3a-tree__host__padding-bottom, 0px);
      padding-left: var(--w3a-tree__host__padding-left, 0px);
      padding-right: var(--w3a-tree__host__padding-right, 0px);
    }

    .tooltip-border-outer {
      position: relative;
      background: var(--w3a-tree__tooltip-border-outer__background, rgba(255, 255, 255, 0.95));
      border: var(--w3a-tree__tooltip-border-outer__border, 1px solid var(--w3a-tree__tooltip-border-outer__border-color, oklch(0.8 0 0)));
      border-radius: var(--w3a-tree__tooltip-border-outer__border-radius, 24px);
    }

    .tooltip-border-inner {
      position: var(--w3a-tree__tooltip-border-inner__position, relative);
      border: var(--w3a-tree__tooltip-border-inner__border, 1px solid transparent);
      border-radius: var(--w3a-tree__tooltip-border-inner__border-radius, 24px);
      margin: var(--w3a-tree__tooltip-border-inner__margin, 0px);
      padding: var(--w3a-tree__tooltip-border-inner__padding, 0px);
      height: var(--w3a-tree__tooltip-border-inner__height, auto);
      overflow: var(--w3a-tree__tooltip-border-inner__overflow, hidden);
      box-shadow: var(--w3a-tree__tooltip-border-inner__box-shadow, 0 2px 4px rgba(0, 0, 0, 0.05));
      background: var(--w3a-tree__tooltip-border-inner__background, var(--w3a-color-surface));
      backdrop-filter: var(--w3a-tree__tooltip-border-inner__backdrop-filter, blur(12px));
      WebkitBackdropFilter: var(--w3a-tree__tooltip-border-inner__backdrop-filter, blur(12px));
    }

    .tooltip-tree-root {
      background: var(--w3a-tree__tooltip-tree-root__background, #151833);
      max-width: var(--w3a-tree__tooltip-tree-root__max-width, 600px);
      margin: var(--w3a-tree__tooltip-tree-root__margin, 0 auto);
      border-radius: var(--w3a-tree__tooltip-tree-root__border-radius, 12px);
      border: var(--w3a-tree__tooltip-tree-root__border, none);
      overflow: var(--w3a-tree__tooltip-tree-root__overflow, hidden);
      width: var(--w3a-tree__tooltip-tree-root__width, auto);
      height: var(--w3a-tree__tooltip-tree-root__height, auto);
      padding: var(--w3a-tree__tooltip-tree-root__padding, 0);
    }
    @media (prefers-reduced-motion: reduce) {
      .tooltip-tree-root { transition: none; }
    }

    .tooltip-tree-children {
      display: var(--w3a-tree__tooltip-tree-children__display, block);
      padding: var(--w3a-tree__tooltip-tree-children__padding, 0px);
    }

    details {
      margin: var(--w3a-tree__details__margin, 0);
      padding: var(--w3a-tree__details__padding, 0);
      border-radius: var(--w3a-tree__details__border-radius, 8px);
      overflow: var(--w3a-tree__details__overflow, hidden);
      background: var(--w3a-tree__details__background, transparent);
    }

    /* Remove the default marker */
    summary::-webkit-details-marker { display: none; }
    summary { list-style: none; }

    .row {
      display: var(--w3a-tree__row__display, grid);
      grid-template-columns: var(--w3a-tree__row__grid-template-columns, var(--indent, 0) 1fr 0px);
      align-items: var(--w3a-tree__row__align-items, center);
      box-sizing: var(--w3a-tree__row__box-sizing, border-box);
      width: var(--w3a-tree__row__width, 100%);
      color: var(--w3a-tree__row__color, #e6e9f5);
      background: var(--w3a-tree__row__background, transparent);
      /* Provide explicit vertical spacing so connector lines can extend into it */
      margin-bottom: var(--w3a-tree__row__gap, 0px);
    }

    .summary-row {
      cursor: var(--w3a-tree__summary-row__cursor, pointer);
      padding: var(--w3a-tree__summary-row__padding, 0px 0px);
      margin-bottom: var(--w3a-tree__summary-row__margin-bottom, 0px);
      border-radius: var(--w3a-tree__summary-row__border-radius, 0px);
      transition: var(--w3a-tree__summary-row__transition, background 0.15s ease);
      background: var(--w3a-tree__summary-row__background, transparent);
    }

    .indent {
      width: var(--w3a-tree__indent__width, var(--indent, 0));
      height: var(--w3a-tree__indent__height, 100%);
      position: var(--w3a-tree__indent__position, relative);
    }

    .label {
      display: var(--w3a-tree__label__display, inline-flex);
      align-items: var(--w3a-tree__label__align-items, center);
      gap: var(--w3a-tree__label__gap, 0px);
      padding: var(--w3a-tree__label__padding, 0px);
      min-width: var(--w3a-tree__label__min-width, 0);
      max-width: var(--w3a-tree__label__max-width, 100%);
      flex: var(--w3a-tree__label__flex, 1 1 auto);
      white-space: var(--w3a-tree__label__white-space, nowrap);
      overflow: var(--w3a-tree__label__overflow, hidden);
      text-overflow: var(--w3a-tree__label__text-overflow, ellipsis);
      font-size: var(--w3a-tree__label__font-size, 9px);
      color: var(--w3a-tree__label__color, inherit);
      font-weight: var(--w3a-tree__label__font-weight, inherit);
      line-height: var(--w3a-tree__label__line-height, 1.2);
      border: var(--w3a-tree__label__border, none);
      border-radius: var(--w3a-tree__label__border-radius, 0);
      /* Optional WebKit gradient text support (controlled via CSS vars) */
      -webkit-background-clip: var(--w3a-tree__label__webkit-background-clip, initial);
      -webkit-text-fill-color: var(--w3a-tree__label__webkit-text-fill-color, currentColor);
    }

    /* Inner wrapper to guarantee ellipsis when label contains text + spans */
    .label-text {
      display: inline-flex;
      flex: 1 1 auto;
      min-width: 0;
      max-width: 100%;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    /* Smaller, secondary-colored font for action-node labels (leaf rows) */
    .label.label-action-node {
      font-size: var(--w3a-tree__label-action-node__font-size, 0.8rem);
      color: var(--w3a-color-text-secondary, #94a3b8);
    }

    /* Force gradient text when explicitly requested */
    .label.gradient-text {
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .label:hover {
      background: var(--w3a-tree__summary-row-hover__background, rgba(255, 255, 255, 0.06));
    }

    /* Ensure nested spans (e.g., highlights) inside label-text can shrink */
    .label-text > * {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    /* Copy badge */
    .copy-badge {
      margin-left: auto;
      font-size: 0.7em;
      color: var(--w3a-tree__copy-badge__color, var(--w3a-color-text-secondary));
      background: var(--w3a-tree__copy-badge__background, transparent);
      border: var(--w3a-tree__copy-badge__border, 1px solid transparent);
      border-radius: var(--w3a-tree__copy-badge__border-radius, 8px);
      padding: var(--w3a-tree__copy-badge__padding, 2px 6px);
      cursor: pointer;
      user-select: none;
      transition: color 100ms ease, background 100ms ease;
    }
    .copy-badge:hover {
      background: var(--w3a-tree__copy-badge-hover__background, rgba(255,255,255,0.06));
      color: var(--w3a-tree__copy-badge-hover__color, var(--w3a-color-primary));
    }
    .copy-badge[data-copied="true"] {
      color: var(--w3a-tree__copy-badge-copied__color, var(--w3a-color-text));
      background: var(--w3a-tree__copy-badge-copied__background, rgba(255,255,255,0.06));
    }

    .chevron {
      display: var(--w3a-tree__chevron__display, inline-block);
      width: var(--w3a-tree__chevron__width, 8px);
      height: var(--w3a-tree__chevron__height, 8px);
      transform: var(--w3a-tree__chevron__transform, rotate(0deg));
      transition: var(--w3a-tree__chevron__transition, transform 0.12s ease);
      opacity: var(--w3a-tree__chevron__opacity, 0.85);
      color: var(--w3a-tree__chevron__color, currentColor);
      overflow: var(--w3a-tree__chevron__overflow, visible);
    }

    details[open] > summary .chevron {
      transform: var(--w3a-tree__chevron-open__transform, rotate(90deg));
    }

    .file-row {
      font-size: var(--w3a-tree__file-row__font-size, 9px);
      background: var(--w3a-tree__file-row__background, transparent);
    }

    /*
     * Tree connector lines (├ and └) drawn using the indent column.
     * These render a vertical line along the right edge of the indent area,
     * plus a horizontal elbow into the label area. Works generically for
     * both folder (Transaction/Action) and file rows.
     */
    :host {
      --w3a-tree__connector__color: rgba(230, 233, 245, 0.25);
      --w3a-tree__connector__thickness: 1px;
      --w3a-tree__connector__elbow-length: 10px;
    }

    /* Vertical line for each row at the connector anchor inside the indent column */
    .folder-children .row .indent::before {
      content: '';
      position: absolute;
      top: 0;
      /* Anchor can be overridden per row via --connector-indent; defaults to --indent */
      left: var(--connector-indent, var(--indent, 0));
      right: auto;
      width: var(--w3a-tree__connector__thickness);
      /* Extend the vertical connector into the next row's gap so lines appear continuous */
      height: calc(100% + var(--w3a-tree__row__gap, 0px));
      background: var(--w3a-tree__connector__color);
    }

    /* Horizontal elbow from the vertical line into the label */
    .folder-children .row .indent::after {
      content: '';
      position: absolute;
      top: 50%;
      height: var(--w3a-tree__connector__thickness);
      /* Span from the vertical anchor across remaining indent and into the label */
      width: calc((var(--indent, 0) - var(--connector-indent, var(--indent, 0))) + var(--w3a-tree__connector__elbow-length));
      left: var(--connector-indent, var(--indent, 0));
      background: var(--w3a-tree__connector__color);
    }


    /*
     * For nested children (e.g., action args), clamp the connector anchor
     * to the first-level indent so indent=2 rows draw at indent=1.
     */
    .folder-children .folder-children .row {
      --connector-indent: 1rem;
    }

    /* Do not draw horizontal elbows for file content rows */
    .folder-children .row.file-row .indent::after {
      content: none;
    }

    /* If a row explicitly requests no elbow (e.g., hideLabel=true), hide it */
    .folder-children .row[data-no-elbow="true"] .indent::after {
      content: none;
    }

    /*
     * For the last child in a folder, shorten the vertical segment so it
     * stops at the elbow (renders └ instead of ├).
     */
    .folder-children > details:last-child > summary .indent::before {
      /* For the last child, stop at the elbow (midline),
         but still bridge any row gap below to avoid visual truncation */
      height: calc(50% + var(--w3a-tree__row__gap, 0px));
    }

    /* Top-level Transactions have no connector lines */

    /*
     * Do not draw connector lines for nodes under the last Action of each Transaction
     * (i.e., the actionNodes under that last Action folder)
     */
    .tooltip-tree-children > details > .folder-children > details:last-child .folder-children .row .indent::before,
    .tooltip-tree-children > details > .folder-children > details:last-child .folder-children .row .indent::after {
      content: none;
    }

    .file-content {
      box-sizing: var(--w3a-tree__file-content__box-sizing, border-box);
      margin: var(--w3a-tree__file-content__margin, 2px);
      padding: var(--w3a-tree__file-content__padding, 2px);
      border-radius: var(--w3a-tree__file-content__border-radius, 0.5rem);
      background: var(--w3a-tree__file-content__background, rgba(255, 255, 255, 0.06));
      max-height: var(--w3a-tree__file-content__max-height, 120px);
      /* Allow vertical resizing by user drag */
      resize: var(--w3a-tree__file-content__resize, vertical);
      min-height: var(--w3a-tree__file-content__min-height, 60px);
      /* Ensure file content obeys the provided TxTree width */
      width: var(--w3a-tree__file-content__width, auto);
      max-width: var(--w3a-tree__tooltip-tree-root__width, 345px);
      overflow: var(--w3a-tree__file-content__overflow, auto);
      color: var(--w3a-tree__file-content__color, #e2e8f0);
      font-family: var(--w3a-tree__file-content__font-family, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace);
      white-space: var(--w3a-tree__file-content__white-space, pre-wrap);
      word-break: var(--w3a-tree__file-content__word-break, break-word);
      line-height: var(--w3a-tree__file-content__line-height, 1.3);
      font-size: var(--w3a-tree__file-content__font-size, 0.7rem);
      box-shadow: var(--w3a-tree__file-content__box-shadow, none);
      /* pretty print JSON and text wrap */
      white-space: pre;
      text-wrap: auto;
      word-break: var(--w3a-tree__file-content__word-break, break-word);
    }

    .file-content::-webkit-scrollbar {
      width: var(--w3a-tree__file-content__scrollbar-width, 4px);
    }

    .file-content::-webkit-scrollbar-track {
      background: var(--w3a-tree__file-content__scrollbar-track__background, var(--w3a-color-surface, #f8fafc));
      border-radius: var(--w3a-tree__file-content__scrollbar-track__border-radius, 2px);
    }

    .file-content::-webkit-scrollbar-thumb {
      background: var(--w3a-tree__file-content__scrollbar-thumb__background, var(--w3a-color-border, #e2e8f0));
      border-radius: var(--w3a-tree__file-content__scrollbar-thumb__border-radius, 2px);
    }

    .folder-children {
      display: var(--w3a-tree__folder-children__display, block);
    }

    /* Highlighting styles for transaction details */
    .highlight-receiver-id {
      color: var(--w3a-tree__highlight-receiver-id__color, #ff6b6b);
      background: var(--w3a-tree__highlight-receiver-id__background, transparent);
      -webkit-background-clip: var(--w3a-tree__highlight-receiver-id__background-clip, none);
      -webkit-text-fill-color: var(--w3a-tree__highlight-receiver-id__text-fill-color, none);
      margin: 0px 4px;

      font-weight: var(--w3a-tree__highlight-receiver-id__font-weight, 600);
      text-decoration: var(--w3a-tree__highlight-receiver-id__text-decoration, none);
      padding: var(--w3a-tree__highlight-receiver-id__padding, 0);
      border-radius: var(--w3a-tree__highlight-receiver-id__border-radius, 0);
      box-shadow: var(--w3a-tree__highlight-receiver-id__box-shadow, none);
    }

    .highlight-method-name {
      color: var(--w3a-tree__highlight-method-name__color, #4ecdc4);
      background: var(--w3a-tree__highlight-method-name__background, transparent);
      -webkit-background-clip: var(--w3a-tree__highlight-method-name__background-clip, none);
      -webkit-text-fill-color: var(--w3a-tree__highlight-method-name__text-fill-color, none);
      margin: 0px 4px;

      font-weight: var(--w3a-tree__highlight-method-name__font-weight, 600);
      text-decoration: var(--w3a-tree__highlight-method-name__text-decoration, none);
      padding: var(--w3a-tree__highlight-method-name__padding, 0);
      border-radius: var(--w3a-tree__highlight-method-name__border-radius, 0);
      box-shadow: var(--w3a-tree__highlight-method-name__box-shadow, none);
    }

    .highlight-amount {
      color: var(--w3a-tree__highlight-amount__color, #4ecdc4);
      background: var(--w3a-tree__highlight-amount__background, transparent);
      -webkit-background-clip: var(--w3a-tree__highlight-amount__background-clip, none);
      -webkit-text-fill-color: var(--w3a-tree__highlight-amount__text-fill-color, none);
      margin: 0px 4px;

      font-weight: var(--w3a-tree__highlight-amount__font-weight, 600);
      text-decoration: var(--w3a-tree__highlight-amount__text-decoration, none);
      padding: var(--w3a-tree__highlight-amount__padding, 0);
      border-radius: var(--w3a-tree__highlight-amount__border-radius, 0);
      box-shadow: var(--w3a-tree__highlight-amount__box-shadow, none);
    }
  `;

  // Track which node IDs have recently been copied
  private _copied: Set<string> = new Set();
  private _copyTimers: Map<string, number> = new Map();
  private _animating: WeakSet<HTMLDetailsElement> = new WeakSet();

  private isCopied(id: string): boolean {
    return this._copied.has(id);
  }

  private async handleCopyClick(e: Event, node: TreeNode) {
    e.stopPropagation();
    const value = (node as any)?.copyValue as string | undefined;
    if (!value) return;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        const ta = document.createElement('textarea');
        ta.value = value;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); } catch {}
        try { document.body.removeChild(ta); } catch {}
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
    this.dispatchEvent(new CustomEvent('tree-toggled', { bubbles: true, composed: true }));
  }

  /**
   * Intercept summary clicks to run height animations for open/close.
   * Keeps native semantics by toggling details.open at the appropriate time.
   */
  private onSummaryClick = (e: Event) => {
    // Prevent native toggle so we can animate first
    e.preventDefault();
    e.stopPropagation();

    const summary = e.currentTarget as HTMLElement | null;
    if (!summary) return;

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
      try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
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
    body.style.overflow = 'hidden';
    body.style.height = '0px';
    details.open = true;

    requestAnimationFrame(() => {
      const target = `${body.scrollHeight}px`;
      body.style.transition = 'height 100ms cubic-bezier(0.2, 0.6, 0.2, 1)';
      body.style.height = target;

      const onEnd = (ev: TransitionEvent) => {
        if (ev.propertyName != 'height') return;
        body.removeEventListener('transitionend', onEnd);
        body.style.transition = '';
        body.style.height = 'auto';
        body.style.overflow = '';
        this._animating.delete(details);
        this.handleToggle();
      };
      body.addEventListener('transitionend', onEnd);
    });
  }

  private animateClose(details: HTMLDetailsElement, body: HTMLElement) {
    this._animating.add(details);
    const start = `${body.scrollHeight}px`;
    body.style.overflow = 'hidden';
    body.style.height = start;
    body.offsetHeight;
    requestAnimationFrame(() => {
      body.style.transition = 'height 100ms cubic-bezier(0.2, 0.6, 0.2, 1)';
      body.style.height = '0px';
      const onEnd = (ev: TransitionEvent) => {
        if (ev.propertyName != 'height') return;
        body.removeEventListener('transitionend', onEnd);
        details.open = false;
        body.style.transition = '';
        body.style.height = '';
        body.style.overflow = '';
        this._animating.delete(details);
        this.handleToggle();
      };
      body.addEventListener('transitionend', onEnd);
    });
  }

  protected getComponentPrefix(): string {
    return 'tree';
  }

  protected applyStyles(styles: TxTreeStyles): void {
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
        console.warn('[TxTree] Failed to register --border-angle:', e);
      }
    }
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
        case 'DeployContract':
          const codeSize = formatCodeSize(a.code);
          return `Deploying Contract of size ${codeSize}`;
        default: {
          const idxText = typeof treeNode.actionIndex === 'number' ? ` ${treeNode.actionIndex + 1}` : '';
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
      return html`${prefix}<span class="highlight-receiver-id">${receiverId}</span>`;
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
      const a = treeNode.action as any;
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
          return 'Deploying Contract';
        default: {
          const idxText = typeof treeNode.actionIndex === 'number' ? ` ${treeNode.actionIndex + 1}` : '';
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

    const indent = `${Math.max(0, depth - 1)}rem`;

    // If content exists, render a collapsible details with the content
    if (typeof node.content === 'string' && node.content.length > 0) {
      return html`
        <details class="tree-node file" ?open=${!!node.open}>
          <summary class="row summary-row"
            style="--indent: ${indent}"
            data-no-elbow="${!!node.hideLabel}"
            @click=${this.onSummaryClick}
          >
            <span class="indent"></span>
          <span class="label label-action-node" style="${node.hideLabel ? 'display: none;' : ''}">
            ${!node.hideChevron ? html`
              <svg class="chevron" viewBox="0 0 16 16" aria-hidden="true">
                <path fill="currentColor" d="M6 3l5 5-5 5z" />
              </svg>
            ` : ''}
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
          </summary>
          <div class="row file-row"
            style="--indent: ${indent}"
            data-no-elbow="${!!node.hideLabel}"
          >
            <span class="indent"></span>
            <div class="file-content">${node.content}</div>
          </div>
        </details>
      `;
    }
    // Plain file row without content
    return html`
      <div class="row file-row"
        style="--indent: ${indent}"
        data-no-elbow="${!!node.hideLabel}"
      >
        <span class="indent"></span>
        <span class="label label-action-node"
          style="${node.hideLabel ? 'display: none;' : ''}"
        >
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
    const indent = `${Math.max(0, depth - 1)}rem`;

    return html`
      <details class="tree-node folder" ?open=${!!node.open}>
        <summary class="row summary-row"
          style="--indent: ${indent}"
          data-no-elbow="${!!node.hideLabel}"
          @click=${this.onSummaryClick}
        >
          <span class="indent"></span>
          <span class="label" style="${node.hideLabel ? 'display: none;' : ''}">
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
      const rootStyle = this.class ? 'overflow:auto;max-height:40vh;' : '';
      // Render only the children as top-level entries
      content = html`
        <div class="tooltip-border-outer">
          <div class="tooltip-border-inner">
            <div class="tooltip-tree-root${extraClass}" style="${rootStyle}">
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

customElements.define('tx-tree', TxTree);

export default TxTree;
