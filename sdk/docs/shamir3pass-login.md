# Shamir 3-Pass Protocol: Secure VRF Key Management

## Overview

The Shamir 3-pass (optional) lets users unlock the VRF key (login) without requiring TouchID prompts with the help of the relay-server. It is optional. The server never learns the VRF key or the key encryption key (KEK), only seeing blinded values during the commutative encryption process.

### Problem Statement
Currently, we need TouchID prompts to unlock VRF key access to sign WebAuthn ceremonies and transactions. We want to avoid the first prompt by storing an encrypted version of the VRF key that can be decrypted with the help of the server via Shamir 3 Pass, allowing users to unlock it automatically when they login without TouchID.

## Security Properties

- Server never learns KEK or VRF key.
- No modulus mismatch issues; single public modulus p.
- AEAD provides confidentiality and integrity for the wrapped VRF keypair.
- The server never sees plaintext VRF or KEK, only blinded KEK values during operations.


### UX Flow
1. **Registration**: Client generates VRF keypair and encrypts it with a random key-encryption-key (AEAD based KEK), then sends it to the server which applies it's lock to the KEK_cs (double encrypted). Then when the KEK_cs is returned to the client unlocks it and stores the server-locked KEK locally.
2. **Login**: Client adds a temporary lock to the server-locked KEK, sends it to server, server removes its lock, client removes temporary lock to recover KEK and decrypt VRF key.


The scheme relies on commutative encryption where:
```
Enc_B(Enc_A(msg)) == Enc_A(Enc_B(msg))
```

This allows the server to decrypt their layer without seeing the real VRF key.

## Technical Solution

We use commutative exponentiation over a public safe prime p (Shamir 3-pass) for a random KEK K that wraps the VRF keypair via AEAD. The server never sees K or the VRF key.

### Registration Flow
- Client generates a random KEK key
- Client encrypts VRF key with the KEK key → vrf_ciphertext
- Client requests server to add its lock to the KEK key → KEK_s
- Client stores the KEK_s key along with the encrypted VRF key in IndexedDB

### Login Flow
- Client loads { vrf_ciphertext, KEK_s }
- Client adds a one-time lock to KEK_s → KEK_st
- Client sends KEK_st to server
- Server decrypts KEK_st → KEK_t and sends KEK_t back to client
- Client removes the one-time lock on KEK_t to reveal KEK
- Client uses KEK to decrypt vrf_ciphertext

**Security**: The server never sees the VRF key plaintext, nor the KEK, only sees the blinded KEK_st.

## Public Parameters

- **p**: large safe prime (e.g., 3072/4096-bit). Public.
- **g**: generator of a large subgroup of Z_p^*. Public.

## Cryptographic Keys

### Server Secrets
- **e_s**: server exponent with gcd(e_s, p−1)=1, secret.
- **d_s = e_s^{-1} mod (p−1)**, secret.

### Client Secrets (per operation)
- **e_c**: client exponent with gcd(e_c, p−1)=1.
- **d_c**: modular inverse of e_c mod (p−1).

## API Reference

### Plain-English API
- **ClientLockKeys**: your personal lock keys `{ e, d }` to add/remove your lock.
- **generate_lock_keys(p)**: "make my lock keys" for registration or a one‑time login round.
- **encrypt_with_random_key(p, bytes)** → `(ciphertext, kek)`: "lock these bytes with a fresh random KEK (key encryption key)".
- **decrypt_with_key(ciphertext, kek)** → `bytes`: "unlock these bytes with the KEK".
- **add_client_lock(value, e, p)** → `value_with_my_lock`: "add my lock".
- **remove_client_lock(value, d, p)** → `value_without_my_lock`: "remove my lock".

### Server Endpoints (relay)
- `POST /vrf/apply-server-exponent` → "add server lock".
- `POST /vrf/remove-server-exponent` → "peel server lock".

## Data Storage

### Stored Client Data in IndexedDB
- `ciphertext_vrf_b64u`: VRF key locked with a random KEK (AEAD cipher text).
- `kek_s_b64u`: the KEK with the server's lock on it.
- `p_b64u` (or `p_version`): public parameter identifier.

### Glossary
- **KEK (K)**: a random key the client generates to lock/unlock the VRF key. The server never learns K.
- **ciphertext_vrf_b64u**: the VRF key locked under AEAD with the KEK.
- **kek_s_b64u**: the KEK with the server's lock on it.
- **add my lock / remove my lock**: client operations using `{ e, d }` over the public modulus `p`.
- **add server lock / peel server lock**: relay server operations; the server never sees plaintext VRF or KEK.

## Detailed Protocol Flows

