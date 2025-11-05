# Custom Themes

Create and apply your own color scheme to the SDK while keeping light/dark switching predictable and consistent.

## Overview

You define a small colors object (your "scheme") that follows the SDK’s design token keys. Then you tell the SDK whether that scheme applies to light or dark. Everything plugs into the existing theme system so React components and Lit elements read the same CSS variables.

Two easy ways to use a custom scheme:

1) React apps — pass overrides to `Theme` (recommended)
2) Non‑React / web components — emit CSS variables from tokens and inject them

The SDK still treats theme as `light | dark`; your scheme is attached to one or both sides.

---

## Minimal Scheme (example)

```ts
// Your scheme – use OKLCH or any CSS color
const creamColors = {
  textPrimary: 'oklch(0.10 0.005 240)',
  textSecondary: 'oklch(0.53 0.020 240)',
  textMuted: 'oklch(0.60 0.021 240)',
  colorBackground: 'oklch(0.98 0.006 95)',
  surface: 'oklch(0.95 0.010 95)',
  surface2: 'oklch(0.92 0.012 95)',
  borderPrimary: 'oklch(0.81 0.018 95)',
  borderSecondary: 'oklch(0.885 0.014 95)',
  hover: 'oklch(0.965 0.008 95)',
  active: 'oklch(0.93 0.011 95)',
  primary: 'oklch(0.30 0.015 240)',      // charcoal CTA
  primaryHover: 'oklch(0.35 0.018 240)',
  accent: 'oklch(0.62 0.176 255)',       // muted blue
};
```

You can override as few or as many keys as you want. Unspecified keys fall back to the SDK’s base tokens.

Useful reference for keys: `sdk/src/react/components/theme/design-tokens.ts` (DesignTokens.colors).

---

## Option 1 — React: Apply overrides with `Theme`

```tsx
import { Theme } from '@tatchi-xyz/sdk/react';

export function App() {
  return (
    <Theme
      // Choose which side your scheme applies to
      defaultTheme="light"
      tokens={{
        light: { colors: creamColors },
        // dark: { colors: myDarkColors },
      }}
    >
      {/* your app */}
    </Theme>
  );
}
```

Controlled usage (explicit light/dark):

```tsx
<Theme
  theme="light"
  onThemeChange={(t) => console.log('theme ->', t)}
  tokens={{ light: { colors: creamColors } }}
>
  ...
</Theme>
```

Advanced: compute overrides from base tokens

```tsx
<Theme
  tokens={({ light, dark }) => ({
    light: { colors: { ...light.colors, ...creamColors } },
    // dark: { colors: { ...dark.colors, ...myDarkColors } }
  })}
>
  ...
</Theme>
```

Notes
- `Theme` exposes `useTheme()` → `{ theme, tokens, isDark, setTheme, toggleTheme }`.
- When used with `PasskeyProvider`, user theme sync can be enabled via ThemeProvider (see file comments in `ThemeProvider.tsx`).

---

## Option 2 — Web Components (no React): Inject CSS variables

If you aren’t using React, generate CSS variables from tokens and inject them at runtime. Lit components read the same variables.

Important: because Lit components may render in Shadow DOM, declare vars on both the themed root and the component hosts so values pierce the host boundary.

```ts
import { LIGHT_TOKENS, generateThemeCSS } from '@tatchi-xyz/sdk/react';

const creamTokens = {
  ...LIGHT_TOKENS,
  colors: { ...LIGHT_TOKENS.colors, ...creamColors },
};

const hosts = [
  'w3a-tx-tree',
  'w3a-drawer',
  'w3a-modal-tx-confirmer',
  'w3a-drawer-tx-confirmer',
  'w3a-button-with-tooltip',
  'w3a-halo-border',
  'w3a-passkey-halo-loading',
];

function injectTheme(tokens, theme /* 'light' | 'dark' */) {
  // 1) Create a :root block of CSS vars from tokens
  const rootCss = generateThemeCSS(tokens, '--w3a'); // returns ":root { … }"
  const body = rootCss.slice(rootCss.indexOf('{') + 1, rootCss.lastIndexOf('}')).trim();

  // 2) Scope those vars to the active theme and duplicate on hosts for Shadow DOM
  const themedScope = `:root[data-w3a-theme="${theme}"]`;
  const themedHosts = hosts.map(s => `${themedScope} ${s}`).join(',\n');

  const css = `
${themedScope} {
  ${body}
}
${themedHosts} {
  ${body}
}`;

  const style = document.createElement('style');
  style.setAttribute('data-w3a-custom-theme', theme);
  style.textContent = css;
  document.head.appendChild(style);
}

// Ensure a theme marker exists and inject overrides
document.documentElement.setAttribute('data-w3a-theme', 'light');
injectTheme(creamTokens, 'light');
```

To scope for light mode only, set `data-w3a-theme="light"` on the document element (or your boundary) before injecting.

Theme toggle (no React):

```ts
function setW3ATheme(next /* 'light' | 'dark' */) {
  document.documentElement.setAttribute('data-w3a-theme', next);
}
// Re‑inject your vars for the other side if you provide both token sets
// injectTheme(myDarkTokens, 'dark')
```

Runtime loading order: ensure your custom style tag is appended after the SDK links in `<head>` (w3a-components.css), so your vars win in the cascade.

---

## When to add a palette family

SDK maintainers who want first‑class support for a new neutral (like "cream") can:
- Extend `sdk/src/theme/palette.json` with a new scale (e.g., `cream` 25–900).
- Export the scale in `base-styles.ts` (e.g., `CREAM_COLORS`) and optionally add `CREAM_THEME` mirroring `LIGHT_THEME`/`DARK_THEME` structure.

App developers typically do not need to modify `palette.json`; using `Theme` token overrides is simpler and upgrade‑safe.

---

## Recommended keys to start with

For a cohesive scheme, override:
- `colorBackground`, `surface`, `surface2`
- `textPrimary`, `textSecondary`, `textMuted`
- `borderPrimary`, `hover`, `active`
- `primary`, `primaryHover`, `accent`

Ensure accessible contrast for text and interactive states.

---

## FAQ

- Can I ship both light and dark custom schemes?
  Yes, set both `tokens.light.colors` and `tokens.dark.colors`. Toggle with `setTheme('light' | 'dark')` or rely on `defaultTheme` + user preference.

- Do Lit components and React read the same values?
  Yes. The theme system writes CSS vars (e.g., `--w3a-colors-primary`) that both stacks use. The generator also emits defaults on component hosts to bridge Shadow DOM; your runtime overrides should target both the themed root and hosts as shown above.

- Where are defaults defined?
  Base scales: `sdk/src/theme/palette.json`. Base themes: `sdk/src/base-styles.ts` (built from `sdk/src/theme/base-styles.js`). React tokens: `sdk/src/react/components/theme/design-tokens.ts`.

- Why do I still see defaults sometimes inside an iframe?
  Ensure the SDK assets (especially `w3a-components.css`) resolve for the iframe origin. Set `window.__W3A_WALLET_SDK_BASE__` to an absolute `https://your-cdn/sdk/` before mounting, or serve `/sdk/*` at that base. Then inject your custom theme in that document (the iframe’s `document.head`).
