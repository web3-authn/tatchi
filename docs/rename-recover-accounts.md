# Rename `recoverAccount` → `syncAccount` (Plan)

## Goal

Rename the “account recovery” API surface to “sync account” to better reflect what it actually does: rebuild/sync local IndexedDB state from on-chain data using an existing passkey (not “recover a lost passkey”).

## Scope / Compatibility (Decision)

- This is a **full clean sweep** rename: **no deprecated aliases**, no re-exports, and no dual-support/fallback shims.
- Treat as a **breaking change** (major version bump) and update all internal + external call sites in the same PR.
- Rename wallet-iframe postMessage types and exported symbols at the same time.
- Rename progress event types and (recommended) update the phase string values to remove `account-recovery-*` in emitted payloads.

## Naming Map (Final)

### Core (non-React)

- File: `sdk/src/core/TatchiPasskey/recoverAccount.ts` → `sdk/src/core/TatchiPasskey/syncAccount.ts`
- Flow class: `AccountRecoveryFlow` → `SyncAccountFlow`
- Core function: `recoverAccount(...)` → `syncAccount(...)`
- Result types:
  - `RecoveryResult` → `SyncAccountResult`
  - `AccountLookupResult` → `SyncAccountLookupResult`
- `ContractStoredAuthenticator` stays named as-is, but its import path will change after the file rename.

### TatchiPasskey API surface

Choose one and apply everywhere:

- **Option A (recommended):** `recoverAccountFlow(...)` → `syncAccount(...)` (1-call “do it” method; matches `registerPasskey`, `loginAndCreateSession`)
- **Option B:** `recoverAccountFlow(...)` → `syncAccountFlow(...)` (keeps existing naming pattern)

### Progress events (SDK `onEvent`)

- `AccountRecoveryPhase` → `SyncAccountPhase`
- `AccountRecoveryStatus` → `SyncAccountStatus`
- `AccountRecoverySSEEvent` → `SyncAccountSSEEvent`
- `AccountRecoveryHooksOptions` → `SyncAccountHooksOptions`
- Rename emitted phase values (recommended):
  - `account-recovery-complete` → `sync-account-complete`
  - Keep the other shared values as-is (`preparation`, `webauthn-authentication`, `sync-authenticators-onchain`, `authenticator-saved`, `error`)

### Wallet iframe protocol (postMessage RPC)

- RPC type: `PM_RECOVER_ACCOUNT_FLOW` → `PM_SYNC_ACCOUNT_FLOW`
- Client API: `recoverAccountFlow(...)` → `syncAccount(...)` / `syncAccountFlow(...)` (match the TatchiPasskey API decision)

### React API + UI

- `useTatchi()` method:
  - `recoverAccount(...)` → `syncAccount(...)` (the React wrapper should match the TatchiPasskey 1-call method name)
- `PasskeyAuthMenu` props:
  - `onRecoverAccount` → `onSyncAccount`
  - Headings config key: `recoverAccount` → `syncAccount`
- Auth menu mode:
  - `AuthMenuMode.Recover` → `AuthMenuMode.Sync`
  - `AuthMenuModeMap[...]= 'recover'` → `'sync'`
  - Update all UI copy that says “Recover” when it refers to passkey-based sync (keep “Recover Account with Email” for email recovery if desired)

## Implementation Plan

### 0) Inventory (start here so the PR is bounded)

- [ ] Run `rg -n "\\brecoverAccount\\b|AccountRecovery|PM_RECOVER_ACCOUNT_FLOW|onRecoverAccount|AuthMenuMode\\.Recover" -S` and keep the initial list in the PR description.
- [ ] Confirm which public API option we want for TatchiPasskey (Option A vs B above) and apply consistently across core + iframe + React + docs/examples.

### 1) Core flow module rename (`sdk/src/core/TatchiPasskey`)

