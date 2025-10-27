# <w3a-drawer>

Overview
- Slide-up drawer used by the Tx confirmer (viewer-drawer) and other flows.
- Structural styles and tokens live in `css/drawer.css` and are adopted in the component’s ShadowRoot.

Props
- `open: boolean` — controls visibility; reflected to attribute.
- `theme: 'dark' | 'light'` — token set used by `w3a-components.css` and `drawer.css`.
- `loading: boolean` — disables certain interactions (e.g., close, drag) while true.
- `errorMessage?: string` — optional error banner shown inside the body.
- `dragToClose: boolean` (default `true`) — enables drag gestures to close.
- `showCloseButton: boolean` (default `true`) — toggles the × button in the corner.
- `height?: string` — preferred visible height; accepts `vh/dvh/svh/lvh` (e.g., `60vh`).
  - When not set, the drawer fits the “above-fold” content.
- `overpullPx: number` (default `120`) — minimum upward overpull allowance (px) used by the elastic curve.

Key behaviors
- First open is gated via the viewer by awaiting external styles and a double rAF to avoid first‑paint jank.
- Dynamic height: when `height` is not provided (or set to `auto`), the drawer continuously fits the visible area to its slotted content. Content changes detected via `slotchange` and `ResizeObserver` trigger a recalculation even while open. Transitions are temporarily suppressed during these reflows to avoid mid‑animation jumps, ensuring children (e.g., TxTree) remain fully visible up to viewport limits.
- Measurements (slotchange, ResizeObserver, window resize) are coalesced to one per frame to reduce layout thrash.

CSS tokens
- `--w3a-drawer__sheet-height`: overall sheet height (defaults to `100dvh` when supported).
- `--w3a-drawer__open-translate`: translateY percentage for the open rest position (0% = fully open).
- `--w3a-drawer__open-offset`: pixel offset applied to compensate for mobile chrome (additive; default `0px`).
- `--w3a-drawer__max-width`: max width of the drawer (default `420px`).
- Transition tuning:
  - `--w3a-drawer__transition-duration` (default `0.15s`)
  - `--w3a-drawer__transition-easing` (default `cubic-bezier(0.32, 0.72, 0, 1)`)

Drag behavior
- Uses Pointer Events when available; falls back to mouse + touch.
- pointerdown does not preventDefault; a drag only begins on pointermove after a small threshold (~8px) and when the drawer body is scrolled to the top.
- While dragging, transitions are disabled and transform is driven via a CSS variable (`--w3a-drawer__drag-translate`).
- Upward “overpull” uses an elastic curve and is capped by a minimum of:
  - 50% of the sheet height, 50% of the viewport height, or the configured `overpullPx` prop (default `120`).

Open/close lifecycle events
- Fired on the host element (`<w3a-drawer>`), bubble, and are composed:
- `w3a:drawer-open-start` — `open` flips to true
- `w3a:drawer-open-end` — CSS transform transition completes (propertyName === `transform`)
- `w3a:drawer-close-start` — `open` flips to false
- `w3a:drawer-close-end` — CSS transform transition completes

Stylesheet readiness
- The component adopts `drawer.css` internally. Hosts can also preload the stylesheet via `ensureExternalStyles(root, 'drawer.css', 'data-w3a-drawer-css')` to ensure the fallback `<link>` is loaded before the first open.

Notes
- Prefer setting an explicit `height` (e.g., `60vh`) if you want a deterministic open rest without content measurement.
- Consider adding a prefers‑reduced‑motion rule at the theme level to shorten or disable transitions for users who request it.
