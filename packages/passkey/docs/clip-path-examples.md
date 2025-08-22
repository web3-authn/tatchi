# Clip-Path Union Examples for Button + Tooltip

## Shape Generation Strategy

For each tooltip position, we create a "corridor" that connects the button and tooltip with rounded corners, accounting for the gap between them.

## Position-Specific Algorithms

### Top-Center Position
```
Button: 100x40 at (150, 200)
Tooltip: 280x120 at (60, 60)
Gap: 8px

Union Shape: Rounded rectangle covering both + connecting corridor
```

### Top-Left Position
```
Button: 100x40 at (150, 200)
Tooltip: 280x120 at (20, 60)
Gap: 8px

Union Shape: L-shaped corridor with rounded corners
```

### Left Position
```
Button: 100x40 at (150, 200)
Tooltip: 280x120 at (20, 140)
Gap: 8px

Union Shape: Horizontal capsule connecting both rectangles
```

## Clip-Path Polygon Generation

### Algorithm Steps:
1. **Get button rectangle** with border-radius
2. **Get tooltip rectangle** with border-radius
3. **Calculate gap offset** based on position
4. **Generate connecting corridor** points
5. **Create rounded polygon** covering the union
6. **Optimize point count** for performance

### Example Clip-Path Output:
```css
clip-path: polygon(
  /* Button top-left corner (rounded) */
  150px 208px, 155px 200px, 245px 200px, 250px 208px,
  /* Connecting corridor to tooltip */
  250px 180px, 340px 180px, 340px 60px,
  /* Tooltip rectangle (rounded) */
  340px 65px, 335px 60px, 25px 60px, 20px 65px,
  20px 175px, 25px 180px,
  /* Back to button */
  150px 180px, 150px 208px
);
```

## Performance Optimizations

1. **Minimal point count** - Use 8-12 points maximum
2. **Point snapping** - Round to integer pixels
3. **Caching** - Only recalculate when geometry changes
4. **Smooth transitions** - CSS transition on clip-path changes

## Browser Support & Fallbacks

- **Modern browsers**: Full clip-path polygon support
- **Fallback**: Rectangular iframe (still secure, less precise)
- **Detection**: `CSS.supports('clip-path: polygon(0 0)')`
