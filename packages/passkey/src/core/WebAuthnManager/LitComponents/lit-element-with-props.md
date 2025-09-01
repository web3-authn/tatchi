# Lit Component Property Upgrade Pattern

> **Note**: This guide uses decorator-free Lit syntax to avoid ESM and compilation issues. All examples use `static properties` instead of `@property` decorators and `customElements.define()` instead of `@customElement`.

## The Problem: Custom Element Upgrade Race

When working with Lit components, there's a critical timing issue known as the "custom element upgrade race" that can cause property values to be lost or overwritten. This happens when properties are set on a custom element before it has fully upgraded from a plain HTMLElement to its custom class.

### Timeline of the Issue

1. **Element Creation**: `document.createElement('my-component')` creates a plain HTMLElement
2. **Property Assignment**: Code sets properties: `element.myProp = value`
3. **DOM Insertion**: Element is added to DOM
4. **Custom Element Upgrade**: Browser upgrades element to custom class
5. **Lit Initialization**: Lit sets up reactivity and may overwrite properties with defaults
6. **Property Loss**: Original values from step 2 are lost

### Real-World Example

```typescript
// This can fail silently:
const el = document.createElement('tooltip-tx-tree');
el.node = complexTreeData;           // Set before upgrade
document.body.appendChild(el);       // Triggers upgrade
// el.node might now be undefined or default value!
```

## The Solution: upgradeProperty Pattern

The `upgradeProperty` pattern is the official Lit solution for handling pre-upgrade property assignments. It works by re-applying property values through the element's setter during `connectedCallback`.

### How upgradeProperty Works

```typescript
upgradeProperty(prop: string) {
  if (this.hasOwnProperty(prop)) {
    // Get the current value that was set before upgrade
    const value = (this as Record<string, string | number | boolean | object | null | undefined>)[prop];
    // Delete the property so the class getter/setter takes over
    delete (this as Record<string, string | number | boolean | object | null | undefined>)[prop];
    // Re-assign through the proper setter, triggering Lit's reactivity
    (this as Record<string, string | number | boolean | object | null | undefined>)[prop] = value;
  }
}
```

## Base Component Implementation

Here's a robust base class that handles property upgrades automatically:

```typescript
import { LitElement, PropertyValues } from 'lit';

/**
 * Drop-in replacement for LitElement that automatically handles the custom element upgrade race.
 *
 * Simply extend this instead of LitElement - no other changes needed!
 * All properties defined in static properties will be automatically upgraded on mount.
 */
export class LitElementWithProps extends LitElement {
  /**
   * Handles the custom element upgrade race for a specific property.
   *
   * This method ensures that any property values set before the custom element
   * fully upgrades are correctly re-applied through Lit's property system.
   *
   * @param prop - The property name to upgrade
   */
  private upgradeProperty(prop: string): void {
    if (Object.prototype.hasOwnProperty.call(this, prop)) {
      // Capture the value that was set before upgrade
      const selfRead = this as Record<string, string | number | boolean | object | null | undefined>;
      const value = selfRead[prop];

      // Remove the property so the class getter/setter takes over
      delete selfRead[prop];

      // Re-assign through the proper setter to trigger Lit's reactivity
      (this as Record<string, string | number | boolean | object | null | undefined>)[prop] = value;

      if (process.env.NODE_ENV !== 'production') {
        console.debug(`[LitElementWithProps] Upgraded property '${prop}' with value:`, value);
      }
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
```

## Usage Example

Here's how simple it is to use - just change `LitElement` to `LitElementWithProps`:

```typescript
import { html, css } from 'lit';
import { LitElementWithProps } from './LitElementWithProps';

interface TreeNode {
  id: string;
  label: string;
  children?: TreeNode[];
}

interface TreeStyles {
  backgroundColor?: string;
  textColor?: string;
  borderRadius?: string;
}

// Just extend LitElementWithProps instead of LitElement - that's it!
export class TooltipTxTree extends LitElementWithProps {
  static styles = css`
    :host {
      display: block;
      font-family: var(--tree-font-family, monospace);
    }
  `;

  // Define properties exactly like normal Lit - no changes needed
  static properties = {
    node: { type: Object, attribute: false },
    styles: { type: Object, attribute: false },
    depth: { type: Number }
  };

  // Properties work exactly like normal Lit - no changes needed
  node?: TreeNode;
  styles?: TreeStyles;
  depth: number = 0;

  render() {
    if (!this.node) {
      return html`<div>No data</div>`;
    }

    return html`
      <div class="tree-node" style="${this.getNodeStyles()}">
        <span class="label">${this.node.label}</span>
        ${this.node.children?.map(child => html`
          <tooltip-tx-tree
            .node=${child}
            .styles=${this.styles}
            .depth=${this.depth + 1}>
          </tooltip-tx-tree>
        `)}
      </div>
    `;
  }

  private getNodeStyles(): string {
    const styles = this.styles || {};
    return [
      styles.backgroundColor && `background-color: ${styles.backgroundColor}`,
      styles.textColor && `color: ${styles.textColor}`,
      styles.borderRadius && `border-radius: ${styles.borderRadius}`,
      `padding-left: ${this.depth * 16}px`
    ].filter(Boolean).join('; ');
  }
}

// Register the custom element
customElements.define('tooltip-tx-tree', TooltipTxTree);
```
