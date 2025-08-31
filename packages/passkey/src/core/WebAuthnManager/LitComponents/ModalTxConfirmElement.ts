import { LitElement, html, css } from 'lit';
import { classMap } from 'lit/directives/class-map.js';
import { when } from 'lit/directives/when.js';
import { TransactionInputWasm, ActionArgsWasm } from '../../types';
import { formatArgs, formatDeposit, formatGas } from './common/formatters';

export type ConfirmRenderMode = 'inline' | 'modal' | 'fullscreen' | 'toast';
export type ConfirmVariant = 'default' | 'warning' | 'danger';

export interface SecureTxSummary {
  to?: string;
  totalAmount?: string;
  method?: string;
  fingerprint?: string; // short digest for display
}

// TxAction from wasm-worker
export interface TxAction {
  action_type: string;
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
    totalAmount: { type: String },
    method: { type: String },
    fingerprint: { type: String },
    title: { type: String },
    cancelText: { type: String },
    confirmText: { type: String },
    txSigningRequests: { type: Array },
    loading: { type: Boolean },
    _isVisible: { type: Boolean, state: true },
    _isAnimating: { type: Boolean, state: true }
  };

  mode: ConfirmRenderMode = 'modal';
  variant: ConfirmVariant = 'default';

  totalAmount = '';
  method = '';
  fingerprint = '';
  title = 'Sign Transaction';
  cancelText = 'Cancel';
  confirmText = 'Confirm & Sign';
  txSigningRequests: TransactionInputWasm[] = [];
  loading = false;
  // When true, this element will NOT remove itself on confirm/cancel.
  // The host is responsible for sending a CLOSE_MODAL instruction.
  deferClose = false;

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
      background: rgba(0, 0, 0, 0.5);
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
      margin: 0;
      position: relative;
      z-index: 1;
    }

    .grid {
      display: grid;
      gap: 0.5rem;
      grid-template-columns: 1fr;
      margin-top: var(--w3a-gap-2);
      margin-bottom: var(--w3a-gap-2);
      position: relative;
      z-index: 1;
      animation: content-enter 200ms cubic-bezier(0.2, 0.6, 0.2, 1) both;
    }

    .row {
      display: grid;
      grid-template-columns: 115px 1fr;
      align-items: center;
      gap: var(--w3a-gap-2);
      background: transparent;
      border-radius: 0;
      transition: all 160ms cubic-bezier(0.2, 0.6, 0.2, 1);
      position: relative;
      overflow: hidden;
    }

    .label {
      color: var(--w3a-color-text-secondary);
      font-size: var(--w3a-font-size-sm);
      font-weight: 500;
    }

    .value {
      color: var(--w3a-color-text);
      font-size: var(--w3a-font-size-sm);
      font-weight: 500;
      word-break: break-word;
    }

    /* Summary section */
    .summary-section {
      position: relative;
      z-index: 1;
      animation: content-enter 200ms cubic-bezier(0.2, 0.6, 0.2, 1) both;
    }

    /* Actions section */
    .actions-section {
      margin: .75rem 0;
      position: relative;
      z-index: 1;
      animation: content-enter 200ms cubic-bezier(0.2, 0.6, 0.2, 1) both;
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
      padding: 1rem;
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
      letter-spacing: 0.8px;
      margin-bottom: var(--w3a-gap-3);
    }

    .action-item {
      margin-bottom: var(--w3a-gap-2);
      overflow: hidden;
      transition: all 160ms cubic-bezier(0.2, 0.6, 0.2, 1);
      position: relative;
    }

    .action-item:last-child {
      margin-bottom: 0;
    }

    .action-row {
      display: grid;
      grid-template-columns: 100px 1fr;
      align-items: center;
      gap: var(--w3a-gap-2);
      padding: 0;
      margin-bottom: 0;
      background: transparent;
      border-radius: 0;
      transition: all 160ms cubic-bezier(0.2, 0.6, 0.2, 1);
    }

    .action-row:last-child {
      margin-bottom: 0;
    }

    .action-label {
      font-family: var(--w3a-font-family);
      color: var(--w3a-color-text-secondary);
      font-size: 0.75rem;
      line-height: 1.5;
      font-weight: 500;
      letter-spacing: 0.02em;
    }

    .action-content {
      padding: 0.25rem 0rem 0rem 0rem;
      font-size: var(--w3a-font-size-sm);
      line-height: 1.4;
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

    .action-value {
      color: var(--w3a-color-text);
      word-break: break-word;
      font-weight: 500;
      font-size: 0.75rem;
    }

    .action-subitem {
      margin-bottom: 0.5rem;
      padding: 0rem 0rem 0rem 1rem;
      background: var(--w3a-color-background);
      position: relative;
    }

    .action-subitem:last-child {
      margin-bottom: 0;
    }

    .action-subheader {
      font-size: var(--w3a-font-size-sm);
      font-weight: 600;
      color: var(--w3a-color-primary);
    }

    .code-block {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
      font-size: 0.75rem;
      background: #f8fafc;
      border: 1px solid #e0e0e0;
      border-radius: var(--w3a-radius-md);
      padding: 8px;
      white-space: pre;
      word-break: normal;
      overflow: auto;
      line-height: 1.4;
      margin: 0.25rem 0rem 0rem 0rem;
      min-height: calc(1.eem * 3);
      max-height: 400px;
      height: auto;
    }

    .method-name {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
      font-weight: 600;
      color: var(--w3a-color-primary);
    }

    /* Button styles */
    .buttons {
      display: flex;
      gap: var(--w3a-gap-3);
      justify-content: flex-end;
      margin-top: var(--w3a-gap-2);
      position: relative;
      z-index: 1;
      animation: content-enter 200ms cubic-bezier(0.2, 0.6, 0.2, 1) both;
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

    /* Content Animation */
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
        gap: .25rem;
        padding: 0.75rem;
      }

      .label {
        font-size: 0.75em;
        margin-bottom: 2px;
      }

      .action-row {
        grid-template-columns: 1fr;
        gap: .25rem;
        padding: 0.5rem;
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
      'content': true,
      [this.variant]: this.variant !== 'default',
    });

    const confirmBtnClasses = classMap({
      'btn': true,
      'btn-confirm': true,
      [this.variant]: this.variant !== 'default',
    });

    const displayTotalAmount = !(this.totalAmount === '0' || this.totalAmount === '');

    return html`
      <div class=${containerClasses}>
        <div class=${contentClasses}>

          <div class="actions-section">
            <div class="action-outer">
              <div class="action-list">
                <h2 class="header">${this.title}</h2>

                <!-- Transaction Summary Section -->
                ${when(displayTotalAmount, () => html`
                  <div class="summary-section">
                    <div class="grid">
                      <div class="row">
                        <div class="label">Total Sent</div>
                        <div class="value">${formatDeposit(this.totalAmount)}</div>
                      </div>
                    </div>
                  </div>
                `)}

                <!-- TxSigningRequests Section -->
                ${when(this.txSigningRequests.length > 0, () => html`
                  ${this.txSigningRequests.map((tx, txIndex) => {
                    // Parse actions from the transaction payload (supports string or already-parsed array)
                    let actions: ActionArgsWasm[] = tx.actions;
                    return html`
                      <div class="action-item">
                        <div class="action-content">
                          <!-- Transaction Receiver (only show for first action) -->
                          ${actions.length > 0 ? html`
                            <div class="action-subheader">
                              <div class="action-label">Transaction(${txIndex + 1}) to <span class="method-name">${tx.receiverId}</span></div>
                            </div>
                          ` : ''}
                          <!-- Actions for this transaction -->
                          ${actions.map((action, actionIndex) => html`
                            <div class="action-subitem">
                              ${this._renderActionDetails(action)}
                            </div>
                          `)}
                        </div>
                      </div>
                    `;
                  })}
                `)}

                <div class="buttons">
                  ${this.loading ? html`
                    <!-- Loading mode: show only cancel button with loading indicator -->
                    <button
                      class="btn btn-cancel loading"
                      @click=${this._handleCancel}
                    >
                      <span class="loading-indicator"></span>
                      Signing
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

  private _renderActionDetails(action: ActionArgsWasm) {
    if (action.action_type === 'CreateAccount') {
      return html`
        <div class="action-row">
          <div class="action-label">Action</div>
          <div class="action-value">Create Account</div>
        </div>
      `;
    }
    if (action.action_type === 'DeployContract') {
      const code = action.code;
      const sizeLabel = (() => {
        if (!code) return '0 bytes';
        if (code instanceof Uint8Array) return `${code.byteLength} bytes`;
        if (Array.isArray(code)) return `${code.length} bytes`;
        return 'unknown';
      })();
      return html`
        <div class="action-row">
          <div class="action-label">Action</div>
          <div class="action-value">Deploy Contract</div>
        </div>
        <div class="action-row">
          <div class="action-label">Code Size</div>
          <div class="action-value">${sizeLabel}</div>
        </div>
      `;
    }
    if (action.action_type === 'FunctionCall') {
      return html`
        ${when(action.deposit && action.deposit !== '0', () => {
          return html`
            <div class="action-row">
              <div class="action-label">Deposit</div>
              <div class="action-value">${formatDeposit(action.deposit)}</div>
            </div>
          `
        })}
        ${when(action.args, () => {
          return html`
            <div class="action-label">Calling <span class="method-name">${action.method_name}</span> using <span class="method-name">${
formatGas(action.gas)}</span>
            </div>
            <pre class="code-block"><code>${formatArgs(action.args)}</code></pre>
          `;
        })}
      `;
    }
    if (action.action_type === 'Transfer') {
      return html`
        <div class="action-row">
          <div class="action-label">Action</div>
          <div class="action-value">Transfer</div>
        </div>
        <div class="action-row">
          <div class="action-label">Amount</div>
          <div class="action-value">${formatDeposit(action.deposit)}</div>
        </div>
      `;
    }
    if (action.action_type === 'Stake') {
      return html`
        <div class="action-row">
          <div class="action-label">Action</div>
          <div class="action-value">Stake</div>
        </div>
        <div class="action-row">
          <div class="action-label">Public Key</div>
          <div class="action-value">${action.public_key || ''}</div>
        </div>
        <div class="action-row">
          <div class="action-label">Amount</div>
          <div class="action-value">${formatDeposit(action.stake || '')}</div>
        </div>
      `;
    }
    if (action.action_type === 'AddKey') {
      const accessKey = JSON.parse(action.access_key);
      const permissions = 'FullAccess' in Object.keys(accessKey.permission)
        ? 'Full Access'
        : 'Function Call';
      return html`
        <div class="action-row">
          <div class="action-label">Action</div>
          <div class="action-value">Add Key</div>
        </div>
        <div class="action-row">
          <div class="action-label">Public Key</div>
          <div class="action-value">${action.public_key || ''}</div>
        </div>
        <div class="action-row">
          <div class="action-label">Access Key</div>
          <div class="action-value">${permissions}</div>
        </div>
      `;
    }
    if (action.action_type === 'DeleteKey') {
      return html`
        <div class="action-row">
          <div class="action-label">Action</div>
          <div class="action-value">Delete Key</div>
        </div>
        <div class="action-row">
          <div class="action-label">Public Key</div>
          <div class="action-value">${action.public_key || ''}</div>
        </div>
      `;
    }
    if (action.action_type === 'DeleteAccount') {
      return html`
        <div class="action-row">
          <div class="action-label">Action</div>
          <div class="action-value">Delete Account</div>
        </div>
        <div class="action-row">
          <div class="action-label">Beneficiary</div>
          <div class="action-value">${action.beneficiary_id || ''}</div>
        </div>
      `;
    }
    // Fallback: show raw JSON for unknown/extended actions
    let raw = '';
    try {
      raw = JSON.stringify(action, null, 2);
    } catch {
      raw = String(action);
    }
    return html`
      <div class="action-row">
        <div class="action-label">Action</div>
        <div class="action-value">Unknown</div>
      </div>
      <div class="action-row">
        <div class="action-label">Data</div>
        <div class="action-value"><pre class="code-block"><code>${raw}</code></pre></div>
      </div>
    `;
  }

  private _handleCancel() {
    try { this.dispatchEvent(new CustomEvent('w3a:cancel', { bubbles: true, composed: true })); } catch {}
    if (!this.deferClose) {
      this._resolveAndCleanup(false);
    }
  }

  private _handleConfirm() {
    try { this.dispatchEvent(new CustomEvent('w3a:confirm', { bubbles: true, composed: true })); } catch {}
    if (!this.deferClose) {
      this._resolveAndCleanup(true);
    }
  }

  private _resolveAndCleanup(confirmed: boolean) {
    const resolve = activeResolvers.get(this);
    if (resolve) {
      resolve(confirmed);
      activeResolvers.delete(this);
      this.remove();
    }
  }

  // Public method for two-phase close from host/bootstrap
  close(confirmed: boolean) {
    this._resolveAndCleanup(confirmed);
  }

}

// Register the custom element
customElements.define('passkey-modal-confirm', ModalTxConfirmElement);
