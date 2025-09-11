# Wallet‑Origin Registration via Secure Confirmation (Design Notes)

## Goals

- Ensure WebAuthn registration (`navigator.credentials.create`) runs with valid user activation inside the wallet origin iframe.
- Unify UX by reusing the existing “secure confirmation” pipeline (the same path used for tx signing) for registration.
- Keep parent/app origin thin; wallet iframe owns sensitive prompts, IndexedDB, and ceremony UX.
- Preserve clear separation between parent and wallet bundles to enable tree‑shaking and future split packaging.

## Current Issues

- Cross‑origin WebAuthn requires both Permissions‑Policy delegation from the parent and a user gesture in the same context as the WebAuthn call. A code‑only RPC from parent → iframe is not sufficient to provide activation.
- The initial wallet‑origin registration handler invoked WebAuthn directly without a user click in the iframe. We temporarily added UI/overlay hooks to capture activation, but this should be replaced by the standard secure‑confirm modal flow.

Relevant code references:
- `passkey-sdk/src/core/WalletIframe/wallet-iframe-host.ts`
- `passkey-sdk/src/core/WalletIframe/client.ts`
- `passkey-sdk/src/core/WebAuthnManager/SignerWorkerManager/confirmTxFlow/awaitSecureConfirmation.ts`
- `passkey-sdk/src/core/WebAuthnManager/SignerWorkerManager/confirmTxFlow/handleSecureConfirmRequest.ts`
- `passkey-sdk/src/core/WebAuthnManager/LitComponents/modal.ts`
- `passkey-sdk/src/core/WebAuthnManager/LitComponents/IframeModalConfirmer/IframeModalHost.ts`
- `passkey-sdk/src/core/WebAuthnManager/LitComponents/IframeModalConfirmer/ModalTxConfirmer.ts`

## Proposed Architecture

1) Gate registration behind the existing secure‑confirm pipeline.
   - The Rust worker calls `awaitSecureConfirmation(...)` and sets `isRegistration: true` in the confirmation payload (see `SecureConfirmData`).
   - Main thread handler (`handlePromptUserConfirmInJsMainThread`) renders a modal inside the wallet origin iframe, gathers a user click, computes VRF challenge + NEAR context, then collects the WebAuthn credential.
   - The handler responds back to the worker with a structured `USER_PASSKEY_CONFIRM_RESPONSE` including `credential`, `prf_output`, `vrf_challenge`, and `transaction_context`.

2) Registration modal variant.
   - Add a registration‑specific view that shows:
     - rpId (wallet domain)
     - nearAccountId (and device label)
     - current block height/hash context
     - clear, single CTA: “Continue” (or “Create Passkey”) to trigger WebAuthn
   - Options:
     - Minimal change: add a registration mode to the existing `ModalTxConfirmer` and hide tx‑tree.
     - Cleaner: create `ModalTxConfirmerRegistration.tsx` with its own template.
   - Hosted by the existing `IframeModalHost` to keep uniform mounting/messaging.

3) Service host registration refactor.
   - Replace ad‑hoc overlay + direct WebAuthn calls in `REQUEST_registerPasskey` with a call into the unified secure‑confirm flow.
   - Ensure non‑initialized NonceManager doesn’t block registration: for `isRegistration`, fetch NEAR block data via `nearClient.viewBlock({ finality: 'final' })` to build VRF challenge.

4) Permissions‑Policy + iframe allow attributes.
   - Parent origin must delegate to wallet origin in its HTTP header:
     - `Permissions-Policy: publickey-credentials-get=(self "https://wallet.example.localhost"), publickey-credentials-create=(self "https://wallet.example.localhost")`
   - The service iframe should set an `allow` attribute mirroring the wallet origin.
   - The wallet origin should allow WebAuthn for itself.

## Data Flow (Registration)

1. Worker (Rust) → `awaitSecureConfirmation(requestId, summary, confirmationData, txSigningRequestsJson)`
2. Worker → Main Thread (wallet iframe): `PROMPT_USER_CONFIRM_IN_JS_MAIN_THREAD` with `SecureConfirmData { isRegistration: true, rpcCall, intentDigest, ... }`
3. Main Thread:
   - Get NEAR context (nonce/block hash/height): use NonceManager if initialized; else direct RPC.
   - Generate VRF challenge.
   - Render modal (registration view) for user activation.
   - On confirm: call WebAuthn `navigator.credentials.create` to collect credential (+ dual PRF if required by registration).
