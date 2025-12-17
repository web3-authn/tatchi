
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
 * - Uses iframe-lit-element-registry.ts for component definitions
 * - Maintains mounted component instances by ID
 * - Provides typed prop/event bindings for TatchiPasskey actions
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
 * - Event handlers are properly bound to TatchiPasskey methods
 * - No functions are transferred across the iframe boundary
 */

// Import and retain a reference to ensure bundlers don’t treeshake the element
// Import iframe tooltip confirmer button and keep reference
import { IframeButtonHost as __IframeButtonKeep } from '../../WebAuthnManager/LitComponents/IframeButtonWithTooltipConfirmer/iframe-host';
// Import arrow register button so it's defined and not tree-shaken in wallet origin
import { TatchiPasskeyIframe } from '../TatchiPasskeyIframe';
import { TatchiPasskey } from '../../TatchiPasskey';
import type { SignAndSendTransactionHooksOptions } from '../../types/sdkSentEvents';
import { BaseSSEEvent, TransactionInput, TransactionInputWasm } from '../../types';
import { uiBuiltinRegistry, type WalletUIRegistry } from './iframe-lit-element-registry';
import { errorMessage } from '../../../utils/errors';
import { isObject, isString } from '../validation';
import { defineTag } from '../../WebAuthnManager/LitComponents/tags';
// Keep essential custom elements from being tree-shaken
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const __ensureTreeDefinition = [__IframeButtonKeep];
// Define the element defensively in case the side-effect define was optimized away

// Wallet host lit wrappers (no nested wallet iframe)
import './WalletHostElements';
import { ensureHostBaseStyles, markContainer, setContainerAnchored } from './mounter-styles';

defineTag('txButton', __IframeButtonKeep as unknown as CustomElementConstructor);

export type EnsureTatchiPasskey = () => void;
export type GetPasskeyManager = () => TatchiPasskey | TatchiPasskeyIframe | null; // Avoid tight coupling to class type
export type UpdateWalletConfigs = (patch: Record<string, unknown>) => void;

