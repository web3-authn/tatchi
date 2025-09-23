import { html, css } from 'lit';
import { LitElementWithProps } from '../LitElementWithProps';

export type DrawerTheme = 'dark' | 'light';

// Consolidated constants (single source of truth)
const SHEET_HEIGHT_VH = 100; // Tall sheet to allow reveal/overpull
const DEFAULT_VISIBLE_VH = 50; // Fallback visible height when not provided
const FLICK_UP_CLOSE_THRESHOLD = -0.6; // px/ms (~600 px/s upward)
const FLICK_DOWN_CLOSE_THRESHOLD = 0.7;  // px/ms (~700 px/s downward)
const NEAR_CLOSED_PX = 50; // Close when within 50px of bottom
const OVERPULL_SHEET_FACTOR = 0.5;    // Allow at least 50% of sheet height
const OVERPULL_VIEWPORT_FACTOR = 0.5; // Or 50% of viewport height

function clamp(n: number, min: number, max: number): number { return Math.max(min, Math.min(max, n)); }

export class DrawerElement extends LitElementWithProps {
  static properties = {
    open: { type: Boolean, reflect: true },
    theme: { type: String, reflect: true },
    loading: { type: Boolean },
    errorMessage: { type: String },
    dragToClose: { type: Boolean, attribute: 'drag-to-close' },
    showCloseButton: { type: Boolean, attribute: 'show-close-button' },
    // Optional height cap for the drawer (e.g., '50vh')
    height: { type: String },
    // Minimum upward overpull allowance in pixels
    overpullPx: { type: Number, attribute: 'overpull-px' },
    // Height is content-driven with an optional cap
  } as const;

  declare open: boolean;
  declare theme: DrawerTheme;
  declare loading: boolean;
  declare errorMessage?: string;
  declare dragToClose: boolean;
  declare showCloseButton: boolean;
  declare height?: string;
  declare overpullPx: number;

  // Drag state
  private isDragging = false;
  private startY = 0;
  private currentY = 0;
  private dragDistance = 0;
  private lastDragTime = 0;
  private velocity = 0;
  private drawerElement: HTMLElement | null = null;
  private overlayElement: HTMLElement | null = null;
  private drawerHeight = 0;
  private startTranslateYPx = 0; // translateY at gesture start, in px
  private openRestTranslateYPx = 0; // translateY for the default "open" rest position, in px
  private dragStartTime = 0; // ms
  private isClosing = false;
  private aboveFoldResizeObserver?: ResizeObserver;
  private drawerResizeObserver?: ResizeObserver;

