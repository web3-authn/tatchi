import { html, css } from 'lit';
import { styleMap } from 'lit/directives/style-map.js';
import { ref, createRef, Ref } from 'lit/directives/ref.js';
import { LitElementWithProps } from '../LitElementWithProps';

export type HaloTheme = 'dark' | 'light';

export class HaloBorderElement extends LitElementWithProps {
  static properties = {
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

  private ringRef: Ref<HTMLDivElement> = createRef();
  private rafId: number | null = null;
  private startTs = 0;

  static styles = css`
    :host {
      display: inline-block;
      background: transparent;
      border-radius: 2rem;
      padding: 0;
      max-width: 860px;
      box-sizing: border-box;
      width: fit-content;
      height: fit-content;
    }
  `;

  disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private startAnimationIfNeeded(): void {
    if (!this.animated || !this.ringRef.value) return;
    if (this.rafId !== null) return; // already animating

    const durationMs = 1150;
    const step = (now: number) => {
      if (this.startTs === 0) this.startTs = now;
      const elapsed = now - this.startTs;
      const progress = (elapsed % durationMs) / durationMs; // 0..1
      const angle = progress * 360;
      const ring = this.ringRef.value!;
      const stops = this.ringBackground ?? 'transparent 0%, #4DAFFE 10%, #4DAFFE 25%, transparent 35%';
      ring.style.background = `conic-gradient(from ${angle}deg, ${stops})`;
      this.rafId = requestAnimationFrame(step);
    };
    this.rafId = requestAnimationFrame(step);
  }

  protected updated(): void {
    // Apply optional host shadow from prop
    if (this.ringBorderShadow) {
      this.style.boxShadow = this.ringBorderShadow;
    } else {
      this.style.removeProperty('box-shadow');
    }
    // Trigger/maintain animation
    if (this.animated) {
      this.startAnimationIfNeeded();
    } else if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  render() {
    const ringGap = this.ringGap ?? 4;
    const ringWidth = this.ringWidth ?? 2;
    const ringBorderRadius = this.ringBorderRadius ?? '2rem';
    const innerPadding = this.innerPadding ?? '2rem';
    const innerBackground = this.innerBackground ?? 'var(--w3a-grey650)';
    const theme = this.theme ?? 'light';

    // matches React padding override behavior
    const paddingOverride = this.padding ?? `${ringGap + ringWidth}px`;
    const ringInsetPx = `-${ringGap + ringWidth}px`;

    const haloInnerStyle = {
      background: 'transparent',
      border: '1px solid transparent',
      borderRadius: '2rem',
      padding: paddingOverride,
      position: 'relative',
    } as Record<string, string>;

    const contentStyle = {
      background: innerBackground,
      borderRadius: ringBorderRadius,
      padding: innerPadding,
      position: 'relative',
      zIndex: '2',
    } as Record<string, string>;

    const ringStops = this.ringBackground ?? 'transparent 0%, #4DAFFE 10%, #4DAFFE 25%, transparent 35%';
    const ringStyle = {
      position: 'absolute',
      top: ringInsetPx,
      right: ringInsetPx,
      bottom: ringInsetPx,
      left: ringInsetPx,
      borderRadius: `calc(${ringBorderRadius} + ${ringGap}px + ${ringWidth}px)`,
      pointerEvents: 'none',
      zIndex: '3',
      background: `conic-gradient(from 0deg, ${ringStops})`,
      padding: `${ringWidth}px`,
      WebkitMask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
      WebkitMaskComposite: 'xor',
      maskComposite: 'exclude',
    } as Record<string, string>;

    return html`
      <div class="w3a-halo-border-root ${theme}">
        <div class="w3a-halo-border-inner" style=${styleMap(haloInnerStyle)}>
          ${this.animated
            ? html`
                <div style=${styleMap({ position: 'relative', borderRadius: '2rem', overflow: 'visible' })}>
                  <div ${ref(this.ringRef)} style=${styleMap(ringStyle)}></div>
                  <div class="w3a-halo-border-content" style=${styleMap(contentStyle)}>
                    <slot></slot>
                  </div>
                </div>
              `
            : html`
                <div class="w3a-halo-border-content" style=${styleMap(contentStyle)}>
                  <slot></slot>
                </div>
              `}
        </div>
      </div>
    `;
  }
}

customElements.define('w3a-halo-border', HaloBorderElement);
export default HaloBorderElement;
