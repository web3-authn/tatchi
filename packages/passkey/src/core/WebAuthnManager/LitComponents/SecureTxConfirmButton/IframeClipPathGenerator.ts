import type { Rectangle, TooltipGeometry } from './IframeButton';

/**
 * IframeClipPathGenerator creates precise clip-path polygons for button + tooltip unions.
 * Supports all 8 tooltip positions with optimized shape algorithms.
 */
export class IframeClipPathGenerator {
  static generateUnion(geometry: TooltipGeometry): string {
    const { button, tooltip, position, gap } = geometry;
    if (!CSS.supports('clip-path: polygon(0 0)')) {
      console.warn('clip-path not supported, skipping shape generation');
      return '';
    }
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
      default:
        console.warn(`Unknown tooltip position: ${position}`);
        return this.generateTopCenterUnion(button, tooltip, gap);
    }
  }

  private static generateTopCenterUnion(button: Rectangle, tooltip: Rectangle, gap: number): string {
    const minX = Math.min(button.x, tooltip.x);
    const maxX = Math.max(button.x + button.width, tooltip.x + tooltip.width);
    const minY = tooltip.y;
    const maxY = button.y + button.height;
    const borderRadius = 2;
    const width = maxX - minX;
    const height = maxY - minY;
    return `polygon(${this.createRoundedRect(minX, minY, width, height, borderRadius)})`;
  }

  private static generateBottomCenterUnion(button: Rectangle, tooltip: Rectangle, gap: number): string {
    const minX = Math.min(button.x, tooltip.x);
    const maxX = Math.max(button.x + button.width, tooltip.x + tooltip.width);
    const minY = button.y;
    const maxY = tooltip.y + tooltip.height;
    const borderRadius = 2;
    const width = maxX - minX;
    const height = maxY - minY;
    return `polygon(${this.createRoundedRect(minX, minY, width, height, borderRadius)})`;
  }

  private static generateLeftUnion(button: Rectangle, tooltip: Rectangle, gap: number): string {
    const minX = tooltip.x;
    const maxX = button.x + button.width;
    const minY = Math.min(button.y, tooltip.y);
    const maxY = Math.max(button.y + button.height, tooltip.y + tooltip.height);
    const borderRadius = 2;
    const width = maxX - minX;
    const height = maxY - minY;
    return `polygon(${this.createRoundedRect(minX, minY, width, height, borderRadius)})`;
  }

  private static generateRightUnion(button: Rectangle, tooltip: Rectangle, gap: number): string {
    const minX = button.x;
    const maxX = tooltip.x + tooltip.width;
    const minY = Math.min(button.y, tooltip.y);
    const maxY = Math.max(button.y + button.height, tooltip.y + tooltip.height);
    const borderRadius = 2;
    const width = maxX - minX;
    const height = maxY - minY;
    return `polygon(${this.createRoundedRect(minX, minY, width, height, borderRadius)})`;
  }

  private static generateTopLeftUnion(button: Rectangle, tooltip: Rectangle, gap: number): string {
    return this.generateLShapedUnion(button, tooltip, gap, 'top-left');
  }

  private static generateTopRightUnion(button: Rectangle, tooltip: Rectangle, gap: number): string {
    return this.generateLShapedUnion(button, tooltip, gap, 'top-right');
  }

  private static generateBottomLeftUnion(button: Rectangle, tooltip: Rectangle, gap: number): string {
    return this.generateLShapedUnion(button, tooltip, gap, 'bottom-left');
  }

  private static generateBottomRightUnion(button: Rectangle, tooltip: Rectangle, gap: number): string {
    return this.generateLShapedUnion(button, tooltip, gap, 'bottom-right');
  }

  private static generateLShapedUnion(
    button: Rectangle,
    tooltip: Rectangle,
    gap: number,
    corner: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
  ): string {
    const minX = Math.min(button.x, tooltip.x);
    const maxX = Math.max(button.x + button.width, tooltip.x + tooltip.width);
    const minY = Math.min(button.y, tooltip.y);
    const maxY = Math.max(button.y + button.height, tooltip.y + tooltip.height);
    const borderRadius = 2;
    const width = maxX - minX;
    const height = maxY - minY;
    return `polygon(${this.createRoundedRect(minX, minY, width, height, borderRadius)})`;
  }

  public static createRoundedRect(
    x: number, y: number, width: number, height: number, radius: number
  ): string {
    const r = Math.min(radius, width / 2, height / 2);
    return [
      `${Math.round(x + r)}px ${Math.round(y)}px`,
      `${Math.round(x + width - r)}px ${Math.round(y)}px`,
      `${Math.round(x + width)}px ${Math.round(y + r)}px`,
      `${Math.round(x + width)}px ${Math.round(y + height - r)}px`,
      `${Math.round(x + width - r)}px ${Math.round(y + height)}px`,
      `${Math.round(x + r)}px ${Math.round(y + height)}px`,
      `${Math.round(x)}px ${Math.round(y + height - r)}px`,
      `${Math.round(x)}px ${Math.round(y + r)}px`
    ].join(', ');
  }
}

export default IframeClipPathGenerator;


