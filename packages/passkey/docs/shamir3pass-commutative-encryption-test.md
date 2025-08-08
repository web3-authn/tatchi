## Goal
Verify commutative exponentiation over a prime field (Shamir 3-pass) recovers a random KEK K client-side without ever revealing K to the server, and that AEAD-decrypting the VRF keypair using K succeeds.

## Public parameters
- **p**: large safe prime (e.g., 3072/4096-bit). Public.

### API cheat‑sheet (plain‑English)
- **ClientLockKeys**: your personal lock keys `{ e, d }` to add/remove your lock.
- **generate_lock_keys(p)**: "make my lock keys" for registration or a one‑time login round.
- **encrypt_with_random_key(p, bytes)** → `(ciphertext, kek)`: "lock these bytes with a fresh random KEK (key encryption key)".
- **decrypt_with_key(ciphertext, kek)** → `bytes`: "unlock these bytes with the KEK".
- **add_client_lock(value, e, p)** → `value_with_my_lock`: 'add my lock".
- **remove_client_lock(value, d, p)** → `value_without_my_lock`: "remove my lock".
- Server endpoints (relay):
  - `POST /vrf/apply-server-exponent` → 'add server lock".
  - `POST /vrf/remove-server-exponent` → 'peel server lock'.

## Server secrets
- **e_s**: server exponent with gcd(e_s, p−1)=1.
- **d_s**: modular inverse of e_s mod (p−1).

## Client secrets (per operation)
- **e_c**: client exponent with gcd(e_c, p−1)=1.
- **d_c**: modular inverse of e_c mod (p−1).


## AEAD wrapping test
1. Derive AEAD key from KEK via HKDF-SHA256(KEK_bytes, "vrf aead").
2. Encrypt VRFKeypairData → ciphertext_vrf.
3. Run the commutative roundtrip above to recover KEK.
4. Derive AEAD from KEK.
5. Decrypt ciphertext_vrf using AEAD and assert the original VRFKeypairData is recovered.

## Suggested implementation locations
- Rust WASM worker:
  - `commutative_prime.rs` (new): big integer ops, modexp, inverses, HKDF; test helpers.
  - `handlers.rs`: use new helpers for registration/login flows.

## Test cases (minimal)
- Valid roundtrip with randomly sampled KEK.
- Multiple rounds with fresh client exponents e_c (idempotence of storage `enc_s_k`).
- Negative tests:
  - Non-invertible e_c (gcd(e_c, p−1) ≠ 1) must be rejected.
  - Wrong server key (different e_s) fails to recover K.

## Notes
- The server never learns KEK or VRF; it only applies/removes its exponents.
- No RSA modulus mismatch; all operations are mod the same public p.
