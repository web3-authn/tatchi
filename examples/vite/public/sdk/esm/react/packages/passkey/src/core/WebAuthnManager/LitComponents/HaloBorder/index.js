import { i } from "../../../../../../../node_modules/.pnpm/@lit_reactive-element@2.1.1/node_modules/@lit/reactive-element/css-tag.js";
import { x } from "../../../../../../../node_modules/.pnpm/lit-html@3.3.1/node_modules/lit-html/lit-html.js";
import "../../../../../../../node_modules/.pnpm/lit@3.3.1/node_modules/lit/index.js";
import { LitElementWithProps } from "../LitElementWithProps.js";
import { o } from "../../../../../../../node_modules/.pnpm/lit-html@3.3.1/node_modules/lit-html/directives/style-map.js";
import "../../../../../../../node_modules/.pnpm/lit@3.3.1/node_modules/lit/directives/style-map.js";
import { e, n } from "../../../../../../../node_modules/.pnpm/lit-html@3.3.1/node_modules/lit-html/directives/ref.js";
import "../../../../../../../node_modules/.pnpm/lit@3.3.1/node_modules/lit/directives/ref.js";

//#region src/core/WebAuthnManager/LitComponents/HaloBorder/index.ts
var HaloBorderElement = class extends LitElementWithProps {
	static properties = {
		animated: { type: Boolean },
		theme: { type: String },
		durationMs: {
			type: Number,
			attribute: "duration-ms"
		},
		ringGap: {
			type: Number,
			attribute: "ring-gap"
		},
		ringWidth: {
			type: Number,
			attribute: "ring-width"
		},
		ringBorderRadius: {
			type: String,
			attribute: "ring-border-radius"
		},
		ringBorderShadow: {
			type: String,
			attribute: "ring-border-shadow"
		},
		ringBackground: {
			type: String,
			attribute: "ring-background"
		},
		padding: { type: String },
		innerPadding: {
			type: String,
			attribute: "inner-padding"
		},
		innerBackground: {
			type: String,
			attribute: "inner-background"
		}
	};
	ringRef = e();
	rafId = null;
	startTs = 0;
	static styles = i`
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
	disconnectedCallback() {
		super.disconnectedCallback();
		if (this.rafId !== null) {
			cancelAnimationFrame(this.rafId);
			this.rafId = null;
		}
	}
	startAnimationIfNeeded() {
		if (!this.animated || !this.ringRef.value) return;
		if (this.rafId !== null) return;
		const durationMs = this.durationMs ?? 1150;
		const step = (now) => {
			if (this.startTs === 0) this.startTs = now;
			const elapsed = now - this.startTs;
			const progress = elapsed % durationMs / durationMs;
			const angle = progress * 360;
			const ring = this.ringRef.value;
			const stops = this.ringBackground ?? "transparent 0%, #4DAFFE 10%, #4DAFFE 25%, transparent 35%";
			ring.style.background = `conic-gradient(from ${angle}deg, ${stops})`;
			this.rafId = requestAnimationFrame(step);
		};
		this.rafId = requestAnimationFrame(step);
	}
	updated() {
		if (this.ringBorderShadow) this.style.boxShadow = this.ringBorderShadow;
		else this.style.removeProperty("box-shadow");
		if (this.animated) this.startAnimationIfNeeded();
		else if (this.rafId !== null) {
			cancelAnimationFrame(this.rafId);
			this.rafId = null;
		}
	}
	render() {
		const ringGap = this.ringGap ?? 4;
		const ringWidth = this.ringWidth ?? 2;
		const ringBorderRadius = this.ringBorderRadius ?? "2rem";
		const innerPadding = this.innerPadding ?? "2rem";
		const innerBackground = this.innerBackground ?? "var(--w3a-grey650)";
		const theme = this.theme ?? "light";
		const paddingOverride = this.padding ?? `${ringGap + ringWidth}px`;
		const ringInsetPx = `-${ringGap + ringWidth}px`;
		const haloInnerStyle = {
			background: "transparent",
			border: "1px solid transparent",
			borderRadius: "2rem",
			padding: paddingOverride,
			position: "relative"
		};
		const contentStyle = {
			background: innerBackground,
			borderRadius: ringBorderRadius,
			padding: innerPadding,
			position: "relative",
			zIndex: "2"
		};
		const ringStops = this.ringBackground ?? "transparent 0%, #4DAFFE 10%, #4DAFFE 25%, transparent 35%";
		const ringStyle = {
			position: "absolute",
			top: ringInsetPx,
			right: ringInsetPx,
			bottom: ringInsetPx,
			left: ringInsetPx,
			borderRadius: `calc(${ringBorderRadius} + ${ringGap}px + ${ringWidth}px)`,
			pointerEvents: "none",
			zIndex: "3",
			background: `conic-gradient(from 0deg, ${ringStops})`,
			padding: `${ringWidth}px`,
			WebkitMask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
			WebkitMaskComposite: "xor",
			maskComposite: "exclude"
		};
		return x`
      <div class="w3a-halo-border-root ${theme}">
        <div class="w3a-halo-border-inner" style=${o(haloInnerStyle)}>
          ${this.animated ? x`
                <div style=${o({
			position: "relative",
			borderRadius: "2rem",
			overflow: "visible"
		})}>
                  <div ${n(this.ringRef)} style=${o(ringStyle)}></div>
                  <div class="w3a-halo-border-content" style=${o(contentStyle)}>
                    <slot></slot>
                  </div>
                </div>
              ` : x`
                <div class="w3a-halo-border-content" style=${o(contentStyle)}>
                  <slot></slot>
                </div>
              `}
        </div>
      </div>
    `;
	}
};
customElements.define("w3a-halo-border", HaloBorderElement);
var HaloBorder_default = HaloBorderElement;

//#endregion
export { HaloBorder_default as default };
//# sourceMappingURL=index.js.map