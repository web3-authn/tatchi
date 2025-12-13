import { useEffect } from 'react';

/**
 * useWalletIframeZIndex
 *
 * Central place to manage the wallet iframe overlay z-index for React apps.
 *
 * Layering model (high level):
 * - Wallet iframe overlay (host surface):
 *   - CSS: `overlay-styles.ts`, `overlay.css`
 *   - Uses `z-index: var(--w3a-wallet-overlay-z, 2147483646)`
 *   - Hosts tx confirmer and other wallet UI; should sit above normal app UI.
 *
 * - Tx confirmer inside iframe:
 *   - CSS: `core/WebAuthnManager/LitComponents/css/tx-confirmer.css`
 *   - Uses z-indices above the iframe itself (2147483647–2147483648).
 *
 * - Linked Devices modal:
 *   - CSS: `AccountMenuButton/LinkedDevicesModal.css`
 *   - Backdrop: `z-index: calc(--w3a-wallet-overlay-z - 2)`
 *   - Inner content: `z-index: calc(--w3a-wallet-overlay-z - 1)`
 *   - Intentionally below the wallet overlay so the tx confirmer always wins.
 *
 * - Device Linking QR scanner modal:
 *   - CSS: `react/components/QRCodeScanner.css`
 *   - Backdrop/container: `z-index: calc(--w3a-wallet-overlay-z - 2)`
 *
 * - AccountMenuButton / PasskeyAuthMenu:
 *   - Uses only small local z-indices (1–3) and no fullscreen overlay z-index,
 *     so it naturally stays below the wallet overlay.
 *
 * Hook behavior:
 * - When `overlayZIndex` is a positive, finite number, sets
 *   `document.documentElement.style.setProperty('--w3a-wallet-overlay-z', String(overlayZIndex))`.
 * - When `overlayZIndex` is null/undefined, non-finite, or <= 0, removes the property so the
 *   SDK default value (2147483646) and static CSS continue to apply.
 */
export function useWalletIframeZIndex(overlayZIndex?: number | null): void {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const root = document.documentElement;

    if (overlayZIndex == null || !Number.isFinite(overlayZIndex) || overlayZIndex <= 0) {
      try { root.style.removeProperty('--w3a-wallet-overlay-z'); } catch {}
      return;
    }

    try {
      root.style.setProperty('--w3a-wallet-overlay-z', String(overlayZIndex));
    } catch {}
  }, [overlayZIndex]);
}

export default useWalletIframeZIndex;
