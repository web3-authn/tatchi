## EmbeddedTxConfirm – Shaped iframe + tooltip refactor plan

### Feasibility analysis
- The approach is feasible if we keep all transaction UI (button + tooltip) inside the sandboxed iframe and shape the iframe’s interactive region using CSS `clip-path` applied from the parent.
- Security: The tooltip continues to render inside the iframe. The parent page cannot change the content, only the outer shape that determines where pointer events reach the iframe. Expanding/altering the shape does not let the parent forge UI – it merely changes hit-testing; the iframe will still verify the transaction data that it renders.
- UX: Using `pointerenter/pointerleave` on the iframe becomes reliable if the `clip-path` includes the union region of the button and the tooltip so pointer movements into the tooltip do not trigger a leave. Add a small hide delay to avoid flicker.
- Cross‑browser: `clip-path: polygon(...)` is well-supported on modern browsers. Provide a graceful fallback (rectangular interactive area) when `clip-path` is unavailable.
- Constraints: The parent must know (or be told) the tooltip’s eventual bounds to build the union shape. The iframe can report measured tooltip width/height/position via `postMessage` so the parent can update CSS variables that drive the `clip-path`.

### High-level design
- Keep iframe pointer‑events: auto at all times. No toggling.
- Parent wraps the iframe in a positioned container large enough for the tooltip.
- Parent applies `clip-path` to the iframe element so only the “button + tooltip” union region is hoverable/clickable.
- Iframe owns and renders the tooltip. It shows/hides it based on `pointerenter/pointerleave` of the iframe surface and internal hover logic.
- Iframe measures the tooltip’s bounding box (width/height) and the chosen side (top/bottom/left/right) and posts dimensions to the parent. Parent updates CSS variables used in the union `clip-path`.

### Events and messaging
- Parent → iframe (existing): `SET_TX_DATA`, `SET_LOADING`.
- Iframe → parent (new):
  - `TOOLTIP_GEOMETRY`: `{ width, height, side, offset }` whenever the tooltip mounts/updates.
  - `TOOLTIP_VISIBLE_CHANGED`: `{ visible: boolean }` (optional; for analytics or debugging).

### Styling model
- Parent CSS variables (example):
  - `--btn-w`, `--btn-h`, `--btn-x`, `--btn-y` for button rect (already known from props).
  - `--tip-w`, `--tip-h`, `--tip-x`, `--tip-y` for tooltip rect (set from `TOOLTIP_GEOMETRY`).
- Parent `clip-path`:
  - Build a polygon that contains the union of the button rect and the tooltip rect (a capsule-like “cloud” or a looser rounded rectangle that covers both). Start with a simple rounded rectangle covering the convex hull of both rects to minimize points and improve performance.
- Iframe CSS/JS:
  - Use `onpointerenter`/`onpointerleave` on the root to show/hide the tooltip with a 120–180ms hide delay.
  - Keep tooltip focusable; show on focus and hide on blur for keyboard.

### Fallback behavior
- If `CSS.supports('clip-path: polygon(0 0)')` is false:
  - Do not set `clip-path`; let the iframe be a normal rectangular target (safe, still secure). The tooltip still appears inside iframe.

### Step-by-step refactor plan
1. Parent container changes (in `EmbeddedTxConfirm.tsx`):
   - Wrap the iframe in a container that fills the computed iframe area (already present).
   - Add CSS variables for button rect and initial tooltip rect; default tooltip rect to button rect before first measurement.
   - Apply a `clip-path` driven by those variables to the iframe element.

2. Iframe tooltip measurement (inline iframe document):
   - After tooltip content is rendered (or when visibility changes), measure its bounding box relative to the root.
   - Post `TOOLTIP_GEOMETRY` with `{ width, height, side, offset }` to the parent. Include the tooltip’s top-left relative to the iframe so the parent can derive `--tip-x/--tip-y`.

3. Parent message handling:
   - Handle `TOOLTIP_GEOMETRY`: update `--tip-w/--tip-h/--tip-x/--tip-y` CSS variables on the iframe element/style.
   - Recompute the `clip-path` polygon string based on the convex hull of the button and tooltip rects (or a rounded rectangle that tightly covers both), then set it via style.

4. Pointer interactions:
   - Remove all iframe pointer‑events toggling.
   - Keep `onPointerEnter`/`onPointerLeave` handlers at the iframe level only to notify the iframe (if needed) or simply rely on iframe internal handlers.
   - Inside iframe, show tooltip on pointer enter; start a hide timer on pointer leave; cancel the timer on re‑enter; keep open while hovering tooltip.

5. Accessibility:
   - Add a focusable wrapper/anchor inside the iframe that toggles the tooltip on focus/blur so keyboard users can review details.
   - Ensure tooltip is announced with `role="tooltip"` and `aria-hidden` toggling.

6. Visual polish:
   - Maintain the compact action details table implemented in the current iteration (labels/value rows, fine row separators, last “Arguments” row without bottom border).
   - Use cobalt color variables for accents.

7. Testing checklist
   - Hover flows: enter button → tooltip shows; move to tooltip → stays; exit cloud → hides after 120–180ms; quick re‑enter cancels hide.
   - Sides: top/bottom/left/right tooltip positions all update `clip-path` correctly.
   - Resize: window and container resizes re‑measure tooltip and update `clip-path`.
   - Mobile: tap once to show tooltip; second tap activates primary action (optional guarded behavior).
   - Fallback: browsers without `clip-path` keep working with a rectangular iframe.
   - Security: parent cannot alter tooltip content; postMessage only conveys geometry. Iframe re‑derives and displays transaction details from trusted data path.

### Implementation notes
- Keep the `clip-path` math isolated in a helper so we can iterate on the shape (polygon hull vs rounded rect).
- Rate limit geometry posts (e.g., requestAnimationFrame) to avoid message spam during transitions.
- Consider a small max growth buffer in the `clip-path` to tolerate minor content reflows without frequent updates.

### Future enhancements
- Animate cloud expansion when tooltip opens (CSS transition on the `clip-path` path via CSS variables for radii).
- Support multiple tooltips (multi‑action) by expanding the cloud to cover all visible regions.
- Explore off‑main‑thread measurement using ResizeObserver inside the iframe.

---

### Union clip-path for button + tooltip (with 8px gap, 6 placements)
