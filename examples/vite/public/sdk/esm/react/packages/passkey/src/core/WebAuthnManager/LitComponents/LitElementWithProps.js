import { i } from "../../../../../../node_modules/.pnpm/lit-element@4.2.1/node_modules/lit-element/lit-element.js";
import "../../../../../../node_modules/.pnpm/lit@3.3.1/node_modules/lit/index.js";

//#region src/core/WebAuthnManager/LitComponents/LitElementWithProps.ts
/**
* Drop-in replacement for LitElement that automatically handles the custom element upgrade race.
* See lit-element-with-props.md for more details.
* All properties defined in static properties will be automatically upgraded on mount.
*/
var LitElementWithProps = class extends i {
	/**
	* Handles the custom element upgrade race for a specific property.
	* This method ensures that any property values set before the custom element
	* fully upgrades are correctly re-applied through Lit's property system.
	* @param prop - The property name to upgrade
	*/
	upgradeProperty(prop) {
		if (Object.prototype.hasOwnProperty.call(this, prop)) {
			const selfRead = this;
			const value = selfRead[prop];
			delete selfRead[prop];
			this[prop] = value;
		}
	}
	/**
	* Automatically upgrades all properties defined in static properties.
	* Called automatically in connectedCallback - no manual intervention needed.
	*/
	upgradeAllProperties() {
		const constructor = this.constructor;
		const properties = constructor.properties;
		if (properties) {
			const propertyNames = properties instanceof Map ? Array.from(properties.keys()) : Object.keys(properties);
			propertyNames.forEach((prop) => this.upgradeProperty(prop));
		}
	}
	/**
	* Generic styles property for component customization.
	* Subclasses can override this with their specific style types.
	*/
	styles;
	/**
	* Lit lifecycle: Called when element is added to DOM.
	* Automatically upgrades all defined properties to handle the upgrade race.
	*/
	connectedCallback() {
		super.connectedCallback();
		this.upgradeAllProperties();
		if (this.styles) this.applyStyles(this.styles, this.getComponentPrefix());
	}
	/**
	* Override this method in subclasses to return the appropriate component prefix
	* for CSS variable naming (e.g., 'tree', 'modal', 'button').
	*/
	getComponentPrefix() {
		return "component";
	}
	/**
	* Applies CSS variables for styling. Can be overridden by subclasses for component-specific behavior.
	* @param styles - The styles object to apply
	* @param componentPrefix - Optional component prefix override, defaults to getComponentPrefix()
	*/
	applyStyles(styles, componentPrefix) {
		if (!styles) return;
		const prefix = componentPrefix || this.getComponentPrefix();
		const baseVars = [
			"fontFamily",
			"fontSize",
			"color",
			"backgroundColor",
			"colorPrimary",
			"colorSecondary",
			"colorSuccess",
			"colorWarning",
			"colorError",
			"colorBackground",
			"colorSurface",
			"colorBorder",
			"textPrimary",
			"textSecondary",
			"fontSizeSm",
			"fontSizeBase",
			"fontSizeLg",
			"fontSizeXl",
			"radiusSm",
			"radiusMd",
			"radiusLg",
			"radiusXl",
			"gap2",
			"gap3",
			"gap4",
			"gap6",
			"shadowSm",
			"shadowMd"
		];
		baseVars.forEach((varName) => {
			const v = styles[varName];
			if (typeof v === "string") this.style.setProperty(`--w3a-${this.camelToKebab(varName)}`, v);
		});
		Object.entries(styles).forEach(([key, value]) => {
			if (typeof value === "string") this.style.setProperty(`--w3a-${this.camelToKebab(key)}`, value);
		});
		Object.entries(styles).forEach(([section, sectionStyles]) => {
			if (sectionStyles && typeof sectionStyles === "object" && !baseVars.includes(section)) Object.entries(sectionStyles).forEach(([prop, value]) => {
				const kebabSection = this.camelToKebab(section);
				const kebabProp = this.camelToKebab(prop);
				const cssVarNew = `--w3a-${prefix}__${kebabSection}__${kebabProp}`;
				this.style.setProperty(cssVarNew, String(value));
			});
		});
	}
	/**
	* Converts camelCase strings to kebab-case for CSS variables
	*/
	camelToKebab(str) {
		return str.replace(/([A-Z])/g, "-$1").toLowerCase();
	}
};

//#endregion
export { LitElementWithProps };
//# sourceMappingURL=LitElementWithProps.js.map