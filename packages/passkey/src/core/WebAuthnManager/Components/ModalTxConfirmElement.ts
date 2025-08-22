import { LitElement, html, css } from 'lit';
import { classMap } from 'lit/directives/class-map.js';
import { when } from 'lit/directives/when.js';

export type ConfirmRenderMode = 'inline' | 'modal' | 'fullscreen' | 'toast';
export type ConfirmVariant = 'default' | 'warning' | 'danger';

export interface SecureTxSummary {
  to?: string;
  amount?: string;
  method?: string;
  fingerprint?: string; // short digest for display
}

export interface TxAction {
  actionType: string;
  method_name?: string;
  args?: string;
  gas?: string;
  deposit?: string;
  [key: string]: any;
}

// Store active promise resolvers in a WeakMap to prevent memory leaks
// This is used by the mount functions in ./index.ts
export const activeResolvers = new WeakMap<HTMLElement, (value: boolean) => void>();

/**
 * Modal transaction confirmation component with multiple display variants.
 * Built with Lit for automatic XSS protection and reactive updates.
 */
export class ModalTxConfirmElement extends LitElement {
  // Component properties (automatically reactive)
  static properties = {
    mode: { type: String },
    variant: { type: String },
    to: { type: String },
    amount: { type: String },
    method: { type: String },
    fingerprint: { type: String },
    title: { type: String },
    cancelText: { type: String },
    confirmText: { type: String },
    actions: { type: Array },
    loading: { type: Boolean },
    _isVisible: { type: Boolean, state: true },
    _isAnimating: { type: Boolean, state: true }
  };

  mode: ConfirmRenderMode = 'modal';
  variant: ConfirmVariant = 'default';
  to = '';
  amount = '';
  method = '';
  fingerprint = '';
  title = 'Confirm Transaction';
  cancelText = 'Cancel';
  confirmText = 'Confirm & Sign';
  actions: TxAction[] = [];
  loading = false;

  // Internal state
  private _isVisible = false;
  private _isAnimating = false;

  // Closed Shadow DOM for security
  static shadowRootOptions: ShadowRootInit = { mode: 'closed' };

