// Iframe host for the Export Private Key viewer (drawer or modal variant)
import { html, css, type PropertyValues } from 'lit';
import { ref, createRef, Ref } from 'lit/directives/ref.js';
import { LitElementWithProps } from '../LitElementWithProps';
import { IFRAME_EXPORT_BOOTSTRAP_MODULE, EXPORT_VIEWER_BUNDLE } from '../tags';
import { resolveEmbeddedBase } from '../asset-base';
import type { ExportViewerVariant, ExportViewerTheme } from './viewer';
import { isObject, isString, isBoolean } from '../../../WalletIframe/validation';
import { dispatchLitCancel, dispatchLitConfirm, dispatchLitCopy } from '../lit-events';

type MessageType =
  | 'READY'
  | 'ETX_DEFINED'
  | 'SET_INIT'
  | 'SET_EXPORT_DATA'
  | 'SET_LOADING'
  | 'SET_ERROR'
  | 'SET_PRIVATE_KEY'
  | 'CONFIRM'
  | 'CANCEL'
  | 'COPY'
  | 'IFRAME_ERROR'
  | 'IFRAME_UNHANDLED_REJECTION';

type MessagePayloads = {
  READY: undefined;
  ETX_DEFINED: undefined;
  SET_INIT: { targetOrigin: string };
  SET_EXPORT_DATA: {
    theme?: 'dark' | 'light';
    variant?: 'drawer' | 'modal';
    accountId: string;
    publicKey: string;
  };
  SET_LOADING: boolean;
  SET_ERROR: string;
  SET_PRIVATE_KEY: { privateKey: string };
  CONFIRM: undefined;
  CANCEL: undefined;
  COPY: { type: 'publicKey' | 'privateKey'; value: string };
  IFRAME_ERROR: string;
  IFRAME_UNHANDLED_REJECTION: string;
};

export class IframeExportHost extends LitElementWithProps {
  static properties = {
    theme: { type: String },
    variant: { type: String },
    accountId: { type: String, attribute: 'account-id' },
    publicKey: { type: String, attribute: 'public-key' },
    privateKey: { type: String, attribute: 'private-key' },
    loading: { type: Boolean },
    errorMessage: { type: String },
  } as const;

  declare theme: 'dark' | 'light';
  declare variant: 'drawer' | 'modal';
  declare accountId: string;
  declare publicKey: string;
  declare privateKey?: string;
  declare loading: boolean;
  declare errorMessage?: string;

  private iframeRef: Ref<HTMLIFrameElement> = createRef();
  private messageHandler?: (event: MessageEvent) => void;
  private iframeInitialized = false;

  constructor() {
    super();
    this.theme = 'dark';
    this.variant = 'drawer';
    this.accountId = '';
    this.publicKey = '';
    this.privateKey = undefined;
    this.loading = false;
  }

  static styles = css`
    :host {
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      display: block;
    }
    .iframe-host {
      position: fixed;
      inset: 0;
      /* Host container occupies viewport; child iframe sizes explicitly */
      }
    iframe {
      border: none;
      background: transparent;
      position: fixed;
      inset: 0;
      /* Ensure iframe fills viewport across browsers */
      width: 100vw;
      height: 100vh;
      z-index: 2147483647;
    }
    @supports (width: 100dvw) and (height: 100dvh) {
      iframe {
        width: 100dvw;
        height: 100dvh;
      }
    }
  `;

  protected getComponentPrefix(): string { return 'export-iframe'; }

  updated(changed: PropertyValues) {
    super.updated(changed);
    // Initialize iframe once; contentWindow can exist for about:blank, so use a flag
    if (!this.iframeInitialized) {
      this.initializeIframe();
      this.iframeInitialized = true;
      return;
    }
    // Push data on update
    this.postToIframe('SET_EXPORT_DATA', {
      theme: this.theme,
      variant: this.variant,
      accountId: this.accountId,
      publicKey: this.publicKey,
    });
    if (changed.has('loading')) {
      this.postToIframe('SET_LOADING', !!this.loading);
    }
    if (changed.has('errorMessage') && typeof this.errorMessage === 'string') {
      this.postToIframe('SET_ERROR', this.errorMessage);
    }
    if (changed.has('privateKey') && this.privateKey) {
      this.postToIframe('SET_PRIVATE_KEY', { privateKey: this.privateKey });
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.messageHandler) {
      window.removeEventListener('message', this.messageHandler);
      this.messageHandler = undefined;
    }
  }

