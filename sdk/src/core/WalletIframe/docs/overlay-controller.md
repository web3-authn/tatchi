# OverlayController Refactor Plan

Goal: centralize all wallet iframe overlay sizing/visibility logic behind a small controller with clear, declarative “overlay intents”. This removes scattered `style.*` writes from `router.ts`, makes behavior easier to reason about, and simplifies future features (e.g., smooth transitions, throttled syncing).

## Problems Today

- Style mutations (top/left/width/height/inset/transform) are written in multiple places (`showFrameForActivation`, `hideFrameForActivation`, `setOverlayBounds`).
- It’s easy to regress ordering bugs (e.g., `inset` clearing after top/left) and "sticky" lifecycle quirks.
- There’s no single source of truth for the overlay state (mode, sticky, last rect, visible).

## Overlay Modes

- `hidden`: iframe has no footprint, `pointer-events: none`.
- `fullscreen`: `position: fixed; inset: 0` (fills viewport without 100vw/100vh).
- `anchored`: `position: fixed; top/left from rect; width/height from rect`.

## API (v1)

Expose a controller class in `src/core/WalletIframe/client/overlay-controller.ts`:

```ts
type DOMRectLike = { top: number; left: number; width: number; height: number };

class OverlayController {
  constructor(opts: { ensureIframe: () => HTMLIFrameElement });
  showFullscreen(): void;
  showAnchored(rect: DOMRectLike): void;
  showPreferAnchored(): void;            // anchored if rect set, else fullscreen
  setAnchoredRect(rect: DOMRectLike): void; // re-apply when active
  clearAnchoredRect(): void;
  setSticky(v: boolean): void;             // don’t auto‑hide on completion
  hide(): void;                            // no-op if sticky
  getState(): { visible: boolean; mode: 'hidden'|'fullscreen'|'anchored'; sticky: boolean; rect?: DOMRectLike };
}
```

Implementation notes:

- Only the controller writes to style properties. It always clears conflicting shorthands (`inset/right/bottom`) before setting top/left.
- It uses a `z-index` just below in-iframe modals (2147483646).
- `hide()` sets width/height to `0`, opacity `0`, disables pointer events, and restores ARIA.

## Router Integration (phase 1)

Minimal wiring without changing external behavior:

- Instantiate the controller in `router.ts` with `ensureIframe` bound to the transport.
- Replace internal helpers:
  - `showFrameForActivation` → `overlay.showFullscreen()` (or `.showAnchored(lastRect)` if set).
  - `hideFrameForActivation` → `overlay.hide()`.
  - `setOverlayBounds(rect)` → `overlay.showAnchored(rect)` and mark as last anchored.
  - `setAnchoredOverlayBounds/clearAnchoredOverlay` → delegate to controller.
- Keep OnEventsProgressBus callbacks intact; they will call the router which delegates to the controller.

## Router Integration (phase 2)

Introduce “overlay intent” when posting messages:

- Compute an intent per request (type + options):
  - UI exports, modal viewers → `fullscreen + sticky`.
  - UI registry with `viewportRect` → `anchored + sticky`.
  - TouchID/registration/login/link flows → `fullscreen`.
  - Background/read APIs → `hidden`.
- Ask the controller to apply the intent before posting; on completion, auto-hide if not sticky.

## Testing & Observability

- `getState()` for debug logs (mode, rect, sticky, visible).
- Optional console debug behind `opts.debug` in the router.

## Rollout

1. Land controller + phase 1 delegation (this change).
2. Add intent mapper and switch `post()` to use it.
3. Remove legacy style writes after verification.
