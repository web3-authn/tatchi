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
  - File: `IframeTxConfirmer/iframe-host.ts`
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

---

## Analysis (2025-10-07)

### Root Cause

On iOS Safari 16+ (including iOS 18/Safari 26):
1. **`position: fixed` clips to the visual viewport** - excludes the Safari UI bars (address bar, toolbar)
2. **The wallet iframe compounds the problem** - The iframe itself may be clipped, and then the modal/drawer inside has its own clipping
3. **Layout vs Visual viewport mismatch** - The visual viewport shrinks when Safari's chrome is visible, but `position: fixed` elements don't extend beyond it

### Key Insights from MUI Issues

**From Base-UI #2799:**
- Solution: Use `position: absolute` with `height: var(--body-client-height)`
- The CSS variable must be updated on `resize`, `scroll`, `orientationchange`, and `visualViewport.resize` events
- Works correctly across Safari UI states (collapsed chrome, scrolled, different tab layouts)

**From Material-UI #46953:**
- The backdrop stops at the visual viewport boundary
- Without proper handling, gaps appear above/below modals
- The issue is exacerbated inside iframes
- `viewport-fit=cover` meta tag is critical for extending content under safe areas

---

## Recommended Solutions

### Solution 1: Switch Backdrops to `position: absolute` ✅ PRIORITY

**Problem:** `position: fixed` with `inset: 0` clips to visual viewport on iOS Safari.

**Fix:** Use `position: absolute` with dynamically-calculated page height.

**Files to update:**
- `passkey-sdk/src/core/WebAuthnManager/LitComponents/IframeTxConfirmer/viewer-modal.ts`
- `passkey-sdk/src/core/WebAuthnManager/LitComponents/IframeTxConfirmer/viewer-drawer.ts`
- `passkey-sdk/src/core/WebAuthnManager/LitComponents/Drawer/index.ts` (if applicable)

**CSS changes:**
```css
.modal-backdrop-blur,
.modal-backdrop {
  position: absolute;  /* was: fixed */
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  height: var(--w3a-page-height, 100vh);
  min-height: 100vh;
}
```

**JavaScript changes:**
Add viewport tracking to update `--w3a-page-height` on:
- `window.visualViewport.resize`
- `window.visualViewport.scroll`
- `window.resize`
- `window.orientationchange`

Calculate height as:
```typescript
const pageHeight = visualViewport
  ? Math.max(
      document.documentElement.scrollHeight,
      document.body.scrollHeight,
      document.documentElement.clientHeight,
      visualViewport.height + visualViewport.offsetTop +
        (window.innerHeight - visualViewport.height - visualViewport.offsetTop)
    )
  : Math.max(
      document.documentElement.scrollHeight,
      document.body.scrollHeight,
      document.documentElement.clientHeight
    );
```

### Solution 2: Lock Body Scroll When Overlays are Open

**Problem:** Page scrolling can cause backdrop/overlay misalignment.

**Fix:** Lock `html` and `body` with `position: fixed` while modal/drawer is open.

**Implementation:**
- In `connectedCallback`: apply `position: fixed` to html/body, store scroll position
- In `disconnectedCallback`: restore scroll position, remove fixed positioning

### Solution 3: Ensure HTML/Body Sizing in Iframe

**Problem:** Iframe document may not extend to full viewport height.

**Fix:** Add base styles to wallet iframe host document.

**File:** `passkey-sdk/src/core/WalletIframe/host/wallet-iframe-host.ts`

**Add at initialization:**
```css
html, body {
  min-height: 100vh;
  min-height: -webkit-fill-available;
  position: relative;
}
html {
  height: 100%;
}
body {
  min-height: 100%;
}
```

### Solution 4: Unify Overlay Colors

**Problem:** Subtle color differences between host shims and iframe backdrops create visible seams.

**Fix:** Use shared `--w3a-overlay-dim` CSS variable across all overlay layers.

