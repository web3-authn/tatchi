# Wallet Iframe Progress Bus and User Activation

This document explains how progress events drive the invisible wallet‑iframe overlay to satisfy WebAuthn “transient user activation” requirements without browser popups, what permissions are granted to the iframes involved, and why both flows work:

- (ii) SecureSignTxButton (click happens inside the wallet iframe)
- (i) Direct `executeAction` calls from the SDK (no Lit component)


## Overview

The wallet iframe mounts as a hidden 0×0 element in the parent document. When a signing flow reaches phases that need user activation (e.g., TouchID / WebAuthn), we temporarily expand the wallet iframe to a full‑screen, invisible overlay so the WebAuthn call occurs in the wallet document (the correct browsing context). As soon as activation completes, we hide the iframe again to avoid blocking the app.

- Overlay control lives in the wallet iframe client router and its `ProgressBus`:
  - `passkey-sdk/src/core/WalletIframe/client/progress-bus.ts`
  - `passkey-sdk/src/core/WalletIframe/client/router.ts`
- Progress events are emitted by PasskeyManager flows and the WASM worker handshake:
  - `passkey-sdk/src/core/PasskeyManager/actions.ts`
  - `passkey-sdk/src/core/WebAuthnManager/SignerWorkerManager/confirmTxFlow/*`


## Progress → Overlay behavior

The `ProgressBus` class receives typed progress payloads and applies a phase heuristic to decide when to show/hide the overlay.

- Show phases (need transient activation):
  - `ActionPhase.STEP_2_USER_CONFIRMATION` (non‑negotiable for requireClick)
  - `ActionPhase.STEP_4_WEBAUTHN_AUTHENTICATION`
  - Device linking and login/recovery phases that gather WebAuthn credentials
    (see the source for the up‑to‑date list)
  - Source: `passkey-sdk/src/core/WalletIframe/client/progress-bus.ts`

- Hide phases (post‑activation, non‑interactive work):
  - `ActionPhase.STEP_5_AUTHENTICATION_COMPLETE`
  - `ActionPhase.STEP_6_TRANSACTION_SIGNING_PROGRESS`
  - `ActionPhase.STEP_7_TRANSACTION_SIGNING_COMPLETE`
  - `ActionPhase.STEP_3_CONTRACT_VERIFICATION`
  - `ActionPhase.STEP_8_BROADCASTING`
  - `ActionPhase.STEP_9_ACTION_COMPLETE`
  - Device linking/registration completion/error phases
  - Source: `passkey-sdk/src/core/WalletIframe/client/progress-bus.ts`

When the heuristic returns:

- `show`: the router calls `showFrameForActivation()` and expands the iframe to a full‑screen, invisible overlay (see below for exact CSS changes).
- `hide`: the router calls `hideFrameForActivation()` and immediately collapses the iframe back to 0×0 with `pointer-events: none`.

Key points:

- Step 2 (“Requesting user confirmation…”) is emitted as early as possible to get the overlay up before any slow RPC/IO, so activation is not lost to latency.
  - IMPORTANT: Step 2 must expand the overlay. If removed, the modal rendered inside the wallet iframe won’t be visible when `behavior: 'requireClick'`, and user confirmation will never happen.
  - Source: `passkey-sdk/src/core/PasskeyManager/actions.ts` (emits `STEP_2_USER_CONFIRMATION` before signing)


## What `showFrameForActivation()` actually does

File: `passkey-sdk/src/core/WalletIframe/client/router.ts`

`showFrameForActivation()` ensures the service iframe is mounted, then sets these styles:

- `position: fixed; inset: 0; top: 0; left: 0; width: 100vw; height: 100vh;`
- `opacity: 1; pointer-events: auto; z-index: 2147483646;`
- Removes `aria-hidden` and `tabindex` attributes

This makes the wallet iframe cover the viewport so clicks and the WebAuthn transient activation are captured in the wallet document. The actual transaction modal or secure UI is rendered inside the wallet iframe (either directly or inside its own nested, same‑origin iframe for the modal host). Once activation completes (or moves to non‑interactive phases), `hideFrameForActivation()` restores the iframe to:

- `width: 0px; height: 0px; opacity: 0; pointer-events: none; z-index: ''`
- Restores `aria-hidden` and `tabindex="-1"`

This minimizes any interaction blocking of the parent app and keeps the iframe invisible when not needed.


## Iframe permissions policy

The wallet service iframe and the nested modal iframe must be allowed to use WebAuthn APIs. We set the permissions policy explicitly via the `allow` attribute.

1) Wallet service iframe (created by `IframeTransport`)

- File: `passkey-sdk/src/core/WalletIframe/client/IframeTransport.ts`
- Cross‑origin wallet host:
  - `allow="publickey-credentials-get <wallet-origin>; publickey-credentials-create <wallet-origin>"`
- Same‑origin srcdoc host:
  - `allow="publickey-credentials-get 'self'; publickey-credentials-create 'self'"`
- Sandbox:
  - Only applied for same‑origin srcdoc: `sandbox="allow-scripts allow-same-origin"`
  - Cross‑origin page is not sandboxed to avoid inconsistent MessagePort behavior across browsers.

2) Modal host iframe (full‑screen UI for confirm in wallet origin)

