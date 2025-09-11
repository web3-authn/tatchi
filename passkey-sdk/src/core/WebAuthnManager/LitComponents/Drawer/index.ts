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
      padding: 14px 16px 16px;
      max-height: 80vh;
      display: grid;
      grid-template-rows: auto 1fr auto;
      touch-action: none;
    }
    :host([open]) .drawer { transform: translateY(0%); }
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

  firstUpdated() {
    this.drawerElement = this.shadowRoot?.querySelector('.drawer') as HTMLElement;
    this.setupDragListeners();
  }

  updated(changedProperties: Map<string | number | symbol, unknown>) {
    super.updated(changedProperties);

    // Debug open property changes
    if (changedProperties.has('open')) {
      console.log('Drawer open property changed to:', this.open);
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
    this.lastDragTime = Date.now();
    this.velocity = 0;

    if (this.drawerElement) {
      this.drawerElement.classList.add('dragging');
    }
  }

  private updateDrag(y: number) {
    if (!this.isDragging || !this.drawerElement) return;

    const now = Date.now();
    const deltaTime = now - this.lastDragTime;
    const deltaY = y - this.currentY;

    // Calculate velocity
    if (deltaTime > 0) {
      this.velocity = deltaY / deltaTime;
    }

    this.currentY = y;
    this.dragDistance = y - this.startY; // Allow negative values for upward dragging

    // Apply drag transform - allow both upward and downward movement
    const maxUpward = -window.innerHeight * 0.2; // Allow dragging up to 20% of screen height upward
    const maxDownward = window.innerHeight * 0.8; // Allow dragging down to 80% of screen height
    const translateY = Math.max(maxUpward, Math.min(this.dragDistance, maxDownward));
    this.drawerElement.style.transform = `translateY(${translateY}px)`;

    this.lastDragTime = now;
  }

  private endDrag() {
    if (!this.isDragging || !this.drawerElement) return;

    this.isDragging = false;
    this.drawerElement.classList.remove('dragging');

    const closeThreshold = window.innerHeight * 0.15; // 15% of screen height to close (easier to close)
    const velocityThreshold = 0.3; // pixels per ms (lower threshold for velocity)

    console.log('endDrag - dragDistance:', this.dragDistance, 'closeThreshold:', closeThreshold, 'velocity:', this.velocity);

    // Close if dragged down far enough or with enough downward velocity
    if (this.dragDistance > closeThreshold || this.velocity > velocityThreshold) {
      console.log('Closing drawer due to drag');
      this.closeDrawer();
    } else {
      console.log('Snapping back to open position');
      // Snap back to open position
      this.drawerElement.style.transform = 'translateY(0%)';
    }

    // Reset drag state
    this.dragDistance = 0;
    this.velocity = 0;
  }

  private closeDrawer() {
    console.log('closeDrawer called, setting open to false');

    // Clear any inline transform styles to allow CSS transition to work
    if (this.drawerElement) {
      this.drawerElement.style.transform = '';
    }

    this.open = false;
    this.dispatchEvent(new CustomEvent('cancel', { bubbles: true, composed: true }));
  }

  private onCancel = () => {
    console.log('onCancel called, loading:', this.loading);
    if (this.loading) return;

    // Clear any inline transform styles to allow CSS transition to work
    if (this.drawerElement) {
      this.drawerElement.style.transform = '';
    }

    this.dispatchEvent(new CustomEvent('cancel', { bubbles: true, composed: true }));
    this.open = false;
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

