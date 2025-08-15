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
 * Secure transaction confirmation component with multiple display variants.
 * Built with Lit for automatic XSS protection and reactive updates.
 */
export class SecureTxConfirmElement extends LitElement {
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
      /* Light Neumorphism color palette */
      --pk-color-bg: #e8ecf0;
      --pk-color-card: #e8ecf0;
      --pk-color-fg: #2d3748;
      --pk-color-muted: #718096;
      --pk-color-accent: #4299e1;
      --pk-color-accent-fg: #ffffff;
      --pk-color-danger: #f56565;
      --pk-color-warning: #ed8936;
      --pk-color-success: #48bb78;

      /* Light mode neumorphism shadows */
      --pk-shadow-light: #ffffff;
      --pk-shadow-dark: #bec3c9;
      --pk-shadow-inset-light: rgba(255, 255, 255, 0.55);
      --pk-shadow-inset-dark: rgba(190, 195, 201, 0.45);

      /* Neumorphism shadow effects */
      --pk-shadow-raised: 4px 4px 8px var(--pk-shadow-dark), -4px -4px 8px var(--pk-shadow-light);
      --pk-shadow-pressed: inset 2px 2px 4px var(--pk-shadow-inset-dark), inset -2px -2px 4px var(--pk-shadow-inset-light);
      --pk-shadow-flat: 1px 1px 2px var(--pk-shadow-dark), -1px -1px 2px var(--pk-shadow-light);
      --pk-shadow-hover: 6px 6px 12px var(--pk-shadow-dark), -6px -6px 12px var(--pk-shadow-light);

      --pk-font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      --pk-font-size: 15px;
      --pk-radius: 20px;
      --pk-radius-small: 12px;
      --pk-spacing: 16px;
      --pk-z-index: 2147483647;
      --pk-backdrop: rgba(232, 236, 240, 0.85);