  static styles = css`
    :host { display: contents; }
    .overlay {
      position: fixed;
      inset: 0;
      /* Match modal backdrop look */
      background: oklch(0.2 0.01 240 / 0.8);
      z-index: 2147483646;
      opacity: 0;
      pointer-events: none;
      transition: opacity .15s ease;
    }
    :host([open]) .overlay { opacity: 1; pointer-events: auto; }

    .drawer {
      position: fixed;
      left: 0; right: 0; bottom: 0;
      z-index: 2147483647;
      /* Use AccessKeysModal token set; fall back to Lit host vars */
      background: var(--w3a-colors-colorBackground, var(--w3a-color-background, #111));
      color: var(--w3a-colors-textPrimary, var(--w3a-text-primary, #f6f7f8));
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif;
      font-size: 1rem;
      border-top-left-radius: 3rem;
      border-top-right-radius: 3rem;
      border: 1px solid var(--w3a-colors-borderPrimary, var(--w3a-color-border, rgba(255,255,255,0.12)));
      transform: translateY(100%);
      transition: transform 0.15s cubic-bezier(0.32, 0.72, 0, 1);
      box-shadow: 0 -10px 28px rgba(0,0,0,0.35);
      padding: 2rem;
      /* Constrain width and center horizontally */
      max-width: 600px;
      margin-left: auto;
      margin-right: auto;
      /* Use a tall sheet so we can overpull without clipping */
      height: var(--w3a-drawer__sheet-height, 100vh);
      display: grid;
      grid-template-rows: auto 1fr;
    }

    /* Default to closed (100%) until JS computes the open translate.
       This avoids a flash at 0% then shrinking to content. */
    :host([open]) .drawer { transform: translateY(var(--w3a-drawer__open-translate, 100%)); }
    /* full-open removed; drawer opens to content height (capped) */
    .drawer.dragging { transition: none; }
    .handle {
      width: 36px; height: 4px; border-radius: 2px;
      background: var(--w3a-colors-borderPrimary, var(--w3a-color-border, rgba(255,255,255,0.25)));
      margin: 6px auto 10px;
    }

    /* Ensure the body can actually shrink so overflow works inside grid */
    .body { overflow: auto; padding: 0; min-height: 0; }

    /* Child container to keep content visible above the fold when fully open */
    .above-fold {
      position: sticky;
      top: 0;
      background: inherit;
      z-index: 1;
      padding-bottom: max(16px, env(safe-area-inset-bottom));
    }

    /* full-open removed */
    .close-btn {
      position: absolute;
      right: 0rem;
      top: 0rem;
      background: none;
      border: none;
      color: var(--w3a-colors-textMuted, var(--w3a-text-muted, #99a0aa));
      font-size: 28px;
      line-height: 1;
      cursor: pointer;
      width: 48px;
      height: 48px;
      border-radius: 2rem;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all .2s ease;
      z-index: 3;
    }
    .close-btn:hover { color: var(--w3a-colors-textPrimary, var(--w3a-text-primary, #f6f7f8)); background: var(--w3a-colors-colorSurface, var(--w3a-color-surface, rgba(255,255,255,0.08))); }
    .close-btn:active { transform: scale(0.96); }
    .close-btn:focus-visible {
      outline: 2px solid var(--w3a-modal__btn__focus-outline-color, var(--w3a-colors-accent, var(--w3a-color-primary, #3b82f6)));
      outline-offset: 3px;
    }
    /* Light theme adjustments */
    :host([theme="light"]) .close-btn { color: var(--w3a-colors-textMuted, var(--w3a-text-muted, #667085)); }
    :host([theme="light"]) .close-btn:hover { color: var(--w3a-colors-textPrimary, var(--w3a-text-primary, #181a1f)); background: var(--w3a-colors-colorSurface, var(--w3a-color-surface, rgba(0,0,0,0.06))); }
    .error { color: var(--w3a-colors-error, var(--w3a-red400, #ff7a7a)); font-size: 13px; margin-top: 6px; }
    :host([theme="light"]) .drawer { background: var(--w3a-colors-colorBackground, var(--w3a-color-background, #fff)); color: var(--w3a-colors-textPrimary, var(--w3a-text-primary, #181a1f)); border-color: var(--w3a-colors-borderPrimary, var(--w3a-color-border, rgba(0,0,0,0.08))); }
    /* confirm/cancel button styles removed */

    /* Responsive adjustments */
    @media (max-width: 640px) {
      .drawer { padding: 0; }
      .close-btn { right: 1rem; top: 1rem; width: 44px; height: 44px; font-size: 26px; }
    }
  `;

  constructor() {
    super();
    this.open = false;
    this.theme = 'dark';
    this.loading = false;
    this.dragToClose = true;
    this.showCloseButton = true;
    this.height = undefined;
    this.overpullPx = 120;
  }

  protected getComponentPrefix(): string { return 'modal'; }

  connectedCallback() {
    super.connectedCallback();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.removeDragListeners();
    try { this.aboveFoldResizeObserver?.disconnect(); } catch {}
    try { this.drawerResizeObserver?.disconnect(); } catch {}
  }

  // Ensure visual state resets immediately when `open` attribute flips
  attributeChangedCallback(name: string, oldVal: string | null, newVal: string | null) {
    super.attributeChangedCallback?.(name, oldVal, newVal);
    if (name === 'open' && newVal !== oldVal) {
      // When opening, clear inline styles so CSS can apply open transform/opacity
      if (newVal !== null) {
        if (this.drawerElement) {
          this.drawerElement.style.transition = '';
          this.drawerElement.style.removeProperty('transform');
        }
        if (this.overlayElement) {
          this.overlayElement.style.removeProperty('opacity');
          this.overlayElement.style.pointerEvents = '';
        }
        this.isClosing = false;
      }
    }
  }

