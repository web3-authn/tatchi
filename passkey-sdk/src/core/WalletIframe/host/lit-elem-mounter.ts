
// Mounts minimal Lit components inside the wallet-iframe document to capture
// user activation (click) within the wallet origin, enabling WebAuthn
// without additional popups and clicks. It exposes a
// tiny postMessage API so the parent can request embedded UI elements
// to appear/disappear while the sensitive logic runs here.

// Import and retain a reference to ensure bundlers don’t treeshake the element
// Import iframe tooltip confirmer button and keep reference
import { IframeButtonHost as __IframeButtonKeep } from '../../WebAuthnManager/LitComponents/IframeButtonWithTooltipConfirmer/iframe-host';
import { PasskeyManagerIframe } from '../PasskeyManagerIframe';
import { PasskeyManager } from '../../PasskeyManager';
import { ConfirmationConfig } from '../../types/signer-worker';
import { BaseSSEEvent, TransactionInput, TransactionInputWasm } from '../../types';
import { EmbeddedTxButtonTheme } from '../../WebAuthnManager/LitComponents/IframeButtonWithTooltipConfirmer/button-with-tooltip-themes';
import {
  SignAndSendTransactionHooksOptions,
  ActionResult,
} from '../../types/passkeyManager';
import { uiBuiltinRegistry, type WalletUIRegistry } from './lit-element-registry';
import { errorMessage } from '../../../utils/errors';
import { isObject, isString, isFiniteNumber } from '../validation';
import { defineTag, getTag } from '../../WebAuthnManager/LitComponents/tags';
// Keep essential custom elements from being tree-shaken
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const __ensureTreeDefinition = [__IframeButtonKeep];
// Define the element defensively in case the side-effect define was optimized away

import { type WalletIframeTxButtonHostProps } from '../../../react/components/WalletIframeTxButtonHost';
// Wallet host lit wrappers (no nested wallet iframe)
import './WalletHostElements';

try { defineTag('txButton', __IframeButtonKeep as unknown as CustomElementConstructor); } catch {}

export type EnsurePasskeyManager = () => void;
export type GetPasskeyManager = () => PasskeyManager | PasskeyManagerIframe | null; // Avoid tight coupling to class type
export type UpdateWalletConfigs = (patch: Record<string, unknown>) => void;

type IframeButtonLitElementProps = HTMLElement & {
  style: Record<string, string> | CSSStyleDeclaration;
  nearAccountId: string,
  txSigningRequests: TransactionInput[],
  buttonTextElement: string;
  txTreeTheme: EmbeddedTxButtonTheme;
  buttonStyle?: Record<string, string> | CSSStyleDeclaration;
  buttonHoverStyle?: Record<string, string> | CSSStyleDeclaration;
  tooltipPosition: Record<string, string>,
  externalConfirm(args: {
    nearAccountId: string,
    txSigningRequests: TransactionInput[],
    options?: SignAndSendTransactionHooksOptions,
    theme?: 'dark' | 'light'
  }): Promise<ActionResult[]>;
  onSuccess(result: ActionResult[]): void;
  onCancel(): void;
}

// Removed EmbeddedRegisterButton types and usage

