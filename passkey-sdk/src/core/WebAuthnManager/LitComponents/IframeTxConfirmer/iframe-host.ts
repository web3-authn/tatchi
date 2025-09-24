// External imports
import { html, css, type PropertyValues } from 'lit';
import { ref, createRef, Ref } from 'lit/directives/ref.js';
// SDK imports
import type { TransactionInputWasm } from '../../../types/actions';
import type { SignAndSendTransactionHooksOptions, ActionResult } from '../../../types/passkeyManager';
import type { PasskeyManagerContext } from '../../../PasskeyManager';
import type { VRFChallenge } from '../../../types/vrf-worker';
// Local imports
import { LitElementWithProps } from '../LitElementWithProps';
import {
  EMBEDDED_SDK_BASE_PATH,
  IFRAME_MODAL_ID,
  IFRAME_MODAL_BOOTSTRAP_MODULE,
  MODAL_TX_CONFIRM_BUNDLE
} from '../tags';
import { IframeModalMessageType, IframeModalMessagePayloads } from '../common/iframe-messages';
import { isObject, isString, isBoolean } from '../../../WalletIframe/validation';

type MessageType = IframeModalMessageType | 'MODAL_IFRAME_BOOT' | 'MODAL_IFRAME_DOM_READY' | 'MODAL_TIMEOUT';

type MessagePayloads = IframeModalMessagePayloads & {
  MODAL_IFRAME_BOOT: undefined;
  MODAL_IFRAME_DOM_READY: undefined;
  MODAL_TIMEOUT: string;
};

/**
 * Lit component that hosts the ModalTxConfirmer in a full‑screen iframe and manages messaging.
 */
export class IframeModalHost extends LitElementWithProps {
  static properties = {
    nearAccountId: { type: String, attribute: 'near-account-id' },
    txSigningRequests: { type: Array },
    vrfChallenge: { type: Object },
    theme: { type: String, attribute: 'theme' },
    variant: { type: String, attribute: 'variant' },
    showLoading: { type: Boolean, attribute: 'show-loading' },
    intentDigest: { type: String, attribute: 'intent-digest' },
    options: { type: Object },
    passkeyManagerContext: { type: Object },
    // Event handlers
    onSuccess: { type: Object },
    onError: { type: Object },
    onCancel: { type: Object }
  } as const;

  private iframeInitialized = false;
  private iframeRef: Ref<HTMLIFrameElement> = createRef();
  private messageHandler?: (event: MessageEvent) => void;
  private pendingUiDigestResolve?: (v: string) => void;
  private pendingUiDigestReject?: (e: Error) => void;
  // No digest caching in two-phase mode

  declare nearAccountId: string;
  declare txSigningRequests: TransactionInputWasm[];
  declare vrfChallenge?: VRFChallenge;
  declare theme: 'dark' | 'light';
  declare variant: 'modal' | 'drawer';
  declare showLoading: boolean;
  declare intentDigest: string | undefined;
  declare options: SignAndSendTransactionHooksOptions | undefined;
  declare passkeyManagerContext: PasskeyManagerContext | null;
  onSuccess?: (result: ActionResult[] ) => void;
  onError?: (error: Error) => void;
  onCancel?: () => void;

  constructor() {
    super();
    this.nearAccountId = '';
    this.txSigningRequests = [];
    this.vrfChallenge = undefined;
    this.theme = 'light';
    this.variant = 'modal';
    this.showLoading = false;
    this.intentDigest = undefined;
    this.options = {};
    this.passkeyManagerContext = null;
  }

  static styles = css`
    :host {
      position: fixed;
      inset: 0;
      z-index: 2147483647; /* over everything */
      display: block;
    }
    .iframe-modal-host {
      position: fixed;
      inset: 0;
      width: 100vw;
      height: 100vh;
    }
    iframe {
      border: none;
      background: transparent;
      position: fixed;
      inset: 0;
      width: 100vw;
      height: 100vh;
      z-index: 2147483647;
    }
  `;

  // ==============================
  // Lifecycle
  // ==============================
  updated(changed: PropertyValues) {
    super.updated(changed);
    if (!this.iframeInitialized) {
      this.initializeIframe();
      this.iframeInitialized = true;
    } else {
      this.updateIframeViaPostMessage(changed);
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.messageHandler) {
      window.removeEventListener('message', this.messageHandler);
      this.messageHandler = undefined;
    }
  }

