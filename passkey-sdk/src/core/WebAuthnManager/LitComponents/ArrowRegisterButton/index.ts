import { html, css, PropertyValues } from 'lit';
import { styleMap } from 'lit/directives/style-map.js';
import { LitElementWithProps, ComponentStyles } from '../LitElementWithProps';
import { ARROW_BUTTON_THEMES } from './arrow-button-themes';
import { defineTag } from '../tags';

export type ArrowRegisterButtonMode = 'register' | 'login' | 'recover';

const VALID_MODES: ArrowRegisterButtonMode[] = ['register', 'login', 'recover'];

function isMode(value: unknown): value is ArrowRegisterButtonMode {
  return typeof value === 'string' && (VALID_MODES as readonly string[]).includes(value);
}

function toCssSize(value: unknown, fallback: string): string {
  if (value == null) return fallback;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `${value}px`;
  }
  const stringified = String(value).trim();
  return stringified.length > 0 ? stringified : fallback;
}

function defaultLabelForMode(mode: ArrowRegisterButtonMode): string {
  switch (mode) {
    case 'login':
      return 'Continue to login';
    case 'recover':
      return 'Continue to recover account';
    default:
      return 'Continue to register';
  }
}

export class ArrowRegisterButtonElement extends LitElementWithProps {
  static properties = {
    mode: { type: String, reflect: true },
    disabled: { type: Boolean, reflect: true },
    waiting: { type: Boolean, reflect: true },
    width: { attribute: false },
    height: { attribute: false },
    label: { type: String },
    // Not used for rendering; consumed by wallet host when wiring events
    nearAccountId: { type: String, attribute: 'near-account-id' },
    // Optional theme hint; when provided and styles is not, falls back to themed defaults
    theme: { type: String, attribute: false },
    // Allow styles to be reactive like TxTree
    styles: { attribute: false, state: true },
  } as const;

  declare mode?: ArrowRegisterButtonMode;
  declare disabled?: boolean;
  declare waiting?: boolean;
  declare width?: string | number;
  declare height?: string | number;
  declare label?: string;
  declare nearAccountId?: string;
  declare theme?: 'dark' | 'light';
  declare styles?: ComponentStyles;
  // Track pressed state for consistent press-down animation on pointer devices
  private _pressed = false;

  static styles = css`
    :host {
      display: inline-block;
      position: relative;
      font: inherit;
      color: inherit;
    }

    .w3a-arrow-root {
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: auto;
      height: auto;
    }

    button {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 0;
      height: var(--w3a-arrow__height, 64px);
      padding: 0;
      margin: 0;
      background: transparent;
      /* Component-scoped styling only (values provided via applyStyles) */
      border: 6px solid var(--w3a-arrow__button__border-color);
      border-radius: 2rem 0.25rem 0.25rem 2rem;
      color: var(--w3a-arrow__icon__color);
      line-height: 0;
      cursor: pointer;
      opacity: 0;
      visibility: hidden;
      pointer-events: none;
      user-select: none;
      -webkit-tap-highlight-color: transparent;
      transform-origin: center;
      transition: transform 200ms ease,
        background-color 200ms ease,
        border-radius 250ms ease,
        opacity 200ms ease,
        width 250ms var(--fe-ease, cubic-bezier(0, 0, 0.2, 1));
      outline: none;
    }

    button[data-enabled="true"] {
      width: var(--w3a-arrow__enabled-width, 100px);
      background: var(--w3a-arrow__button__background);
      border-radius: 2rem;
      opacity: 1;
      visibility: visible;
      pointer-events: auto;
    }

    button[data-enabled="true"]:hover {
      transform: scale(1);
      background: var(--w3a-arrow__button__hover-background);
    }

    button[data-enabled="true"]:active,
    button[data-enabled="true"][data-pressed="true"] {
      transform: scale(0.96);
    }

    button:disabled {
      cursor: not-allowed;
      opacity: 0.6;
      background: var(--w3a-arrow__button__disabled-background);
      pointer-events: none;
    }

    .w3a-arrow-icon {
      display: block;
      transition: transform 200ms, width 200ms, height 200ms;
      color: var(--w3a-arrow__icon__color);
    }

    .w3a-arrow-label {
      margin-left: 8px;
      font-weight: 600;
      font-size: 14px;
      line-height: 1;
      color: var(--w3a-arrow__label__color);
    }
  `;

