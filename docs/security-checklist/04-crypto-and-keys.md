# Checklist D — Cryptography and Key Material

Findings snapshot (pass 1).

- P2: HKDF domain separation and salts per account (good)
  - Evidence: sdk/src/wasm_signer_worker/src/crypto.rs:40, :142; sdk/src/wasm_signer_worker/src/config.rs:17–24
  - ChaCha20 and Ed25519 have distinct `info` strings and account‑specific salts.

- P2: AEAD nonces generated with CSPRNG and validated (good)
  - Evidence: sdk/src/wasm_signer_worker/src/crypto.rs:70–81, :97–106

- P2: Ed25519 derivation via ed25519‑dalek, key format handling for 32/64 bytes (good)
  - Evidence: sdk/src/wasm_signer_worker/src/crypto.rs:146–170, :240–258

- P2: No AEAD associated data used (opportunity)
  - Description: AEAD encrypt/decrypt doesn’t bind additional context (e.g., account ID) as AAD.
  - Evidence: sdk/src/wasm_signer_worker/src/crypto.rs:74–81, :110–114
  - Recommendation: Consider adding AAD = `near_account_id` to ChaCha20‑Poly1305 `encrypt/decrypt` for stronger binding to account context.

- P2: Zeroization not present
  - Description: Derived key material and seed arrays are not zeroized after use.
  - Evidence: sdk/src/wasm_signer_worker/src/crypto.rs:158–170, :206–215
  - Recommendation: Introduce `zeroize` on temporary secrets where practical.

Notes
- VRF worker already uses zeroization for its in‑memory keypair wrapper (`ZeroizeOnDrop`).
  - Evidence: sdk/src/wasm_vrf_worker/src/manager.rs:13, :26, :103, :190, :305

Clarifications (Q&A)
- IndexedDB data theft + PRF theft combo (High)
  - Threat assumes the attacker can obtain both the wallet‑origin encrypted blobs and the corresponding PRF outputs. This generally requires wallet‑origin compromise (or an extension with wallet host permissions) and/or a bridged ceremony captured at the top‑level. The combo is not a separate surface beyond PRF exposure and origin compromise.

- Session memory scraping (Medium)
  - Keys are only decrypted within WASM workers in the wallet origin during an active session. Reading session memory requires runtime access to the wallet origin (e.g., malicious extension or injected code). Without that, keys remain encrypted at rest.

- Trust anchor
  - The security model hinges on protecting the wallet origin. With a strong wallet origin and no hostile extensions, PRF outputs and private keys remain isolated (aside from brief exposure in the Safari bridge at top‑level during the ceremony).

- P2: VRF domain separation configured (good)
  - Evidence: sdk/src/wasm_vrf_worker/src/config.rs:21; HKDF info strings present: :25–31

Action items
- [ ] Add AAD (account_id) to AEAD encrypt/decrypt (P2)
- [ ] Add zeroization of sensitive buffers (P2)
- [ ] Add property tests for HKDF outputs and nonce uniqueness (P2)