  firstUpdated() {
    this.drawerElement = this.shadowRoot?.querySelector('.drawer') as HTMLElement;
    this.overlayElement = this.shadowRoot?.querySelector('.overlay') as HTMLElement;
    this.syncCssVarsForOpenTranslate();
    // Recalculate when slot content changes or viewport resizes
    const slotEl = this.shadowRoot?.querySelector('slot') as HTMLSlotElement | null;
    slotEl?.addEventListener('slotchange', () => this.syncCssVarsForOpenTranslate());
    try { window.addEventListener('resize', this.syncCssVarsForOpenTranslate.bind(this)); } catch {}
    // Observe size changes of the above-fold content and drawer container
    try {
      const above = this.shadowRoot?.querySelector('.above-fold') as HTMLElement | null;
      if (above && 'ResizeObserver' in window) {
        this.aboveFoldResizeObserver = new ResizeObserver(() => this.syncCssVarsForOpenTranslate());
        this.aboveFoldResizeObserver.observe(above);
      }
      if (this.drawerElement && 'ResizeObserver' in window) {
        this.drawerResizeObserver = new ResizeObserver(() => this.syncCssVarsForOpenTranslate());
        this.drawerResizeObserver.observe(this.drawerElement);
      }
    } catch {}
    this.setupDragListeners();
  }

  updated(changedProperties: Map<string | number | symbol, unknown>) {
    super.updated(changedProperties);

    // Debug open property changes
    if (changedProperties.has('open')) {
      console.log('Drawer open property changed to:', this.open);
      // Uncontrolled: no suppression; trust imperative calls
      // When externally toggled open, clear any inline overrides so CSS can control
      if (this.drawerElement && this.open) {
        this.drawerElement.style.transition = '';
        this.drawerElement.style.removeProperty('transform');
      }
      if (this.overlayElement && this.open) {
        this.overlayElement.style.pointerEvents = '';
        this.overlayElement.style.removeProperty('opacity');
      }
      if (this.open) {
        this.isClosing = false;
      }
    }

    // Re-setup drag listeners if dragToClose property changed
    if (changedProperties.has('dragToClose')) {
      this.removeDragListeners();
      this.setupDragListeners();
    }

    // Map `height` (visible height) to open translate percentage for a 100vh sheet
    if (changedProperties.has('height') || changedProperties.has('open')) {
      // Defer to ensure DOM paints before measuring
      setTimeout(() => this.syncCssVarsForOpenTranslate(), 0);
    }
  }

  // ---- Helpers for visible height ↔ translateY% ----
  private getVisibleVh(): number {
    const h = (this.height || '').trim();
    // Accept 0-100 with units: vh, dvh, svh, lvh; "auto" (or unset) falls back to content-fit
    const m = h.match(/^([0-9]+(?:\.[0-9]+)?)\s*(d?vh|svh|lvh|vh)$/i);
    if (m) return clamp(parseFloat(m[1]), 0, 100);
    return DEFAULT_VISIBLE_VH;
  }

  private getOpenTranslateRatio(): number {
    // translateY ratio (0..1) for a 100vh sheet
    const visible = this.getVisibleVh();
    return clamp((SHEET_HEIGHT_VH - visible) / SHEET_HEIGHT_VH, 0, 1);
  }

  private syncCssVarsForOpenTranslate(): void {
    const drawer = this.drawerElement;
    if (!drawer) return;

    // Prefer explicit height prop; otherwise fit to content
    const h = (this.height || '').trim();
    const m = h.match(/^([0-9]+(?:\.[0-9]+)?)\s*(d?vh|svh|lvh|vh)$/i);
    if (m) {
      const unit = (m[2] || 'vh').toLowerCase();
      const visibleVh = clamp(parseFloat(m[1]), 0, 100);
      const pct = clamp(100 - visibleVh, 0, 100);
      // Sheet uses same viewport unit as provided height for better alignment
      this.style.setProperty('--w3a-drawer__sheet-height', `100${unit}`);
      this.style.setProperty('--w3a-drawer__open-translate', pct + '%');
      return;
    }

    // Default: auto-fit to content height (.above-fold)
    this.style.setProperty('--w3a-drawer__sheet-height', `${SHEET_HEIGHT_VH}vh`);

    // Measure above-fold bottom relative to drawer top to fit content exactly above the fold
    const above = this.shadowRoot?.querySelector('.above-fold') as HTMLElement | null;
    if (!above) return;
    const drawerRect = drawer.getBoundingClientRect();
    const aboveRect = above.getBoundingClientRect();
    const contentBottomPx = Math.max(0, Math.round(aboveRect.bottom - drawerRect.top));
    const sheetPx = drawer.offsetHeight || (typeof window !== 'undefined' ? window.innerHeight : contentBottomPx);
    const ratio = clamp(1 - contentBottomPx / Math.max(1, sheetPx), 0, 1);
    this.style.setProperty('--w3a-drawer__open-translate', (ratio * 100).toFixed(4) + '%');
  }