**Files:**
- viewer-modal.ts
- viewer-drawer.ts
- Any host-level overlay shims

### Solution 5: Verify Meta Viewport Tag

**Problem:** Without `viewport-fit=cover`, content won't extend under iOS safe areas.

**Fix:** Ensure parent app and iframe have:
```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
```

---

## Implementation Plan

### Phase 1: Core Backdrop Fix (P0 - Critical)
**Estimated effort:** 2-3 hours

1. **Update viewer-modal.ts:**
   - [ ] Change `.modal-backdrop-blur` and `.modal-backdrop` from `position: fixed` to `position: absolute`
   - [ ] Add `height: var(--w3a-page-height, 100vh)` and `min-height: 100vh`
   - [ ] Add `updatePageHeight()` method
   - [ ] Add viewport event listeners in `connectedCallback()`
   - [ ] Remove listeners in `disconnectedCallback()`
   - [ ] Add body scroll lock on mount, unlock on unmount

2. **Update viewer-drawer.ts:**
   - [ ] Apply same backdrop positioning changes as modal
   - [ ] Add same viewport tracking logic
   - [ ] Add body scroll lock

3. **Update Drawer/index.ts (if needed):**
   - [ ] Check if drawer component has similar backdrop issues
   - [ ] Apply same fixes if applicable

4. **Testing on iOS Safari:**
   - [ ] Test on iOS 16, 17, 18 (Safari 26)
   - [ ] Test with address bar visible/hidden
   - [ ] Test with page scrolled/not scrolled
   - [ ] Test with different Safari tab layouts
   - [ ] Test modal variant
   - [ ] Test drawer variant

### Phase 2: Iframe Document Setup (P1 - High)
**Estimated effort:** 1 hour

5. **Update wallet-iframe-host.ts:**
   - [ ] Add html/body sizing styles at initialization
   - [ ] Verify meta viewport tag handling (may need to set dynamically)
   - [ ] Test that iframe document extends properly

### Phase 3: Unify Styling (P2 - Medium)
**Estimated effort:** 1 hour

6. **Consolidate overlay colors:**
   - [ ] Define `--w3a-overlay-dim` in base styles or theme
   - [ ] Update all backdrop/overlay backgrounds to use shared variable
   - [ ] Remove any host-level shim overlays that are now redundant

### Phase 4: Instrumentation & Validation (P2 - Medium)
**Estimated effort:** 2 hours

7. **Add debug instrumentation (temporary):**
   - [ ] Log visualViewport metrics (offsetTop, height, computed bottom)
   - [ ] Log computed pageHeight
   - [ ] Render debug overlay showing dimensions (optional)
   - [ ] Test on physical iOS device

8. **Remove debug code after validation:**
   - [ ] Clean up console logs
   - [ ] Remove debug overlays

### Phase 5: Documentation & Cleanup (P3 - Low)
**Estimated effort:** 30 minutes

9. **Update documentation:**
   - [ ] Document the fix in component comments
   - [ ] Update this progress log with results
   - [ ] Note any remaining edge cases

### Total Estimated Effort: 6-8 hours

---

## Implementation Notes

- **Critical:** Solution 1 is the primary fix. Solutions 2-5 are reinforcements.
- **Device testing required:** This must be validated on physical iOS devices, not just simulators.
- **Backwards compatibility:** `position: absolute` with height fallbacks should work on all browsers.
- **Performance:** visualViewport listeners are lightweight; throttling not needed for this use case.

---

## Success Criteria

- ✅ No visible seam/gap above or below modal backdrop on iOS Safari 26
- ✅ Backdrop covers full viewport regardless of address bar state
- ✅ Works correctly when page is scrolled
- ✅ Works correctly in all Safari tab layout modes
- ✅ No regression on Android Chrome, desktop browsers
- ✅ Drawer variant also fixed
- ✅ Modal variant also fixed