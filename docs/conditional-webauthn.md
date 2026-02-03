# Conditional WebAuthn (Passkey Autofill) + `PasskeyAuthMenu`

Goal: make it easy for a user to choose which passkey they want to use when signing in via `PasskeyAuthMenu`.

This document summarizes what Conditional WebAuthn can/can’t do, and what changes would be needed in this repo to integrate it cleanly.

## What “conditional WebAuthn” is

Conditional UI is a mode of `navigator.credentials.get()` where the request **does not** immediately show a modal prompt. Instead, it stays pending until the user interacts with an eligible form field, at which point the browser/OS can offer passkeys as autofill suggestions.

Canonical implementation guidance (includes the exact `autocomplete="username webauthn"` requirement and `mediation: 'conditional'`):
- https://web.dev/articles/passkey-form-autofill

Key pieces:
- Feature-detect with `PublicKeyCredential.isConditionalMediationAvailable?.()`.
- Start a pending request:
  - `navigator.credentials.get({ publicKey: requestOptions, mediation: 'conditional', signal })`
- Annotate the username field:
  - `<input autocomplete="username webauthn" ... />`

## What it can and can’t do for “show different passkeys”

### Can do
- Lets the browser/OS display the available passkeys for the RP as a picker/autofill UI.
- The user chooses the passkey in browser-managed UI; JS receives the resulting `PublicKeyCredential`.
- If multiple passkeys exist for the same RP, the chooser naturally exposes them (using the credential’s stored user name/display name).

### Can’t do
- You cannot enumerate passkeys in JavaScript to render your own “list of passkeys” UI (by design).
- You can only influence which credentials appear via:
  - `rpId`
  - `allowCredentials` (when you already know credential IDs)
  - platform policy/user settings

## How this maps to Tatchi’s current flows

### `PasskeyAuthMenu` today

`PasskeyAuthMenu` is UI-only: it does not call WebAuthn itself. It delegates to callbacks (`onLogin`, `onRegister`, `onSyncAccount`) and the consumer typically uses `useTatchi()` to read the current username and call SDK methods (see `examples/tatchi-docs/src/docs/getting-started/react-recipes.md`).

Relevant code:
- Username input UI: `sdk/src/react/components/PasskeyAuthMenu/ui/PasskeyInput.tsx`
- Login flow + WebAuthn get() call sites: `sdk/src/core/TatchiPasskey/login.ts`
- WebAuthn request construction: `sdk/src/core/WebAuthnManager/touchIdPrompt.ts`

Important nuance: `loginAndCreateSession()` may not always prompt WebAuthn. If Shamir 3-pass VRF unlock succeeds, login can complete without calling `navigator.credentials.get()`. Any “let the user pick a passkey” UX would need to either (a) run in environments where WebAuthn prompting is expected, or (b) add an explicit “choose passkey” action that forces a WebAuthn assertion path.

### Account discovery already exists (but currently double-prompts if reused)

`SyncAccountFlow.discover()` already supports “no typed account”: it performs a WebAuthn `get()` with an empty allow-list and then infers the account from `userHandle`:
- `sdk/src/core/TatchiPasskey/syncAccount.ts`
- `sdk/src/core/WebAuthnManager/userHandle.ts`

That discovery credential is intentionally not reused for account sync because PRF salts are derived from `nearAccountId`, and discovery uses `nearAccountId=""`.

This same constraint applies to login: if we want “pick any passkey (any account) without typing” and still use account-derived PRF salts, we’d need either:
- a second prompt (discover → then prompt again with the real `nearAccountId` salts), or
- a deeper refactor of the PRF salt/key-derivation strategy.

## Practical integration options for `PasskeyAuthMenu`

### Option A (recommended): conditional UI after account is known

Use conditional UI to let users pick among passkeys for a specific account (or at least within this RP), without trying to “list passkeys” in our UI.

High-level shape:
1. Ensure the `PasskeyAuthMenu` login input has `autocomplete="username webauthn"`.
2. When entering Login mode (and ideally on input focus), start a **pending** WebAuthn request using `mediation: 'conditional'`.
3. When the promise resolves, continue the login flow using the returned credential (and avoid prompting again).

Repo changes needed to make this clean:
- Split login into two phases so we can start the WebAuthn `get()` early and then “finish login” after a selection:
  - **Phase 1**: collect a PRF-bearing WebAuthn assertion for a known `nearAccountId` (conditional when available).
  - **Phase 2**: perform VRF unlock / warm session minting using the already-collected credential.
