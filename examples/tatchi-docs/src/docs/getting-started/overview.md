---
title: Overview
---

# Overview

Tatchi is an embedded, serverless wallet SDK built on top of Passkeys and the [NEAR blockchain](https://github.com/near).

- Wallet keys are deterministically derived from passkeys, and users use biometrics to sign transactions in an isolated, cross‑origin wallet iframe.
- Passkey (WebAuthn) authentications are performed directly with an onchain smart contract without backend servers.

You can get started here with the [installation instructions](./installation).

::: code-group
```bash [pnpm]
pnpm add @tatchi-xyz/sdk
```

```bash [npm]
npm i @tatchi-xyz/sdk
```

```bash [yarn]
yarn add @tatchi-xyz/sdk
```
:::


## Why Tatchi?

### Serverless and Trustless by Design
  - No auth/wallet backend to maintain for developers. WebAuthn and signing run in a hardened cross‑origin iframe that connects directly to the WebAuthn contract on the NEAR blockchain. Neutral and designed for high availability. No centralized wallet-as-service intermediaries or custodians like Coinbase or Privy.


### Self‑custody via Passkeys
  - Keys are derived from WebAuthn registrations. Users never need to handle private keys or mnemonics. The holder of the passkey is the custodian of the wallet.
  - Keys never leave the device; auth derives signing keys client‑side via PRF. No custodial servers required.


### Permissionless Recovery and Portability
  - Passkey authenticators are stored on‑chain. Users can re‑derive keys from on‑chain authenticators, enabling permissionless recovery with high availability.
  - Multi‑device sync: passkey wallets can be synced across devices via iCloud, Google Password Manager, or password managers like Bitwarden.
  - Prefer no cloud? Paranoid about Passkey lock-in? Link devices with different passkeys to the same wallet account via QR codes (NEAR accounts can add or revoke multiple keys). Multi-device backups help address current [issues with Passkey portability](https://fidoalliance.org/specifications-credential-exchange-specifications/).


### Wallet Isolation by Default
  - Sensitive flows (WebAuthn/PRF/VRF, key handling, signing) run inside a cross‑origin iframe with strict headers and isolated WASM workers. Even if the developer's app is compromised, Tatchi passkey wallet remains safe.


### Developer First
  - 100% open source. Self‑host and deploy your own WebAuthn contracts, or get started quickly by pointing to the hosted wallet SDK at https://wallet.web3authn.org (use the same account to log into multiple apps).
  - App‑controlled UX. Your app owns the wallet UX and can set transaction confirmation UX policies (require click vs auto‑proceed), themes (dark vs light), ui modes (modal vs drawer).


### Minimal Centralization:
  - Wallet origin is swappable, and Related Origin Requests (ROR) allowlists are on‑chain and DAO‑governable for fast failover without app redeploys.
  - One passkey can work across many apps without an identity silo per app.


## Next: Installation

- Register a passkey wallet onchain
- Log in with a single biometric gesture
- Send transactions and configure transaction confirmation UI

Next: [Installation](./installation)
