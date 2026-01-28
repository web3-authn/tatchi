import type { TatchiConfigsInput } from '../../types/tatchi';

/**
 * Wallet-iframe host guardrails
 *
 * The wallet service iframe runs the "real" TatchiPasskey instance. It must never
 * attempt to initialize a nested wallet iframe client, even if consumer defaults
 * enable `iframeWallet`.
 *
 * These helpers intentionally live in the wallet-iframe host layer (not in
 * default config merging) to prevent host-specific invariants from leaking into
 * generic config code.
 */

export function sanitizeWalletHostConfigs(input: TatchiConfigsInput): TatchiConfigsInput {
  const incoming = input.iframeWallet || {};
  const incomingWalletOrigin = incoming.walletOrigin;
  const incomingServicePath = (incoming as { walletServicePath?: unknown }).walletServicePath as string | undefined;
  const incomingExtensionOrigin = (incoming as { extensionWalletOrigin?: unknown }).extensionWalletOrigin as string | undefined;
  const incomingExtensionServicePath = (incoming as { extensionWalletServicePath?: unknown }).extensionWalletServicePath as string | undefined;

  if (incomingWalletOrigin) {
    console.warn(
      '[WalletIframeHost] Ignoring iframeWallet.walletOrigin inside wallet host (nested iframe clients are not supported).',
      incomingWalletOrigin,
    );
  }
  if (incomingServicePath) {
    console.warn(
      '[WalletIframeHost] Ignoring iframeWallet.walletServicePath inside wallet host (nested iframe clients are not supported).',
      incomingServicePath,
    );
  }
  if (incomingExtensionOrigin) {
    console.warn(
      '[WalletIframeHost] Ignoring iframeWallet.extensionWalletOrigin inside wallet host (nested iframe clients are not supported).',
      incomingExtensionOrigin,
    );
  }
  if (incomingExtensionServicePath) {
    console.warn(
      '[WalletIframeHost] Ignoring iframeWallet.extensionWalletServicePath inside wallet host (nested iframe clients are not supported).',
      incomingExtensionServicePath,
    );
  }

  // Use empty strings (not undefined) so any config-merging using `??` cannot
  // fall back to a default wallet origin/service path.
  return {
    ...input,
    iframeWallet: {
      ...incoming,
      walletOrigin: '',
      walletServicePath: '',
      extensionWalletOrigin: '',
      extensionWalletServicePath: '',
    },
  };
}

export function assertWalletHostConfigsNoNestedIframeWallet(configs: TatchiConfigsInput): void {
  const webOrigin = configs.iframeWallet?.walletOrigin;
  const extensionOrigin = configs.iframeWallet?.extensionWalletOrigin;
  if (webOrigin || extensionOrigin) {
    throw new Error(
      `[WalletIframeHost] Invariant violated: iframeWallet wallet origins must be empty in wallet host mode (got walletOrigin="${webOrigin || ''}", extensionWalletOrigin="${extensionOrigin || ''}").`
    );
  }
}
