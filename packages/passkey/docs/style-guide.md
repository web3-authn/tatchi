## Web3Authn SDK UI Style Guide

Reference aesthetic: clean monochrome, subtle animated borders, translucent backgrounds, crisp typography. Based on the actual implementation in `EmbeddedTxConfirm.tsx`.

### Principles
- **Monochrome first**: white backgrounds, black text, subtle grays for hierarchy
- **Translucent layers**: backdrop blur effects with semi-transparent backgrounds
- **Animated borders**: subtle conic-gradient animations for visual interest
- **Crisp content**: solid white content areas with clean typography

### Design Tokens
Use these CSS variables to maintain consistency across components.

```css
:root {
  /* Colors */
  --w3a-bg: #ffffff;
  --w3a-surface: rgba(255, 255, 255, 0.8);
  --w3a-surface-solid: #ffffff;
  --w3a-text: #1f2937;
  --w3a-text-dim: #4a5568;
  --w3a-border: #e2e8f0;
  --w3a-border-strong: #cbd5e0;
  --w3a-shadow: rgba(0, 0, 0, 0.05);
  --w3a-shadow-strong: rgba(0, 0, 0, 0.1);

  /* Typography */
  --w3a-font-sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --w3a-font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;

  /* Sizing & Spacing */
  --w3a-radius-sm: 8px;
  --w3a-radius: 16px;
  --w3a-radius-lg: 24px;
  --w3a-gap-1: 4px;
  --w3a-gap-2: 8px;
  --w3a-gap-3: 12px;
  --w3a-gap-4: 16px;
  --w3a-gap-6: 24px;

  /* Motion */
  --w3a-ease: cubic-bezier(0.2, 0.6, 0.2, 1);
  --w3a-fast: 200ms;
  --w3a-med: 400ms;
}
```

### Animated Border System
The signature animated border using conic-gradient with CSS custom properties.

```css
/* Base animated border class */
.animated-border {
  --border-angle: 0deg;
  background: linear-gradient(#ffffff, #ffffff) padding-box,
    conic-gradient(
      from var(--border-angle),
      rgba(0, 0, 0, 0.0) 0%,
      rgba(0, 0, 0, 0.35) 10%,
      rgba(0, 0, 0, 0.0) 20%,
      rgba(0, 0, 0, 0.0) 100%
    ) border-box;
  border: 4px solid transparent;
  border-radius: var(--w3a-radius);
  animation: border-angle-rotate 4s infinite linear;
}

/* CSS custom property for animation */
@property --border-angle {
  syntax: "<angle>";
  initial-value: 0deg;
  inherits: false;
}

/* Animation keyframes */
@keyframes border-angle-rotate {
  from { --border-angle: 0deg; }
  to { --border-angle: 360deg; }
}
```

### Translucent Background System
Layered translucent backgrounds with backdrop blur for depth.

```css
/* Primary translucent container */
.translucent-container {
  background: transparent;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid var(--w3a-border);
  border-radius: var(--w3a-radius-lg);
  padding: var(--w3a-gap-2);
}

/* Solid content area within translucent container */
.content-area {
  background: var(--w3a-surface-solid);
  border: 1px solid var(--w3a-border);
  border-radius: var(--w3a-radius);
  padding: var(--w3a-gap-4);
  box-shadow: 0 2px 4px var(--w3a-shadow);
}
```

### Typography

```css
.heading {
  font-size: 1.125rem;
  font-weight: 600;
  line-height: 1.5;
  color: var(--w3a-text);
  margin-bottom: var(--w3a-gap-4);
}

.body {
  font-size: 0.9rem;
  line-height: 1.6;
  color: var(--w3a-text-dim);
}

.label {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--w3a-text-dim);
}

.mono {
  font-family: var(--w3a-font-mono);
  font-size: 0.8rem;
  line-height: 1.4;
}
```

### Code Block Styling
Fixed-height scrollable code blocks with monospace typography.

```css
.code-block {
  font-family: var(--w3a-font-mono);
  background: #f8fafc;
  border: 1px solid var(--w3a-border);
  border-radius: var(--w3a-radius-sm);
  padding: var(--w3a-gap-2);
  white-space: pre;
  word-break: normal;
  overflow: auto;
  line-height: 1.4;
  color: var(--w3a-text);
  max-height: calc(1.4em * 3); /* Fixed 3-line height */
}
```

### Button System
Clean, accessible buttons with subtle hover states.

```css
.btn {
  padding: var(--w3a-gap-3) var(--w3a-gap-4);
  border: none;
  border-radius: var(--w3a-radius-sm);
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--w3a-fast) var(--w3a-ease);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--w3a-gap-2);
}

.btn-primary {
  background: #667eea;
  color: white;
}

.btn-primary:hover {
  background: #5a67d8;
  box-shadow: 0 2px 4px rgba(102, 126, 234, 0.2);
}

.btn-secondary {
  background: var(--w3a-border);
  color: var(--w3a-text-dim);
}

.btn-secondary:hover {
  background: var(--w3a-border-strong);
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
```

### Action List Component
The signature component combining animated borders with solid content areas.

