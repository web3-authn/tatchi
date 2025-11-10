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
  private detachViewportSync?: () => void;

  private _syncRAF: number | null = null;
  private _lastOpenTranslatePct?: string;
  private _contentAnimRAF: number | null = null;
  private _activeHeightTransitions = 0;
  private detachContentAnimSync?: () => void;
  // Disable transitions during first layout to avoid wrong-direction animation
  private _initialMount = true;
  // Suppress transition for the very first programmatic open
  private _firstOpen = true;
  // Styles gating to avoid FOUC under strict CSP (no inline styles)
  private _stylesReady = false;
  private _stylePromises: Promise<void>[] = [];
  private _stylesAwaiting: Promise<void> | null = null;
  // Observe and adopt any children appended after mount (e.g., viewer injected later)
  private _childObserver: MutationObserver | null = null;

  protected createRenderRoot(): HTMLElement | DocumentFragment {
    // Light DOM render by design (no Shadow DOM):
    // - Strict CSP: avoid inline <style> and nonces; rely on external <link> or constructable stylesheets.
    // - Compatibility: adoptedStyleSheets is not universally available (iOS Safari/WebViews).
    // - Composition: sharing CSS variables across LitElements is simpler in light DOM; Shadow DOM would
    //   require pushing CSS vars into every component boundary. We therefore expose a stable `contentRoot`
    //   and use a slot-like adoption helper instead of <slot> in Shadow DOM.
    const root = (this as unknown) as HTMLElement;
    // Ensure drawer structural styles are available on the host/document
    const p = ensureExternalStyles(root as ShadowRoot | DocumentFragment | HTMLElement, 'drawer.css', 'data-w3a-drawer-css');
    this._stylePromises.push(p);
    p.catch(() => {});
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

  // Capture initial light-DOM children so they can be projected into the template
  private _initialChildren: Node[] | null = null;

  connectedCallback() {
    // Preserve existing child nodes before Lit's first render
    if (!this._initialChildren) {
      this._initialChildren = Array.from(this.childNodes);
      try {
        for (const n of this._initialChildren) this.removeChild(n);
      } catch {}
    }
    super.connectedCallback();
    this.attachViewportSync();
  }

  // Defer initial render until external styles are adopted to prevent FOUC
  protected shouldUpdate(_changed: Map<string | number | symbol, unknown>): boolean {
    if (this._stylesReady) return true;
    if (!this._stylesAwaiting) {
      const settle = Promise.all(this._stylePromises)
        .then(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
      this._stylesAwaiting = settle.then(() => { this._stylesReady = true; this.requestUpdate(); });
    }
    return false;
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.removeDragListeners();
    this.drawerElement?.removeEventListener('transitionend', this.handleTransitionEnd as EventListener);
    this.aboveFoldResizeObserver?.disconnect();
    this.drawerResizeObserver?.disconnect();
    if (this.detachViewportSync) { this.detachViewportSync(); this.detachViewportSync = undefined; }
    if (this.detachContentAnimSync) { this.detachContentAnimSync(); this.detachContentAnimSync = undefined; }
    if (this._childObserver) { this._childObserver.disconnect(); this._childObserver = null; }
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
    const root = this.renderRoot as unknown as ParentNode;
    this.drawerElement = root.querySelector('.drawer') as HTMLElement;
    this.overlayElement = root.querySelector('.overlay') as HTMLElement;
    this.bodyElement = root.querySelector('.body') as HTMLElement;
    this.syncCssVarsForOpenTranslate();
    // Seed a safe default for drag translate so if a drag starts before
    // we have published a pixel value, it falls back to the current open
    // translate instead of 0px. This prevents any momentary jump to the top.
    try { this.setCssVars({ '--w3a-drawer__drag-translate': 'var(--w3a-drawer__open-translate)' }); } catch {}
    // Ensure no transition on first measurement; enable after a frame
    requestAnimationFrame(() => {
      this._initialMount = false;
      this.requestUpdate();
    });
    this.drawerElement?.addEventListener('transitionend', this.handleTransitionEnd as EventListener);
    // Encapsulated: follow inner height transitions so the drawer animates with content
    this.setupAnimateWithContentSync();
    // Recalculate when slot content changes or viewport resizes
    // In light DOM mode, slotchange is not meaningful; rely on ResizeObserver below
    window.addEventListener('resize', this.syncCssVarsForOpenTranslate.bind(this));
    // Observe size changes of the above-fold content and drawer container
    const above = root.querySelector('.above-fold') as HTMLElement | null;
    if (above && 'ResizeObserver' in window) {
      this.aboveFoldResizeObserver = new ResizeObserver(() => this.syncCssVarsForOpenTranslate());
      this.aboveFoldResizeObserver.observe(above);
    }
    if (this.drawerElement && 'ResizeObserver' in window) {
      this.drawerResizeObserver = new ResizeObserver(() => this.syncCssVarsForOpenTranslate());
      this.drawerResizeObserver.observe(this.drawerElement);
    }
    this.setupDragListeners();

    // Slot-like adoption: move any host children appended after mount into the drawer's content area.
    // We intentionally do not use Shadow DOM + <slot> here because we want to:
    //  - stay CSP-compatible without nonces (no inline <style>),
    //  - work on platforms without adoptedStyleSheets (e.g., iOS Safari/WebViews), and
    //  - make cross-component CSS variable sharing straightforward without punching vars through
    //    multiple ShadowRoot boundaries.
    this.adoptContentIntoSlot();
    this._childObserver = new MutationObserver(() => this.adoptContentIntoSlot());
    this._childObserver.observe(this as unknown as Node, { childList: true });
  }

  updated(changedProperties: Map<string | number | symbol, unknown>) {
    super.updated(changedProperties);

    if (changedProperties.has('open')) {
      // When externally toggled open, allow CSS transitions to play naturally.
      if (this.open) {
        this.isClosing = false;
        // No first-open transition suppression; double rAF in the viewer handles settle.
        this._firstOpen = false;
        this.dispatchEvent(new CustomEvent('w3a:drawer-open-start', { bubbles: true, composed: true }));
      } else {
        this.dispatchEvent(new CustomEvent('w3a:drawer-close-start', { bubbles: true, composed: true }));
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

  // Slot-like adoption helper
  // Moves any host children not part of the drawer shell into the drawer's content slot (`.above-fold`).
  // Rationale: prefer light DOM composition over Shadow DOM slots so we can keep strict CSP compliance,
  // support environments without adoptedStyleSheets, and share CSS variables across LitElements without
  // duplicating style plumbing per component.
  private adoptContentIntoSlot(): void {
    const root = this.renderRoot as unknown as ParentNode;
    const above = root.querySelector('.above-fold') as HTMLElement | null;
    if (!above) return;
    const host = this as unknown as HTMLElement;
    const toMove: Node[] = [];
    host.childNodes.forEach((n) => {
      if (n.nodeType !== Node.ELEMENT_NODE) return;
      const el = n as Element;
      // Skip elements that are part of the drawer shell
      if ((el as HTMLElement).classList?.contains('overlay')) return;
      if ((el as HTMLElement).classList?.contains('drawer')) return;
      toMove.push(n);
    });
    toMove.forEach((n) => above.appendChild(n));
    // After moving, recompute open translate to fit content
    this.syncCssVarsForOpenTranslate();
  }

  // Public: stable container where consumers should append their content.
  // This plays the role of a "slot" in our light-DOM composition model, avoiding Shadow DOM so
  // we can keep CSP strict and share CSS variables across components without duplicating styles.
  // When null, the drawer has not mounted yet.
  public get contentRoot(): HTMLElement | null {
    const root = this.renderRoot as unknown as ParentNode;
    return (root && (root.querySelector('.above-fold') as HTMLElement | null)) || null;
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

  private _performSyncCssVarsForOpenTranslate(): void {
    const drawer = this.drawerElement;
    if (!drawer) return;
    // Do not mutate the open rest position while the user is dragging or a drag is queued.
    // Freezing prevents sudden jumps when content inside (e.g., TxTree) expands/collapses
    // and height transitions are running.
    if (this.isDragging || this.pendingDrag) return;

    // Prefer explicit height prop; otherwise fit to content
    const h = (this.height || '').trim();
    const m = h.match(/^([0-9]+(?:\.[0-9]+)?)\s*(d?vh|svh|lvh|vh)$/i);
    if (m) {
      const unit = (m[2] || 'vh').toLowerCase();
      const visibleVh = clamp(parseFloat(m[1]), 0, 100);
      const pct = clamp(100 - visibleVh, 0, 100);
      // Sheet uses same viewport unit as provided height for better alignment
      this.setCssVars({ '--w3a-drawer__sheet-height': `100${unit}` });
      // Freeze rest position while open to avoid mid-open jumps
      if (!this.open) {
        this.setCssVars({ '--w3a-drawer__open-translate': pct + '%' });
      }
      return;
    }

    // Default: auto-fit to content height (.above-fold)
    const unit = (typeof CSS !== 'undefined' && CSS.supports && CSS.supports('height', '1dvh')) ? 'dvh' : 'vh';
    this.setCssVars({ '--w3a-drawer__sheet-height': `${SHEET_HEIGHT_VH}${unit}` });

    // Measure above-fold bottom relative to drawer top to fit content exactly above the fold
    const root = this.renderRoot as unknown as ParentNode;
    const above = root.querySelector('.above-fold') as HTMLElement | null;
    if (!above) return;
    const drawerRect = drawer.getBoundingClientRect();
    const aboveRect = above.getBoundingClientRect();
    const contentBottomPx = Math.max(0, Math.round(aboveRect.bottom - drawerRect.top));
    const sheetPx = drawer.offsetHeight || (typeof window !== 'undefined' ? window.innerHeight : contentBottomPx);
    // Compute desired open translate from content.
    // For auto height (no explicit `height` provided), fully follow the
    // measured content height so the drawer can both open further (expand)
    // and close further (collapse) as the TxTree changes size.
    // This ensures the action buttons remain visible and the drawer slides
    // down enough on collapse.
    const measured = clamp(1 - contentBottomPx / Math.max(1, sheetPx), 0, 1);
    const ratio = measured;
    const pct = (ratio * 100).toFixed(4) + '%';

    // Avoid thrashing if value hasn't meaningfully changed
    if (pct === this._lastOpenTranslatePct) return;

    // If we're open, allow transform transitions to run so the drawer
    // follows content growth in real time.
    if (this.open) {
      this.drawerElement?.classList.remove('vv-sync');
    }

    this.setCssVars({ '--w3a-drawer__open-translate': pct });
    this._lastOpenTranslatePct = pct;
  }

  // Coalesce multiple triggers into a single measurement per frame
  private syncCssVarsForOpenTranslate(): void {
    if (this._syncRAF != null) return;
    this._syncRAF = requestAnimationFrame(() => {
      this._syncRAF = null;
      this._performSyncCssVarsForOpenTranslate();
    });
  }

  private handleTransitionEnd = (e: TransitionEvent) => {
    if (!this.drawerElement) return;
    if (e.target !== this.drawerElement) return;
    if (e.propertyName !== 'transform') return;
    const type = this.open ? 'w3a:drawer-open-end' : 'w3a:drawer-close-end';
    this.dispatchEvent(new CustomEvent(type, { bubbles: true, composed: true }));
  };

  // Single entry to wire content-height animation sync (child height transitions → drawer transform)
  private setupAnimateWithContentSync() {
    const root = this.renderRoot as unknown as ParentNode;
    const host = root.querySelector('.drawer') as HTMLElement | null;
    if (!host) return;

    const ensureLoop = () => {
      if (this._contentAnimRAF != null) return;
      const step = () => {
        this._contentAnimRAF = null;
        this._performSyncCssVarsForOpenTranslate();
        this._contentAnimRAF = requestAnimationFrame(step);
      };
      this._contentAnimRAF = requestAnimationFrame(step);
    };

    const stopLoop = () => {
      if (this._contentAnimRAF != null) { cancelAnimationFrame(this._contentAnimRAF); this._contentAnimRAF = null; }
      this.syncCssVarsForOpenTranslate();
    };

    const syncTimingFromElement = (el: Element) => {
      const cs = getComputedStyle(el);
      const props = (cs.transitionProperty || '').split(',').map(s => s.trim());
      const durations = (cs.transitionDuration || '').split(',').map(s => s.trim());
      const easings = (cs.transitionTimingFunction || '').split(',').map(s => s.trim());
      let idx = props.findIndex(p => p === 'height');
      if (idx < 0) idx = props.findIndex(p => p === 'all');
      if (idx < 0) idx = 0;
      const dur = durations[Math.min(idx, durations.length - 1)] || '100ms';
      const ease = easings[Math.min(idx, easings.length - 1)] || 'cubic-bezier(0.2, 0.6, 0.2, 1)';
      this.setCssVars({ '--w3a-drawer__transition-duration': dur, '--w3a-drawer__transition-easing': ease });
    };

    const onRun = (ev: Event) => {
      const e = ev as TransitionEvent;
      if (!this.open) return;
      if (e.propertyName !== 'height') return;
      this._activeHeightTransitions++;
      ensureLoop();
    };

    const onStart = (ev: Event) => {
      const e = ev as TransitionEvent;
      if (!this.open) return;
      if (e.propertyName !== 'height') return;
      if (e.target && e.target instanceof Element) syncTimingFromElement(e.target);
      this._activeHeightTransitions++;
      ensureLoop();
    };

    const onEnd = (ev: Event) => {
      const e = ev as TransitionEvent;
      if (e.propertyName !== 'height') return;
      this._activeHeightTransitions = Math.max(0, this._activeHeightTransitions - 1);
      if (this._activeHeightTransitions === 0) stopLoop();
    };

    host.addEventListener('transitionrun', onRun, true);
    host.addEventListener('transitionstart', onStart, true);
    host.addEventListener('transitionend', onEnd, true);

    this.detachContentAnimSync = () => {
      host.removeEventListener('transitionrun', onRun, true);
      host.removeEventListener('transitionstart', onStart, true);
      host.removeEventListener('transitionend', onEnd, true);
      if (this._contentAnimRAF != null) { cancelAnimationFrame(this._contentAnimRAF); this._contentAnimRAF = null; }
      this._activeHeightTransitions = 0;
    };
  }

  private setupDragListeners() {
    if (!this.dragToClose) return;

    // Use a small delay to ensure the element is rendered
    setTimeout(() => {
      const root = this.renderRoot as unknown as ParentNode;
      const drawerElement = root.querySelector('.drawer') as HTMLElement;

      if (!drawerElement) {
        console.warn('Drawer element not found for drag listeners');
        return;
      }

      // Remove any existing listeners first
      this.removeDragListeners();

      const supportsPointer = typeof window !== 'undefined' && 'PointerEvent' in window;
      if (supportsPointer) {
        // Prefer Pointer Events for unified handling
        drawerElement.addEventListener('pointerdown', this.handlePointerDown as any, { capture: true } as AddEventListenerOptions);
        document.addEventListener('pointermove', this.handlePointerMove as any);
        document.addEventListener('pointerup', this.handlePointerUp as any);
        document.addEventListener('pointercancel', this.handlePointerCancel as any);
      } else {
        // Fallback: mouse + touch
        drawerElement.addEventListener('mousedown', this.handleMouseDown, { capture: true } as AddEventListenerOptions);
        document.addEventListener('mousemove', this.handleMouseMove);
        document.addEventListener('mouseup', this.handleMouseUp);

        drawerElement.addEventListener('touchstart', this.handleTouchStart, { passive: false, capture: true });
        document.addEventListener('touchmove', this.handleTouchMove, { passive: false });
        document.addEventListener('touchend', this.handleTouchEnd, { passive: false });
      }
    }, 0);
  }

  private attachViewportSync() {
    const root = this.renderRoot as unknown as ParentNode;
    const drawerElement = root.querySelector('.drawer') as HTMLElement | null;
    if (!drawerElement) return;
    const vv: any = (typeof window !== 'undefined') ? (window as any).visualViewport : undefined;
    const schedule = () => this.suppressTransitionForViewportTick();

    window.addEventListener('resize', schedule, { passive: true } as AddEventListenerOptions);
    window.addEventListener('orientationchange', schedule, { passive: true } as AddEventListenerOptions);
    vv && vv.addEventListener && vv.addEventListener('resize', schedule);
    vv && vv.addEventListener && vv.addEventListener('scroll', schedule);

    this.detachViewportSync = () => {
      window.removeEventListener('resize', schedule as EventListener);
      window.removeEventListener('orientationchange', schedule as EventListener);
      vv && vv.removeEventListener && vv.removeEventListener('resize', schedule as EventListener);
      vv && vv.removeEventListener && vv.removeEventListener('scroll', schedule as EventListener);
    };
  }

  private suppressTransitionForViewportTick() {
    const root = this.renderRoot as unknown as ParentNode;
    const drawerElement = root.querySelector('.drawer') as HTMLElement | null;
    if (!drawerElement) return;
    // Avoid fighting with active drag state; dragging already disables transitions
    if (!this.isDragging) drawerElement.classList.add('vv-sync');
  }

  private removeDragListeners() {
    const root = this.renderRoot as unknown as ParentNode;
    const drawerElement = root.querySelector('.drawer') as HTMLElement;
    if (!drawerElement) return;

    // Remove listeners from drawer element
    drawerElement.removeEventListener('touchstart', this.handleTouchStart as EventListener);
    drawerElement.removeEventListener('mousedown', this.handleMouseDown as EventListener);
    drawerElement.removeEventListener('pointerdown', this.handlePointerDown as EventListener);

    // Remove listeners from document
    document.removeEventListener('touchmove', this.handleTouchMove as EventListener);
    document.removeEventListener('touchend', this.handleTouchEnd as EventListener);
    document.removeEventListener('mousemove', this.handleMouseMove as EventListener);
    document.removeEventListener('mouseup', this.handleMouseUp as EventListener);
    document.removeEventListener('pointermove', this.handlePointerMove as EventListener);
    document.removeEventListener('pointerup', this.handlePointerUp as EventListener);
    document.removeEventListener('pointercancel', this.handlePointerCancel as EventListener);
  }

  // ===== Pointer Events (preferred) =====
  private handlePointerDown = (e: PointerEvent) => {
    if (this.loading || !this.open) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    // Defer decision until move for all pointer types to preserve inner clicks/taps
    this.pendingDrag = true;
    this.startY = e.clientY;
    this.currentY = e.clientY;
    this.dragStartTime = Date.now();
    // Do not preventDefault here; keep click/tap semantics intact unless we transition into drag
  };

  private handlePointerMove = (e: PointerEvent) => {
    if (!this.pendingDrag && !this.isDragging) return;
    const y = e.clientY;
    if (this.pendingDrag) {
      const dy = y - this.startY;
      const absDy = Math.abs(dy);
      const ACTIVATE_PX = 8;
      // For touch/pen, only start dragging when inner body is at top so we don't steal scroll
      const body = this.bodyElement;
      const atTop = !body || body.scrollTop <= 0;
      if (absDy >= ACTIVATE_PX && atTop) {
        this.pendingDrag = false;
        this.startDrag(this.startY);
        (e.target as Element)?.setPointerCapture?.(e.pointerId);
      } else {
        return;
      }
    }
    if (this.isDragging) {
      this.updateDrag(y);
      e.preventDefault();
    }
  };

  private handlePointerUp = (e: PointerEvent) => {
    if (this.pendingDrag) { this.pendingDrag = false; }
    if (this.isDragging) {
      this.endDrag();
      e.preventDefault();
    }
    (e.target as Element)?.releasePointerCapture?.(e.pointerId);
  };

  private handlePointerCancel = (e: PointerEvent) => {
    if (this.pendingDrag) this.pendingDrag = false;
    if (this.isDragging) this.endDrag();
    (e.target as Element)?.releasePointerCapture?.(e.pointerId);
  };

  private handleTouchStart = (e: TouchEvent) => {
    if (this.loading || !this.open) return;

    // Do not initiate a drawer drag when the touch starts on the close button
    const target = e.target as HTMLElement | null;
    if (target && target.closest && target.closest('.close-btn')) {
      return;
    }

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
      // Force a layout flush so the newly-applied CSS variable is visible to
      // the next style recalculation that includes the `.dragging` selector.
      // Without this, some engines may briefly resolve the var() fallback (0px)
      // for one frame, causing a jump to the top when starting an upward drag.
      try { void this.drawerElement.offsetHeight; } catch {}
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
          <div class="above-fold">${this._initialChildren}</div>
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
