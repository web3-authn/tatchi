import { LitElement } from 'lit';

/**
 * Drop-in replacement for LitElement that automatically handles the custom element upgrade race.
 * See lit-element-with-props.md for more details.
 * All properties defined in static properties will be automatically upgraded on mount.
 */
export class LitElementWithProps extends LitElement {

  /**
   * Handles the custom element upgrade race for a specific property.
   * This method ensures that any property values set before the custom element
   * fully upgrades are correctly re-applied through Lit's property system.
   * @param prop - The property name to upgrade
   */
  private upgradeProperty(prop: string): void {
    if (this.hasOwnProperty(prop)) {
      // Capture the value that was set before upgrade
      const value = (this as any)[prop];

      // Remove the property so the class getter/setter takes over
      delete (this as any)[prop];

      // Re-assign through the proper setter to trigger Lit's reactivity
      (this as any)[prop] = value;
    }
  }

  /**
   * Automatically upgrades all properties defined in static properties.
   * Called automatically in connectedCallback - no manual intervention needed.
   */
  private upgradeAllProperties(): void {
    const constructor = this.constructor as typeof LitElement;
    const properties = constructor.properties;

    if (properties) {
      // Handle both object syntax and Map syntax
      const propertyNames = properties instanceof Map
        ? Array.from(properties.keys())
        : Object.keys(properties);

      propertyNames.forEach(prop => this.upgradeProperty(prop));
    }
  }

  /**
   * Lit lifecycle: Called when element is added to DOM.
   * Automatically upgrades all defined properties to handle the upgrade race.
   */
  connectedCallback(): void {
    super.connectedCallback();
    this.upgradeAllProperties();
  }
}
