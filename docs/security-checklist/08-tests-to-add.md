# Tests To Add/Run — Guided by Findings

- Wallet iframe handshake
  - Fuzz malformed envelopes; expect `ERROR` and no side effects
  - CONNECT from non‑parent window ignored (after adding source check)

- WebAuthn bridge
  - Reject bridge messages when `e.origin !== walletOrigin`
  - ROR manifest fetch success/failure and browser gating

- Confirmation UX
  - UI digest tamper causes WASM rejection (negative test)
  - Skip/AutoProceed gated by preference; defaults safe

- Crypto
  - HKDF property tests and nonce uniqueness (signer/VRF workers)
  - AEAD AAD binding tests (once implemented)

- Relay worker
  - CORS allowlist enforcement; defaults deny in prod mode
  - Rate limiting behavior (if added)
