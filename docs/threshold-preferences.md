# Threshold signing preferences (plan)

Goal: add a **per-user** preference for **signing mode** so the SDK can default to `local-signer` vs `threshold-signer` (optionally with `behavior: 'strict' | 'fallback'`), and expose it in `PasskeyAuthMenu`.

## Phased TODO (checklist)

### Phase 0 — Planning / decisions
- [x] Create this plan doc
- [x] Define precedence: override > user pref > configs
- [x] Define override merge semantics (mode-only overrides must not wipe stored `behavior`)
- [ ] Decide UI shape: 2-option + fallback toggle vs 3-option selector

### Phase 1 — Persist preference (IndexedDB)
- [ ] Extend `UserPreferences` in `sdk/src/core/IndexedDBManager/passkeyClientDB.ts` to store `signerMode`
- [ ] Add DB helpers: `getSignerMode(nearAccountId)` / `setSignerMode(nearAccountId, signerMode)`
- [ ] Set a sensible default on `registerUser()` (align with `tatchi.configs.signerMode` or `DEFAULT_SIGNING_MODE`)

### Phase 2 — UserPreferencesManager API + sync
- [ ] Add in-memory `signerMode` cache in `sdk/src/core/WebAuthnManager/userPreferences.ts`
- [ ] Load `signerMode` in `loadUserSettings()` / `loadSettingsForUser()`
- [ ] Add `getSignerMode()` / `setSignerMode()` methods (persist best-effort)
- [ ] Add `onSignerModeChange(cb)` subscription (mirrors theme/config listeners)

### Phase 3 — Resolve effective signer mode (respect prefs unless overridden)
- [ ] Add a `mergeSignerMode(base, override)` helper (do not clobber `behavior` unless explicitly overridden)
- [ ] Update callsites that default `signerMode` (React + core as needed) to use:
  - explicit override (`overrideSigningMode` / per-call `options.signerMode`)
  - else user preference
  - else `tatchi.configs.signerMode`
- [ ] Apply `resolveSignerModeForThresholdSigning` after merging so it can respect `behavior`

### Phase 4 — PasskeyAuthMenu UI
- [ ] Add “Signing mode” control to `sdk/src/react/components/PasskeyAuthMenu/client.tsx`
- [ ] On mount: read preference (fallback to `tatchi.configs.signerMode` until prefs load)
- [ ] On change: call `tatchi.userPreferences.setSignerMode(...)`
- [ ] Optional UX: surface relayer unsupported / missing threshold material (and explain fallback vs strict)

### Phase 5 — Wallet-iframe mode (optional)
- [ ] Extend wallet-iframe “preferences changed” payload to include `signerMode`
- [ ] Mirror wallet-host signerMode into app-origin (`applyWalletHostSignerMode(...)`)
- [ ] Ensure UI reads/writes through the correct owner (wallet host in iframe mode)

### Phase 6 — Tests / validation
- [ ] Unit tests: `UserPreferencesManager` loads/saves `signerMode` + fires listeners
- [ ] UI test: PasskeyAuthMenu toggles signer mode and calls `setSignerMode`
- [ ] Integration: default signerMode uses stored preference; per-call override still wins

## 0) Product decisions (lock these first)

- **Preference scope:** per-user (`nearAccountId`) in IndexedDB (same place as `confirmationConfig`), not a global per-device toggle.
- **What is selectable:**
  - `local-signer`
  - `threshold-signer` with `behavior: 'strict' | 'fallback'` (either as an “Advanced” toggle or a 3rd option).
- **Defaulting rules (priority order):**
  1) explicit override (per-call `options.signerMode` / `overrideSigningMode`)
  2) stored user preference (new)
  3) app/integrator default `tatchi.configs.signerMode` (current behavior)
- **Override merge semantics (like `determineConfirmationConfig`):**
  - Treat overrides as a *partial overlay* on top of the base signer mode.
  - If an override only switches `mode` (e.g. `'threshold-signer'`), do **not** accidentally reset stored `behavior` (otherwise fallback vs strict changes unexpectedly).
  - Only override `behavior` when it’s explicitly provided.
- **Availability rules:** if threshold material is missing or relayer is unsupported, keep current runtime behavior via `resolveSignerModeForThresholdSigning` (and respect `behavior`).

## 1) Persist the preference (IndexedDB)

