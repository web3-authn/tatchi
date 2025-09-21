import { html, css } from 'lit';
import { LitElementWithProps } from '../LitElementWithProps';
import DrawerElement from '../Drawer';

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
    :host { display: block; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif; }
    .content { display: flex; flex-direction: column; gap: 12px; }
    .warning {
      background: var(--w3a-colors-colorSurface, rgba(255,255,255,0.06));
      border: 1px solid var(--w3a-colors-borderPrimary, rgba(255,255,255,0.12));
      color: var(--w3a-colors-textPrimary, #f6f7f8);
      padding: 12px;
      border-radius: 1rem;
      font-size: 0.8rem;
      margin: 1rem 0rem;
      box-shadow: var(--w3a-shadows-sm, 0 4px 12px rgba(0, 0, 0, 0.15));
    }
    .row { display: grid; grid-template-columns: 105px 1fr auto; align-items: center; gap: 8px; }
    .key-row {
      background: var(--w3a-colors-colorSurface);
      border: 1px solid var(--w3a-colors-borderPrimary);
      border-radius: 1rem;
      padding: 0;
      transition: all 0.2s ease;
    }
    .key-row:hover { border-color: var(--w3a-colors-borderHover, var(--w3a-colors-borderPrimary)); box-shadow: var(--w3a-shadows-sm, 0 4px 12px rgba(0, 0, 0, 0.15)); }
    .label { color: var(--w3a-colors-textMuted, rgba(255,255,255,0.7)); font-size: 1rem; }
    .value { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 1rem; word-break: break-all; }
    .btn { border: 0; border-radius: 8px; padding: 8px 14px; font-weight: 600; cursor: pointer; transition: all 0.2s ease; font-size: 1rem; }
    .btn-primary { background: var(--w3a-btn-primary, #4DAFFE); color: var(--w3a-btn-text, #0b1220); }
    .btn-surface { background: var(--w3a-colors-colorSurface, #2b2b2b); color: var(--w3a-colors-textPrimary, #ddd); border: 1px solid var(--w3a-colors-borderPrimary, rgba(255,255,255,0.12)); }
    .btn:hover { filter: brightness(1.05); }
    .btn:disabled { opacity: 0.6; cursor: not-allowed; }
    .btn.copied { color: var(--w3a-colors-success, #34d399); border-color: var(--w3a-colors-success, #34d399); animation: copiedPulse .3s ease; }
    .muted { opacity: 0.8; }
    @keyframes copiedPulse {
      0% { transform: scale(1); }
      50% { transform: scale(1.05); }
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

  render() {
    const pk = this.publicKey || '';
    const sk = this.privateKey || '';
    return html`
      ${this.showCloseButton ? html`<button aria-label="Close" title="Close" style="position:absolute;right:8px;top:8px;background:transparent;border:none;color:inherit;font-size:28px;line-height:1;cursor:pointer;width:48px;height:48px;border-radius:2rem;display:flex;align-items:center;justify-content:center;" @click=${() => this.dispatchEvent(new CustomEvent('cancel', { bubbles: true, composed: true }))}>×</button>` : null}
      <div class="content">
        <div class="warning">
          Warning: Revealing your private key grants full control of your account. Only proceed if you fully trust this application and environment.
        </div>
        <div class="row">
          <div class="label">Account</div>
          <div class="value">${this.accountId || ''}</div>
          <div></div>
        </div>
        <div class="row key-row">
          <div class="label">Public Key</div>
          <div class="value">${pk || html`<span class="muted">—</span>`}</div>
          <button class="btn btn-surface ${this.copiedPublic ? 'copied' : ''}" title="Copy" @click=${() => this.copy('publicKey', pk)}>
            ${this.copiedPublic ? 'Copied!' : 'Copy'}
          </button>
        </div>
        <div class="row key-row">
          <div class="label">Private Key</div>
          <div class="value">${this.loading ? html`<span class="muted">Decrypting…</span>` : (sk || html`<span class="muted">—</span>`)}</div>
          <button class="btn btn-surface ${this.copiedPrivate ? 'copied' : ''}" title="Copy" ?disabled=${!sk || this.loading} @click=${() => this.copy('privateKey', sk)}>
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

