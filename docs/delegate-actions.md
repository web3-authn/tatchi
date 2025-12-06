**Delegate Actions (NEP‑461) — Implementation Plan**

- Goal: Add first‑class support for NEAR delegate actions (NEP‑461) end‑to‑end: encode and sign in the WASM signer worker, wire orchestration in the TatchiPasskey SDK with typed progress events, and expose the flow through the wallet iframe with confirmation UI and routing.
- Non‑goals: Building a relayer service. We return a `SignedDelegate` to the caller and optionally submit via an existing relayer integration when configured.

**References**
- DelegateAction encoding, prefix and schema match @near-js/transactions (e.g., v2.4.0)
- DelegateActionPrefix: `1073742190` = `2^30 + 366` (NEP‑461 actionable message base is `2^30`)
- Example meta‑transaction wrapping by relayer: meta-transaction.ts

**Deliverables**
- New worker request/response for signing delegate actions, schema + Borsh encoding, and integration with the existing confirm‑tx flow.
- New TatchiPasskey method: `signDelegateAction` with progress events and unit tests for encoding/compat.
- Wallet iframe routing, host handler, and confirm UI plumbing for delegate actions.

**Stage 1 — WASM Signer Worker (session‑based, VRF‑gated)**
- Add request/response types and a handler that mirrors the new session‑based `SignTransactionsWithActions` flow: signer worker only decrypts and signs using a pre‑confirmed VRF/WebAuthn session and a `WrapKey` derived from `WrapKeySeed` sent over a `MessagePort`.
  - Files to update:
    - `sdk/src/wasm_signer_worker/src/types/worker_messages.rs`
    - `sdk/src/wasm_signer_worker/src/lib.rs`
    - `sdk/src/wasm_signer_worker/src/handlers/` (new `handle_sign_delegate_action.rs`, following `handle_sign_transactions_with_actions.rs`)
    - `sdk/src/wasm_signer_worker/src/types/near.rs` (delegate types; or colocate with existing NEAR types)
    - `sdk/src/wasm_signer_worker/src/encoders.rs` (borsh + prefix encoder, or colocate with transaction encoders)
  - New signer‑worker request/response variants:
    - `WorkerRequestType::SignDelegateAction`
    - `WorkerResponseType::SignDelegateActionSuccess` | `SignDelegateActionFailure`
  - Request payload (Rust struct, `wasm_bindgen`), shaped like `SignTransactionsWithActionsRequest` but for a single delegate:
    - `rpc_call: RpcCallPayload` — same shape as existing flows (contractId, nearRpcUrl, nearAccountId).
    - `session_id: String` — used to look up the `WrapKey` via `lookup_wrap_key_shards` after the VRF worker has delivered `wrap_key_seed`/`wrapKeySalt` for this session.
    - `created_at: Option<f64>` — for session expiry checks against `SESSION_MAX_DURATION_MS`.
    - `decryption: DecryptionPayload` — encrypted NEAR private key data + IV.
    - `delegate: { sender_id, receiver_id, actions_json, nonce, max_block_height, public_key }`
      - `actions_json: string` is `ActionParams[]` JSON (same representation as `TransactionPayload.actions`).
    - `confirmation_config?: ConfirmationConfig` — forwarded for telemetry / parity with other flows.
    - `intent_digest?: String` — must match the digest returned by the VRF worker’s confirmation step.
    - `transaction_context?: TransactionContext` — carries `nextNonce`, `txBlockHash`, etc. for delegate hashing.
    - `credential?: String` — optional, mirrors transaction signing; can be used for additional checks/logging.
  - Response payload:
    - `{ success: true, signed_delegate: WasmSignedDelegate, hash: string, logs: string[] }`
    - Or `{ success: false, error, logs }`
  - Confirm / VRF / sign flow (updated for the dual‑worker architecture):
    - Confirm + VRF gating (VRF worker):
      - The VRF worker orchestrates WebAuthn PRF + VRF challenge and calls `awaitSecureConfirmationV2` with `type: 'signDelegateAction'`, including `{ receiverId, actions, nonce, maxBlockHeight }` in the payload.
      - It computes and returns `intent_digest`, `transaction_context`, `wrap_key_seed`, `wrap_key_salt`, `vrf_challenge`, and the confirmation result (`confirmed`, `credential`, `error`) via `WorkerConfirmationResponse`.
      - Using `attach_wrap_key_seed_port(sessionId, port)`, the VRF worker delivers `wrap_key_seed`/`wrapKeySalt` to the signer worker for that `sessionId`.
    - Decrypt + sign (signer worker):
      - `handle_sign_delegate_action` resolves `WrapKey` from `WRAP_KEY_SEED_SESSIONS` using `session_id`, then calls `wrap_key.derive_kek()` and decrypts the NEAR private key using `DecryptionPayload`, as in `handle_sign_transactions_with_actions`.
      - It validates the pre‑confirmed context (`intent_digest`, `transaction_context`) and checks that the `delegate.public_key` matches the decrypted device key.
      - It builds a `DelegateAction` struct, encodes it with NEP‑461 prefix (`DELEGATE_ACTION_PREFIX`), computes `sha256(encode_delegate_action(delegate))`, and signs the hash with Ed25519.
      - Returns `{ hash, signed_delegate }` where `signed_delegate` contains `{ delegateAction, signature { keyType, data } }`.
  - Encoding and schema:
    - Implement `encode_delegate_action(delegate: DelegateAction) -> Vec<u8>` that prepends the NEP‑461 prefix before Borsh‑serializing the `DelegateAction` (mirror `@near-js/transactions` `encodeDelegateAction`). The prefix is a Borsh struct `{ prefix: u32 }` with value `2^30 + 366`.
    - Hashing/signing: compute `sha256(encode_delegate_action(delegate))` and Ed25519‑sign that hash. Do not include the signature during hashing.
    - Implement `encode_signed_delegate(sd: SignedDelegate) -> Vec<u8>` for completeness/testing. This is a plain Borsh serialization of `{ delegateAction, signature }` and does not include the prefix (matches `@near-js/transactions` `encodeSignedDelegate`).
  - Progress events:
    - Reuse the existing session‑based mapping used by `handle_sign_transactions_with_actions`:
      - `ProgressMessageType::ExecuteActionsProgress` / `ExecuteActionsComplete`.
      - `ProgressStep::UserConfirmation` → “Using pre-confirmed VRF/WebAuthn session for delegate signing…”
      - `ProgressStep::Preparation` → build/validate delegate inputs.
      - `ProgressStep::TransactionSigningProgress` → “Decrypting private key and signing delegate action…”
      - `ProgressStep::TransactionSigningComplete` → success/failure summary.
    - Optionally add a `context: 'delegate'` field in the progress `data` payload for UI filtering.
  - Exports (`wasm_bindgen`):
    - Re‑export new types for TS: `DelegateAction`, `SignedDelegate`, `WasmSignedDelegate` (TS‑friendly wrapper), and request/response classes, alongside the existing NEAR types already exported from `lib.rs`.

