# VRF-WebAuthn Hybrid Wrapping Feature Specification
### **Hybrid 3-Pass VRF Wrapping + PRF.second Backup + Dual-Worker Architecture**
**Version:** v2.0
**Audience:** Security reviewers, wallet developers, auditors
**System:** Tatchi / Web3Authn Wallet (wallet runs in a cross‑origin iframe, isolated from the dApp origin)

---

# 1. Overview

This feature introduces a **hybrid key-wrapping architecture** that combines:

- **Primary:** Shamir 3-pass protocol with a relay service to reconstruct the VRF key (`vrf_sk`).
- **Backup:** PRF.second-based decryptor for `vrf_sk`, used only in explicit “Recovery Mode”.
- **Session gate:** VRF-WebAuthn ceremony yielding PRF.first_auth as user presence.
- **Execution isolation:** VRF worker + Signer worker communicating through `MessageChannel`, with the real unwrapping key (`WrapKeySeed`) confined to workers (never the JS main thread).

This results in:

- **2-of-2 security** during normal operation (device + relay).
- **Self-custodial 1-of-1 backup** for disaster recovery (PRF.second).
- **Freshness-tied session semantics** (TouchID → VRF → KEK → near_sk).
- **Protection against partial compromises**, accidental logging, vault exfiltration, etc.

## Current implementation snapshot (codebase state)
- Dual-worker isolation shipped: VRF worker owns SecureConfirm/confirmTxFlow, extracts PRF, derives WrapKeySeed, and sends only `WrapKeySeed + wrapKeySalt` over a MessageChannel; signer worker never sees PRF/near_sk.
- Canonical intent digest is enforced (`{receiverId, actions}` only), and all tx signing (incl. Device1 link) routes through `signTransactionsWithActions` + VRF confirmTxFlow.
- Device2 link + email-recovery flows collect the passkey once, derive deterministic VRF/NEAR keys, swap the temp key, then sign the registration tx via `signDevice2RegistrationWithStoredKey` (VRF-driven, no extra prompt). The old signer `registration_transaction` path and the short-lived combined helper were removed.
- Shamir 3-pass is used when available (e.g., auto-login after linking/recovery); PRF.second is reserved for registration, deterministic-key derivation, device linking, and explicit recovery, not routine auth/signing.

---

# 2. Rationale

## 2.1 Why VRF-WebAuthn?
VRF-WebAuthn binds biometric WebAuthn authentication to **chain-state freshness**:

- Challenge = H(VRF(block_height, block_hash, nonce))
- Prevents replay of stale assertions
- Ensures user presence for every session unlock
- Ties session unlock to blockchain state and a VRF proof
- Makes “touchless multi-signing windows” safe and auditable

VRF becomes the *session key*, PRF.first becomes the *unlock factor*.

## 2.2 Why Shamir 3-Pass?
Shamir 3-pass gives **real 2-of-2 security**:

- Device alone cannot reconstruct `vrf_sk`.
- Relay alone cannot reconstruct `vrf_sk`.
- Both sides participate only in ephemeral, one-time reconstruction per session.

## 2.3 Why PRF.second Backup?
PRF.second:

- Is only revealed during WebAuthn **registration**
- Is **never** used during normal authentications
- Provides a **high-friction backup mechanism** to recover `vrf_sk`
- Enables full self-custody *without central relays* when needed
- Is reserved for: registration (deriving VRF/NEAR keys + wrapper keys), device linking, backup VRF decryption when relay is unavailable, and explicit key/email recovery flows — not for day‑to‑day logins or transactions

This makes PRF.second **temporally safer** than the previous architecture: in routine usage it is never touched, requested, or exposed.

The hybrid model gives the best of both worlds:

- **Strong security (primary)**
- **Guaranteed availability (backup)**

---

# 3. Architecture

```
                 ┌──────────────────────────┐
                 │    App Origin (unsafe)   │
                 └──────────────▲───────────┘
                                │ postMessage (high‑level requests)
                                ▼
                     ┌──────────────────────┐
                     │ Wallet Iframe (safe) │
                     │ - WebAuthn PRF       │
                     │ - Vault storage      │
                     │ - Worker wiring      │
                     └──────────┬───────────┘
         ┌──────────────────────┴──────────────────────┐
         ▼                                             ▼
 ┌─────────────────────┐                      ┌───────────────────┐
 │   VRF Worker        │◀── MessageChannel ──▶│  Signer Worker    │
 │ - unwrap VRF key    │                      │ - decrypt near_sk │
 │ - run 3-pass        │                      │ - sign NEAR tx    │
 │ - derive WrapKeySeed│                      │ - zeroize safely  │
 └─────────────────────┘                      └───────────────────┘
         ▲
         │ (Shamir Round Trips)
         ▼
 ┌──────────────────┐
 │   Relay Server   │
 │ - stores share B │
 │ - participates   │
 │   in 3-pass only │
 └──────────────────┘
```

