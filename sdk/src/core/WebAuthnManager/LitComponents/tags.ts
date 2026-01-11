// Lit component tag names
// These are rendered as web components:
// e.g. <w3a-modal-tx-confirmer></w3a-modal-tx-confirmer>, <w3a-tx-tree>, etc;

// Transaction confirmer element tags (host-rendered)
// Canonical tag names use the "-tx-confirmer" suffix for consistency
export const W3A_TX_CONFIRMER_ID = 'w3a-tx-confirmer';
export const W3A_MODAL_TX_CONFIRMER_ID = 'w3a-modal-tx-confirmer';
export const W3A_DRAWER_TX_CONFIRMER_ID = 'w3a-drawer-tx-confirmer';
export const W3A_TX_CONFIRM_CONTENT_ID = 'w3a-tx-confirm-content';

// Shared building blocks
export const W3A_DRAWER_ID = 'w3a-drawer';
export const W3A_TX_TREE_ID = 'w3a-tx-tree';
export const W3A_HALO_BORDER_ID = 'w3a-halo-border';
export const W3A_PASSKEY_HALO_LOADING_ID = 'w3a-passkey-halo-loading';

// Unified list of confirmer hosts the wallet may need to target for lifecycle events
export const CONFIRM_UI_ELEMENT_SELECTORS = [
  W3A_TX_CONFIRMER_ID,
  W3A_MODAL_TX_CONFIRMER_ID,
  W3A_DRAWER_TX_CONFIRMER_ID,
] as const;

// Dedicated portal container to enforce a single confirmer instance
export const W3A_CONFIRM_PORTAL_ID = 'w3a-confirm-portal';

// Export viewer iframe host + bootstrap + viewer bundle
export const W3A_EXPORT_VIEWER_IFRAME_ID = 'w3a-export-viewer-iframe';
export const W3A_EXPORT_KEY_VIEWER_ID = 'w3a-export-key-viewer';
export const IFRAME_EXPORT_BOOTSTRAP_MODULE = 'iframe-export-bootstrap.js';
export const EXPORT_VIEWER_BUNDLE = 'export-private-key-viewer.js';
export const EXPORT_DRAWER_BUNDLE = 'export-private-key-drawer.js';
