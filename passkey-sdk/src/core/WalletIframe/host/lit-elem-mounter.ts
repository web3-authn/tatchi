
/**
 * Lit Element Mounter - Host-Side Execution Layer
 *
 * This module manages Lit-based UI components inside the wallet iframe. It provides
 * a bridge between the parent application and UI components that need to run in
 * the wallet origin for proper WebAuthn activation.
 *
 * Key Responsibilities:
 * - Component Mounting: Creates and mounts Lit UI components on demand
 * - Event Wiring: Connects UI interactions to PasskeyManager methods
 * - Lifecycle Management: Handles mount/unmount/update operations
 * - Message API: Exposes window.postMessage interface for parent communication
 * - Component Registry: Uses declarative registry for component definitions
 * - PasskeyManager Integration: Wires UI actions to actual wallet operations
 *
 * Architecture:
 * - Uses lit-element-registry.ts for component definitions
 * - Maintains mounted component instances by ID
 * - Provides typed prop/event bindings for PasskeyManager actions
 * - Handles both direct component mounting and registry-based mounting
 * - Supports component updates and cleanup
 *
 * Component Types:
 * - Transaction Buttons: For signing and sending transactions
 * - Registration Buttons: For passkey registration flows
 * - Generic UI Components: Extensible registry for custom components
 *
 * Message Protocol:
 * - WALLET_UI_MOUNT: Mount a component with specified props
 * - WALLET_UI_UPDATE: Update props of existing component
 * - WALLET_UI_UNMOUNT: Remove a mounted component
 * - WALLET_UI_REGISTER_TYPES: Register new component types
 *
 * Security Considerations:
 * - All UI components run in the wallet origin for proper WebAuthn context
 * - Components are isolated from parent application code
 * - Event handlers are properly bound to PasskeyManager methods
 * - No functions are transferred across the iframe boundary
 */

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
  postToParent: (message: unknown) => void;
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

  type NormalizedTxConfig = {
    nearAccountId: string;
    transactions: TransactionInput[];
    className: string;
    text: string;
    theme: 'dark' | 'light';
    buttonStyle?: Record<string, string>;
    buttonHoverStyle?: Record<string, string>;
    tooltipPosition?: Record<string, string>;
    targetSelector?: string;
  };

  const normalizeTxConfig = (cfg: WalletIframeTxButtonHostProps, context: 'TxHost' | 'TxBtn'): NormalizedTxConfig | null => {
    const nearAccountId = String(cfg?.nearAccountId || '').trim();
    const transactions = Array.isArray(cfg?.transactions) ? cfg.transactions : [];
    if (!nearAccountId || transactions.length === 0) {
      console.warn(`[ElemMounter:${context}] missing nearAccountId or transactions`);
      return null;
    }

    const className = cfg?.className ? String(cfg.className) : '';
    const text = String(cfg?.text || 'Send Transaction');
    const theme = (cfg?.theme === 'light' || cfg?.theme === 'dark') ? cfg.theme : 'dark';
    const buttonStyle = normalizeButtonStyle(cfg?.buttonStyle as Record<string, string>);
    const buttonHoverStyle = normalizeButtonStyle(cfg?.buttonHoverStyle as Record<string, string>);
    const tooltipPosition = cfg?.tooltipPosition || undefined;
    const targetSelector = ((cfg as unknown as { targetSelector?: string })?.targetSelector) || undefined;

    return {
      nearAccountId,
      transactions,
      className,
      text,
      theme,
      buttonStyle,
      buttonHoverStyle,
      tooltipPosition,
      targetSelector,
    };
  };

  const attachTxCallbacks = (el: {
    externalConfirm?: (args: {
      nearAccountId: string;
      txSigningRequests: TransactionInput[];
      options?: SignAndSendTransactionHooksOptions;
    }) => Promise<ActionResult[]>;
    onSuccess?: (result: ActionResult[]) => void;
    onCancel?: () => void;
  }) => {
    el.externalConfirm = async ({ nearAccountId, txSigningRequests, options }) => {
      const pm = getPasskeyManager();
      return await pm!.signAndSendTransactions({ nearAccountId, transactions: txSigningRequests, options });
    };
    el.onSuccess = (result: ActionResult[]) => {
      try { opts.postToParent({ type: 'TX_BUTTON_RESULT', payload: { ok: true, result } }); } catch {}
    };
    el.onCancel = () => {
      try { opts.postToParent({ type: 'TX_BUTTON_RESULT', payload: { ok: false, cancelled: true } }); } catch {}
    };
  };

  // Mount tx host wrapper (Lit) that mirrors the React host API
  const showTxHost = async (cfg: WalletIframeTxButtonHostProps) => {
    try { ensurePasskeyManager(); } catch {}
    const normalized = normalizeTxConfig(cfg, 'TxHost');
    if (!normalized) return;

    removeTxHost();

    const el = document.createElement(getTag('txHost')) as HTMLElement & {
      externalConfirm?: (args: {
        nearAccountId: string;
        txSigningRequests: TransactionInput[];
        options?: SignAndSendTransactionHooksOptions;
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

    try { el.style.display = 'inline-block'; } catch {}
    el.className = normalized.className;
    el.nearAccountId = normalized.nearAccountId;
    el.transactions = normalized.transactions;
    el.text = normalized.text;
    el.theme = normalized.theme;
    if (normalized.buttonStyle) el.buttonStyle = normalized.buttonStyle;
    if (normalized.buttonHoverStyle) el.buttonHoverStyle = normalized.buttonHoverStyle;
    if (normalized.tooltipPosition) el.tooltipPosition = normalized.tooltipPosition;

    attachTxCallbacks(el);

    pickRoot(normalized.targetSelector).appendChild(el);
    hostTxEl = el;
  };

  const showTxBtn = async (cfg: WalletIframeTxButtonHostProps) => {
    try { ensurePasskeyManager(); } catch {}
    const normalized = normalizeTxConfig(cfg, 'TxBtn');
    if (!normalized) return;

    removeTxBtn();

    const el = document.createElement(getTag('txButton')) as IframeButtonLitElementProps;
    try { el.style.display = 'inline-block'; } catch {}
    if (normalized.className) try { el.className = normalized.className; } catch {}

    el.nearAccountId = normalized.nearAccountId;
    el.txSigningRequests = normalized.transactions;
    el.buttonTextElement = normalized.text;
    el.txTreeTheme = normalized.theme;
    if (normalized.buttonStyle) el.buttonStyle = normalized.buttonStyle;
    if (normalized.buttonHoverStyle) el.buttonHoverStyle = normalized.buttonHoverStyle;
    if (normalized.tooltipPosition) el.tooltipPosition = normalized.tooltipPosition;

    attachTxCallbacks(el);

    pickRoot(normalized.targetSelector).appendChild(el);
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
                try { opts.postToParent({ type: b.resultMessageType, payload: { ok: true, result } }); } catch {}
              }
            } catch (err: unknown) {
              const type = b.resultMessageType || 'UI_ACTION_RESULT';
              try { opts.postToParent({ type, payload: { ok: false, error: errorMessage(err) } }); } catch {}
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
        try { (el as unknown as Record<string, unknown>)[successProp] = (result: unknown) => { try { opts.postToParent({ type: messageType, payload: { ok: true, result } }); } catch {} }; } catch {}
      }
      if (cancelProp) {
        try { (el as unknown as Record<string, unknown>)[cancelProp] = () => { try { opts.postToParent({ type: messageType, payload: { ok: false, cancelled: true } }); } catch {} }; } catch {}
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

  const messageHandlers: Record<string, (payload: unknown) => void> = {
    WALLET_SET_CONFIG: (payload) => {
      const data = payload as Record<string, unknown>;
      try { updateWalletConfigs(data); } catch {}
      try {
        const iframeWallet = (isObject(data) && isObject((data as { iframeWallet?: unknown }).iframeWallet))
          ? (data as { iframeWallet?: Record<string, unknown> }).iframeWallet
          : undefined;
        const registry = (iframeWallet && isObject((iframeWallet as { uiRegistry?: unknown }).uiRegistry))
          ? (iframeWallet as { uiRegistry?: WalletUIRegistry }).uiRegistry
          : undefined;
        if (registry) {
          uiRegistry = { ...uiRegistry, ...registry };
        }
      } catch {}
    },
    WALLET_UI_REGISTER_TYPES: (payload) => {
      try {
        if (isObject(payload)) {
          uiRegistry = { ...uiRegistry, ...(payload as WalletUIRegistry) };
        }
      } catch {}
    },
    WALLET_UI_MOUNT: (payload) => {
      try { mountUiComponent(payload as { key: string }); } catch {}
    },
    WALLET_UI_UPDATE: (payload) => {
      try { updateUiComponent(payload as { id: string; props?: Record<string, unknown> }); } catch {}
    },
    WALLET_UI_UNMOUNT: (payload) => {
      try { unmountUiComponent(payload as { id: string }); } catch {}
    },
    WALLET_SHOW_TX_HOST: (payload) => {
      showTxHost(payload as WalletIframeTxButtonHostProps);
    },
    WALLET_HIDE_TX_HOST: () => {
      removeTxHost();
    },
    WALLET_SHOW_TX_BUTTON: (payload) => {
      const data = payload as WalletIframeTxButtonHostProps & { renderMode?: string };
      try {
        if (data?.renderMode === 'inline') {
          showTxHost(data);
          return;
        }
      } catch {}
      showTxBtn(data);
    },
    WALLET_HIDE_TX_BUTTON: () => {
      removeTxBtn();
    },
  };

  window.addEventListener('message', (evt: MessageEvent) => {
    const type = evt?.data?.type;
    if (!type) return;
    const handler = messageHandlers[type as keyof typeof messageHandlers];
    if (!handler) return;
    try {
      handler(evt?.data?.payload ?? evt?.data ?? {});
    } catch {}
  });
}
