---
title: Wallet Iframe Architecture
---

# Wallet Iframe Architecture

The SDK mounts a hidden “service iframe” on a dedicated wallet origin. Sensitive operations (WebAuthn, PRF handling, signer/VRF workers, IndexedDB) happen inside that origin; the parent app only exchanges typed messages.

## Why

- Isolation: parent cannot access wallet memory/DB; private keys and PRF outputs never leave the wallet origin
- UX: visible wallet UI opens only for user‑presence confirmation, then hides automatically
- Portability: one wallet origin can serve multiple apps

## Flow (high‑level)

1) Parent mounts service iframe (hidden) and performs a CONNECT→READY handshake using a MessageChannel
2) Calls are forwarded via MessageChannel to the wallet
3) When a confirm click is needed, the wallet shows its own modal to capture the gesture
4) Signers (WASM workers) run in the wallet; signed results are returned to the parent

## Hosting

- Serve SDK assets under `/sdk` and a service page at `/wallet-service` (or your path)
- Add `Permissions-Policy` to allow WebAuthn in the iframe; set iframe `allow` attributes (`publickey-credentials-get/create`)
- Optionally serve `/.well-known/webauthn` with allowed top‑level origins for Related Origin Requests

See full discussion in [Wallet iframe architecture plan (SDK docs)](https://github.com/web3-authn/sdk/blob/main/sdk/docs/wallet-iframe-architecture.md)