- [ ] Move `sdk/src/core/TatchiPasskey/recoverAccount.ts` → `sdk/src/core/TatchiPasskey/syncAccount.ts`.
- [ ] Inside the moved file:
  - [ ] `AccountRecoveryFlow` → `SyncAccountFlow`
  - [ ] `recoverAccount(...)` → `syncAccount(...)`
  - [ ] `RecoveryResult` → `SyncAccountResult`
  - [ ] `AccountLookupResult` → `SyncAccountLookupResult`
  - [ ] Update log prefixes:
    - `AccountRecoveryFlow:` → `SyncAccountFlow:`
    - `[recoverAccount]` / `[performAccountRecovery]` → `[syncAccount]` / `[performAccountSync]` (or similar; keep consistent)
  - [ ] Ensure any exported types used elsewhere remain exported (e.g. `ContractStoredAuthenticator`)

### 2) TatchiPasskey surface + exports (`sdk/src/core/TatchiPasskey/index.ts`, `sdk/src/index.ts`)

- [ ] Update `sdk/src/core/TatchiPasskey/index.ts`:
  - [ ] Rename section comment headers (“Account Recovery Flow”) → “Account Sync Flow”.
  - [ ] Rename private field `activeAccountRecoveryFlow` → `activeSyncAccountFlow` (or remove if unused).
  - [ ] Rename the public method:
    - Option A: `recoverAccountFlow(...)` → `syncAccount(...)`
    - Option B: `recoverAccountFlow(...)` → `syncAccountFlow(...)`
  - [ ] Update dynamic import `import('./recoverAccount')` → `import('./syncAccount')`.
  - [ ] Update any type imports: `import type { RecoveryResult } from './recoverAccount'` → `SyncAccountResult` from `./syncAccount`.
  - [ ] Update re-exports at the bottom:
    - types (`RecoveryResult`, etc.)
    - flow class export (`AccountRecoveryFlow` → `SyncAccountFlow`)
- [ ] Update `sdk/src/index.ts` re-exports:
  - Remove `export { AccountRecoveryFlow } ...` and replace with `export { SyncAccountFlow } ...`
  - Replace re-exported event/type names (`AccountRecovery*` → `SyncAccount*`)

### 3) Fix imports that used the old module path

- [ ] Update `sdk/src/core/rpcCalls.ts` import:
  - `import type { ContractStoredAuthenticator } from './TatchiPasskey/recoverAccount'` → `./TatchiPasskey/syncAccount`
- [ ] Update `sdk/src/react/components/AccountMenuButton/LinkedDevicesModal.tsx` import:
  - `import type { ContractStoredAuthenticator } from '@/core/TatchiPasskey/recoverAccount'` → `@/core/TatchiPasskey/syncAccount`

Optional cleanup (not required for the rename, but improves layering):

- [ ] Move `ContractStoredAuthenticator` to a neutral type module (e.g. `sdk/src/core/types/authenticators.ts`) if we want contract call types to not “live under” `syncAccount.ts`.

### 4) Rename progress event types + values (`sdk/src/core/types/sdkSentEvents.ts`)

- [ ] In `sdk/src/core/types/sdkSentEvents.ts`:
  - [ ] Rename the enums/types/interfaces:
    - `AccountRecoveryPhase` → `SyncAccountPhase`
    - `AccountRecoveryStatus` → `SyncAccountStatus`
    - `AccountRecoverySSEEvent` → `SyncAccountSSEEvent`
    - `AccountRecoveryHooksOptions` → `SyncAccountHooksOptions`
    - `BaseAccountRecoveryEvent` → `BaseSyncAccountEvent`
    - `AccountRecoveryEventStep*` / `AccountRecoveryError` → `SyncAccountEventStep*` / `SyncAccountError`
  - [ ] Update the discriminated union types (`BaseSSEEvent.phase` and `BaseSSEEvent.status`) to include `SyncAccountPhase`/`SyncAccountStatus` instead of the old names.
  - [ ] Update the phase enum values to remove `account-recovery-complete` (recommended):
    - `STEP_5_*` should emit `sync-account-complete`

### 5) Wallet iframe protocol rename (postMessage)

