/**
 * WalletIframe - Entry Point Layer
 *
 * This is the main entry point for the WalletIframe system. It exports all the
 * public APIs and types that developers need to use the iframe-based wallet.
 *
 * Key Exports:
 * - TatchiPasskeyIframe: Main API class for developers
 * - WalletIframeRouter: Communication layer (for advanced use cases)
 * - Message types: For custom message handling
 * - Environment utilities: For configuration
 * - Sanitization utilities: For security
 *
 * Note: wallet-iframe-host is intentionally NOT exported here as it's meant
 * to be bundled separately into the wallet origin page, not the parent SDK.
 */

export * from './shared/messages';
export * from './client/router';
export * from './client/env';
export * from './sanitization';
// Note: wallet-iframe-host is intended to be bundled into the wallet origin page.
// It should not be imported by the parent SDK bundle.
export { TatchiPasskeyIframe } from './TatchiPasskeyIframe';
