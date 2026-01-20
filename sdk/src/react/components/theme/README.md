# Theming

A single theme module powers the UI using a scoped token → CSS variable system applied via a provider and a boundary element.

## Exports (single module)

- `Theme` — consolidated component. By default provides theme context and renders a boundary that applies CSS variables and `data-w3a-theme`. `mode` controls behavior: `'provider+scope' | 'provider-only' | 'scope-only'`.
- `useTheme` — reads from context and returns `{ theme, tokens, isDark }`.

Import from the barrel for clarity:

```
import { Theme, useTheme } from '@tatchi-xyz/sdk/react';
// or within this repo: from '../theme'
```

## Token → CSS Variable Mapping

Tokens are defined in `design-tokens.ts` and converted to CSS custom properties with a prefix (default `--w3a`) via `createCSSVariables` in `utils.ts`.

- Colors: `tokens.colors.<key>` → `--<prefix>-colors-<key>`
- Spacing: `tokens.spacing.<key>` → `--<prefix>-spacing-<key>`
- Radius: `tokens.borderRadius.<key>` → `--<prefix>-border-radius-<key>`
- Shadows: `tokens.shadows.<key>` → `--<prefix>-shadows-<key>`

The mapping is applied inline by the `Theme` boundary element.

## Naming Convention

- Token keys are lowerCamelCase (e.g., `colorBackground`, `textSecondary`).
- CSS variables are prefixed with `--w3a` by default. Change via `Theme`'s `prefix` prop to avoid collisions when embedding.

Examples in CSS:

- Background: `background-color: var(--w3a-colors-colorBackground);`
- Border: `border-color: var(--w3a-colors-borderPrimary);`
- Text: `color: var(--w3a-colors-textPrimary);`
- Hover border: `border-color: var(--w3a-colors-borderHover);`

## Controlled Only

- Pass `theme="dark" | "light"` and treat the host app as the source of truth.
- `Theme` does not persist or auto-derive theme state; it only reflects the provided value.

## Token Overrides (per instance)

Pass partial overrides for dark/light only for the keys you need to change:

```
<Theme tokens={{
  dark: { colors: { colorBackground: 'oklch(0.25 0.012 240)' } },
  light: { colors: { borderHover: '#cbd5e1' } }
}} as="div" className="w3a-theme-provider">
  ...
```

You can also provide a function to compute overrides from the base tokens via the `tokens` prop.

## CSS Color Variables (reference)

The following CSS variables are generated from `tokens.colors.*` with the default prefix `--w3a`.

```
/* Color variables applied on the Theme boundary (default prefix: --w3a) */
--w3a-colors-primary
--w3a-colors-primaryHover
--w3a-colors-secondary
--w3a-colors-accent
--w3a-colors-textPrimary
--w3a-colors-textSecondary
--w3a-colors-textMuted
--w3a-colors-colorBackground
--w3a-colors-surface
--w3a-colors-surface2
--w3a-colors-hover
--w3a-colors-active
--w3a-colors-focus
--w3a-colors-success
--w3a-colors-warning
--w3a-colors-error
--w3a-colors-info
--w3a-colors-borderPrimary
--w3a-colors-borderSecondary
--w3a-colors-borderHover
```

## Notes

- `variables.css` in AccountMenuButton is legacy and safe to remove if unused.
