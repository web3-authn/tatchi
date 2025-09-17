
// Mounts minimal Lit components inside the wallet-iframe document to capture
// user activation (click) within the wallet origin, enabling WebAuthn
// without additional popups and clicks. It exposes a
// tiny postMessage API so the parent can request elements like a Register
// button to appear/disappear while the sensitive logic runs here.

// Import and retain a reference to ensure bundlers don’t treeshake the element
import '../WebAuthnManager/LitComponents/EmbeddedRegisterButton';
import { EmbeddedRegisterButton as __EmbeddedRegisterButtonKeep } from '../WebAuthnManager/LitComponents/EmbeddedRegisterButton/index';
// Import iframe tooltip confirmer button and keep reference
import { IframeButtonHost as __IframeButtonKeep } from '../WebAuthnManager/LitComponents/IframeButtonWithTooltipConfirmer/IframeButtonHost';
import { PasskeyManagerIframe } from './PasskeyManagerIframe';
import { PasskeyManager } from '../PasskeyManager';
import { BaseSSEEvent, TransactionInput, TransactionInputWasm } from '../types';
// Keep essential custom elements from being tree-shaken
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const __ensureTreeDefinition = [__EmbeddedRegisterButtonKeep, __IframeButtonKeep];
// Define the element defensively in case the side-effect define was optimized away

import { type WalletIframeTxButtonHostProps } from '../../react/components/WalletIframeTxButtonHost';
import { WalletIframeRegisterButtonHostProps, type WalletIframeRegisterButtonHost } from '../../react/components/WalletIframeRegisterButtonHost';

try {
  if (!customElements.get('embedded-register-button')) {
    customElements.define('embedded-register-button', __EmbeddedRegisterButtonKeep as unknown as CustomElementConstructor);
  }
} catch {}
try {
  if (!customElements.get('iframe-button')) {
    customElements.define('iframe-button', __IframeButtonKeep as unknown as CustomElementConstructor);
  }
} catch {}

export type EnsurePasskeyManager = () => void;
export type GetPasskeyManager = () => PasskeyManager | PasskeyManagerIframe | null; // Avoid tight coupling to class type
export type UpdateWalletConfigs = (patch: Record<string, unknown>) => void;

type IframeButtonLitElementProps = HTMLElement & {
  style: Record<string, string> | CSSStyleDeclaration;
  nearAccountId: string,
  txSigningRequests: TransactionInput[],
  buttonTextElement: HTMLElement | string | any;
  txTreeTheme: any;
  buttonStyle?: Record<string, string> | CSSStyleDeclaration;
  buttonHoverStyle?: Record<string, string> | CSSStyleDeclaration;
  tooltipPosition: Record<string, string>,
  externalConfirm(args: {
    nearAccountId: string,
    txSigningRequests: TransactionInput[],
    options: {
      beforeCall(): void;
      onEvent(e: BaseSSEEvent): void;
      afterCall(a: any, result: any): void;
    }
  }): void
  onSuccess(result: any): void;
  onCancel(): void;
}

type EmbeddedRegisterButtonLitElementProps = HTMLElement & {
  text: string;
  theme: 'dark' | 'light';
  width: string | number;
  height: string | number;
  style: Record<string, string> | CSSStyleDeclaration;
  buttonClass: string;
  buttonStyle: Record<string, string> | CSSStyleDeclaration;
  busy: boolean;
}

