---
title: Concepts
---

# Concepts

Web3Authn architecture, design goals, and security model are outlined here.

- [Design Goals](#design-goals)
- [Architecture](./architecture)
- [Security Model](./security-model)
- [Passkey Scope](./passkey-scope)
- [VRF WebAuthn](./vrf-webauthn)
- [VRF Sessions](./vrf-sessions)
- [Threshold Signing](./threshold-signing)
- [Nonce Manager](./nonce-manager)

## Design Goals

### Minimal Reliance on Servers or Intermediaries

The Passkey authenticates with the onchain [Web3Authn contract](/docs/api/web3authn-contract), instead of requiring developers to host servers. If the app's server goes down, you still have access to the wallet.

- **Trustless account recovery**: since wallet keys are deterministically derived from passkeys, and passkey authenticators are stored on chain, you can recover your account with just your passkey.

- **No single point of failure**: Wallet SDK origins whitelisted and governed by the onchain web3authn contract. Multiple redundant origins can serve the SDK. If one origin goes down, users can switch to another (see [related origin requests](https://passkeys.dev/docs/advanced/related-origins/)) without losing access.


### Simple Self-Custody and Account Recovery

Wallet keys are derived from passkeys using WebAuthn outputs, so there are no seed phrases to manage.

- **Onchain authenticator persistence**: WebAuthn authenticators and VRF public keys stored immutably onchain by the [Web3Authn contract](/docs/api/web3authn-contract). This lets you recover your wallet from any device with your passkey via Passkey sync (e.g iCloud, Google Password Manager, Bitwarden, 1Password).

- **Multi-device linking**: if you dislike potential lockin with Apple/Google managing passkeys, you can link different passkeys from different devices to the same account. The passkeys are now disposable, and you can have multiple passkeys stored on different systems (iCloud, Yubikey, etc) all controlling the same wallet account.

- **Offline key export**: Export encrypted keys via Service Worker. Access your wallet offline without network connectivity.


### Clean, Embedded UX

Applications onboarding non-crypto users should not require users to download two separate applications (the app itself, plus a wallet). Tatchi solves this by embedding the wallet directly in your application.

- **No popups**: All interactions happen inline with your application UI. No browser popup windows or redirects. Users never leave your app or download separate wallet software.

### Cross-App Passkey Wallet

Passkey wallets work across integrated apps, without needing to download separate wallet extensions or applications, and without needing to create new accounts for each app.

- **Wallet-scoped credentials**: One passkey works across all integrated apps. Users get single sign-on across your ecosystem. Users authenticate once with their passkey, and it controls their wallet across all apps that share the wallet origin.

- **App-scoped option**: Apps can also use domain-specific credentials for maximum isolation. Choose the scoping strategy that fits your deployment.


## Next: Architecture

For detailed technical documentation on security architecture, cryptographic primitives, and smart contract integration, see the [Architecture](./architecture) section.
