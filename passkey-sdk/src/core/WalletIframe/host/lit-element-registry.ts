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
import { W3A_TX_BUTTON_HOST_ID, W3A_TX_BUTTON_ID } from '../../WebAuthnManager/LitComponents/tags';
