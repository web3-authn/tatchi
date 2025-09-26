Arrow Register Button – Overlay Flow
===================================

Overview
- The register arrow button is rendered inside the wallet iframe origin to preserve WebAuthn user activation.
- The parent app mounts a Lit element (w3a-arrow-register-button) via the wallet host, anchored as an overlay.
- When clicked, registration runs in the wallet iframe. The router bridges completion back to the parent.

Key Pieces
- Host mounter: core/WalletIframe/host/lit-elem-mounter.ts
  - Mounts/updates/unmounts Lit components (including the arrow button) inside the wallet iframe.
  - Wires DOM events to PasskeyManager actions (e.g., arrow-submit → registerPasskey). 
  - Posts REGISTER_BUTTON_SUBMIT and REGISTER_BUTTON_RESULT window messages to the parent for diagnostic or fallback.

- Router bridge: core/WalletIframe/client/router.ts
  - Normal calls (router.registerPasskey): assigns a requestId, bridges PROGRESS to onEvent, emits onVrfStatusChanged on completion.
  - Overlay flow: listens to REGISTER_BUTTON_RESULT/SUBMIT from the wallet origin. After success, it calls getLoginState() and emits onVrfStatusChanged so the app can update login state without window listeners.
  - Optional convenience: onRegisterOverlaySubmit/onRegisterOverlayResult for UI-only concerns (e.g., show a spinner on submit).

- React overlays:
  - useArrowButtonOverlay (src/react/components/PasskeyAuthMenu/ArrowButtonOverlayHooks.ts):
    - Centralizes overlay geometry + mount/update/unmount via the router’s generic UI APIs.
    - Hides/unmounts while waiting.
  - useRegisterOverlayWaitingBridge: subscribes to router overlay submit/result events and toggles waiting state (no window fallback by default).

Why not reuse registerPasskey onEvent/progress?
- Overlay registration is initiated inside the wallet iframe (host-initiated) to retain user activation. There is no parent-side post() or requestId to attach progress callbacks to.
- The router bridges the terminal result (and emits onVrfStatusChanged) to keep the parent’s state in sync.

Typical Usage
1) Show the arrow overlay near an input’s proceed affordance:
   - Call useArrowButtonOverlay({ enabled, waiting, mode: 'register', nearAccountId, id, overlayRectOverride }).
   - On hover/focus or click, call mountArrowAtRect().

2) Toggle UI waiting based on overlay events:
   - Call useRegisterOverlayWaitingBridge({ enabled: true, setWaiting }).
   - Router emits submit/result; the hook updates waiting accordingly.

3) Reflect login state:
   - Subscribe to client.onVrfStatusChanged in your context/provider.
   - After overlay registration success, router emits the event and you can refresh login state (and set current user for preferences).

Notes
- The wallet host still posts window messages for diagnostic/legacy purposes, but app code should prefer router events.
- The overlay Lit element accepts a waiting prop; hosts hide the button immediately on submit for a crisp UX.
