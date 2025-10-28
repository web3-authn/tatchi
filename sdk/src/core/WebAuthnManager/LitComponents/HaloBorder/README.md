# HaloBorder (Lit)

Inline-only, instance-safe rotating halo built as a Lit element.

Goal: draw a thin, animated arc that orbits around a rounded rectangle, with a visible gap between the arc and the content, and keep that arc outside the component’s box (a “floating” halo). Each instance computes its own geometry (no shared CSS variables), so different `ringGap`/`ringWidth` values can coexist.

## How It Works

- Real ring element: Instead of a pseudo-element, the Lit component renders a real absolutely-positioned `<div>` around the content.
- Conic gradient arc: The ring uses a `conic-gradient` background. Only a short portion of the circle is visible as the arc.
- Masking for a thin band: We keep only the padding area using CSS masks:
  - `padding: ringWidth` on the ring element
  - `-webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)`
  - `-webkit-mask-composite: xor; mask-composite: exclude;`
  This effectively shows “border-box minus content-box” → a controllable thin band.
- Outside the box: The ring is sized larger than the content via negative insets `top/right/bottom/left: -(ringGap + ringWidth)`, producing a real gap between halo and content.
- Animation: We animate by updating the gradient’s start angle via `requestAnimationFrame`. To satisfy strict CSP (no style attributes), we write the angle to a CSS custom property on the component’s adopted stylesheet (not the `style` attribute), and the ring reads it with `background: conic-gradient(from var(--halo-angle) deg, …)`.

## Lit Implementation Sketch

```ts
const ringInset = `-${ringGap + ringWidth}px`;
const ringStops = ringBackground ?? 'transparent 0%, #4DAFFE 10%, #4DAFFE 25%, transparent 35%';

const ringStyle = {
  position: 'absolute',
  top: ringInset,
  right: ringInset,
  bottom: ringInset,
  left: ringInset,
  borderRadius: `calc(${ringBorderRadius} + ${ringGap}px + ${ringWidth}px)`,
  padding: `${ringWidth}px`,
  background: `conic-gradient(from 0deg, ${ringStops})`,
  WebkitMask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
  WebkitMaskComposite: 'xor',
  maskComposite: 'exclude',
};

// rAF to rotate the arc by shifting the gradient start angle
const step = (now: number) => {
  const angle = ((now - start) % 1150) / 1150 * 360;
  // Update a CSS variable via adoptedStyleSheets; ring uses var(--halo-angle)
  setCssVars({ '--halo-angle': `${angle}deg` });
  requestAnimationFrame(step);
};
```

## Component API

HaloBorder (custom element: `w3a-halo-border`) supports:

- `animated?: boolean` — enable/disable rotation.
- `theme?: 'light' | 'dark'` — applied as a class on the wrapper for theme tokens.
- `durationMs?: number` — animation duration in milliseconds (default 1150ms).
- `ringGap?: number` — distance between content and halo (default 4px).
- `ringWidth?: number` — thickness of the halo band (default 2px).
- `ringBorderRadius?: string` — radius of the arc path (default `2rem`).
- `ringBorderShadow?: string` — optional box-shadow applied to the host.
- `ringBackground?: string` — the stops for the conic-gradient (e.g. `"transparent 0%, #4DAFFE 10%, #4DAFFE 25%, transparent 35%"`).
- `padding?: string` — optional outer padding override (defaults to `ringGap + ringWidth`).
- `innerPadding?: string` — padding for the inner content box (default `2rem`).
- `innerBackground?: string` — background for the inner content (default `var(--w3a-colors-surfacePrimary)`).

PasskeyHaloLoading (custom element: `w3a-passkey-halo-loading`) forwards the same halo props and adds:

- `height?: number`, `width?: number` — icon size controls.

## Usage

HTML (plain Web Component):

```html
<w3a-halo-border
  animated
  duration-ms="800"
  ring-gap="8"
  ring-width="4"
  ring-border-radius="1.5rem"
  ring-background="transparent 0%, #4DAFFE 12%, #4DAFFE 28%, transparent 36%"
  inner-padding="20px"
  inner-background="var(--w3a-colors-surfaceSecondary)"
>
  <div>Content</div>
</w3a-halo-border>
```

React (via @lit/react wrappers):

```tsx
import { LitHaloBorder, LitPasskeyHaloLoading } from '@tatchi-xyz/sdk/react';

<LitHaloBorder
  animated
  theme="light"
  durationMs={800}
  ringGap={8}
  ringWidth={4}
  ringBorderRadius="1.5rem"
  ringBackground="transparent 0%, #4DAFFE 10%, #4DAFFE 25%, transparent 35%"
>
  <div>Content</div>
</LitHaloBorder>

<LitPasskeyHaloLoading
  animated
  theme="dark"
  durationMs={1200}
  ringGap={6}
  ringWidth={3}
  innerPadding="8px"
  height={48}
  width={48}
/>;
```

## Why This Approach

- Inline-only: No stylesheet or CSS variables required; styles are instance-local.
- Multiple instances: Different gaps/widths won’t conflict (no global var overrides).
- Visual parity: Same outside-the-box, thin-arc effect as the earlier CSS/pseudo-element approach.

## Browser Support

- Uses `-webkit-mask-composite: xor` and `mask-composite: exclude` for the ring band. Modern Chromium and Safari support these. Firefox support is limited; without it, the ring may appear as a filled conic background (degraded but functional).
- Performance: rAF updates a single CSS property (background) per frame. The ring element is pointer-events none and overlays content correctly.