  private generateIframeHtml(): string {
    const base = resolveEmbeddedBase();
    const viewerBundle = EXPORT_VIEWER_BUNDLE;
    const bootstrap = IFRAME_EXPORT_BOOTSTRAP_MODULE;
    return `<!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
          <style>
            /* Transparent first paint and neutral UA color-scheme */
            html,body{margin:0;padding:0;background:transparent !important;color-scheme:normal}
          </style>
          <script>try{ parent && parent.postMessage({ type: 'READY' }, '*'); } catch(e) {}</script>
          <script type="module" src="${base}${viewerBundle}"></script>
          <script type="module" src="${base}${bootstrap}"></script>
        </head>
        <body>
          <w3a-drawer id="exp" theme="dark"></w3a-drawer>
        </body>
      </html>`;
  }

  private initializeIframe() {
    const iframeEl = this.iframeRef.value;
    if (!iframeEl) return;
    try {
      iframeEl.style.background = 'transparent';
      (iframeEl.style as any).colorScheme = 'normal';
    } catch {}
    this.setupMessageHandling();
    iframeEl.srcdoc = this.generateIframeHtml();
  }

  private postToIframe<T extends MessageType>(type: T, payload?: MessagePayloads[T]) {
    const win = this.iframeRef.value?.contentWindow;
    if (!win) return;
    win.postMessage({ type, payload }, '*');
  }

  private setupMessageHandling() {
    const onMessage = (event: MessageEvent) => {
      const data = event?.data;
      if (!isObject(data) || !isString((data as { type?: unknown }).type)) return;
      const type = (data as { type?: string }).type as MessageType;
      const payload = (data as { payload?: unknown }).payload;
      switch (type) {
        case 'READY': {
          // Mark initialized in case parent missed initial flag set
          this.iframeInitialized = true;
          // Push init and initial data
          this.postToIframe('SET_INIT', { targetOrigin: window.location.origin });
          this.postToIframe('SET_EXPORT_DATA', {
            theme: this.theme,
            variant: this.variant,
            accountId: this.accountId,
            publicKey: this.publicKey,
          });
          this.postToIframe('SET_LOADING', !!this.loading);
          if (this.errorMessage) this.postToIframe('SET_ERROR', this.errorMessage);
          if (this.privateKey) this.postToIframe('SET_PRIVATE_KEY', { privateKey: this.privateKey });
          return;
        }
        case 'IFRAME_ERROR':
        case 'IFRAME_UNHANDLED_REJECTION': {
          console.error('[IframeExportHost] iframe error:', payload);
          return;
        }
        case 'CONFIRM': {
          dispatchLitConfirm(this);
          // Close viewer and notify parent to contract overlay
          this.remove();
          window.parent?.postMessage({ type: 'WALLET_UI_CLOSED' }, '*');
          return;
        }
        case 'CANCEL': {
          dispatchLitCancel(this);
          // Child waits for transitionend before posting CANCEL, so it's safe to remove immediately
          this.remove();
          // Notify parent app (outside wallet iframe) to contract overlay
          window.parent?.postMessage({ type: 'WALLET_UI_CLOSED' }, '*');
          return;
        }
        case 'COPY': {
          if (isObject(payload)) {
            const { type, value } = payload as Partial<{ type: unknown; value: unknown }>;
            if (isString(type) && (type === 'publicKey' || type === 'privateKey') && isString(value)) {
              dispatchLitCopy(this, { type, value });
            } else {
              console.warn('[IframeExportHost] Ignoring COPY message with invalid payload', payload);
            }
          }
          return;
        }
        default:
          return;
      }
    };

    if (this.messageHandler) window.removeEventListener('message', this.messageHandler);
    this.messageHandler = onMessage;
    window.addEventListener('message', onMessage);
  }

  render() {
    return html`
      <div class="iframe-host">
        <iframe ${ref(this.iframeRef)}
          sandbox="allow-scripts allow-same-origin"
          allow="clipboard-read; clipboard-write"
          ></iframe>
      </div>
    `;
  }
}

// Strongly-typed element shape for 'w3a-export-viewer-iframe'
export type ExportViewerIframeElement = HTMLElement & {
  theme?: ExportViewerTheme;
  variant?: ExportViewerVariant;
  accountId?: string;
  publicKey?: string;
  privateKey?: string;
  loading?: boolean;
  errorMessage?: string;
};

import { W3A_EXPORT_VIEWER_IFRAME_ID } from '../tags';
customElements.define(W3A_EXPORT_VIEWER_IFRAME_ID, IframeExportHost);

export default IframeExportHost;
