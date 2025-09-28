# Theming

A single theme module powers the UI using a scoped token → CSS variable system applied via a provider and a boundary element.

## Exports (single module)

- `ThemeProvider` — subscribes to user preferences (uncontrolled) or accepts a controlled `theme` prop, merges token overrides, and exposes resolved tokens. See: `packages/passkey/src/react/components/theme/ThemeProvider.tsx:1`.
- `ThemeScope` — applies resolved tokens as CSS custom properties on a wrapping element and sets a `data-w3a-theme` attribute. Exported from `ThemeProvider.tsx`.
- `useTheme` — reads from context and returns `{ theme, tokens, isDark, toggleTheme, setTheme }`. Exported from `ThemeProvider.tsx`.

Import from the barrel for clarity:

```
import { ThemeProvider, ThemeScope, useTheme } from '@web3authn/passkey/react/dist/react/components/theme';
// or within this repo: from '../theme'
```

## Token → CSS Variable Mapping

Tokens are defined in `design-tokens.ts` and converted to CSS custom properties with a prefix (default `--w3a`) via `createCSSVariables` in `utils.ts`.

- Colors: `tokens.colors.<key>` → `--<prefix>-colors-<key>`
- Spacing: `tokens.spacing.<key>` → `--<prefix>-spacing-<key>`
- Radius: `tokens.borderRadius.<key>` → `--<prefix>-border-radius-<key>`
- Shadows: `tokens.shadows.<key>` → `--<prefix>-shadows-<key>`

The mapping is applied inline by `ThemeScope` on the boundary element.

## Naming Convention

- Token keys are lowerCamelCase (e.g., `colorBackground`, `textSecondary`).
- CSS variables are prefixed with `--w3a` by default. Change via `ThemeProvider`'s `prefix` prop to avoid collisions when embedding.

Examples in CSS:

- Background: `background-color: var(--w3a-colors-colorBackground);`
- Border: `border-color: var(--w3a-colors-borderPrimary);`
- Text: `color: var(--w3a-colors-textPrimary);`
- Hover border: `border-color: var(--w3a-colors-borderHover);`

## Controlled vs Uncontrolled

- Controlled: pass `theme="dark" | "light"` and handle `onThemeChange`.
- Uncontrolled: omit `theme` and optionally set `defaultTheme`. The provider listens to `passkeyManager.userPreferences` and `prefers-color-scheme` for initial value and persists using localStorage when not available.

## Token Overrides (per instance)

Pass partial overrides for dark/light only for the keys you need to change:

```
<ThemeProvider tokens={{
  dark: { colors: { colorBackground: 'oklch(0.25 0.012 240)' } },
  light: { colors: { borderHover: '#cbd5e1' } }
}}>
  <ThemeScope>...
```

You can also provide a function to compute overrides from the base tokens. See `ThemeProviderProps` in `ThemeProvider.tsx`.

## CSS Color Variables (reference)

The following CSS variables are generated from `tokens.colors.*` with the default prefix `--w3a`.

```
/* Color variables applied on the ThemeScope boundary (default prefix: --w3a) */
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

- `variables.css` in ProfileSettingsButton is legacy and safe to remove if unused.
