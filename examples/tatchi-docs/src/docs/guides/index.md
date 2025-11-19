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

## Advanced Features

Enhance your integration with these features:

- **[Device Linking](./device-linking)** - Add new devices to existing accounts via QR codes. No seed phrases or manual secret sharing required.

- **[Authentication Sessions](./authentication-sessions)** - Enable VRF-backed sessions to reduce biometric prompts. One TouchID at login, then session-based auth for API calls.

- **[Offline Key Export](./offline-key-export)** - Export private keys while completely offline using a cached PWA. Works in airplane mode with zero network requests.

## Deployment

Deploy your application and optional backend services:

- **[Relay Server Deployment](./relay-server-deployment)** - Deploy the relay server for atomic account creation and Shamir 3-pass smooth login. Includes both Node.js/Express and Cloudflare Workers implementations.

- **[Self-Hosting the Wallet SDK](./self-hosting-the-wallet-sdk)** - Host the wallet iframe on your own infrastructure. Complete guide to serving SDK assets and configuring headers.

- **[Cloudflare GitHub Actions Setup](./cloudflare-github-actions)** - Automate Cloudflare Workers deployment with GitHub Actions CI/CD.


