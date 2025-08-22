# Enhanced Clip-Path Implementation Plan

## Core Classes & Types

### 1. Enhanced Tooltip Positioning
```typescript
type TooltipPosition =
  | 'top-left' | 'top-center' | 'top-right'
  | 'left' | 'right'
  | 'bottom-left' | 'bottom-center' | 'bottom-right';

interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
  borderRadius?: number;
}

interface TooltipGeometry {
  button: Rectangle;
  tooltip: Rectangle;
  position: TooltipPosition;
  gap: number;
  visible: boolean;
}
```

### 2. Clip-Path Generator Class
```typescript
class ClipPathGenerator {
  static generateUnion(geometry: TooltipGeometry): string {
    const { button, tooltip, position, gap } = geometry;

    switch (position) {
      case 'top-left':
        return this.generateTopLeftUnion(button, tooltip, gap);
      case 'top-center':
        return this.generateTopCenterUnion(button, tooltip, gap);
      case 'top-right':
        return this.generateTopRightUnion(button, tooltip, gap);
      case 'left':
        return this.generateLeftUnion(button, tooltip, gap);
      case 'right':
        return this.generateRightUnion(button, tooltip, gap);
      case 'bottom-left':
        return this.generateBottomLeftUnion(button, tooltip, gap);
      case 'bottom-center':
        return this.generateBottomCenterUnion(button, tooltip, gap);
      case 'bottom-right':
        return this.generateBottomRightUnion(button, tooltip, gap);
    }
  }

  private static generateTopCenterUnion(
    button: Rectangle,
    tooltip: Rectangle,
    gap: number
  ): string {
    // Create vertical capsule connecting button and tooltip
    const minX = Math.min(button.x, tooltip.x);
    const maxX = Math.max(button.x + button.width, tooltip.x + tooltip.width);
    const minY = tooltip.y;
    const maxY = button.y + button.height;

    // Generate rounded polygon points
    const borderRadius = 8;
    return `polygon(${this.createRoundedRect(minX, minY, maxX - minX, maxY - minY, borderRadius)})`;
  }

  private static generateTopLeftUnion(
    button: Rectangle,
    tooltip: Rectangle,
    gap: number
  ): string {
    // Create L-shaped corridor for corner positioning
    // More complex algorithm needed for smooth corners
    return this.generateLShapedUnion(button, tooltip, gap, 'top-left');
  }

  private static createRoundedRect(
    x: number, y: number, width: number, height: number, radius: number
  ): string {
    // Generate polygon points for rounded rectangle
    return [
      `${x + radius}px ${y}px`,
      `${x + width - radius}px ${y}px`,
      `${x + width}px ${y + radius}px`,
      `${x + width}px ${y + height - radius}px`,
      `${x + width - radius}px ${y + height}px`,
      `${x + radius}px ${y + height}px`,
      `${x}px ${y + height - radius}px`,
      `${x}px ${y + radius}px`
    ].join(', ');
  }
}
```

### 3. Enhanced EmbeddedTxIframe Host
```typescript
export class EmbeddedTxConfirmHost extends LitElement {
  private clipPathGenerator = new ClipPathGenerator();
  private currentGeometry: TooltipGeometry | null = null;

  private handleTooltipGeometry(event: MessageEvent) {
    if (event.data.type === 'TOOLTIP_GEOMETRY') {
      const geometry = event.data.payload as TooltipGeometry;
      this.updateClipPath(geometry);
    }
  }

  private updateClipPath(geometry: TooltipGeometry) {
    if (!this.iframeRef.value) return;

    // Generate clip-path for the union of button and tooltip
    const clipPath = ClipPathGenerator.generateUnion(geometry);

    // Apply with smooth transition
    this.iframeRef.value.style.clipPath = clipPath;
    this.iframeRef.value.style.transition = 'clip-path 0.2s ease';

    this.currentGeometry = geometry;
  }

  private setupClipPathFallback() {
    // Check for clip-path support
    if (!CSS.supports('clip-path: polygon(0 0)')) {
      console.warn('clip-path not supported, using rectangular iframe');
      return false;
    }
    return true;
  }
}
```

### 4. Enhanced Button Component
```typescript
export class EmbeddedTxConfirmElement extends LitElement {
  private observer: ResizeObserver | null = null;

  tooltip: {
    width: string;
    height: string;
    position: TooltipPosition; // Updated to support 8 positions
    offset: string;
  } = {
    width: '280px',
    height: 'auto',
    position: 'top-center',
    offset: '8px'
  };

  private measureAndReportGeometry() {
    const buttonElement = this.shadowRoot?.querySelector('.btn') as HTMLElement;
    const tooltipElement = this.shadowRoot?.querySelector('.tooltip-content') as HTMLElement;

    if (!buttonElement || !tooltipElement) return;

    const buttonRect = buttonElement.getBoundingClientRect();
    const tooltipRect = tooltipElement.getBoundingClientRect();
    const gap = this.parsePixelValue(this.tooltip.offset);

    const geometry: TooltipGeometry = {
      button: {
        x: buttonRect.left,
        y: buttonRect.top,
        width: buttonRect.width,
        height: buttonRect.height,
        borderRadius: 8
      },
      tooltip: {
        x: tooltipRect.left,
        y: tooltipRect.top,
        width: tooltipRect.width,
        height: tooltipRect.height,
        borderRadius: 24
      },
      position: this.tooltip.position,
      gap,
      visible: this.tooltipVisible
    };

    // Rate-limited postMessage
    requestAnimationFrame(() => {
      window.parent.postMessage({
        type: 'TOOLTIP_GEOMETRY',
        payload: geometry
      }, '*');
    });
  }

  private setupResizeObserver() {
    this.observer = new ResizeObserver(() => {
      if (this.tooltipVisible) {
        this.measureAndReportGeometry();
      }
    });

    // Observe both button and tooltip for size changes
    const buttonElement = this.shadowRoot?.querySelector('.btn');
    const tooltipElement = this.shadowRoot?.querySelector('.tooltip-content');

    if (buttonElement) this.observer.observe(buttonElement);
    if (tooltipElement) this.observer.observe(tooltipElement);
  }
}
```

## Implementation Priority

### Phase 1: Basic 4-Position Support (Top, Bottom, Left, Right)
- Implement simple union shapes (capsules)
- Add postMessage geometry reporting
- Create clip-path application logic

### Phase 2: Corner Position Support (8 positions total)
- Add L-shaped union algorithms
- Implement smart positioning logic
- Add position auto-detection based on available space

### Phase 3: Advanced Features
- Smooth clip-path animations
- ResizeObserver optimization
- Mobile touch handling
- Comprehensive fallback support

### Phase 4: Performance & Polish
- Point count optimization
- Caching and memoization
- Cross-browser testing
- Accessibility improvements