- Add a way to pass a “pre-collected credential” into the login path so `loginAndCreateSession()` does not call `navigator.credentials.get()` again.

The existing login implementation already has the right building blocks:
- `webAuthnManager.unlockVRFKeypair({ nearAccountId, encryptedVrfKeypair, credential })` accepts a credential.
- `mintWarmSigningSession({ ..., credential })` has explicit “reuse credential when provided” behavior.

### Option B: conditional UI for cross-account selection (harder)

If the user expectation is “I want to see all my passkeys for this RP and choose the account”, conditional UI can do the *chooser*, but with today’s PRF salt scheme we cannot complete login in a single prompt without changing how salts are derived.

If we accept a 2-step UX, we can:
1. Conditional/discoverable `get()` (empty allowCredentials) → infer account via `userHandle`.
2. Run the real login prompt for that inferred account (account-derived PRF salts).

This is exactly why `SyncAccountFlow.discover()` does not reuse the discovery credential.

## Implementation notes / gotchas

- `mediation: 'conditional'` must be started *before* the user expects to be signed in (usually on page load or on focus). Using it only after clicking “Continue” will often look like the UI is stuck (it stays pending until an autofill interaction happens).
- Use an `AbortController` to cancel a pending conditional request when:
  - the user changes mode (Login/Register/Sync),
  - the username changes (typed a different account),
  - you need to start a new request (new challenge/options),
  - the component unmounts.
- `allowCredentials`:
  - Empty means “show all credentials for this RP” in many browsers (this is what the web.dev guidance recommends).
  - Providing credential IDs (from IndexedDB or server-side account data) can narrow the picker to “this account’s passkeys”.
- Browser support varies; always feature-detect and fall back to normal `navigator.credentials.get()` (modal) flows.

## Plan

The plan is to use Conditional UI as a *browser-managed passkey picker* (not a passkey list we render ourselves) and to integrate it into `PasskeyAuthMenu` without changing the existing login fallback behavior.

### Phase 1: UX wiring (no protocol changes)

- Add `autocomplete="username webauthn"` to the login username input so browsers can offer passkey autofill.
- When Login mode is active (and/or on focus), start a pending conditional request:
  - Feature-detect `PublicKeyCredential.isConditionalMediationAvailable?.()`
  - If supported, call `navigator.credentials.get({ mediation: 'conditional', ... })` and keep it pending until the user picks a passkey.
  - Use an `AbortController` so mode switches / username edits cancel and restart cleanly.
- When the conditional request resolves, proceed with the normal login flow and ensure we **reuse the credential** to avoid double prompts.

Acceptance criteria:
- If multiple passkeys exist, the browser shows a chooser and the user can pick one.
- If conditional UI isn’t supported, Login works as it does today (modal prompt when needed).
- No “Wallet iframe window missing” or other noisy logs introduced by the new flow.

### Phase 2: Reduce double-prompt risk (API refactor)

- Split login into “collect WebAuthn assertion” and “finish login” so `PasskeyAuthMenu` can start conditional WebAuthn early and pass the resulting `PublicKeyCredential` into the SDK.
- Keep existing public APIs working; the refactor should be additive (new optional `credential`/“pre-collected assertion” inputs).

### Phase 3 (optional): cross-account selection

If we want “pick any passkey, infer account, then login” in a single click, we likely need to revisit PRF salt derivation (today it depends on `nearAccountId`). Without that, cross-account selection is feasible but will remain a 2-prompt flow (discover → login).

## TODO

[ ] Add `autocomplete="username webauthn"` to the `PasskeyAuthMenu` login input (and keep existing behavior as fallback).
[ ] Feature-detect `PublicKeyCredential.isConditionalMediationAvailable?.()` and gate conditional UI behind it.
[ ] Start a pending `navigator.credentials.get({ mediation: 'conditional', ... })` request when entering Login (or focusing the username input).
[ ] Cancel any pending conditional request via `AbortController` when mode changes, username changes, or the component unmounts.
[ ] Plumb the selected `PublicKeyCredential` into the login path so we don’t prompt WebAuthn again (avoid double prompts).
[ ] Add tests + an example integration that demonstrates passkey selection UX (and verifies fallback behavior when conditional UI isn’t supported).
