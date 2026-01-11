/**
 * Lit Component Property Upgrade Pattern
 *
 * Problem: The custom element upgrade race can silently drop properties set
 * on elements before the browser upgrades them from HTMLElement to the custom
 * class. Timeline: createElement → set props → append → upgrade → Lit init →
 * defaults overwrite early props.
 *
 * Solution: upgradeProperty pattern. On connectedCallback, for each declared
 * property, if a plain own-property value exists (set before upgrade), delete
 * the data property and reassign via the class setter to trigger Lit reactivity.
 *
 * This class implements that pattern and adds a few developer affordances:
 * - keepDefinitions: prevent treeshaking of nested custom elements used only
 *   through side-effects in templates by touching their constructors.
 * - requiredChildTags (+strictChildDefinitions): dev-time checks to surface
 *   missing nested element definitions early with a loud console.error or Error.
 * - applyStyles(): map style objects to CSS variables, including section-scoped
 *   tokens and viewport unit normalization (vh→dvh, vw→dvw when supported).
 *
 */

import { LitElement } from 'lit';
import { isObject } from '@/utils/validation';

export type CSSProperties = Record<string, string | Record<string, string> | undefined>;

type KeepDefinition = CustomElementConstructor;

interface LitElementWithPropsStatics {
  keepDefinitions?: ReadonlyArray<KeepDefinition>;
  requiredChildTags?: ReadonlyArray<string>;
  strictChildDefinitions?: boolean;
}

interface AdoptedStyleSheetsOwner {
  adoptedStyleSheets: CSSStyleSheet[];
}

const hasAdoptedStyleSheets = (node: unknown): node is AdoptedStyleSheetsOwner =>
  !!node && typeof node === 'object' && 'adoptedStyleSheets' in node;

const supportsConstructableStylesheets = (): boolean =>
  typeof CSSStyleSheet !== 'undefined' && 'replaceSync' in CSSStyleSheet.prototype;

/**
 * Drop-in replacement for LitElement that automatically handles the custom element upgrade race.
 * See lit-element-with-props.md for more details.
 * All properties defined in static properties will be automatically upgraded on mount.
 */
export class LitElementWithProps extends LitElement {
  // Per-instance CSS custom properties sheet to avoid inline style mutations.
  private _varsSheet: CSSStyleSheet | null = null;
  private _varsMap: Record<string, string> = {};
  // Fallback sheet attached to the Document (constructable stylesheet) + a per-instance class
  private _varsDocSheet: CSSStyleSheet | null = null;
  private _varsClassName: string | null = null;
  // No inline style capability check: components never write inline styles.

  /**
   * Optional: Subclasses can provide a list of imported custom element classes they rely on
   * to prevent bundlers from tree-shaking those definitions when they are only used
   * through side effects (e.g., nested custom elements inside templates).
   * Example usage in a subclass:
   *   import TxTree from '../TxTree';
   *   static keepDefinitions = [TxTree];
   */
  static keepDefinitions?: ReadonlyArray<KeepDefinition>;

  /**
   * Optional: Tag names that should be defined before this component renders.
   * When missing, a console.warn is emitted to remind developers to import/keep the child.
   * Example:
   *   static requiredChildTags = ['w3a-tx-tree'];
   */
  static requiredChildTags?: ReadonlyArray<string>;

  /**
   * When true, missing requiredChildTags trigger a thrown Error (instead of a warn).
   * Useful in development to fail fast when a nested custom element definition
   * has been tree‑shaken or not imported.
   */
  static strictChildDefinitions?: boolean;

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

    // No global token side-effects here; components read tokens from host/theme CSS

