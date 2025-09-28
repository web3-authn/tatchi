Arrow Registration Button Overlay Positioning
================================

Goal
- Render the register arrow (Lit element in the wallet iframe) exactly on top of the React ArrowButton in the parent app, without hardcoded offsets.

Approach (anchor → iframe → element)
1) Measure the ArrowButton wrapper in the parent with getBoundingClientRect() (viewport coordinates).
2) Tell the WalletIframeRouter to position the wallet iframe at those bounds via `setOverlayBounds({ top, left, width, height })`.
3) Mount the Lit element at (0,0) inside the iframe by using `anchorMode: 'iframe'` and `viewportRect: { top: 0, left: 0, width, height }`.

Why this works
- `getBoundingClientRect()` returns coordinates in CSS pixels relative to the viewport.
- The wallet iframe is `position: fixed`, so `top/left/width/height` map to the same coordinate space.
- Anchoring the Lit element to `(0,0)` inside the iframe ensures the button sits exactly on top of the React anchor.

Key APIs
- Parent (router): `setOverlayBounds(rect)`
  - Positions the wallet iframe overlay at the given viewport rect and makes it visible.
- Host (Lit mounter): `anchorMode: 'iframe'`
  - When `viewportRect` is passed with `anchorMode: 'iframe'`, the container is placed at `(0,0)` inside the iframe viewport, sized to the given width/height.

React usage (quick start)
1) Use the provided hook `useArrowButtonOverlay` to manage positioning, updates, and lifecycle.
   - File: `passkey-sdk/src/react/components/PasskeyAuthMenu/ArrowButtonOverlayHooks.ts`

   What the hook does:
   - Holds a `ref` to the ArrowButton wrapper (the anchor).
   - Measures the anchor rect and calls `router.setOverlayBounds(rect)`.
   - Mounts/updates the Lit element with `anchorMode: 'iframe'` and `viewportRect: { top: 0, left: 0, width, height }`.
   - Uses `ResizeObserver` + window `scroll/resize` listeners to keep the overlay in sync.
   - Unmounts/hides when disabled or waiting.

2) Wire it in your component (already done in PasskeyInput):
   - Pass `arrowAnchorRef` to the ArrowButton wrapper so it can be measured.
   - Call `mountArrowAtRect()` on hover/focus/click to show the overlay.

No magic numbers
- There are no hardcoded pixel offsets (e.g., `left: 496`). Everything is anchored to the actual ArrowButton’s measured rect.

Waiting and UX
- When the overlay button is clicked, the wallet host posts `REGISTER_BUTTON_SUBMIT` (internally bridged by the router).
- The app sets a `waiting` state that hides/unmounts the overlay quickly.
- After successful registration, the router emits `onVrfStatusChanged`, so the app’s login state updates without window message listeners.

Troubleshooting
- Element not aligned: ensure the ArrowButton wrapper is the same element you pass to `arrowAnchorRef`.
- Overlay flicker during scroll: the hook re-measures on `ResizeObserver` and `scroll/resize`. For extreme cases, consider throttling.
- Multiple menus: refs are instance-local; no global ids are used, avoiding collisions.