  private setupDragListeners() {
    if (!this.dragToClose) return;

    // Use a small delay to ensure the element is rendered
    setTimeout(() => {
      const drawerElement = this.shadowRoot?.querySelector('.drawer') as HTMLElement;
      const handleElement = this.shadowRoot?.querySelector('.handle') as HTMLElement;

      if (!drawerElement) {
        console.warn('Drawer element not found for drag listeners');
        return;
      }

      // Remove any existing listeners first
      this.removeDragListeners();

      // Generic drawer: start drag from anywhere inside the drawer
      drawerElement.addEventListener('mousedown', this.handleMouseDown);
      document.addEventListener('mousemove', this.handleMouseMove);
      document.addEventListener('mouseup', this.handleMouseUp);

      // Touch start on the drawer; move/end on document
      drawerElement.addEventListener('touchstart', this.handleTouchStart, { passive: false });
      document.addEventListener('touchmove', this.handleTouchMove, { passive: false });
      document.addEventListener('touchend', this.handleTouchEnd, { passive: false });
    }, 0);
  }

  private removeDragListeners() {
    const drawerElement = this.shadowRoot?.querySelector('.drawer') as HTMLElement;
    if (!drawerElement) return;

    // Remove listeners from drawer element
    drawerElement.removeEventListener('touchstart', this.handleTouchStart as EventListener);
    drawerElement.removeEventListener('mousedown', this.handleMouseDown as EventListener);

    // Remove listeners from document
    document.removeEventListener('touchmove', this.handleTouchMove);
    document.removeEventListener('touchend', this.handleTouchEnd);
    document.removeEventListener('mousemove', this.handleMouseMove);
    document.removeEventListener('mouseup', this.handleMouseUp);
  }

  private handleTouchStart = (e: TouchEvent) => {
    if (this.loading || !this.open) return;

    const touch = e.touches[0];
    this.startDrag(touch.clientY);
    e.preventDefault();
  };

  private handleTouchMove = (e: TouchEvent) => {
    if (!this.isDragging) return;

    const touch = e.touches[0];
    this.updateDrag(touch.clientY);
    e.preventDefault();
  };

  private handleTouchEnd = (e: TouchEvent) => {
    if (!this.isDragging) return;

    this.endDrag();
    e.preventDefault();
  };

  private handleMouseDown = (e: MouseEvent) => {
    if (this.loading || !this.open) return;

    this.startDrag(e.clientY);
    e.preventDefault();
  };

  private handleMouseMove = (e: MouseEvent) => {
    if (!this.isDragging) return;

    this.updateDrag(e.clientY);
    e.preventDefault();
  };

  private handleMouseUp = (e: MouseEvent) => {
    if (!this.isDragging) return;

    this.endDrag();
    e.preventDefault();
  };

  private startDrag(y: number) {
    this.isDragging = true;
    this.startY = y;
    this.currentY = y;
    this.dragDistance = 0;
    this.dragStartTime = Date.now();
    this.lastDragTime = this.dragStartTime;
    this.velocity = 0;

    if (this.drawerElement) {
      this.drawerHeight = this.drawerElement.offsetHeight;
      // Rest position derived from the same visible height value used for CSS
      this.openRestTranslateYPx = this.drawerHeight * this.getOpenTranslateRatio();

      // Determine current translateY in px to support starting drags from any snapped position
      const computed = getComputedStyle(this.drawerElement);
      const transform = computed.transform || '';
      const ty = this.parseTranslateY(transform);
      // If transform is 'none', use the rest position
      this.startTranslateYPx = Number.isFinite(ty) ? ty : this.openRestTranslateYPx;

      this.drawerElement.classList.add('dragging');
    }
  }