```css
.action-list {
  /* Animated border wrapper */
  --border-angle: 0deg;
  background: linear-gradient(#ffffff, #ffffff) padding-box,
    conic-gradient(
      from var(--border-angle),
      rgba(0, 0, 0, 0.0) 0%,
      rgba(0, 0, 0, 0.35) 10%,
      rgba(0, 0, 0, 0.0) 20%,
      rgba(0, 0, 0, 0.0) 100%
    ) border-box;
  border: 4px solid transparent;
  border-radius: var(--w3a-radius);
  height: 100%;
  overflow: hidden;
  box-shadow: 0 2px 4px var(--w3a-shadow);
  position: relative;
  animation: border-angle-rotate 4s infinite linear;
}

.action-item {
  padding: var(--w3a-gap-3);
  border-bottom: 1px solid var(--w3a-border);
  background: var(--w3a-surface-solid);
}

.action-item:last-child {
  border-bottom: none;
}

.action-type {
  font-weight: 600;
  color: var(--w3a-text);
  margin-bottom: var(--w3a-gap-2);
  display: flex;
  align-items: center;
  gap: var(--w3a-gap-2);
}

.action-type-badge {
  background: #667eea;
  color: white;
  padding: 2px var(--w3a-gap-2);
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 500;
}

.action-details {
  font-size: 0.9rem;
  color: var(--w3a-text-dim);
}

.action-detail {
  margin-bottom: var(--w3a-gap-1);
}

.action-detail strong {
  color: var(--w3a-text);
}
```

### Tooltip System
Hover-triggered tooltips with translucent backgrounds.

```css
.tooltip-container {
  position: relative;
  display: inline-block;
  z-index: 1001;
}

.tooltip-content {
  position: absolute;
  background: transparent;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid var(--w3a-border);
  border-radius: var(--w3a-radius-lg);
  padding: var(--w3a-gap-2);
  z-index: 1000;
  opacity: 0;
  visibility: hidden;
  transition: all var(--w3a-fast) var(--w3a-ease);
  height: var(--tooltip-height, auto);
  max-height: var(--tooltip-max-height, none);
  overflow-y: auto;
}

.tooltip-container:hover .tooltip-content {
  opacity: 1;
  visibility: visible;
}

/* Positioning variants */
.tooltip-content.top {
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  margin-bottom: var(--tooltip-offset, var(--w3a-gap-2));
}

.tooltip-content.bottom {
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  margin-top: var(--tooltip-offset, var(--w3a-gap-2));
}

.tooltip-content.left {
  right: 100%;
  top: 50%;
  transform: translateY(-50%);
  margin-right: var(--tooltip-offset, var(--w3a-gap-2));
}

.tooltip-content.right {
  left: 100%;
  top: 50%;
  transform: translateY(-50%);
  margin-left: var(--tooltip-offset, var(--w3a-gap-2));
}
```

### Copy Button
Small utility button for copying content to clipboard.

```css
.copy-btn {
  position: absolute;
  top: var(--w3a-gap-2);
  right: var(--w3a-gap-2);
  background: #eef2f7;
  color: var(--w3a-text);
  border: 1px solid var(--w3a-border);
  border-radius: 6px;
  padding: 4px var(--w3a-gap-2);
  font-size: 0.75rem;
  cursor: pointer;
  transition: background var(--w3a-fast) var(--w3a-ease);
}

.copy-btn:hover {
  background: #e5eaf1;
}
```

### Loading States
Subtle loading indicators with consistent styling.

```css
.loading {
  display: none;
  align-items: center;
  justify-content: center;
  gap: var(--w3a-gap-2);
  color: #667eea;
  font-weight: 500;
}

.loading.show {
  display: flex;
}

.spinner {
  width: 16px;
  height: 16px;
  border: 2px solid var(--w3a-border);
  border-top: 2px solid #667eea;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
```

### Layout & Spacing

```css
.section {
  padding: var(--w3a-gap-6) 0;
}

.grid {
  display: grid;
  gap: var(--w3a-gap-4);
}

.grid.cols-2 {
  grid-template-columns: 1fr 1fr;
}

.grid.cols-3 {
  grid-template-columns: repeat(3, 1fr);
}

.divider {
  height: 1px;
  background: var(--w3a-border);
}
```

### Motion & States

```css
.hover-lift {
  transition: transform var(--w3a-fast) var(--w3a-ease);
}

.hover-lift:hover {
  transform: translateY(-2px);
}

.focus-ring {
  outline: none;
}

.focus-ring:focus-visible {
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.18);
  border-color: var(--w3a-border-strong);
}
```

### Accessibility
- Maintain WCAG-AA contrast ratios
- Focus-visible styles on all interactive elements
- Respect reduced-motion preferences
- Semantic HTML structure

### Browser Support
- Modern browsers with CSS custom properties support
- Fallback for browsers without `@property` (animation disabled)
- Graceful degradation for backdrop-filter

### Integration Notes
- These styles can coexist with existing design systems
- Use CSS custom properties for easy theming
- Maintain consistent spacing and typography scales
- Keep animations subtle and purposeful


