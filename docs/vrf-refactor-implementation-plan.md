# VRF Refactor Implementation Plan (Signer → VRF Worker, ConfirmTX Flow)

**Audience:** SDK maintainers, wallet iframe implementers  
**Scope:** Refactor WebAuthn/VRF confirmation and key‑unwrapping so that:
- VRF/WebAuthn auth and `Kwrap` derivation happen in the VRF worker.
- The signer worker only sees `Kwrap + salt_wrap` and performs NEAR signing.
- The existing confirmTxFlow is reused from a VRF‑centric pipeline instead of from the signer worker.

This plan complements `docs/vrf_webauthn_hybrid_feature_spec.md` and maps it onto the current code:
- `sdk/src/core/WebAuthnManager/VrfWorkerManager`
- `sdk/src/core/WebAuthnManager/SignerWorkerManager`
- `sdk/src/core/web3authn-vrf.worker.ts`
- `sdk/src/core/web3authn-signer.worker.ts`
- `sdk/src/core/WebAuthnManager/SignerWorkerManager/confirmTxFlow/*`

---

## 1. Current Architecture vs Spec

### 1.1 Current runtime architecture (high‑level)

- **VRF Worker Manager** (`VrfWorkerManager`):
  - Manages VRF worker lifecycle and messaging (`sendMessage`).
  - Handles VRF keypair bootstrap, derivation from PRF (`deriveVrfKeypairFromRawPrf`, `unlockVrfKeypair`), and Shamir 3‑pass decrypt/encrypt.
  - Accepts PRF outputs extracted in JS (`extractPrfFromCredential`) and forwards them to the VRF worker.

- **VRF Worker** (`web3authn-vrf.worker.ts`):
  - Loads `wasm_vrf_worker`.
  - Exposes an async message handler `handle_message` for VRF operations:
    - `UNLOCK_VRF_KEYPAIR`
    - `GENERATE_VRF_CHALLENGE`
    - `DERIVE_VRF_KEYPAIR_FROM_PRF`
    - `SHAMIR3PASS_CLIENT_DECRYPT_VRF_KEYPAIR`
    - etc.
  - Does **not** currently derive or forward `Kwrap` to the signer worker.

- **Signer Worker Manager** (`SignerWorkerManager`):
  - Manages signer worker pooling and messaging (`sendMessage`).
  - Owns `confirmTxFlow` orchestration:
    - Listens for `PROMPT_USER_CONFIRM_IN_JS_MAIN_THREAD` from signer worker.
    - Calls `handlePromptUserConfirmInJsMainThread` with context (NearClient, VrfWorkerManager, NonceManager, UserPreferencesManager, etc.).
  - Signing APIs (`signTransactionsWithActions`, `signNep413Message`, `exportNearKeypairUi`, etc.) call into handlers that ultimately send messages to the signer worker.

- **Signer Worker** (`web3authn-signer.worker.ts`):
  - Loads `wasm_signer_worker` and exposes `handle_signer_message`.
  - Exposes `awaitSecureConfirmationV2` to WASM:
    - Posts `PROMPT_USER_CONFIRM_IN_JS_MAIN_THREAD` to main thread with a typed `SecureConfirmRequest`.
    - Waits for `USER_PASSKEY_CONFIRM_RESPONSE` from main thread, containing:
      - `confirmed`
      - optional `credential`, `prfOutput`, `vrfChallenge`, `transactionContext`.
  - Uses PRF output and vault data (via Rust) to derive KEK and decrypt the NEAR key for signing.

- **Confirm TX Flow** (`SignerWorkerManager/confirmTxFlow/*`):
  - Main‑thread orchestration for secure confirmation:
    - `handleSecureConfirmRequest.ts` (`handlePromptUserConfirmInJsMainThread`) validates the request, classifies flow (LocalOnly / Registration / Signing), computes `ConfirmationConfig`, and dispatches to per‑flow handlers.
    - `flows/transactions.ts` handles NEAR context, VRF challenge (via `VrfWorkerManager`), UI, and WebAuthn credential collection for transaction signing.
    - The final `USER_PASSKEY_CONFIRM_RESPONSE` carries PRF output and VRF challenge back to the **signer worker**.

### 1.2 Spec’d target architecture (simplified)

From `vrf_webauthn_hybrid_feature_spec.md`:

