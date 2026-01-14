// Internal process-wide flag to mark wallet iframe host mode
let IS_WALLET_IFRAME_HOST = false;

export function __setWalletIframeHostMode(enabled: boolean = true): void {
  IS_WALLET_IFRAME_HOST = !!enabled;
}

export function __isWalletIframeHostMode(): boolean {
  // Test-only escape hatch: allow Playwright/unit tests to force host-mode behavior
  // without importing internal host bootstrap modules (which may be tree-shaken from dist/esm).
  try {
    const forced = (globalThis as any)?.__W3A_TEST_WALLET_IFRAME_HOST_MODE__;
    if (typeof forced === 'boolean') return forced;
  } catch { }
  return IS_WALLET_IFRAME_HOST;
}
