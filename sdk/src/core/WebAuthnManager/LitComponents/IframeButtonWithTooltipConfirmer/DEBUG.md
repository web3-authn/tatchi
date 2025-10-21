# Iframe Button + Tooltip: Debug Notes

This document captures tricky issues we ran into while implementing the embedded tooltip (iframe + clip-path) and how we resolved them. It should help future maintenance and prevent regressions.

## Margin Offsets For Shadows (boxPadding vs offset)

Problem
- We needed space for the tooltip's shadow without visually moving the tooltip away from the button edge.
- Using padding alone on the tree content pushed the visible edge inward, causing misalignment with the button and WYSIWYS drift.
- Negative margins on the anchored side (e.g.,  for right-anchored tooltips) caused the iframe to grow in the opposite direction on hover, making the button appear to shift.

Solution: Directional padding on inner content + only vertical margin compensation
- Use a public  (width, height, position) and an internal  that adds  and .
  - : , .
- The embedded tooltip container () sets ONLY vertical margins with  and forwards directional padding CSS vars to the inner tree host:
  - : sets  on  (double-underscore naming convention) based on position.
- The tree host reads directional padding vars for actual inner padding:
  - : .
- No transforms; no negative margins on the anchored side.

Why it works
- Container margins move the measured rect (so clip-path + iframe size match what users see) only along the anchor axis.
- Inner padding adds room for shadows on the outer side without shifting the container.
- Avoids left/right hover shift on right-anchored positions and keeps WYSIWYS.

Relevant code
- Public vs internal types:
- Container CSS + forwarding vars:  (position rules)
- Tree host padding:

Notes
- The React wrapper sets internal defaults and hides them from the external API: offset = , boxPadding = .
  -

## Hover Race Conditions (flicker / disappearing tooltip)

Problem
- Moving the pointer from button → tooltip → back to button could hide the tooltip unexpectedly.
- Causes:
  - Overlay becoming visible but not yet interactive (clip-path not expanded, pointer-events timing), stealing hover for a frame.
  - A scheduled hide (with 100ms delay) still firing after re-entering the button.

Fixes
1) Pointer-events gating
-  has  by default; set to  only when .
- Prevents the overlay from stealing hover before it's interactive.
-  CSS.

2) Hover latches + guarded hide
- Track two flags: , .
- On button/tooltip enter: set flags and .
- On leave: only call  if both flags are false.
- Inside  and its timeout: bail if either flag flips back to true.
- : pointer handlers and hide logic.

3) Clip-path ordering (already in place)
- Host applies a button-only clip-path initially, then swaps to union when receiving measured geometry.
- If needed in future, we can add an “optimistic union on hover” (estimate union from current config) before geometry arrives to further reduce seam risk.
- : , .

Relevant code
- Pointer-events + hover flags + guarded hide:
  -
- Clip-path transitions:
  -

## Theming Live Updates

Problem
- Toggling theme (dark/light) didn’t refresh the tooltip without a full page reload.

Fix
- Change detection watched  instead of , so SET_STYLE wasn’t posted after changes.
- Updated condition to check  and post SET_STYLE (and HS1_INIT) when it changes.
-  ().

## Debugging Tips

- Inspect CSS vars in the iframe:
  - On : , , and the directional .
  - On  host: computed padding values (the vars cascade from the container).
- Verify message flow:
  - HS1_INIT → HS2_POSITIONED → HS3_GEOMETRY_REQUEST → HS5_GEOMETRY_RESULT → TOOLTIP_STATE.
- Keep  for the smoothest pointer handoff, or rely on the fixes above.