export function setupElemMounter(opts: {
  ensurePasskeyManager: EnsurePasskeyManager;
  getPasskeyManager: GetPasskeyManager;
  updateWalletConfigs: UpdateWalletConfigs;
}) {
  /**
   * Message API (window.postMessage) expected from the parent document:
   * - WALLET_SET_CONFIG: { nearRpcUrl, nearNetwork, contractId, ... }
   *   Merges into the running PasskeyManager configs before rendering elements.
   * - WALLET_SHOW_REGISTER_BUTTON: {
   *     nearAccountId: string,
   *     text?: string,
   *     theme?: 'dark' | 'light',
   *     width?: number|string,
   *     height?: number|string,
   *     className?: string,
   *     style?: Record<string, string|number>,
   *     autoClose?: boolean
   *   }
   *   Renders an <embedded-register-button> Lit component inline and wires its click
   *   to PasskeyManager.registerPasskey. No modals are used; confirmation config
   *   is temporarily forced to { uiMode: 'skip', behavior: 'autoProceed' }.
   * - WALLET_HIDE_REGISTER_BUTTON: removes the element if present.
   */
  const { ensurePasskeyManager, getPasskeyManager, updateWalletConfigs } = opts;

  let btnEl: HTMLElement | null = null;
  let txBtnEl: HTMLElement | null = null;
  let busy = false;

  try { document.documentElement.style.background = 'transparent'; } catch {}
  try { document.body.style.background = 'transparent'; } catch {}

  const toPx = (v: any, fallback: string) => {
    if (v == null) return fallback;
    if (typeof v === 'number' && Number.isFinite(v)) return `${v}px`;
    const s = String(v).trim();
    return s ? s : fallback;
  };

  const normalizeButtonStyle = (
    style: Record<string, string>
  ): Record<string, string> | undefined => {
    if (!style || typeof style !== 'object') return undefined;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(style)) {
      if (v == null) continue;
      const key = k.replace(/([A-Z])/g, '-$1').toLowerCase();
      out[key] = typeof v === 'number' ? `${v}px` : String(v);
    }
    return out;
  };

  const removeRegisterBtn = () => {
    try { btnEl?.remove(); } catch {}
    btnEl = null; busy = false;
  };
  const removeTxBtn = () => {
    try { txBtnEl?.remove(); } catch {}
    txBtnEl = null;
  };

  const showRegisterBtn = async (cfg: WalletIframeRegisterButtonHostProps) => {
    try { ensurePasskeyManager(); } catch {}
    const nearAccountId = String(cfg?.nearAccountId || '').trim();
    const text = String(cfg?.text || 'Create Passkey');
    const theme = (cfg?.theme === 'light' || cfg?.theme === 'dark') ? cfg.theme : 'dark';
    const autoClose = cfg?.autoClose !== false;
    const className = cfg?.className ? String(cfg.className) : '';
    const styleObj = normalizeButtonStyle(cfg?.style as Record<string, string>);
    const width = toPx(cfg?.width, '220px');
    const height = toPx(cfg?.height, '44px');

    if (!nearAccountId) {
      console.warn('[ElemMounter:RegisterBtn] missing nearAccountId');
      return;
    }

    // Remove existing instance, then create the Lit element
    removeRegisterBtn();
    const el = document.createElement('embedded-register-button') as EmbeddedRegisterButtonLitElementProps;
    el.text = text;
    el.theme = theme;
    el.width = width;
    el.height = height;
    // Ensure visible footprint even before custom-element upgrade
    try {
      el.style.display = 'inline-block';
      el.style.width = width;
      el.style.height = height;
    } catch {}
    if (className) el.buttonClass = className;
    if (styleObj) el.buttonStyle = styleObj;

    const setBusy = (b: boolean) => {
      busy = b;
      try { el.busy = b; } catch {}
    };

    // Ensure upgrade before relying on events or layout
    try { await customElements.whenDefined('embedded-register-button'); } catch {}

    el.addEventListener('w3a-register-click', async () => {
      if (busy) return;
      setBusy(true);
      const pm = getPasskeyManager();
      try {
        ensurePasskeyManager();
        // Temporarily force skip UI for registration so no modal is shown.
        let prevConfig: any;
        try {
          prevConfig = pm?.getConfirmationConfig?.();
          pm?.setConfirmationConfig?.({
            ...(prevConfig || {}),
            uiMode: 'skip',
            behavior: 'autoProceed',
            autoProceedDelay: 0,
          });
        } catch {}

        const result = await pm!.registerPasskey(nearAccountId, {
          onEvent: () => {},
          onError: () => {},
          beforeCall: async () => {},
          afterCall: () => {}
        });

        // Restore previous confirmation config
        try { if (prevConfig) pm?.setConfirmationConfig?.(prevConfig); } catch {}
        try {
          window.parent?.postMessage({ type: 'REGISTER_RESULT', payload: { ok: !!result?.success, result } }, '*');
        } catch {}
        if (autoClose) removeRegisterBtn();
      } catch (err: any) {
        try {
          window.parent?.postMessage({ type: 'REGISTER_RESULT', payload: { ok: false, error: String(err?.message || err) } }, '*');
        } catch {}
      } finally {
        setBusy(false);
      }
    });

    const root = document.body || document.documentElement;
    root.appendChild(el);
    btnEl = el;
  };

  const showTxBtn = async (cfg: WalletIframeTxButtonHostProps) => {
    try { ensurePasskeyManager(); } catch {}
    const nearAccountId = String(cfg?.nearAccountId || '').trim();
    const transactions = Array.isArray(cfg?.transactions) ? cfg.transactions : [];
    const className = cfg?.className ? String(cfg.className) : '';
    const buttonText = String(cfg?.text || 'Send Transaction');
    const theme = (cfg?.theme === 'light' || cfg?.theme === 'dark') ? cfg.theme : 'dark';
    const buttonStyle = normalizeButtonStyle(cfg?.buttonStyle as Record<string, string>);
    const buttonHoverStyle = normalizeButtonStyle(cfg?.buttonHoverStyle as Record<string, string>);
    const tooltipPosition = cfg?.tooltipPosition || undefined;

    if (!nearAccountId || transactions.length === 0) {
      console.warn('[ElemMounter:TxBtn] missing nearAccountId or transactions');
      return;
    }

    // Remove existing instance
    removeTxBtn();
    const el = document.createElement('iframe-button') as IframeButtonLitElementProps;
    // Ensure footprint before upgrade
    try { el.style.display = 'inline-block'; } catch {}
    if (className) try { el.className = className; } catch {}
    // Set data attributes and props
    el.nearAccountId = nearAccountId;
    el.txSigningRequests = transactions;
    el.buttonTextElement = buttonText;
    el.txTreeTheme = theme;
    el.buttonStyle = buttonStyle;
    el.buttonHoverStyle = buttonHoverStyle;
    if (tooltipPosition) el.tooltipPosition = tooltipPosition;

    // Wire externalConfirm to local PasskeyManager inside wallet host
    el.externalConfirm = async ({ nearAccountId, txSigningRequests, options }) => {
      const pm = getPasskeyManager();
      return await pm!.signAndSendTransactions({
        nearAccountId,
        transactions: txSigningRequests,
        options,
      });
    };

    // Proxy results back to parent for observability
    el.onSuccess = (result: any) => {
      try {
        window.parent?.postMessage({
          type: 'TX_BUTTON_RESULT',
          payload: { ok: true, result }
        }, '*');
      } catch {}
    };
    el.onCancel = () => {
      try {
        window.parent?.postMessage({
          type: 'TX_BUTTON_RESULT',
          payload: { ok: false, cancelled: true }
        }, '*');
      } catch {}
    };

    const root = document.body || document.documentElement;
    root.appendChild(el);
    txBtnEl = el;
  };

  window.addEventListener('message', (evt: MessageEvent) => {
    const t = evt?.data?.type;
    const p = evt?.data?.payload ?? {};
    switch (t) {
      case 'WALLET_SET_CONFIG':
        try { updateWalletConfigs(p); } catch {}
        break;
      case 'WALLET_SHOW_REGISTER_BUTTON':
        showRegisterBtn(p);
        break;
      case 'WALLET_SHOW_TX_BUTTON':
        showTxBtn(p);
        break;
      case 'WALLET_HIDE_REGISTER_BUTTON':
        removeRegisterBtn();
        break;
      case 'WALLET_HIDE_TX_BUTTON':
        removeTxBtn();
        break;
    }
  });
}
