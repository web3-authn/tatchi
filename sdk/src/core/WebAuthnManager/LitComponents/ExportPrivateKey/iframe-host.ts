// Iframe host for the Export Private Key viewer (drawer or modal variant)
import { html, type PropertyValues } from 'lit';
import { ref, createRef, Ref } from 'lit/directives/ref.js';
import { LitElementWithProps } from '../LitElementWithProps';
import { IFRAME_EXPORT_BOOTSTRAP_MODULE, EXPORT_VIEWER_BUNDLE } from '../tags';
import { resolveEmbeddedBase } from '../asset-base';
import { OFFLINE_EXPORT_FALLBACK } from '../../../OfflineExport/messages';
import type { ExportViewerVariant, ExportViewerTheme } from './viewer';
import { isObject, isString, isBoolean } from '@/utils/validation';
import { dispatchLitCancel, dispatchLitConfirm, dispatchLitCopy } from '../lit-events';
import { ensureExternalStyles } from '../css/css-loader';

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
  private messageHandler?: (event: MessageEvent) => void | Promise<void>;
  private iframeInitialized = false;
  private _bootstrapTimer: number | null = null;
  // Styles gating to avoid FOUC: wait for export-iframe.css before first render
  private _stylesReady = false;
  private _stylePromises: Promise<void>[] = [];
  private _stylesAwaiting: Promise<void> | null = null;

  constructor() {
    super();
    this.theme = 'dark';
    this.variant = 'drawer';
    this.accountId = '';
    this.publicKey = '';
    this.privateKey = undefined;
    this.loading = false;
  }

  protected createRenderRoot(): HTMLElement | DocumentFragment {
    const root = super.createRenderRoot();
    const p = ensureExternalStyles(root as ShadowRoot | DocumentFragment | HTMLElement, 'export-iframe.css', 'data-w3a-export-iframe-css');
    this._stylePromises.push(p);
    p.catch(() => {});
    return root;
  }

  protected getComponentPrefix(): string { return 'export-iframe'; }

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
    const isAbsoluteBase = /^https?:/i.test(base);
    if (!isAbsoluteBase) {
      try {
        console.warn(
          '[W3A][IframeExportHost] Embedded SDK base is not absolute. Skipping CSS preloads. ' +
          'Configure an absolute base so assets resolve: React → set TatchiPasskeyProvider config ' +
          '{ iframeWallet: { walletOrigin: "https://wallet.example.com", sdkBasePath: "/sdk" } }, '
        );
      } catch {}
    }
    const viewerBundle = EXPORT_VIEWER_BUNDLE;
    const bootstrap = IFRAME_EXPORT_BOOTSTRAP_MODULE;
    return `<!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
          ${isAbsoluteBase ? `<link rel="preload" href="${base}export-viewer.css" as="style" />` : ''}
          ${isAbsoluteBase ? `<link rel="preload" href="${base}export-iframe.css" as="style" />` : ''}
          <link rel="stylesheet" href="${base}wallet-service.css" />
          <!-- Component palette/tokens for host elements (e.g., <w3a-drawer>) -->
          ${isAbsoluteBase ? `<link rel="stylesheet" href="${base}w3a-components.css" />` : ''}
          <!-- Ensure critical component styles (strict CSP: external only, no inline) -->
          ${isAbsoluteBase ? `<link rel="stylesheet" href="${base}drawer.css" data-w3a-drawer-css />` : ''}
          ${isAbsoluteBase ? `<link rel="stylesheet" href="${base}export-viewer.css" data-w3a-export-viewer-css />` : ''}
          <script type="module" crossorigin="anonymous" src="${base}${viewerBundle}"></script>
          <script type="module" crossorigin="anonymous" src="${base}${bootstrap}"></script>
        </head>
        <body>
          <w3a-drawer id="exp" theme="dark"></w3a-drawer>
        </body>
      </html>`;
  }

  private initializeIframe() {
    const iframeEl = this.iframeRef.value;
    if (!iframeEl) return;
    this.setupMessageHandling();
    iframeEl.srcdoc = this.generateIframeHtml();
  }

  private postToIframe<T extends MessageType>(type: T, payload?: MessagePayloads[T]) {
    const win = this.iframeRef.value?.contentWindow;
    if (!win) return;
    win.postMessage({ type, payload }, '*');
  }

  private setupMessageHandling() {
    const onMessage = async (event: MessageEvent) => {
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
        <!--
          About this ExportPrivateKey iframe:
          - sandbox="allow-scripts allow-same-origin":
            Allows module scripts to run while preserving the wallet origin inside
            the iframe (no opaque origin). Keeping same-origin is required so the
            document matches the parent Permissions-Policy allowlist (e.g.,
            clipboard-read/write and WebAuthn) rather than being blocked as a
            null/opaque origin.
          - allow="clipboard-read; clipboard-write":
            Opts in to the clipboard features at the frame level. This must be
            used in combination with a Permissions-Policy header on the parent
            page that allows clipboard for the wallet origin.
          - srcdoc (set in initializeIframe):
            Loads wallet-service.css, component tokens (w3a-components.css),
            preloads drawer + export-viewer CSS, and imports the viewer +
            bootstrap modules; no inline scripts/styles to satisfy strict CSP.
        -->
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
