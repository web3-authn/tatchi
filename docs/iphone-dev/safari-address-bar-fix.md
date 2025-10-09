Safari iOS address bar/clipping fix – progress log

Problem

- iOS Safari 16+ (incl. iOS 18/Safari 26) clips `position: fixed` to the inner/visual viewport. Backdrops stop at the Safari UI bars, so a seam appears above/below modals and drawers.

What we tried (chronological)

- Absolute backdrops inside Lit components
  - Files: `IframeTxConfirmer/viewer-modal.ts`, `LitComponents/Drawer/index.ts`
  - Switched modal/drawer backdrops to `position: absolute` with page sizing and added a sticky wrapper to keep content in view.
  - Result: improves sizing inside their own documents, but does not fix the seam when the overlayed wallet-iframe itself is clipped to the visual viewport.

- Page height CSS var (`--w3a-page-height`) + visualViewport listeners
  - Files: modal/drawer components and hosts set `--w3a-page-height` from `document.body.clientHeight` and update on `resize/orientationchange/scroll/visualViewport.resize`.
  - Result: reliable page-height within each document, but not sufficient alone when the parent overlay is still fixed to the inner viewport.

- Iframe modal host outer shims
  - File: `IframeTxConfirmer/tx-confirmer-wrapper.ts`
  - Added page-anchored top/bottom overlays sized from `visualViewport` offsets to tint under the bars (above the iframe).
  - Result: seam still visible in device testing.

- Wallet overlay absolute (page-anchored)
  - File: `WalletIframe/client/overlay-controller.ts`
  - Attempted switching wallet overlay from fixed → absolute to cover under bars.
  - Result: regression — overlay anchored to document; when page was scrolled, the overlay was no longer in view.

- Drawer body-portal overlay (page-anchored)
  - File: `LitComponents/Drawer/index.ts`
  - Added a body-level overlay (portal) sized to page height, updated with `visualViewport` metrics; anchors `html/body` while drawer is open.
  - Result: seam still visible in device testing.

Current status

- Bug is not resolved. On iOS 26, we still see the backdrop stopping at (or mismatching) the Safari address bars for both modal and drawer.

Next steps (concrete)

- Instrumentation build:
  - Log and visually render `vv.offsetTop`, `vv.height`, computed `vvBottom`, `pageHeight`, and the active overlay z-indexes to confirm where mismatch occurs on-device.
- Unify overlay tokens:
  - Use a shared CSS variable (e.g., `--w3a-overlay-dim`) for dim color across host outer shims and iframe backdrops to remove subtle seams.
- Single host overlay strategy:
  - Prefer a single page-anchored overlay at the app host level (above the fixed wallet iframe) sized: `height = max(scrollHeight, vv.height + top + bottom)`, pointer-events: none. Let the iframe render only content, not another dim layer.
- If accuracy still fails:
  - Compute host overlay height from `max(documentElement.scrollHeight, body.scrollHeight, documentElement.clientHeight, visualViewport.height + offsets)` on every `visualViewport` and `resize` event.

References
- https://github.com/mui/base-ui/issues/2799
- https://github.com/mui/material-ui/issues/46953
- https://x.com/devongovett/status/1968384768703349198
