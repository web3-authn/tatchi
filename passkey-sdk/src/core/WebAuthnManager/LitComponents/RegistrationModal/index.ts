import { html, css } from 'lit';
import { LitElementWithProps } from '../LitElementWithProps';

export type RegistrationTheme = 'dark' | 'light';

export class RegistrationModalElement extends LitElementWithProps {
  static properties = {
    open: { type: Boolean, reflect: true },
    theme: { type: String },
    title: { type: String },
    subtitle: { type: String },
    accountId: { type: String, attribute: 'account-id' },
    confirmText: { type: String, attribute: 'confirm-text' },
    cancelText: { type: String, attribute: 'cancel-text' },
    loading: { type: Boolean },
    errorMessage: { type: String },
  } as const;

  declare open: boolean;
  declare theme: RegistrationTheme;
  declare title: string;
  declare subtitle?: string;
  declare accountId?: string;
  declare confirmText: string;
  declare cancelText: string;
  declare loading: boolean;
  declare errorMessage?: string;

  static styles = css`
    :host {
      display: contents;
    }
    .overlay {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.45);
      z-index: 2147483646;
      display: none;
    }
    :host([open]) .overlay { display: block; }
    .panel {
      position: fixed;
      inset: 0;
      display: grid;
      place-items: center;
      z-index: 2147483647;
      pointer-events: none;
    }
    .card {
      pointer-events: auto;
      width: min(520px, 92vw);
      border-radius: 14px;
      background: var(--w3a-modal__card__background, #111);
      color: var(--w3a-modal__card__color, #f6f7f8);
      box-shadow: 0 12px 32px rgba(0,0,0,0.35);
      border: 1px solid var(--w3a-modal__card__border, rgba(255,255,255,0.08));
      padding: 20px 22px;
    }
    .title { font-size: 18px; font-weight: 700; margin: 0 0 6px; }
    .subtitle { font-size: 14px; opacity: 0.85; margin: 0 0 12px; }
    .account { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 14px; opacity: 0.92; margin-bottom: 8px; }
    .actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 14px; }
    button {
      border: 0; border-radius: 8px; padding: 10px 14px; font-weight: 600; cursor: pointer;
    }
    .cancel { background: #2b2b2b; color: #ddd; }
    .confirm { background: #4DAFFE; color: #0b1220; }
    .loading { opacity: 0.7; pointer-events: none; }
    .error { color: #ff7a7a; font-size: 13px; margin-top: 8px; }
    :host([theme="light"]) .card { background: #fff; color: #181a1f; border-color: rgba(0,0,0,0.08); }
    :host([theme="light"]) .cancel { background: #f3f4f6; color: #111; }
    :host([theme="light"]) .confirm { background: #2563eb; color: #fff; }
  `;

  constructor() {
    super();
    this.open = false;
    this.theme = 'dark';
    this.title = 'Create your passkey';
    this.confirmText = 'Continue';
    this.cancelText = 'Cancel';
    this.loading = false;
  }

  protected getComponentPrefix(): string { return 'modal'; }

  private onCancel = () => {
    if (this.loading) return;
    this.dispatchEvent(new CustomEvent('cancel', { bubbles: true, composed: true }));
    this.open = false;
  };

  private onConfirm = () => {
    if (this.loading) return;
    this.dispatchEvent(new CustomEvent('confirm', { bubbles: true, composed: true }));
  };

  render() {
    return html`
      <div class="overlay" @click=${this.onCancel}></div>
      <div class="panel" aria-hidden=${!this.open}>
        <div class="card ${this.loading ? 'loading' : ''}" role="dialog" aria-modal="true" aria-label="Registration">
          <h2 class="title">${this.title}</h2>
          ${this.subtitle ? html`<p class="subtitle">${this.subtitle}</p>` : null}
          ${this.accountId ? html`<div class="account">${this.accountId}</div>` : null}
          ${this.errorMessage ? html`<div class="error">${this.errorMessage}</div>` : null}
          <div class="actions">
            <button class="cancel" @click=${this.onCancel}>${this.cancelText}</button>
            <button class="confirm" @click=${this.onConfirm}>${this.confirmText}</button>
          </div>
        </div>
      </div>
    `;
  }
}

export default (function ensureDefined() {
  const TAG = 'w3a-registration-modal';
  if (!customElements.get(TAG)) {
    customElements.define(TAG, RegistrationModalElement);
  }
  return RegistrationModalElement;
})();

