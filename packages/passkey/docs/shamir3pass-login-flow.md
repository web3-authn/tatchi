## Overview

### Problem
We currently need two TouchID prompts. We want to avoid the first prompt by storing a server-locked version of the VRF key, so the user can unlock it with a quick one-round trip without TouchID.


### UX FLOW

The flow is:
1. user client generates vrf_keypair and uses the server's public keypair_A to encrypt it. He stores the serverEncryptedKeypair in indexedDB = `Enc_A(vrf_key)`
2. Later when the user client needs the VRF keypair, he generates a temporary keypair_B and encrypts the serverEncryptedKeypair = `Enc_A(vrf_key)` with the temporary keypair_B = `Enc_B(Enc_A(vrf_key))`
2. the twice-encrypted keypair `Enc_B(Enc_A(vrf_key))`  is sent to the server
3. server decrypts `Enc_B(Enc_A(vrf_key))` with their keypair_A to get `Enc_B(vrf_key)` which is sent back to the user to decrypt with the temp keypair_B.

The scheme relies on commutative encryption where:
```
Enc_B(Enc_A(msg)) == Enc_A(Enc_B(msg))
```

This allows the server to decrypt their layer without seeing the real vrf_key.


## Technical Solution

We replace RSA/SRA with commutative exponentiation over a public safe prime p (Shamir 3-pass) for a random KEK K that wraps the VRF keypair via AEAD. The server never sees K or the VRF key.

#### Registration:
- client generates a random KEK key
- client encrypts VRF key with the KEK key => vrf_ciphertext
- client requests the server to add it's lock to the KEK key => KEK_s
- client stores the KEK_s key along with the encrypted VRF key in indexedDB

### Login:
- Client loads  { vrf_ciphertext, KEK_s }
- Client adds a one-time lock to KEK_s -> KEK_st
- Client sends KEK_st to server
- Server decrypts KEK_st => KEK_t and sends KEK_t back to client
- Client removes the one-time lock on KEK_t to reveal KEK
- Client uses KEK to decrypt vrf_ciphertext

Is my understanding correct?
The server never sees the VRF key plaintext, nor the KEK, only sees the blinded KEK_st


### Plain-English model (no server public key)
- There isn’t a reusable "server public key". Instead, the server lends a lock during a quick back‑and‑forth.
- Registration: the client asks the server to add its lock to the client’s random unlock key (KEK), then stores that server‑locked KEK.
- Login: the client asks the server to peel just its lock off, and finishes locally.
- The server only sees blinded KEK values, never the VRF key nor the KEK itself.

### API cheat‑sheet (plain‑English)
- **ClientLockKeys**: your personal lock keys `{ e, d }` to add/remove your lock.
- **generate_onetime_lock_keys()**: "make my lock keys" for registration (long‑lived) or a one‑time login round.
- **encrypt_with_random_KEK_key(bytes)** → `(ciphertext, kek_bignum)`: "lock these bytes with a fresh random KEK key".
- **decrypt_with_key(ciphertext, kek_bignum)** → `bytes`: "unlock these bytes with the KEK key".
- **add_client_lock(value, e)** → `value_with_my_lock`: "add my lock".
- **remove_client_lock(value, d)** → `value_without_my_lock`: "remove my lock".
- Server endpoints (relay):
  - `POST /vrf/apply-server-lock` → "add server lock".
  - `POST /vrf/remove-server-lock` → "peel server lock".

### Glossary
- **KEK (K)**: a random key the client generates to lock/unlock the VRF key. The server never learns K.
- **ciphertext_vrf_b64u**: the VRF key locked under AEAD with the KEK.
- **kek_s_b64u**: the KEK with the server’s lock on it.
- **add my lock / remove my lock**: client operations using `{ e, d }` over the public modulus `p`.
- **add server lock / peel server lock**: relay server operations; the server never sees plaintext VRF or KEK.

## Public parameters
- **p**: large safe prime (e.g., 3072/4096-bit). Public.
- **g**: generator of a large subgroup of Z_p^*. Public.

## Server keys
- **e_s** with gcd(e_s, p−1)=1, secret.
- **d_s = e_s^{-1} mod (p−1)**, secret.

## Stored client data in IndexedDB
- `ciphertext_vrf_b64u`: VRF key locked with a random KEK (AEAD cipher text).
- `kek_s_b64u`: the KEK with the server’s lock on it.
- `p_b64u` (or `p_version`): public parameter identifier.

## Registration (derive + wrap)
1. Client derives/creates the VRF key.
2. In the worker, lock the VRF key with a fresh random KEK key:
   - `encrypt_with_random_KEK_key(VRFKeypairData)` → `ciphertext_vrf_b64u` and `kek_b64u`.
