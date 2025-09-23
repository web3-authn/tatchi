# CSS Variable Consistency Plan (All-or-Nothing Cutover)

Objective: unify base theming variable names across Lit and React so all components reference the same canonical CSS custom properties. No legacy aliases or phased migration. Implement everything in one change; do not land partial transitions.

Important: leaving the app in a half‑transitioned state is worse than not doing it at all. This is a single synchronized change across the repo.

## Canonical Naming Scheme

- Colors: `--w3a-colors-*`
- Spacing: `--w3a-spacing-*`
- Radius: `--w3a-border-radius-*`
- Shadows: `--w3a-shadows-*`
- Component‑scoped vars remain: `--w3a-<component>__<section>__<prop>`

## Legacy Names To Remove

- Remove all references and generation of:
  - `--w3a-color-*` (e.g., `--w3a-color-background`, `--w3a-color-border`, `--w3a-color-primary`, …)
  - `--w3a-text-*` (e.g., `--w3a-text-primary`, `--w3a-text-muted`, …)
- Remove any var() fallbacks that point to these legacy names.

## Single Cutover Plan

1) Update React ThemeProvider output
   - File: `passkey-sdk/src/react/components/theme/utils.ts`
   - Change `createCSSVariables` to emit only canonical names:
     - Colors → `--w3a-colors-*`
     - Spacing → `--w3a-spacing-*`
     - Radius → `--w3a-border-radius-*`
     - Shadows → `--w3a-shadows-*`
   - Do not emit any legacy aliases.

2) Update Lit base style emission
   - File: `passkey-sdk/src/core/WebAuthnManager/LitComponents/LitElementWithProps.ts`
   - Where base variables are promoted from `styles` to CSS custom properties, write canonical `--w3a-colors-*` names for color/text keys.
   - Stop emitting legacy `--w3a-color-*` and `--w3a-text-*` variables entirely.
   - Keep component‑scoped vars (`--w3a-<component>__…`) unchanged.

3) Update all component CSS/templates to canonical names
   - Replace every usage of legacy names with canonical names. Examples:
     - `--w3a-text-primary` → `--w3a-colors-textPrimary`
     - `--w3a-text-secondary` → `--w3a-colors-textSecondary`
     - `--w3a-text-muted` → `--w3a-colors-textMuted`
     - `--w3a-color-background` → `--w3a-colors-colorBackground`
     - `--w3a-color-surface` → `--w3a-colors-colorSurface`
     - `--w3a-color-border` → `--w3a-colors-colorBorder`
     - `--w3a-color-primary` → `--w3a-colors-primary`
     - `--w3a-color-secondary` → `--w3a-colors-secondary`
     - `--w3a-color-success` → `--w3a-colors-success`
     - `--w3a-color-warning` → `--w3a-colors-warning`
     - `--w3a-color-error` → `--w3a-colors-error`
   - Remove var() fallback chains to legacy names; keep only canonical.

4) Repo‑wide search/replace (examples)
   - Search: `rg -n --no-ignore "--w3a-(text|color)-(background|surface|border|primary|secondary|success|warning|error)"`
   - Replace (BSD sed examples):
     - `sed -E -i '' 's/--w3a-text-primary/--w3a-colors-textPrimary/g' $(rg -l --no-ignore "--w3a-text-primary")`
     - `sed -E -i '' 's/--w3a-text-secondary/--w3a-colors-textSecondary/g' $(rg -l --no-ignore "--w3a-text-secondary")`
     - `sed -E -i '' 's/--w3a-text-muted/--w3a-colors-textMuted/g' $(rg -l --no-ignore "--w3a-text-muted")`
     - `sed -E -i '' 's/--w3a-color-background/--w3a-colors-colorBackground/g' $(rg -l --no-ignore "--w3a-color-background")`
     - `sed -E -i '' 's/--w3a-color-surface/--w3a-colors-colorSurface/g' $(rg -l --no-ignore "--w3a-color-surface")`
     - `sed -E -i '' 's/--w3a-color-border/--w3a-colors-colorBorder/g' $(rg -l --no-ignore "--w3a-color-border")`
     - `sed -E -i '' 's/--w3a-color-primary/--w3a-colors-primary/g' $(rg -l --no-ignore "--w3a-color-primary")`
     - `sed -E -i '' 's/--w3a-color-secondary/--w3a-colors-secondary/g' $(rg -l --no-ignore "--w3a-color-secondary")`
     - `sed -E -i '' 's/--w3a-color-success/--w3a-colors-success/g' $(rg -l --no-ignore "--w3a-color-success")`
     - `sed -E -i '' 's/--w3a-color-warning/--w3a-colors-warning/g' $(rg -l --no-ignore "--w3a-color-warning")`
     - `sed -E -i '' 's/--w3a-color-error/--w3a-colors-error/g' $(rg -l --no-ignore "--w3a-color-error")`

5) Remove temporary/ad‑hoc fallbacks
   - Eliminate any `var(--w3a-colors-*, var(--w3a-…))` constructs added to bridge Lit/React.
   - Keep only canonical `--w3a-colors-*` references.

6) Rebuild and verify dist
   - Rebuild SDK and embedded bundles to ensure produced CSS/JS uses canonical names only.

## Validation

- Grep must return zero results for legacy names:
  - `rg -n --no-ignore "--w3a-(text|color)-"` → no matches
- No console warnings about missing CSS variables in examples and tests.
- Visual diff in dark/light themes shows no regressions.

## Release & Communication

- This is a breaking change; bump a major version.
- Document the mapping (above) and update the style guide.
- If third‑party consumers style our components, communicate the rename ahead of the release.

## Ownership & Timeline

- Ownership: SDK UI/theming owner; reviewers: wallet iframe + examples owners
- Timeline: complete in a single PR that updates ThemeProvider, Lit base emission, and all usages. Land only after passing validation.
