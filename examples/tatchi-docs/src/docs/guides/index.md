---
title: Detailed Guides
---

# Detailed Guides

Practical, step-by-step guides for integrating and deploying the Web3Authn SDK. Each guide focuses on a specific task or component.

## Core Integration

Start here if you're building a new application:

- **[Install and Wallet Setup](./wallet-iframe-integration)** - Install the SDK, configure the wallet iframe origin, and wire up `PasskeyProvider` for your app.

- **[Registration & Login Progress Events](./progress-events)** - Handle `onEvent` callbacks for registration, login, and transaction flows to drive custom progress UI.

- **[Sending Transactions](./sending-transaction)** - Execute and broadcast transactions with confirmation UI, hooks, and configuration options.

- **[Chain Signatures](./chain-signatures)** - Sign and relay transactions on external chains using NEAR MPC.

## Advanced Features

Enhance your integration with these features:

- **[Device Linking](./device-linking)** - Add new devices to existing accounts via QR codes. No seed phrases or manual secret sharing required.

- **[Authentication Sessions](./authentication-sessions)** - Reduce repeated signing prompts with short-lived warm signing sessions in the VRF worker. One TouchID at login, then session-based auth for API calls.

- **[Email Recovery (Passkey + Email)](./email-recovery-flow)** - Recover an account by sending a verified recovery email and registering a new passkey-derived device key.

- **[Offline Key Export](./offline-key-export)** - Export private keys while completely offline using a cached PWA. Works in airplane mode with zero network requests.

## Deployment

Deploy your application and optional backend services:

- **[Relay Server Deployment](./relay-server-deployment)** - Deploy the relay server for atomic account creation and Shamir 3-pass smooth login. Includes both Node.js/Express and Cloudflare Workers implementations.

- **[Relayer Encrypted Email Recovery](./email-recovery-flow#encrypted-tee-recovery)** - Submit DKIM/TEE-based email recovery without putting plaintext email on-chain.

- **[Relayer zk-Email Integration](./email-recovery-flow#zk-email-recovery)** - Configure a zk-email prover and route `/recover-email` to zk-email mode (optional).

- **[Self-Hosting the Wallet SDK](./self-hosting-the-wallet-sdk)** - Host the wallet iframe on your own infrastructure. Complete guide to serving SDK assets and configuring headers.

- **[Cloudflare GitHub Actions Setup](./cloudflare-github-actions)** - Automate Cloudflare Workers deployment with GitHub Actions CI/CD.
