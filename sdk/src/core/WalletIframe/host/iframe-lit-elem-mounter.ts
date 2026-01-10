
/**
 * Lit Element Mounter - Host-Side Execution Layer
 *
 * This module manages Lit-based UI components inside the wallet iframe. It provides
 * a bridge between the parent application and UI components that need to run in
 * the wallet origin for proper WebAuthn activation.
 *
 * Key Responsibilities:
 * - Component Mounting: Creates and mounts Lit UI components on demand
 * - Event Wiring: Connects UI interactions to TatchiPasskey methods
 * - Lifecycle Management: Handles mount/unmount/update operations
 * - Message API: Exposes window.postMessage interface for parent communication
 * - Component Registry: Uses declarative registry for component definitions
 * - TatchiPasskey Integration: Wires UI actions to actual wallet operations
 *
 * Architecture:
 * - Maintains mounted component instances by ID
 * - Provides typed prop/event bindings for TatchiPasskey actions
 * - Handles both direct component mounting and registry-based mounting
 *
 * Message Protocol:
 * - WALLET_UI_MOUNT: Mount a component with specified props
 * - WALLET_UI_UPDATE: Update props of existing component
 * - WALLET_UI_UNMOUNT: Remove a mounted component
 * - WALLET_UI_REGISTER_TYPES: Register new component types
 */

// Import arrow register button so it's defined and not tree-shaken in wallet origin
import type { TatchiPasskeyIframe } from '../TatchiPasskeyIframe';
import type { TatchiPasskey } from '../../TatchiPasskey';
import type { SignAndSendTransactionHooksOptions } from '../../types/sdkSentEvents';
import {
  fromTransactionInputsWasm,
  type ActionResult,
  type TatchiConfigsInput,
  type TransactionInput,
  type TransactionInputWasm
} from '../../types';
import { uiBuiltinRegistry, type PmActionName, type WalletUIRegistry } from './iframe-lit-element-registry';
import { errorMessage } from '../../../utils/errors';
import { isObject, isString, toTrimmedString } from '@/utils/validation';
import { type SignerMode, coerceSignerMode } from '../../types/signer-worker';
import { ensureHostBaseStyles, markContainer, setContainerAnchored } from './mounter-styles';

export type EnsureTatchiPasskey = () => void;
export type GetPasskeyManager = () => TatchiPasskey | TatchiPasskeyIframe | null; // Avoid tight coupling to class type
export type UpdateWalletConfigs = (patch: Partial<TatchiConfigsInput>) => void;

type StructuredPrimitive = string | number | boolean | null;
type StructuredValue =
  | StructuredPrimitive
  | undefined
  | bigint
  | Uint8Array
  | StructuredValue[]
  | { [key: string]: StructuredValue };

type UiProps = Record<string, StructuredValue>;
type UiActionArgs = Record<string, StructuredValue>;

type SignAndSendArgs = UiActionArgs & {
  nearAccountId?: string;
  transactions?: TransactionInput[] | TransactionInputWasm[];
  txSigningRequests?: TransactionInput[] | TransactionInputWasm[];
  options?: SignAndSendTransactionHooksOptions;
};

type PmActionArgsMap = {
  signAndSendTransactions: SignAndSendArgs;
};

type PmActionResultMap = {
  signAndSendTransactions: ActionResult[];
};

type PmActionArgs = PmActionArgsMap[PmActionName];
type PmActionResult = PmActionResultMap[PmActionName];

type WalletUiMountPayload = { key: string; props?: UiProps; targetSelector?: string; id?: string };
type WalletUiUpdatePayload = { id: string; props?: UiProps };
type WalletUiUnmountPayload = { id: string };

type WalletUiInboundPayloadMap = {
  WALLET_SET_CONFIG: Partial<TatchiConfigsInput>;
  WALLET_UI_REGISTER_TYPES: WalletUIRegistry;
  WALLET_UI_MOUNT: WalletUiMountPayload;
  WALLET_UI_UPDATE: WalletUiUpdatePayload;
  WALLET_UI_UNMOUNT: WalletUiUnmountPayload;
};

