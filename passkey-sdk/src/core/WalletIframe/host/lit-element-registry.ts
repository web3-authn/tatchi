// Wallet UI Element Registry
//
// Purpose:
// - Provides a small, declarative registry that describes mountable Lit-based UI
//   components available inside the wallet iframe host.
// - Each entry declares the custom element tag plus optional event/prop bindings
//   that the host can use to wire UI interactions to PasskeyManager actions.
//
// How it is used:
// - The wallet host (see lit-elem-mounter.ts) imports this registry and uses it
//   to create elements on demand when it receives window.postMessage requests
//   from the parent application.
// - Event bindings map DOM events (e.g., a button click) to high-level actions
//   such as `signAndSendTransactions`. Prop bindings allow passing functions or
//   values from the host into the element instance.
// - The registry is intentionally small and typed so we can safely expand it
//   over time without coupling the host to any specific UI implementation.
//
// Notes:
// - Tags are centralized in `WebAuthnManager/LitComponents/tags.ts`; prefer
//   importing constants from there instead of using string literals.
// - This module only describes components; mounting/unmounting and runtime
//   wiring happen in `lit-elem-mounter.ts`.

import { W3A_TX_BUTTON_HOST_ID, W3A_TX_BUTTON_ID } from '../../WebAuthnManager/LitComponents/tags';

export type PmActionName =
  | 'registerPasskey'
  | 'signAndSendTransactions';

export type UIEventBinding = {
  event: string; // e.g. 'w3a-register-click'
  action: PmActionName;
  // Map action args from element props (e.g., { nearAccountId: 'nearAccountId' })
  argsFromProps?: Record<string, string>;
  // Post message to parent when resolved
  resultMessageType?: string;
};

export type UIPropBinding = {
  prop: string; // e.g. 'externalConfirm'
  action: PmActionName;
};

export type UIBridgeProps = {
  successProp?: string; // e.g. 'onSuccess'
  cancelProp?: string;  // e.g. 'onCancel'
  messageType: string;  // e.g. 'TX_BUTTON_RESULT'
};

export type UIComponentDef = {
  tag: string; // custom element tag
  propDefaults?: Record<string, unknown>;
  eventBindings?: UIEventBinding[];
  propBindings?: UIPropBinding[];
  bridgeProps?: UIBridgeProps;
};

export type WalletUIRegistry = Record<string, UIComponentDef>;

// Built-in components available out of the box inside the wallet host.
export const uiBuiltinRegistry: WalletUIRegistry = {
  // Preferred keys/tags
  'w3a-tx-button-host': {
    tag: W3A_TX_BUTTON_HOST_ID,
    propBindings: [
      { prop: 'externalConfirm', action: 'signAndSendTransactions' },
    ],
    bridgeProps: {
      successProp: 'onSuccess',
      cancelProp: 'onCancel',
      messageType: 'TX_BUTTON_RESULT'
    }
  },
  'w3a-tx-button': {
    tag: W3A_TX_BUTTON_ID,
    propBindings: [
      { prop: 'externalConfirm', action: 'signAndSendTransactions' },
    ],
    bridgeProps: {
      successProp: 'onSuccess',
      cancelProp: 'onCancel',
      messageType: 'TX_BUTTON_RESULT'
    }
  },

  // Back-compat alias keys mapping to preferred ones
  'tx-host': { tag: W3A_TX_BUTTON_HOST_ID },
  'tx-button': { tag: W3A_TX_BUTTON_ID },
};
