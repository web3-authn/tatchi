# Theme Component Consolidation Plan

Goal: reduce boilerplate by consolidating `ThemeProvider` and `ThemeScope` into a single ergonomic component while preserving all existing capabilities and enabling a safe, incremental migration.

## Summary

- Introduce a new `Theme` component that, by default, both provides theme state and scopes CSS variables/attributes to a boundary element.
- Keep `ThemeProvider` and `ThemeScope` as thin wrappers around `Theme` for backward compatibility, and mark them deprecated in docs/typings.
- Provide an explicit escape hatch to render provider-only or scope-only boundaries to preserve advanced use cases (nested scoping, Shadow DOM, portaled content).

## Current Responsibilities

- `ThemeProvider`
  - State source: controlled (`theme` prop) or uncontrolled (`defaultTheme` + persistence).
  - Persistence: integrates with `passkeyManager.userPreferences` when available; falls back to `localStorage`.
  - Tokens: merges overrides (object or function) with `LIGHT_TOKENS` and `DARK_TOKENS`.
  - Context: exposes `{ theme, tokens, isDark, setTheme, toggleTheme, prefix }` and precomputed `vars` (`CSSProperties` mapping via `createCSSVariables`).
- `ThemeScope`
  - Boundary: renders an element (`as`, `className`, `style`).
  - Styling: applies inline CSS custom properties (`vars`) and sets a theme data attribute (default `data-w3a-theme`).

These are already co-located in `sdk/src/react/components/theme/ThemeProvider.tsx`, but used as two wrappers.

## Proposed API

- New component: `Theme`
  - Default behavior: provides context and scopes the boundary (provider + scope).
  - Props
    - Provider props: `theme?`, `defaultTheme?`, `onThemeChange?`, `tokens?`, `prefix?`
    - Boundary props: `as? = 'div'`, `className?`, `style?`, `dataAttr? = 'data-w3a-theme'`
    - Mode prop: `mode?: 'provider+scope' | 'provider-only' | 'scope-only'` (default: `provider+scope`)
  - Notes
    - Keeps `style` precedence over generated vars: `style={{ ...vars, ...style }}`.
    - Works under Shadow DOM (same as today), and supports nested scoping.

- Back-compat wrappers
  - `ThemeProvider` → `({ children, ...rest }) => <Theme mode="provider-only" {...rest}>{children}</Theme>`
  - `ThemeScope` → `({ children, as, className, style, dataAttr }) => <Theme mode="scope-only" as={as} className={className} style={style} dataAttr={dataAttr}>{children}</Theme>`
  - Mark both as deprecated in TSDoc and docs with migration guidance.

## Usage Examples

- Default (replaces Provider + Scope pair)

  ```tsx
  import { Theme } from '@tatchi/sdk/react';

  <Theme as="div" className="app-theme-scope">
    {/* app */}
  </Theme>
  ```

- Provider-only (rare; for apps that scope elsewhere)

  ```tsx
  <Theme mode="provider-only">{children}</Theme>
  ```

- Scope-only (add a nested boundary without new provider)

  ```tsx
  <Theme mode="scope-only" as="section" className="section-scope">{children}</Theme>
  ```

- Controlled + overrides

  ```tsx
  <Theme theme={theme} onThemeChange={setTheme}
         tokens={({ light, dark }) => ({ dark: { colors: { colorBackground: dark.colors.surface } } })}
         as="div" className="app-theme-scope">
    {children}
  </Theme>
  ```

## Migration Plan

1. Add `Theme` component
   - Implement in `sdk/src/react/components/theme/ThemeProvider.tsx` (or `Theme.tsx`) reusing existing logic.
   - Compose existing provider logic and boundary rendering in one component with `mode` to control behavior.
2. Back-compat wrappers
   - Refactor `ThemeProvider` and `ThemeScope` to be thin wrappers over `Theme` with the appropriate `mode`.
   - Add TSDoc `@deprecated` with replacement snippets; optionally `console.warn` in dev builds.
3. Exports
   - Export `Theme` from `sdk/src/react/components/theme/index.ts` alongside existing exports.
4. Docs
   - Update theme README and all guides to show `Theme` as the primary API.
   - Keep a “Legacy usage” section for `ThemeProvider`/`ThemeScope` with a sunset note.
5. Repo migration (incremental)
   - Replace pairs `<ThemeProvider><ThemeScope ...> ... </ThemeScope></ThemeProvider>` with a single `<Theme ...>`.
   - Replace standalone `<ThemeScope>` with `<Theme mode="scope-only">`.
   - Replace standalone `<ThemeProvider>` with `<Theme mode="provider-only">` if necessary.
6. QA and tests
   - Verify CSS variables resolve and `data-w3a-theme` is set on boundaries.
   - Check uncontrolled persistence (userPreferences/localStorage) and controlled mode.
   - Confirm Shadow DOM and nested scope behavior in examples and Storybook (if available).
