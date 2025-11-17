---
title: Overview
---

# Overview

Tatchi is an embedded, serverless wallet SDK built on top of Passkeys and the [NEAR blockchain](https://github.com/near). Wallet keys are deterministically derived from passkeys, and users use biometrics to sign transaction in an isolated, cross‑origin wallet iframe.

Passkey (webauthn) authentications are performed directly with an onchain smart contract without the need for backend servers.

## Why Tatchi?

### Serverless and trustless by design.
  - No auth/wallet backend to maintain for developers. WebAuthn and signing run in a hardened cross‑origin iframe which talks directly to the NEAR blockchain where the WebAuthn contract lives. No intermediaries or custodians  No MPC wallet‑as‑a‑service (e.g., Coinbase, Privy).

### Self‑custody via passkeys
  - Keys are derived from WebAuthn registrations. Users never need to handle private keys or mnemonics. If you hold the passkey, you have the wallet.
  - Keys never leave the device; auth derives signing keys client‑side via PRF. No custodial servers required.

### Permissionless recovery and portability
  - Passkey authenticators are stored on‑chain. Users can re‑derive keys from on‑chain authenticators, enabling permissionless recovery with high availability.
  - Multi‑device sync: passkeys wallets can be synced across devices via iCloud, Google Password Manager, or password managers like Bitwarden.
  - Prefer no cloud? Paranoid about Passkey lock-in? Link devices with different passkeys to the same wallet account via QR codes (NEAR accounts can add or revoke multiple keys). Multi-device backups help address current [issues with Passkey portability](https://fidoalliance.org/specifications-credential-exchange-specifications/).

### Wallet isolation by default
  - Sensitive flows (WebAuthn/PRF/VRF, key handling, signing) run inside a cross‑origin iframe with strict headers and isolated WASM workers. Even if the developer's app is compromised, Tatchi passkey wallet remains safe.

### Developer first
  - 100% open source. Self‑host and deploy your own WebAuthn contracts, or get started quickly by pointing to the hosted wallet SDK at https://wallet.tatchi.xyz (use the same account to log into multiple apps).
  - App‑controlled UX. Your app owns the wallet UX and can set transaction confirmation UX policies (require click vs auto‑proceed), themes (dark vs light), ui modes (modal vs drawer).

### Minimal centralization:
  - Wallet origin is swappable, and ROR allowlists are on‑chain and DAO‑governable for fast failover without app redeploys.
  - One passkey can work across many apps without an identity silo per app.


## Next: Installation

- Register a passkey wallet onchain
- Log in with a single biometric gesture
- Send transactions and configure transaction confirmation UI

Next: [Installation](./installation)
