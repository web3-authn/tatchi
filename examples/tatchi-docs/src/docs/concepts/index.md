---
title: Concepts
---

# Concepts

A narrative tour of how the wallet works and why.

- Start here: [Goals of the Wallet](./goals)
- Architecture: [Wallet Iframe Architecture](./wallet-iframe-architecture)
- Security model: [Security Model](./security-model)
- Credential scope: [Credential Scope (rpId)](./wallet-scoped-credentials)
- Crypto: [VRF & PRF](./vrf-and-prf), [Shamir 3‑pass](./shamir3pass) → [Server key rotation](./shamir3pass-rotate-keys)
- Transaction plumbing: [Nonce manager](./nonce-manager), [Confirmation UX](./confirmation-ux)
- UI hardening: [CSP for Lit Components](./csp-lit-components)

## Strengths

Delivers stateless, phishing‑resistant authentication anchored on WebAuthn and chain freshness, with a practical auto‑unlock path via Shamir 3‑pass.

Strengths

- Strong binding: WebAuthn rpId + user presence combined with VRF proof tied to fresh block height/hash.
- Stateless freshness: contracts verify VRF input recency as a view; no server nonce DB needed.
- Secret hygiene: VRF and NEAR keys never leave the client; relay never sees KEK/VRF plaintext.
- UX: auto‑unlock via Shamir (no TouchID prompt) with graceful TouchID fallback; proactive shard rotation.
- Cross‑origin safety: challenge and rpId pinning reduce phishing; wallet iframe isolation is consistent with your CSP goals.
- Operational simplicity: one view to mint a session; avoids signature nonce stores and minimizes server state.