7. Deprecation timeline
   - vNext: release `Theme`, deprecate old components in typings/docs.
   - +1 minor: migrate internal examples; emit dev-time warnings for legacy usage.
   - +2 minors: consider making legacy exports re-export `Theme` types only; remove warnings.

## Risk & Considerations

- Behavioral parity
  - Ensure the default `Theme` renders a boundary element (like `ThemeScope`) so CSS relying on `[data-w3a-theme]` keeps working.
  - Preserve `style` override precedence over generated variables.
- Nested boundaries
  - Some code may rely on nested `ThemeScope` for localized styling; `mode='scope-only'` must remain supported.
- SSR/FOUC
  - Continue using system preference as the initial theme on first render to minimize flash.
  - Optionally document an SSR snippet to pre-set `data-w3a-theme` on the root element.
- Prefix collisions
  - Keep `prefix` prop and defaults; verify no changes to variable naming (`--w3a-*`).

## Work Items Checklist

- [ ] Implement `Theme` with `mode` prop
- [ ] Refactor wrappers (`ThemeProvider`, `ThemeScope`) to delegate to `Theme`
- [ ] Export `Theme` from the barrel
- [ ] Update theming README and usage in docs
- [ ] Migrate repo examples incrementally
- [ ] Add minimal tests/QA scenarios for boundary rendering and persistence

## Open Questions

- Naming: `Theme` vs `ThemeRoot` vs `ThemeBoundary` — propose `Theme` for brevity.
- Should we add `persist?: boolean` (default true) to disable local/profile persistence for strictly controlled usage?
- Do we want to attach `color-scheme` automatically based on theme to assist native form controls? (Can be handled in CSS or within the boundary.)

## PasskeyProvider Consolidation

Question: Can we consolidate `ThemeProvider` and `ThemeScope` directly into `PasskeyProvider`?

### Feasibility

- Technically possible, because `ThemeProvider` already integrates with `passkeyManager.userPreferences` when available.
- Not advisable as a hard merge: theming is intentionally usable without authentication context (docs, web components, and standalone widgets). Folding theme into `PasskeyProvider` would over‑couple concerns and break headless/non‑auth use cases.

### Options

- Option A — Composition inside PasskeyProvider (opt‑in)
  - Add an optional prop to `PasskeyProvider` such as `withTheme?: boolean | ThemeProps`.
  - When truthy, `PasskeyProvider` wraps its children with `<Theme {...(typeof withTheme === 'object' ? withTheme : undefined)} />` using `mode="provider+scope"`.
  - Default `withTheme = false` to preserve current rendering and avoid introducing an extra boundary by default.

- Option B — New App Shell component (recommended)
  - Introduce `<PasskeyAppShell>` that composes both concerns:
    ```tsx
    <PasskeyAppShell theme={{ as: 'main', className: 'app-theme-scope' }} config={config}>
      {children}
    </PasskeyAppShell>
    ```
    Internally renders:
    ```tsx
    <Theme {...theme}><PasskeyProvider config={config}>{children}</PasskeyProvider></Theme>
    ```
  - Keeps `PasskeyProvider` focused on auth, and offers a one‑liner for app setup.

- Option C — Hard merge into PasskeyProvider (not recommended)
  - Always render theme boundary/context inside `PasskeyProvider`.
  - Cons: increases coupling, makes theme unavailable outside auth, risks breaking existing consumers that expect no extra DOM wrapper.

### Recommendation

- Adopt Option B (new `PasskeyAppShell`) for ergonomic usage in apps and demos.
- Option A can be added later for convenience, but keep it opt‑in.
- Do not hard‑merge theme into `PasskeyProvider`.

### Implementation Steps (Option B)

1. Create `sdk/src/react/components/shell/PasskeyAppShell.tsx` exporting a single component that composes `<Theme>` and `<PasskeyProvider>`.
2. Export `PasskeyAppShell` from `sdk/src/react/index.ts`.
3. Update docs and examples to prefer `PasskeyAppShell` where appropriate (replace three‑wrapper boilerplate).
4. Keep `Theme` standalone and documented for advanced layouts (e.g., nested scopes, Shadow DOM, micro‑frontends).

### Example Migration

Current:
```tsx
<ThemeProvider>
  <ThemeScope as="main" className="app-theme-scope">
    <PasskeyProvider config={config}>{children}</PasskeyProvider>
  </ThemeScope>
</ThemeProvider>
```

After:
```tsx
<PasskeyAppShell theme={{ as: 'main', className: 'app-theme-scope' }} config={config}>
  {children}
</PasskeyAppShell>
```

Or explicit composition with `Theme`:
```tsx
<Theme as="main" className="app-theme-scope">
  <PasskeyProvider config={config}>{children}</PasskeyProvider>
</Theme>
```