- File: `passkey-sdk/src/core/WebAuthnManager/LitComponents/IframeTxConfirmer/IframeModalHost.ts`
- Uses: `allow="publickey-credentials-get; publickey-credentials-create"`
- This iframe is same‑origin to the wallet host, so it inherits the wallet origin’s permission context.

Notes:

- These policies ensure `navigator.credentials.get()` / `create()` calls initiated by the wallet iframe (or its modal host) satisfy the browser’s origin/user‑activation requirements.


## How both flows meet user activation

### (ii) SecureSignTxButton

- The button is rendered inside the wallet iframe (or a same‑origin iframe controlled by the wallet). When the user clicks it, the click occurs in the wallet’s document, so transient user activation is already satisfied.
- The signing flow runs within that context, and `navigator.credentials.get()` is called from the wallet host with the proper `allow` policy and recent user activation. No extra modal click is needed.
- Auto‑proceed vs. explicit click is configurable, but for a button living inside the wallet iframe, a single click is sufficient for the entire flow.

### (i) Direct `executeAction` from SDK

Even when you call `passkeyManager.executeAction(...)` directly from your app (not from a Lit component), the flow still meets activation without an extra modal click by combining:

1) Overlay activation at the right phases
   - On `STEP_2_USER_CONFIRMATION` and `STEP_4_WEBAUTHN_AUTHENTICATION`, the `ProgressBus` instructs the router to expand the wallet iframe overlay, so the credential call happens in the wallet document.

2) Default confirmation config: “modal + autoProceed”
   - `DEFAULT_CONFIRMATION_CONFIG` is `uiMode: 'modal', behavior: 'autoProceed', autoProceedDelay: 1000`.
   - Source: `passkey-sdk/src/core/types/signer-worker.ts`
   - In `handleSecureConfirmRequest.ts`, the `modal + autoProceed` branch mounts the modal with `loading: true`, waits `autoProceedDelay`, and proceeds without requiring a user click.
     - Source: `passkey-sdk/src/core/WebAuthnManager/SignerWorkerManager/confirmTxFlow/handleSecureConfirmRequest.ts`

3) Proper iframe permissions
   - As described above, the wallet iframe (and nested modal host) have the correct `allow` attributes to use WebAuthn.

Put together, when you trigger `executeAction` in response to any user gesture in your app (e.g., a button click), the SDK:

- Emits early confirm phases → overlay expands (activation captured)
- Mounts the modal in the wallet iframe and auto‑proceeds
- Authenticates via WebAuthn in the wallet context
- Hides the overlay once activation is complete

No additional modal click is required for signing.

## Regression checklist for overlay heuristics

Before merging changes to the progress bus or overlay logic, verify:

- Show list includes `user-confirmation` and `webauthn-authentication`.
- Hide list includes `authentication-complete`, `transaction-signing-progress`, `transaction-signing-complete`, `contract-verification`, `broadcasting`, `action-complete`, and error/complete phases for login/registration/linking/recovery.
- In iframe mode, a manual test with `setConfirmBehavior('requireClick')` shows the modal and allows clicking Confirm.
- In autoProceed mode, modal appears briefly with loading then proceeds without extra clicks.


## When an extra click is required (and for registrations)

- If you run `executeAction` without a recent user gesture (e.g., on page load, or after a long async chain with no new click), browsers may reject WebAuthn with `NotAllowedError` due to missing activation. In such cases:
  - Switch to `requireClick` behavior: `passkeyManager.setConfirmationConfig({ uiMode: 'modal', behavior: 'requireClick' })`.
  - Or use a UI element inside the wallet iframe (e.g., `SecureSignTxButton`) so the click lands in the wallet context.

- For registration/link‑device in the wallet‑iframe host context, we enforce explicit click (no auto‑proceed) to guarantee a clean activation for `create()`:
  - See: `passkey-sdk/src/core/WebAuthnManager/SignerWorkerManager/confirmTxFlow/determineConfirmationConfig.ts` (forces `{ uiMode: 'modal', behavior: 'requireClick' }` in that runtime).


## Developer tips

- Pre‑warm to reduce perceived latency before the overlay appears:
  - `passkeyManager.prefetchBlockheight()` → caches/refreshes block height/hash/nonce ahead of time.
  - Sources: `passkey-sdk/src/core/PasskeyManager/index.ts` and `passkey-sdk/src/core/nonceManager.ts`.

- Overlay is intentionally invisible but intercepts clicks while active. Keep the overlay up for the minimum time by limiting “show” to the phases that truly need activation (as implemented in `progress-bus.ts`).


## Rough timeline: direct `executeAction`

1) App calls `executeAction` (typically from a click handler).
2) SDK emits `STEP_2_USER_CONFIRMATION` → overlay expands.
3) Wallet host mounts modal (auto‑proceed) and prepares the VRF challenge + tx context.
4) WebAuthn prompt (`navigator.credentials.get`) runs in the wallet document.
5) `STEP_5_AUTHENTICATION_COMPLETE` → overlay hides; signing continues.
6) Transaction is signed and broadcast; final progress events emitted; modal closed.

This is how we preserve “no popups,” satisfy WebAuthn activation, and avoid extra clicks for signing flows by default.
