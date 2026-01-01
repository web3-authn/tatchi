---
title: WebAuthn Manager
---

# WebAuthn Manager

Coordinates browser WebAuthn operations, fallbacks, and UX flows.

Most applications should use `TatchiPasskey` (or the React hook `useTatchi`) instead of calling `WebAuthnManager` directly.

If you do need the low-level manager (advanced integrations/testing), it is exported from `@tatchi-xyz/sdk` as `WebAuthnManager` and is responsible for:

- WebAuthn `create()` / `get()` orchestration (including PRF extension usage)
- VRF worker lifecycle (unlocking VRF keys, minting warm signing sessions)
- Signer worker lifecycle (one-shot signing workers)