- VRF worker:
  - Receives PRF.first_auth outputs.
  - Reconstructs `vrf_sk` (Shamir 3‑pass or PRF.second backup).
  - Derives `Kwrap = HKDF(HKDF(PRF.first_auth, \"vrf-wrap-pass\") || vrf_sk, \"near-wrap-seed\")`.
  - Sends **only `Kwrap + salt_wrap`** to the signer worker via a dedicated `MessageChannel`.

- Signer worker:
  - Receives `Kwrap + salt_wrap` and derives `KEK = HKDF(Kwrap, salt_wrap)`.
  - Decrypts `near_sk` from `C_near` and signs transactions.
  - Never sees PRF outputs or `vrf_sk`.

- Confirm TX flow:
  - Remains a main‑thread orchestration (UI, VRF challenge, WebAuthn get/create).
  - Should logically attach to the **VRF worker** as “auth/session” instead of to the signer worker:
    - The VRF side owns WebAuthn PRF, VRF proofs, and derivation of `Kwrap`.
    - The signer side is a consumer of `Kwrap` (plus vault bits) for NEAR signing.

---

## 2. Gaps Between Current Code and Target Design

1. **ConfirmTxFlow is wired to the signer worker, not VRF:**
   - Today, `awaitSecureConfirmationV2` is exposed from `web3authn-signer.worker.ts` and is invoked by Rust signer code.
   - The SecureConfirm request/response is conceptually VRF+TX context, but ends at the signer worker.

2. **VRF worker has no Kwrap/KEK pipeline:**
   - VRF WASM handles VRF keypair and Shamir operations but does not:
     - Derive `K_pass_auth` / `Kwrap` from PRF + `vrf_sk`.
     - Share `Kwrap` over a dedicated channel with the signer worker.

3. **Signer worker owns both “auth” and “signing” concerns:**
   - It uses PRF output directly (from SecureConfirm) to derive KEK and decrypt NEAR private key.
   - This contradicts the spec’s goal of confining PRF & `vrf_sk` handling to the VRF side.

4. **No explicit VRF↔Signer MessageChannel for Kwrap:**
   - Signer workers are created via `SignerWorkerManager.createSecureWorker` and used per‑request.
   - VRF worker and signer worker do not have a dedicated channel; communication is only main thread ↔ worker.

5. **PRF extraction still conceptually terminates at signer:**
   - ConfirmTxFlow currently returns PRF output to the signer worker (via `USER_PASSKEY_CONFIRM_RESPONSE`), not directly to the VRF worker.

---

## 3. Refactor Goals

1. **Move WebAuthn/VRF confirmation pivot to the VRF pipeline:**
   - VRF/session logic drives confirmation and WebAuthn PRF collection.
   - Signer worker becomes a consumer of VRF session state (`Kwrap`, vault bits).

2. **Consolidate PRF handling in VRF‑centric codepaths:**
   - PRF outputs should be:
     - Collected in the wallet iframe main thread.
     - Immediately forwarded into VRF code (manager + worker).
     - Never passed as a “final secret” to the signer worker.

3. **Introduce a VRF→Signer worker channel for Kwrap:**
   - A MessageChannel or equivalent abstraction created inside the VRF manager/iframe, not exposed to the dApp origin.
   - Used to send `Kwrap + salt_wrap` (and necessary vault metadata) from VRF to signer worker(s).

4. **Minimize impact on UI/flows:**
   - The confirmTxFlow APIs, types, and UI behavior should remain mostly stable.
   - The main visible change is **which worker ultimately consumes the SecureConfirm response**.

---

## 4. Implementation Plan (Phased)

### Phase 1 – Introduce VRF‑centric SecureConfirm bridging (JS only)

**Goal:** Allow VRF‑side logic to reuse confirmTxFlow without changing Rust yet.

- **Step 1.1 – Add a VRF‑side SecureConfirm bridge:**
  - Create a new VRF helper (e.g. `sdk/src/core/WebAuthnManager/VrfWorkerManager/secureConfirmBridge.ts`) that:
    - Constructs a `SecureConfirmRequest` for signing/NEP‑413 flows (using same shapes as today).
    - Calls `handlePromptUserConfirmInJsMainThread` directly with a **VRF‑specific context**:
      - NearClient, VrfWorkerManager, NonceManager, UserPreferencesManager, TouchIdPrompt, etc.
      - This can reuse most of `SignerWorkerManagerContext` or a refactored shared context type.
    - Returns a normalized result:
      - `confirmed`
      - `credential` (if needed)
      - `prfOutput` (if still required in transitional phase)
      - `vrfChallenge`, `transactionContext`.