Files:
- `sdk/src/core/IndexedDBManager/passkeyClientDB.ts`
- `sdk/src/core/WebAuthnManager/userPreferences.ts`

Steps:
1) Extend `UserPreferences` to include a new field, e.g. `signerMode?: SignerMode` (or `signerMode?: SignerMode['mode']` + `thresholdBehavior?: ThresholdBehavior`).
2) Update `registerUser()` default `preferences` to include the default signer mode (from `DEFAULT_SIGNING_MODE` or `configs.signerMode` if available at that callsite).
3) Add DB helpers mirroring theme helpers:
   - `getSignerMode(nearAccountId)` → returns stored mode or default.
   - `setSignerMode(nearAccountId, signerMode)` → `updatePreferences(...)`.
4) In `UserPreferencesManager`:
   - Add in-memory state for signer mode (default `DEFAULT_SIGNING_MODE`).
   - Load it in `loadUserSettings()` / `loadSettingsForUser()`.
   - Persist it alongside `confirmationConfig` in `saveUserSettings()` (or via a dedicated `setSignerMode()` method).
   - Add an `onSignerModeChange(cb)` subscription similar to `onThemeChange` / `onConfirmationConfigChange`.

## 2) Make the SDK actually use the preference (default signerMode)

Files:
- `sdk/src/react/context/useTatchiContextValue.ts`
- (optional core parity) `sdk/src/core/TatchiPasskey/*` where signerMode is resolved

Steps:
1) Introduce a small resolver (patterned after `determineConfirmationConfig`) that computes an effective `SignerMode`:
   - `base = userPrefSignerMode ?? tatchi.configs.signerMode`
   - `effective = mergeSignerMode(base, overrideSigningMode || args.options?.signerMode)` (do not clobber `behavior` with “mode-only” overrides)
   - `finalMode = await resolveSignerModeForThresholdSigning({ signerMode: effective, ... })` (material/relayer checks)
2) Update React wrappers (`executeAction`, `signNEP413Message`, `signDelegateAction`, etc.) to use `finalMode` when callers didn’t provide an explicit override.
2) For registration/login flows:
   - Ensure `registerPasskey(...)` and `loginAndCreateSession(...)` propagate the preference when `options.signerMode` is not specified (so PasskeyAuthMenu selection affects auth flows too).
3) Keep `resolveSignerModeForThresholdSigning` as the final gate for threshold availability (material/relayer checks), and make sure it sees the merged `behavior`.

## 3) Expose the preference in PasskeyAuthMenu (UI)

Files:
- `sdk/src/react/components/PasskeyAuthMenu/client.tsx`
- `sdk/src/react/components/PasskeyAuthMenu/controller/usePasskeyAuthMenuController.ts` (if state/logic lives in controller)
- `sdk/src/react/components/PasskeyAuthMenu/types.ts` (only if new props are needed)

Steps:
1) Add a small “Signing mode” control (likely a `SegmentedControl`) with:
   - Local
   - Threshold
   - Optional: “Fallback” toggle when Threshold is selected.
2) On mount:
   - Read current preference from `runtime.tatchiPasskey.userPreferences` (or fall back to `runtime.tatchiPasskey.configs.signerMode` until prefs load).
3) On change:
   - Call `tatchi.userPreferences.setSignerMode(...)` to persist and notify listeners.
4) UX rules:
   - Disable threshold option (or show a warning) when relayer isn’t configured / threshold healthz is false.
   - If the account has no threshold key material, surface that (and explain fallback vs strict).

## 4) Wallet-iframe mode (sync preferences across origins)

If you need this to work when the app embeds the wallet service:
1) Extend the wallet-iframe “preferences changed” payload to include `signerMode`.
2) Mirror the wallet-host signerMode into app-origin via a new `UserPreferencesManager.applyWalletHostSignerMode(...)` (similar to `applyWalletHostConfirmationConfig`).
3) Ensure PasskeyAuthMenu still reads/writes through the correct owner (wallet host in iframe mode).

## 5) Tests / validation

- Add unit tests for `UserPreferencesManager` load/save of `signerMode` (and listener firing).
- Add a small React test (or existing test harness) ensuring PasskeyAuthMenu renders the selector and calls `setSignerMode`.
- Add/extend an integration test that asserts a call without `options.signerMode` uses the stored preference (and still respects per-call overrides).
