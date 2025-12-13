# Floating Rotating Border

This document explains how the animated “floating” border effect is implemented for `HaloBorder` in the React SDK.

The goal: draw a thin, animated arc that orbits around a rounded rectangle, with a visible gap between the arc and the component, and keep the arc outside the component’s box — not on top of the content.

## Files

- Component: `sdk/src/react/components/AccountMenuButton/HaloBorder/index.tsx`
- Styles: `sdk/src/react/components/AccountMenuButton/HaloBorder/HaloBorder.css`

## Technique (high level)

- Use a `::before` pseudo‑element as a canvas for the ring.
- Fill it with a `conic-gradient` and animate the gradient’s start angle to make the arc rotate.
- Use masking so only a thin band (the ring) remains visible.
- Position the pseudo‑element outside the box, producing a real gap between the component and the ring.

This yields a true “floating ring,” not a background fake gap.

## Key CSS

```css
.w3a-rotating-border-container {
  position: relative;
  border-radius: 2rem;
  overflow: visible; /* allow the outside ring to show */
}

/* Outer floating ring */
.w3a-rotating-border-container::before {
  content: '';
  position: absolute;
  /* extend beyond the element so the ring lives OUTSIDE */
  inset: calc(-1 * (var(--ring-gap, 8px) + var(--ring-width, 2px)));
  border-radius: calc(2rem + var(--ring-gap, 8px) + var(--ring-width, 2px));
  pointer-events: none;
  z-index: 3;

  /* rotating arc */
  background: conic-gradient(
    from var(--w3a-ring-angle, 0deg),
    transparent 0%,
    #4DAFFE 10%,
    #4DAFFE 25%,
    transparent 35%
  );

  /* keep only a thin band (padding area) visible */
  padding: var(--ring-width, 2px);
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;

  animation: w3a-ring-rotate 1.15s linear infinite;
}

@property --w3a-ring-angle {
  syntax: "<angle>";
  initial-value: 0deg;
  inherits: false;
}

@keyframes w3a-ring-rotate {
  from { --w3a-ring-angle: 0deg; }
  to   { --w3a-ring-angle: 360deg; }
}
```

Why masking? The conic gradient gives a filled wedge. By adding padding and then masking out the content box, only the padded area remains — that is our ring with a controllable thickness.

With two uniform masks:
Layer A: linear-gradient(#000 0 0) content-box → solid mask only over the content box.
Layer B: linear-gradient(#000 0 0) → solid mask over the whole box.
Compositing “exclude/xor” between B and A yields ring = border-box minus content-box (i.e., only the padding area is visible).

Why the padding matters: on the pseudo-element we set padding: var(--ring-width). That shrinks the content-box inward, so “border-box XOR content-box” becomes a thin band whose thickness equals the padding value.

Why the negative inset: inset: calc(-1 * (gap + width)) makes the pseudo-element extend beyond the host box. After XOR, the visible band sits outside the element, creating the floating ring with a real gap.

## Component API

`HaloBorder` accepts two new optional props to control the ring:

- `borderGap?: number` — distance between the component and the ring (default `8`).
- `borderWidth?: number` — thickness of the ring (default `2`).

They are passed into CSS variables `--ring-gap` and `--ring-width` on the container.

```tsx
<HaloBorder animated borderGap={10} borderWidth={2}>…</HaloBorder>
```

## Example Usage

```tsx
<HaloBorder theme={theme} animated borderGap={10} borderWidth={2}>
  …
</HaloBorder>
```

Ensure any parent container allows the ring to be visible outside the box; the component sets `overflow: visible` on the ring container.

## Customization

- Color/gradient: change the stops in the `conic-gradient` to any theme tokens or brand colors.
- Speed: adjust the duration in `animation: w3a-ring-rotate …`.
- Arc length: tweak the percentages in the gradient stops to make the arc shorter/longer.

## Browser Support & Fallbacks

- Uses `-webkit-mask-composite: xor` with `mask-composite: exclude`. Works in modern Chromium and Safari. Firefox support for `mask-composite` is still limited; it gracefully shows a filled conic background (no ring) if masking isn’t supported.
- If you need a stricter fallback, detect support in CSS and switch to a simpler border effect, e.g. a static outline or inner glow.

## Gotchas

- If you don't see the ring, check for any ancestor setting `overflow: hidden`. The ring sits outside the element box.
- Because it’s a visual flourish, the pseudo‑element is `pointer-events: none` and has no impact on layout.

## Why not clip‑path?

`clip-path` can cut holes, but can’t easily create a stroked ring with independent gap and thickness while also animating a gradient arc. Masking with `content-box/xor` keeps the implementation compact and performant.

## Browser support:

Chrome/Edge/Safari: use -webkit-mask plus -webkit-mask-composite: xor and mask-composite: exclude for broad coverage.
Firefox: mask-composite support is limited; without it, the element may show a filled conic background instead of a ring.