3. Quick round‑trip to add the server lock to KEK:
- Compute client blind and call `POST /vrf/apply-server-lock`, then remove your blind → `kek_s_b64u`.
   - Alternatively, call the worker’s `SHAMIR3PASS_REGISTER_WRAP` message to perform the round‑trip in one step.
4. Store `{ ciphertext_vrf_b64u, kek_s_b64u, p_b64u }` and discard `kek_b64u`.

## Login (unlock)
1. Client loads `{ ciphertext_vrf_b64u, kek_s_b64u }`.
2. Quick round‑trip: client adds a one‑time lock to `kek_s_b64u`, server peels only its lock and returns the result.
3. Client removes its one‑time lock to recover the KEK, then unlocks `ciphertext_vrf_b64u` locally.
4. Load the VRF key into memory and continue.

## Failure handling
- If any step fails (network/server), fall back to TouchID/PRF unlock.
- Reject non-invertible exponents on client (gcd(e_c, p−1) ≠ 1).

## Server endpoints
- `POST /vrf/apply-server-lock` → `{ blinded_es }`.
- `POST /vrf/remove-server-lock` → `{ blinded_ds }`.
Inputs/outputs are base64url BigInts modulo p.

## Migration
- Gate new storage by `p_version`. Old SRA entries should not be mixed. Refuse legacy format with a clear error.

## Security
- Server never learns KEK or VRF key.
- No modulus mismatch issues; single public modulus p.
- AEAD provides confidentiality and integrity for the wrapped VRF keypair.

### Implementation plan

- Public params
  - Define `p` (safe prime) in `wasm_vrf_worker/src/config.rs`. Add a `p_version` for rotation.

- Worker modules
  - New `wasm_vrf_worker/src/shamir3pass.rs`:
    - BigInt helpers: `modexp`, `modinv_euclid(e, p_minus_1)`, `random_in_modulus(p)`.
    - `derive_aead_key_from_k(K_bytes) -> [u8;32]` via HKDF-SHA256.
  - Update `wasm_vrf_worker/src/handlers.rs`:
    - Registration: produce `{ ciphertext_vrf, kek_s }` using apply-server-exponent round.
    - Login: run remove-server-exponent round, recover K, AEAD-decrypt, load VRF into memory.
  - Reuse `http.rs` for POSTs.

- Storage schema (IndexedDB)
  - Replace SRA fields with:
    - `ciphertext_vrf: string` (base64url nonce|ciphertext|tag)
    - `kek_s: string` (base64url BigInt)
    - `p_version?: number`
  - Bump DB version; migrate by setting these to undefined for existing users (no auto-conversion).

- Registration wiring (`core/PasskeyManager/registration.ts`)
  - After VRF derivation:
    - Generate K, AEAD-encrypt VRF -> `ciphertext_vrf`.
    - Pick e_c, compute d_c.
    - Compute `M1 = K^{e_c} mod p`; POST to `/vrf/apply-server-lock` → `M2`.
    - Compute `kek_s = M2^{d_c} mod p` and store with `ciphertext_vrf` and `p_version`.

- Login wiring (`core/PasskeyManager/login.ts`)
  - If `{ciphertext_vrf, kek_s}` present and relayer URL provided:
    - Pick fresh `e_c'`, `d_c'`.
    - `Y1 = kek_s^{e_c'} mod p`; POST to `/lock/remove-server-lock` → `Y2`.
    - `K = Y2^{d_c'} mod p`; derive AEAD and decrypt `ciphertext_vrf`.
    - Load VRF into worker; mark session active. On any failure, fall back to PRF unlock.

- Server endpoints (`packages/passkey/src/server/core` + relay)
  - `POST /vrf/apply-server-lock`: input `{ kek_c }` → output `{ kek_cs }`.
  - `POST /vrf/remove-server-lock`: input `{ kek_c }` → output `{ kek_cs }`.
  - Implement in `AuthService` using server `e_s`, `d_s`, shared public `p`.

- Types
  - Add TS interfaces for request/response payloads (base64url BigInt strings).
  - Add stored-user data type for `{ciphertext_vrf, kek_s, p_version}`.

- Errors & validation
  - Reject non-invertible `e_c` (gcd(e_c, p−1) ≠ 1).
  - Validate base64url and range of inputs mod `p`.

- Tests
  - Unit: verify `dec_c(dec_s(enc_c(enc_s(K)))) = K` over mod `p`.
  - Integration: roundtrip AEAD(VRF, K) decrypts to original; multiple logins with fresh `e_c'` succeed.

- Migration
  - Do not mix legacy SRA data with Shamir 3-pass. If legacy present, return explicit unsupported format error.
