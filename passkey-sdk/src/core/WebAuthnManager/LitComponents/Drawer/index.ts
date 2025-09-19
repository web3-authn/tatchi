import { html, css } from 'lit';
import { LitElementWithProps } from '../LitElementWithProps';

export type DrawerTheme = 'dark' | 'light';

export class DrawerElement extends LitElementWithProps {
  static properties = {
    open: { type: Boolean, reflect: true },
    theme: { type: String },
    title: { type: String },
    subtitle: { type: String },
    accountId: { type: String, attribute: 'account-id' },
    confirmText: { type: String, attribute: 'confirm-text' },
    cancelText: { type: String, attribute: 'cancel-text' },
    loading: { type: Boolean },
    errorMessage: { type: String },
    dragToClose: { type: Boolean, attribute: 'drag-to-close' },
  } as const;

  declare open: boolean;
  declare theme: DrawerTheme;
  declare title: string;
  declare subtitle?: string;
  declare accountId?: string;
  declare confirmText: string;
  declare cancelText: string;
  declare loading: boolean;
  declare errorMessage?: string;
  declare dragToClose: boolean;

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
  private suppressExternalOpenUntil = 0; // ms epoch

  static styles = css`
    :host { display: contents; }
    .overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.35); z-index: 2147483646; opacity: 0; pointer-events: none; transition: opacity .2s ease; }
    :host([open]) .overlay { opacity: 1; pointer-events: auto; }

    .drawer {
      position: fixed;
      left: 0; right: 0; bottom: 0;
      z-index: 2147483647;
      background: var(--w3a-modal__card__background, #111);
      color: var(--w3a-modal__card__color, #f6f7f8);
      border-top-left-radius: 16px;
      border-top-right-radius: 16px;
      border: 1px solid var(--w3a-modal__card__border, rgba(255,255,255,0.08));
      transform: translateY(100%);
      transition: transform 0.5s cubic-bezier(0.32, 0.72, 0, 1);
      box-shadow: 0 -10px 28px rgba(0,0,0,0.35);
      padding: 14px 16px calc(16px + 20vh);
      height: 70vh;
      max-height: 70vh;
      display: grid;
      grid-template-rows: auto 1fr auto;
      touch-action: none;
    }
    :host([open]) .drawer { transform: translateY(20%); }
    .drawer.dragging { transition: none; }
    .handle { width: 36px; height: 4px; border-radius: 2px; background: rgba(255,255,255,0.25); margin: 6px auto 10px; }
    .title { font-size: 16px; font-weight: 700; margin: 0 0 4px; }
    .subtitle { font-size: 13px; opacity: 0.85; margin: 0 0 8px; }
    .account { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; opacity: 0.92; margin-bottom: 8px; }
    .body { overflow: auto; padding: 6px 2px; }
    .actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 10px; }
    button { border: 0; border-radius: 8px; padding: 9px 13px; font-weight: 600; cursor: pointer; }
    .cancel { background: #2b2b2b; color: #ddd; }
    .confirm { background: #4DAFFE; color: #0b1220; }
    .error { color: #ff7a7a; font-size: 13px; margin-top: 6px; }
    :host([theme="light"]) .drawer { background: #fff; color: #181a1f; border-color: rgba(0,0,0,0.08); }
    :host([theme="light"]) .cancel { background: #f3f4f6; color: #111; }
    :host([theme="light"]) .confirm { background: #2563eb; color: #fff; }
  `;

  constructor() {
    super();
    this.open = false;
    this.theme = 'dark';
    this.title = 'Create your passkey';
    this.confirmText = 'Continue';
    this.cancelText = 'Cancel';
    this.loading = false;
    this.dragToClose = true;
  }

  protected getComponentPrefix(): string { return 'modal'; }

  connectedCallback() {
    super.connectedCallback();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.removeDragListeners();
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
    this.setupDragListeners();
  }

