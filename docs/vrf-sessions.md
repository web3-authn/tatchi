# VRF‑WebAuthn Sessions — Using VRF as a Session‑Capability Primitive

We currently run a full VRF challenge + WebAuthn assertion on **every** signing request to unlock the `wasm-signer-worker`. That guarantees freshness and user presence, but for purely local signing (no network verifiers) the VRF step is redundant: if a PRF output is generated and consumed entirely locally, a static challenge would provide identical cryptographic guarantees. The useful thing we should keep is the VRF-WebAuthn handshake as a **session primitive**: unlock once with Touch ID/WebAuthn, then sign multiple transactions for a limited window.

---

## Why Per‑Transaction VRF Is Overkill for Local‑Only Signing
- When the PRF output never leaves the device, a fresh VRF output offers no extra security over a static challenge; it just adds a network round‑trip and latency.
- VRF challenges only matter when some remote party (relayer, RPC) needs to attest user presence or block freshness; a local signer does not.
- The current design spends a VRF challenge for every transaction, even though the output is consumed locally to unwrap keys in the worker.

## VRF‑WebAuthn as a Session Capability
- Treat the VRF‑WebAuthn handshake as minting a **session capability** that gates access to in‑memory keys in the `wasm-signer-worker`.
- Session scope can be time‑bound (`Y` minutes) and/or usage‑bound (`X` transactions). Once the allowance is exhausted, a new VRF‑WebAuthn handshake is required.
- The capability is derived from the VRF output (e.g., `session_secret = HKDF(vrf_output, "tatchi/session/v1")`) and stored only in memory; it never leaves the worker.
- Transaction signing reuses the cached session secret to unwrap the device key without re‑prompting WebAuthn until the session expires.

## Why VRF Improves Session Security
- **Freshness + replay resistance**: VRF challenges are unique and unpredictable; the VRF proof ties the session to that challenge, preventing offline minting or reuse of old assertions.
- **Block‑height binding**: Including the latest block height (or a recent window) in the challenge prevents “resume old session” attacks when chain state has advanced.
- **User presence binding**: The WebAuthn assertion proves touch/biometric presence over the exact VRF challenge, so a hostile host cannot fabricate a session token.
- **Server‑mediated policy**: The server that issues VRF challenges can encode policy (session TTL, tx budget, app ID) in the challenge, and the worker can enforce it when deriving/validating the session capability.
- **Auditability**: The same VRF verification path we already use for per‑tx signing can log when a session was minted (challenge, block height, app), giving clearer telemetry than silent local unlocks.

## Why VRF‑WebAuthn Is a Pillar for Frictionless UX
- **Challenge carries policy; wallet enforces caps**: Session TTL/tx budget/scope are encoded in the challenge and also bounded by local caps, so you can safely grant “unlock for a few minutes” without trusting an overly generous server.
- **Freshness gate before minting a session**: Block height/hash checks prevent stale challenges from creating long-lived sessions after the chain has advanced.
- **Worker‑only session material**: VRF worker owns the MessageChannel to the signer worker; only `WrapKeySeed + wrapKeySalt` cross workers. PRF outputs and session secrets never touch the main thread or dApp, reducing leak surface while keeping sessions warm.
- **One policy for primary + recovery**: Shamir (primary) and PRF.second (backup) unlocks both honor the same session limits, so recovery cannot bypass prompts or time/usage caps.
- **Per‑tx VRF is optional, not default**: With a valid session, skip per‑transaction VRF proofs to avoid prompt fatigue; reserve per‑tx VRF for high‑risk or remote‑attested actions.
- **Auditable session minting**: Each session has a verifiable VRF/WebAuthn trail (challenge, block height, app), giving you safer “fast lane” signing without losing accountability.

## Proposed Flow (Session Unlock → N Transactions)
1. **Fetch challenge**: Request a VRF challenge that embeds `{ app_id, block_height, nonce, maybe_tx_budget }`.
2. **WebAuthn assertion**: Browser prompts Touch ID/WebAuthn over the VRF challenge bytes.
3. **Verify + derive session** in the worker:
   - Verify VRF proof + WebAuthn attestation against the challenge.
   - Derive `session_secret` from the VRF output; cache with `{ expires_at, remaining_uses }`.