      /* Component display */
      display: block;
      font-family: var(--pk-font-family);
      font-size: var(--pk-font-size);
      font-weight: 400;
      line-height: 1.6;
    }

    /* Reset and base styles */
    *,
    *::before,
    *::after {
      box-sizing: border-box;
    }

    /* Container variants */
    .container {
      color: var(--pk-color-fg);
    }

    .container.modal {
      position: fixed;
      inset: 0;
      display: grid;
      place-items: center;
      background: var(--pk-backdrop);
      z-index: var(--pk-z-index);
      backdrop-filter: blur(8px) saturate(1.2);
    }

    .container.fullscreen {
      position: fixed;
      inset: 0;
      background: var(--pk-color-bg);
      z-index: var(--pk-z-index);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: calc(var(--pk-spacing) * 2);
    }

    .container.toast {
      position: fixed;
      top: calc(var(--pk-spacing) * 2);
      right: calc(var(--pk-spacing) * 2);
      z-index: var(--pk-z-index);
      max-width: 420px;
      width: min(420px, calc(100vw - 4 * var(--pk-spacing)));
    }

    .container.inline {
      position: relative;
      display: block;
    }

    /* Card styles - Neumorphism */
    .card {
      background: var(--pk-color-card);
      color: var(--pk-color-fg);
      border-radius: var(--pk-radius);
      padding: calc(var(--pk-spacing) * 2);
      box-shadow: var(--pk-shadow-raised);
      border: none;
      animation: pk-enter 240ms ease-out;
      width: 100%;
      position: relative;
      overflow: hidden;
    }

    /* Subtle inner glow for depth */
    .card::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      border-radius: var(--pk-radius);
      padding: 1px;
      background: linear-gradient(135deg, rgba(255, 255, 255, 0.22), rgba(255, 255, 255, 0.06));
      mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
      mask-composite: xor;
      pointer-events: none;
    }

    .modal .card,
    .fullscreen .card {
      max-width: 600px;
      width: min(600px, 92vw);
    }

    .toast .card {
      max-width: none;
    }

    /* Variant styles - Light neumorphism */
    .card.warning {
      background: linear-gradient(135deg, #fff6eb, #fee7c2);
      box-shadow: var(--pk-shadow-raised), inset 0 1px 0 rgba(237, 137, 54, 0.1);
    }

    .card.warning::before {
      background: linear-gradient(135deg, rgba(237, 137, 54, 0.08), rgba(237, 137, 54, 0.02));
    }

    .card.danger {
      background: linear-gradient(135deg, #ffe5e5, #fccfdc);
      box-shadow: var(--pk-shadow-raised), inset 0 1px 0 rgba(245, 101, 101, 0.1);
    }

    .card.danger::before {
      background: linear-gradient(135deg, rgba(245, 101, 101, 0.08), rgba(245, 101, 101, 0.02));
    }

    /* Animations - Subtle */
    @keyframes pk-enter {
      from {
        transform: translateY(10px) scale(0.98);
        opacity: 0;
        box-shadow: var(--pk-shadow-flat);
      }
      to {
        transform: translateY(0) scale(1);
        opacity: 1;
        box-shadow: var(--pk-shadow-raised);
      }
    }

    @keyframes toast-slide-in {
      from {
        transform: translateX(100%) scale(0.9);
        opacity: 0;
        box-shadow: var(--pk-shadow-flat);
      }
      to {
        transform: translateX(0) scale(1);
        opacity: 1;
        box-shadow: var(--pk-shadow-raised);
      }
    }

    .toast .card {
      animation: toast-slide-in 400ms cubic-bezier(0.34, 1.56, 0.64, 1);
    }

    /* Content styles - Neumorphism */
    .header {
      margin: 0;
      font-size: 24px;
      font-weight: 600;
      letter-spacing: -0.5px;
      color: var(--pk-color-fg);
      margin-bottom: calc(var(--pk-spacing) * 1.5);
      text-shadow: 0.5px 0.5px 1px rgba(255, 255, 255, 0.4);
      position: relative;
      z-index: 1;
    }

    .toast .header {
      font-size: 20px;
      margin-bottom: var(--pk-spacing);
    }

    .grid {
      display: grid;
      gap: calc(var(--pk-spacing) * 0.85);
      grid-template-columns: 1fr;
      margin-bottom: calc(var(--pk-spacing) * 1.5);
      position: relative;
      z-index: 1;
    }

    .row {
      display: grid;
      grid-template-columns: 130px 1fr;
      align-items: start;
      gap: var(--pk-spacing);
      padding: calc(var(--pk-spacing) * 0.75);
      background: var(--pk-color-card);
      border-radius: var(--pk-radius-small);
      box-shadow: var(--pk-shadow-pressed);
    }

    .toast .row {
      grid-template-columns: 90px 1fr;
      gap: calc(var(--pk-spacing) * 0.75);
      padding: calc(var(--pk-spacing) * 0.5);
    }

    .label {
      color: var(--pk-color-muted);
      font-size: 0.85em;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      text-shadow: 0.5px 0.5px 1px rgba(255, 255, 255, 0.25);
    }

    .value {
      color: var(--pk-color-fg);
      word-break: break-word;
      font-weight: 500;
      text-shadow: 0.5px 0.5px 1px rgba(255, 255, 255, 0.15);
    }

    .fingerprint {
      color: var(--pk-color-danger);
      font-weight: 600;
      word-break: break-all;
      font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, monospace;
      font-size: 0.8em;
      background: linear-gradient(135deg, rgba(245, 101, 101, 0.1), rgba(245, 101, 101, 0.05));
      padding: 6px 10px;
      border-radius: 8px;
      box-shadow: var(--pk-shadow-pressed);
      text-shadow: none;
    }

    /* Actions section - Neumorphism */
    .actions-section {
      margin: calc(var(--pk-spacing) * 1.5) 0;
      position: relative;
      z-index: 1;
    }

    .actions-title {
      color: var(--pk-color-muted);
      font-size: 0.8em;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      margin-bottom: var(--pk-spacing);
      text-shadow: 1px 1px 2px rgba(255, 255, 255, 0.3);
    }

    .action-item {
      margin-bottom: var(--pk-spacing);
      background: var(--pk-color-card);
      border-radius: var(--pk-radius-small);
      box-shadow: var(--pk-shadow-pressed);
      overflow: hidden;
    }

    .action-item:last-child {
      margin-bottom: 0;
    }

    .action-header {
      color: var(--pk-color-muted);
      font-size: 0.75em;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      padding: calc(var(--pk-spacing) * 0.5) calc(var(--pk-spacing) * 0.75);
      background: linear-gradient(135deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.02));
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      text-shadow: 1px 1px 2px rgba(255, 255, 255, 0.2);
    }

    .action-content {
      background: linear-gradient(135deg, #f8fbfd, #eef3f7);
      color: var(--pk-color-fg);
      padding: calc(var(--pk-spacing) * 0.75);
      font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, monospace;
      font-size: 0.8em;
      line-height: 1.4;
      white-space: pre-wrap;
      word-break: break-word;
      max-height: 140px;
      overflow-y: auto;
      box-shadow: inset 1.5px 1.5px 3px var(--pk-shadow-inset-dark), inset -1.5px -1.5px 3px var(--pk-shadow-inset-light);
    }

    .action-content::-webkit-scrollbar {
      width: 6px;
    }

    .action-content::-webkit-scrollbar-track {
      background: rgba(190, 195, 201, 0.2);
      border-radius: 3px;
    }

    .action-content::-webkit-scrollbar-thumb {
      background: rgba(190, 195, 201, 0.5);
      border-radius: 3px;
    }

    .action-content::-webkit-scrollbar-thumb:hover {
      background: rgba(190, 195, 201, 0.7);
    }

    .toast .action-content {
      font-size: 0.7em;
      padding: calc(var(--pk-spacing) * 0.5);
      max-height: 100px;
    }

    /* Button styles - Neumorphism */
    .buttons {
      display: flex;
      gap: var(--pk-spacing);
      justify-content: flex-end;
      margin-top: calc(var(--pk-spacing) * 2);
      position: relative;
      z-index: 1;
    }

    .toast .buttons {
      gap: calc(var(--pk-spacing) * 0.75);
      margin-top: calc(var(--pk-spacing) * 1.25);
    }

    .btn {
      padding: calc(var(--pk-spacing) * 0.7) calc(var(--pk-spacing) * 1.35);
      border-radius: var(--pk-radius-small);
      cursor: pointer;
      border: none;
      font-family: var(--pk-font-family);
      font-size: 15px;
      font-weight: 600;
      transition: all 200ms cubic-bezier(0.34, 1.56, 0.64, 1);
      min-width: 100px;
      position: relative;
      overflow: hidden;
      text-shadow: 0.5px 0.5px 1px rgba(255, 255, 255, 0.15);
      box-shadow: var(--pk-shadow-raised);
      background: var(--pk-color-card);
      color: var(--pk-color-fg);
    }

    .btn::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      border-radius: var(--pk-radius-small);
      background: linear-gradient(135deg, rgba(255, 255, 255, 0.2), rgba(255, 255, 255, 0.05));
      opacity: 0;
      transition: opacity 200ms ease;
    }

    .btn:hover::before {
      opacity: 1;
    }

    .toast .btn {
      padding: calc(var(--pk-spacing) * 0.5) var(--pk-spacing);
      font-size: 14px;
      min-width: 80px;
    }

    .btn:hover {
      transform: translateY(-1px);
      box-shadow: var(--pk-shadow-raised);
    }

    .btn:active {
      transform: translateY(0);
      box-shadow: var(--pk-shadow-flat);
    }

    .btn-cancel {
      background: linear-gradient(135deg, #f7fafc, #edf2f7);
      color: var(--pk-color-muted);
    }

    .btn-cancel:hover {
      color: var(--pk-color-fg);
    }

    .btn-confirm {
      background: linear-gradient(135deg, var(--pk-color-accent), #3182ce);
      color: var(--pk-color-accent-fg);
      text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.2);
    }

    .btn-confirm:hover {
      background: linear-gradient(135deg, #3a87cf, #2f63a9);
    }

    .btn-confirm.warning {
      background: linear-gradient(135deg, var(--pk-color-warning), #e07a2b);
    }

    .btn-confirm.warning:hover {
      background: linear-gradient(135deg, #dd7629, #c35f26);
    }

    .btn-confirm.danger {
      background: linear-gradient(135deg, var(--pk-color-danger), #ec5151);
    }

    .btn-confirm.danger:hover {
      background: linear-gradient(135deg, #e65252, #cd3a3a);
    }

    .btn:focus-visible {
      outline: 2px solid var(--pk-color-accent);
      outline-offset: 3px;
      box-shadow: var(--pk-shadow-raised), 0 0 0 3px rgba(66, 153, 225, 0.3);
    }

    /* Responsive adjustments - Maintain neumorphism */
    @media (max-width: 640px) {
      .modal .card,
      .fullscreen .card {
        width: 95vw;
        max-width: none;
        padding: calc(var(--pk-spacing) * 1.5);
      }

      .header {
        font-size: 22px;
        margin-bottom: var(--pk-spacing);
      }

      .row {
        grid-template-columns: 1fr;
        gap: calc(var(--pk-spacing) * 0.5);
        padding: var(--pk-spacing);
      }

      .label {
        font-size: 0.75em;
        margin-bottom: 2px;
      }

      .buttons {
        flex-direction: column-reverse;
        gap: calc(var(--pk-spacing) * 0.75);
      }

      .btn {
        width: 100%;
        padding: var(--pk-spacing) calc(var(--pk-spacing) * 1.25);
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
      border: 2px solid var(--pk-color-muted);
      border-radius: 50%;
      border-top-color: var(--pk-color-accent);
      animation: pk-spin 1s ease-in-out infinite;
      margin-right: 8px;
    }

    @keyframes pk-spin {
      to { transform: rotate(360deg); }
    }

    .btn.loading {
      pointer-events: none;
      opacity: 0.8;
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

    const cardClasses = classMap({
      card: true,
      [this.variant]: this.variant !== 'default',
    });

    const confirmBtnClasses = classMap({
      'btn': true,
      'btn-confirm': true,
      [this.variant]: this.variant !== 'default',
    });

    return html`
      <div class=${containerClasses}>
        <div class=${cardClasses}>
          <h2 class="header">${this.title}</h2>

          <div class="grid">
            <div class="row">
              <div class="label">To</div>
              <div class="value">${this.to}</div>
            </div>

            <div class="row">
              <div class="label">Amount</div>
              <div class="value">${this.amount}</div>
            </div>

            ${when(this.method, () => html`
              <div class="row">
                <div class="label">Method</div>
                <div class="value">${this.method}</div>
              </div>
            `)}

            ${when(this.fingerprint, () => html`
              <div class="row">
                <div class="label">Fingerprint</div>
                <div class="fingerprint">${this.fingerprint}</div>
              </div>
            `)}
          </div>

          ${when(this.actions.length > 0, () => html`
            <div class="actions-section">
              <div class="actions-title">Transaction Actions</div>
              ${this.actions.map((action, index) => html`
                <div class="action-item">
                  <div class="action-header">Action ${index + 1}</div>
                  <div class="action-content">${JSON.stringify(action, null, 2)}</div>
                </div>
              `)}
            </div>
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
customElements.define('passkey-confirm', SecureTxConfirmElement);

