import { ensureOverlayBase, cleanupOverlayStyles } from './overlay-styles';
import { getNodeEnv, isDevHost } from '../shared/runtime';

type OverlayIframe = HTMLIFrameElement & { _svc_loaded?: boolean };

export type IframeOverlayOptions = {
  walletOrigin: string;
  serviceUrl: URL;
  debug?: boolean;
  testOptions?: {
    routerId?: string;
    ownerTag?: string;
  };
};

export class IframeOverlay {
  private iframeEl: OverlayIframe | null = null;
  private readonly walletOrigin: string;
  private readonly serviceUrl: URL;
  private readonly testOptions: { routerId?: string; ownerTag?: string };
  private readonly debug: boolean;

  constructor(opts: IframeOverlayOptions) {
    this.walletOrigin = opts.walletOrigin;
    this.serviceUrl = opts.serviceUrl;
    this.debug = !!opts.debug;
    this.testOptions = {
      routerId: opts.testOptions?.routerId,
      ownerTag: opts.testOptions?.ownerTag,
    };
  }

  get element(): HTMLIFrameElement | null {
    return this.iframeEl;
  }

  get contentWindow(): Window | null {
    return this.iframeEl?.contentWindow || null;
  }

  ensureMounted(): HTMLIFrameElement {
    if (this.iframeEl) return this.iframeEl;

    this.removeExistingOverlaysForOrigin();

    const iframe = document.createElement('iframe') as OverlayIframe;
    // Hidden by default via CSS classes; higher layers toggle state using overlay-styles.
    iframe.classList.add('w3a-wallet-overlay', 'is-hidden');
    // Ensure the base overlay stylesheet is installed early so computed styles
    // (opacity/pointer-events) reflect the hidden state immediately after mount.
    try { ensureOverlayBase(iframe); } catch {}
    // Ensure no initial footprint even before stylesheet attaches
    iframe.setAttribute('width', '0');
    iframe.setAttribute('height', '0');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.setAttribute('tabindex', '-1');
    // Hint higher priority fetch for the iframe document on supporting browsers
    iframe.setAttribute('loading', 'eager');
    iframe.setAttribute('fetchpriority', 'high');

    iframe.dataset.w3aRouterId = this.testOptions?.routerId || '';
    if (this.testOptions?.ownerTag) iframe.dataset.w3aOwner = this.testOptions.ownerTag;
    iframe.dataset.w3aOrigin = this.walletOrigin;

    // Delegate WebAuthn + clipboard capabilities to the wallet origin frame
    try {
      iframe.setAttribute('allow', this.buildAllowAttr(this.walletOrigin));
    } catch {
      iframe.setAttribute('allow', "publickey-credentials-get 'self'; publickey-credentials-create 'self'; clipboard-read; clipboard-write");
    }

    // Track load state to guard against races where we post before content is listening
    iframe._svc_loaded = false;
    iframe.addEventListener('load', () => { iframe._svc_loaded = true; }, { once: true });

    const src = this.serviceUrl.toString();
    if (this.debug) console.debug('[IframeTransport] mount: external origin', src);
    iframe.src = src;

    document.body.appendChild(iframe);
    if (this.debug) console.debug('[IframeTransport] mount: iframe appended');
    this.iframeEl = iframe;
    return iframe;
  }

  dispose(opts?: { removeIframe?: boolean }): void {
    if (!opts?.removeIframe) return;
    if (this.iframeEl) {
      try { cleanupOverlayStyles(this.iframeEl); } catch {}
      try { this.iframeEl.remove(); } catch {}
    }
    this.iframeEl = null;
  }

  async waitForLoad(signal?: AbortSignal): Promise<void> {
    const iframe = this.iframeEl;
    if (!iframe) return;
    if (iframe._svc_loaded) return;
    await new Promise<void>((resolve, reject) => {
      let done = false;
      const onAbort = () => {
        if (done) return;
        done = true;
        reject(new Error('Iframe load aborted'));
      };
      const finish = () => {
        if (done) return;
        done = true;
        if (signal) {
          try { signal.removeEventListener('abort', onAbort); } catch {}
        }
        resolve();
      };
      const timeout = window.setTimeout(() => {
        finish();
      }, 150);
      iframe.addEventListener('load', () => {
        clearTimeout(timeout);
        finish();
      }, { once: true });
      if (signal) {
        if (signal.aborted) {
          clearTimeout(timeout);
          onAbort();
          return;
        }
        signal.addEventListener('abort', onAbort, { once: true });
      }
    });
  }

  private isOverlayForOrigin(el: HTMLIFrameElement): boolean {
    const dsOrigin = (el as { dataset?: { w3aOrigin?: string } }).dataset?.w3aOrigin;
    if (dsOrigin) return dsOrigin === this.walletOrigin;
    try {
      return new URL(el.src).origin === this.walletOrigin;
    } catch {
      return false;
    }
  }

  private removeExistingOverlaysForOrigin(): void {
    if (typeof document === 'undefined') return;
    const existing = Array.from(document.querySelectorAll('iframe.w3a-wallet-overlay')) as HTMLIFrameElement[];
    const matches = existing.filter((el) => this.isOverlayForOrigin(el));
    if (!matches.length) return;

    if (isDevHost(window.location.hostname, getNodeEnv())) {
      const routerIds = matches
        .map((el) => (el as { dataset?: { w3aRouterId?: string } }).dataset?.w3aRouterId)
        .filter((v): v is string => typeof v === 'string' && v.length > 0);
      console.warn(
        `[IframeTransport] Found existing wallet overlay iframe(s) for ${this.walletOrigin}. This usually indicates multiple SDK instances. Removing old iframe(s) to avoid duplicates.`,
        { count: matches.length, routerIds }
      );
    }

    for (const el of matches) {
      try { cleanupOverlayStyles(el); } catch {}
      try { el.remove(); } catch {}
    }
  }

  private buildAllowAttr(walletOrigin: string): string {
    return `publickey-credentials-get 'self' ${walletOrigin}; publickey-credentials-create 'self' ${walletOrigin}; clipboard-read; clipboard-write`;
  }
}
