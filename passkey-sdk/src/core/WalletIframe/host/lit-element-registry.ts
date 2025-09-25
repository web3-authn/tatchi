/**
 * Lit Element Registry - Host-Side Execution Layer
 *
 * This module provides a declarative registry of UI components that can be mounted
 * inside the wallet iframe. It defines the available components and how they should
 * be wired to PasskeyManager actions.
 *
 * Key Responsibilities:
 * - Component Definitions: Declares available Lit-based UI components
 * - Event Bindings: Maps DOM events to PasskeyManager actions
 * - Prop Bindings: Defines how to pass functions/props to components
 * - Bridge Configuration: Specifies how to bridge results back to parent
 * - Type Safety: Provides typed definitions for all component interactions
 *
 * Architecture:
 * - Uses declarative configuration instead of imperative code
 * - Separates component definition from mounting logic
 * - Provides extensible registry for custom components
 * - Maintains type safety across component boundaries
 *
 * Component Types:
 * - UIEventBinding: Maps DOM events to PasskeyManager actions
 * - UIPropBinding: Maps component props to PasskeyManager methods
 * - UIBridgeProps: Defines how to bridge results back to parent
 * - UIComponentDef: Complete component definition with all bindings
 *
 * Built-in Components:
 * - w3a-tx-button-host: Transaction button with host wrapper
 * - w3a-tx-button: Direct transaction button
 * - Backward compatibility aliases for existing component names
 *
 * Extension Points:
 * - New components can be added to the registry
 * - Custom event/prop bindings can be defined
 * - Parent applications can register additional component types
 *
 * Security Considerations:
 * - All component definitions are validated before use
 * - Event handlers are properly bound to PasskeyManager methods
 * - No arbitrary code execution is allowed in component definitions
 */

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
