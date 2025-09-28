import { html, css, LitElement } from 'lit';

export class PadlockIconElement extends LitElement {
  static properties = {
    size: { type: String },
    strokeWidth: { type: Number, attribute: 'stroke-width' },
  } as const;

  declare size?: string;
  declare strokeWidth?: number;

  static styles = css`
    :host { display: inline-flex; }
    svg { width: 100%; height: 100%; display: block; }
  `;

  constructor() {
    super();
    this.size = undefined; // allows CSS width/height or class to control size
    this.strokeWidth = 2;
  }

  render() {
    const size = this.size || undefined;
    const sw = Number(this.strokeWidth) || 2;
    return html`
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width=${sw}
        stroke-linecap="round"
        stroke-linejoin="round"
        width=${size || '100%'}
        height=${size || '100%'}
        aria-hidden="true"
        focusable="false"
      >
        <rect width="18" height="11" x="3" y="11" rx="2" ry="2"/>
        <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
      </svg>
    `;
  }
}

try {
  if (!customElements.get('w3a-padlock-icon')) {
    customElements.define('w3a-padlock-icon', PadlockIconElement);
  }
} catch {}

export default PadlockIconElement;

