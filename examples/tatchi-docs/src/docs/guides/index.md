---
title: Guides
---

# Guides

Practical, step-by-step guides for integrating and deploying the Web3Authn SDK. Each guide focuses on a specific task or component.

## Core Integration

Start here if you're building a new application:

- **[Passkeys (WebAuthn)](./passkeys)** - Register and authenticate users with TouchID/FaceID. Learn about the registration flow, login options, and Shamir 3-pass for smooth re-login.

- **[Wallet Iframe Integration](./wallet-iframe)** - Set up the isolated wallet iframe for maximum security. Configure cross-origin iframe communication and understand the security architecture.

- **[Transaction Confirmation](./tx-confirmation)** - Present transaction details to users for approval before signing. Includes both programmatic and SDK-provided confirmation UI patterns.

## Advanced Features

Enhance your integration with these features:

- **[Device Linking](./device-linking)** - Add new devices to existing accounts via QR codes. No seed phrases or manual secret sharing required.

- **[Authentication Sessions](./authentication-sessions)** - Enable VRF-backed sessions to reduce biometric prompts. One TouchID at login, then session-based auth for API calls.

- **[Offline Key Export](./offline-export)** - Export private keys while completely offline using a cached PWA. Works in airplane mode with zero network requests.

## Deployment

Deploy your application and optional backend services:

- **[Relay Server Deployment](./relay-server-deployment)** - Deploy the relay server for atomic account creation and Shamir 3-pass smooth login. Includes both Node.js/Express and Cloudflare Workers implementations.

- **[Self-Hosting the Wallet SDK](./selfhosting)** - Host the wallet iframe on your own infrastructure. Complete guide to serving SDK assets and configuring headers.

- **[Cloudflare GitHub Actions Setup](./cloudflare-github-actions-setup)** - Automate Cloudflare Workers deployment with GitHub Actions CI/CD.

## Troubleshooting

If you encounter issues, see the [SDK Troubleshooting Documentation](../../../sdk/docs/troubleshooting/) for common problems and solutions related to WASM imports, asset URL resolution, and more.
