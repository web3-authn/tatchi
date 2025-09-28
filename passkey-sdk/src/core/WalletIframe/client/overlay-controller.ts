/**
 * OverlayController - Client-Side Communication Layer
 *
 * This module is the centralized controller for managing the wallet iframe's overlay
 * visibility and positioning. It provides a clean abstraction over the complex CSS
 * manipulations needed to show/hide the iframe for WebAuthn user activation.
 *
 * Key Responsibilities:
 * - Overlay Visibility Management: Controls when the iframe is visible vs hidden
 * - Positioning Modes: Supports fullscreen and anchored positioning modes
 * - Sticky Behavior: Prevents overlay from being hidden during critical operations
 * - CSS State Management: Handles all iframe styling for different overlay states
 * - Accessibility: Manages ARIA attributes and tabindex for screen readers
 * - Coordinate Handling: Converts DOMRect coordinates to CSS positioning
 *
 * Architecture:
 * - Single source of truth for iframe overlay state
 * - Mode-based positioning (hidden, fullscreen, anchored)
 * - Sticky mode prevents premature hiding during operations
 * - Clean separation between positioning logic and iframe management
 *
 * Overlay Modes:
 * - hidden: iframe is invisible with no footprint (0x0, pointer-events: none)
 * - fullscreen: iframe covers entire viewport for WebAuthn activation
 * - anchored: iframe positioned at specific coordinates (for inline UI components)
 *
 * Security Considerations:
 * - Uses high z-index (2147483646) to ensure overlay is above other content
 * - Controls pointer-events to avoid blocking page interaction when hidden
 * - Properly manages ARIA attributes for accessibility compliance
 * - Performs basic clamping (non-negative top/left, min size) but does not
 *   guarantee content stays fully within the viewport
 *
 * Usage Pattern:
 * 1. Create controller with iframe reference
 * 2. Set sticky mode for operations that need persistent overlay
 * 3. Show overlay (fullscreen or anchored) for user activation
 * 4. Hide overlay when activation is complete
 * 5. Clear sticky mode to allow normal hiding behavior
 */

export type DOMRectLike = { top: number; left: number; width: number; height: number };

type Mode = 'hidden' | 'fullscreen' | 'anchored';

export class OverlayController {
  private ensureIframe: () => HTMLIFrameElement;
  private mode: Mode = 'hidden';
  private visible = false;
  private sticky = false;
  private rect: DOMRectLike | null = null;

  constructor(opts: { ensureIframe: () => HTMLIFrameElement }) {
    this.ensureIframe = opts.ensureIframe;
  }

  /**
   * Set sticky mode - prevents overlay from being hidden during critical operations
   * When sticky=true, hide() calls are ignored to maintain overlay visibility
   */
  setSticky(v: boolean): void { this.sticky = !!v; }

  /**
   * Show overlay in fullscreen mode - covers the viewport
   * Used for WebAuthn activation where user needs to interact with TouchID/FaceID
   * This mode allows the iframe to receive user activation events
   */
  showFullscreen(): void {
    const iframe = this.ensureIframe();
    this.visible = true;
    this.mode = 'fullscreen';
    this.rect = null;

    // Step 1: Set up fullscreen positioning
    iframe.style.position = 'fixed';
    iframe.style.border = 'none';
    iframe.style.boxSizing = 'border-box';
    iframe.style.transform = '';
    iframe.style.right = '';
    iframe.style.bottom = '';
    iframe.style.inset = '0';
    iframe.style.top = '0';
    iframe.style.left = '0';
    iframe.style.width = '100vw';
    iframe.style.height = '100vh';

    // Step 2: Make overlay visible and interactive
    iframe.style.opacity = '1';
    iframe.style.pointerEvents = 'auto';
    iframe.style.zIndex = '2147483646'; // High z-index to be above all content

    // Step 3: Set accessibility attributes
    iframe.setAttribute('aria-hidden', 'false');
    iframe.removeAttribute('tabindex');
  }

  /**
   * Show overlay in anchored mode - positioned at specific coordinates
   * Used for inline UI components that need to appear at a specific location
   * Coordinates are viewport-relative (from getBoundingClientRect()); values are
   * clamped to non-negative top/left and minimum width/height
   */
  showAnchored(rect: DOMRectLike): void {
    const iframe = this.ensureIframe();
    this.visible = true;
    this.mode = 'anchored';
    this.rect = { ...rect };

    // Step 1: Clear conflicting CSS properties first
    iframe.style.position = 'fixed';
    iframe.style.border = 'none';
    iframe.style.boxSizing = 'border-box';
    iframe.style.right = '';
    iframe.style.bottom = '';
    iframe.style.inset = '';
    iframe.style.transform = '';

    // Step 2: Set explicit positioning with basic clamping
    iframe.style.top = `${Math.max(0, Math.round(rect.top))}px`;
    iframe.style.left = `${Math.max(0, Math.round(rect.left))}px`;
    iframe.style.width = `${Math.max(1, Math.round(rect.width))}px`;
    iframe.style.height = `${Math.max(1, Math.round(rect.height))}px`;

    // Step 3: Make overlay visible and interactive
    iframe.style.opacity = '1';
    iframe.style.pointerEvents = 'auto';
    iframe.style.zIndex = '2147483646';

    // Step 4: Set accessibility attributes
    iframe.setAttribute('aria-hidden', 'false');
    iframe.removeAttribute('tabindex');
  }

  /**
   * Update anchored rectangle coordinates
   * If overlay is currently in anchored mode, immediately apply new position
   */
  setAnchoredRect(rect: DOMRectLike): void {
    this.rect = { ...rect };
    if (this.visible && this.mode === 'anchored') this.showAnchored(this.rect);
  }

  /**
   * Show overlay preferring anchored mode when a rect is available.
   * Falls back to fullscreen when no anchored rect has been set yet.
   * Safe to call repeatedly; it will re-apply current state.
   */
  showPreferAnchored(): void {
    if (this.rect) {
      this.showAnchored(this.rect);
    } else {
      this.showFullscreen();
    }
  }

  /**
   * Clear anchored rectangle - removes stored coordinates
   */
  clearAnchoredRect(): void { this.rect = null; }

  /**
   * Hide overlay - makes iframe invisible with no footprint
   * Respects sticky mode - won't hide if sticky=true
   * Used when WebAuthn activation is complete or operation is cancelled
   */
  hide(): void {
    // Step 1: Check sticky mode - don't hide if operation is still in progress
    if (this.sticky) return;

    const iframe = this.ensureIframe();
    this.visible = false;
    this.mode = 'hidden';

    // Step 2: Make iframe invisible and non-interactive
    iframe.style.width = '0px';
    iframe.style.height = '0px';
    iframe.style.opacity = '0';
    iframe.style.pointerEvents = 'none';
    iframe.style.zIndex = '';
    iframe.style.transform = '';

    // Step 3: Set accessibility attributes for hidden state
    iframe.setAttribute('aria-hidden', 'true');
    iframe.setAttribute('tabindex', '-1');
  }

  getState(): { visible: boolean; mode: Mode; sticky: boolean; rect?: DOMRectLike } {
    return { visible: this.visible, mode: this.mode, sticky: this.sticky, rect: this.rect || undefined };
  }
}

export default OverlayController;