**Stage 2 — TatchiPasskey SDK**
- Implement the JS/TS orchestration and types, bridging to the new worker request.
  - Files to add/update:
    - `sdk/src/core/TatchiPasskey/delegateAction.ts` — new orchestration entry point
    - `sdk/src/core/WebAuthnManager/SignerWorkerManager/handlers/signDelegateAction.ts` — worker call wrapper
    - `sdk/src/core/WebAuthnManager/SignerWorkerManager/index.ts` — expose `signDelegateAction`
    - `sdk/src/core/TatchiPasskey/index.ts` — public API surface `signDelegateAction`
    - `sdk/src/core/types/delegate.ts` — TS types for `DelegateAction`, `SignedDelegate`, `Signature`, `PublicKey`
    - `sdk/src/core/types/signer-worker.ts` — map new worker req/resp and type guards
    - `sdk/src/core/types/passkeyManager.ts` — optionally add `DelegateActionPhase` or reuse `ActionPhase`
  - API surface:
    - `tatchi.signDelegateAction({ nearAccountId, delegate, options })`
      - `delegate: { senderId, receiverId, actions: Action[], nonce: string | bigint, maxBlockHeight: string | bigint, publicKey: string | PublicKey }`
      - `options?: { onEvent?: (ev: DelegateSSEvent | ActionSSEvent) => void }`
      - Returns: `{ hash: Uint8Array, signedDelegate: SignedDelegate, nearAccountId }`
  - Worker call:
    - Resolve `rpcCall` (`contractId`, `nearRpcUrl`, `nearAccountId`), fetch `encryptedKeyData` from IndexedDB, create a single‑item payload with `actions` as JSON.
    - Send `WorkerRequestType.SignDelegateAction` and bridge progress via the Router as with `signTransactionsWithActions`.
  - Progress events:
    - Reuse `ActionSSEEvent` for an initial version. If differentiation is needed, add `DelegateActionPhase` and `isDelegateSSEEvent` guard in `router.ts` later.
  - Validation:
    - Ensure the delegate `publicKey` string equals the current device key. If mismatch, throw before calling worker.
    - Validate `actions` with existing `validateActionArgsWasm`.
  - Optional high‑level helper:
    - `passkeyManager.sendDelegateActionViaRelayer({ signedDelegate, relayer })` to POST to a configured relayer (or return the payload to the app to submit).

