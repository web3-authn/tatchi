import { html, css } from 'lit';
import { defineTag } from '../tags';
import { TAG_DEFS } from '../tags';
import { styleMap } from 'lit/directives/style-map.js';
import { LitElementWithProps } from '../LitElementWithProps';

export class EmbeddedRegisterButton extends LitElementWithProps {
  static properties = {
    text: { type: String },
    theme: { type: String },
    busy: { type: Boolean },
    width: { type: String },
    height: { type: String },
    // Style/class applied to the inner <button>
    buttonStyle: { type: Object },
    buttonClass: { type: String },
  } as const;

  declare text?: string;
  declare theme?: 'dark' | 'light';
  declare busy?: boolean;
  declare width?: string;
  declare height?: string;
  declare buttonStyle?: Record<string, string>;
  declare buttonClass?: string;

  static styles = css`
    :host {
      display: inline-block;
      position: relative;
      width: var(--w3a-register-button-width, auto);
      height: var(--w3a-register-button-height, auto);
      box-sizing: border-box;
    }

    button {
      width: 100%;
      height: 100%;
      cursor: pointer;
      border-radius: 10px;
      border: 1px solid var(--w3a-register-button-border, rgba(255,255,255,0.2));
      background: var(--w3a-register-button-bg, #0f1115);
      color: var(--w3a-register-button-fg, #fff);
      font-size: 14px;
      font-weight: 600;
    }

    :host(.light) button,
    :host([data-theme="light"]) button {
      --w3a-register-button-bg: #fff;
      --w3a-register-button-fg: #111;
      --w3a-register-button-border: rgba(0,0,0,0.2);
    }
  `;

  connectedCallback(): void {
    super.connectedCallback();
    this.applyDimensions();
  }

  updated(): void {
    this.applyDimensions();
  }

  private applyDimensions() {
    if (this.width) this.style.setProperty('--w3a-register-button-width', this.width);
    if (this.height) this.style.setProperty('--w3a-register-button-height', this.height);
    const t = this.theme === 'light' ? 'light' : (this.theme === 'dark' ? 'dark' : undefined);
    if (t) this.setAttribute('data-theme', t);
  }

  private onClick = (ev: MouseEvent) => {
    // Let host handle the registration. This component is purely visual.
    this.dispatchEvent(new CustomEvent('w3a-register-click', { bubbles: true, composed: true }));
  };

  render() {
    const text = this.text || 'Create Passkey';
    const busy = !!this.busy;
    const label = busy ? 'Working…' : text;

    const btnStyle: Record<string, string> = {
      ...(this.buttonStyle || {}),
    };

    return html`
      <button
        class=${this.buttonClass || ''}
        style=${styleMap(btnStyle)}
        ?disabled=${busy}
        @click=${this.onClick}
      >
        ${label}
      </button>
    `;
  }
}

// Define canonical + alias tags centrally
try { defineTag('registerButton', EmbeddedRegisterButton as unknown as CustomElementConstructor); } catch {}
