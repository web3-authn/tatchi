import { html, type PropertyValues } from 'lit';
import { LitElementWithProps } from '../LitElementWithProps';
import DrawerElement from '../Drawer';
// Tokens for this component now come from w3a-components.css host scoping.
// We no longer map full color sets from DARK_THEME/LIGHT_THEME here.
import { dispatchLitCancel, dispatchLitCopy } from '../lit-events';
import { ensureExternalStyles } from '../css/css-loader';

export type ExportViewerTheme = 'dark' | 'light';
export type ExportViewerVariant = 'drawer' | 'modal';

export class ExportPrivateKeyViewer extends LitElementWithProps {
  // Ensure drawer definition is kept/loaded in the child iframe runtime
  static keepDefinitions = [DrawerElement];
  static properties = {
    theme: { type: String },
    variant: { type: String },
    accountId: { type: String, attribute: 'account-id' },
    publicKey: { type: String, attribute: 'public-key' },
    privateKey: { type: String, attribute: 'private-key' },
    loading: { type: Boolean },
    errorMessage: { type: String },
    showCloseButton: { type: Boolean, attribute: 'show-close-button' },
  } as const;

  declare theme: ExportViewerTheme;
  declare variant: ExportViewerVariant;
  declare accountId?: string;
  declare publicKey?: string;
  declare privateKey?: string;
  declare loading: boolean;
  declare errorMessage?: string;
  declare showCloseButton: boolean;
  private copiedPublic = false;
  private copiedPrivate = false;
  private copyTimers: { public?: number; private?: number } = {};
  // Styles gating to avoid FOUC under strict CSP (no inline styles)
  private _stylesReady = false;
  private _stylePromises: Promise<void>[] = [];
  private _stylesAwaiting: Promise<void> | null = null;

  // Static styles moved to external CSS (export-viewer.css) for strict CSP

  constructor() {
    super();
    this.theme = 'dark';
    this.variant = 'drawer';
    this.loading = false;
    this.showCloseButton = false;
  }

  protected getComponentPrefix(): string { return 'export'; }

  protected createRenderRoot(): HTMLElement | DocumentFragment {
    // Prefer Shadow DOM to scope styles when constructable stylesheets are supported.
    // Fallback to light DOM for strict-CSP + legacy engines (document-level <link> will style it).
    const supportsConstructable =
      typeof ShadowRoot !== 'undefined'
      && 'adoptedStyleSheets' in ShadowRoot.prototype
      && 'replaceSync' in (CSSStyleSheet.prototype as any);
    const root = supportsConstructable ? super.createRenderRoot() : (this as unknown as HTMLElement);
    // Adopt export-viewer.css for structural + visual styles
    const p1 = ensureExternalStyles(root as ShadowRoot | DocumentFragment | HTMLElement, 'export-viewer.css', 'data-w3a-export-viewer-css');
    this._stylePromises.push(p1);
    p1.catch(() => {});
    // Also adopt token sheet so color/background vars are available even without host styles
    const p2 = ensureExternalStyles(root as ShadowRoot | DocumentFragment | HTMLElement, 'w3a-components.css', 'data-w3a-components-css');
    this._stylePromises.push(p2);
    p2.catch(() => {});
    // Ensure drawer structural styles are available before first paint to prevent transparent background
    const p3 = ensureExternalStyles(root as ShadowRoot | DocumentFragment | HTMLElement, 'drawer.css', 'data-w3a-drawer-css');
    this._stylePromises.push(p3);
    p3.catch(() => {});
    return root;
  }

