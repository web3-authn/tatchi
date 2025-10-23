# Confirm TX Flow

## Overview

Secure confirmation is coordinated in the main thread and split into small, testable units. The worker requests a confirmation; the main thread classifies the request and delegates to a per‑flow handler that prepares NEAR/VRF data, renders UI, collects WebAuthn credentials, and responds back.

High‑level phases: Classify → Prepare → Confirm UI → JIT Refresh → Collect Credentials → Respond → Cleanup.

## Files

- Orchestrator: `handleSecureConfirmRequest.ts` (entry; validates, computes config, classifies, dispatches)
- Flows: `flows/localOnly.ts`, `flows/registration.ts`, `flows/transactions.ts`
- Shared helpers: `flows/common.ts` (NEAR context/nonce, VRF challenge + refresh, UI renderer, sanitize, type helpers)
- Types: `types.ts` (discriminated unions bound to `request.type`)
- Worker request: `awaitSecureConfirmation.ts` (posts request to main thread)
- Config rules: `determineConfirmationConfig.ts` (merges user prefs + request overrides + iframe safety)

## Message Handshake

- Worker → Main: `PROMPT_USER_CONFIRM_IN_JS_MAIN_THREAD` with a V2 `SecureConfirmRequest`
- Main → Worker: `USER_PASSKEY_CONFIRM_RESPONSE` containing confirmation status, optional credential, `prfOutput`, `vrfChallenge`, and `transactionContext`

## Flows

- LocalOnly
  - Types: `DECRYPT_PRIVATE_KEY_WITH_PRF`, `SHOW_SECURE_PRIVATE_KEY_UI`
  - No NEAR calls; uses a local random VRF challenge for UI plumbing
  - Decrypt: silently collect PRF via get(); UI is skipped; if user cancels, posts `WALLET_UI_CLOSED`
  - ShowSecurePrivateKeyUi: mounts export viewer (modal/drawer); returns confirmed=true and keeps viewer open

- Registration / LinkDevice
  - Fetches NEAR block context; bootstraps temporary VRF keypair; renders UI per config
  - Performs JIT VRF refresh (best‑effort) and updates UI
  - Collects create() credentials; retries on `InvalidStateError` by bumping deviceNumber
  - Serializes credential (without PRF outputs for relay/contract requests) and returns dual PRF outputs

- Signing / NEP‑413
  - Fetches NEAR context via NonceManager (reserving per‑request nonces); generates VRF challenge
  - Renders UI per config; performs JIT VRF refresh (best‑effort)
  - Collects get() credentials; returns serialized credential + PRF output
  - Releases reserved nonces on cancel/negative confirmation

## UI Behavior

- `determineConfirmationConfig` combines user prefs and request overrides, with wallet‑iframe safety defaults
- `renderConfirmUI` supports `uiMode: 'skip' | 'modal' | 'drawer'` and `behavior: 'autoProceed' | 'requireClick'`
- Wallet iframe overlay considerations remain: requireClick flows must be visible for clicks to register

## ConfirmationConfig Pipeline

This section documents how a ConfirmationConfig is chosen for each confirmation, where overrides are injected, and the exact order of precedence.

### Order of Precedence

- Request override (strongest): a per-call `confirmationConfig` attached to the request envelope wins over user prefs. See `determineConfirmationConfig` in `sdk/src/core/WebAuthnManager/SignerWorkerManager/confirmTxFlow/determineConfirmationConfig.ts:31`.
- User preferences: fetched from `UserPreferencesManager.getConfirmationConfig()` and stored in IndexedDB per user. See `sdk/src/core/WebAuthnManager/userPreferences.ts:94` and `sdk/src/core/WebAuthnManager/userPreferences.ts:180`.
- Defaults: when no user prefs exist, fall back to `DEFAULT_CONFIRMATION_CONFIG`. See `sdk/src/core/types/signer-worker.ts:164`.
- Runtime clamps (applied after merge): environment-specific safety rules adjust the merged config (e.g., mobile/iOS requiring a click). See `sdk/src/core/WebAuthnManager/SignerWorkerManager/confirmTxFlow/determineConfirmationConfig.ts:64` and `sdk/src/core/WebAuthnManager/SignerWorkerManager/confirmTxFlow/determineConfirmationConfig.ts:89`.

### Where Overrides Are Added

