import { i } from "../../../../../../../node_modules/.pnpm/@lit_reactive-element@2.1.1/node_modules/@lit/reactive-element/css-tag.js";
import { x } from "../../../../../../../node_modules/.pnpm/lit-html@3.3.1/node_modules/lit-html/lit-html.js";
import "../../../../../../../node_modules/.pnpm/lit@3.3.1/node_modules/lit/index.js";
import { LitElementWithProps } from "../LitElementWithProps.js";
import { o } from "../../../../../../../node_modules/.pnpm/lit-html@3.3.1/node_modules/lit-html/directives/style-map.js";
import "../../../../../../../node_modules/.pnpm/lit@3.3.1/node_modules/lit/directives/style-map.js";

//#region src/core/WebAuthnManager/LitComponents/PasskeyHaloLoading/index.ts
var PasskeyHaloLoadingElement = class extends LitElementWithProps {
	static properties = {
		animated: { type: Boolean },
		theme: { type: String },
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
		},
		height: { type: Number },
		width: { type: Number }
	};
	static styles = i`
    :host {
      display: inline-block;
    }
  `;
	render() {
		const theme = this.theme ?? "light";
		const height = this.height ?? 24;
		const width = this.width ?? 24;
		const animated = this.animated ?? true;
		const ringGap = this.ringGap ?? 4;
		const ringWidth = this.ringWidth ?? 4;
		const ringBorderRadius = this.ringBorderRadius ?? "1.5rem";
		const ringBorderShadow = this.ringBorderShadow;
		const ringBackground = this.ringBackground;
		const padding = this.padding;
		const innerPadding = this.innerPadding ?? "5px";
		const innerBackground = this.innerBackground;
		const iconContainerStyle = {
			display: "grid",
			placeItems: "center",
			backgroundColor: "var(--w3a-modal__passkey-halo-loading-icon-container__background-color)",
			borderRadius: "1.25rem",
			width: "fit-content",
			height: "fit-content"
		};
		return x`
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
          <div class="w3a-passkey-loading-touch-icon-container" style=${o(iconContainerStyle)}>
            ${this.renderTouchIcon({
			height,
			width
		})}
          </div>
        </w3a-halo-border>
      </div>
    `;
	}
	renderTouchIcon({ height, width }) {
		const iconStyle = {
			color: "var(--w3a-modal__passkey-halo-loading-touch-icon__color)",
			margin: "var(--w3a-modal__passkey-halo-loading-touch-icon__margin, 0.75rem)"
		};
		const strokeWidth = "var(--w3a-modal__passkey-halo-loading-touch-icon__stroke-width, 4)";
		return x`
      <svg
        style=${o(iconStyle)}
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
};
customElements.define("w3a-passkey-halo-loading", PasskeyHaloLoadingElement);
var PasskeyHaloLoading_default = PasskeyHaloLoadingElement;

//#endregion
export { PasskeyHaloLoading_default as default };
//# sourceMappingURL=index.js.map