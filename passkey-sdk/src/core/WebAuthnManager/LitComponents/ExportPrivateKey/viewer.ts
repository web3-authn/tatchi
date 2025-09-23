import { html, css, type PropertyValues } from 'lit';
import { LitElementWithProps } from '../LitElementWithProps';
import DrawerElement from '../Drawer';
import { DARK_THEME, LIGHT_THEME } from '@/base-styles';

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

  static styles = css`
    :host { display: block; position: relative; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif; }
    .content { display: flex; flex-direction: column; gap: 12px; }
    .title { margin: 0 0 4px 0; font-size: 20px; font-weight: 700; text-align: left; }
    .close-btn {
      position: absolute;
      right: 8px;
      top: 8px;
      background: transparent;
      border: none;
      color: inherit;
      font-size: 28px;
      line-height: 1;
      cursor: pointer;
      width: 48px;
      height: 48px;
      border-radius: 2rem;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
    }
    .close-btn:hover { color: var(--w3a-colors-textPrimary, #f6f7f8); background: var(--w3a-colors-surface, rgba(255,255,255,0.08)); }
    .warning {
      background: var(--w3a-colors-surface, rgba(255,255,255,0.06));
      border: 1px solid var(--w3a-colors-borderPrimary, rgba(255,255,255,0.12));
      color: var(--w3a-colors-textSecondary, rgba(255,255,255,0.7));
      padding: 12px;
      border-radius: 1rem;
      font-size: 0.9rem;
      margin: 1rem 0rem;
    }
    .row {
      display: grid;
      grid-template-columns: 105px 1fr auto;
      align-items: center;
      gap: 8px;
      font-size: 0.9rem;
    }
    .key-row {
      border-radius: 1rem;
      padding: 0;
    }

    .label { color: var(--w3a-colors-textPrimary, #f6f7f8); }

    .value {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      word-break: break-all;
      user-select: text;
      -webkit-user-select: text;
      -moz-user-select: text;
      -ms-user-select: text;
    }

    /* Masked middle portion (no blur) */
    .private-key .mask-chunk {
      opacity: 0.9;
    }

    /* Make all text inside key rows smaller for readability */
    .key-row .label,
    .key-row .value,
    .key-row .btn {
      font-size: 0.9rem;
    }

    .btn {
      border: 0;
      border-radius: 2rem;
      width: 90px;
      padding: 8px 14px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
      margin-right: 0.5rem;
      font-size: 1rem;
    }
    .btn-primary { background: var(--w3a-colors-primary, #4DAFFE); color: var(--w3a-colors-colorBackground, #0b1220); }
    .btn-surface { background: var(--w3a-colors-surface, #2b2b2b); color: var(--w3a-colors-textPrimary, #ddd); border: 1px solid var(--w3a-colors-borderPrimary, rgba(255,255,255,0.12)); }
    .btn:hover { filter: brightness(1.05); }
    .btn:active { transform: scale(0.96); }
    .btn:disabled { opacity: 0.6; cursor: not-allowed; }
    .btn.copied { color: var(--w3a-colors-success, #34d399); border-color: var(--w3a-colors-success, #34d399); animation: copiedPulse .3s ease; }

    .muted { opacity: 0.8; }

    @keyframes copiedPulse {
      0% { transform: scale(1); }
      50% { transform: scale(1.03); }
      100% { transform: scale(1); }
    }
  `;

  constructor() {
    super();
    this.theme = 'dark';
    this.variant = 'drawer';
    this.loading = false;
    this.showCloseButton = false;
  }

  protected getComponentPrefix(): string { return 'export'; }

  protected updated(changed: PropertyValues) {
    super.updated(changed);
    if (changed.has('theme')) this.updateTheme();
  }

  connectedCallback(): void {
    super.connectedCallback();
    this.updateTheme();
    // Prevent drawer drag initiation from content area so text can be selected
    try {
      this.addEventListener('pointerdown', this._stopDragStart as EventListener);
      this.addEventListener('mousedown', this._stopDragStart as EventListener);
      this.addEventListener('touchstart', this._stopDragStart as EventListener, { passive: false } as AddEventListenerOptions);
    } catch {}
  }

  disconnectedCallback(): void {
    try {
      this.removeEventListener('pointerdown', this._stopDragStart as EventListener);
      this.removeEventListener('mousedown', this._stopDragStart as EventListener);
      this.removeEventListener('touchstart', this._stopDragStart as EventListener);
    } catch {}
    super.disconnectedCallback();
  }

  private _stopDragStart = (e: Event) => {
    // Do not preventDefault to allow text selection, just stop bubbling to drawer
    e.stopPropagation();
  };

  private updateTheme() {
    try {
      const t = this.theme === 'light' ? LIGHT_THEME : DARK_THEME;
      // Promote essential host values to base variables so global tokens are populated
      const styles: Record<string, string> = {
        ...t,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        fontSize: '1rem',
        color: t.textPrimary,
        backgroundColor: t.colorBackground,
        // Also expose a primary color alias for buttons
        primary: t.primary,
      } as any;
      this.applyStyles(styles, 'export');
    } catch {}
  }

  private async copy(type: 'publicKey' | 'privateKey', value?: string) {
    if (!value) return;
    try {
      try { this.ownerDocument?.defaultView?.focus?.(); } catch {}
      try { (this as unknown as HTMLElement).focus?.(); } catch {}
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
        this.dispatchEvent(new CustomEvent('copy', { detail: { type, value }, bubbles: true, composed: true }));
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
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      ta.style.top = '0';
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
    try {
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
    } catch {
      return html`${sk}`;
    }
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
          @click=${() => this.dispatchEvent(new CustomEvent('cancel', { bubbles: true, composed: true }))}
          >×</button>`
        : null
      }
      <div class="content">
        <h2 class="title">Export Private Keys</h2>
        <div class="warning">
          Warning: Revealing your private key grants full control of your account and funds.
          Keep the private key in a secret place.
        </div>
        <div class="row">
          <div class="label">Account</div>
          <div class="value">
            ${this.accountId || ''}
          </div>
          <div></div>
        </div>
        <div class="row key-row">
          <div class="label">Public Key</div>
          <div class="value">
            ${pk || html`<span class="muted">—</span>`}
          </div>
          <button
            class="btn btn-surface ${this.copiedPublic ? 'copied' : ''}"
            title="Copy"
            @click=${() => this.copy('publicKey', pk)}
          >
            ${this.copiedPublic ? 'Copied!' : 'Copy'}
          </button>
        </div>
        <div class="row key-row">
          <div class="label">Private Key</div>
          <div class="value private-key">
            ${this.loading
              ? html`<span class="muted">Decrypting…</span>`
              : this.renderMaskedPrivateKey(sk)}
          </div>
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
    `;
  }
}

try {
  if (!customElements.get('w3a-export-key-viewer')) {
    customElements.define('w3a-export-key-viewer', ExportPrivateKeyViewer);
  }
} catch {}

// Ensure DrawerElement is kept by bundlers (used as container in iframe bootstrap)
export default ExportPrivateKeyViewer;
