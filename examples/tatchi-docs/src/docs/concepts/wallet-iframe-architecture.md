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

## Isolated Signing

Sensitive operations (WebAuthn, PRF/VRF, key handling, signing) run inside the wallet iframe. The parent app never sees credentials or keys; only typed requests and signed results cross the boundary via MessageChannel.

- Cross‑origin wallet iframe with strict `sandbox` and `allow` attributes
- RPC surface: `REQUEST_registerPasskey`, `REQUEST_signTransactionsWithActions`, `REQUEST_signNep413Message`, …
- WASM workers inside the iframe isolate VRF and signing memory
- Strict headers (COOP/COEP/CORP, Permissions‑Policy, CSP) on the wallet origin

Threat model highlights
- Supply‑chain or XSS in parent cannot read iframe memory/IndexedDB
- Biometric prompts are scoped to the iframe origin
- Inputs are sanitized; only final signed artifacts are returned

Security guarantees
- WebAuthn credentials, PRF outputs, decrypted private keys stay in the iframe
- Only signed transactions/messages and minimal metadata leave the iframe

## Confirmation UX

How the wallet ensures user‑presence and integrity during transaction approval.

- Modal inside wallet origin
  - The confirmation UI renders inside the wallet iframe to capture the gesture in the correct origin.
- Progress heuristics
  - During `STEP_2_USER_CONFIRMATION`, keep the overlay visible so the modal can receive the click.
- API‑driven and embedded flows
  - Use `executeAction` for automatic confirmation, or a React component (
    `SendTxButtonWithTooltip`) for embedded UI.
- After confirmation
  - Signing happens in the signer worker; the parent receives signed results via the message channel.

See also: Guide — [Secure Transaction Confirmation](/docs/guides/tx-confirmation)

Read next: [Security Model](/docs/concepts/security-model)
