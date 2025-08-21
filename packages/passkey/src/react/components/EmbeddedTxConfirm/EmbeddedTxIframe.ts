import { LitElement, html, css } from 'lit';
import { ref, createRef, Ref } from 'lit/directives/ref.js';
import type { ActionArgs } from '../../../core/types/actions';
import type { ActionHooksOptions } from '../../../core/types/passkeyManager';
import { executeActionInternal } from '../../../core/PasskeyManager/actions';
import { toAccountId } from '../../../core/types/accountIds';

export interface TooltipStyle {
  width: string;
  height: string;
  position: 'top' | 'bottom' | 'left' | 'right';
  offset: string;
}

export interface IframeInitData {
  color: string;
  size: { width: string; height: string };
  tooltip: { width: string; height: string; position: string; offset: string };
}

export interface IframeMessage {
  type: 'READY' | 'SET_TX_DATA' | 'SET_LOADING' | 'SET_STYLE' | 'CONFIRM' | 'IFRAME_ERROR' | 'IFRAME_UNHANDLED_REJECTION' | 'ETX_DEFINED';
  payload?: any;
}

/**
 * Lit component that hosts the EmbeddedTxConfirm iframe and manages all iframe communication.
 * This replaces the hacky string injection approach with a proper Lit component.
 */
export class EmbeddedTxConfirmHost extends LitElement {
  static properties = {
    nearAccountId: { type: String },
    actionArgs: { type: Object },
    color: { type: String },
    buttonStyle: { type: Object },
    buttonHoverStyle: { type: Object },
    tooltipStyle: { type: Object },
    showLoading: { type: Boolean },
    actionOptions: { type: Object },
    passkeyManagerContext: { type: Object },
    // Event handlers
    onSuccess: { type: Object },
    onError: { type: Object },
    onCancel: { type: Object }
  } as const;

  private iframeInitialized = false;

  nearAccountId: string = '';
  actionArgs: ActionArgs | ActionArgs[] | null = null;
  color: string = '#667eea';
  buttonStyle: Record<string, string | number> = {};
  buttonHoverStyle: Record<string, string | number> = {};
  tooltipStyle: TooltipStyle = {
    width: '280px',
    height: '300px',
    position: 'top',
    offset: '8px'
  };
  showLoading: boolean = false;
  actionOptions: ActionHooksOptions = {};
  passkeyManagerContext: any = null;

  // Event handlers
  onSuccess?: (result: any) => void;
  onError?: (error: Error) => void;
  onCancel?: () => void;

  private iframeRef: Ref<HTMLIFrameElement> = createRef();

  static styles = css`
    :host {
      display: block;
      position: relative;
    }

    .embedded-confirm-button-placeholder {
      position: relative;
      display: inline-block;
      cursor: pointer;
      z-index: 1001;
    }

    iframe {
      border: none;
      background: transparent;
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      z-index: 1000;
    }
  `;

  connectedCallback() {
    super.connectedCallback();
    console.log('[EmbeddedTxConfirmHost] Connected to DOM');
  }

  updated(changedProperties: Map<string, any>) {
    super.updated(changedProperties);

    // Only initialize iframe once, then use postMessage for updates
    if (!this.iframeInitialized) {
      this.initializeIframe();
      this.iframeInitialized = true;
    } else {
      // Use postMessage to update iframe properties instead of recreating HTML
      this.updateIframeViaPostMessage(changedProperties);
    }
  }