- [ ] Update `sdk/src/core/WalletIframe/shared/messages.ts`:
  - [ ] `ParentToChildType` union: replace `'PM_RECOVER_ACCOUNT_FLOW'` with `'PM_SYNC_ACCOUNT_FLOW'`
  - [ ] `ParentToChildEnvelope` union: update the `RpcEnvelope<...>` entry accordingly
- [ ] Update `sdk/src/core/WalletIframe/client/router.ts`:
  - [ ] Rename method `recoverAccountFlow` → `syncAccount` / `syncAccountFlow` (match API decision)
  - [ ] Update the RPC send type: `type: 'PM_SYNC_ACCOUNT_FLOW'`
  - [ ] Rename the event filter/type-guard helpers:
    - `ACCOUNT_RECOVERY_PHASES` → `SYNC_ACCOUNT_PHASES`
    - `isAccountRecoverySSEEvent` → `isSyncAccountSSEEvent`
- [ ] Update `sdk/src/core/WalletIframe/client/on-events-progress-bus.ts`:
  - [ ] Replace `AccountRecoveryPhase` imports and any phase comparisons with `SyncAccountPhase`
- [ ] Update `sdk/src/core/WalletIframe/host/wallet-iframe-handlers.ts`:
  - [ ] Handler key `PM_RECOVER_ACCOUNT_FLOW` → `PM_SYNC_ACCOUNT_FLOW`
  - [ ] Call into the renamed TatchiPasskey method (`syncAccount` / `syncAccountFlow`)
- [ ] Update `sdk/src/core/WalletIframe/TatchiPasskeyIframe.ts`:
  - [ ] Rename `recoverAccountFlow(...)` → `syncAccount(...)` / `syncAccountFlow(...)`
  - [ ] Update imported hook option types (`AccountRecoveryHooksOptions` → `SyncAccountHooksOptions`)
- [ ] Update `sdk/src/core/WalletIframe/client/README-onevent-hooks.md` to reference `SyncAccountSSEEvent` (and new names).

### 6) React API + UI naming

- [ ] Update `sdk/src/react/types.ts`:
  - [ ] Rename the context method `recoverAccount(...)` → `syncAccount(...)`.
- [ ] Update `sdk/src/react/context/useTatchiContextValue.ts`:
  - [ ] `recoverAccount` callback → `syncAccount`, calling the renamed core method
- [ ] Update `sdk/src/react/context/useTatchiWithSdkFlow.ts`:
  - [ ] Rename wrapper `recoverAccountFlowWithSdkFlow` → `syncAccountWithSdkFlow`
  - [ ] Update `beginSdkFlow('recover', ...)` / `endSdkFlow('recover', ...)` labels to `'sync'`
  - [ ] Update phase comparisons from `AccountRecoveryPhase` to `SyncAccountPhase`
- [ ] Update `sdk/src/react/index.ts` re-exports:
  - [ ] Replace `AccountRecoveryPhase/Status` exports with `SyncAccountPhase/Status`
  - [ ] Replace `AccountRecoverySSEEvent` type export with `SyncAccountSSEEvent`
- [ ] Update `sdk/src/react/components/PasskeyAuthMenu/**`:
  - [ ] `authMenuTypes.ts`: `AuthMenuMode.Recover` → `AuthMenuMode.Sync`, map `'recover'` → `'sync'`, headings key rename
  - [ ] `types.ts`: `onRecoverAccount` → `onSyncAccount`
  - [ ] `client.tsx`: replace all references/copy for passkey-based “Recover” to “Sync” (labels, help text, placeholder)
  - [ ] `controller/mode.ts`: default title/subtitle for sync mode, headings override key
  - [ ] `controller/usePasskeyAuthMenuController.ts`: switch case/flow invocation `onRecoverAccount` → `onSyncAccount`
  - [ ] `skeleton.tsx` + `ui/AccountExistsBadge.tsx`: replace mode checks and any “Recover” labels
  - [ ] Keep “Recover Account with Email” wording if desired (email recovery is still “recovery”)

### 7) Tests, examples, and docs

#### Tests (`sdk/src/__tests__`)

