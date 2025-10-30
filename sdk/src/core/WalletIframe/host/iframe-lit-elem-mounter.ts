
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
 * - Uses iframe-lit-element-registry.ts for component definitions
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
// Import arrow register button so it's defined and not tree-shaken in wallet origin
import { PasskeyManagerIframe } from '../PasskeyManagerIframe';
import { PasskeyManager } from '../../PasskeyManager';
import { SignAndSendTransactionHooksOptions } from '../../types/passkeyManager';
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

try { defineTag('txButton', __IframeButtonKeep as unknown as CustomElementConstructor); } catch {}

export type EnsurePasskeyManager = () => void;
export type GetPasskeyManager = () => PasskeyManager | PasskeyManagerIframe | null; // Avoid tight coupling to class type
export type UpdateWalletConfigs = (patch: Record<string, unknown>) => void;

export function setupLitElemMounter(opts: {
  ensurePasskeyManager: EnsurePasskeyManager;
  getPasskeyManager: GetPasskeyManager;
  updateWalletConfigs: UpdateWalletConfigs;
  postToParent: (message: unknown) => void;
}) {
  // Message API: register-button overlay deprecated – only tx button APIs remain
  const { ensurePasskeyManager, getPasskeyManager, updateWalletConfigs } = opts;

  // Generic registry for mountable components
  let uiRegistry: WalletUIRegistry = { ...uiBuiltinRegistry };
  const mountedById = new Map<string, HTMLElement>();
  let uidCounter = 0;

  // Ensure global host styles via stylesheet (no inline style attributes)
  try { ensureHostBaseStyles(); } catch {}

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
    const pm = getPasskeyManager();
    ensurePasskeyManager();
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
      try { updateUiComponent({ id, props: payload?.props || {} }); } catch {}
      return id;
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
              // Generic bridge for other UI events if needed in the future
              try { opts.postToParent({ type: 'WALLET_UI_EVENT', payload: { id, key, event: b.event } }); } catch {}

              const args: Record<string, unknown> = {};
              if (b.argsFromProps) {
                for (const [argName, propKey] of Object.entries(b.argsFromProps)) {
                  args[argName] = (el as unknown as Record<string, unknown>)[propKey];
                }
              }
              const result = await runPmAction(b.action, args);
              if (b.resultMessageType) {
                try { opts.postToParent({ type: b.resultMessageType, payload: { ok: true, id, result } }); } catch {}
              }
            } catch (err: unknown) {
              const type = b.resultMessageType || 'UI_ACTION_RESULT';
              try { opts.postToParent({ type, payload: { ok: false, id, error: errorMessage(err) } }); } catch {}
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
        try { (el as unknown as Record<string, unknown>)[successProp] = (result: unknown) => { try { opts.postToParent({ type: messageType, payload: { ok: true, id, result } }); } catch {} }; } catch {}
      }
      if (cancelProp) {
        try { (el as unknown as Record<string, unknown>)[cancelProp] = () => { try { opts.postToParent({ type: messageType, payload: { ok: false, id, cancelled: true } }); } catch {} }; } catch {}
      }
    }

    // Optional: viewportRect anchoring → wrap element in fixed-position container
    const propsObj = (payload?.props || {}) as Record<string, unknown>;
    const vr = propsObj.viewportRect as { top?: unknown; left?: unknown; width?: unknown; height?: unknown } | undefined;
    const anchorMode = String((propsObj as { anchorMode?: unknown })?.anchorMode || 'viewport');

    const root = pickRoot((payload?.props as unknown as { targetSelector?: string })?.targetSelector || (payload as { targetSelector?: string } | undefined)?.targetSelector);
    if (vr && typeof vr === 'object') {
      const top = Number((vr as any).top);
      const left = Number((vr as any).left);
      const width = Number((vr as any).width);
      const height = Number((vr as any).height);
      if ([top, left, width, height].every((n) => Number.isFinite(n))) {
        const container = document.createElement('div');
        // Mark container and apply anchored geometry via stylesheet
        try { markContainer(container); } catch {}
        try { setContainerAnchored(container, { top, left, width, height }, anchorMode === 'iframe' ? 'iframe' : 'viewport'); } catch {}
        container.appendChild(el);
        // Bridge pointer enter/leave to parent so it can manage lifecycle without flicker
        try {
          container.addEventListener('pointerenter', () => {
            try { opts.postToParent({ type: 'WALLET_UI_ANCHOR_ENTER', payload: { id } }); } catch {}
          });
          container.addEventListener('pointerleave', () => {
            try { opts.postToParent({ type: 'WALLET_UI_ANCHOR_LEAVE', payload: { id } }); } catch {}
          });
        } catch {}
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
        const top = Number((vr as any).top);
        const left = Number((vr as any).left);
        const width = Number((vr as any).width);
        const height = Number((vr as any).height);
        if ([top, left, width, height].every((n) => Number.isFinite(n))) {
          try { setContainerAnchored(container, { top, left, width, height }, anchorMode === 'iframe' ? 'iframe' : 'viewport'); } catch {}
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
    try { el.remove(); } catch {}
    mountedById.delete(payload.id);
    return true;
  };

  const messageHandlers: Record<string, (payload: unknown) => void> = {
    WALLET_SET_CONFIG: (payload) => {
      const data = payload as Record<string, unknown>;
      try { updateWalletConfigs(data); } catch {}
      // uiRegistry is no longer read from configs; register via WALLET_UI_REGISTER_TYPES or PM_SET_CONFIG
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
