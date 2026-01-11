/**
 * Iframe Lit Element Registry - Host-Side Execution Layer
 *
 * This module provides a declarative registry of UI components that can be mounted
 * inside the wallet iframe. It defines the available components and how they should
 * be wired to TatchiPasskey actions.
 */

export type PmActionName =
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
export const uiBuiltinRegistry: WalletUIRegistry = {};