  private updateDrag(y: number) {
    if (!this.isDragging || !this.drawerElement) return;

    const now = Date.now();
    const deltaTime = now - this.lastDragTime;
    const deltaY = y - this.currentY;

    if (deltaTime > 0) {
      this.velocity = deltaY / deltaTime;
    }

    this.currentY = y;
    this.dragDistance = y - this.startY; // negative = upward, positive = downward

    // Elastic overdrag only when crossing above the fully-open rest position
    // Allow at least 50% of sheet or viewport height, or the configured minimum
    const viewportHalf = (typeof window !== 'undefined' && window.innerHeight)
      ? window.innerHeight * OVERPULL_VIEWPORT_FACTOR
      : 0;
    const maxOverdragUpPx = Math.max(this.drawerHeight * OVERPULL_SHEET_FACTOR, viewportHalf, this.overpullPx);

    const rawTargetTranslateY = this.startTranslateYPx + this.dragDistance;
    let targetTranslateY = rawTargetTranslateY;

    // openRestTranslateYPx is the minimal (most open) resting translateY.
    // If the user drags above this (smaller translateY), apply elastic.
    if (rawTargetTranslateY < this.openRestTranslateYPx) {
      const overdragUp = this.openRestTranslateYPx - rawTargetTranslateY; // positive px
      const elasticUp = maxOverdragUpPx * (1 - 1 / (overdragUp / maxOverdragUpPx + 1));
      targetTranslateY = this.openRestTranslateYPx - elasticUp;
    }
    this.drawerElement.style.transition = '';
    this.drawerElement.style.transform = `translateY(${targetTranslateY}px)`;

    this.lastDragTime = now;
  }

  private endDrag() {
    if (!this.isDragging || !this.drawerElement) return;

    this.isDragging = false;
    this.drawerElement.classList.remove('dragging');

    const drawerHeight = this.drawerHeight || this.drawerElement.offsetHeight;
    // Preserve 0 as a valid rest position; only fall back if NaN
    const openRestPx = Number.isFinite(this.openRestTranslateYPx) ? this.openRestTranslateYPx : drawerHeight * 0.20;

    // Compute effective velocities (instantaneous and average over gesture)
    const now = Date.now();
    const gestureMs = Math.max(1, now - this.dragStartTime);
    const totalDeltaPx = this.currentY - this.startY; // positive = down, negative = up
    const avgVelocity = totalDeltaPx / gestureMs; // px/ms
    const effectiveDownV = Math.max(this.velocity, avgVelocity);
    const effectiveUpV = Math.min(this.velocity, avgVelocity);

    // Velocity-based flick-to-close (upward flick)
    // negative means upward movement
    if (effectiveUpV <= FLICK_UP_CLOSE_THRESHOLD) {
      this.closeDrawer();
      this.resetDragState();
      return;
    }

    // Velocity-based flick-to-close (downward flick)
    if (effectiveDownV >= FLICK_DOWN_CLOSE_THRESHOLD) {
      this.closeDrawer();
      this.resetDragState();
      return;
    }

    // Evaluate current position for near-closed detection
    const currentTransformTy = this.parseTranslateY(getComputedStyle(this.drawerElement).transform);
    const currentTranslatePx = Number.isFinite(currentTransformTy) ? currentTransformTy : openRestPx;

    // If near fully closed (bottom within threshold), close
    if (currentTranslatePx >= drawerHeight - NEAR_CLOSED_PX) {
      this.closeDrawer();
      this.resetDragState();
      return;
    }

    // No snapping: let the drawer rest under parent control.
    // Clear inline transform so CSS (via `[open]`) governs final position.
    this.drawerElement.style.transition = '';
    this.drawerElement.style.removeProperty('transform');
    this.resetDragState();
  }

  private resetDragState() {
    this.dragDistance = 0;
    this.velocity = 0;
  }