- **Step 1.2 – Refactor confirmTxFlow to accept a generic context:**
  - Extract an interface `SecureConfirmHostContext` that is a superset of what both managers need:
    - `nearClient`, `vrfWorkerManager`, `userPreferencesManager`, `nonceManager`, `touchIdPrompt`, `indexedDB`, etc.
  - Make `SignerWorkerManager.getContext()` conform to this interface.
  - Add a `VrfConfirmContext` builder in VRF manager (or wallet iframe host code) to build the same shape.
  - Update `handlePromptUserConfirmInJsMainThread` and flow modules (`flows/*`) to depend on `SecureConfirmHostContext` instead of `SignerWorkerManagerContext` directly.

- **Step 1.3 – Keep existing signer‑worker SecureConfirm path intact:**
  - Do not yet change `awaitSecureConfirmationV2` or Rust signer code.
  - This ensures we can introduce VRF‑side SecureConfirm gradually and test both paths.

### Phase 2 – Add Kwrap derivation & VRF→Signer channel

**Goal:** Implement the spec’d Kwrap derivation and internal channel while preserving behavior.

- **Step 2.1 – Extend VRF WASM + types for Kwrap flow:**
  - In the VRF worker’s Rust crate, add a request:
    - `DERIVE_KWRAP_AND_SESSION` (name illustrative), with payload including:
      - `prf_output` (PRF.first_auth).
      - VRF session/relay info (for Shamir path).
      - Vault metadata needed to compute `Kwrap` (and optionally preload KEK‑related materials).
  - Response includes:
    - `session_id` (optional handle).
    - `Kwrap`.
    - `salt_wrap`.
    - Any VRF proofs needed for on‑chain verification.
  - Wire this through:
    - `types/vrf-worker.ts`.
    - `VrfWorkerManager` methods (e.g., `deriveKwrapAndSession`).

- **Step 2.2 – Introduce VRF→Signer MessageChannel abstraction:**
  - In the wallet iframe layer (or a small coordination module), create a `KwrapChannel`:
    - Encapsulates a `MessageChannel` created in the iframe context.
    - Holds:
      - A port wired to the signer worker (when spawned).
      - A port wired to VRF‑side JS (or directly to VRF worker via `postMessage` with `port` transfer).
    - The channel is **never** exposed to the dApp origin; it is internal to the wallet iframe.
  - Define a small protocol for messages on this channel:
    - `{ type: 'KWRAP_SESSION', sessionId, kwrap, saltWrap, vaultRef }`.
    - Possibly `{ type: 'SESSION_EXPIRE', sessionId }` for expiry semantics.

- **Step 2.3 – Make signer worker accept Kwrap channel input:**
  - Extend signer worker Rust and TS bindings such that:
    - For signing flows, instead of directly consuming PRF output as KEK, the signer expects:
      - Incoming `Kwrap + salt_wrap` (via `KwrapChannel` or a main‑thread envelope).
      - Vault ciphertext `C_near` and associated metadata.
    - Signer worker derives `KEK = HKDF(Kwrap, salt_wrap)` and decrypts `near_sk`.
  - In TS, adapt the message type for `SignTransactionsWithActions` and NEP‑413 flows so they include:
    - A `sessionId` or explicit `kwrapPayload` field when used in VRF‑refactored mode.

### Phase 3 – Move transaction SecureConfirm to VRF‑driven path

**Goal:** For new flows, SecureConfirm/WebAuthn is initiated and consumed by the VRF side, not by the signer worker.

- **Step 3.1 – Add VRF‑driven signing entrypoints:**
  - In `VrfWorkerManager` (or a new higher‑level coordinator), add APIs such as:
    - `confirmAndPrepareSigningSession(args): Promise<{ sessionId, kwrapPayload, transactionContext }>`:
      - Uses the VRF‑side SecureConfirm bridge (Phase 1) to:
        - Classify flow as Signing.
        - Fetch NEAR context and VRF challenge (existing logic in `flows/transactions.ts`).
        - Render UI and collect WebAuthn credentials.
      - Calls VRF WASM to:
        - Use PRF.first_auth to reconstruct `vrf_sk` (Shamir or PRF.second) and derive `Kwrap`.
      - Produces a `sessionId` and `kwrapPayload`.