### Registration (derive + wrap)
1. Client derives/creates the VRF key.
2. In the worker, lock the VRF key with a fresh random KEK key:
   - `encrypt_with_random_KEK_key(VRFKeypairData)` → `ciphertext_vrf_b64u` and `kek_b64u`.
3. Quick round‑trip to add the server lock to KEK:
   - Compute client blind and call `POST /vrf/apply-server-lock`, then remove your blind → `kek_s_b64u`.
   - Alternatively, call the worker's `SHAMIR3PASS_REGISTER_WRAP` message to perform the round‑trip in one step.
4. Store `{ ciphertext_vrf_b64u, kek_s_b64u, p_b64u }` and discard `kek_b64u`.

### Login (unlock)
1. Client loads `{ ciphertext_vrf_b64u, kek_s_b64u }`.
2. Quick round‑trip: client adds a one‑time lock to `kek_s_b64u`, server peels only its lock and returns the result.
3. Client removes its one‑time lock to recover the KEK, then unlocks `ciphertext_vrf_b64u` locally.
4. Load the VRF key into memory and continue.

## AEAD Wrapping Test

### Goal
Verify commutative exponentiation over a prime field (Shamir 3-pass) recovers a random KEK K client-side without ever revealing K to the server, and that AEAD-decrypting the VRF keypair using K succeeds.

### Test Process
1. Derive AEAD key from KEK via HKDF-SHA256(KEK_bytes, "vrf aead").
2. Encrypt VRFKeypairData → ciphertext_vrf.
3. Run the commutative roundtrip above to recover KEK.
4. Derive AEAD from KEK.
5. Decrypt ciphertext_vrf using AEAD and assert the original VRFKeypairData is recovered.


## Testing Strategy

#### Integration Tests
- Full protocol flow (registration + login)
- Valid roundtrip with randomly sampled KEK.
- Multiple rounds with fresh client exponents e_c (idempotence of storage `enc_s_k`).
- Negative tests:
  - Non-invertible e_c (gcd(e_c, p−1) ≠ 1) must be rejected.
  - Wrong server key (different e_s) fails to recover K.

#### Security Tests
- Randomness quality
- Key uniqueness
- Tampering detection
- Wrong key failures

#### Property-Based Tests
- Commutative property: `f(g(x)) = g(f(x))`
- Associative property: `(a*b)*c = a*(b*c)`
- Inverse property: `f(f^-1(x)) = x`


## Implementation Details

### Worker Modules
- New `wasm_vrf_worker/src/shamir3pass.rs`:
  - `derive_aead_key_from_k(K_bytes) -> [u8;32]` via HKDF-SHA256.
- Update `wasm_vrf_worker/src/handlers.rs`:
  - Registration: produce `{ ciphertextVrfB64u, kek_s_b64u }` using apply-server-exponrnt round.
  - Login: run remove-server-exponent round, recover K, AEAD-decrypt, load VRF into memory.
- Reuse `http.rs` for POSTs.

### Storage Schema (IndexedDB)
- Replace SRA fields with:
  - `ciphertextVrfB64u: string` (base64url nonce|ciphertext|tag)
  - `kek_s_b64u: string` (base64url BigInt)
  - `p_version?: number`

### Registration Wiring (`core/TatchiPasskey/registration.ts`)
- After VRF derivation:
  - Generate K, AEAD-encrypt VRF → `ciphertextVrfB64u`.
  - Pick e_c, compute d_c.
  - Compute `M1 = K^{e_c} mod p`; POST to `/vrf/apply-server-lock` → `M2`.
  - Compute `kek_s = M2^{d_c} mod p` and store with `ciphertextVrfB64u` and `p_version`.

### Login Wiring (`core/TatchiPasskey/login.ts`)
- If `{ciphertextVrfB64u, kek_s_b64u}` present and relayer URL provided:
  - Pick fresh `e_c'`, `d_c'`.
  - `Y1 = kek_s^{e_c'} mod p`; POST to `/lock/remove-server-lock` → `Y2`.
  - `K = Y2^{d_c'} mod p`; derive AEAD and decrypt `ciphertextVrfB64u`.
  - Load VRF into worker; mark session active. On any failure, fall back to PRF unlock.

### Server Endpoints (`packages/passkey/src/server/core` + relay)
- `POST /vrf/apply-server-lock`: input `{ kek_c }` → output `{ kek_cs }`.
- `POST /vrf/remove-server-lock`: input `{ kek_c }` → output `{ kek_cs }`.
- Implement in `AuthService` using server `e_s`, `d_s`, shared public `p`.

### Key Rotation Support
TODO: Add mechanisms for server key rotation without breaking existing encrypted data.