  private parsePixelValue(value: string | number): number {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      if (value === 'auto') {
        throw new Error('Cannot parse "auto" value for pixel calculations. Please provide a specific pixel value.');
      }
      const match = value.match(/^(\d+(?:\.\d+)?)px$/);
      if (match) {
        return parseFloat(match[1]);
      }
      throw new Error(`Invalid pixel value: "${value}". Expected format: "123px" or numeric value.`);
    }
    return 0;
  }

  private calculateIframeSize() {
    const buttonWidth = this.parsePixelValue(this.buttonStyle?.width || '200px');
    const buttonHeight = this.parsePixelValue(this.buttonStyle?.height || '48px');
    const tooltipWidth = this.parsePixelValue(this.tooltipStyle.width);
    // Special case: tooltip height can be 'auto', so we provide a fallback value for iframe calculations
    const tooltipHeight = this.tooltipStyle.height === 'auto' ? 200 : this.parsePixelValue(this.tooltipStyle.height);
    const offset = this.parsePixelValue(this.tooltipStyle.offset);

    let iframeWidth = buttonWidth;
    let iframeHeight = buttonHeight;

    const iframePadding = 32;

    switch (this.tooltipStyle.position) {
      case 'top':
      case 'bottom':
        iframeHeight += (tooltipHeight + offset) * 2 + iframePadding;
        iframeWidth = Math.max(iframeWidth, tooltipWidth) + iframePadding;
        break;
      case 'left':
      case 'right':
        iframeWidth += (tooltipWidth + offset) * 2 + iframePadding;
        iframeHeight = Math.max(iframeHeight, tooltipHeight) + iframePadding;
        break;
    }

    return { width: iframeWidth, height: iframeHeight };
  }

  private toPx(v: string | number) {
    return typeof v === 'number' ? `${v}px` : v;
  }

  /**
   * Typed function that handles iframe initialization and communication.
   * This replaces the inline script for better type safety.
   */
  private createIframeInitScript(initData: IframeInitData) {
    // Convert function to string with proper typing
    const initFunction = (data: IframeInitData) => {
      const el = document.getElementById('etx') as any;
      if (!el) throw new Error('embedded-tx-confirm element not found');

      // Initialize component properties
      el.color = data.color;
      el.size = data.size;
      el.tooltip = data.tooltip;

      // Send ready message to parent
      window.parent.postMessage({ type: 'READY' }, '*');

      // Set up message listener for parent communication
      window.addEventListener('message', (e: MessageEvent) => {
        const { type, payload } = e.data || {};
        console.log('[EmbeddedTxConfirm iframe] Received message:', type, payload);

        switch (type) {
          case 'SET_TX_DATA':
            if (el.updateProperties) {
              el.updateProperties({
                nearAccountId: payload.nearAccountId,
                actionArgs: payload.actionArgs
              });
            } else {
              el.nearAccountId = payload.nearAccountId;
              el.actionArgs = payload.actionArgs;
            }
            console.log('[EmbeddedTxConfirm iframe] Set tx data:', payload.nearAccountId, payload.actionArgs);
            break;

          case 'SET_LOADING':
            if (el.updateProperties) {
              el.updateProperties({ loading: !!payload });
            } else {
              el.loading = !!payload;
            }
            console.log('[EmbeddedTxConfirm iframe] Set loading:', !!payload);
            break;

          case 'SET_STYLE':
            if (el.updateButtonStyles) {
              el.updateButtonStyles(
                payload.buttonStyle || {},
                payload.buttonHoverStyle || {},
                payload.tooltipStyle || {}
              );
            } else {
              el.buttonStyle = payload.buttonStyle || {};
              el.buttonHoverStyle = payload.buttonHoverStyle || {};
              if (payload.tooltipStyle) {
                el.tooltip = payload.tooltipStyle;
              }
            }
            console.log('[EmbeddedTxConfirm iframe] Set button styles:', payload);
            break;
        }
      });

      // Forward runtime errors to parent for debugging
      window.addEventListener('error', (e: ErrorEvent) => {
        try {
          window.parent.postMessage({
            type: 'IFRAME_ERROR',
            payload: String(e?.message || e)
          }, '*');
        } catch {}
      });

      window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
        try {
          window.parent.postMessage({
            type: 'IFRAME_UNHANDLED_REJECTION',
            payload: String(e?.reason || '')
          }, '*');
        } catch {}
      });

      // Notify when custom element is defined
      if (window.customElements && window.customElements.whenDefined) {
        window.customElements.whenDefined('embedded-tx-confirm').then(() => {
          try {
            window.parent.postMessage({ type: 'ETX_DEFINED' }, '*');
          } catch {}
        });
      }
    };

    // Return the function call as a string with typed data
    return `(${initFunction.toString()})(${JSON.stringify(initData)});`;
  }

  private generateIframeHTML() {
    const buttonSize = {
      width: this.buttonStyle?.width || '200px',
      height: this.buttonStyle?.height || '48px'
    };

    const initData = {
      color: this.color,
      size: {
        width: this.toPx(buttonSize.width),
        height: this.toPx(buttonSize.height)
      },
      tooltip: {
        width: this.toPx(this.tooltipStyle.width),
        height: this.tooltipStyle.height,
        position: this.tooltipStyle.position,
        offset: this.toPx(this.tooltipStyle.offset)
      }
    };

    return `<!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <style>html,body{margin:0;padding:0;background:transparent}</style>
          <script type="module" src="/sdk/embedded/embedded-tx-confirm.js"></script>
        </head>
        <body>
          <embedded-tx-confirm id="etx" style="position: absolute; top: 0; left: 0; height: 99%"></embedded-tx-confirm>
          <script type="module">
            ${this.createIframeInitScript(initData)}
          </script>
        </body>
      </html>`;
  }

  private initializeIframe() {
    if (!this.iframeRef.value) return;

    const html = this.generateIframeHTML();
    (this.iframeRef.value as any).srcdoc = html;

    // Set up message handling
    this.setupMessageHandling();
  }

  private updateIframeViaPostMessage(changedProperties: Map<string, any>) {
    if (!this.iframeRef.value?.contentWindow) return;

    if (changedProperties.has('nearAccountId') || changedProperties.has('actionArgs')) {
      this.iframeRef.value.contentWindow.postMessage({
        type: 'SET_TX_DATA',
        payload: {
          nearAccountId: this.nearAccountId,
          actionArgs: this.actionArgs
        }
      }, '*');
    }

    if (changedProperties.has('showLoading')) {
      this.iframeRef.value.contentWindow.postMessage({
        type: 'SET_LOADING',
        payload: this.showLoading
      }, '*');
    }

    if (changedProperties.has('buttonStyle') ||
        changedProperties.has('buttonHoverStyle') ||
        changedProperties.has('tooltipStyle') ||
        changedProperties.has('color')) {
      const buttonSize = {
        width: this.buttonStyle?.width || '200px',
        height: this.buttonStyle?.height || '48px'
      };

      const mergedButtonStyle = {
        ...this.buttonStyle,
        ...buttonSize
      };

      this.iframeRef.value.contentWindow.postMessage({
        type: 'SET_STYLE',
        payload: {
          buttonStyle: mergedButtonStyle,
          buttonHoverStyle: this.buttonHoverStyle,
          tooltipStyle: this.tooltipStyle
        }
      }, '*');
    }
  }

  private setupMessageHandling() {
    if (!this.iframeRef.value) return;

    const onMessage = (e: MessageEvent) => {
      if (e.source !== this.iframeRef.value!.contentWindow) return;

      const { type, payload } = (e.data || {}) as IframeMessage;

      if (type === 'IFRAME_ERROR' || type === 'IFRAME_UNHANDLED_REJECTION') {
        console.error('[EmbeddedTxConfirmHost iframe]', type, payload);
        return;
      }

      if (type === 'ETX_DEFINED') {
        console.debug('[EmbeddedTxConfirmHost iframe] custom element defined');
        return;
      }

            if (type === 'READY') {
        this.iframeRef.value!.contentWindow?.postMessage({
          type: 'SET_TX_DATA',
          payload: {
            nearAccountId: this.nearAccountId,
            actionArgs: this.actionArgs
          }
        }, '*');

        if (typeof this.showLoading === 'boolean') {
          this.iframeRef.value!.contentWindow?.postMessage({
            type: 'SET_LOADING',
            payload: this.showLoading
          }, '*');
        }

        // Send button styles
        if (this.buttonStyle || this.buttonHoverStyle || this.tooltipStyle) {
          const buttonSize = {
            width: this.buttonStyle?.width || '200px',
            height: this.buttonStyle?.height || '48px'
          };

          const mergedButtonStyle = {
            ...this.buttonStyle,
            ...buttonSize
          };

          this.iframeRef.value!.contentWindow?.postMessage({
            type: 'SET_STYLE',
            payload: {
              buttonStyle: mergedButtonStyle,
              buttonHoverStyle: this.buttonHoverStyle,
              tooltipStyle: this.tooltipStyle
            }
          }, '*');
        }
      } else if (type === 'CONFIRM') {
        this.handleConfirm();
      }
    };

    // Remove previous listener if it exists
    if ((this as any)._messageHandler) {
      window.removeEventListener('message', (this as any)._messageHandler);
    }

    // Add new listener and store reference
    (this as any)._messageHandler = onMessage;
    window.addEventListener('message', onMessage);
  }

  private async handleConfirm() {
    if (!this.passkeyManagerContext || !this.nearAccountId || !this.actionArgs) {
      this.onError?.(new Error('Missing required data for transaction'));
      return;
    }

    try {
      await executeActionInternal(
        this.passkeyManagerContext,
        toAccountId(this.nearAccountId as any),
        this.actionArgs as any,
        {
          ...this.actionOptions,
                    hooks: {
            beforeCall: () => {
              this.iframeRef.value?.contentWindow?.postMessage({
                type: 'SET_LOADING',
                payload: true
              }, '*');
              this.actionOptions?.hooks?.beforeCall?.();
            },
            afterCall: (success: boolean, actionResult: any) => {
              this.iframeRef.value?.contentWindow?.postMessage({
                type: 'SET_LOADING',
                payload: false
              }, '*');
              this.actionOptions?.hooks?.afterCall?.(success, actionResult);
              if (success) {
                this.onSuccess?.(actionResult);
              }
            }
          },
          onError: (err: any) => {
            this.iframeRef.value?.contentWindow?.postMessage({
              type: 'SET_LOADING',
              payload: false
            }, '*');
            this.actionOptions?.onError?.(err);
            this.onError?.(err);
          }
        } as any,
        {
          uiMode: 'embedded',
          behavior: 'autoProceed',
          autoProceedDelay: 0
        } as any
            );
    } catch (err) {
      this.iframeRef.value?.contentWindow?.postMessage({
        type: 'SET_LOADING',
        payload: false
      }, '*');
      this.onError?.(err as any);
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();

    // Clean up message listener
    if ((this as any)._messageHandler) {
      window.removeEventListener('message', (this as any)._messageHandler);
      delete (this as any)._messageHandler;
    }
  }

  render() {
    const buttonSize = {
      width: this.buttonStyle?.width || '200px',
      height: this.buttonStyle?.height || '48px'
    };

    const iframeSize = this.calculateIframeSize();

    return html`
      <div class="embedded-confirm-button-placeholder"
        style="width: ${this.toPx(buttonSize.width)}; height: ${this.toPx(buttonSize.height)};">
        <iframe
          ${ref(this.iframeRef)}
          style="width: ${iframeSize.width}px; height: ${iframeSize.height}px;"
          sandbox="allow-scripts allow-same-origin allow-forms allow-presentation"
        ></iframe>
      </div>
    `;
  }
}

// Define the custom element
customElements.define('embedded-tx-confirm-host', EmbeddedTxConfirmHost);

export default EmbeddedTxConfirmHost;
