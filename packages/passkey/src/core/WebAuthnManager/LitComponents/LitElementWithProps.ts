import { LitElement } from 'lit';

export type CSSProperties = Record<string, string | Record<string, string> | undefined>;

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
    if (Object.prototype.hasOwnProperty.call(this, prop)) {
      // Capture the value that was set before upgrade
      const selfRead = this as Record<string, unknown>;
      const value = selfRead[prop];

      // Remove the property so the class getter/setter takes over
      delete selfRead[prop];

      // Re-assign through the proper setter to trigger Lit's reactivity
      (this as Record<string, unknown>)[prop] = value;
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
   * Generic styles property for component customization.
   * Subclasses can override this with their specific style types.
   */
  styles?: ComponentStyles;

  /**
   * Lit lifecycle: Called when element is added to DOM.
   * Automatically upgrades all defined properties to handle the upgrade race.
   */
  connectedCallback(): void {
    super.connectedCallback();
    this.upgradeAllProperties();

    // Apply styles if they exist
    if (this.styles) {
      this.applyStyles(this.styles, this.getComponentPrefix());
    }
  }

  /**
   * Override this method in subclasses to return the appropriate component prefix
   * for CSS variable naming (e.g., 'tree', 'modal', 'button').
   */
  protected getComponentPrefix(): string {
    return 'component';
  }

  /**
   * Applies CSS variables for styling. Can be overridden by subclasses for component-specific behavior.
   * @param styles - The styles object to apply
   * @param componentPrefix - Optional component prefix override, defaults to getComponentPrefix()
   */
  protected applyStyles(styles: ComponentStyles, componentPrefix?: string): void {
    if (!styles) return;

    const prefix = componentPrefix || this.getComponentPrefix();

    // 1) Apply base design tokens (legacy predictable list)
    const baseVars = [
      'fontFamily', 'fontSize', 'color', 'backgroundColor',
      'colorPrimary', 'colorSecondary', 'colorSuccess', 'colorWarning', 'colorError',
      'colorBackground', 'colorSurface', 'colorBorder', 'colorText', 'colorTextSecondary',
      'fontSizeSm', 'fontSizeBase', 'fontSizeLg', 'fontSizeXl',
      'radiusSm', 'radiusMd', 'radiusLg', 'radiusXl',
      'gap2', 'gap3', 'gap4', 'gap6',
      'shadowSm', 'shadowMd'
    ];
    baseVars.forEach((varName) => {
      const v = styles[varName as keyof ComponentStyles];
      if (typeof v === 'string') {
        this.style.setProperty(`--w3a-${this.camelToKebab(varName)}`, v);
      }
    });

    // 2) Promote any other top-level string values to host CSS vars automatically.
    // This ensures all palette keys from base-styles (e.g., DARK_THEME) become available
    // as --w3a-<kebab-name> without maintaining a static allowlist.
    Object.entries(styles).forEach(([key, value]) => {
      if (typeof value === 'string') {
        this.style.setProperty(`--w3a-${this.camelToKebab(key)}`, value);
      }
    });

    // Apply component-specific variables
    Object.entries(styles).forEach(([section, sectionStyles]) => {
      if (sectionStyles && typeof sectionStyles === 'object' && !baseVars.includes(section)) {
        Object.entries(sectionStyles).forEach(([prop, value]) => {
          const kebabSection = this.camelToKebab(section);
          const kebabProp = this.camelToKebab(prop);
          // New convention with double underscores
          const cssVarNew = `--w3a-${prefix}__${kebabSection}__${kebabProp}`;
          this.style.setProperty(cssVarNew, String(value));
        });
      }
    });
  }

  /**
   * Converts camelCase strings to kebab-case for CSS variables
   */
  camelToKebab(str: string): string {
    return str.replace(/([A-Z])/g, '-$1').toLowerCase();
  }
}

/**
 * Generic styles interface for component styling
 */
export interface ComponentStyles extends CSSProperties{
  // Base design system variables
  fontFamily?: string;
  fontSize?: string;
  color?: string;
  backgroundColor?: string;

  // Core color variables
  colorPrimary?: string;
  colorSecondary?: string;
  colorSuccess?: string;
  colorWarning?: string;
  colorError?: string;
  colorBackground?: string;
  colorSurface?: string;
  colorBorder?: string;
  colorText?: string;
  colorTextSecondary?: string;

  // Typography
  fontSizeSm?: string;
  fontSizeBase?: string;
  fontSizeLg?: string;
  fontSizeXl?: string;

  // Spacing and layout
  radiusSm?: string;
  radiusMd?: string;
  radiusLg?: string;
  radiusXl?: string;
  gap2?: string;
  gap3?: string;
  gap4?: string;
  gap6?: string;
  shadowSm?: string;
  shadowMd?: string;

  // Component-specific variables (to be extended by subclasses)
  [key: string]: string | Record<string, string> | undefined;
}
