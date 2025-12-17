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

  // Use empty strings (not undefined) so any config-merging using `??` cannot
  // fall back to a default wallet origin/service path.
  return {
    ...input,
    iframeWallet: {
      ...incoming,
      walletOrigin: '',
      walletServicePath: '',
    },
  };
}

export function assertWalletHostConfigsNoNestedIframeWallet(configs: TatchiConfigsInput): void {
  const walletOrigin = configs.iframeWallet?.walletOrigin;
  if (walletOrigin) {
    throw new Error(
      `[WalletIframeHost] Invariant violated: iframeWallet.walletOrigin must be empty in wallet host mode (got "${walletOrigin}").`
    );
  }
}