4. Main Thread → Worker: `USER_PASSKEY_CONFIRM_RESPONSE` with `credential`, `prf_output`, `vrf_challenge`, `transaction_context`.
5. Worker continues the flow: derives NEAR keypair, deterministically derives VRF keypair, signs `signVerifyAndRegisterUser`, returns results.
6. Main Thread (wallet iframe) persists authenticator + user and posts final `REGISTER_RESULT` back to parent RPC caller.

## Modal Requirements (Registration)

- Inputs: `nearAccountId`, `vrfChallenge` (contains `rpId`, `blockHeight`, `blockHash`), theme.
- Titles/CTAs: “Create Passkey”, “Continue”.
- States: loading, confirm/cancel, error banner.
- No tx tree; registration summary replaces action list.
- Must run entirely inside the wallet iframe so the confirm click counts as activation.

## Implementation Steps

1) Types and worker plumbing
   - `passkey-sdk/src/core/WebAuthnManager/SignerWorkerManager/confirmTxFlow/types.ts`:
     - Ensure `SecureConfirmData.isRegistration: boolean` and `TransactionSummary.isRegistration?: boolean`.
   - `awaitSecureConfirmation.ts`:
     - Include `isRegistration: true` in `PROMPT_USER_CONFIRM_IN_JS_MAIN_THREAD` for registration.
   - `handleSecureConfirmRequest.ts`:
     - In `validateAndParseRequest()`, set method label to “Register Account” when `isRegistration`.
     - For NEAR RPC calls, add fallback to `nearClient.viewBlock(...)` when NonceManager isn’t initialized.
     - Pass `vrfChallenge` to the modal and collect PRF/credential in `collectTouchIdCredentials()` when `isRegistration`.

2) Modal
   - Option A: extend `ModalTxConfirmer.ts` with a `registration` mode:
     - Dynamic title/CTA and hide tx tree when `txSigningRequests` is empty.
     - Shows `rpId`, `blockHeight`, and `nearAccountId` prominently.
   - Option B: add `ModalTxConfirmerRegistration.tsx` with equivalent host wiring through `IframeModalHost`.
   - `IframeModalHost.ts` + `modal.ts`: accept and forward registration metadata.

3) Service host
   - `wallet-iframe-host.ts` in `REQUEST_registerPasskey` switch:
     - Remove ad‑hoc activation overlay.
     - Call into secure‑confirm flow (post message to worker; await result), then continue the registration pipeline.
     - Persist user + authenticator and set last/current user.

4) Policy/allow
   - Confirm parent server headers and iframe `allow` attribute are set (already patched in dev configs).

## Risks & Mitigations

- User activation: Ensured via in‑iframe modal confirm button.
- NonceManager not initialized: Fallback to direct block fetch.
- Cross‑origin messaging: Use structured‑clone safe payloads (already sanitized in `sendWorkerResponse`).
- Cancellation: Modal emits cancel → respond with `confirmed: false` to worker; caller handles gracefully.
- Timeouts: Modal host supports a timeout message with error banner.

## Migration Plan

Phase 1 (now):
- Keep temporary overlay (to unblock testing) but mark as deprecated.
- Land modal changes + worker wiring for registration; switch service‑host registration to secure‑confirm.

Phase 2:
- Remove overlay code paths.
- Harden tests: e2e auto‑activation via click in iframe; cancel path; error banners.

## Testing

- Manual e2e: local dev with `example.localhost` (parent) and `wallet.example.localhost` (iframe).
- Ensure headers:
  - Parent: `Permissions-Policy` delegates to wallet origin.
  - Iframe element has precise `allow` attributes set to wallet origin.
- Automated: add Playwright tests for registration modal confirm/cancel.

## Separation & Tree‑Shaking Notes

- Two bundles:
  - Parent app imports `@web3authn/passkey` (UI + orchestration).
  - Wallet iframe loads `/sdk/esm/react/embedded/wallet-iframe-host.js` (headless service + IndexedDB + WebAuthn + workers).
- Keep import boundaries tight so rolldown treeshakes unused features per bundle.
- Future: expose a dedicated runtime subpath for the service host (e.g., `@web3authn/passkey/wallet-iframe-host`) to clarify split delivery.

## Open Questions

- Do we want a separate registration modal component, or a unified one with a mode switch?
- Should we surface additional registration details (device number label, relay usage) in the modal?
- Where to record analytics hooks for confirm/cancel + WebAuthn errors?

