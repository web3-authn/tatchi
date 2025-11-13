---
title: Overview
---

# Overview

Tatchi is an embedded, serverless wallet SDK built on top of Passkeys. Wallet keys are deterministically derived from passkeys, and users use biometric signing to sign transaction in an isolated, cross‑origin wallet iframe.

## Why Tatchi?

### Serverless and trustless by design.
  - No auth/wallet backend to maintain for developers. WebAuthn and signing run in a hardened cross‑origin iframe which talks directly to the NEAR blockchain where the WebAuthn contract lives. No intermediaries or custodians  No MPC wallet‑as‑a‑service (e.g., Coinbase, Privy).

### Self‑custody via passkeys
  - Keys are derived from WebAuthn registrations. Users never need to handle private keys or mnemonics. If you hold the passkey, you have the wallet.

### Permissionless recovery and portability
  - Authenticator state is on‑chain. Users can re‑derive keys from on‑chain authenticators, enabling permissionless recovery with high availability.
  - Multi‑device sync that "just works": passkeys sync via iCloud/Google so wallets can also be synced across devices for users. Prefer no cloud? Link devices via QR codes for a simple and familiar UX (NEAR accounts let you add or revoke multiple keys).


### Wallet isolation by default
  - Sensitive flows (WebAuthn/PRF/VRF, key handling, signing) run inside a cross‑origin iframe with strict headers and isolated WASM workers. Even if the developer's app is compromised, Tatchi passkey wallet remains safe.

### Developer first
  - 100% open source. Self‑host and deploy your own WebAuthn contracts, or get started quickly by pointing to the hosted wallet SDK at https://wallet.tatchi.xyz (use the same account to log into multiple apps).
  - App‑controlled UX. Your app owns wallet surfaces and can set transaction confirmation policies (require click vs auto‑proceed), themes, ui modes.


## Next: Quickstart Installation

- Register a passkey wallet onchain
- Log in with a single biometric gesture
- Send transactions and configure transaction confirmation UI

Next: [Quickstart](./quickstart)