  // Avoid FOUC: block first paint until external styles are applied
  protected shouldUpdate(_changed: Map<string | number | symbol, unknown>): boolean {
    if (this._stylesReady) return true;
    if (!this._stylesAwaiting) {
      const settle = Promise.all(this._stylePromises)
        .then(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
      this._stylesAwaiting = settle.then(() => { this._stylesReady = true; this.requestUpdate(); });
    }
    return false;
  }

  protected updated(changed: PropertyValues) {
    super.updated(changed);
    if (changed.has('theme')) this.updateTheme();
  }

  connectedCallback(): void {
    super.connectedCallback();
    this.updateTheme();
    // Prevent drawer drag initiation from content area so text can be selected
    this.addEventListener('pointerdown', this._stopDragStart as EventListener);
    this.addEventListener('mousedown', this._stopDragStart as EventListener);
    this.addEventListener('touchstart', this._stopDragStart as EventListener, { passive: false } as AddEventListenerOptions);
  }

  disconnectedCallback(): void {
    this.removeEventListener('pointerdown', this._stopDragStart as EventListener);
    this.removeEventListener('mousedown', this._stopDragStart as EventListener);
    this.removeEventListener('touchstart', this._stopDragStart as EventListener);
    super.disconnectedCallback();
  }

  private _stopDragStart = (e: Event) => {
    // Do not preventDefault to allow text selection, just stop bubbling to drawer
    e.stopPropagation();
  };

  private updateTheme() {
    // Reflect theme to document root so host-scoped tokens respond
    try {
      const docEl = this.ownerDocument?.documentElement as HTMLElement | undefined;
      if (docEl && this.theme) {
        docEl.setAttribute('data-w3a-theme', this.theme);
      }
    } catch {}
  }

  private async copy(type: 'publicKey' | 'privateKey', value?: string) {
    if (!value) return;
    try {
      this.ownerDocument?.defaultView?.focus?.();
      (this as unknown as HTMLElement).focus?.();
      let ok = false;
      try {
        await navigator.clipboard.writeText(value);
        ok = true;
      } catch (err) {
        // Fallback to legacy execCommand path when direct clipboard fails (e.g., document not focused)
        ok = this.legacyCopy(value);
        if (!ok) throw err;
      }
      if (ok) {
        dispatchLitCopy(this, { type, value });
      }
      // show "Copied!" feedback for 3 seconds
      if (type === 'publicKey') {
        this.copiedPublic = true;
        clearTimeout(this.copyTimers.public);
        this.copyTimers.public = window.setTimeout(() => { this.copiedPublic = false; this.requestUpdate(); }, 3000);
      } else {
        this.copiedPrivate = true;
        clearTimeout(this.copyTimers.private);
        this.copyTimers.private = window.setTimeout(() => { this.copiedPrivate = false; this.requestUpdate(); }, 3000);
      }
      this.requestUpdate();
    } catch (e) {
      console.warn('Copy failed', e);
    }
  }

  private legacyCopy(text: string): boolean {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.className = 'w3a-offscreen';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }

  private renderMaskedPrivateKey(sk: string) {
    if (!sk) return html`<span class="muted">—</span>`;
    const prefix = 'ed25519:';
    let startText = '';
    let middleText = '';
    let endText = '';

    if (sk.startsWith(prefix)) {
      const after = sk.slice(prefix.length);
      const first6 = after.slice(0, 6);
      const midStart = prefix.length + 6;
      const midEnd = Math.max(midStart, sk.length - 6);
      startText = prefix + first6;
      middleText = sk.slice(midStart, midEnd);
      endText = sk.slice(-6);
    } else {
      const first6 = sk.slice(0, 6);
      const midStart = 6;
      const midEnd = Math.max(midStart, sk.length - 6);
      startText = first6;
      middleText = sk.slice(midStart, midEnd);
      endText = sk.slice(-6);
    }

    const masked = 'x'.repeat(middleText.length || 0);
    return html`<span>${startText}</span><span class="mask-chunk">${masked}</span><span>${endText}</span>`;
  }

  render() {
    const pk = this.publicKey || '';
    const sk = this.privateKey || '';
    return html`
      ${
        this.showCloseButton
        ? html`<button
          aria-label="Close"
          title="Close"
          class="close-btn"
          @click=${() => dispatchLitCancel(this)}
          >×</button>`
        : null
      }
      <div class="content">
        <h2 class="title">Near Account Keys</h2>
        <div class="fields">
          <div class="field">
            <div class="field-label">Account ID</div>
            <div class="field-value">
              <span class="value">
                ${this.accountId ? this.accountId : html`<span class="muted">—</span>`}
              </span>
            </div>
          </div>
          <div class="field">
            <div class="field-label">Public Key</div>
            <div class="field-value">
              <span class="value">
                ${pk ? pk : html`<span class="muted">—</span>`}
              </span>
              <button
                class="btn btn-surface ${this.copiedPublic ? 'copied' : ''}"
                title="Copy"
                @click=${() => this.copy('publicKey', pk)}
              >
                ${this.copiedPublic ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>
          <div class="field">
            <div class="field-label">Private Key</div>
            <div class="field-value">
              <span class="value private-key">
                ${this.loading
                  ? html`<span class="muted">Decrypting…</span>`
                  : this.renderMaskedPrivateKey(sk)}
              </span>
              <button
                class="btn btn-surface ${this.copiedPrivate ? 'copied' : ''}"
                title="Copy"
                ?disabled=${!sk || this.loading}
                @click=${() => this.copy('privateKey', sk)}
              >
                ${this.copiedPrivate ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>
        </div>
        <div class="warning">
          Warning: your private key grants full control of your account and funds.
          Keep it in a secret place.
        </div>
      </div>
    `;
  }
}

if (!customElements.get('w3a-export-key-viewer')) {
  customElements.define('w3a-export-key-viewer', ExportPrivateKeyViewer);
}

// Ensure DrawerElement is kept by bundlers (used as container in iframe bootstrap)
export default ExportPrivateKeyViewer;