---

# 4. Key Material

## 4.1 Registration Outputs
WebAuthn PRF registration yields:

- `PRF.first_reg`
- `PRF.second_reg`

Derivations:

```
vrf_sk     = HKDF(PRF.second_reg, "tatchchi:v1:vrf-sk")
vrf_pk     = VRF_derive_public(vrf_sk)
near_sk    = HKDF(PRF.second_reg, "tatchchi:v1:near-sk")

K_pass_reg = HKDF(PRF.first_reg, "tatchchi:v1:vrf-wrap-pass")
wrapKeySalt  = random(32 bytes)
```

## 4.2 Vault Contents

```
C_near = Enc(
    KEK = HKDF( HKDF(K_pass_reg || vrf_sk, "wrap-seed"), wrapKeySalt ),
    near_sk
)

wrapKeySalt
vrf_pk
version = 2
```

`vrf_sk` is **never stored in plaintext** and is deterministically re-derived from `PRF.second_reg` when needed.

---

# 5. Dual VRF Key Recovery

## 5.1 PRIMARY MODE: Shamir 3-Pass
Used whenever relay is online.

### Steps:
1. Wallet obtains PRF.first_auth via VRF-WebAuthn.
2. VRF worker derives local shareA = HKDF(PRF.first_auth).
3. VRF worker sends shareA to relay.
4. Relay computes response using shareB.
5. VRF worker completes 3-pass → reconstructs vrf_sk.

Security:
- Device alone ≠ vrf_sk
- Relay alone ≠ vrf_sk
- Requires fresh WebAuthn every time

## 5.2 BACKUP MODE: PRF.second Recovery
Used only when relay is unavailable **and** user explicitly opts in.

### Steps:
1. Wallet triggers Recovery Mode.
2. WebAuthn PRF request includes PRF.second.
3. VRF worker deterministically re-derives the VRF secret key:

```
vrf_sk = HKDF(PRF.second_reg, "tatchchi:v1:vrf-sk")
```

4. Session unlock proceeds normally (same KEK/WrapKeySeed pipeline as primary mode).

High-friction safety:
- Manual confirmation
- Warning screens
- Optional PIN
- Logged recovery action

---

# 6. KEK Derivation

Same derivation regardless of how vrf_sk is recovered:

```
K_pass_auth = HKDF(PRF.first_auth, "vrf-wrap-pass")
WrapKeySeed       = HKDF(K_pass_auth || vrf_sk, "near-wrap-seed")
KEK         = HKDF(WrapKeySeed, wrapKeySalt)
near_sk     = Dec(KEK, C_near)
```

This ensures:
- Fresh PRF.first required
- VRF_sk required
- Replay of stale unlocks impossible
- Relay cannot bypass device
- WrapKeySeed never leaves the VRF worker; only WrapKeySeed + wrapKeySalt traverse the worker channel to keep unwrapping power out of main-thread JS.

---

# 7. Worker Responsibilities

## 7.1 VRF Worker
- Verify WebAuthn + VRF freshness
- Primary: run Shamir 3-pass
- Backup: use PRF.second
- Derive WrapKeySeed
- Send WrapKeySeed & wrapKeySalt to Signer Worker
- Compute VRF proofs per transaction
- Zeroize secrets on session expiration
- Orchestrate VRF-WebAuthn via the wallet iframe: browser WebAuthn API lives in the iframe main thread, but PRF outputs are delivered directly into the VRF worker (never to the Signer worker or dApp origin)

## 7.2 Signer Worker
- Compute KEK
- Decrypt near_sk
- Sign NEAR transactions
- Zeroize secrets after session
- Does not initiate WebAuthn and never sees PRF outputs; it only receives WrapKeySeed + wrapKeySalt from the VRF worker over a dedicated MessageChannel

---

# 8. Session Flow