    // Ensure referenced definitions are kept by bundlers (touch the values)
    try {
      const ctor = this.constructor as typeof LitElementWithProps & LitElementWithPropsStatics;
      const { keepDefinitions, requiredChildTags, strictChildDefinitions } = ctor;
      const defs = keepDefinitions;
      if (defs && defs.length) {
        // Touch each value to prevent tree-shaking of side-effect-only imports
        for (const d of defs) void d;
      }

      // Dev-time reminder when nested custom elements are not defined
      const req = requiredChildTags;
      if (req && Array.isArray(req)) {
        for (const tag of req) {
          try {
            if (typeof tag === 'string' && tag.includes('-') && !customElements.get(tag)) {
              const msg = `[W3A] Required child custom element not defined: <${tag}>. ` +
                'Import the module that defines it and keep a reference via `static keepDefinitions` ' +
                'or a private field to avoid tree-shaking. See LitComponents/README.md (tree-shake checklist).';
              if (strictChildDefinitions) {
                throw new Error(msg);
              } else {
                // Elevate to error for visibility without breaking execution
                console.error(msg);
              }
            }
          } catch (err) {
            // In strict mode, surface the failure to developers immediately
            if (strictChildDefinitions) { throw err; }
          }
        }
      }
    } catch {}
  }

  /**
   * Override this method in subclasses to return the appropriate component prefix
   * for CSS variable naming (e.g., 'tree', 'modal', 'button').
   */
  protected getComponentPrefix(): string {
    return 'component';
  }

  /**
   * Applies component styles by translating a structured style object into
   * CSS custom properties (variables) — never inline styles.
   *
   * CSP notes
   * - No style="…" attributes are written (compatible with style-src-attr 'none').
   * - No <style> tags are injected. Variables are applied via constructable
   *   stylesheets (adoptedStyleSheets). When unavailable, we fall back to a
   *   document-level constructable sheet with a per-instance class. If even
   *   that is not supported, we no-op and rely on external CSS defaults.
   *
   * How it works
   * - Flattens top-level tokens (e.g., colors, radii) to canonical CSS vars
   *   (e.g., --w3a-colors-*, --w3a-border-radius-*).
   * - Transforms viewport units to dvh/dvw on capable engines to avoid
   *   Safari 100vh issues.
   * - Maps sectioned styles (nested objects) to namespaced variables of the
   *   form --w3a-${prefix}__${section}__${prop} to scope tokens per-component.
   * - Delegates to setCssVars(), which merges vars and updates the appropriate
   *   constructable stylesheet target (ShadowRoot preferred).
   *
   * @param styles - The styles object to apply
   * @param componentPrefix - Optional component prefix override, defaults to getComponentPrefix()
   */
  protected applyStyles(styles: ComponentStyles, componentPrefix?: string): void {
    if (!styles) return;

    const prefix = componentPrefix || this.getComponentPrefix();
    const vars: Record<string, string> = {};
    const setVar = (name: string, val: string) => { vars[name] = val; };
    const toKebab = (s: string) => this.camelToKebab(s);

    // Prefer dynamic viewport units on capable browsers to avoid Safari 100vh/100vw issues
    const transformViewportUnits = (val: string): string => {
      if (!val || typeof val !== 'string') return val;
      try {
        const canUseCssSupports = typeof CSS !== 'undefined' && typeof CSS.supports === 'function';
        const supportsDvh = canUseCssSupports && CSS.supports('height', '1dvh');
        const supportsDvw = canUseCssSupports && CSS.supports('width', '1dvw');
        let out = val;
        if (supportsDvh && out.includes('vh')) {
          // Replace numeric vh occurrences (e.g., 50vh, calc(100vh - 1rem)) with dvh
          out = out.replace(/([0-9]+(?:\.[0-9]+)?)vh\b/g, '$1dvh');
        }
        if (supportsDvw && out.includes('vw')) {
          out = out.replace(/([0-9]+(?:\.[0-9]+)?)vw\b/g, '$1dvw');
        }
        return out;
      } catch {
        return val;
      }
    };

    // Map known tokens to canonical CSS variables
    const colorMappings: Record<string, string> = {
      colorSecondary: '--w3a-colors-secondary',
      colorSuccess: '--w3a-colors-success',
      colorWarning: '--w3a-colors-warning',
      colorError: '--w3a-colors-error',
      colorBackground: '--w3a-colors-colorBackground',
      surface: '--w3a-colors-surface',
      surface2: '--w3a-colors-surface2',
      surface3: '--w3a-colors-surface3',
      borderPrimary: '--w3a-colors-borderPrimary',
      borderSecondary: '--w3a-colors-borderSecondary',
      borderHover: '--w3a-colors-borderHover',
      textPrimary: '--w3a-colors-textPrimary',
      textSecondary: '--w3a-colors-textSecondary',
      textMuted: '--w3a-colors-textMuted',
    };

    const radiusMatcher = /^radius([A-Z].*)$/;
    const shadowMatcher = /^shadow([A-Z].*)$/;

    Object.entries(styles).forEach(([key, value]) => {
      if (typeof value !== 'string') return;

      const maybeTransformed = transformViewportUnits(value);

      if (key in colorMappings) {
        setVar(colorMappings[key], maybeTransformed);
        return;
      }

      const r = key.match(radiusMatcher);
      if (r) { setVar(`--w3a-border-radius-${r[1].toLowerCase()}`, maybeTransformed); return; }

      const s = key.match(shadowMatcher);
      if (s) { setVar(`--w3a-shadows-${s[1].toLowerCase()}`, maybeTransformed); return; }

      // No legacy gap variables; rely on spacing tokens only.
      setVar(`--w3a-${toKebab(key)}`, maybeTransformed);
    });

    // Component-scoped CSS variables
    Object.entries(styles).forEach(([section, sectionStyles]) => {
      if (sectionStyles && isObject(sectionStyles)) {
        Object.entries(sectionStyles).forEach(([prop, value]) => {
          const kebabSection = toKebab(section);
          const kebabProp = toKebab(prop);
          const cssVarNew = `--w3a-${prefix}__${kebabSection}__${kebabProp}`;
          const v = typeof value === 'string' ? transformViewportUnits(value) : String(value);
          vars[cssVarNew] = v;
        });
      }
    });

    this.setCssVars(vars);
  }

  /**
   * Converts camelCase strings to kebab-case for CSS variables
   */
  camelToKebab(str: string): string {
    return str.replace(/([A-Z])/g, '-$1').toLowerCase();
  }

  /** Merge and apply CSS variables via adopted stylesheets only (no inline style attr). */
  protected setCssVars(vars: Record<string, string>): void {
    try {
      // Merge new vars
      for (const [k, v] of Object.entries(vars)) {
        if (v == null) continue;
        this._varsMap[k] = String(v);
      }
      const decls = Object.entries(this._varsMap)
        .map(([k, v]) => `${k}: ${v};`)
        .join(' ');

      const cssTextShadow = `:host{ ${decls} }`;
      const canUseConstructable = supportsConstructableStylesheets();

      // 1) Preferred: ShadowRoot adopted stylesheets
      if (this.renderRoot instanceof ShadowRoot && canUseConstructable && hasAdoptedStyleSheets(this.renderRoot)) {
        if (!this._varsSheet) this._varsSheet = new CSSStyleSheet();
        try { this._varsSheet.replaceSync(cssTextShadow); } catch {}
        const sheets = this.renderRoot.adoptedStyleSheets ?? [];
        // Ensure the vars sheet is last so its :host var declarations override defaults
        const without = sheets.filter(sheet => sheet !== this._varsSheet);
        this.renderRoot.adoptedStyleSheets = [...without, this._varsSheet];
        return;
      }

      // 2) Fallback (still CSP-safe): Document-level constructable stylesheet with per-instance class
      const rootNode = this.getRootNode?.();
      const doc = rootNode instanceof Document ? rootNode : document;
      const cssTextScoped = () => {
        if (!this._varsClassName) {
          this._varsClassName = `w3a-vars-${Math.random().toString(36).slice(2)}`;
          try { this.classList.add(this._varsClassName); } catch {}
        }
        return `.${this._varsClassName}{ ${decls} }`;
      };
      // Try attaching a constructable sheet to the nearest ShadowRoot when present
      if (rootNode && canUseConstructable && hasAdoptedStyleSheets(rootNode)) {
        if (!this._varsDocSheet) this._varsDocSheet = new CSSStyleSheet();
        try { this._varsDocSheet.replaceSync(cssTextScoped()); } catch {}
        const srSheets = rootNode.adoptedStyleSheets ?? [];
        if (!srSheets.includes(this._varsDocSheet)) {
          rootNode.adoptedStyleSheets = [...srSheets, this._varsDocSheet];
        }
        return;
      }
      // Otherwise, attach to Document (styles won’t pierce closed shadow DOMs, but helps for light DOM cases)
      const docSupportsConstructable = canUseConstructable && hasAdoptedStyleSheets(doc);
      if (docSupportsConstructable) {
        if (!this._varsDocSheet) this._varsDocSheet = new CSSStyleSheet();
        try { this._varsDocSheet.replaceSync(cssTextScoped()); } catch {}
        const current = doc.adoptedStyleSheets ?? [];
        if (!current.includes(this._varsDocSheet)) {
          doc.adoptedStyleSheets = [...current, this._varsDocSheet];
        }
        return;
      }

      // 3) Final fallback: no inline writes under strict CSP; rely on defaults
    } catch {}
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
  primary?: string;
  colorSecondary?: string;
  colorSuccess?: string;
  colorWarning?: string;
  colorError?: string;
  colorBackground?: string;
  surface?: string;
  surface2?: string;
  surface3?: string;
  borderPrimary?: string;
  textPrimary?: string;
  textSecondary?: string;

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
  // Use spacing tokens via theme; no legacy gap vars
  shadowSm?: string;
  shadowMd?: string;

  // Component-specific variables (to be extended by subclasses)
  [key: string]: string | Record<string, string> | undefined;
}
