# Checklist C — Confirmation UX Integrity

Findings snapshot (pass 1).

- P1 (HIGH): Intent digest parity relies on UI computing a stable canonical form
  - Description: WASM computes a SHA‑256 base64url digest over alphabetized JSON of tx signing inputs; UI must mirror this to prevent TOCTOU between render and sign.
  - Evidence: sdk/src/wasm_signer_worker/src/handlers/confirm_tx_details.rs:240–314
  - Recommendation: Ensure UI digest builder alphabetizes keys identically; add an assertion that UI‑provided digest equals WASM‑computed digest, else abort.

- P2: Summary totals parsed from strings; overflow/format handling
  - Description: Totals aggregate deposits parsed from string amounts with `unwrap_or(0)`.
  - Evidence: sdk/src/wasm_signer_worker/src/handlers/confirm_tx_details.rs:24–76, :102–145
  - Recommendation: Validate numeric strings (non‑negative, within u128) and surface parse errors (not silently 0).

- P2: UI mode normalization has safe defaults
  - Evidence: sdk/src/wasm_signer_worker/src/handlers/confirm_tx_details.rs:39–61
  - Recommendation: For `Skip` and `AutoProceed`, require explicit user opt‑in and persist preference; consider time‑boxed `autoProceedDelay` minimums.

- P2: Registration confirmation flow computes deterministic intentDigest and routes through bridge
  - Evidence: sdk/src/wasm_signer_worker/src/handlers/confirm_tx_details.rs:560–618
  - Recommendation: None; ensure same digest parity checks as tx flow.

Action items
- [ ] Add negative test: UI digest tamper causes WASM rejection (P1)
- [ ] Add parse/overflow tests for deposits and stake values (P2)
- [ ] Gate ‘skip/autoProceed’ behind preference and warnings (P2)
