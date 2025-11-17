---
title: Concepts
---

# Concepts

Web3Authn architecture, security model, and cryptographic foundations are outlined here.

## Contents

- [Design Goals](#design-goals)
- [Architecture](#architecture)
- [Deep Dive Topics](#deep-dive-topics)

## Design Goals

### 1. No Reliance on Servers or Intermediaries

**Deterministic recovery**: All wallet data derived from passkeys and encrypted at rest client-side. Recover your account with just your passkey—no app server or relay needed.

**Onchain verification**: WebAuthn authentication verified by smart contracts, not app servers. Contracts check VRF proofs and WebAuthn responses directly onchain.

**Decentralized SDK origins**: Wallet SDK origins whitelisted and governed by the onchain web3authn contract. Multiple redundant origins can serve the SDK. If one origin goes down, users can switch to another without losing access.

**No single point of failure**: App operators, relay servers, and SDK origins are all optional or replaceable. The protocol continues working as long as the blockchain and at least one SDK origin are available.

### 2. Simple Self-Custody and Recovery

**Deterministic key derivation**: All wallet keys derived from passkeys using WebAuthn PRF. No seed phrases to manage.

**Onchain authenticator persistence**: WebAuthn authenticators and VRF public keys stored immutably onchain. Recover your wallet from any device with your passkey—no app server required.

**Offline key export**: Export encrypted keys to local storage via Service Worker. Access your wallet offline without network connectivity.

**Multi-device linking**: Link additional devices (Yubikeys, hardware wallets, phones) as backup authenticators. Easy to reason about: each device gets its own passkey, all control the same wallet.

### 3. Cross-App Passkey Wallet

**Wallet-scoped credentials**: One passkey works across all integrated apps. Users get single sign-on across your ecosystem.

**Multi-device support**: Different passkeys (from different devices) can access the same wallet. Link your phone, laptop, and Yubikey to one account.

**App-scoped option**: Apps can also use domain-specific credentials for maximum isolation. Choose the scoping strategy that fits your deployment.

### 4. Clean, Embedded UX

**Wallet-controlled confirmations**: All security-critical UI runs inside the wallet iframe, not application code. Transaction data hashed and integrity-checked within WASM workers before signing.

**Configurable flows**: Customize transaction confirmation screens while maintaining security guarantees. Users see your branding, but actual approvals happen in wallet-controlled UI that can't be manipulated.

**No popups**: All interactions happen inline with your application UI. No browser popup windows or redirects.

### 5. Security: Isolate Secrets from Application Code

All sensitive operations run on a separate **wallet origin** in a cross-origin iframe. Cryptographic operations execute in dedicated **Web Workers** with isolated memory. Private keys encrypted in IndexedDB, only decrypted inside WASM worker memory.

If your app is compromised, attackers cannot extract private keys—only request operations through the same TouchID-gated API.

## Architecture

The wallet runs in an isolated security context, separate from your application code. Think of it as a mini web app in an iframe that your app "dials into" for secure operations.

### Iframe Isolation Model

```
┌─────────────────────────────────────────┐
│ Your App (app.example.com)             │
│  ┌───────────────────────────────────┐ │
│  │ Wallet Iframe                     │ │
│  │ (wallet.example.com)              │ │
│  │  ┌─────────────┐  ┌────────────┐ │ │
│  │  │ Web Worker  │  │ WebAuthn   │ │ │
│  │  │ (WASM       │  │ PRF        │ │ │
│  │  │ Crypto)     │  │ VRF        │ │ │
│  │  └─────────────┘  └────────────┘ │ │
│  └───────────────────────────────────┘ │
│           ↕ MessageChannel              │
└─────────────────────────────────────────┘
```

### Communication Flow

1. **Mount**: SDK creates hidden iframe pointing at wallet origin (e.g., `/wallet-service`)
2. **Handshake**: App and wallet exchange CONNECT → READY via `postMessage` and `MessageChannel`
3. **Request**: App calls methods like `registerPasskey()` or `signTransactionsWithActions()`
4. **Execute**: Wallet routes requests to workers, runs WebAuthn/VRF/NEAR operations
5. **Respond**: Wallet returns signed transactions or registration status

Your app never touches the wallet's DOM, storage, or variables—only typed RPC messages.

### Why Use an Iframe?

**Security**: Browser same-origin policy prevents your app from reading wallet's DOM, JS variables, or IndexedDB. Even if your app is compromised, secrets remain isolated.

**Portability**: One wallet origin serves many apps. They only need to agree on the iframe location.

**Consistency**: All apps see the same wallet UX and security behavior, simplifying audits and improvements.

### Isolated Signing

Sensitive operations happen entirely inside the wallet iframe:

**What's isolated**:
- WebAuthn ceremonies (registration and authentication)
- Key material derivation and decryption (PRF, VRF keypairs, NEAR keys)
- NEAR transaction and message signing

**How it works**:
```typescript
// Your app
await tatchi.signTransactionsWithActions('user.testnet', actions)

// Inside wallet iframe → Web Worker
// 1. Decrypt keys in worker memory
// 2. Sign transactions
// 3. Return signed transactions (not keys)
```

Your app never sees decrypted private keys or PRF/VRF secrets.

**Threat model**: Supply-chain or XSS bugs in your app cannot read wallet memory or IndexedDB. Biometric prompts are scoped to wallet origin. Inputs are validated before use.

### Confirmation UX

Users see sensitive prompts in wallet-controlled UI, preventing phishing:

**Flow**:
1. User triggers action in your app
2. Wallet opens modal inside iframe
3. User confirms in wallet UI (not app code)
4. Wallet completes operation

Your app can render progress and status using events, but actual confirmation happens in the wallet's hardened surface.

### Hosting Requirements

To host the wallet iframe:

- Serve SDK assets under stable path (e.g., `/sdk`)
- Configure security headers on wallet origin:
  - Strong CSP (no inline scripts/styles)
  - COOP/COEP/CORP for context isolation
  - Permissions-Policy allowing WebAuthn for wallet origin
- Optionally expose `/.well-known/webauthn` for Related Origin Requests (Safari)

Build plugins (Vite, Next.js) handle setup in dev and emit correct headers for production.

## Deep Dive Topics

**[Security Model](security-model)** - Defense-in-depth approach: origin isolation, worker-based secrets, CSP, Permissions-Policy, and how layers work together.

**[Credential Scope Strategy](wallet-scoped-credentials)** - WebAuthn credential scoping, rpId strategies, Related Origin Requests, and choosing your deployment model.

**[VRF Challenges](vrf-challenges)** - Cryptographic primitives: WebAuthn PRF, NEAR VRF, and VRF-backed challenge construction.

**[Shamir 3-Pass Protocol](shamir-3pass)** - Optional protocol for smoother login UX without repeated biometric prompts, with automatic key rotation and fallback mechanisms.