- **Step 3.2 – Wire signer calls to consume VRF sessions:**
  - Update `SignerWorkerManager.signTransactionsWithActions` so that:
    - Option A (transitional): it can still use the old signer‑worker‑driven SecureConfirm path.
    - Option B (new VRF mode): it calls the VRF‑driven `confirmAndPrepareSigningSession`, then:
      - Sends a `SignTransactionsWithActions` message to the signer worker including the `kwrapPayload` and `transactionContext`.
      - Signer worker performs signing without ever invoking SecureConfirm on its own.
  - Gradually flip the default to the VRF‑driven path once stable.

- **Step 3.3 – Align NEP‑413 and other signing flows:**
  - Mirror Step 3.1 and 3.2 for NEP‑413 and any other signing flows using SecureConfirm.
  - Ensure they go through the VRF‑driven SecureConfirm + `Kwrap` derivation instead of signer‑worker SecureConfirm.

### Phase 4 – Retire signer‑worker SecureConfirm path

**Goal:** Make the signer worker a pure Kwrap/KEK/NEAR‑signing enclave.

- **Step 4.1 – Deprecate `awaitSecureConfirmationV2` from signer worker:**
  - Once all production signing flows use the VRF‑driven path, remove:
    - The global `awaitSecureConfirmationV2` bridge assignment in `web3authn-signer.worker.ts`.
    - The `SecureConfirmMessageType` coupling in signer worker runtime.
  - Remove associated Rust glue code that calls `awaitSecureConfirmationV2` directly.

- **Step 4.2 – Restrict signer worker request types to Kwrap‑based flows:**
  - Ensure all signing‑related request types require a `kwrapPayload` and do not accept PRF outputs directly.
  - Confirm that no caller can accidentally pass PRF outputs into signer worker messages.

- **Step 4.3 – Documentation & safety invariants:**
  - Update docs to make explicit:
    - “Signer worker never initiates WebAuthn; it never sees PRF or vrf_sk.”
    - “All WebAuthn auth and PRF handling happens via VRF manager + confirmTxFlow in the wallet iframe main thread.”

---

## 5. ConfirmTxFlow‑Specific Considerations

1. **Main‑thread only orchestration remains:**
   - The confirmTxFlow continues to run in the wallet iframe main thread, as today.
   - The critical change is which worker ultimately consumes the `USER_PASSKEY_CONFIRM_RESPONSE`.

2. **Migration of responsibilities from signer to VRF:**
   - Today:
     - Rust signer worker calls `awaitSecureConfirmationV2`, sending `SecureConfirmRequest`.
     - Main thread orchestrates UI and returns PRF output to signer worker.
   - Target:
     - VRF‑side JS (or Rust) initiates SecureConfirm (reusing confirmTxFlow).
     - Main thread orchestrates UI and returns credential/PRF directly into VRF pipeline.
     - VRF worker derives `Kwrap` and hands off a session to signer worker.

3. **Testing strategy:**
   - Keep existing unit/integ tests for confirmTxFlow intact while adding:
     - Tests for the VRF‑driven bridge that exercises the same flows (Registration, Signing, LocalOnly).
     - Tests that assert:
       - PRF output never appears in signer worker messages in VRF‑mode.
       - `Kwrap` is only emitted in VRF→Signer messages and never logged/forwarded via generic channels.

---

## 6. Interim Constraints and Backwards Compatibility

- **Dual mode for a period:**
  - Allow both:
    - Legacy signer‑worker SecureConfirm path (for stability and rollback).
    - New VRF‑driven path (behind a feature flag or configuration).

- **Feature flagging:**
  - Introduce an internal flag (e.g. `enableVrfKwrapRefactor`) in configuration:
    - When `false`: use existing signer‑worker SecureConfirm path.
    - When `true`: route signing flows through VRF‑driven confirm + `Kwrap` session.

- **No changes to wallet iframe public API initially:**
  - External integrators should continue to use the same SDK surface (`signTransactionsWithActions`, etc.).
  - The refactor should be internal to the wallet iframe + workers.

---

## 7. Summary

This plan:
- Moves the critical PRF/WebAuthn + VRF logic to the **VRF worker pipeline**, in line with `vrf_webauthn_hybrid_feature_spec.md`.
- Confines the real unwrapping key (`Kwrap`) to VRF/Signer workers and off the main thread.
- Refactors confirmTxFlow to be reusable by both signer and VRF side, then gradually re‑centers it on VRF.
- Enables a staged migration with dual‑mode support and minimal disruption to existing UI and APIs.

The key structural change is that **transaction confirmation and PRF handling become VRF‑centric**, and the signer worker becomes a narrow “Kwrap → KEK → NEAR signature” enclave. This is what delivers the main security improvement while keeping the current confirmTxFlow UX model. 