  // ==============================
  // Iframe Init
  // ==============================
  private generateIframeHtml() {
    const modalBundle = MODAL_TX_CONFIRM_BUNDLE;
    const iframeBootstrap = IFRAME_MODAL_BOOTSTRAP_MODULE;
    const base = (window as unknown as { __W3A_EMBEDDED_BASE__?: string }).__W3A_EMBEDDED_BASE__ || EMBEDDED_SDK_BASE_PATH;
    return `<!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <style>html,body{margin:0;padding:0;background:transparent}</style>
          <script>try{ parent && parent.postMessage({ type: 'MODAL_IFRAME_BOOT' }, '*'); } catch(e) {}</script>
          <script type="module" src="${base}${modalBundle}"></script>
          <script type="module" src="${base}${iframeBootstrap}"></script>
        </head>
        <body>
          <!-- Modal/Drawer element is created dynamically by iframe bootstrap based on variant -->
        </body>
      </html>`;
  }

  private initializeIframe() {
    const iframeEl = this.iframeRef.value;
    if (!iframeEl) return;
    // Register message handler before setting srcdoc to avoid READY race
    this.setupMessageHandling();
    iframeEl.srcdoc = this.generateIframeHtml();
  }

  private postToIframe<T extends MessageType>(type: T, payload?: MessagePayloads[T]) {
    const win = this.iframeRef.value?.contentWindow;
    if (!win) return;
    // Child is srcdoc+sandbox; origin can be opaque. Use '*' to ensure delivery.
    try { win.postMessage({ type, payload }, '*'); } catch {}
  }

  // ==============================
  // Data Updates
  // ==============================
  private updateIframeViaPostMessage(changed: PropertyValues) {
    if (!this.iframeRef.value?.contentWindow) return;
    // Always push latest tx data
    this.postToIframe('SET_TX_DATA', {
      nearAccountId: this.nearAccountId,
      txSigningRequests: this.txSigningRequests,
      vrfChallenge: this.vrfChallenge,
      theme: this.theme,
      variant: this.variant
    });
    if (changed.has('showLoading')) {
      this.postToIframe('SET_LOADING', this.showLoading);
    }
  }

  // ==============================
  // Messaging Helpers
  // ==============================
  private setupMessageHandling() {
    const isUIIntentDigestPayload = (x: unknown): x is MessagePayloads['UI_INTENT_DIGEST'] => {
      if (!isObject(x)) return false;
      const ok = (x as { ok?: unknown }).ok;
      const digest = (x as { digest?: unknown }).digest;
      const error = (x as { error?: unknown }).error;
      const okBool = isBoolean(ok);
      const digestOk = digest == null || isString(digest);
      const errorOk = error == null || isString(error);
      return okBool && digestOk && errorOk;
    };

    const onMessage = (event: MessageEvent) => {
      const { data } = event || {};
      if (!isObject(data) || !isString((data as { type?: unknown }).type)) return;
      const type: MessageType | undefined = (data as { type?: string }).type as MessageType;
      const payload = (data as { payload?: unknown }).payload;

      switch (type) {
        case 'MODAL_IFRAME_BOOT':
          return;

        case 'IFRAME_ERROR':
        case 'IFRAME_UNHANDLED_REJECTION': {
          const msg = isString(payload) ? payload : String(payload ?? '');
          console.error('[IframeModal] iframe error:', msg);
          return;
        }

        case 'READY':
          console.debug('[IframeModalHost] child READY');
          this.postToIframe('SET_INIT', { targetOrigin: window.location.origin });
          return;

        case 'ETX_DEFINED':
          console.debug('[IframeModalHost] child ETX_DEFINED');
          // Push initial state
          this.postToIframe('SET_TX_DATA', {
            nearAccountId: this.nearAccountId,
            txSigningRequests: this.txSigningRequests,
            vrfChallenge: this.vrfChallenge,
            theme: this.theme,
            variant: this.variant
          });
          this.postToIframe('SET_LOADING', this.showLoading);
          return;

        case 'CONFIRM':
          this.handleConfirm();
          return;

        case 'CANCEL':
          this.onCancel?.();
          try {
            // New canonical + legacy alias for back-compat
            this.dispatchEvent(new CustomEvent('w3a:tx-confirmer-cancel', {
              bubbles: true, // bubble up to parent
              composed: true // cross Shadow DOM boundaries to host
            }));
            this.dispatchEvent(new CustomEvent('w3a:modal-cancel', {
              bubbles: true,
              composed: true
            }));
          } catch {}
          // Two-phase: explicitly close inner modal
          this.postToIframe('CLOSE_MODAL', { confirmed: false });
          return;

        case 'MODAL_TIMEOUT': {
          const msg = isString(payload) && payload ? payload : 'Operation timed out';
          // Stop any loading state and show error in child modal
          try { this.showLoading = false; } catch {}
          this.postToIframe('SET_LOADING', false);
          this.postToIframe('SET_ERROR', msg);
          return;
        }

        case 'UI_INTENT_DIGEST': {
          if (!isUIIntentDigestPayload(payload)) return;
          const p = payload;
          if (p.ok && p.digest && this.pendingUiDigestResolve) {
            this.pendingUiDigestResolve(p.digest);
          } else if (!p.ok && this.pendingUiDigestReject) {
            this.pendingUiDigestReject(new Error(p.error || 'UI digest failed'));
          }
          this.pendingUiDigestResolve = undefined;
          this.pendingUiDigestReject = undefined;
          return;

        }
        default:
          return;
      }
    };

    if (this.messageHandler) {
      window.removeEventListener('message', this.messageHandler);
    }
    this.messageHandler = onMessage;
    window.addEventListener('message', onMessage);
  }