type WalletUiInboundType = keyof WalletUiInboundPayloadMap;

type WalletUiInboundMessage = {
  [K in WalletUiInboundType]: { type: K; payload?: WalletUiInboundPayloadMap[K] }
}[WalletUiInboundType];

type WalletUiActionResultPayload = {
  ok: boolean;
  id: string;
  result?: StructuredValue | PmActionResult;
  error?: string;
  cancelled?: boolean;
};

type WalletUiOutboundMessage =
  | { type: 'WALLET_UI_EVENT'; payload: { id: string; key: string; event: string } }
  | { type: 'WALLET_UI_ANCHOR_ENTER' | 'WALLET_UI_ANCHOR_LEAVE'; payload: { id: string } }
  | { type: string; payload: WalletUiActionResultPayload };

type UiActionHandler = (args: UiActionArgs) => Promise<PmActionResult>;
type UiResultHandler = (result: StructuredValue | PmActionResult) => void;
type UiCancelHandler = () => void;
type UiElementProp = StructuredValue | UiActionHandler | UiResultHandler | UiCancelHandler;
type UiElement = HTMLElement & Record<string, UiElementProp>;

type ViewportRect = { top: number; left: number; width: number; height: number };

type SetupLitElemMounterOptions = {
  ensureTatchiPasskey: EnsureTatchiPasskey;
  getTatchiPasskey: GetPasskeyManager;
  updateWalletConfigs: UpdateWalletConfigs;
  postToParent: (message: WalletUiOutboundMessage) => void;
};

