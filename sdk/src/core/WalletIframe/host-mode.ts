// Internal process-wide flag to mark wallet iframe host mode
let IS_WALLET_IFRAME_HOST = false;

export function __setWalletIframeHostMode(enabled: boolean = true): void {
  IS_WALLET_IFRAME_HOST = !!enabled;
}

export function __isWalletIframeHostMode(): boolean {
  return IS_WALLET_IFRAME_HOST;
}

