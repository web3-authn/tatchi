# Web3Authn SDK

A secure, user-friendly passkey wallet for NEAR blockchain applications. Built on WebAuthn with no popups, no seed phrases, and recovery through TouchID/FaceID across all your devices.

## What Is This?

Web3Authn is an embedded wallet SDK that makes blockchain applications feel like native apps. Users sign in with their fingerprint or face, and their keys are automatically synced across devices through iCloud and Google Password Manager.

**For users**: No more seed phrases to write down, no browser extensions to install. Just TouchID/FaceID.

**For developers**: A simple SDK that handles all the complex cryptography, key management, and blockchain interactions. Focus on building your app, not wrestling with wallets.

## Key Features

### No Popups
Traditional browser wallets interrupt your UX with popups and extension prompts. Web3Authn embeds directly into your application with confirmation modals that match your design.

### One-Click Setup
Users create a wallet with a single biometric prompt—no seed phrases, no downloads, no separate apps.

### Cross-Device Recovery
Passkeys sync automatically through iCloud (Safari) and Google Password Manager (Chrome). Users who log in on a new device automatically have access to their wallet.

### Serverless Architecture
Uses VRF-backed challenges verified on-chain, eliminating the need for centralized authentication servers. No single point of failure.

### Full Control
You control the UX, the branding, and the flow. The SDK provides building blocks—you decide how they fit together.

## How It Works

### For Web2 Developers

Think of Web3Authn like authentication-as-a-service, but for blockchain:

1. User clicks "Sign in with passkey"
2. Browser shows TouchID/FaceID prompt
3. SDK creates a wallet and stores encrypted keys locally
4. User can now sign blockchain transactions with their biometric

Behind the scenes, the SDK uses WebAuthn (the same standard as 1Password and GitHub) to derive blockchain signing keys. Keys are encrypted at rest and only decrypted in isolated Web Workers.

### For Web3 Developers

Web3Authn is an embedded wallet with strong security guarantees:

- **Origin isolation**: Keys run in a cross-origin iframe, protected even if your app is compromised
- **Worker-based crypto**: Private keys never touch the main JavaScript thread
- **VRF challenges**: On-chain verification without centralized auth servers
- **Shamir 3-pass**: Optional session-like UX without sacrificing security

See [Architecture Documentation](./examples/tatchi-docs/src/docs/concepts/) for details.

## Quick Start

### Prerequisites

Install build tools (only needed for SDK development, not for using the published package):

```bash
# Install pnpm
npm install -g pnpm

# Install Rust and wasm-pack (for WASM modules)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
cargo install wasm-pack

# Install mkcert (for local HTTPS development)
brew install mkcert  # macOS
# or your OS equivalent
```

Verify installations:
```bash
node --version
pnpm --version
rustc --version
wasm-pack --version
mkcert -version
```

### Development Setup

Clone and build the SDK:

```bash
# Install dependencies and build everything
pnpm run install-all
```

This command:
- Installs all workspace dependencies
- Compiles Rust WASM modules (signer and VRF workers)
- Builds the TypeScript SDK
- Links packages for local development

### Run Examples

**Vite Example** (React + TypeScript):
```bash
pnpm run dev
```

Open `https://localhost:5173` to see the wallet in action.

**Relay Server** (for account creation and Shamir 3-pass):
```bash
pnpm run server
```

The relay runs on `http://localhost:3000` and provides:
- Atomic NEAR account creation + passkey registration
- Shamir 3-pass for smooth login (no TouchID prompt on repeat logins)
- Automatic key rotation

## Project Structure

```
web3-authn-sdk/
├── sdk/                          # Core SDK package
│   ├── src/
│   │   ├── core/                 # Framework-agnostic wallet logic
│   │   ├── react/                # React components and hooks
│   │   ├── wasm_signer_worker/   # Rust WASM for signing
│   │   └── wasm_vrf_worker/      # Rust WASM for VRF
│   └── README.md                 # SDK documentation
│
├── examples/
│   ├── vite/                     # React example app
│   ├── relay-server/             # Node.js relay server
│   ├── relay-cloudflare-worker/  # Cloudflare Workers relay
│   └── tatchi-docs/              # Documentation site
│
└── README.md                     # This file
```

## Available Commands

**Development**:
- `pnpm run install-all` - Install all deps and build everything
- `pnpm run dev` - Start example app (Vite + React)
- `pnpm run server` - Start relay server

