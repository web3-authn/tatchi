# Checklist E — Storage, Logs, Privacy

Findings snapshot (pass 1).

- P2: Encrypted at rest; no plaintext key logs observed (good)
  - Evidence: Key encryption with ChaCha20‑Poly1305; no logs printing PRF or key bytes in signer worker.
  - Evidence: sdk/src/wasm_signer_worker/src/crypto.rs:74–82; info! logs are descriptive only.

- P2: Logger level configurable; defaults Info (good)
  - Evidence: sdk/src/wasm_signer_worker/src/config.rs:6; sdk/src/wasm_vrf_worker/src/config.rs:11
  - Recommendation: Ensure production builds keep Info or lower; avoid Debug in release.

- P2: IndexedDB placement and shape
  - Observation: Wallet origin owns IndexedDB; specifics not in these snippets, but architecture docs mandate wallet‑side.
  - Recommendation: Confirm schemas avoid storing PRF outputs or decrypted keys; only encrypted blobs + metadata.

Action items
- [ ] Spot‑check IndexedDB codepaths for any plaintext storage or logs (P2)
- [ ] Add a privacy checklist to releases (P2)