  static styles = css`
    :host {
      /* Style-guide variables */
      --w3a-color-primary: #2A52BE;
      --w3a-color-secondary: #6F8DDF;
      --w3a-color-success: #10b981;
      --w3a-color-warning: #f59e0b;
      --w3a-color-error: #ef4444;
      --w3a-color-background: #ffffff;
      --w3a-color-surface: #f8fafc;
      --w3a-color-border: #e2e8f0;
      --w3a-color-text: #1e293b;
      --w3a-color-text-secondary: #64748b;

      --w3a-font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      --w3a-font-size-sm: 0.875rem;
      --w3a-font-size-base: 1rem;
      --w3a-font-size-lg: 1.125rem;
      --w3a-font-size-xl: 1.25rem;

      --w3a-radius-sm: 0.375rem;
      --w3a-radius-md: 0.5rem;
      --w3a-radius-lg: 0.75rem;
      --w3a-radius-xl: 1rem;

      --w3a-gap-2: 0.5rem;
      --w3a-gap-3: 0.75rem;
      --w3a-gap-4: 1rem;
      --w3a-gap-6: 1.5rem;

      --w3a-shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
      --w3a-shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1);

      /* Component display */
      display: block;
      font-family: var(--w3a-font-family);
      font-size: var(--w3a-font-size-base);
      line-height: 1.5;
      color: var(--w3a-color-text);
      background-color: var(--w3a-color-background);
    }

    /* Reset and base styles */
    *,
    *::before,
    *::after {
      box-sizing: border-box;
    }

    /* Container variants */
    .container {
      color: var(--w3a-color-text);
    }

    .container.modal {
      position: fixed;
      inset: 0;
      display: grid;
      place-items: center;
      background: rgba(0, 0, 0, 0.15);
      z-index: 2147483647;
      backdrop-filter: blur(8px);
      animation: backdrop-enter 200ms cubic-bezier(0.2, 0.6, 0.2, 1);
    }



    /* Animations */
    @keyframes backdrop-enter {
      from {
        opacity: 0;
        backdrop-filter: blur(0px);
      }
      to {
        opacity: 1;
        backdrop-filter: blur(8px);
      }
    }

    @keyframes card-enter {
      from {
        transform: translateY(20px) scale(0.95);
        opacity: 0;
      }
      to {
        transform: translateY(0) scale(1);
        opacity: 1;
      }
    }

    .header {
      margin: 0;
      font-size: var(--w3a-font-size-xl);
      line-height: 1.3;
      font-weight: 600;
      color: var(--w3a-color-text);
      margin-bottom: var(--w3a-gap-6);
      position: relative;
      z-index: 1;
      animation: text-enter 200ms cubic-bezier(0.2, 0.6, 0.2, 1) 0.1s both;
    }

    .grid {
      display: grid;
      gap: var(--w3a-gap-3);
      grid-template-columns: 1fr;
      margin-bottom: var(--w3a-gap-3);
      position: relative;
      z-index: 1;
      animation: content-enter 200ms cubic-bezier(0.2, 0.6, 0.2, 1) 0.2s both;
    }

    .row {
      display: grid;
      grid-template-columns: 130px 1fr;
      align-items: start;
      gap: var(--w3a-gap-3);
      padding: var(--w3a-gap-2);
      background: var(--w3a-color-surface);
      border: 1px solid var(--w3a-color-border);
      border-radius: var(--w3a-radius-lg);
      transition: all 160ms cubic-bezier(0.2, 0.6, 0.2, 1);
      position: relative;
      overflow: hidden;
    }

    .label {
      font-family: var(--w3a-font-family);
      color: var(--w3a-color-text-secondary);
      font-size: var(--w3a-font-size-sm);
      line-height: 1.5;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.02em;
    }

    .value {
      color: var(--w3a-color-text);
      word-break: break-word;
      font-weight: 500;
    }

    /* Actions section */
    .actions-section {
      margin: .75rem 0;
      position: relative;
      z-index: 1;
      animation: content-enter 200ms cubic-bezier(0.2, 0.6, 0.2, 1) 0.3s both;
    }

    /* Outer glass border wrapper around actions (double border design) */
    .action-outer {
      background: transparent;
      backdrop-filter: blur(2px);
      -webkit-backdrop-filter: blur(2px);
      border: 8px solid rgba(255, 255, 255, 0.35);
      border-radius: 24px;
    }

    /* Action list wrapper - style-guide animated border */
    .action-list {
      --border-angle: 0deg;
      background: linear-gradient(#ffffff, #ffffff) padding-box,
        conic-gradient(
          from var(--border-angle),
          rgba(0, 0, 0, 0.0) 0%,
          rgba(0, 0, 0, 0.35) 10%,
          rgba(0, 0, 0, 0.0) 20%,
          rgba(0, 0, 0, 0.0) 100%
        ) border-box;
      border: 1px solid transparent;
      border-radius: 1rem;
      height: 100%;
      padding: 0.5rem;
      overflow: hidden;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
      position: relative;
      animation: border-angle-rotate 4s infinite linear;
    }

    @property --border-angle {
      syntax: "<angle>";
      initial-value: 0deg;
      inherits: false;
    }

    @keyframes border-angle-rotate {
      from { --border-angle: 0deg; }
      to { --border-angle: 360deg; }
    }

    .actions-title {
      color: var(--w3a-color-text-secondary);
      font-size: var(--w3a-font-size-sm);
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      margin-bottom: var(--w3a-gap-3);
    }

    .action-item {
      margin-bottom: var(--w3a-gap-3);
      overflow: hidden;
      transition: all 160ms cubic-bezier(0.2, 0.6, 0.2, 1);
    }

    .action-item:last-child {
      margin-bottom: 0;
    }

    .action-header {
      font-size: var(--w3a-font-size-sm);
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      padding: calc(var(--w3a-gap-2) * 0.5) var(--w3a-gap-2);
    }

    .action-content {
      padding: var(--w3a-gap-2);
      font-size: var(--w3a-font-size-sm);
      line-height: 1.4;
      max-height: 400px;
      overflow-y: auto;
    }

    .code-block {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
      background: #f8fafc;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      padding: 8px;
      white-space: pre;
      word-break: normal;
      overflow: auto;
      line-height: 1.4;
      margin: 4px 0 0 0;
      min-height: calc(1.4em * 3);
      max-height: 400px;
      height: auto;
    }

    .action-content::-webkit-scrollbar {
      width: 6px;
    }

    .action-content::-webkit-scrollbar-track {
      background: var(--w3a-color-background);
      border-radius: 3px;
    }

    .action-content::-webkit-scrollbar-thumb {
      background: var(--w3a-color-border);
      border-radius: 3px;
    }

    /* Button styles */
    .buttons {
      display: flex;
      gap: var(--w3a-gap-3);
      justify-content: flex-end;
      margin-top: var(--w3a-gap-3);
      position: relative;
      z-index: 1;
      animation: content-enter 200ms cubic-bezier(0.2, 0.6, 0.2, 1) 0.4s both;
    }

    .toast .buttons {
      gap: .75rem;
      margin-top: 1.5rem;
    }

    .btn {
      background-color: var(--w3a-color-background);
      box-shadow: var(--w3a-shadow-sm);
      color: var(--w3a-color-text);
      text-align: center;
      border-radius: var(--w3a-radius-lg);
      justify-content: center;
      align-items: center;
      height: 2.5rem;
      padding: var(--w3a-gap-3);
      font-size: var(--w3a-font-size-base);
      display: flex;
      cursor: pointer;
      border: 1px solid var(--w3a-color-border);
      font-family: var(--w3a-font-family);
      font-weight: 500;
      transition: all 160ms cubic-bezier(0.2, 0.6, 0.2, 1);
      min-width: 100px;
      position: relative;
      overflow: hidden;
    }

    .btn:hover {
      background-color: var(--w3a-color-surface);
      box-shadow: var(--w3a-shadow-md);
    }

    .btn:active {
      background-color: var(--w3a-color-border);
      transform: translateY(1px);
    }

    .btn-cancel {
      box-shadow: none;
      color: var(--w3a-color-text);
      background-color: transparent;
      border-color: transparent;
    }

    .btn-cancel:hover {
      color: var(--w3a-color-text);
      background-color: var(--w3a-color-surface);
      border-color: var(--w3a-color-border);
    }

    .btn-confirm {
      background-color: var(--w3a-color-primary);
      color: var(--w3a-color-background);
      border-color: var(--w3a-color-primary);
    }

    .btn-confirm:hover {
      background-color: #456CD6;
      border-color: #456CD6;
    }

    .btn-confirm.warning {
      background-color: var(--w3a-color-warning);
      color: var(--w3a-color-background);
      border-color: var(--w3a-color-warning);
    }

    .btn-confirm.danger {
      background-color: var(--w3a-color-error);
      color: var(--w3a-color-background);
      border-color: var(--w3a-color-error);
    }

    .btn-confirm.warning:hover,
    .btn-confirm.danger:hover {
      opacity: 0.9;
    }

    .btn:focus-visible {
      outline: 2px solid var(--w3a-color-primary);
      outline-offset: 3px;
      box-shadow: 0 0 0 3px rgba(42, 82, 190, 0.18);
    }

    /* Text Animations */
    @keyframes text-enter {
      from {
        opacity: 0;
        transform: translateY(10px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    @keyframes content-enter {
      from {
        opacity: 0;
        transform: translateY(15px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    /* Responsive adjustments */
    @media (max-width: 640px) {

      .header {
        font-size: 22px;
        margin-bottom: 1rem;
      }

      .row {
        grid-template-columns: 1fr;
        gap: .5rem;
        padding: 1rem;
      }

      .label {
        font-size: 0.75em;
        margin-bottom: 2px;
      }

      .buttons {
        flex-direction: column-reverse;
        gap: .75rem;
      }

      .btn {
        width: 100%;
        padding: 1rem 1.25rem;
      }

      .action-content {
        font-size: 0.75em;
        max-height: 100px;
      }
    }

    /* Loading indicator styles */
    .loading-indicator {
      display: inline-block;
      width: 16px;
      height: 16px;
      border: 2px solid var(--w3a-color-border);
      border-radius: 50%;
      border-top-color: var(--w3a-color-primary);
      animation: spin 1s ease-in-out infinite;
      margin-right: 8px;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .btn.loading {
      pointer-events: none;
      opacity: 0.8;
    }

    /* Fallback support for browsers without backdrop-filter */
    @supports not (backdrop-filter: blur(8px)) {
      .row { background: var(--w3a-color-surface); }
      .action-item { background: var(--w3a-color-background); }
      .action-content { background: var(--w3a-color-surface); }
      .btn { background: var(--w3a-color-background); }
      .btn-confirm { background: var(--w3a-color-primary); }
    }
  `;