export function setupLitElemMounter(opts: SetupLitElemMounterOptions) {
  const { ensureTatchiPasskey, getTatchiPasskey, updateWalletConfigs } = opts;

  // Generic registry for mountable components
  let uiRegistry: WalletUIRegistry = { ...uiBuiltinRegistry };
  let uidCounter = 0;
  const mountedById = new Map<string, HTMLElement>();

  // Ensure global host styles via stylesheet (no inline style attributes)
  ensureHostBaseStyles();

  const isWasmTransactionInput = (tx: TransactionInput | TransactionInputWasm): tx is TransactionInputWasm => {
    return Array.isArray(tx.actions) && tx.actions.some((action) => isObject(action) && 'action_type' in action);
  };

  const normalizeTransactions = (candidate?: TransactionInput[] | TransactionInputWasm[]): TransactionInput[] => {
    if (!Array.isArray(candidate) || candidate.length === 0) return [];
    if (candidate.every(isWasmTransactionInput)) {
      return fromTransactionInputsWasm(candidate as TransactionInputWasm[]);
    }
    return candidate as TransactionInput[];
  };

  const coerceViewportRect = (value: StructuredValue): ViewportRect | null => {
    if (!isObject(value)) return null;
    const rect = value as Partial<Record<keyof ViewportRect, StructuredValue>>;
    const top = Number(rect.top);
    const left = Number(rect.left);
    const width = Number(rect.width);
    const height = Number(rect.height);
    if (![top, left, width, height].every((n) => Number.isFinite(n))) return null;
    return { top, left, width, height };
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

  // ===== Generic UI registry mount helpers =====
  const applyProps = (el: UiElement, props: UiProps) => {
    if (!props) return;
    for (const [k, v] of Object.entries(props)) {
      try { (el as Record<string, UiElementProp>)[k] = v; } catch {}
    }
  };

  const runPmAction = async <T extends PmActionName>(
    action: T,
    args: PmActionArgsMap[T]
  ): Promise<PmActionResultMap[T]> => {
    const pm = getTatchiPasskey();
    ensureTatchiPasskey();
    switch (action) {
      case 'signAndSendTransactions': {
        const input = args as SignAndSendArgs;
        const nearAccountId = toTrimmedString(input.nearAccountId);
        const transactions = normalizeTransactions(input.transactions || input.txSigningRequests);
        const options = (input.options || {}) as SignAndSendTransactionHooksOptions;
        const signerModeInput = (options as { signerMode?: SignerMode | SignerMode['mode'] | null }).signerMode;
        const signerMode = coerceSignerMode(signerModeInput, pm?.configs?.signerMode);
        if (!nearAccountId || transactions.length === 0) {
          throw new Error('nearAccountId and transactions required');
        }
        return await pm!.signAndSendTransactions({
          nearAccountId,
          transactions,
          options: { ...options, signerMode }
        });
      }
      default:
        throw new Error(`Unknown pm action: ${action}`);
    }
  };

  const mountUiComponent = (payload?: WalletUiMountPayload) => {
    const key = payload?.key;
    if (!key) {
      console.warn('[ElemMounter:UI] Unknown component key:', key);
      return null;
    }
    const def = uiRegistry[key];
    if (!def || !def.tag) {
      console.warn('[ElemMounter:UI] Unknown component key:', key);
      return null;
    }
    const id = payload?.id || `w3a-ui-${++uidCounter}`;
    // If already mounted with same id, perform an update instead of mounting a duplicate
    if (mountedById.has(id)) {
      updateUiComponent({ id, props: payload?.props || {} });
      return id;
    }
    const el = document.createElement(def.tag) as UiElement;
    el.style.display = 'inline-block';
    const props = { ...(def.propDefaults || {}), ...(payload?.props || {}) } as UiProps;
    applyProps(el, props);

    // Wire event bindings to run pm actions and optionally post results
    if (Array.isArray(def.eventBindings)) {
      for (const b of def.eventBindings) {
        el.addEventListener(b.event, async () => {
          try {
            // Generic bridge for other UI events if needed in the future
            opts.postToParent({ type: 'WALLET_UI_EVENT', payload: { id, key, event: b.event } });

            const args: PmActionArgs = {};
            if (b.argsFromProps) {
              for (const [argName, propKey] of Object.entries(b.argsFromProps)) {
                const propValue = el[propKey];
                if (typeof propValue !== 'function') {
                  args[argName] = propValue;
                }
              }
            }
            const result = await runPmAction(b.action, args);
            if (b.resultMessageType) {
              opts.postToParent({ type: b.resultMessageType, payload: { ok: true, id, result } });
            }
          } catch (err) {
            const type = b.resultMessageType || 'UI_ACTION_RESULT';
            opts.postToParent({ type, payload: { ok: false, id, error: errorMessage(err) } });
          }
        });
      }
    }

    // Wire prop bindings (e.g., externalConfirm)
    if (Array.isArray(def.propBindings)) {
      for (const pb of def.propBindings) {
        el[pb.prop] = async (args: UiActionArgs) => {
          const res = await runPmAction(pb.action, args);
          return res;
        };
      }
    }

    // Bridge common success/cancel props to parent postMessage
    if (def.bridgeProps) {
      const { successProp, cancelProp, messageType } = def.bridgeProps;
      if (successProp) {
        el[successProp] = (result: StructuredValue | PmActionResult) => {
          opts.postToParent({ type: messageType, payload: { ok: true, id, result } });
        };
      }
      if (cancelProp) {
        el[cancelProp] = () => {
          opts.postToParent({ type: messageType, payload: { ok: false, id, cancelled: true } });
        };
      }
    }

    // Optional: viewportRect anchoring → wrap element in fixed-position container
    const propsObj: UiProps = payload?.props || {};
    const rect = coerceViewportRect(propsObj.viewportRect);
    const anchorMode = propsObj.anchorMode === 'iframe' ? 'iframe' : 'viewport';

    const targetSelector = isString(propsObj.targetSelector)
      ? propsObj.targetSelector
      : payload?.targetSelector;
    const root = pickRoot(targetSelector);
    if (rect) {
      const container = document.createElement('div');
      // Mark container and apply anchored geometry via stylesheet
      markContainer(container);
      setContainerAnchored(container, rect, anchorMode === 'iframe' ? 'iframe' : 'viewport');
      container.appendChild(el);
      // Bridge pointer enter/leave to parent so it can manage lifecycle without flicker
      container.addEventListener('pointerenter', () => {
        opts.postToParent({ type: 'WALLET_UI_ANCHOR_ENTER', payload: { id } });
      });
      container.addEventListener('pointerleave', () => {
        opts.postToParent({ type: 'WALLET_UI_ANCHOR_LEAVE', payload: { id } });
      });
      root.appendChild(container);
      mountedById.set(id, container);
      return id;
    }

    root.appendChild(el);
    mountedById.set(id, el);
    return id;
  };

  const updateUiComponent = (payload: WalletUiUpdatePayload) => {
    const node = mountedById.get(payload.id);
    if (!node) return false;
    const props: UiProps = payload?.props || {};

    // If node is a fixed-position container (viewportRect anchoring), update its rect
    const isContainer = ((node as HTMLElement).dataset?.w3aContainer === '1') && (node as HTMLElement).firstElementChild;
    if (isContainer) {
      const container = node as HTMLElement;
      const rect = coerceViewportRect(props.viewportRect);
      const anchorMode = props.anchorMode === 'iframe' ? 'iframe' : 'viewport';
      if (rect) {
        setContainerAnchored(container, rect, anchorMode === 'iframe' ? 'iframe' : 'viewport');
      }
      // Update child element props (mode, label, disabled, etc.)
      const child = container.firstElementChild as UiElement | null;
      if (child) {
        applyProps(child, props);
      }
      return true;
    }

    // Otherwise node is the custom element itself
    const el = node as UiElement;
    applyProps(el, props);
    return true;
  };

  const unmountUiComponent = (payload: WalletUiUnmountPayload) => {
    const el = mountedById.get(payload.id);
    if (!el) return false;
    el.remove();
    mountedById.delete(payload.id);
    return true;
  };

  const messageHandlers: { [K in WalletUiInboundType]: (payload: WalletUiInboundPayloadMap[K] | undefined) => void } = {
    WALLET_SET_CONFIG: (payload) => {
      updateWalletConfigs(payload || {});
      // uiRegistry is no longer read from configs; register via WALLET_UI_REGISTER_TYPES or PM_SET_CONFIG
    },
    WALLET_UI_REGISTER_TYPES: (payload) => {
      if (payload && isObject(payload)) {
        uiRegistry = { ...uiRegistry, ...payload };
      }
    },
    WALLET_UI_MOUNT: (payload) => {
      mountUiComponent(payload);
    },
    WALLET_UI_UPDATE: (payload) => {
      if (payload) updateUiComponent(payload);
    },
    WALLET_UI_UNMOUNT: (payload) => {
      if (payload) unmountUiComponent(payload);
    },
  };

  window.addEventListener('message', (evt: MessageEvent<WalletUiInboundMessage>) => {
    const data = evt?.data;
    if (!data || !isObject(data) || !('type' in data)) return;
    const message = data as WalletUiInboundMessage;
    switch (message.type) {
      case 'WALLET_SET_CONFIG':
        messageHandlers.WALLET_SET_CONFIG(message.payload);
        break;
      case 'WALLET_UI_REGISTER_TYPES':
        messageHandlers.WALLET_UI_REGISTER_TYPES(message.payload);
        break;
      case 'WALLET_UI_MOUNT':
        messageHandlers.WALLET_UI_MOUNT(message.payload);
        break;
      case 'WALLET_UI_UPDATE':
        messageHandlers.WALLET_UI_UPDATE(message.payload);
        break;
      case 'WALLET_UI_UNMOUNT':
        messageHandlers.WALLET_UI_UNMOUNT(message.payload);
        break;
      default:
        break;
    }
  });
}
