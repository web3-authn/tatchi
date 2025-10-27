import { html, type PropertyValues } from 'lit';
import { LitElementWithProps } from '../LitElementWithProps';
import { ensureExternalStyles } from '../css/css-loader';

export type HaloTheme = 'dark' | 'light';

export class HaloBorderElement extends LitElementWithProps {
  static properties = {
    animated: { type: Boolean },
    theme: { type: String },
    durationMs: { type: Number, attribute: 'duration-ms' },
    ringGap: { type: Number, attribute: 'ring-gap' },
    ringWidth: { type: Number, attribute: 'ring-width' },
    ringBorderRadius: { type: String, attribute: 'ring-border-radius' },
    ringBorderShadow: { type: String, attribute: 'ring-border-shadow' },
    ringBackground: { type: String, attribute: 'ring-background' },
    padding: { type: String },
    innerPadding: { type: String, attribute: 'inner-padding' },
    innerBackground: { type: String, attribute: 'inner-background' },
  } as const;

  declare animated?: boolean;
  declare theme?: HaloTheme;
  declare durationMs?: number;
  declare ringGap?: number;
  declare ringWidth?: number;
  declare ringBorderRadius?: string;
  declare ringBorderShadow?: string;
  declare ringBackground?: string;
  declare padding?: string;
  declare innerPadding?: string;
  declare innerBackground?: string;

  // Static styles removed; external stylesheet is adopted for CSP compatibility

  protected createRenderRoot(): HTMLElement | DocumentFragment {
    const root = super.createRenderRoot();
    ensureExternalStyles(root as ShadowRoot | DocumentFragment | HTMLElement, 'halo-border.css', 'data-w3a-halo-border-css').catch(() => {});
    return root;
  }
  private _rafId: number | null = null;
  private _startTs: number = 0;
  private _running: boolean = false;

  protected updated(changed?: PropertyValues): void {
    // Bridge prop values into CSS variables (no inline style attributes)
    const vars: Record<string, string> = {};
    if (typeof this.ringGap === 'number') vars['--ring-gap'] = `${this.ringGap}px`;
    if (typeof this.ringWidth === 'number') vars['--ring-width'] = `${this.ringWidth}px`;
    if (this.ringBorderRadius) vars['--ring-border-radius'] = this.ringBorderRadius;
    if (this.innerPadding) vars['--inner-padding'] = this.innerPadding;
    if (this.innerBackground) vars['--inner-background'] = this.innerBackground;
    if (this.ringBackground) vars['--ring-stops'] = this.ringBackground;
    if (this.ringBorderShadow) vars['--halo-box-shadow'] = this.ringBorderShadow;
    // Ensure an initial angle is present
    vars['--halo-angle'] = vars['--halo-angle'] || '0deg';
    this.setCssVars(vars);

    // Start/stop animation based on "animated" or duration changes
    if (!changed) return;
    if (changed.has('animated') || changed.has('durationMs')) {
      if (this.animated) this.start(); else this.stop();
    }
  }

  connectedCallback(): void {
    super.connectedCallback();
    if (this.animated) this.start();
  }

  disconnectedCallback(): void {
    this.stop();
    super.disconnectedCallback();
  }

  private tick = (ts: number) => {
    if (!this._running) return;
    if (!this._startTs) this._startTs = ts;
    const dur = (typeof this.durationMs === 'number' && this.durationMs > 0) ? this.durationMs : 1150;
    const delta = (ts - this._startTs) % dur;
    const angle = (delta / dur) * 360;
    // Update only the angle var via adoptedStyleSheet (no style attribute writes)
    try { this.setCssVars({ '--halo-angle': `${angle}deg` }); } catch {}
    this._rafId = requestAnimationFrame(this.tick);
  };

  private start() {
    if (this._running) return;
    this._running = true;
    this._startTs = 0;
    try { this._rafId = requestAnimationFrame(this.tick); } catch {}
  }

  private stop() {
    this._running = false;
    if (this._rafId) {
      try { cancelAnimationFrame(this._rafId); } catch {}
      this._rafId = null;
    }
    // Reset angle
    try { this.setCssVars({ '--halo-angle': `0deg` }); } catch {}
  }

  render() {
    return html`
      <div class="halo-root ${this.theme ?? 'light'} ${this.animated ? 'animated' : ''}">
        <div class="halo-inner">
          <div class="halo-outer">
            ${this.animated ? html`<div class="halo-ring"></div>` : ''}
            <div class="halo-content"><slot></slot></div>
          </div>
        </div>
      </div>
    `;
  }
}

import { W3A_HALO_BORDER_ID } from '../tags';

if (!customElements.get(W3A_HALO_BORDER_ID)) {
  customElements.define(W3A_HALO_BORDER_ID, HaloBorderElement);
}

export default HaloBorderElement;
