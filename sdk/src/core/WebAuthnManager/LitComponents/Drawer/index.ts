import { html, css } from 'lit';
import { LitElementWithProps } from '../LitElementWithProps';
import { dispatchLitCancel } from '../lit-events';
import { ensureExternalStyles } from '../css/css-loader';

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
  private pendingDrag = false;
  private startY = 0;
  private currentY = 0;
  private dragDistance = 0;
  private lastDragTime = 0;
  private velocity = 0;
  private drawerElement: HTMLElement | null = null;
  private overlayElement: HTMLElement | null = null;
  private bodyElement: HTMLElement | null = null;
  private drawerHeight = 0;
  private startTranslateYPx = 0; // translateY at gesture start, in px
  private openRestTranslateYPx = 0; // translateY for the default "open" rest position, in px
  private dragStartTime = 0; // ms
  private isClosing = false;
  private aboveFoldResizeObserver?: ResizeObserver;
  private drawerResizeObserver?: ResizeObserver;
  private vvSyncTimeout: number | null = null;
  private detachViewportSync?: () => void;
  // Disable transitions during first layout to avoid wrong-direction animation
  private _initialMount = true;
  // Suppress transition for the very first programmatic open
  private _firstOpen = true;

  // Minimal inline CSS to ensure correct initial placement before external CSS loads
  // Full visuals and transitions are provided by css/drawer.css (adopted via ensureExternalStyles)
  static styles = css`
    :host { display: contents; }
    /* Keep overlay invisible until external CSS is adopted to avoid flashes */
    .overlay { position: fixed; inset: 0; pointer-events: none; background: transparent; }
    .drawer {
      position: fixed;
      left: 0; right: 0; bottom: 0;
      /* Neutral initial paint to avoid flash before tokens load */
      background: var(--w3a-colors-colorBackground, transparent);
      color: var(--w3a-colors-textPrimary, inherit);
      border: none;
      transform: translateY(100%); /* start off-screen below */
    }
    :host([open]) .drawer {
      transform: translateY(calc(var(--w3a-drawer__open-translate, 100%) - var(--w3a-drawer__open-offset, 0px)));
    }
    /* Avoid close button color flash before token CSS is applied */
    .close-btn { color: var(--w3a-colors-textMuted, currentColor); background: none; }
  `;

  protected createRenderRoot(): HTMLElement | DocumentFragment {
    const root = super.createRenderRoot();
    // Adopt drawer.css (structural + tokens) for <w3a-drawer>
    ensureExternalStyles(root as ShadowRoot | DocumentFragment | HTMLElement, 'drawer.css', 'data-w3a-drawer-css').catch(() => {});
    return root;
  }

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
    this.attachViewportSync();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.removeDragListeners();
    try { this.aboveFoldResizeObserver?.disconnect(); } catch {}
    try { this.drawerResizeObserver?.disconnect(); } catch {}
    if (this.detachViewportSync) { try { this.detachViewportSync(); } catch {} this.detachViewportSync = undefined; }
    if (this.vvSyncTimeout != null) { try { clearTimeout(this.vvSyncTimeout); } catch {} this.vvSyncTimeout = null; }
  }

  // Ensure visual state resets immediately when `open` attribute flips
  attributeChangedCallback(name: string, oldVal: string | null, newVal: string | null) {
    super.attributeChangedCallback?.(name, oldVal, newVal);
    if (name === 'open' && newVal !== oldVal) {
      // When opening, rely on CSS; avoid inline style writes for CSP
      if (newVal !== null) { this.isClosing = false; }
    }
  }

  firstUpdated() {
    this.drawerElement = this.shadowRoot?.querySelector('.drawer') as HTMLElement;
    this.overlayElement = this.shadowRoot?.querySelector('.overlay') as HTMLElement;
    this.bodyElement = this.shadowRoot?.querySelector('.body') as HTMLElement;
    this.syncCssVarsForOpenTranslate();
    // Ensure no transition on first measurement; enable after a frame
    requestAnimationFrame(() => {
      this._initialMount = false;
      this.requestUpdate();
    });
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

    if (changedProperties.has('open')) {
      // When externally toggled open, allow CSS transitions to play naturally.
      if (this.open) {
        this.isClosing = false;
        // No first-open transition suppression; double rAF in the viewer handles settle.
        this._firstOpen = false;
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
      this.setCssVars({ '--w3a-drawer__sheet-height': `100${unit}`, '--w3a-drawer__open-translate': pct + '%' });
      return;
    }

    // Default: auto-fit to content height (.above-fold)
    try {
      const unit = (typeof CSS !== 'undefined' && CSS.supports && CSS.supports('height', '1dvh')) ? 'dvh' : 'vh';
      this.setCssVars({ '--w3a-drawer__sheet-height': `${SHEET_HEIGHT_VH}${unit}` });
    } catch {
      this.setCssVars({ '--w3a-drawer__sheet-height': `${SHEET_HEIGHT_VH}vh` });
    }

    // Measure above-fold bottom relative to drawer top to fit content exactly above the fold
    const above = this.shadowRoot?.querySelector('.above-fold') as HTMLElement | null;
    if (!above) return;
    const drawerRect = drawer.getBoundingClientRect();
    const aboveRect = above.getBoundingClientRect();
    const contentBottomPx = Math.max(0, Math.round(aboveRect.bottom - drawerRect.top));
    const sheetPx = drawer.offsetHeight || (typeof window !== 'undefined' ? window.innerHeight : contentBottomPx);
    const ratio = clamp(1 - contentBottomPx / Math.max(1, sheetPx), 0, 1);
    this.setCssVars({ '--w3a-drawer__open-translate': (ratio * 100).toFixed(4) + '%' });
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

      // Generic drawer: start drag from anywhere inside the drawer (mouse)
      drawerElement.addEventListener('mousedown', this.handleMouseDown, { capture: true } as AddEventListenerOptions);
      document.addEventListener('mousemove', this.handleMouseMove);
      document.addEventListener('mouseup', this.handleMouseUp);

      // Touch start on the drawer; use capture to run before child handlers that stopPropagation
      // Defer drag decision to first move to allow content scrolling when appropriate
      drawerElement.addEventListener('touchstart', this.handleTouchStart, { passive: false, capture: true });
      document.addEventListener('touchmove', this.handleTouchMove, { passive: false });
      document.addEventListener('touchend', this.handleTouchEnd, { passive: false });
    }, 0);
  }

  private attachViewportSync() {
    const drawerElement = this.shadowRoot?.querySelector('.drawer') as HTMLElement | null;
    if (!drawerElement) return;
    const vv: any = (typeof window !== 'undefined') ? (window as any).visualViewport : undefined;
    const schedule = () => this.suppressTransitionForViewportTick();

    try { window.addEventListener('resize', schedule, { passive: true } as AddEventListenerOptions); } catch {}
    try { window.addEventListener('orientationchange', schedule, { passive: true } as AddEventListenerOptions); } catch {}
    try { vv && vv.addEventListener && vv.addEventListener('resize', schedule); } catch {}
    try { vv && vv.addEventListener && vv.addEventListener('scroll', schedule); } catch {}

    this.detachViewportSync = () => {
      try { window.removeEventListener('resize', schedule as EventListener); } catch {}
      try { window.removeEventListener('orientationchange', schedule as EventListener); } catch {}
      try { vv && vv.removeEventListener && vv.removeEventListener('resize', schedule as EventListener); } catch {}
      try { vv && vv.removeEventListener && vv.removeEventListener('scroll', schedule as EventListener); } catch {}
    };
  }

  private suppressTransitionForViewportTick() {
    const drawerElement = this.shadowRoot?.querySelector('.drawer') as HTMLElement | null;
    if (!drawerElement) return;
    // Avoid fighting with active drag state; dragging already disables transitions
    if (!this.isDragging) drawerElement.classList.add('vv-sync');
    if (this.vvSyncTimeout != null) { try { clearTimeout(this.vvSyncTimeout); } catch {} }
    this.vvSyncTimeout = setTimeout(() => {
      this.vvSyncTimeout = null as any;
      try { drawerElement.classList.remove('vv-sync'); } catch {}
    }, 120) as unknown as number;
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

    // Do not initiate a drawer drag when the touch starts on the close button
    try {
      const target = e.target as HTMLElement | null;
      if (target && target.closest && target.closest('.close-btn')) {
        return;
      }
    } catch {}

    const touch = e.touches[0];
    this.pendingDrag = true;
    this.startY = touch.clientY;
    this.currentY = touch.clientY;
    // Do not preventDefault yet; decide on first meaningful move to allow normal scrolling when appropriate
  };

  private handleTouchMove = (e: TouchEvent) => {
    const touch = e.touches[0];

    // Decide whether to begin dragging on first significant move
    if (this.pendingDrag && !this.isDragging) {
      const dy = touch.clientY - this.startY;
      const absDy = Math.abs(dy);
      const ACTIVATE_PX = 8; // small threshold to distinguish from taps
      // Determine if content can scroll
      const body = this.bodyElement;
      const canScroll = !!body && body.scrollHeight > body.clientHeight;
      const atTop = !body || body.scrollTop <= 0;

      if (absDy >= ACTIVATE_PX) {
        // Begin drawer drag when the content is at the top boundary, for both
        // downward (close) and upward (open further) gestures. If the content
        // is not at the top yet, keep the gesture pending so the user can keep
        // scrolling the inner content until it reaches top, then transition into
        // a drawer drag in the same touch sequence.
        if (atTop) {
          this.startDrag(this.startY);
          this.isDragging = true;
          this.pendingDrag = false;
        } else {
          // Allow inner scrolling to proceed; keep pending so we can switch to drag when atTop
          // no-op
        }
      }
    }

    if (!this.isDragging) return;
    this.updateDrag(touch.clientY);
    e.preventDefault();
  };

  private handleTouchEnd = (e: TouchEvent) => {
    // Clear any undecided pending drag
    this.pendingDrag = false;
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
      // Align logical "rest" with actual CSS transform (which may include offsets)
      if (Number.isFinite(ty)) this.openRestTranslateYPx = ty as number;

      // Seed drag translate to current position before enabling .dragging to prevent jumps
      // Prevent initial flash to top when adding the dragging class by
      // publishing the current translateY as the drag variable first.
      this.setCssVars({ '--w3a-drawer__drag-translate': `${this.startTranslateYPx}px` });
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
    // Disable transitions via class; drive transform via CSS variable for CSP compliance
    this.setCssVars({ '--w3a-drawer__drag-translate': `${targetTranslateY}px` });

    this.lastDragTime = now;
  }

  private endDrag() {
    if (!this.isDragging || !this.drawerElement) return;

    this.isDragging = false;
    this.pendingDrag = false;
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

    // No snapping: let CSS govern final position via [open]; just drop dragging class
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
    // Let CSS drive close; avoid inline style writes
    if (this.drawerElement) { this.drawerElement.classList.remove('dragging'); }
    // Flip the `open` property so CSS applies the closed transform and overlay state
    this.open = false;
    // Notify host after state change
    dispatchLitCancel(this);
    // Reset closing guard after a short delay to avoid duplicate cancels
    setTimeout(() => { this.isClosing = false; }, 300);
  }

  private onClose = () => {
    if (this.loading) return;
    if (this.isClosing) return;

    if (this.drawerElement) { this.drawerElement.classList.remove('dragging'); }
    // Flip open then notify host (use lit-cancel for host listeners)
    this.open = false;
    dispatchLitCancel(this);
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
    if (this.drawerElement) { this.drawerElement.classList.remove('dragging'); }
    this.open = true;
  }

  public hide(reason: string = 'programmatic') {
    if (this.drawerElement) { this.drawerElement.classList.remove('dragging'); }
    this.open = false;
    // Dispatch lit-cancel so host listeners can react
    dispatchLitCancel(this, { reason });
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
      <section class="drawer ${this._initialMount ? 'init' : ''}" role="dialog" aria-modal="true">
        <div class="relative">
          <div class="handle" @click=${this.onHandleClick}></div>
          ${this.showCloseButton ? html`<button aria-label="Close" title="Close" class="close-btn" @click=${this.onClose} @touchend=${this.onClose}>×</button>` : null}
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