  updated(changedProperties: Map<string | number | symbol, unknown>) {
    super.updated(changedProperties);

    // Debug open property changes
    if (changedProperties.has('open')) {
      console.log('Drawer open property changed to:', this.open);
      // If an external re-render tries to force open=true immediately after a close,
      // ignore it within a short suppression window to avoid bounce-back.
      if (this.open && Date.now() < this.suppressExternalOpenUntil) {
        this.open = false;
        return;
      }
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

      // Attach listeners to the entire drawer for mouse events
      drawerElement.addEventListener('mousedown', this.handleMouseDown);
      document.addEventListener('mousemove', this.handleMouseMove);
      document.addEventListener('mouseup', this.handleMouseUp);

      // Attach touch events to the drawer
      drawerElement.addEventListener('touchstart', this.handleTouchStart, { passive: false });
      document.addEventListener('touchmove', this.handleTouchMove, { passive: false });
      document.addEventListener('touchend', this.handleTouchEnd, { passive: false });
    }, 0);
  }

  private removeDragListeners() {
    const drawerElement = this.shadowRoot?.querySelector('.drawer') as HTMLElement;
    if (!drawerElement) return;

    // Remove listeners from drawer element
    drawerElement.removeEventListener('touchstart', this.handleTouchStart);
    drawerElement.removeEventListener('mousedown', this.handleMouseDown);

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
      // Default "open" rest position is translateY(20% of drawer height)
      this.openRestTranslateYPx = this.drawerHeight * 0.20;

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
    // Allow up to 20% of drawer height with progressive resistance
    const maxOverdragUpPx = this.drawerHeight * 0.20;

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
    const openRestPx = this.openRestTranslateYPx || drawerHeight * 0.20;

    // Compute effective velocities (instantaneous and average over gesture)
    const now = Date.now();
    const gestureMs = Math.max(1, now - this.dragStartTime);
    const totalDeltaPx = this.currentY - this.startY; // positive = down, negative = up
    const avgVelocity = totalDeltaPx / gestureMs; // px/ms
    const effectiveDownV = Math.max(this.velocity, avgVelocity);
    const effectiveUpV = Math.min(this.velocity, avgVelocity);

    // Velocity-based flick-to-close (upward flick)
    // negative means upward movement
    const flickUpCloseThreshold = -0.6; // ~600 px/s upward
    if (effectiveUpV <= flickUpCloseThreshold) {
      this.closeDrawer();
      this.resetDragState();
      return;
    }

    // Velocity-based flick-to-close (downward flick)
    const flickDownCloseThreshold = 0.7; // ~700 px/s downward
    if (effectiveDownV >= flickDownCloseThreshold) {
      this.closeDrawer();
      this.resetDragState();
      return;
    }

    // If overdragged above the open rest position by >10% of height, close
    const currentTransformTy = this.parseTranslateY(getComputedStyle(this.drawerElement).transform);
    const currentTranslatePx = Number.isFinite(currentTransformTy) ? currentTransformTy : openRestPx;
    const overdragUpAtRelease = Math.max(0, openRestPx - currentTranslatePx);
    const closeActivationUpPx = drawerHeight * 0.10; // 10% of drawer height
    if (overdragUpAtRelease >= closeActivationUpPx) {
      this.closeDrawer();
      this.resetDragState();
      return;
    }

    // If near fully closed (bottom within 50px), close
    const closeThresholdPx = 50;
    if (currentTranslatePx >= drawerHeight - closeThresholdPx) {
      this.closeDrawer();
      this.resetDragState();
      return;
    }

    // No snapping: let the drawer rest where released.
    // Ensure no transition is active to avoid unintended easing.
    this.drawerElement.style.transition = '';
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
    this.suppressExternalOpenUntil = Date.now() + 350;
    this.open = false;
    // Notify host after state change
    this.dispatchEvent(new CustomEvent('cancel', { bubbles: true, composed: true }));
    // Reset closing guard after a short delay to avoid duplicate cancels
    setTimeout(() => { this.isClosing = false; }, 300);
  }

  private onCancel = () => {
    console.log('onCancel called, loading:', this.loading);
    if (this.loading) return;
    if (this.isClosing) return;

    // Remove inline transforms so CSS can drive the close state
    if (this.drawerElement) {
      this.drawerElement.classList.remove('dragging');
      this.drawerElement.style.removeProperty('transition');
      this.drawerElement.style.removeProperty('transform');
    }
    // Flip open then notify host
    this.suppressExternalOpenUntil = Date.now() + 350;
    this.open = false;
    this.dispatchEvent(new CustomEvent('cancel', { bubbles: true, composed: true }));
    this.isClosing = true;
    setTimeout(() => { this.isClosing = false; }, 300);
  };

  private onConfirm = () => {
    if (this.loading) return;
    this.dispatchEvent(new CustomEvent('confirm', { bubbles: true, composed: true }));
  };

  render() {
    return html`
      <div class="overlay" @click=${this.onCancel}></div>
      <section class="drawer" role="dialog" aria-modal="true" aria-label="Registration">
        <div class="handle"></div>
        <div>
          <h2 class="title">${this.title}</h2>
          ${this.subtitle ? html`<p class="subtitle">${this.subtitle}</p>` : null}
          ${this.accountId ? html`<div class="account">${this.accountId}</div>` : null}
        </div>
        <div class="body">
          ${this.errorMessage ? html`<div class="error">${this.errorMessage}</div>` : null}
        </div>
        <div class="actions">
          <button class="cancel" @click=${this.onCancel}>${this.cancelText}</button>
          <button class="confirm" @click=${this.onConfirm}>${this.confirmText}</button>
        </div>
      </section>
    `;
  }
}

export default (function ensureDefined() {
  const TAG = 'w3a-registration-drawer';
  if (!customElements.get(TAG)) {
    customElements.define(TAG, DrawerElement);
  }
  return DrawerElement;
})();