  connectedCallback() {
    super.connectedCallback();
    this._isVisible = true;
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    // Clean up if element is removed without user interaction
    const resolve = activeResolvers.get(this);
    if (resolve) {
      resolve(false); // Default to cancel
      activeResolvers.delete(this);
    }
  }

  render() {
    const containerClasses = classMap({
      container: true,
      [this.mode]: true,
    });

    const contentClasses = classMap({
      [this.variant]: this.variant !== 'default',
    });

    const confirmBtnClasses = classMap({
      'btn': true,
      'btn-confirm': true,
      [this.variant]: this.variant !== 'default',
    });

    return html`
      <div class=${containerClasses}>
        <div class=${contentClasses}>
          <div class="actions-section">
            <div class="action-outer">
              <div class="action-list">
              ${when(this.actions.length > 0, () => html`
                ${this.actions.map((action, index) => html`
                  <div class="action-item">
                    <div class="action-header">Action ${index + 1}</div>
                    <div class="action-content">
                      <pre class="code-block"><code>${JSON.stringify(action, null, 2)}</code></pre>
                    </div>
                  </div>
                `)}
              `)}
                <div class="buttons">
                  ${this.loading ? html`
                    <!-- Loading mode: show only cancel button with loading indicator -->
                    <button
                      class="btn btn-cancel loading"
                      @click=${this._handleCancel}
                    >
                      <span class="loading-indicator"></span>
                      ${this.cancelText}
                    </button>
                  ` : html`
                    <!-- Normal mode: show both cancel and confirm buttons -->
                    <button
                      class="btn btn-cancel"
                      @click=${this._handleCancel}
                    >
                      ${this.cancelText}
                    </button>
                    <button
                      class=${confirmBtnClasses}
                      @click=${this._handleConfirm}
                    >
                      ${this.confirmText}
                    </button>
                  `}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private _handleCancel() {
    this._resolveAndCleanup(false);
  }

  private _handleConfirm() {
    this._resolveAndCleanup(true);
  }

  private _resolveAndCleanup(confirmed: boolean) {
    const resolve = activeResolvers.get(this);
    if (resolve) {
      resolve(confirmed);
      activeResolvers.delete(this);
      this.remove();
    }
  }
}

// Register the custom element
customElements.define('passkey-modal-confirm', ModalTxConfirmElement);