  // ==============================
  // Digest & Confirm
  // ==============================
  requestUiIntentDigest(): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      if (!this.iframeRef.value?.contentWindow) {
        console.warn('[IframeModalHost] REQUEST_UI_DIGEST aborted: iframe not ready');
        return reject(new Error('iframe not ready'));
      }
      if (this.pendingUiDigestReject) {
        this.pendingUiDigestReject(new Error('superseded'));
      }
      this.pendingUiDigestResolve = resolve;
      this.pendingUiDigestReject = reject;
      this.postToIframe('REQUEST_UI_DIGEST');
      setTimeout(() => {
        if (this.pendingUiDigestReject) {
          console.warn('[IframeModalHost] UI digest timeout');
          this.pendingUiDigestReject(new Error('UI digest timeout'));
          this.pendingUiDigestResolve = undefined;
          this.pendingUiDigestReject = undefined;
        }
      }, 3000);
    });
  }

  private async handleConfirm() {
    let confirmed = true;
    let error: string | undefined;

    // Validate UI digest if present
    if (this.intentDigest) {
      try {
        const uiDigest = await this.requestUiIntentDigest();
        if (uiDigest !== this.intentDigest) {
          confirmed = false;
          const msg = 'INTENT_DIGEST_MISMATCH';
          error = msg;
          // Surface a clear, explicit error to any host listeners
          const err = Object.assign(new Error(msg), { code: msg, details: { uiDigest, intentDigest: this.intentDigest } });
          this.onError?.(err);
        }
      } catch (e) {
        confirmed = false;
        error = 'UI_DIGEST_VALIDATION_FAILED';
        const err = e instanceof Error ? e : new Error(String(e));
        this.onError?.(err);
      }
    }

    // Handle UI state and dispatch result
    if (confirmed) {
      try { this.showLoading = true; } catch {}
    } else {
      this.postToIframe('CLOSE_MODAL', { confirmed: false });
      try { this.remove(); } catch {}
    }

    try {
      // New canonical + legacy alias for back-compat
      this.dispatchEvent(new CustomEvent('w3a:tx-confirmer-confirm', {
        detail: { confirmed, error },
        bubbles: true,
        composed: true
      }));
      this.dispatchEvent(new CustomEvent('w3a:modal-confirm', {
        detail: { confirmed, error },
        bubbles: true,
        composed: true
      }));
    } catch {}
  }

  /**
   * Update theme dynamically - called by React component when user changes theme preference
   */
  updateTheme(newTheme: 'dark' | 'light'): void {
    // Update the theme property
    this.theme = newTheme;
    // If iframe is already initialized, send theme update via postMessage
    if (this.iframeInitialized) {
      const txData = {
        nearAccountId: this.nearAccountId,
        txSigningRequests: this.txSigningRequests,
        theme: this.theme
      };
      this.postToIframe('SET_TX_DATA', txData);
    } else {
      console.warn('[IframeModalHost]: Modal iframe not initialized yet, theme update deferred');
    }
    // Request Lit update
    this.requestUpdate();
  }

  render() {
    return html`
      <div class="iframe-modal-host">
        <iframe
          ${ref(this.iframeRef)}
          sandbox="allow-scripts allow-same-origin"
          allow="publickey-credentials-get; publickey-credentials-create; clipboard-read; clipboard-write"
        ></iframe>
      </div>
    `;
  }
}

if (!customElements.get(IFRAME_MODAL_ID)) {
  customElements.define(IFRAME_MODAL_ID, IframeModalHost);
}

export default IframeModalHost;
