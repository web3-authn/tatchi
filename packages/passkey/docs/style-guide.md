# Neumorphism Style Guide

*A guide for implementing neumorphic design in the Web3 Authentication SDK*

## Table of Contents

1. [What is Neumorphism?](#what-is-neumorphism)
2. [Core Design Principles](#core-design-principles)
3. [Color System](#color-system)
4. [Shadow & Light System](#shadow--light-system)
5. [Component Guidelines](#component-guidelines)
6. [Typography](#typography)
7. [Accessibility Considerations](#accessibility-considerations)
8. [Implementation Examples](#implementation-examples)
9. [Best Practices](#best-practices)
10. [Common Pitfalls](#common-pitfalls)

## What is Neumorphism?

Neumorphism (New Skeuomorphism) is a design trend that combines elements of skeuomorphism and flat design. It creates interfaces where UI elements appear to be **softly extruded from or pressed into the background**, achieving depth through subtle shadows and highlights rather than harsh borders or contrasts.

### Key Characteristics:
- **Soft, tactile surfaces** that feel like they're carved from the background
- **Minimal color palettes** with subtle variations
- **Dual shadow system** (light and dark) for depth
- **Low contrast** between elements and background
- **Clean, modern aesthetic** with subtle dimensionality

## Core Design Principles

### 1. Unified Background Philosophy
Elements don't sit **on** the background—they emerge **from** it. The background acts as a single material that components are carved from or pressed into.

### 2. Subtle Depth Through Shadows
Depth is achieved through **dual shadows**:
- **Light shadow** (highlight) on top-left
- **Dark shadow** (lowlight) on bottom-right

### 3. Minimal Color Variation
Use **monochromatic or near-monochromatic** palettes with subtle tonal variations to maintain the unified material feel.

### 4. Soft Interaction States
Interactive elements should have **gentle state transitions** that maintain the soft, tactile feeling.

## Color System

### Primary Palette (Light Mode)
```css
/* Base Colors */
--neu-bg-primary: #e8ecf0;           /* Main background */
--neu-bg-secondary: #e8ecf0;         /* Component background */
--neu-text-primary: #2d3748;         /* Primary text */
--neu-text-secondary: #718096;       /* Secondary text */
--neu-text-muted: #a0aec0;          /* Muted text */

/* Accent Colors */
--neu-accent-blue: #4299e1;         /* Primary accent */
--neu-accent-success: #48bb78;      /* Success states */
--neu-accent-warning: #ed8936;      /* Warning states */
--neu-accent-danger: #f56565;       /* Error states */
```

### Shadow System
```css
/* Light & Dark Shadows */
--neu-shadow-light: #ffffff;        /* Highlight shadow */
--neu-shadow-dark: #bec3c9;         /* Lowlight shadow */

/* Inset Shadows */
--neu-shadow-inset-light: rgba(255, 255, 255, 0.7);
--neu-shadow-inset-dark: rgba(190, 195, 201, 0.7);

/* Pre-defined Shadow Combinations */
--neu-shadow-raised: 6px 6px 12px var(--neu-shadow-dark),
                     -6px -6px 12px var(--neu-shadow-light);
--neu-shadow-pressed: inset 3px 3px 6px var(--neu-shadow-inset-dark),
                      inset -3px -3px 6px var(--neu-shadow-inset-light);
--neu-shadow-flat: 2px 2px 4px var(--neu-shadow-dark),
                   -2px -2px 4px var(--neu-shadow-light);
--neu-shadow-hover: 8px 8px 16px var(--neu-shadow-dark),
                    -8px -8px 16px var(--neu-shadow-light);
```

### Dark Mode Palette
```css
/* Dark Mode Colors */
--neu-bg-primary-dark: #1a202c;
--neu-bg-secondary-dark: #1a202c;
--neu-text-primary-dark: #e2e8f0;
--neu-text-secondary-dark: #a0aec0;
--neu-shadow-light-dark: #2d3748;
--neu-shadow-dark-dark: #0d1117;
```

## Shadow & Light System

### Shadow Directions
Following the **top-left light source** convention:
- **Raised elements**: Light shadow top-left, dark shadow bottom-right
- **Pressed elements**: Inset shadows with reversed light/dark positioning
- **Flat elements**: Minimal shadows for subtle definition

### Shadow Intensities
```css
/* Subtle (Default) */
--neu-shadow-subtle: 4px 4px 8px var(--neu-shadow-dark),
                     -4px -4px 8px var(--neu-shadow-light);

/* Medium */
--neu-shadow-medium: 6px 6px 12px var(--neu-shadow-dark),
                     -6px -6px 12px var(--neu-shadow-light);

/* Strong (Hover/Focus) */
--neu-shadow-strong: 8px 8px 16px var(--neu-shadow-dark),
                     -8px -8px 16px var(--neu-shadow-light);

/* Inset (Pressed) */
--neu-shadow-inset: inset 3px 3px 6px var(--neu-shadow-inset-dark),
                    inset -3px -3px 6px var(--neu-shadow-inset-light);
```

## Component Guidelines

### Buttons

#### Primary Button (Raised)
```css
.neu-button-primary {
  background: var(--neu-bg-primary);
  box-shadow: var(--neu-shadow-raised);
  border: none;
  border-radius: 12px;
  color: var(--neu-text-primary);
  transition: all 200ms cubic-bezier(0.34, 1.56, 0.64, 1);
}

.neu-button-primary:hover {
  box-shadow: var(--neu-shadow-hover);
  transform: translateY(-2px);
}

.neu-button-primary:active {
  box-shadow: var(--neu-shadow-pressed);
  transform: translateY(0);
}
```

#### Secondary Button (Flat)
```css
.neu-button-secondary {
  background: var(--neu-bg-primary);
  box-shadow: var(--neu-shadow-flat);
  border: none;
  border-radius: 12px;
  color: var(--neu-text-secondary);
}
```

### Cards

#### Raised Card
```css
.neu-card {
  background: var(--neu-bg-secondary);
  box-shadow: var(--neu-shadow-raised);
  border-radius: 20px;
  padding: 24px;
  position: relative;
  overflow: hidden;
}

/* Subtle inner highlight */
.neu-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  border-radius: 20px;
  background: linear-gradient(135deg,
    rgba(255, 255, 255, 0.3),
    rgba(255, 255, 255, 0.05));
  pointer-events: none;
}
```

#### Pressed Card (Input Fields)
```css
.neu-input {
  background: var(--neu-bg-primary);
  box-shadow: var(--neu-shadow-pressed);
  border: none;
  border-radius: 12px;
  padding: 12px 16px;
  color: var(--neu-text-primary);
}
```

### Interactive States

#### Hover Effects
- **Elevation increase**: Enhanced shadow depth
- **Subtle lift**: 2px translateY for tactile feedback
- **Smooth transitions**: 200-300ms easing

#### Focus States
- **Accessibility-first**: Clear focus indicators
- **Soft glow**: Subtle accent color outline
- **Maintained neumorphism**: Focus doesn't break the design

#### Active/Pressed States
- **Inset shadows**: Element appears pressed into surface
- **Immediate feedback**: No transition delay
- **Reset transform**: Return to original position

## Typography

### Font System
```css
--neu-font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI',
                   Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
--neu-font-size-xs: 12px;
--neu-font-size-sm: 14px;
--neu-font-size-base: 16px;
--neu-font-size-lg: 18px;
--neu-font-size-xl: 24px;
--neu-font-size-2xl: 32px;
```

### Text Shadows
Subtle text shadows enhance the neumorphic effect:
```css
.neu-text-raised {
  text-shadow: 1px 1px 2px rgba(255, 255, 255, 0.5);
}

.neu-text-pressed {
  text-shadow: inset 1px 1px 2px rgba(190, 195, 201, 0.3);
}
```

### Hierarchy
- **Headings**: Slightly raised with soft text shadows
- **Body text**: Clean, minimal shadows
- **Captions**: Subtle, muted appearance

## Accessibility Considerations

### Contrast Requirements
- **Text contrast**: Maintain WCAG AA standards (4.5:1 minimum)
- **Interactive elements**: Clear visual distinction between states
- **Focus indicators**: High contrast outlines for keyboard navigation

### Color Independence
- **Don't rely on color alone**: Use shadows and shapes for meaning
- **Test with color blindness**: Ensure usability across vision types
- **High contrast mode**: Provide alternative styles when needed

### Touch Targets
- **Minimum size**: 44px × 44px for touch interfaces
- **Clear boundaries**: Subtle but discernible element edges
- **Adequate spacing**: Prevent accidental interactions

## Implementation Examples

### Modal Dialog
```css
.neu-modal {
  background: var(--neu-bg-primary);
  box-shadow: var(--neu-shadow-raised);
  border-radius: 20px;
  backdrop-filter: blur(8px) saturate(1.2);
}

.neu-modal-backdrop {
  background: rgba(232, 236, 240, 0.85);
}
```

### Form Controls
```css
.neu-checkbox {
  appearance: none;
  width: 20px;
  height: 20px;
  background: var(--neu-bg-primary);
  box-shadow: var(--neu-shadow-pressed);
  border-radius: 4px;
}

.neu-checkbox:checked {
  box-shadow: var(--neu-shadow-flat);
  background: linear-gradient(135deg, var(--neu-accent-blue), #3182ce);
}
```

### Progress Indicators
```css
.neu-progress-track {
  background: var(--neu-bg-primary);
  box-shadow: var(--neu-shadow-pressed);
  border-radius: 10px;
  height: 8px;
}

.neu-progress-fill {
  background: linear-gradient(135deg, var(--neu-accent-blue), #3182ce);
  box-shadow: var(--neu-shadow-flat);
  border-radius: 10px;
  height: 100%;
}
```

## Best Practices

### Do's
- **Maintain consistency** in shadow directions and intensities
- **Use subtle color variations** within the same tone family
- **Provide clear interaction feedback** through shadow changes
- **Test across different screen sizes** and resolutions
- **Consider performance** - complex shadows can impact rendering
- **Implement dark mode** support from the start

### Don'ts
- **Avoid high contrast** between elements and backgrounds
- **Don't overuse the effect** - not every element needs neumorphism
- **Avoid tiny elements** - neumorphism works best with adequate size
- **Don't ignore accessibility** - maintain proper contrast ratios
- **Avoid mixing with other design systems** inconsistently

## Common Pitfalls

### 1. Accessibility Issues
**Problem**: Low contrast makes text hard to read
**Solution**: Ensure text meets WCAG contrast requirements

### 2. Overuse of Effects
**Problem**: Every element has neumorphic styling
**Solution**: Use selectively for key interactive elements

### 3. Inconsistent Light Source
**Problem**: Shadows pointing in different directions
**Solution**: Establish and maintain consistent light source (top-left)

### 4. Performance Impact
**Problem**: Complex box-shadows causing rendering issues
**Solution**: Optimize shadow complexity, use CSS custom properties

### 5. Mobile Considerations
**Problem**: Effects don't translate well to small screens
**Solution**: Simplify effects on mobile, maintain touch target sizes

## Responsive Considerations

### Mobile Adaptations
```css
@media (max-width: 640px) {
  .neu-card {
    border-radius: 16px;
    padding: 16px;
    box-shadow: var(--neu-shadow-flat); /* Reduced shadow */
  }

  .neu-button {
    min-height: 44px; /* Touch-friendly */
    border-radius: 10px;
  }
}
```

### High DPI Displays
```css
@media (-webkit-min-device-pixel-ratio: 2) {
  .neu-element {
    box-shadow: 3px 3px 6px var(--neu-shadow-dark),
                -3px -3px 6px var(--neu-shadow-light);
  }
}
```

## Performance Optimization

### CSS Custom Properties
Use CSS custom properties for dynamic theming and reduced code duplication:

```css
:root {
  --neu-shadow-x: 6px;
  --neu-shadow-y: 6px;
  --neu-shadow-blur: 12px;

  --neu-shadow-raised:
    var(--neu-shadow-x) var(--neu-shadow-y) var(--neu-shadow-blur) var(--neu-shadow-dark),
    calc(-1 * var(--neu-shadow-x)) calc(-1 * var(--neu-shadow-y)) var(--neu-shadow-blur) var(--neu-shadow-light);
}
```

### Animation Performance
```css
.neu-element {
  /* Use transform for animations instead of box-shadow changes */
  will-change: transform;
  transition: transform 200ms ease, box-shadow 200ms ease;
}
```

---

## Reference Implementation

See `packages/passkey/src/core/Components/SecureTxConfirmElement.ts` for a complete implementation example following these guidelines.

## Further Reading

- [Justinmind Neumorphism Guide](https://www.justinmind.com/ui-design/neumorphism)
- [CSS Box Shadow Generator](https://neumorphism.io/)
- [WCAG Accessibility Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