**Stage 3 — Wallet Iframe Integration**
- Add a typed RPC route to sign delegate actions through the iframe host.
  - Files to update:
    - `sdk/src/core/WalletIframe/shared/messages.ts` — add `ParentToChildType` variant `'PM_SIGN_DELEGATE_ACTION'` with payload `{ nearAccountId, delegate, options? }`
    - `sdk/src/core/WalletIframe/client/router.ts` — add `signDelegateAction()` helper mirroring `signTransactionsWithActions()` and progress bridging; compute overlay intent same as tx signing
    - `sdk/src/core/WalletIframe/host/wallet-iframe-handlers.ts` — implement `'PM_SIGN_DELEGATE_ACTION'` handler: call `pm.signDelegateAction(...)` and return `PM_RESULT`
    - `sdk/src/core/WalletIframe/host/wallet-iframe-host.ts` — ensure message dispatch picks up the new handler
  - Confirmation UI:
    - The V2 confirm bridge already supports a schema’d request. When `type: 'signDelegateAction'`, surface `receiverId`, summarized `actions`, plus `nonce` and `maxBlockHeight` in the details panel.
    - No new Lit components are required; reuse the existing transaction confirm component with a small switch on payload type.

**Data Structures**
- TypeScript (SDK):
  - `DelegateAction { senderId, receiverId, actions: Action[], nonce: bigint, maxBlockHeight: bigint, publicKey: PublicKey }`
  - `SignedDelegate { delegateAction: DelegateAction, signature: Signature }`
- Rust (WASM):
  - `DelegateAction` and `SignedDelegate` mirror near-api-js schema (borsh). Add borsh derives and wasm_bindgen wrappers for exporting to JS.
  - Prefix encoder constant: `const DELEGATE_ACTION_PREFIX: u32 = 1073742190;` used before Borsh serialization.

**Progress Events**
- Initial implementation reuses action phases. Example messages:
  - step 1, phase `preparation` — “Preparing delegate inputs”
  - step 2, phase `user-confirmation` — “Requesting confirmation”
  - step 3, phase `contract-verification` — “Verifying credential”
  - step 4/5, phases `webauthn-authentication`/`authentication-complete`
  - step 6, phase `transaction-signing-progress` — “Signing delegate action”
  - step 7, phase `transaction-signing-complete`
