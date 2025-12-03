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

## Open Items
- Choose defaults: reasonable `X` (tx count) and `Y` (minutes), plus whether challenges carry both.
- Define how the worker validates that a challenge’s encoded policy matches the requested session scope.
- Decide whether to pre‑warm a session on app load or lazily on first signing attempt.