**Building**:
- `pnpm run build:sdk` - Build SDK and link to examples
- `pnpm -C sdk build` - Build SDK only
- `pnpm -C sdk dev` - SDK watch mode

**Testing**:
- `pnpm -C sdk test` - Run Playwright tests
- `pnpm -C sdk run type-check` - TypeScript type checking

## Security Model

Web3Authn uses defense-in-depth to protect user keys:

### Origin Isolation
The wallet runs in a separate security origin (e.g., `wallet.example.com`) from your application. Even if your app is compromised by XSS or malicious dependencies, attackers cannot access keys.

### Worker-Based Cryptography
Private keys are decrypted only in Web Workers (isolated JavaScript contexts). They never exist in the main thread where UI code and third-party libraries run.

### WebAuthn + VRF
Combines WebAuthn's phishing-resistant authentication with VRF-backed challenges tied to fresh blockchain data. Smart contracts verify everything on-chain—no centralized auth servers needed.

### Content Security Policy
Strict CSP prevents inline script execution and limits where code can load from, making XSS attacks significantly harder.

Read more: [Security Model Documentation](./examples/tatchi-docs/src/docs/concepts/security-model.md)

## Documentation

Comprehensive documentation is available in `examples/tatchi-docs/src/docs/`:

**Concepts** (architecture and design):
- [Goals of the Wallet](./examples/tatchi-docs/src/docs/concepts/goals.md) - Why Web3Authn is designed this way
- [Wallet Iframe Architecture](./sdk/docs/wallet-iframe-architecture.md) - How origin isolation works
- [Security Model](./examples/tatchi-docs/src/docs/concepts/security-model.md) - Defense-in-depth explained
- [VRF Challenges](./examples/tatchi-docs/src/docs/concepts/vrf-challenges.md) - Serverless authentication
- [Credential Scope Strategy](./examples/tatchi-docs/src/docs/concepts/wallet-scoped-credentials.md) - rpId configuration
- [Nonce Manager](./examples/tatchi-docs/src/docs/concepts/nonce-manager.md) - Blockchain transaction ordering

**Guides** (how-to and integration):
- [Wallet Iframe Integration](./examples/tatchi-docs/src/docs/guides/wallet-iframe.md) - Setup and configuration
- [Relay Server Deployment](./examples/tatchi-docs/src/docs/guides/relay-server-deployment.md) - Node.js and Cloudflare Workers
- [Self-Hosting](./examples/tatchi-docs/src/docs/guides/selfhosting.md) - Deploy your own infrastructure
- [Device Linking](./examples/tatchi-docs/src/docs/guides/device-linking.md) - Cross-device passkey sync

## Use Cases

### DeFi Applications
Users can trade, stake, and provide liquidity without managing seed phrases. Signatures happen with TouchID/FaceID.

### NFT Marketplaces
One-click wallet creation reduces friction in onboarding. No extensions needed—works in any browser.

### Gaming
Players sign in with their fingerprint and start playing immediately. Keys sync across devices automatically.

### DAO Voting
Voting transactions are signed with biometrics. No seed phrase management for governance participants.

## Browser Support

**Full Support**:
- Chrome 108+ (Desktop and Android)
- Safari 16+ (macOS and iOS)
- Edge 108+

**With Fallbacks**:
- Firefox 119+ (limited ROR support for wallet-scoped credentials)

**Requirements**:
- HTTPS (required for WebAuthn)
- Authenticator (TouchID, FaceID, Windows Hello, or hardware key)

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

### Development Workflow

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes
4. Run tests: `pnpm -C sdk test`
5. Run type checking: `pnpm -C sdk run type-check`
6. Commit with clear messages
7. Push and create a pull request

### Areas We're Looking For Help

- Additional framework integrations (Vue, Svelte, Angular)
- More blockchain integrations beyond NEAR
- Documentation improvements
- Example applications
- Testing on different devices and browsers

## License

[MIT License](./LICENSE) - See LICENSE file for details.

## Support

- **Documentation**: [./examples/tatchi-docs/](./examples/tatchi-docs/)
- **Issues**: [GitHub Issues](https://github.com/your-org/web3-authn-sdk/issues)
- **Discussions**: [GitHub Discussions](https://github.com/your-org/web3-authn-sdk/discussions)

## Acknowledgments

Built on open standards:
- [WebAuthn](https://w3c.github.io/webauthn/) - W3C Web Authentication API
- [NEAR Protocol](https://near.org/) - Blockchain platform
- WebAssembly and Web Workers - Browser security primitives