- If needed, add a `DelegateActionPhase` with `delegate-signing-progress|complete` and a router type guard `isDelegateSSEEvent`.

**Relayer Integration**
- Caller options:
  - Receive `{ hash, signedDelegate }` and forward to an external relayer that wraps it in a `signedDelegate` action and signs/sends the outer transaction.
  - Or provide a configured relayer in SDK configs to auto‑POST a `SignedDelegate` and return the relayer’s transaction outcome (out of scope for this PR; keep plumbing ready).
- Examples reference:
  - `examples/relay-cloudflare-worker` provides a place to add a delegate execution route later.

**Validation & Testing**
- Unit tests (SDK + WASM):
  - Encoding parity: `encode_delegate_action` bytes match near-api-js for a fixed vector.
  - Signature verification: verify `SignedDelegate.signature` against the constructed message hash.
  - Public key mismatch produces a clear error.
- Integration tests:
  - Simulate the end‑to‑end flow using the existing confirm bridge with `type: 'signDelegateAction'` and assert progress events are emitted in order.
  - Ensure logs and error paths map to existing `ActionSSEEvent` error surfaces.
- E2E (Playwright):
  - Add a minimal “sign delegate action” demo page that triggers the new path and captures progress.

**Security Considerations**
- Always compute and bind an `intentDigest` over the same JSON `(receiverId, actions[])` shape shown in UI for delegate actions, and check the digest returned from the main thread before using decrypted key material.
- Ensure the presented `publicKey` equals the wallet’s device key; reject otherwise.
- UI should clearly show `receiverId`, total deposit across actions, and optionally `nonce`/`maxBlockHeight` for awareness.

**Feature Flag & Rollout**
- Add a config toggle `enableDelegateActions` (default: off) to reduce risk in early rollout. When disabled, SDK methods throw a clear “feature disabled” error.

**Concrete Task Checklist**
- [x] Wire `SignedDelegate` action enums
  - [x] Add `SignedDelegate` to Rust `ActionType` in `sdk/src/wasm_signer_worker/src/actions.rs`.
  - [x] Add `SignedDelegate` to TS `ActionType` in `sdk/src/core/types/actions.ts`.
- [ ] Worker
  - [ ] Add `SignDelegateAction` variants to `WorkerRequestType`/`WorkerResponseType` and map in `lib.rs`.
  - [ ] Implement `handle_sign_delegate_action.rs` with confirm‑verify‑decrypt‑sign and progress messages.
  - [ ] Implement NEP‑461 prefix encoding helpers and delegate Borsh schema.
  - [ ] Re‑export new types for TS and add wasm_bindgen wrappers.
- [ ] SDK
  - [ ] Implement `sdk/src/core/TatchiPasskey/delegateAction.ts` and public API in `TatchiPasskey/index.ts`.
  - [ ] Add `signDelegateAction` handler under `SignerWorkerManager/handlers/` and wire in the manager index.
  - [ ] Add TS types in `sdk/src/core/types/delegate.ts` and map worker req/resp in `types/signer-worker.ts`.
  - [ ] Add unit tests for encoding compatibility and key mismatch guard.
- [ ] Wallet Iframe
  - [ ] Add `'PM_SIGN_DELEGATE_ACTION'` envelope and payload types in `shared/messages.ts`.
  - [ ] Implement host handler in `host/wallet-iframe-handlers.ts` and router method in `client/router.ts`.
  - [ ] Extend confirm bridge consumer to render `type: 'signDelegateAction'` payloads.

**Open Questions**
- Do we need a dedicated progress phase set (e.g., `delegate-signing-progress`) or is reusing action phases sufficient for v1?
- Should the SDK offer a convenience `sendViaRelayer()` with retry/backoff and RPC status normalization now, or keep the scope to signing only?
