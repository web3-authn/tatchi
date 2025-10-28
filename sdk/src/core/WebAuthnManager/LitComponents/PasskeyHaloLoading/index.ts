import { html } from 'lit';
import { LitElementWithProps } from '../LitElementWithProps';
import type { HaloTheme } from '../HaloBorder';
import '../HaloBorder';
import { ensureExternalStyles } from '../css/css-loader';

export class PasskeyHaloLoadingElement extends LitElementWithProps {
  static properties = {
    // Pass-through HaloBorder props
    animated: { type: Boolean },
    theme: { type: String },
    ringGap: { type: Number, attribute: 'ring-gap' },
    ringWidth: { type: Number, attribute: 'ring-width' },
    ringBorderRadius: { type: String, attribute: 'ring-border-radius' },
    ringBorderShadow: { type: String, attribute: 'ring-border-shadow' },
    ringBackground: { type: String, attribute: 'ring-background' },
    padding: { type: String },
    innerPadding: { type: String, attribute: 'inner-padding' },
    innerBackground: { type: String, attribute: 'inner-background' },
    // Local visual props
    height: { type: Number },
    width: { type: Number },
    // Icon container overrides
    iconContainerBorderRadius: { type: String, attribute: 'icon-container-border-radius' },
    iconContainerBackgroundColor: { type: String, attribute: 'icon-container-background-color' },
  } as const;

  declare animated?: boolean;
  declare theme?: HaloTheme;
  declare ringGap?: number;
  declare ringWidth?: number;
  declare ringBorderRadius?: string;
  declare ringBorderShadow?: string;
  declare ringBackground?: string;
  declare padding?: string;
  declare innerPadding?: string;
  declare innerBackground?: string;
  declare height?: number;
  declare width?: number;
  declare iconContainerBorderRadius?: string;
  declare iconContainerBackgroundColor?: string;

  // Static styles removed; external stylesheet is adopted for CSP compatibility
  private _stylesReady = false;
  private _stylePromises: Promise<void>[] = [];
  private _stylesAwaiting: Promise<void> | null = null;

  protected createRenderRoot(): HTMLElement | DocumentFragment {
    const root = super.createRenderRoot();
    const p = ensureExternalStyles(root as ShadowRoot | DocumentFragment | HTMLElement, 'passkey-halo-loading.css', 'data-w3a-passkey-halo-loading-css');
    this._stylePromises.push(p);
    p.catch(() => {});
    return root;
  }

  // Defer first render until external styles are adopted to avoid FOUC
  protected shouldUpdate(_changed: Map<string | number | symbol, unknown>): boolean {
    if (this._stylesReady) return true;
    if (!this._stylesAwaiting) {
      const settle = Promise.all(this._stylePromises)
        .then(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
      this._stylesAwaiting = settle.then(() => { this._stylesReady = true; this.requestUpdate(); });
    }
    return false;
  }

  protected updated(): void {
    // Bridge prop overrides into CSS variables to avoid inline styles
    const vars: Record<string, string> = {};
    if (this.iconContainerBackgroundColor) {
      vars['--w3a-modal__passkey-halo-loading-icon-container__background-color'] = this.iconContainerBackgroundColor;
    }
    if (this.iconContainerBorderRadius) {
      vars['--w3a-modal__passkey-halo-loading-icon-container__border-radius'] = this.iconContainerBorderRadius;
    }
    if (Object.keys(vars).length) this.setCssVars(vars);
  }

  render() {
    const theme = this.theme ?? 'light';
    const height = this.height ?? 24;
    const width = this.width ?? 24;
    const animated = this.animated ?? true;
    const ringGap = this.ringGap ?? 4;
    const ringWidth = this.ringWidth ?? 4;
    const ringBorderRadius = this.ringBorderRadius ?? '1.125rem';
    const ringBorderShadow = this.ringBorderShadow;
    const ringBackground = this.ringBackground;
    const padding = this.padding;
    const innerPadding = this.innerPadding ?? '4px';
    const innerBackground = this.innerBackground;

    return html`
      <div class="w3a-passkey-loading-root ${theme}">
        <w3a-halo-border
          .theme=${theme}
          .animated=${animated}
          .ringGap=${ringGap}
          .ringWidth=${ringWidth}
          .ringBorderRadius=${ringBorderRadius}
          .ringBorderShadow=${ringBorderShadow}
          .ringBackground=${ringBackground}
          .padding=${padding}
          .innerPadding=${innerPadding}
          .innerBackground=${innerBackground}
        >
          <div class="w3a-passkey-loading-touch-icon-container">
            ${this.renderTouchIcon({ height, width })}
          </div>
        </w3a-halo-border>
      </div>
    `;
  }

  private renderTouchIcon({ height, width }: { height: number; width: number; }) {
    const strokeWidth = 'var(--w3a-modal__passkey-halo-loading-touch-icon__stroke-width, 3)';

    return html`
      <svg
        class="w3a-passkey-loading-touch-icon"
        width=${width}
        height=${height}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M6.40519 19.0481C6.58912 18.6051 6.75832 18.1545 6.91219 17.6969M14.3433 20.6926C14.6095 19.9418 14.8456 19.1768 15.0502 18.399C15.2359 17.6934 15.3956 16.9772 15.5283 16.2516M19.4477 17.0583C19.8121 15.0944 20.0026 13.0694 20.0026 11C20.0026 6.58172 16.4209 3 12.0026 3C10.7472 3 9.55932 3.28918 8.50195 3.80456M3.52344 15.0245C3.83663 13.7343 4.00262 12.3865 4.00262 11C4.00262 9.25969 4.55832 7.64917 5.50195 6.33621M12.003 11C12.003 13.7604 11.5557 16.4163 10.7295 18.8992C10.5169 19.5381 10.2792 20.1655 10.0176 20.7803M7.71227 14.5C7.90323 13.3618 8.00262 12.1925 8.00262 11C8.00262 8.79086 9.79348 7 12.0026 7C14.2118 7 16.0026 8.79086 16.0026 11C16.0026 11.6166 15.9834 12.2287 15.9455 12.8357"
          stroke="currentColor"
          stroke-width=${strokeWidth}
          stroke-linecap="round"
          stroke-linejoin="round"
          vector-effect="non-scaling-stroke"
          pathLength="1"
        />
      </svg>
    `;
  }
}

import { W3A_PASSKEY_HALO_LOADING_ID } from '../tags';

if (!customElements.get(W3A_PASSKEY_HALO_LOADING_ID)) {
  customElements.define(W3A_PASSKEY_HALO_LOADING_ID, PasskeyHaloLoadingElement);
}

export default PasskeyHaloLoadingElement;
