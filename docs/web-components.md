# Web Components Plan: `@tatchi/sdk/web-components`

Goal: ship first‑class, framework‑agnostic custom elements for key SDK UI so apps can drop them into any environment (React, Vue, VitePress, static HTML, Shadow DOM) with predictable styling, events, and behavior.

Primary targets
- `<tatchi-profile-settings>`: wraps React `ProfileSettingsButton`
- `<tatchi-passkey-auth-menu>`: wraps React `PasskeyAuthMenu`

Secondary (optional, later)
- `<tatchi-qr-scanner>` for device linking flows
- `<tatchi-login-button>` convenience wrapper

Non‑goals (initial)
- Server‑side rendering of web components
- Global theme orchestration across multiple components (each is self‑contained; opt‑in linking via attributes/properties)

Design principles
- Self‑contained: Each element encapsulates styles, theming, overlays, and event handling.
- Shadow‑safe: Works identically in the document and inside another ShadowRoot.
- Robust overlays: Modals/overlays mount within the same root by default (configurable).
- Minimal host contract: Primitive attributes for simple props; properties for complex objects and callbacks; events bridged via CustomEvent.

API surface (draft)
- Attributes (string/boolean)
  - `near-account-id` (string)
  - `hide-username` (boolean)
  - `theme` ("light" | "dark") — optional override
  - `portal-strategy` ("shadow" | "document") — default "shadow"
- Properties (set on the element instance)
  - `deviceLinkingScannerParams` (object)
  - `onLogout` (function)
  - `portalTarget` (HTMLElement | ShadowRoot | null) — overrides strategy
- Events (CustomEvent)
  - `logout` — detail: void
  - `deviceLinked` — detail: LinkDeviceResult
  - `deviceLinkingEvent` — detail: DeviceLinkingSSEEvent
  - `error` — detail: Error
  - `close` — detail: void (when overlays close)

Usage examples
```html
<!-- HTML‑only usage -->
<tatchi-profile-settings near-account-id="alice.testnet" hide-username></tatchi-profile-settings>

<script type="module">
  import '@tatchi/sdk/web-components/profile-settings';

  const el = document.querySelector('tatchi-profile-settings');
  el.onLogout = () => console.log('logout');
  el.deviceLinkingScannerParams = { fundingAmount: '0.05' };
  el.addEventListener('deviceLinked', (e) => console.log(e.detail));
</script>
```

Wrapper architecture
- Each element extends HTMLElement and attaches an open ShadowRoot.
- Injects SDK CSS bundle into the shadow using Constructable Stylesheets (`adoptedStyleSheets`) when available; falls back to a `<style>` tag otherwise.
- Creates a React root inside the shadow and renders the React component wrapped in `Theme` (provider + boundary).
- Portals/overlays default to mount into the element’s ShadowRoot. Optional `portalTarget` or `portal-strategy` controls alternative targets.
- Click‑outside logic uses `event.composedPath()` and registers listeners on the nearest root (ShadowRoot or Document).
- Style de‑duplication: a small internal registry prevents injecting the same stylesheet multiple times per root.

Styling and theming
- Theme isolation: Each element owns a `Theme` provider with internal defaults (system or stored user preference).
- Host overrides: Allow CSS variable overrides on `:host` (e.g., `--w3a-colors-primary`) and an explicit `theme` attribute. Do not rely on host global CSS.
- Token mapping: The `Theme` boundary exposes `--w3a-*` variables; internal CSS only references those tokens.

Build and packaging
- Location: `sdk/src/web-components/`
- Build: Vite library mode or tsup to emit ESM bundles per component and a `defineAll()` helper.
- CSS bundling: import `@tatchi/sdk/react/styles?inline` and transform to `CSSStyleSheet` (when supported). Include a fallback string.
- Types: ship `.d.ts` for element classes with properties and event typings.
- Package exports (sdk/package.json)
  - `"./web-components"`: `"dist/web-components/index.js"`
  - `"./web-components/profile-settings"`: `"dist/web-components/profile-settings.js"`
  - `"./web-components/passkey-auth-menu"`: `"dist/web-components/passkey-auth-menu.js"`

Events and prop bridging
- Attributes → props: map on `attributeChangedCallback`; parse booleans; reflect changes to the React component via state update.
- Properties → props: setters trigger a re‑render; complex objects passed through unchanged.
- React callbacks → DOM events: wrap React props to re‑emit as CustomEvent with `detail` payload.

Accessibility
- Dropdowns: ARIA roles, focus trapping optional, escape to close, restore focus to trigger on close.
- Modals: ARIA dialog semantics; esc‑to‑close; backdrop click handling that respects Shadow DOM boundaries.

Testing strategy
- Unit tests (JSDOM): attribute/property reflection, event emission, re‑render on prop change.
- E2E (Playwright):
  - Render in document, inside a host ShadowRoot, and inside a nested ShadowRoot.
  - Verify: click‑outside doesn’t close when interacting inside; overlays render above and don’t steal scroll; esc closes overlays; menu items respect `keepOpenOnClick`.
  - Visual sanity for light/dark themes.

Migration in docs/examples
- Replace `registerAppShellWC.tsx` with imports from `@tatchi/sdk/web-components` and direct `<tatchi-profile-settings />` usage where appropriate.
- Keep example React usage for `@tatchi/sdk/react` as‑is (no breaking change).

Phased implementation plan
1) Skeleton package under `sdk/src/web-components/` with a base `define()` helper and style injector.
2) Implement `<tatchi-profile-settings>` wrapper:
   - Props/events bridge; style injection; ShadowRoot portal default.
   - Map current `ProfileSettingsButton` APIs; expose `portalTarget` and `portal-strategy`.
3) Implement `<tatchi-passkey-auth-menu>` wrapper with the same patterns.
4) Add `defineAll()` entry point and per‑component side‑effect modules.
5) Add package exports and types to `sdk/package.json`.
6) Write docs and usage examples in `examples/*` and VitePress.
7) Add unit tests for attribute/property/event bridging.
8) Add Playwright E2E covering document vs Shadow DOM, overlays, and theme.
9) Dogfood in `examples/tatchi-docs` (replace the hand‑rolled wrapper).
10) Stabilize API (naming, events), add changelog, and publish.

Future enhancements
- `portalStrategy: 'document'` option for full‑viewport overlays across nested shadows.
- Theme bus to sync theme across multiple instances (opt‑in).
- Smaller CSS bundles per component (code‑split styles from `@tatchi/sdk/react/styles`).
- SSR stubs if needed for static HTML export.