export function setupLitElemMounter(opts: {
  ensureTatchiPasskey: EnsureTatchiPasskey;
  getTatchiPasskey: GetPasskeyManager;
  updateWalletConfigs: UpdateWalletConfigs;
  postToParent: (message: unknown) => void;
}) {
  const { ensureTatchiPasskey, getTatchiPasskey, updateWalletConfigs } = opts;

  // Generic registry for mountable components
  let uiRegistry: WalletUIRegistry = { ...uiBuiltinRegistry };
  const mountedById = new Map<string, HTMLElement>();
  let uidCounter = 0;

  // Ensure global host styles via stylesheet (no inline style attributes)
  ensureHostBaseStyles();

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
  const applyProps = (el: HTMLElement & Record<string, unknown>, props: Record<string, unknown>) => {
    if (!props) return;
    for (const [k, v] of Object.entries(props)) {
      try { (el as unknown as Record<string, unknown>)[k] = v as unknown; } catch {}
    }
  };

  const runPmAction = async (action: string, args: Record<string, unknown>): Promise<unknown> => {
    const pm = getTatchiPasskey();
    ensureTatchiPasskey();
    switch (action) {
      case 'signAndSendTransactions': {
        const nearAccountId = String((args as { nearAccountId?: unknown })?.nearAccountId || '').trim();
        const txsCandidate = (args as { transactions?: unknown; txSigningRequests?: unknown });
        const transactions: TransactionInput[] = Array.isArray(txsCandidate?.transactions || txsCandidate?.txSigningRequests)
          ? (txsCandidate?.transactions || txsCandidate?.txSigningRequests) as TransactionInput[]
          : [];
        const options = (args as { options?: SignAndSendTransactionHooksOptions })?.options || {};
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
    const id = payload?.id || `w3a-ui-${++uidCounter}`;
    // If already mounted with same id, perform an update instead of mounting a duplicate
    if (mountedById.has(id)) {
      updateUiComponent({ id, props: payload?.props || {} });
      return id;
    }
    const el = document.createElement(def.tag) as HTMLElement & Record<string, unknown>;
    el.style.display = 'inline-block';
    const props = { ...(def.propDefaults || {}), ...(payload?.props || {}) } as Record<string, unknown>;
    applyProps(el, props);

    // Wire event bindings to run pm actions and optionally post results
    if (Array.isArray(def.eventBindings)) {
      for (const b of def.eventBindings) {
        el.addEventListener(b.event, async () => {
          try {
            // Generic bridge for other UI events if needed in the future
            opts.postToParent({ type: 'WALLET_UI_EVENT', payload: { id, key, event: b.event } });

            const args: Record<string, unknown> = {};
            if (b.argsFromProps) {
              for (const [argName, propKey] of Object.entries(b.argsFromProps)) {
                args[argName] = (el as unknown as Record<string, unknown>)[propKey];
              }
            }
            const result = await runPmAction(b.action, args);
            if (b.resultMessageType) {
              opts.postToParent({ type: b.resultMessageType, payload: { ok: true, id, result } });
            }
          } catch (err: unknown) {
            const type = b.resultMessageType || 'UI_ACTION_RESULT';
            opts.postToParent({ type, payload: { ok: false, id, error: errorMessage(err) } });
          }
        });
      }
    }

    // Wire prop bindings (e.g., externalConfirm)
    if (Array.isArray(def.propBindings)) {
      for (const pb of def.propBindings) {
        (el as unknown as Record<string, unknown>)[pb.prop] = async (args: Record<string, unknown>) => {
          const res = await runPmAction(pb.action, args);
          return res;
        };
      }
    }

    // Bridge common success/cancel props to parent postMessage
    if (def.bridgeProps) {
      const { successProp, cancelProp, messageType } = def.bridgeProps;
      if (successProp) {
        (el as unknown as Record<string, unknown>)[successProp] = (result: unknown) => {
          opts.postToParent({ type: messageType, payload: { ok: true, id, result } });
        };
      }
      if (cancelProp) {
        (el as unknown as Record<string, unknown>)[cancelProp] = () => {
          opts.postToParent({ type: messageType, payload: { ok: false, id, cancelled: true } });
        };
      }
    }

    // Optional: viewportRect anchoring → wrap element in fixed-position container
    const propsObj = (payload?.props || {}) as Record<string, unknown>;
    const vr = propsObj.viewportRect as { top?: unknown; left?: unknown; width?: unknown; height?: unknown } | undefined;
    const anchorMode = String((propsObj as { anchorMode?: unknown })?.anchorMode || 'viewport');

    const root = pickRoot((payload?.props as unknown as { targetSelector?: string })?.targetSelector || (payload as { targetSelector?: string } | undefined)?.targetSelector);
    if (vr && typeof vr === 'object') {
      const top = Number(vr.top);
      const left = Number(vr.left);
      const width = Number(vr.width);
      const height = Number(vr.height);
      if ([top, left, width, height].every((n) => Number.isFinite(n))) {
        const container = document.createElement('div');
        // Mark container and apply anchored geometry via stylesheet
        markContainer(container);
        setContainerAnchored(container, { top, left, width, height }, anchorMode === 'iframe' ? 'iframe' : 'viewport');
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
    }

    root.appendChild(el);
    mountedById.set(id, el);
    return id;
  };

  const updateUiComponent = (payload: { id: string; props?: Record<string, unknown> }) => {
    const node = mountedById.get(payload.id);
    if (!node) return false;
    const props = (payload?.props || {}) as Record<string, unknown>;

    // If node is a fixed-position container (viewportRect anchoring), update its rect
    const isContainer = ((node as HTMLElement).dataset?.w3aContainer === '1') && (node as HTMLElement).firstElementChild;
    if (isContainer) {
      const container = node as HTMLElement;
      const vr = props.viewportRect as { top?: unknown; left?: unknown; width?: unknown; height?: unknown } | undefined;
      const anchorMode = String((props as { anchorMode?: unknown })?.anchorMode || 'viewport');
      if (vr && typeof vr === 'object') {
        const top = Number(vr.top);
        const left = Number(vr.left);
        const width = Number(vr.width);
        const height = Number(vr.height);
        if ([top, left, width, height].every((n) => Number.isFinite(n))) {
          setContainerAnchored(container, { top, left, width, height }, anchorMode === 'iframe' ? 'iframe' : 'viewport');
        }
      }
      // Update child element props (mode, label, disabled, etc.)
      const child = container.firstElementChild as (HTMLElement & Record<string, unknown>) | null;
      if (child) {
        applyProps(child as any, props);
      }
      return true;
    }

    // Otherwise node is the custom element itself
    const el = node as (HTMLElement & Record<string, unknown>);
    applyProps(el, props);
    return true;
  };

  const unmountUiComponent = (payload: { id: string }) => {
    const el = mountedById.get(payload.id);
    if (!el) return false;
    el.remove();
    mountedById.delete(payload.id);
    return true;
  };

  const messageHandlers: Record<string, (payload: unknown) => void> = {
    WALLET_SET_CONFIG: (payload) => {
      const data = payload as Record<string, unknown>;
      updateWalletConfigs(data);
      // uiRegistry is no longer read from configs; register via WALLET_UI_REGISTER_TYPES or PM_SET_CONFIG
    },
    WALLET_UI_REGISTER_TYPES: (payload) => {
      if (isObject(payload)) {
        uiRegistry = { ...uiRegistry, ...(payload as WalletUIRegistry) };
      }
    },
    WALLET_UI_MOUNT: (payload) => {
      mountUiComponent(payload as { key: string });
    },
    WALLET_UI_UPDATE: (payload) => {
      updateUiComponent(payload as { id: string; props?: Record<string, unknown> });
    },
    WALLET_UI_UNMOUNT: (payload) => {
      unmountUiComponent(payload as { id: string });
    },
  };

  window.addEventListener('message', (evt: MessageEvent) => {
    const type = evt?.data?.type;
    if (!type) return;
    const handler = messageHandlers[type as keyof typeof messageHandlers];
    if (!handler) return;
    handler(evt?.data?.payload ?? evt?.data ?? {});
  });
}
