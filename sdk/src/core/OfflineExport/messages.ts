export const OFFLINE_EXPORT_DONE = 'OFFLINE_EXPORT_DONE';
export const OFFLINE_EXPORT_ERROR = 'OFFLINE_EXPORT_ERROR';

// Posted by wallet host to request parent fallback to the offline route
export const OFFLINE_EXPORT_FALLBACK = 'OFFLINE_EXPORT_FALLBACK';

// Reused wallet-iframe close notification
export const WALLET_UI_CLOSED = 'WALLET_UI_CLOSED';

// Export UI: user explicitly cancelled TouchID/FaceID during key export
export const EXPORT_NEAR_KEYPAIR_CANCELLED = 'EXPORT_NEAR_KEYPAIR_CANCELLED';

export type OfflineExportDoneMsg = { type: typeof OFFLINE_EXPORT_DONE; nearAccountId: string };
export type OfflineExportErrorMsg = { type: typeof OFFLINE_EXPORT_ERROR; error: string };
export type WalletUiClosedMsg = { type: typeof WALLET_UI_CLOSED };

// No inbound handshake is required in the new-tab flow
export type OfflineExportInboundMsg = never;
export type OfflineExportOutboundMsg =
  | OfflineExportDoneMsg
  | OfflineExportErrorMsg
  | WalletUiClosedMsg;