- Registration (no prior user):
  - The core registration path forces a per-call override so there is a consistent UX with no prior user prefs:
    - Desktop: `uiMode: 'modal', behavior: 'requireClick'`
    - Mobile/iOS: `uiMode: 'modal', behavior: 'requireClick'`
  - This override is set in `registerPasskeyInternal` before requesting credentials: `sdk/src/core/PasskeyManager/registration.ts:86` and passed to `requestRegistrationCredentialConfirmation`.
  - The override flows through to the worker request in `sdk/src/core/WebAuthnManager/SignerWorkerManager/handlers/requestRegistrationCredentialConfirmation.ts:25` as `confirmationConfig` on the payload.

- Transactions / NEP‑413 signing (with a user):
  - Callers can supply an optional `confirmationConfigOverride` when signing. The handler merges
    `confirmationConfigOverride || userPreferences` and sends it as `confirmationConfig` with the worker request. See `sdk/src/core/WebAuthnManager/SignerWorkerManager/handlers/signTransactionsWithActions.ts:78`.
  - The final config still goes through `determineConfirmationConfig` on the host to apply runtime rules.

- Wallet iframe host path (cross‑origin):
  - For registration requests posted to the wallet host, the host forwards the one‑time `confirmationConfig` when provided. See `sdk/src/core/WalletIframe/host/wallet-iframe-host.ts:120`.

### Runtime Clamps (Post‑Merge)

Applied in `determineConfirmationConfig` after merging override + prefs:

- Decrypt Private Key flow: forces `uiMode: 'skip'` (UI suppressed; worker may follow with a separate UI). See `sdk/src/core/WebAuthnManager/SignerWorkerManager/confirmTxFlow/determineConfirmationConfig.ts:47`.
- Mobile/iOS heuristic: if `isIOS()` or `isMobileDevice()` is true, promote any configuration to a visible, clickable confirmation to reliably satisfy WebAuthn user activation:
  - Clamp to `behavior: 'requireClick'` and upgrade `uiMode: 'skip'` to a visible mode. See `sdk/src/core/WebAuthnManager/SignerWorkerManager/confirmTxFlow/determineConfirmationConfig.ts:64`.
- Wallet‑iframe host, Registration/Link flows:
  - All platforms: always use `{ uiMode: 'modal', behavior: 'requireClick' }` so the click lands inside the iframe. See `sdk/src/core/WebAuthnManager/SignerWorkerManager/confirmTxFlow/determineConfirmationConfig.ts:89`.

### Effective Behavior by Flow (Current Policy)

- Registration (no user yet):
  - Desktop: modal + requireClick (via per‑call override)
  - Mobile/iOS: modal + requireClick (via per‑call override)

- Transaction signing / NEP‑413:
  - Desktop: honors user prefs or per‑call override; autoproceed allowed
  - Mobile/iOS: requireClick is enforced via clamp regardless of prefs to meet activation reliably

### Preference Storage and Theme

- Preferences are per‑user and persisted in IndexedDB. `UserPreferencesManager` loads last user settings on startup and updates when the current user changes. See `sdk/src/core/WebAuthnManager/userPreferences.ts:126` and `sdk/src/core/WebAuthnManager/userPreferences.ts:209`.
- Theme comes from the confirmation config and defaults to `dark` if unset. During registration, the theme is set from `walletTheme` for a consistent look. See `sdk/src/core/PasskeyManager/registration.ts:82`.

## VRF + NEAR Context

- Registration: bootstrap a temporary VRF keypair and challenge before WebAuthn create()
- Signing: generate challenge from active VRF session
- JIT refresh: refresh block height/hash before collecting credentials to minimize staleness
- NonceManager: reserves/releases nonces for signing batches; registration does not use nonces

## Types

- Discriminated unions bind `request.type` to its payload
- `LocalOnlySecureConfirmRequest`, `RegistrationSecureConfirmRequest`, `SigningSecureConfirmRequest`
- All responses are sanitized via `sanitizeForPostMessage` to ensure structured‑clone safety

## Sequence

1. Worker sends `PROMPT_USER_CONFIRM_IN_JS_MAIN_THREAD`
2. Main validates, computes effective `ConfirmationConfig`, and classifies the flow
3. Per‑flow handler prepares NEAR context and VRF challenge
4. UI is rendered per config (skip/modal/drawer); user confirms or cancels
5. JIT VRF refresh (best‑effort) updates UI
6. Credentials are collected (create/get) and serialized; PRF extracted when required
7. Response is sent back; nonces released on cancel; UI closed as appropriate

## Notes

- Export viewer (ShowSecurePrivateKeyUi) posts `WALLET_UI_OPENED/CLOSED` to coordinate overlays
- Errors are returned in a structured format; best‑effort cleanup always runs
- Orchestrator imports helpers from `flows/common` and never performs side effects directly