- [ ] `sdk/src/__tests__/setup/flows.ts`:
  - [ ] Rename helper `recoverAccount(...)` → `syncAccount(...)`
  - [ ] Update the invoked API call `utils.tatchi.recoverAccountFlow(...)` → `utils.tatchi.syncAccount(...)` / `syncAccountFlow(...)`
- [ ] `sdk/src/__tests__/e2e/complete_ux_flow.test.ts`:
  - [ ] Update imports and usage of the renamed helper
- [ ] `sdk/src/__tests__/README.md`:
  - [ ] Update any code snippets mentioning `recoverAccount(...)`

#### Examples: `examples/tatchi-docs` (frontend + docs site)

Source code updates:

- [ ] Rename component files:
  - [ ] `examples/tatchi-docs/src/components/AccountRecovery.tsx` → `SyncAccount.tsx`
  - [ ] `examples/tatchi-docs/src/components/AccountRecovery.css` → `SyncAccount.css`
  - [ ] Update the component export `AccountRecovery` → `SyncAccount` and the default export
- [ ] Update imports/usages:
  - [ ] `examples/tatchi-docs/src/components/DemoPasskeyColumn.tsx`:
    - update lazy import/preload helpers to `SyncAccount`
    - rename carousel page title from “Account Recovery” → “Account Sync”
  - [ ] `examples/tatchi-docs/src/components/PasskeyLoginMenu.tsx`:
    - `tatchi.recoverAccountFlow(...)` → `tatchi.syncAccount(...)` / `syncAccountFlow(...)`
    - `AccountRecoveryPhase/Status` → `SyncAccountPhase/Status`
    - toast copy: “recovered successfully” → “synced successfully” (or similar)
  - [ ] Marketing copy (optional but recommended to match terminology):
    - `examples/tatchi-docs/src/components/BentoGrid.tsx` (“Account Recovery” card)
    - `examples/tatchi-docs/src/components/HomeHero.tsx` (“Fearless account recovery…”)
- [ ] Update VitePress docs (these are user-facing API docs and must match the rename):
  - [ ] `examples/tatchi-docs/src/docs/api/client.md` (`recoverAccountFlow` → new method)
  - [ ] `examples/tatchi-docs/src/docs/api/passkey-manager.md` (“Passkey recovery” → “Account sync”; method name updates)
  - [ ] `examples/tatchi-docs/src/docs/api/react-components.md` (“register/login/recover UI” → “register/login/sync UI”; prop/mode name updates if shown)
  - [ ] `examples/tatchi-docs/src/docs/getting-started/react-recipes.md`:
    - section title “register / login / recover” → “register / login / sync”
    - `onRecoverAccount` prop → `onSyncAccount`
    - code snippet calls `tatchi.syncAccount(...)` / `syncAccountFlow(...)`
  - [ ] `examples/tatchi-docs/src/docs/getting-started/next-steps.md` bullet “recover accounts” → “sync accounts”
  - [ ] `examples/tatchi-docs/src/docs/concepts/index.md` copy updates (if desired): “account recovery” → “account sync”

#### Other examples (keep repo green)

- [ ] `examples/vite/src/components/PasskeyLoginMenu.tsx`:
  - update `onRecoverAccount` prop name, `AuthMenuMode.*` rename, and any event type imports

#### Repo docs (`docs/`)

- [ ] `docs/email-recovery-flow.md`:
  - replace references to `recoverAccount.ts` / `AccountRecoveryFlow` / `AccountRecoveryHooksOptions` with the new names/paths

## Verification Checklist

- [ ] `rg -n \"\\brecoverAccount\\b|AccountRecovery\" -S` returns nothing.
- [ ] `rg -n \"PM_RECOVER_ACCOUNT_FLOW|AuthMenuMode\\.Recover|onRecoverAccount\" -S` returns nothing.
- [ ] `pnpm -C sdk type-check`
- [ ] `pnpm -C sdk test:unit` (or `pnpm test:unit`) for fast confidence
- [ ] `pnpm -C sdk test:e2e` if the rename touches E2E helpers (it will)
- [ ] `pnpm docs:build` (VitePress) to ensure examples/tatchi-docs code snippets still typecheck/build
