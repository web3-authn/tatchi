import { html, css } from 'lit';
import { LitElementWithProps } from '../LitElementWithProps';

export type RegistrationTheme = 'dark' | 'light';

export class RegistrationDrawerElement extends LitElementWithProps {
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
    :host { display: contents; }
    .overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.35); z-index: 2147483646; opacity: 0; pointer-events: none; transition: opacity .2s ease; }
    :host([open]) .overlay { opacity: 1; pointer-events: auto; }

    .drawer {
      position: fixed;
      left: 0; right: 0; bottom: 0;
      z-index: 2147483647;
      background: var(--w3a-modal__card__background, #111);
      color: var(--w3a-modal__card__color, #f6f7f8);
      border-top-left-radius: 16px;
      border-top-right-radius: 16px;
      border: 1px solid var(--w3a-modal__card__border, rgba(255,255,255,0.08));
      transform: translateY(100%);
      transition: transform .28s ease;
      box-shadow: 0 -10px 28px rgba(0,0,0,0.35);
      padding: 14px 16px 16px;
      max-height: 80vh;
      display: grid;
      grid-template-rows: auto 1fr auto;
    }
    :host([open]) .drawer { transform: translateY(0%); }
    .handle { width: 36px; height: 4px; border-radius: 2px; background: rgba(255,255,255,0.25); margin: 6px auto 10px; }
    .title { font-size: 16px; font-weight: 700; margin: 0 0 4px; }
    .subtitle { font-size: 13px; opacity: 0.85; margin: 0 0 8px; }
    .account { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; opacity: 0.92; margin-bottom: 8px; }
    .body { overflow: auto; padding: 6px 2px; }
    .actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 10px; }
    button { border: 0; border-radius: 8px; padding: 9px 13px; font-weight: 600; cursor: pointer; }
    .cancel { background: #2b2b2b; color: #ddd; }
    .confirm { background: #4DAFFE; color: #0b1220; }
    .error { color: #ff7a7a; font-size: 13px; margin-top: 6px; }
    :host([theme="light"]) .drawer { background: #fff; color: #181a1f; border-color: rgba(0,0,0,0.08); }
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
      <section class="drawer" role="dialog" aria-modal="true" aria-label="Registration">
        <div class="handle"></div>
        <div>
          <h2 class="title">${this.title}</h2>
          ${this.subtitle ? html`<p class="subtitle">${this.subtitle}</p>` : null}
          ${this.accountId ? html`<div class="account">${this.accountId}</div>` : null}
        </div>
        <div class="body">
          ${this.errorMessage ? html`<div class="error">${this.errorMessage}</div>` : null}
        </div>
        <div class="actions">
          <button class="cancel" @click=${this.onCancel}>${this.cancelText}</button>
          <button class="confirm" @click=${this.onConfirm}>${this.confirmText}</button>
        </div>
      </section>
    `;
  }
}

export default (function ensureDefined() {
  const TAG = 'w3a-registration-drawer';
  if (!customElements.get(TAG)) {
    customElements.define(TAG, RegistrationDrawerElement);
  }
  return RegistrationDrawerElement;
})();