export function setupLitElemMounter(opts: {
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
   *   Renders an embedded control inline and wires its click
   *   to PasskeyManager.registerPasskey. No modals are used; confirmation config
   *   is temporarily forced to { uiMode: 'skip', behavior: 'autoProceed' }.
   * - WALLET_HIDE_REGISTER_BUTTON: removes the element if present.
   */
  const { ensurePasskeyManager, getPasskeyManager, updateWalletConfigs } = opts;

  let txBtnEl: HTMLElement | null = null;
  let hostTxEl: HTMLElement | null = null;
  // Generic registry for mountable components
  let uiRegistry: WalletUIRegistry = { ...uiBuiltinRegistry };
  const mountedById = new Map<string, HTMLElement>();
  let uidCounter = 0;
  let busy = false;

  try { document.documentElement.style.background = 'transparent'; } catch {}
  try { document.body.style.background = 'transparent'; } catch {}

  const toPx = (v: unknown, fallback: string) => {
    if (v == null) return fallback;
    if (isFiniteNumber(v)) return `${v}px`;
    const s = String(v).trim();
    return s ? s : fallback;
  };

  const normalizeButtonStyle = (
    style: Record<string, string>
  ): Record<string, string> | undefined => {
    if (!style || !isObject(style)) return undefined;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(style)) {
      if (v == null) continue;
      const key = k.replace(/([A-Z])/g, '-$1').toLowerCase();
      out[key] = isFiniteNumber(v) ? `${v}px` : String(v);
    }
    return out;
  };

  const pickRoot = (selector?: string | null): HTMLElement => {
    try {
      if (selector && isString(selector)) {
        const el = document.querySelector(selector);
        if (el && el instanceof HTMLElement) return el;
      }
    } catch {}
    return document.body || document.documentElement;
  };

  const removeTxBtn = () => {
    try { txBtnEl?.remove(); } catch {}
    txBtnEl = null;
  };
  const removeTxHost = () => {
    try { hostTxEl?.remove(); } catch {}
    hostTxEl = null;
  };

  // Mount tx host wrapper (Lit) that mirrors the React host API
  const showTxHost = async (cfg: WalletIframeTxButtonHostProps) => {

    try { ensurePasskeyManager(); } catch {}
    const nearAccountId = String(cfg?.nearAccountId || '').trim();
    const transactions = Array.isArray(cfg?.transactions) ? cfg.transactions : [];

    if (!nearAccountId || transactions.length === 0) {
      console.warn('[ElemMounter:TxHost] missing nearAccountId or transactions');
      return;
    }

    removeTxHost();

    const el = document.createElement(getTag('txHost')) as HTMLElement & {
      externalConfirm?: (args: {
        nearAccountId: string;
        txSigningRequests: TransactionInput[];
        options?: SignAndSendTransactionHooksOptions
      }) => Promise<ActionResult[]>;
      onSuccess?: (result: ActionResult[]) => void;
      onCancel?: () => void;
      buttonStyle?: Record<string, string>;
      buttonHoverStyle?: Record<string, string>;
      tooltipPosition?: Record<string, string>;
      nearAccountId?: string;
      transactions?: TransactionInput[];
      text?: string;
      theme?: 'dark' | 'light';
    };

    el.style.display = 'inline-block';
    el.className = cfg?.className ? String(cfg.className) : '';
    el.nearAccountId = nearAccountId;
    el.transactions = transactions;
    el.text = cfg?.text || 'Send Transaction';
    el.theme = (cfg?.theme === 'light' || cfg?.theme === 'dark') ? cfg.theme : 'dark';
    const bs = normalizeButtonStyle(cfg?.buttonStyle as Record<string, string>);
    const bhs = normalizeButtonStyle(cfg?.buttonHoverStyle as Record<string, string>);
    if (bs) el.buttonStyle = bs;
    if (bhs) el.buttonHoverStyle = bhs;
    if (cfg?.tooltipPosition) el.tooltipPosition = cfg.tooltipPosition;

    el.externalConfirm = async ({ nearAccountId, txSigningRequests, options }: {
      nearAccountId: string;
      txSigningRequests: TransactionInput[];
      options?: SignAndSendTransactionHooksOptions
    }) => {
      const pm = getPasskeyManager();
      return await pm!.signAndSendTransactions({ nearAccountId, transactions: txSigningRequests, options });
    };
    el.onSuccess = (result: ActionResult[]) => {
      try { window.parent?.postMessage({ type: 'TX_BUTTON_RESULT', payload: { ok: true, result } }, '*'); } catch {}
    };
    el.onCancel = () => {
      try { window.parent?.postMessage({ type: 'TX_BUTTON_RESULT', payload: { ok: false, cancelled: true } }, '*'); } catch {}
    };

    pickRoot((cfg as unknown as { targetSelector?: string })?.targetSelector).appendChild(el);
    hostTxEl = el;
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
    const el = document.createElement(getTag('txButton')) as IframeButtonLitElementProps;
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
    el.externalConfirm = async ({ nearAccountId, txSigningRequests, options }: {
      nearAccountId: string;
      txSigningRequests: TransactionInput[];
      options?: SignAndSendTransactionHooksOptions
    }) => {
      const pm = getPasskeyManager();
      return await pm!.signAndSendTransactions({
        nearAccountId,
        transactions: txSigningRequests,
        options,
      });
    };

    // Proxy results back to parent for observability
    el.onSuccess = (result: ActionResult[]) => {
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

    pickRoot((cfg as unknown as { targetSelector?: string })?.targetSelector).appendChild(el);
    txBtnEl = el;
  };

  // ===== Generic UI registry mount helpers =====
  const applyProps = (el: HTMLElement & Record<string, unknown>, props: Record<string, unknown>) => {
    if (!props) return;
    for (const [k, v] of Object.entries(props)) {
      try { (el as unknown as Record<string, unknown>)[k] = v as unknown; } catch {}
    }
  };

  const runPmAction = async (action: string, args: Record<string, unknown>): Promise<unknown> => {
    const pm = getPasskeyManager();
    ensurePasskeyManager();
    switch (action) {
      case 'registerPasskey': {
        const accountId = String(args?.nearAccountId || '').trim();
        if (!accountId) throw new Error('nearAccountId required');
        let prevConfig: ConfirmationConfig | undefined;
        try {
          prevConfig = pm?.getConfirmationConfig?.();
          const base = prevConfig || {
            uiMode: 'modal',
            behavior: 'requireClick',
            autoProceedDelay: 0,
            theme: 'dark' as const
          };
          const next: ConfirmationConfig = {
            ...base,
            uiMode: 'skip',
            behavior: 'autoProceed',
            autoProceedDelay: 0
          };
          pm?.setConfirmationConfig?.(next);
        } catch {}
        try {
          return await pm!.registerPasskey(accountId, { onEvent: () => {}, onError: () => {}, beforeCall: async () => {}, afterCall: () => {} });
        } finally {
          try { if (prevConfig) pm?.setConfirmationConfig?.(prevConfig); } catch {}
        }
      }
      case 'signAndSendTransactions': {
        const nearAccountId = String((args as { nearAccountId?: unknown })?.nearAccountId || '').trim();
        const txsCandidate = (args as { transactions?: unknown; txSigningRequests?: unknown });
        const transactions: TransactionInput[] = Array.isArray(txsCandidate?.transactions || txsCandidate?.txSigningRequests)
          ? (txsCandidate?.transactions || txsCandidate?.txSigningRequests) as TransactionInput[]
          : [];
        const options = (args as { options?: import('../../types/passkeyManager').SignAndSendTransactionHooksOptions })?.options || {};
        if (!nearAccountId || transactions.length === 0) throw new Error('nearAccountId and transactions required');
        return await pm!.signAndSendTransactions({ nearAccountId, transactions, options });
      }
      default:
        throw new Error(`Unknown pm action: ${action}`);
    }
  };

  const mountUiComponent = (payload: { key: string; props?: Record<string, unknown>; targetSelector?: string; id?: string }) => {
    const { key } = payload || ({} as Record<string, unknown>);
    const def = uiRegistry[key];
    if (!def || !def.tag) {
      console.warn('[ElemMounter:UI] Unknown component key:', key);
      return null;
    }
    const el = document.createElement(def.tag) as HTMLElement & Record<string, unknown>;
    try { el.style.display = 'inline-block'; } catch {}
    const props = { ...(def.propDefaults || {}), ...(payload?.props || {}) } as Record<string, unknown>;
    applyProps(el, props);

    // Wire event bindings to run pm actions and optionally post results
    if (Array.isArray(def.eventBindings)) {
      for (const b of def.eventBindings) {
        try {
          el.addEventListener(b.event, async () => {
            try {
              const args: Record<string, unknown> = {};
              if (b.argsFromProps) {
                for (const [argName, propKey] of Object.entries(b.argsFromProps)) {
                  args[argName] = (el as unknown as Record<string, unknown>)[propKey];
                }
              }
              const result = await runPmAction(b.action, args);
              if (b.resultMessageType) {
                try { window.parent?.postMessage({ type: b.resultMessageType, payload: { ok: true, result } }, '*'); } catch {}
              }
            } catch (err: unknown) {
              const type = b.resultMessageType || 'UI_ACTION_RESULT';
              try { window.parent?.postMessage({ type, payload: { ok: false, error: errorMessage(err) } }, '*'); } catch {}
            }
          });
        } catch {}
      }
    }

    // Wire prop bindings (e.g., externalConfirm)
    if (Array.isArray(def.propBindings)) {
      for (const pb of def.propBindings) {
        try {
          (el as unknown as Record<string, unknown>)[pb.prop] = async (args: Record<string, unknown>) => {
            const res = await runPmAction(pb.action, args);
            return res;
          };
        } catch {}
      }
    }

    // Bridge common success/cancel props to parent postMessage
    if (def.bridgeProps) {
      const { successProp, cancelProp, messageType } = def.bridgeProps;
      if (successProp) {
        try { (el as unknown as Record<string, unknown>)[successProp] = (result: unknown) => { try { window.parent?.postMessage({ type: messageType, payload: { ok: true, result } }, '*'); } catch {} }; } catch {}
      }
      if (cancelProp) {
        try { (el as unknown as Record<string, unknown>)[cancelProp] = () => { try { window.parent?.postMessage({ type: messageType, payload: { ok: false, cancelled: true } }, '*'); } catch {} }; } catch {}
      }
    }

    const root = pickRoot((payload?.props as unknown as { targetSelector?: string })?.targetSelector || (payload as { targetSelector?: string } | undefined)?.targetSelector);
    root.appendChild(el);
    const id = payload?.id || `w3a-ui-${++uidCounter}`;
    mountedById.set(id, el);
    return id;
  };

  const updateUiComponent = (payload: { id: string; props?: Record<string, unknown> }) => {
    const el = mountedById.get(payload.id) as (HTMLElement & Record<string, unknown>) | undefined;
    if (!el) return false;
    applyProps(el, payload.props || {});
    return true;
  };

  const unmountUiComponent = (payload: { id: string }) => {
    const el = mountedById.get(payload.id);
    if (!el) return false;
    try { el.remove(); } catch {}
    mountedById.delete(payload.id);
    return true;
  };

  window.addEventListener('message', (evt: MessageEvent) => {
    const t = evt?.data?.type;
    const p = evt?.data?.payload ?? {};
    switch (t) {
      case 'WALLET_SET_CONFIG':
        try { updateWalletConfigs(p); } catch {}
        try {
          const iw = (isObject(p) && isObject((p as { iframeWallet?: unknown }).iframeWallet))
            ? (p as { iframeWallet?: Record<string, unknown> }).iframeWallet
            : undefined;
          const reg = (iw && isObject((iw as { uiRegistry?: unknown }).uiRegistry)) ? ((iw as { uiRegistry?: WalletUIRegistry }).uiRegistry) : undefined;
          if (reg) {
            uiRegistry = { ...uiRegistry, ...reg };
          }
        } catch {}
        break;
      // Generic registry operations
      case 'WALLET_UI_REGISTER_TYPES':
        try { if (isObject(p)) uiRegistry = { ...uiRegistry, ...(p as WalletUIRegistry) }; } catch {}
        break;
      case 'WALLET_UI_MOUNT':
        try { mountUiComponent(p); } catch {}
        break;
      case 'WALLET_UI_UPDATE':
        try { updateUiComponent(p); } catch {}
        break;
      case 'WALLET_UI_UNMOUNT':
        try { unmountUiComponent(p); } catch {}
        break;
      // New: host wrappers (no nested wallet iframe)
      case 'WALLET_SHOW_TX_HOST':
        showTxHost(p);
        break;
      case 'WALLET_HIDE_TX_HOST':
        removeTxHost();
        break;
      case 'WALLET_SHOW_TX_BUTTON':
        // If caller hints renderMode: 'inline', prefer host wrapper
        try {
          if (p?.renderMode === 'inline') { showTxHost(p); break; }
        } catch {}
        showTxBtn(p);
        break;
      case 'WALLET_HIDE_TX_BUTTON':
        removeTxBtn();
        break;
    }
  });
}
