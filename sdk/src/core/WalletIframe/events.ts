// Shared event name constants for Wallet iframe DOM interactions
// These are re-used across the iframe host, Lit components, and tests.

export const WalletIframeDomEvents = {
  TX_CONFIRMER_CONFIRM: 'w3a:tx-confirmer-confirm',
  TX_CONFIRMER_CANCEL: 'w3a:tx-confirmer-cancel',
} as const;

export type WalletIframeDomEvent = (typeof WalletIframeDomEvents)[keyof typeof WalletIframeDomEvents];