  // Parse translateY value from CSS transform string (matrix or matrix3d)
  private parseTranslateY(transform: string): number {
    if (!transform || transform === 'none') return NaN;
    // matrix(a, b, c, d, tx, ty)
    if (transform.startsWith('matrix(')) {
      const values = transform.slice(7, -1).split(',').map(v => parseFloat(v.trim()));
      return values.length === 6 ? values[5] : NaN;
    }
    // matrix3d(a1..a16) -> ty is value 14 (index 13)
    if (transform.startsWith('matrix3d(')) {
      const values = transform.slice(9, -1).split(',').map(v => parseFloat(v.trim()));
      return values.length === 16 ? values[13] : NaN;
    }
    // translateY(XXpx/%)
    const match = transform.match(/translateY\(([-\d.]+)px\)/);
    if (match) return parseFloat(match[1]);
    return NaN;
  }

  private closeDrawer() {
    if (this.isClosing) return;
    this.isClosing = true;
    // Remove inline transforms so CSS can drive the close state
    if (this.drawerElement) {
      this.drawerElement.classList.remove('dragging');
      this.drawerElement.style.removeProperty('transition');
      this.drawerElement.style.removeProperty('transform');
    }
    // Flip the `open` property so CSS applies the closed transform and overlay state
    this.open = false;
    // Notify host after state change
    this.dispatchEvent(new CustomEvent('cancel', { bubbles: true, composed: true }));
    // Reset closing guard after a short delay to avoid duplicate cancels
    setTimeout(() => { this.isClosing = false; }, 300);
  }

  private onClose = () => {
    if (this.loading) return;
    if (this.isClosing) return;

    // Remove inline transforms so CSS can drive the close state
    if (this.drawerElement) {
      this.drawerElement.classList.remove('dragging');
      this.drawerElement.style.removeProperty('transition');
      this.drawerElement.style.removeProperty('transform');
    }
    // Flip open then notify host (retain 'cancel' event for back-compat)
    this.open = false;
    this.dispatchEvent(new CustomEvent('cancel', { bubbles: true, composed: true }));
    this.isClosing = true;
    setTimeout(() => { this.isClosing = false; }, 300);
  };

  // Click/tap on the handle toggles open/close
  private onHandleClick = () => {
    if (!this.open) {
      this.show();
    } else {
      this.hide('handle');
    }
  };

  // Imperative API (uncontrolled usage)
  public show() {
    if (this.drawerElement) {
      this.drawerElement.classList.remove('dragging');
      this.drawerElement.style.removeProperty('transition');
      this.drawerElement.style.removeProperty('transform');
    }
    this.open = true;
  }

  public hide(reason: string = 'programmatic') {
    if (this.drawerElement) {
      this.drawerElement.classList.remove('dragging');
      this.drawerElement.style.removeProperty('transition');
      this.drawerElement.style.removeProperty('transform');
    }
    this.open = false;
    // Dispatch cancel to keep back-compat with existing listeners
    this.dispatchEvent(new CustomEvent('cancel', { bubbles: true, composed: true, detail: { reason } }));
  }

  public toggle(force?: boolean) {
    const target = typeof force === 'boolean' ? force : !this.open;
    if (target) this.show(); else this.hide('toggle');
  }

  // Public helpers for explicit open/close control
  public handleOpen() { this.show(); }
  public handleClose() { this.hide('handleClose'); }

  render() {
    return html`
      <div class="overlay" @click=${this.onClose}></div>
      <section class="drawer" role="dialog" aria-modal="true">
        <div style="position: relative;">
          <div class="handle" @click=${this.onHandleClick}></div>
          ${this.showCloseButton ? html`<button aria-label="Close" title="Close" class="close-btn" @click=${this.onClose}>×</button>` : null}
        </div>
        <div class="body">
          ${this.errorMessage ? html`<div class="error">${this.errorMessage}</div>` : null}
          <div class="above-fold"><slot></slot></div>
        </div>
      </section>
    `;
  }
}

import { W3A_DRAWER_ID } from '../tags';
export default (function ensureDefined() {
  const TAG = W3A_DRAWER_ID;
  if (!customElements.get(TAG)) {
    customElements.define(TAG, DrawerElement);
  }
  return DrawerElement;
})();