  protected getComponentPrefix(): string {
    return 'arrow';
  }

  protected updated(changed: PropertyValues<this>): void {
    super.updated(changed);
    // 1) Apply explicit styles when provided
    if (changed.has('styles') && this.styles) {
      this.applyStyles(this.styles);
    }
    // 2) Fallback to theme-based styles when theme changes and no explicit styles provided
    if (changed.has('theme') && !this.styles && this.theme) {
      const preset = ARROW_BUTTON_THEMES[this.theme] || ARROW_BUTTON_THEMES.dark;
      this.applyStyles(preset);
    }
  }

  connectedCallback(): void {
    super.connectedCallback();
    // Ensure component-scoped CSS vars are present on first mount
    if (!this.styles) {
      const hinted = (this.theme === 'light' || this.theme === 'dark') ? this.theme : undefined;
      const fromAttr = (() => {
        try { const v = document?.documentElement?.getAttribute('data-w3a-theme'); return (v === 'light' || v === 'dark') ? v : undefined; } catch { return undefined; }
      })();
      const theme = hinted || fromAttr || 'dark';
      const preset = ARROW_BUTTON_THEMES[theme] || ARROW_BUTTON_THEMES.dark;
      this.applyStyles(preset);
    }
  }

  protected applyStyles(styles: ComponentStyles): void {
    super.applyStyles(styles, this.getComponentPrefix());
  }

  public focus(options?: FocusOptions): void {
    this.shadowRoot?.querySelector('button')?.focus(options);
  }

  public blur(): void {
    this.shadowRoot?.querySelector('button')?.blur();
  }

  private getResolvedMode(): ArrowRegisterButtonMode {
    return isMode(this.mode) ? this.mode : 'register';
  }

  private emitSubmit(): void {
    const detail = { mode: this.getResolvedMode() };
    this.dispatchEvent(new CustomEvent('arrow-submit', {
      detail,
      bubbles: true,
      composed: true,
    }));
  }

  private onClick(event: Event): void {
    if (this.disabled || this.waiting) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    this.emitSubmit();
  }

  private onPointerDown = (event: PointerEvent) => {
    if (this.disabled || this.waiting) return;
    this._pressed = true;
    this.requestUpdate();
  };

  private onPointerUpOrLeave = () => {
    if (!this._pressed) return;
    this._pressed = false;
    this.requestUpdate();
  };

  render() {
    const resolvedMode = this.getResolvedMode();
    const disabled = Boolean(this.disabled);
    const waiting = Boolean(this.waiting);
    const enabled = !disabled && !waiting;
    const expandedWidth = toCssSize(this.width, '100px');
    const resolvedHeight = toCssSize(this.height, '64px');
    const ariaLabel = this.label ?? defaultLabelForMode(resolvedMode);

    const rootStyle = {
      '--w3a-arrow__enabled-width': expandedWidth,
      '--w3a-arrow__height': resolvedHeight,
    } as Record<string, string>;

    return html`
      <div class="w3a-arrow-root" style=${styleMap(rootStyle)}>
        <button
          type="button"
          aria-label=${ariaLabel}
          data-enabled=${enabled ? 'true' : 'false'}
          data-mode=${resolvedMode}
          data-pressed=${this._pressed ? 'true' : 'false'}
          ?disabled=${disabled || waiting}
          @click=${this.onClick}
          @pointerdown=${this.onPointerDown}
          @pointerup=${this.onPointerUpOrLeave}
          @pointercancel=${this.onPointerUpOrLeave}
          @pointerleave=${this.onPointerUpOrLeave}
        >
          ${enabled ? html`
            <svg
              class="w3a-arrow-icon"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="m5 12 7-7 7 7" />
              <path d="M12 19V5" />
            </svg>
          ` : null}
          ${enabled && this.label ? html`
            <span class="w3a-arrow-label">${this.label}</span>
          ` : null}
        </button>
      </div>
    `;
  }
}

defineTag('registerButton', ArrowRegisterButtonElement);

export default ArrowRegisterButtonElement;
