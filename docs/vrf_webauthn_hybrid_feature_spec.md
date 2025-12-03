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
- **Execution isolation:** VRF worker + Signer worker communicating through `MessageChannel`, with the real unwrapping key (`Kwrap`) confined to workers (never the JS main thread).

This results in:

- **2-of-2 security** during normal operation (device + relay).  
- **Self-custodial 1-of-1 backup** for disaster recovery (PRF.second).  
- **Freshness-tied session semantics** (TouchID → VRF → KEK → near_sk).  
- **Protection against partial compromises**, accidental logging, vault exfiltration, etc.

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
                                │
                                │ postMessage (high‑level requests)
                                ▼
                     ┌──────────────────────┐
                     │ Wallet Iframe (safe) │
                     │ - WebAuthn PRF        │
                     │ - Vault storage        │
                     │ - Worker wiring        │
                     └─────────┬─────────────┘
                               │
         ┌─────────────────────┴──────────────────────┐
         │                                            │
         ▼                                            ▼
 ┌──────────────────┐                          ┌──────────────────┐
 │   VRF Worker      │◀─── MessageChannel ───▶│  Signer Worker    │
 │ - unwrap VRF key  │                          │ - decrypt near_sk │
 │ - run 3-pass      │                          │ - sign NEAR tx    │
 │ - derive Kwrap    │                          │ - zeroize safely  │
 └──────────────────┘                          └──────────────────┘

         ▲
         │ (Shamir Round Trips)
         ▼
 ┌──────────────────┐
 │   Relay Server    │
 │ - stores share B  │
 │ - participates     │
 │   in 3-pass only   │
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
salt_wrap  = random(32 bytes)
```

## 4.2 Vault Contents

```
C_vrf_backup = Enc(HKDF(PRF.second_reg), vrf_sk)

C_near = Enc(
    KEK = HKDF( HKDF(K_pass_reg || vrf_sk, "wrap-seed"), salt_wrap ),
    near_sk
)

shamir_pub = public parameters for relay share
salt_wrap
vrf_pk
```

`vrf_sk` is **never stored in plaintext**.

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
3. VRF worker decrypts backup ciphertext:

```
vrf_sk = Dec(HKDF(PRF.second_reg), C_vrf_backup)
```

4. Session unlock proceeds normally.

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
Kwrap       = HKDF(K_pass_auth || vrf_sk, "near-wrap-seed")
KEK         = HKDF(Kwrap, salt_wrap)
near_sk     = Dec(KEK, C_near)
```

This ensures:
- Fresh PRF.first required  
- VRF_sk required  
- Replay of stale unlocks impossible  
- Relay cannot bypass device  
- Kwrap never leaves the VRF worker; only Kwrap + salt_wrap traverse the worker channel to keep unwrapping power out of main-thread JS.

---

# 7. Worker Responsibilities

## 7.1 VRF Worker
- Verify WebAuthn + VRF freshness  
- Primary: run Shamir 3-pass  
- Backup: use PRF.second  
- Derive Kwrap  
- Send Kwrap & salt_wrap to Signer Worker  
- Compute VRF proofs per transaction  
- Zeroize secrets on session expiration  
- Orchestrate VRF-WebAuthn via the wallet iframe: browser WebAuthn API lives in the iframe main thread, but PRF outputs are delivered directly into the VRF worker (never to the Signer worker or dApp origin)

## 7.2 Signer Worker
- Compute KEK  
- Decrypt near_sk  
- Sign NEAR transactions  
- Zeroize secrets after session  
- Does not initiate WebAuthn and never sees PRF outputs; it only receives Kwrap + salt_wrap from the VRF worker over a dedicated MessageChannel

---

# 8. Session Flow

```
User TouchID →
  WebAuthn PRF.first →
    Main thread:
      forward PRF.first_auth to VRF worker, zeroize local copy →
    VRF worker:
       derive K_pass_auth →
       PRIMARY: reconstruct vrf_sk via Shamir
       BACKUP: decrypt vrf_sk via PRF.second →
         derive Kwrap →
            MessageChannel (Kwrap + salt_wrap, never PRF or near_sk) →
              Signer worker:
                derive KEK →
                decrypt near_sk →
                session active →
                  tx requests:
                    VRF_prove + NEAR_sign →
                  session timeout:
                    zeroize secrets
```

---

# 9. Security Benefits (Semi-Compromised Wallet Origin)

### ✔ PRF.first leak ≠ VRF_sk leak  
### ✔ PRF.first leak ≠ KEK leak  
### ✔ Vault leak ≠ VRF_sk or near_sk  
### ✔ Relay compromise ≠ vrf_sk  
### ✔ Workers compartmentalize secrets (Kwrap only exists in WASM workers; main thread never sees Kwrap or near_sk)  
### ✔ PRF.second rarely used, reducing exposure  
### ✔ Supports self-custody even if relay disappears  
### ✔ Main-thread logging exfiltrates at most PRF.first_auth (one ingredient), not the unwrapping key or near_sk  
### ✔ MessageChannel-only flow for Kwrap reduces blast radius of origin-level telemetry/console leaks  
### ✔ Wallet lives in a cross-origin iframe; the dApp origin never sees vault contents, workers, or Kwrap/near_sk  
### ✔ PRF.second use is restricted to registration, backup VRF recovery, device linking, and explicit recovery flows — not routine logins/transactions  

---

# 10. Implementation Plan

### Phase 1 – Vault Format Upgrade  
- Add C_vrf_backup, shamir_pub, version bump  

### Phase 2 – Shamir 3-Pass Integration  
- shareA derivation  
- Relay endpoints  
- Replay prevention tests  

### Phase 3 – PRF.second Recovery  
- UI + UX friction  
- WebAuthn PRF.second request  
- Recovery-mode auditing  

### Phase 4 – Worker Updates  
- VRF worker handles primary/fallback logic  
- Main thread forwards PRF.first_auth then zeroizes; no Kwrap exposure in JS  
- VRF → Signer worker uses a MessageChannel created inside the VRF worker for Kwrap + salt_wrap only; ports are never exposed to any main-thread APIs  
- Wallet iframe owns both workers; dApp origin cannot obtain worker handles or MessageChannel ports  

### Phase 5 – Signing Integration  
- VRF per-tx proofs  
- Session expiry handling  

### Phase 6 – Hardening  
- Partial compromise simulations  
- Logs & telemetry risk assessment  
- Vault exfiltration analysis  

---

# 11. Final Summary

This hybrid system provides:

- **Best-case:** secure 2-of-2 Shamir reconstruction  
- **Worst-case:** fully self-custodial PRF.second backup  
- **Freshness:** VRF-WebAuthn gated sessions  
- **Isolation:** dual workers + sealed messaging  
- **Resilience:** robust to semi-compromised wallet origin  

It combines real cryptographic strength with practical recovery options, making it a production‑ready design for WebAuthn‑secured wallets.
