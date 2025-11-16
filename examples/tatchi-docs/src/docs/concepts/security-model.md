---
title: Security Model
---

# Security Model

A high‑level view of isolation properties and defensive layers.

- Origin isolation
  - The wallet runs at its own origin inside an iframe; the parent app cannot access the wallet’s memory or IndexedDB.
- Workers for secrets
  - Signer and VRF logic run in WASM workers; private keys remain in worker memory and are encrypted at rest with PRF‑derived material.
- Content Security Policy (CSP)
  - Wallet pages avoid inline styles/scripts and load only external assets; Lit components adopt external stylesheets. See [CSP for Lit Components](/docs/concepts/csp-lit-components).
- Permissions Policy
  - WebAuthn is delegated explicitly to the wallet iframe (`publickey-credentials-get/create`); the iframe includes matching `allow` attributes.
- User‑presence guarantees
  - The wallet expands a modal only during critical confirmation steps to capture the gesture in the correct context. See [Confirmation UX](/docs/concepts/wallet-iframe-architecture#confirmation-ux).
- Credential scope
  - `rpId` choice governs which passkeys are visible/usable. See [Credential Scope (rpId)](/docs/concepts/wallet-scoped-credentials).

Deep dives (repo):
- Security checklist (A–G): https://github.com/web3-authn/sdk/tree/main/docs/security-checklist
- Wallet iframe architecture plan: https://github.com/web3-authn/sdk/blob/main/sdk/docs/wallet-iframe-architecture.md

Read next: [Credential Scope (rpId Strategy)](/docs/concepts/wallet-scoped-credentials)
