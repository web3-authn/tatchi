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