```
┌───────────────────────────────────────────────────────────────────────┐
│ User action                                                           │
│ ────────────────────────────────────────────────────────────────────  │
│ TouchID / WebAuthn PRF request (PRF.first_auth only)                  │
└───────────────────────────────────────────────────────────────────────┘
                    │
                    │ PRF.first_auth (main thread → VRF worker), then zeroize
                    ▼
┌───────────────────────────────────────────────────────────────────────┐
│ VRF worker                                                            │
│ ────────────────────────────────────────────────────────────────────  │
│ 1) Derive K_pass_auth (from PRF.first_auth)                           │
│ 2a) PRIMARY: Shamir 3-pass with relay → reconstruct vrf_sk            │
│ 2b) BACKUP: PRF.second (only in recovery/registration) → vrf_sk       │
│ 3) Derive WrapKeySeed = HKDF(K_pass_auth || vrf_sk, "near-wrap-seed") │
│ 4) Generate wrapKeySalt (fresh) if needed                             │
│ 5) Send { WrapKeySeed, wrapKeySalt } over MessageChannel to signer    │
│ 6) Keep PRF/vrf_sk private; zeroize on timeout                        │
└───────────────────────────────────────────────────────────────────────┘
                    │
                    │ MessageChannel (WrapKeySeed + wrapKeySalt only)
                    ▼
┌───────────────────────────────────────────────────────────────────────┐
│ Signer worker                                                         │
│ ────────────────────────────────────────────────────────────────────  │
│ 1) Derive KEK = HKDF(WrapKeySeed, wrapKeySalt)                        │
│ 2) Decrypt near_sk (if stored) or derive deterministic key (if in     │
│    registration flow)                                                 │
│ 3) Sign NEAR transactions                                             │
│ 4) Zeroize secrets after session                                      │
└───────────────────────────────────────────────────────────────────────┘
                    │
                    │ Signed tx / proofs
                    ▼
┌───────────────────────────────────────────────────────────────────────┐
│ Wallet iframe (safe)                                                  │
│ ────────────────────────────────────────────────────────────────────  │
│ - Forwards signed tx to RPC                                           │
│ - Never sees WrapKeySeed/near_sk/PRF.second                           │
└───────────────────────────────────────────────────────────────────────┘
```

---

# 9. Security Benefits (Semi-Compromised Wallet Origin)

### ✔ PRF.first leak ≠ VRF_sk leak
### ✔ PRF.first leak ≠ KEK leak
### ✔ Vault leak ≠ VRF_sk or near_sk
### ✔ Relay compromise ≠ vrf_sk
### ✔ Workers compartmentalize secrets (WrapKeySeed only exists in WASM workers; main thread never sees WrapKeySeed or near_sk)
### ✔ PRF.second rarely used, reducing exposure
### ✔ Supports self-custody even if relay disappears
### ✔ Main-thread logging exfiltrates at most PRF.first_auth (one ingredient), not the unwrapping key or near_sk
### ✔ MessageChannel-only flow for WrapKeySeed reduces blast radius of origin-level telemetry/console leaks
### ✔ Wallet lives in a cross-origin iframe; the dApp origin never sees vault contents, workers, or WrapKeySeed/near_sk
### ✔ PRF.second use is restricted to registration, backup VRF recovery, device linking, and explicit recovery flows — not routine logins/transactions

---

# 10. Implementation Plan

### Phase 1 – Vault Format Upgrade
- Status: complete (v2 vaults with wrapKeySalt and encrypted deterministic NEAR keys).

### Phase 2 – Shamir 3-Pass Integration
- Status: available and used where configured (auto-login after link/recovery tries Shamir first).

### Phase 3 – PRF.second Recovery
- Status: implemented for registration, device linking, and email recovery (PRF.second only used at registration/explicit recovery).

### Phase 4 – Worker Updates
- Status: complete.
  - VRF worker owns SecureConfirm + PRF handling; main thread zeroizes.
  - VRF → Signer uses MessageChannel (WrapKeySeed + wrapKeySalt only); no ports exposed to dApp.
  - Signer worker no longer exposes the deprecated `registration_transaction` path; combined derive+sign helper removed.

### Phase 5 – Signing Integration
- Status: complete for tx flows (confirmTxFlow + canonical intent digest).
- Device2/email recovery: registration signing runs via `signDevice2RegistrationWithStoredKey` after key swap (single passkey prompt, deterministic key on-chain before signing).

### Implementation invariants (post-refactor)
- SecureConfirm/confirmTxFlow are VRF-owned; signer externs for confirmation were removed.
- PRF/`vrf_sk` stay VRF-side; signer receives only `WrapKeySeed + wrapKeySalt` via the internal MessageChannel.
- VRF worker rejects forbidden payload fields (e.g., `near_sk`) at the boundary; tests cover this guard.
- ConfirmTxFlow envelopes for signing/registration/link omit PRF/WrapKeySeed entirely; secrets stay off the main thread and dApp surface.
- wasm exports align with the split: VRF exposes SecureConfirm bridge + WrapKeySeed derivation; signer exports only signing/decrypt routines.

### Phase 6 – Hardening
- Status: in progress.

### Remaining TODOs
- Broaden replay-prevention tests and relay hardening for Shamir 3-pass.
- Keep high-friction UX and auditing for explicit recovery/PRF.second use.
- Run partial-compromise simulations and assess logs/telemetry/vault exfiltration risk.

---

# 11. Final Summary

This hybrid system provides:

- **Best-case:** secure 2-of-2 Shamir reconstruction
- **Worst-case:** fully self-custodial PRF.second backup
- **Freshness:** VRF-WebAuthn gated sessions
- **Isolation:** dual workers + sealed messaging
- **Resilience:** robust to semi-compromised wallet origin

It combines real cryptographic strength with practical recovery options, making it a production‑ready design for WebAuthn‑secured wallets.