4. **Sign transactions**:
   - For each tx, require an active session; decrement `remaining_uses`.
   - Use `session_secret` to unwrap the device key (or the per‑device PRF output) without re‑prompting WebAuthn.
5. **Expire**: On TTL or usage exhaustion, clear the session secret and require a new VRF‑WebAuthn handshake.

## UX Impact
- One Touch ID prompt can authorize several transactions, matching “unlock wallet for a few minutes” expectations.
- Fewer network round‑trips after the initial session unlock; only the first request needs the VRF challenge.
- Clearer error states: “session expired” vs. generic WebAuthn failures on every tx.

## Final Invariants (VRF‑centric)
- VRF worker never handles `near_sk` or vault material; boundary guards reject forbidden fields (covered by unit tests).
- Signer worker only receives `WrapKeySeed + wrapKeySalt` via the VRF→Signer MessagePort; PRF never crosses the main thread.
- ConfirmTxFlow registration/link flows emit credentials + VRF context only; PRF/WrapKeySeed are intentionally absent from `USER_PASSKEY_CONFIRM_RESPONSE`.
- Export/decrypt, registration/recovery, and signing flows all ride the VRF bridge:
  - Decrypt/export: `prepareDecryptSession` in VRF Rust runs `DECRYPT_PRIVATE_KEY_WITH_PRF` via `awaitSecureConfirmationV2`, derives WrapKeySeed, and sends `WrapKeySeed + wrapKeySalt` to the signer worker for the session.
  - Registration/recovery: `derive_wrapKeySeed_and_session` in VRF Rust takes PRF.first_auth plus the in‑memory VRF key to derive WrapKeySeed and deliver it over the WrapKeySeed port.
  - Transaction / NEP‑413 signing: `confirmAndPrepareSigningSession` uses confirmTxFlow on the main thread to collect credentials + VRF context; VRF Rust handles WrapKeySeed derivation, and the signer worker only ever sees `WrapKeySeed + wrapKeySalt` from its WrapKeySeed port.
- Signer Rust never calls SecureConfirm; all prompts originate from VRF Rust via `awaitSecureConfirmationV2` and confirmTxFlow.
- Tests: VRF worker guard tests enforce forbidden fields; ConfirmTxFlow suites cover cancel/success parity and keep responses secret‑free.

## Open Items
- Choose defaults: reasonable `X` (tx count) and `Y` (minutes), plus whether challenges carry both and what local caps override them.
- Define a freshness window and reject stale block heights/hashes before minting a session.
- Spell out lifecycle hooks that zeroize session material on blur/close/crash.
- Decide whether to pre‑warm a session on app load or lazily on first signing attempt.
- Clarify when per‑tx VRF is required (remote attestation/high‑risk) versus skipped under a valid session.

## Implementation TODOs
- **Challenge schema**: Encode `{ ttl_ms, max_txs, app_id, scope, block_height/hash, nonce }` in the VRF challenge; document and version the schema.
- **Local caps + validation**: In the VRF worker, enforce wallet-side maxima for TTL/txs/scope before minting a session; reject challenges that exceed caps or mismatch requested scope.
- **Freshness window**: Define how to compare challenge block height/hash to current chain state and the allowed drift window; decide on RPC source and fallback behavior.
- **Session state + zeroization**: Add session tracking structs in VRF + signer workers (`expires_at`, `remaining_uses`, `session_id`); zeroize session secret, WrapKeySeed, KEK, and near_sk on TTL/usage exhaustion, blur/close/crash, and error paths.
- **Channel ownership**: Ensure the VRF worker creates/owns the MessageChannel to the signer worker; never expose ports to the main thread/dApp. Document this in worker wiring.
- **Enforcement in signer paths**: Require an active session for tx signing; decrement usage per tx; skip per‑tx VRF when a valid session exists; force per‑tx VRF only for high‑risk/remote‑attested ops.
- **Primary vs. recovery**: Make Shamir (primary) and PRF.second (recovery) unlocks use the same session enforcement and caps; no bypass of TTL/tx budgets.
- **Telemetry/audit**: Log session mint/expire events with `session_id`, challenge digest, block height, app_id, and reason for expiry; avoid logging secrets.
- **UX hooks**: Decide pre‑warm vs. lazy session creation; surface clear errors (“session expired”, “policy exceeded”) and prompt for renewal when limits hit.
